import { describe, it, expect } from "vitest";
import { useReducer } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Action, DemoState } from "../src/model";
import { createInitialState, reducer } from "../src/model";
import { DemoProvider, useDemo } from "../src/store";
import { quoteOrder } from "../src/orderingRules";
import {
  BatchOrdering,
  DiscountApprovalDesk,
} from "../src/modules/BatchOrdering";
import {
  appointmentFingerprint,
  canApproveDiscount,
  createBatchOrderPlan,
  discountRequestErrors,
  orderEditPolicy,
  previewBatchOrders,
  pricingCatalogSignature,
  reduceBatchOrderingAction,
} from "../src/batchOrderingRules";
const fresh = () => {
  const s = createInitialState();
  s.config.role = "reception";
  s.config.bookingClock = "2026-10-13T07:00:00Z";
  s.appointments.slice(0, 3).forEach((a) => {
    a.status = "booked";
    a.date = "2026-10-15";
    a.packageId = "PK01";
    a.items = [...s.packages[0].items];
    a.amount = 399;
    a.results = {};
    a.source = "前台登记";
    a.reviewStage = 0;
    a.locked = false;
    delete a.packageIds;
  });
  return s;
};
const apply = (s: DemoState, action: Action) =>
  reduceBatchOrderingAction(s, action) ?? reducer(s, action);
const draft = (s: DemoState, patch: Record<string, any> = {}) => ({
  operation: "add" as const,
  appointmentIds: [s.appointments[0].id],
  items: ["骨密度"],
  reason: "合成批量调整",
  ...patch,
});
const request = (s: DemoState, id = "DISC-001", index = 0, percent = 70) => ({
  type: "DISCOUNT_REQUEST",
  payload: {
    id,
    appointmentId: s.appointments[index].id,
    percent,
    reason: "合成专项优惠申请",
    expected: appointmentFingerprint(s.appointments[index]),
    catalogSignature: pricingCatalogSignature(s),
  },
});
const approve = (s: DemoState, id = "DISC-001") =>
  apply(
    { ...s, config: { ...s.config, role: "finance" } },
    {
      type: "DISCOUNT_DECIDE",
      payload: { id, decision: "approved", reason: "合成额度复核通过" },
    },
  );
function Harness({
  initial,
  mode = "batch",
  ids,
}: {
  initial: DemoState;
  mode?: "batch" | "discount";
  ids?: string[];
}) {
  const [s, act] = useReducer(apply, initial);
  return (
    <>
      <label>
        测试角色
        <select
          aria-label="测试角色"
          value={s.config.role}
          onChange={(e) =>
            act({ type: "UPDATE_CONFIG", payload: { role: e.target.value } })
          }
        >
          <option>reception</option>
          <option>finance</option>
          <option>admin</option>
          <option>doctor</option>
        </select>
      </label>
      {mode === "batch" ? (
        <BatchOrdering state={s} act={act} appointmentIds={ids} />
      ) : (
        <DiscountApprovalDesk
          state={s}
          act={act}
          appointmentId={s.appointments[0].id}
        />
      )}
      <pre data-testid="batch-state">{JSON.stringify(s)}</pre>
    </>
  );
}
const current = (): DemoState =>
  JSON.parse(screen.getByTestId("batch-state").textContent!);
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const dialogClick = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name,
      exact: true,
    }),
  );

describe("guarded batch order editing", () => {
  it("BO01 / T0168 T0183 previews item additions, reuses dependency/pricing rules and atomically audits each success", () => {
    const s = fresh(),
      plan = createBatchOrderPlan(
        s,
        draft(s, {
          appointmentIds: [s.appointments[0].id, s.appointments[1].id],
        }),
        "BATCH-ADD",
      );
    const rows = previewBatchOrders(s, plan);
    expect(rows.every((r) => r.eligible)).toBe(true);
    expect(rows[0].added).toEqual(["骨密度"]);
    expect(rows[0].afterAmount).toBe(479);
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(next.appointments[0].items).toContain("骨密度");
    expect(next.appointments[1].amount).toBe(479);
    expect(s.appointments[0].amount).toBe(399);
    expect(next.records.orderBatches[0]).toMatchObject({
      success: 2,
      failed: 0,
    });
    expect(next.audit[0]).toMatchObject({
      action: "BATCH_ORDER_ITEM",
      entity: s.appointments[0].id,
      outcome: "success",
      before: { amount: 399 },
      after: { amount: 479 },
    });
  });
  it("BO02 / T0168 mixed locked, paid and examined orders are skipped individually without modifying charges or results", () => {
    const s = fresh();
    s.appointments[1].locked = true;
    s.appointments[2].status = "paid";
    const ids = s.appointments.slice(0, 5).map((a) => a.id);
    const before = JSON.stringify(s.appointments.slice(1, 5));
    const next = apply(s, {
      type: "BATCH_ORDER_APPLY",
      payload: createBatchOrderPlan(
        s,
        draft(s, { appointmentIds: ids }),
        "BATCH-MIXED",
      ),
    });
    expect(next.records.orderBatches[0]).toMatchObject({
      success: 2,
      failed: 3,
    }); // Initial fourth order is also a valid booked order.
    expect(next.appointments[1]).toEqual(s.appointments[1]);
    expect(next.appointments[2]).toEqual(s.appointments[2]);
    expect(next.appointments[4]).toEqual(s.appointments[4]);
    expect(
      next.records.orderBatches[0].results
        .find((r: any) => r.appointmentId === s.appointments[1].id)
        .errors.join(),
    ).toContain("锁定");
    expect(before).toContain("paid");
  });
  it("BO03 / T0168 rejects removal of required/dependency items and preserves source state", () => {
    const s = fresh();
    const plan = createBatchOrderPlan(
      s,
      draft(s, { operation: "remove", items: ["一般检查"] }),
      "BATCH-REQUIRED",
    );
    expect(previewBatchOrders(s, plan)[0].errors.join()).toContain(
      "必检项目缺失",
    );
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(next.appointments).toEqual(s.appointments);
    expect(next.records.orderBatches[0].failed).toBe(1);
    s.appointments[0].items.push("骨密度");
    expect(
      previewBatchOrders(
        s,
        draft(s, { operation: "remove", items: ["一般检查"] }),
      )[0].errors.join(),
    ).toContain("依赖一般检查");
  });
  it("BO04 / T0168 legal item removals recompute the amount using quoteOrder", () => {
    const s = fresh(),
      plan = createBatchOrderPlan(
        s,
        draft(s, { operation: "remove", items: ["血常规"] }),
        "BATCH-REMOVE",
      );
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    const expected = quoteOrder(s, ["PK01"], 100, {}, [], ["血常规"]);
    expect(next.appointments[0].items).not.toContain("血常规");
    expect(next.appointments[0].amount).toBe(expected.amount);
    expect(next.appointments[0].pricing).toEqual(expected.rows);
  });
  it("BO05 / T0169 replacement previews item differences and recalculates group/personal allocations", () => {
    const s = fresh(),
      a = s.appointments[0];
    a.groupOrderId = "GROUP-01";
    a.groupSplit = { unit: 300, personal: 99 };
    s.records.groupOrders = [
      {
        id: "GROUP-01",
        company: s.patients[0].company,
        status: "生效",
        packages: ["PK01", "PK02"],
        mode: "限额自选",
        budget: 350,
      },
    ];
    const plan = createBatchOrderPlan(
      s,
      draft(s, { operation: "replace", packageId: "PK02", items: [] }),
      "BATCH-REPLACE",
    );
    expect(previewBatchOrders(s, plan)[0].added).toContain("心电图");
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(next.appointments[0]).toMatchObject({
      packageId: "PK02",
      amount: 899,
      groupSplit: { unit: 350, personal: 549 },
    });
  });
  it("BO06 / T0169 enforces campus, patient applicability, group contract and booking restrictions", () => {
    const s = fresh();
    s.records.packageRules = [
      { id: "R-PK02", packageId: "PK02", campuses: ["东院区"], sex: "女" },
    ];
    const errors = previewBatchOrders(
      s,
      draft(s, { operation: "replace", packageId: "PK02", items: [] }),
    )[0].errors.join(";");
    expect(errors).toContain("院区");
    expect(errors).toContain("性别");
    s.appointments[0].date = "2026-10-12";
    expect(previewBatchOrders(s, draft(s))[0].errors.join()).toContain(
      "过去的日期",
    );
    s.appointments[0].groupOrderId = "MISSING";
    expect(previewBatchOrders(s, draft(s))[0].errors.join()).toContain(
      "团检约定缺失",
    );
  });
  it("BO07 / T0168 T0169 stale previews never overwrite changed orders or changed price catalogs", () => {
    const s = fresh(),
      plan = createBatchOrderPlan(s, draft(s), "BATCH-STALE");
    const changed = {
      ...s,
      appointments: s.appointments.map((a, i) =>
        i === 0 ? { ...a, amount: 1000 } : a,
      ),
    };
    const next = apply(changed, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(next.appointments[0].amount).toBe(1000);
    expect(next.records.orderBatches[0].results[0].errors.join()).toContain(
      "订单在预览后已变化",
    );
    const catalog = {
      ...s,
      packages: s.packages.map((p, i) => (i === 0 ? { ...p, price: 499 } : p)),
    };
    const result = apply(catalog, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(result.appointments[0].amount).toBe(399);
    expect(result.records.orderBatches[0].results[0].errors.join()).toContain(
      "价格或套餐规则发生变化",
    );
  });
  it("BO08 / T0168 duplicate execution IDs and duplicate selected IDs do not repeat mutations or audit", () => {
    const s = fresh(),
      plan = createBatchOrderPlan(
        s,
        draft(s, {
          appointmentIds: [s.appointments[0].id, s.appointments[0].id],
        }),
        "BATCH-ONCE",
      );
    expect(plan.appointmentIds).toHaveLength(1);
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(apply(next, { type: "BATCH_ORDER_APPLY", payload: plan })).toBe(
      next,
    );
  });
  it("BO09 / T0168 reducer enforces custom role, customer and campus scope even for crafted payloads", () => {
    const s = fresh(),
      plan = createBatchOrderPlan(s, draft(s), "BATCH-SCOPE");
    s.config.customRoleId = "CUSTOM";
    s.records.roles = [
      {
        id: "CUSTOM",
        permissions: ["维护预约"],
        allowedPatientIds: [s.patients[1].id],
        allowedCampus: "东院区",
      },
    ];
    expect(orderEditPolicy(s, s.appointments[0])).toEqual([
      "当前角色无此订单的数据权限",
    ]);
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(next.appointments).toEqual(s.appointments);
    expect(next.records.orderBatches[0].failed).toBe(1);
    s.records.roles[0].permissions = ["查看客户"];
    expect(apply(s, { type: "BATCH_ORDER_APPLY", payload: plan })).toBe(s);
  });
  it("BO10 / T0183 UI cancel does not persist; confirmed visual batch shows per-order results", () => {
    const s = fresh();
    render(
      <Harness
        initial={s}
        ids={[s.appointments[0].id, s.appointments[4].id]}
      />,
    );
    fireEvent.click(screen.getByLabelText("批量项目 骨密度"));
    change("批量调整原因", "合成项目追加");
    click("预览批量变更");
    expect(screen.getByLabelText("批量变更逐单预览")).toHaveTextContent(
      "已经到检",
    );
    dialogClick("取消批量变更");
    expect(current().records.orderBatches).toBeUndefined();
    click("预览批量变更");
    dialogClick("确认执行批量变更");
    expect(screen.getByLabelText("批量执行结果")).toHaveTextContent(
      "成功 1 · 失败 1",
    );
    expect(current().appointments[0].amount).toBe(479);
    expect(current().appointments[4]).toEqual(s.appointments[4]);
  });
});

describe("batch guard configuration and provider integration", () => {
  it("BO11 / T0168 respects disabled add/remove configuration and rejects non-finite stored pricing", () => {
    const s = fresh();
    s.config.allowAdd = false;
    expect(previewBatchOrders(s, draft(s))[0].errors.join()).toContain(
      "禁止增加项目",
    );
    s.config.allowAdd = true;
    s.config.allowRemove = false;
    expect(
      previewBatchOrders(
        s,
        draft(s, { operation: "remove", items: ["血常规"] }),
      )[0].errors.join(),
    ).toContain("禁止减少项目");
    s.config.allowRemove = true;
    s.appointments[0].pricing = [{ item: "血常规", percent: Number.NaN }];
    const next = apply(s, {
      type: "BATCH_ORDER_APPLY",
      payload: createBatchOrderPlan(s, draft(s), "BAD-PRICE"),
    });
    expect(next.appointments[0].amount).toBe(399);
    expect(next.records.orderBatches[0].results[0].errors.join()).toContain(
      "无效金额或折扣",
    );
  });
  it("BO12 / T0168 T0183 actual DemoProvider dispatch persists guarded batch results and before/after audit", () => {
    const s = fresh(),
      id = s.appointments[0].id,
      key = "hongchuang.health.demo.v1";
    localStorage.setItem(key, JSON.stringify(s));
    function Connected() {
      const { state, act } = useDemo();
      return <BatchOrdering state={state} act={act} appointmentIds={[id]} />;
    }
    render(
      <DemoProvider>
        <Connected />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByLabelText("批量项目 骨密度"));
    change("批量调整原因", "合成本地存储集成验证");
    click("预览批量变更");
    dialogClick("确认执行批量变更");
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.appointments[0].amount).toBe(479);
    expect(saved.records.orderBatches[0].success).toBe(1);
    expect(saved.audit[0]).toMatchObject({
      action: "BATCH_ORDER_ITEM",
      before: { amount: 399 },
      after: { amount: 479 },
    });
  });
});

describe("bound one-time discount approval", () => {
  it("DA01 / T0109 request is pending and does not alter the order; repeat IDs and duplicate pending requests are no-ops", () => {
    const s = fresh(),
      action = request(s),
      next = apply(s, action);
    expect(next.records.discountApprovals[0]).toMatchObject({
      status: "pending",
      percent: 70,
      requestedBy: "reception",
    });
    expect(next.appointments).toEqual(s.appointments);
    expect(apply(next, action)).toBe(next);
    expect(apply(next, request(next, "DISC-DUP"))).toBe(next);
  });
  it("DA02 / T0109 unauthorized approval, self-approval and missing rejection reasons are rejected", () => {
    const s = fresh(),
      next = apply(s, request(s));
    const decision = {
      type: "DISCOUNT_DECIDE",
      payload: { id: "DISC-001", decision: "approved", reason: "合成审批" },
    };
    expect(apply(next, decision)).toBe(next);
    const admin = fresh();
    admin.config.role = "admin";
    const self = apply(admin, request(admin));
    expect(apply(self, decision)).toBe(self);
    const finance = { ...next, config: { ...next.config, role: "finance" } };
    expect(
      apply(finance, {
        type: "DISCOUNT_DECIDE",
        payload: { id: "DISC-001", decision: "rejected", reason: " " },
      }),
    ).toBe(finance);
    expect(
      canApproveDiscount({
        ...finance,
        config: { ...finance.config, customRoleId: "NO" },
      }),
    ).toBe(false);
  });
  it("DA03 / T0109 approval then bound consumption updates price exactly once and preserves non-discountable items", () => {
    const s = fresh(),
      next = approve(apply(s, request(s)));
    expect(next.records.discountApprovals[0].status).toBe("approved");
    expect(next.appointments[0].amount).toBe(399);
    const bad = {
      type: "DISCOUNT_CONSUME",
      payload: { id: "DISC-001", appointmentId: s.appointments[1].id },
    };
    expect(apply(next, bad)).toBe(next);
    const action = {
      type: "DISCOUNT_CONSUME",
      payload: {
        id: "DISC-001",
        appointmentId: s.appointments[0].id,
        percent: 1,
        amount: 1,
      },
    };
    const consumed = apply(next, action),
      quote = quoteOrder(s, ["PK01"], 70);
    expect(consumed.appointments[0].amount).toBe(quote.amount);
    expect(
      consumed.appointments[0].pricing.find((r: any) => r.item === "一般检查")
        .percent,
    ).toBe(100);
    expect(consumed.appointments[0].items).toEqual(s.appointments[0].items);
    expect(consumed.records.discountApprovals[0].status).toBe("consumed");
    expect(apply(consumed, action)).toBe(consumed);
    expect(consumed.audit[0]).toMatchObject({
      action: "DISCOUNT_CONSUME",
      before: { amount: 399 },
      after: { amount: quote.amount },
      requestId: "DISC-001",
    });
  });
  it("DA04 / T0109 rejection is traceable and can never be consumed", () => {
    let s = apply(fresh(), request(fresh()));
    s = { ...s, config: { ...s.config, role: "finance" } };
    const rejected = apply(s, {
      type: "DISCOUNT_DECIDE",
      payload: { id: "DISC-001", decision: "rejected", reason: "合成预算不足" },
    });
    expect(rejected.records.discountApprovals[0]).toMatchObject({
      status: "rejected",
      decisionReason: "合成预算不足",
      decidedBy: "finance",
    });
    expect(
      apply(rejected, {
        type: "DISCOUNT_CONSUME",
        payload: { id: "DISC-001", appointmentId: s.appointments[0].id },
      }),
    ).toBe(rejected);
    expect(rejected.appointments).toEqual(s.appointments);
  });
  it("DA05 / T0109 order/price changes and paid status invalidate old authorization before approval or consumption", () => {
    const s = fresh(),
      pending = apply(s, request(s));
    pending.appointments = pending.appointments.map((a, i) =>
      i === 0 ? { ...a, status: "paid" } : a,
    );
    const stale = approve(pending);
    expect(stale.records.discountApprovals[0].status).toBe("stale");
    expect(stale.appointments[0].amount).toBe(399);
    const approved = approve(apply(s, request(s)));
    approved.packages = approved.packages.map((p, i) =>
      i === 0 ? { ...p, price: 799 } : p,
    );
    const failed = apply(approved, {
      type: "DISCOUNT_CONSUME",
      payload: { id: "DISC-001", appointmentId: s.appointments[0].id },
    });
    expect(failed.records.discountApprovals[0].status).toBe("stale");
    expect(failed.appointments[0].amount).toBe(399);
  });
  it("DA06 / T0109 invalid percentages, missing reason, in-permission requests and checked orders cannot request approval", () => {
    const s = fresh();
    expect(
      discountRequestErrors(s, s.appointments[0].id, 90, "合成原因").join(),
    ).toContain("未超权限");
    expect(
      discountRequestErrors(s, s.appointments[0].id, -1, "").join(),
    ).toContain("0–100");
    const bad = request(s);
    bad.payload.reason = "";
    expect(apply(s, bad)).toBe(s);
    s.appointments[0].results = { 一般检查: "已做" };
    expect(apply(s, request(s))).toBe(s);
  });
  it("DA07 / T0109 requester can withdraw pending approval with reason and later submit a new one", () => {
    const s = fresh(),
      pending = apply(s, request(s));
    const withdrawn = apply(pending, {
      type: "DISCOUNT_WITHDRAW",
      payload: { id: "DISC-001", reason: "合成重新申请" },
    });
    expect(withdrawn.records.discountApprovals[0].status).toBe("withdrawn");
    expect(withdrawn.appointments).toEqual(s.appointments);
    const next = apply(withdrawn, request(withdrawn, "DISC-002"));
    expect(next.records.discountApprovals).toHaveLength(2);
    expect(next.records.discountApprovals[0].status).toBe("pending");
  });
  it("DA08 / T0109 JSON persistence preserves approval state and consumed one-time guard", () => {
    const s = fresh(),
      approved = approve(apply(s, request(s)));
    const saved: DemoState = JSON.parse(JSON.stringify(approved));
    const action = {
      type: "DISCOUNT_CONSUME",
      payload: { id: "DISC-001", appointmentId: s.appointments[0].id },
    };
    const consumed = apply(saved, action);
    const restored: DemoState = JSON.parse(JSON.stringify(consumed));
    expect(apply(restored, action)).toBe(restored);
  });
  it("DA09 / T0109 UI exposes request preview/cancel, authorized decision reason and one-time application", () => {
    const s = fresh();
    render(<Harness initial={s} mode="discount" />);
    change("超权限申请原因", "合成团购申请");
    click("预览折扣申请");
    dialogClick("取消折扣申请");
    expect(current().records.discountApprovals).toBeUndefined();
    click("预览折扣申请");
    dialogClick("确认提交折扣申请");
    const id = current().records.discountApprovals[0].id;
    expect(screen.getByLabelText("折扣审批记录")).toHaveTextContent("待审核");
    expect(
      screen.getByRole("button", { name: `批准折扣 ${id}` }),
    ).toBeDisabled();
    change("测试角色", "finance");
    click(`批准折扣 ${id}`);
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认审批处理",
      }),
    ).toBeDisabled();
    change("折扣审批处理原因", "合成复核通过");
    dialogClick("确认审批处理");
    expect(screen.getByLabelText("折扣审批记录")).toHaveTextContent(
      "已批准待应用",
    );
    click(`应用折扣 ${id}`);
    expect(screen.getByLabelText("折扣审批记录")).toHaveTextContent(
      "授权已消费",
    );
    expect(
      screen.queryByRole("button", { name: `应用折扣 ${id}` }),
    ).not.toBeInTheDocument();
  });
  it("DA10 / T0109 UI rejection cancellation does not decide; confirmed reason is displayed", () => {
    const initial = apply(fresh(), request(fresh()));
    initial.config.role = "finance";
    render(<Harness initial={initial} mode="discount" />);
    click("驳回折扣 DISC-001");
    change("折扣审批处理原因", "合成拒绝原因");
    dialogClick("取消审批处理");
    expect(current().records.discountApprovals[0].status).toBe("pending");
    click("驳回折扣 DISC-001");
    change("折扣审批处理原因", "合成拒绝原因");
    dialogClick("确认审批处理");
    expect(screen.getByLabelText("折扣审批记录")).toHaveTextContent("已驳回");
    expect(screen.getByLabelText("折扣审批记录")).toHaveTextContent(
      "合成拒绝原因",
    );
  });
});
