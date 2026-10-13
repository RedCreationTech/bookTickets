import { describe, it, expect, vi } from "vitest";
import { useReducer } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  createInitialState,
  reducer,
  type DemoState,
  type Action,
} from "../src/model";
import { quoteOrder } from "../src/orderingRules";
import { DemoProvider, useDemo } from "../src/store";
import {
  appointmentFingerprint,
  pricingCatalogSignature,
} from "../src/batchOrderingRules";
import {
  PAYMENT_CHANNELS,
  previewOrderPayment,
  orderPricingLines,
  previewGroupSettlement,
  reduceOrderFinanceAction,
  synchronizePackageCardLifecycle,
  DEMO_CARD_CODE,
  type PaymentDraft,
} from "../src/orderFinanceRules";
import {
  OrderFinanceDesk,
  MembershipCardDesk,
  GroupSettlementDesk,
} from "../src/modules/OrderFinanceCompletion";
const fresh = () => {
  const s = createInitialState();
  s.config.role = "admin";
  s.config.bookingClock = "2026-10-13T07:00:00Z";
  s.appointments = s.appointments.slice(0, 2).map((a) => ({
    ...a,
    status: "booked",
    locked: false,
    date: "2026-10-15",
    time: "08:00",
    packageId: "PK01",
    items: [...s.packages[0].items],
    amount: 399,
    results: {},
    pricing: quoteOrder(s, ["PK01"], 100).rows,
    reviewStage: 0,
    paidAmount: 0,
  }));
  return s;
};
const apply = (s: DemoState, a: Action) =>
  reduceOrderFinanceAction(s, a) ?? reducer(s, a);
const payment = (s: DemoState, patch: Partial<PaymentDraft> = {}) => {
  const a = s.appointments[0],
    draft = {
      id: "TX-1",
      appointmentId: a.id,
      mode: "full_charge" as const,
      channel: "现金",
      chargeItems: [],
      refundItems: [],
      reason: "合成财务复核",
      ...patch,
    };
  return {
    type: "ORDER_PAYMENT_APPLY",
    payload: {
      ...draft,
      expected: appointmentFingerprint(a),
      catalogSignature: pricingCatalogSignature(s),
      previewSignature: JSON.stringify(previewOrderPayment(s, draft)),
    },
  };
};
const issue = (s: DemoState, type = "储值卡") =>
  apply(s, {
    type: "CARD_BATCH_ISSUE",
    payload: { id: "B-1", count: 3, type, balance: 500, packageId: "PK01" },
  });
const challenge = (s: DemoState, id = "C-1", amount = 100) =>
  apply(s, {
    type: "CARD_SEND_CODE",
    payload: {
      id,
      appointmentId: s.appointments[0].id,
      cardId: s.records.cards[0].id,
      amount,
    },
  });
const redeem = (s: DemoState, id = "C-1", code = DEMO_CARD_CODE) =>
  apply(s, { type: "CARD_REDEEM", payload: { id, code } });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
function Harness({
  initial,
  view = "finance",
}: {
  initial: DemoState;
  view?: string;
}) {
  const [s, act] = useReducer(apply, initial);
  return (
    <>
      {view === "finance" ? (
        <OrderFinanceDesk
          state={s}
          act={act}
          appointmentId={s.appointments[0].id}
        />
      ) : view === "cards" ? (
        <MembershipCardDesk state={s} act={act} />
      ) : (
        <GroupSettlementDesk state={s} act={act} />
      )}
      <pre data-testid="state">{JSON.stringify(s)}</pre>
    </>
  );
}
const current = (): DemoState =>
  JSON.parse(screen.getByTestId("state").textContent!);
describe("channel/item finance completion", () => {
  it.each(PAYMENT_CHANNELS)(
    "OF01 / T0184 persists %s simulated charge and full refund with exact ledger and replay protection",
    (channel) => {
      const s = fresh(),
        action = payment(s, { channel });
      const charged = apply(s, action);
      expect(charged.appointments[0]).toMatchObject({
        status: "paid",
        paidAmount: 399,
        amountDue: 0,
      });
      expect(charged.records.orderTransactions[0]).toMatchObject({
        channel,
        grossCharge: 399,
        net: 399,
      });
      expect(apply(charged, action)).toBe(charged);
      const refunded = apply(
        charged,
        payment(charged, { id: "REF-1", mode: "full_refund", channel }),
      );
      expect(refunded.appointments[0]).toMatchObject({
        paidAmount: 0,
        amountDue: 399,
        status: "booked",
      });
      expect(refunded.records.orderTransactions[0]).toMatchObject({
        channel,
        grossRefund: 399,
        net: -399,
      });
      expect(refunded.audit[0].before.paidAmount).toBe(399);
    },
  );
  it("OF02 / T0185 item charges preserve remaining balances and offset appended item against real paid refund", () => {
    const s = fresh(),
      first = s.appointments[0].items[0];
    const charged = apply(
      s,
      payment(s, { mode: "items", chargeItems: [first] }),
    );
    const firstAmount = s.appointments[0].pricing.find(
      (r: any) => r.item === first,
    ).amount;
    expect(charged.appointments[0].paidAmount).toBe(firstAmount);
    const draft = {
      id: "OFFSET",
      mode: "offset" as const,
      refundItems: [first],
      chargeItems: [],
      extraItems: ["骨密度"],
    };
    const preview = previewOrderPayment(charged, {
      ...payment(charged).payload,
      ...draft,
    });
    expect(preview.errors).toEqual([]);
    expect(preview.net).toBeCloseTo(80 - firstAmount, 2);
    const next = apply(charged, payment(charged, draft));
    expect(next.appointments[0].items).toContain("骨密度");
    expect(next.appointments[0].paymentAllocations[first]).toBe(0);
    expect(next.appointments[0].paymentAllocations["骨密度"]).toBe(80);
    expect(next.records.orderTransactions[0].lines).toHaveLength(2);
    expect(next.appointments[0].results).toEqual({});
  });
  it("OF03 / T0185 full-refund/recharge retains two gross legs even when net is zero; invalid/stale/scope changes do not apply", () => {
    const s = apply(fresh(), payment(fresh()));
    const p = payment(s, { id: "RECHARGE", mode: "refund_recharge" });
    const next = apply(s, p);
    expect(next.records.orderTransactions[0]).toMatchObject({
      grossCharge: 399,
      grossRefund: 399,
      net: 0,
    });
    const stale = {
      ...s,
      appointments: s.appointments.map((a, i) =>
        i ? a : { ...a, locked: true },
      ),
    };
    expect(apply(stale, p)).toBe(stale);
    const noAccess = { ...s, config: { ...s.config, role: "doctor" } };
    expect(apply(noAccess, p)).toBe(noAccess);
    expect(
      previewOrderPayment(s, {
        ...p.payload,
        mode: "offset",
        refundItems: [],
        chargeItems: [],
      }).errors.length,
    ).toBeGreaterThan(0);
  });
  it("OF04 / T0185 financial extra-item edit cannot bypass locked/examined orders or item resource capacity", () => {
    const s = fresh();
    s.appointments[0].locked = true;
    expect(
      previewOrderPayment(s, {
        ...payment(s).payload,
        mode: "items",
        extraItems: ["骨密度"],
      }).errors.join(),
    ).toContain("锁定");
    s.appointments[0].locked = false;
    s.records.bookingResourceLimits = [
      {
        id: "LIMIT",
        kind: "item",
        resourceId: "骨密度",
        dailyCapacity: 0,
        enabled: true,
      },
    ];
    expect(
      previewOrderPayment(s, {
        ...payment(s).payload,
        mode: "items",
        extraItems: ["骨密度"],
      }).errors.join(),
    ).toMatch(/骨密度/);
  });
  it("OF05 / T0184 T0185 UI preview cancellation has no mutation; confirmation records chosen channel", () => {
    render(<Harness initial={fresh()} />);
    change("收退费渠道", "微信");
    change("收退费说明", "合成收费");
    click("预览模拟收退费");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    click("取消模拟收退费");
    expect(current().records.orderTransactions).toBeUndefined();
    click("预览模拟收退费");
    click("确认模拟收退费");
    expect(current().records.orderTransactions[0].channel).toBe("微信");
  });
  it("OF06 / T0197 three-card batch has unique IDs; repeated batch and invalid count cannot issue again", () => {
    const s = fresh(),
      next = issue(s);
    expect(next.records.cards.slice(0, 3).every((c) => c.balance === 500)).toBe(
      true,
    );
    expect(new Set(next.records.cards.map((c) => c.id)).size).toBe(
      next.records.cards.length,
    );
    expect(issue(next)).toBe(next);
    expect(
      apply(s, {
        type: "CARD_BATCH_ISSUE",
        payload: { id: "BAD", count: 0, type: "储值卡", balance: 3 },
      }),
    ).toBe(s);
  });
  it("OF07 / T0198 incorrect code changes no balance, successful code atomically debits card/order once", () => {
    const s = challenge(issue(fresh()));
    const bad = redeem(s, "C-1", "111111");
    expect(bad.records.cardChallenges[0].attempts).toBe(1);
    expect(bad.appointments[0].paidAmount).toBe(0);
    expect(bad.records.cards[0].balance).toBe(500);
    const next = redeem(bad);
    expect(next.appointments[0].paidAmount).toBe(100);
    expect(next.records.cards[0].balance).toBe(400);
    expect(next.records.cardTransactions[0]).toMatchObject({
      amount: 100,
      balanceBefore: 500,
      balanceAfter: 400,
    });
    expect(redeem(next)).toBe(next);
  });
  it("OF08 / T0198 challenge locks after three failures and expired/stale/bound-card challenge cannot debit", () => {
    let s = challenge(issue(fresh()));
    for (let i = 0; i < 3; i++) s = redeem(s, "C-1", "000000");
    expect(s.records.cardChallenges[0].status).toBe("locked");
    expect(redeem(s)).toBe(s);
    s = challenge(issue(fresh()));
    vi.setSystemTime(new Date("2026-10-13T08:06:00Z"));
    expect(redeem(s)).toBe(s);
  });
  it("OF09 / T0199 two card consumptions preserve order IDs, times and balances for ledger filtering/export", () => {
    let s = redeem(challenge(issue(fresh())));
    s = redeem(challenge(s, "C-2", 50), "C-2");
    expect(s.records.cardTransactions.map((r) => r.amount)).toEqual([50, 100]);
    expect(
      s.records.cardTransactions.every(
        (r) =>
          r.appointmentId === s.appointments[0].id &&
          r.at === "2026-10-13T08:00:00.000Z",
      ),
    ).toBe(true);
    render(<Harness initial={s} view="cards" />);
    change("消费卡明细筛选", s.records.cards[0].id);
    expect(screen.getAllByText(s.appointments[0].id).length).toBeGreaterThan(0);
    click("导出消费卡明细");
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
  it("OF10 / T0200 package card binds compatible order and expires only after all actual results saved", () => {
    let s = redeem(challenge(issue(fresh(), "套餐卡"), "C-1", 399));
    const card = s.records.cards[0];
    expect(card).toMatchObject({
      type: "套餐卡",
      appointmentId: s.appointments[0].id,
      status: "已绑定",
      balance: 0,
    });
    s.appointments[0].status = "review";
    expect(synchronizePackageCardLifecycle(s)).toBe(s);
    s.appointments[0].results = Object.fromEntries(
      s.appointments[0].items.map((i) => [i, "合成演示结果"]),
    );
    const next = synchronizePackageCardLifecycle(s);
    expect(next.records.cards[0]).toMatchObject({
      status: "已失效",
      expiredReason: "关联订单检查完成",
    });
    expect(synchronizePackageCardLifecycle(next)).toBe(next);
  });
  it("OF11 / T0190 six settlement bases produce explainable snapshots and exclude personal/waived/unexamined lines", () => {
    const s = fresh(),
      a = s.appointments[0];
    s.records.groupOrders = [
      {
        id: "G",
        company: "星辰科技",
        mode: "无限额",
        status: "生效",
        budget: 1000,
        personalItems: [],
      },
    ];
    a.groupOrderId = "G";
    a.status = "checked";
    a.results[a.items[0]] = "合成结果";
    a.waived = [a.items[1]];
    a.items = a.items.filter((i) => i !== a.waived[0]);
    const all = previewGroupSettlement(s, "G", "order_details"),
      checked = previewGroupSettlement(s, "G", "checked_items"),
      waived = previewGroupSettlement(s, "G", "exclude_waived");
    expect(all.amount).toBe(399);
    expect(checked.amount).toBeGreaterThan(0);
    expect(checked.amount).toBeLessThan(waived.amount);
    expect(previewGroupSettlement(s, "G", "exclude_unchecked").amount).toBe(
      checked.amount,
    );
    expect(previewGroupSettlement(s, "G", "checked_orders").amount).toBe(399);
    expect(previewGroupSettlement(s, "G", "contract", 777).amount).toBe(777);
    const action = {
      type: "GROUP_SETTLEMENT_CONFIRM",
      payload: {
        id: "SETTLE",
        groupOrderId: "G",
        mode: "checked_items",
        contractAmount: 0,
        expected: checked.signature,
      },
    };
    const next = apply(s, action);
    expect(next.records.groupSettlementSnapshots[0].amount).toBe(
      checked.amount,
    );
    expect(apply(next, action)).toBe(next);
    a.outsideGroupPersonalPay = true;
    expect(previewGroupSettlement(s, "G", "order_details").amount).toBe(0);
  });
  it("OF12 / T0197 batch creation preview can be cancelled without creating cards", () => {
    render(<Harness initial={fresh()} view="cards" />);
    change("批量卡数量", "3");
    click("预览批量制卡");
    expect(
      within(screen.getByRole("dialog")).getAllByRole("listitem"),
    ).toHaveLength(3);
    click("取消批量制卡");
    expect(current().records.cardBatches).toBeUndefined();
    click("预览批量制卡");
    click("确认批量制卡");
    expect(current().records.cardBatches[0].count).toBe(3);
  });
  it("OF13 legacy price reconstruction preserves saved total to the cent", () => {
    const s = fresh(),
      a = s.appointments[0];
    delete a.pricing;
    a.amount = 123.45;
    const rows = orderPricingLines(s, a);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBeCloseTo(123.45, 2);
  });
  it("OF14 / T0200 ordinary SAVE_RESULTS transition invokes package-card lifecycle in the integrated reducer", () => {
    let s = redeem(challenge(issue(fresh(), "套餐卡"), "C-1", 399));
    s = reducer(s, { type: "CHECKIN", payload: { id: s.appointments[0].id } });
    const a = s.appointments[0];
    s = reducer(s, {
      type: "SAVE_RESULTS",
      payload: {
        id: a.id,
        results: Object.fromEntries(
          a.items.map((i) => [i, i === "空腹血糖" ? "5.1" : "合成正常"]),
        ),
        complete: true,
      },
    });
    expect(s.appointments[0].status).toBe("review");
    expect(s.records.cards[0].status).toBe("已失效");
  });
  it("OF15 actual shared provider persists chosen-channel transaction and project balances", () => {
    const s = fresh(),
      key = "hongchuang.health.demo.v1";
    localStorage.setItem(key, JSON.stringify(s));
    function Connected() {
      const { state, act } = useDemo();
      return (
        <OrderFinanceDesk
          state={state}
          act={act}
          appointmentId={s.appointments[0].id}
        />
      );
    }
    render(
      <DemoProvider>
        <Connected />
      </DemoProvider>,
    );
    change("收退费渠道", "支付宝");
    change("收退费说明", "合成存储集成测试");
    click("预览模拟收退费");
    click("确认模拟收退费");
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.records.orderTransactions[0]).toMatchObject({
      channel: "支付宝",
      net: 399,
    });
    expect(saved.appointments[0].paidAmount).toBe(399);
  });
});
