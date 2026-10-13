import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { createInitialState, reducer, type DemoState } from "../src/model";
import { DemoProvider } from "../src/store";
import { quoteOrder } from "../src/orderingRules";
import {
  appointmentFingerprint,
  createBatchOrderPlan,
  pricingCatalogSignature,
  reduceBatchOrderingAction,
} from "../src/batchOrderingRules";
import {
  actualOrderCollections,
  previewGroupAccountSettlement,
  previewGroupAccountReversal,
  previewOrderPayment,
  reduceOrderFinanceAction,
} from "../src/orderFinanceRules";
import { buildSettlementRows } from "../src/modules/SettlementDetails";
import { GroupContractWorkbench } from "../src/modules/Groups";
import Patient from "../src/modules/Patient";
const KEY = "hongchuang.health.demo.v1";
const seed = () => {
  const s = createInitialState();
  s.config.role = "admin";
  s.config.bookingClock = "2026-10-13T07:00:00Z";
  s.appointments = [
    {
      ...s.appointments[0],
      status: "booked",
      locked: false,
      date: "2026-10-15",
      time: "08:00",
      packageId: "PK01",
      amount: 399,
      items: s.packages[0].items,
      pricing: quoteOrder(s, ["PK01"], 100).rows,
      results: {},
      reviewStage: 0,
      groupOrderId: "G1",
      groupSplit: { unit: 300, personal: 99 },
      selfPay: 99,
    },
  ];
  s.records.groupOrders = [
    {
      id: "G1",
      name: "合成团检",
      company: s.patients[0].company,
      status: "生效",
      packages: ["PK01"],
      members: [s.patients[0].id],
      budget: 300,
      mode: "限额自选",
      startDate: "2026-10-13",
      endDate: "2026-12-31",
      optionalItems: [],
      choose: 0,
    },
  ];
  s.records.groupAccounts = [
    {
      id: "GA-G1",
      balance: 1000,
      settledIds: [],
      ledger: [
        {
          id: "DEP-1",
          type: "预付款入账",
          amount: 1000,
          at: "2026-10-13T07:00:00Z",
        },
      ],
    },
  ];
  return s;
};
const pay = (s: DemoState) =>
  reducer(s, {
    type: "PAYMENT",
    payload: { id: s.appointments[0].id, method: "微信" },
  });
const settleAction = (s: DemoState, id = "SET-1") => ({
  type: "GROUP_ACCOUNT_SETTLE",
  payload: {
    id,
    appointmentId: s.appointments[0].id,
    expected: previewGroupAccountSettlement(s, s.appointments[0].id).signature,
  },
});
const settle = (s: DemoState, a = settleAction(s)) =>
  reduceOrderFinanceAction(s, a)!;
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
describe("same-scope group financial closure regressions", () => {
  it("GP01 personal 99 then prepaid unit 300 reconciles receipt, project balances, account and immutable ledger without new cash", () => {
    const start = seed(),
      personal = pay(start);
    expect(personal.appointments[0]).toMatchObject({
      paidAmount: 99,
      personalPaidAmount: 99,
      amountDue: 300,
    });
    expect(buildSettlementRows(personal)[0]).toMatchObject({
      paid: 99,
      due: 300,
    });
    const p = previewGroupAccountSettlement(
      personal,
      personal.appointments[0].id,
    );
    expect(p.errors).toEqual([]);
    expect(p.amount).toBe(300);
    const next = settle(personal);
    expect(next.appointments[0]).toMatchObject({
      paidAmount: 399,
      personalPaidAmount: 99,
      unitPaidAmount: 300,
      amountDue: 0,
    });
    expect(
      Object.values(next.appointments[0].paymentAllocations).reduce<number>(
        (n, v) => n + Number(v),
        0,
      ),
    ).toBe(399);
    expect(next.records.groupAccounts[0]).toMatchObject({
      balance: 700,
      settledIds: [next.appointments[0].id],
    });
    expect(
      next.records.orderTransactions.map((t) => t.net).sort((a, b) => a - b),
    ).toEqual([99, 300]);
    const tx = next.records.orderTransactions.find((t) => t.payer === "unit");
    expect(tx).toMatchObject({
      mode: "group_account_allocation",
      cash: false,
      grossCharge: 300,
      grossRefund: 0,
      net: 300,
    });
    expect(next.records.groupAccounts[0].ledger[1]).toMatchObject({
      id: tx.id,
      transactionId: tx.id,
      amount: -300,
    });
    expect(actualOrderCollections(next, next.appointments[0])).toMatchObject({
      paid: 399,
      unitPaid: 300,
      personalPaid: 99,
    });
    expect(buildSettlementRows(next)[0]).toMatchObject({ paid: 399, due: 0 });
  });
  it("GP02 same request, fresh duplicate request and stale concurrent account snapshots cannot debit twice", () => {
    const s = pay(seed()),
      a = settleAction(s),
      next = settle(s, a);
    expect(settle(next, a)).toBe(next);
    expect(settle(next, settleAction(next, "OTHER"))).toBe(next);
    const stale = {
      ...s,
      records: {
        ...s.records,
        groupAccounts: [{ ...s.records.groupAccounts[0], balance: 999 }],
      },
    };
    expect(settle(stale, a)).toBe(stale);
    expect(
      next.records.groupAccounts[0].ledger.filter(
        (l) => l.type === "单位体检结算",
      ),
    ).toHaveLength(1);
  });
  it("GP03 insufficient balance, forbidden scope, wrong membership and cancelled orders preserve both ledgers", () => {
    const s = pay(seed());
    s.records.groupAccounts[0].balance = 299;
    expect(
      previewGroupAccountSettlement(s, s.appointments[0].id).errors.join(),
    ).toContain("不足");
    expect(settle(s)).toBe(s);
    s.records.groupAccounts[0].balance = 1000;
    s.config.customRoleId = "F";
    s.records.roles = [
      {
        id: "F",
        permissions: ["订单处理", "财务查询"],
        allowedPatientIds: ["P004"],
      },
    ];
    expect(settle(s)).toBe(s);
    s.config.customRoleId = "";
    s.appointments[0].status = "cancelled";
    expect(settle(s)).toBe(s);
  });
  it("GP04 latest canonical receipts defeat stale paidAmount and mere paidAt/settledIds are not cash evidence", () => {
    const s = pay(seed());
    s.appointments[0].paidAmount = 399;
    expect(buildSettlementRows(s)[0]).toMatchObject({ paid: 99, due: 300 });
    const old = seed();
    old.appointments[0].status = "paid";
    old.appointments[0].paidAt = "2026-10-13T08:00:00Z";
    old.records.groupAccounts[0].settledIds = [old.appointments[0].id];
    expect(buildSettlementRows(old)[0].paid).toBeNull();
  });
  it("GP05 unit settlement UI cancellation is non-mutating and confirmation dispatches atomic shared reducer", () => {
    localStorage.setItem(KEY, JSON.stringify(pay(seed())));
    render(
      <DemoProvider>
        <GroupContractWorkbench />
      </DemoProvider>,
    );
    click("星辰科技 · 合成团检 (生效)");
    click("预付款扣减");
    click("取消单位预付款结算");
    expect(
      JSON.parse(localStorage.getItem(KEY)!).records.groupAccounts[0].balance,
    ).toBe(1000);
    click("预付款扣减");
    click("确认单位预付款扣减");
    const next = JSON.parse(localStorage.getItem(KEY)!);
    expect(next.appointments[0].paidAmount).toBe(399);
    expect(next.records.groupAccounts[0].balance).toBe(700);
    expect(screen.getByRole("button", { name: "已结算" })).toBeDisabled();
  });
  it("GP06 batch repricing updates selfPay and actual H5 payment modal and receipt agree on 179", () => {
    const s = seed(),
      plan = createBatchOrderPlan(
        s,
        {
          operation: "add",
          appointmentIds: [s.appointments[0].id],
          items: ["骨密度"],
          reason: "合成闭环回归",
        },
        "BATCH-GP",
      );
    const next = reduceBatchOrderingAction(s, {
      type: "BATCH_ORDER_APPLY",
      payload: plan,
    })!;
    expect(next.appointments[0]).toMatchObject({
      amount: 479,
      selfPay: 179,
      groupSplit: { unit: 300, personal: 179 },
    });
    localStorage.setItem(KEY, JSON.stringify(next));
    window.location.hash = "#/patient";
    render(
      <DemoProvider>
        <Patient />
      </DemoProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /我的预约/ })[0]);
    click("模拟支付");
    expect(
      within(screen.getByRole("dialog", { name: "模拟支付" })).getByText(
        "¥179",
      ),
    ).toBeInTheDocument();
    click("确认模拟付款");
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.appointments[0]).toMatchObject({
      paidAmount: 179,
      personalPaidAmount: 179,
      amountDue: 300,
    });
  });
  it("GP07 password and approved discount consumption both synchronize selfPay with repriced groupSplit", () => {
    const s = seed(),
      a = s.appointments[0];
    let code = reduceBatchOrderingAction(s, {
      type: "DISCOUNT_CODE_UNLOCK",
      payload: {
        id: "C",
        appointmentId: a.id,
        expected: appointmentFingerprint(a),
        code: "DEMO-DISCOUNT-85",
      },
    })!;
    code = reduceBatchOrderingAction(code, {
      type: "DISCOUNT_CODE_APPLY",
      payload: { id: "C", appointmentId: a.id, percent: 85 },
    })!;
    expect(code.appointments[0].selfPay).toBe(
      code.appointments[0].groupSplit.personal,
    );
    expect(code.appointments[0].selfPay).not.toBe(99);
    s.config.role = "reception";
    let approved = reduceBatchOrderingAction(s, {
      type: "DISCOUNT_REQUEST",
      payload: {
        id: "D",
        appointmentId: a.id,
        percent: 70,
        reason: "合成审批",
        expected: appointmentFingerprint(a),
        catalogSignature: pricingCatalogSignature(s),
      },
    })!;
    approved.config.role = "finance";
    approved = reduceBatchOrderingAction(approved, {
      type: "DISCOUNT_DECIDE",
      payload: { id: "D", decision: "approved", reason: "合成授权" },
    })!;
    approved = reduceBatchOrderingAction(approved, {
      type: "DISCOUNT_CONSUME",
      payload: { id: "D", appointmentId: a.id },
    })!;
    expect(approved.appointments[0].selfPay).toBe(
      approved.appointments[0].groupSplit.personal,
    );
    expect(approved.appointments[0].selfPay).not.toBe(99);
  });
  it("GP08 unit-first then personal payment also reconciles without charging the unit share twice", () => {
    const unit = settle(seed());
    expect(unit.appointments[0]).toMatchObject({
      paidAmount: 300,
      unitPaidAmount: 300,
      personalPaidAmount: 0,
      status: "booked",
    });
    const paid = pay(unit);
    expect(paid.appointments[0]).toMatchObject({
      paidAmount: 399,
      personalPaidAmount: 99,
      unitPaidAmount: 300,
      amountDue: 0,
    });
    expect(actualOrderCollections(paid, paid.appointments[0]).paid).toBe(399);
  });
  it("GP09 allocated unit prepaid funds cannot be refunded as cash without an explicit original-account reversal", () => {
    const s = settle(pay(seed()));
    expect(
      previewOrderPayment(s, {
        appointmentId: s.appointments[0].id,
        mode: "full_refund",
        channel: "现金",
        chargeItems: [],
        refundItems: [],
        reason: "合成退款检查",
      }).errors.join(),
    ).toContain("单位原路冲销");
  });
  it("GP10 original-account reversal restores 300 to the account and preserves personal 99 plus clinical results/status", () => {
    const s = settle(pay(seed()));
    s.appointments[0].status = "in_exam";
    s.appointments[0].results = { 一般检查: "合成结果" };
    const original = s.records.orderTransactions.find(
      (t) => t.payer === "unit",
    );
    const preview = previewGroupAccountReversal(
      s,
      s.appointments[0].id,
      original.id,
    );
    expect(preview.errors).toEqual([]);
    const action = {
      type: "GROUP_ACCOUNT_REVERSE",
      payload: {
        id: "REV1",
        appointmentId: s.appointments[0].id,
        originalAllocationId: original.id,
        expected: preview.signature,
        reason: "合成错配纠正",
      },
    };
    const next = reduceOrderFinanceAction(s, action)!;
    expect(next.records.groupAccounts[0]).toMatchObject({
      balance: 1000,
      settledIds: [],
    });
    expect(next.appointments[0]).toMatchObject({
      unitPaidAmount: 0,
      personalPaidAmount: 99,
      paidAmount: 99,
      amountDue: 300,
      status: "in_exam",
      results: { 一般检查: "合成结果" },
    });
    expect(
      Object.values(next.appointments[0].paymentAllocations).reduce<number>(
        (n, v) => n + Number(v),
        0,
      ),
    ).toBe(99);
    expect(next.records.orderTransactions).toHaveLength(3);
    expect(next.records.orderTransactions[0]).toMatchObject({
      originalAllocationId: original.id,
      cash: false,
      payer: "unit",
      grossCharge: 0,
      grossRefund: 300,
      net: -300,
    });
    expect(next.records.groupAccounts[0].ledger[2]).toMatchObject({
      type: "单位结算冲销",
      amount: 300,
      transactionId: "REV1",
    });
    expect(buildSettlementRows(next)[0]).toMatchObject({ paid: 99, due: 300 });
    expect(reduceOrderFinanceAction(next, action)).toBe(next);
    expect(
      previewGroupAccountReversal(next, next.appointments[0].id, original.id)
        .errors.length,
    ).toBeGreaterThan(0);
    const again = settle(next, settleAction(next, "SET-AGAIN"));
    expect(again.appointments[0]).toMatchObject({
      unitPaidAmount: 300,
      paidAmount: 399,
      status: "in_exam",
    });
    expect(again.records.groupAccounts[0].balance).toBe(700);
    expect(again.records.orderTransactions).toHaveLength(4);
    expect(settle(again, settleAction(again, "SET-THIRD"))).toBe(again);
  });
  it("GP11 reversal rejects stale account/order, unauthorized scope, absent reason and insufficient project balances", () => {
    const s = settle(pay(seed())),
      original = s.records.orderTransactions.find((t) => t.payer === "unit"),
      preview = previewGroupAccountReversal(
        s,
        s.appointments[0].id,
        original.id,
      );
    const action = {
      type: "GROUP_ACCOUNT_REVERSE",
      payload: {
        id: "R",
        appointmentId: s.appointments[0].id,
        originalAllocationId: original.id,
        expected: preview.signature,
        reason: "合成冲销",
      },
    };
    expect(
      reduceOrderFinanceAction(s, {
        ...action,
        payload: { ...action.payload, reason: "" },
      }),
    ).toBe(s);
    const stale = {
      ...s,
      records: {
        ...s.records,
        groupAccounts: [{ ...s.records.groupAccounts[0], balance: 699 }],
      },
    };
    expect(reduceOrderFinanceAction(stale, action)).toBe(stale);
    const denied = { ...s, config: { ...s.config, role: "doctor" } };
    expect(reduceOrderFinanceAction(denied, action)).toBe(denied);
    const bad = {
      ...s,
      appointments: [{ ...s.appointments[0], paymentAllocations: {} }],
    };
    expect(
      previewGroupAccountReversal(
        bad,
        bad.appointments[0].id,
        original.id,
      ).errors.join(),
    ).toContain("项目实收余额不足");
    const badBalance = {
      ...s,
      records: {
        ...s.records,
        groupAccounts: [{ ...s.records.groupAccounts[0], balance: -1 }],
      },
    };
    expect(
      previewGroupAccountReversal(
        badBalance,
        s.appointments[0].id,
        original.id,
      ).errors.join(),
    ).toContain("余额无效");
  });
  it("GP12 reversal UI can cancel and then confirm original account return, after which ordinary personal refund is eligible", () => {
    localStorage.setItem(KEY, JSON.stringify(settle(pay(seed()))));
    render(
      <DemoProvider>
        <GroupContractWorkbench />
      </DemoProvider>,
    );
    click("星辰科技 · 合成团检 (生效)");
    click("撤销单位预付款结算");
    click("取消单位预付款结算");
    expect(
      JSON.parse(localStorage.getItem(KEY)!).records.groupAccounts[0].balance,
    ).toBe(700);
    click("撤销单位预付款结算");
    click("确认原路冲销单位款");
    const next = JSON.parse(localStorage.getItem(KEY)!);
    expect(next.records.groupAccounts[0].balance).toBe(1000);
    expect(next.appointments[0].paidAmount).toBe(99);
    const refund = previewOrderPayment(next, {
      appointmentId: next.appointments[0].id,
      mode: "full_refund",
      channel: "微信",
      chargeItems: [],
      refundItems: [],
      reason: "合成个人退款",
    });
    expect(refund.errors).toEqual([]);
    expect(refund.grossRefund).toBe(99);
  });
});
