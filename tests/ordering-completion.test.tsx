import { describe, it, expect, vi } from "vitest";
import { useReducer } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  createInitialState,
  reducer,
  type DemoState,
  type Action,
} from "../src/model";
import { DemoProvider, useDemo } from "../src/store";
import { quoteOrder, getOrderRules } from "../src/orderingRules";
import {
  appointmentFingerprint,
  pricingCatalogSignature,
  reduceBatchOrderingAction,
  createBatchOrderPlan,
  previewBatchOrders,
} from "../src/batchOrderingRules";
import {
  syntheticIdentityCheck,
  makeSyntheticIdentity,
  resolveGroupImportRow,
  validateCampusItems,
  validateGroupOrderBooking,
  groupPackageChoices,
} from "../src/groupImportRules";
import {
  queryOrders,
  orderItemRows,
  orderFlowEvents,
  ORDER_FLOW_STATES,
  canUnlockOrder,
  reduceOrderProgressAction,
  previewThirdPartyOrder,
} from "../src/orderProgressRules";
import {
  OrderItemProgress,
  OrderSearchDesk,
  ThirdPartyOrderImport,
} from "../src/modules/OrderProgress";
import {
  RegistrationProfile,
  CERTIFICATE_TYPES,
} from "../src/modules/Registration";
import {
  GroupPackageBrowser,
  OrderingConfiguration,
} from "../src/modules/OrderingConfiguration";
const fresh = () => {
  const s = createInitialState();
  s.config.role = "admin";
  s.config.campus = "中心院区";
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
  }));
  return s;
};
const groupState = () => {
  const s = fresh();
  s.records.groupOrders = [
    {
      id: "G1",
      name: "合成合同一",
      company: s.patients[0].company,
      status: "生效",
      startDate: "2026-10-13",
      endDate: "2026-12-31",
      packages: ["PK01"],
      members: [s.patients[0].id],
      mode: "限额",
      budget: 399,
      optionalItems: [],
      choose: 0,
    },
    {
      id: "G2",
      name: "同单位合同二",
      company: s.patients[0].company,
      status: "生效",
      packages: ["PK01"],
      members: [s.patients[0].id],
      mode: "限额",
      budget: 399,
    },
  ];
  s.records.groupPersonnelGroups = [
    {
      id: "PG1",
      groupOrderId: "G1",
      name: "合成组甲",
      members: [s.patients[0].id],
      packageId: "PK01",
    },
    {
      id: "PG2",
      groupOrderId: "G2",
      name: "合成组乙",
      members: [s.patients[2].id],
      packageId: "PK01",
    },
  ];
  return s;
};
const apply = (s: DemoState, a: Action) =>
  reduceOrderProgressAction(s, a) ??
  reduceBatchOrderingAction(s, a) ??
  reducer(s, a);
const itemAction = (s: DemoState, patch: Record<string, any> = {}) => ({
  type: "ORDER_ITEM_ACTION",
  payload: {
    id: "I1",
    appointmentId: s.appointments[0].id,
    expected: appointmentFingerprint(s.appointments[0]),
    item: s.appointments[0].items[1],
    operation: "start",
    reason: "合成项目登记",
    ...patch,
  },
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
function Harness({
  initial,
  mode = "item",
}: {
  initial: DemoState;
  mode?: string;
}) {
  const [s, act] = useReducer(apply, initial);
  return (
    <>
      {mode === "item" ? (
        <OrderItemProgress
          state={s}
          act={act}
          appointmentId={s.appointments[0].id}
        />
      ) : mode === "query" ? (
        <OrderSearchDesk state={s} act={act} />
      ) : mode === "third" ? (
        <ThirdPartyOrderImport state={s} act={act} />
      ) : (
        <OrderingConfiguration state={s} act={act} />
      )}
      <pre data-testid="state">{JSON.stringify(s)}</pre>
    </>
  );
}
const current = (): DemoState =>
  JSON.parse(screen.getByTestId("state").textContent!);
function ProfileHarness() {
  const { state } = useDemo();
  return (
    <>
      <RegistrationProfile patientId="P001" />
      <pre data-testid="state">{JSON.stringify(state)}</pre>
    </>
  );
}
describe("ordering fixed completion scope", () => {
  it("OC01 / T0087 T0148 exact and fuzzy search cover campus, name, certificate, initials, company and order IDs", () => {
    const s = fresh();
    s.appointments[1].campus = "东院区";
    s.patients[0].certificate = "DEMO-SYNTH-001";
    s.patients[0].initials = "LZY";
    expect(queryOrders(s).map((a) => a.id)).toEqual([s.appointments[0].id]);
    expect(queryOrders(s, { campus: "all" })).toHaveLength(2);
    for (const q of [
      s.patients[0].name,
      "DEMO-SYNTH-001",
      "LZY",
      s.patients[0].company,
      s.appointments[0].id,
    ])
      expect(queryOrders(s, { query: q, match: "exact" })).toHaveLength(1);
    expect(queryOrders(s, { query: "SYNTH", match: "exact" })).toHaveLength(0);
    expect(queryOrders(s, { query: "synth", match: "fuzzy" })).toHaveLength(1);
  });
  it("OC02 / T0088 item campus restrictions apply to direct validation and batch submit", () => {
    const s = fresh();
    s.records.orderingRules = getOrderRules(s).map((r) => ({
      ...r,
      campuses: r.item === "骨密度" ? ["东院区"] : [],
    }));
    expect(validateCampusItems(s, ["骨密度"], "中心院区")).toEqual([
      "骨密度不适用中心院区",
    ]);
    const draft = {
      operation: "add" as const,
      appointmentIds: [s.appointments[0].id],
      items: ["骨密度"],
      reason: "合成加项",
    };
    expect(previewBatchOrders(s, draft)[0].eligible).toBe(false);
    const n = apply(s, {
      type: "BATCH_ORDER_APPLY",
      payload: createBatchOrderPlan(s, draft, "BC"),
    });
    expect(n.appointments[0].items).not.toContain("骨密度");
  });
  it("OC03 / T0093 every required independent certificate type persists and initials are saved", () => {
    render(
      <DemoProvider>
        <ProfileHarness />
      </DemoProvider>,
    );
    for (const type of CERTIFICATE_TYPES) {
      change("证件类型", type);
      click("保存客户基本资料");
      expect(
        current().patients.find((p) => p.id === "P001")?.certificateType,
      ).toBe(type);
    }
    change("客户姓名简拼", "lzy");
    click("保存客户基本资料");
    expect(current().patients.find((p) => p.id === "P001")?.initials).toBe(
      "LZY",
    );
  });
  it("OC04 / T0095 preset and custom reader selection persists in shared config", () => {
    render(
      <DemoProvider>
        <ProfileHarness />
      </DemoProvider>,
    );
    change("当前模拟读卡器", "DEMO-DUAL-B");
    click("保存读卡器选择");
    expect(current().config.cardReaderModel).toBe("DEMO-DUAL-B");
    change("自定义读卡器型号", "红创合成便携型");
    click("新增模拟读卡器型号");
    click("保存读卡器选择");
    expect(current().records.cardReaderModels[0].name).toBe("红创合成便携型");
    expect(current().config.cardReaderModel).toBe(
      current().records.cardReaderModels[0].id,
    );
  });
  it("OC05 / T0102 new customer/order types and rename update mapping while preserving identities", () => {
    render(
      <DemoProvider>
        <ProfileHarness />
      </DemoProvider>,
    );
    change("类型名称", "合成VIP客户");
    click("保存自定义类型");
    const id = current().records.customerTypes.find(
      (t) => t.name === "合成VIP客户",
    ).id;
    change("类型类别", "order");
    change("类型名称", "合成VIP订单");
    click("保存自定义类型");
    change("映射客户类型", id);
    change("映射订单类型", "合成VIP订单");
    click("保存类型映射");
    expect(
      current().records.customerTypes.find((t) => t.id === id).orderType,
    ).toBe("合成VIP订单");
    change("维护目标类型", current().records.orderTypes[0].id);
    change("类型名称", "合成VIP新订单");
    click("保存自定义类型");
    expect(
      current().records.customerTypes.find((t) => t.id === id).orderType,
    ).toBe("合成VIP新订单");
  });
  it("OC06 / T0108 synthetic password activation is exact, bounded, order-bound and consumed once", () => {
    const s = fresh(),
      payload = {
        id: "CODE1",
        appointmentId: s.appointments[0].id,
        expected: appointmentFingerprint(s.appointments[0]),
        code: "bad",
      };
    expect(apply(s, { type: "DISCOUNT_CODE_UNLOCK", payload })).toBe(s);
    const unlocked = apply(s, {
      type: "DISCOUNT_CODE_UNLOCK",
      payload: { ...payload, code: "DEMO-DISCOUNT-85" },
    });
    expect(unlocked.records.discountCodeAuthorizations[0].status).toBe(
      "active",
    );
    const action = {
      type: "DISCOUNT_CODE_APPLY",
      payload: {
        id: "CODE1",
        appointmentId: s.appointments[0].id,
        percent: 80,
      },
    };
    expect(apply(unlocked, action)).toBe(unlocked);
    const next = apply(unlocked, {
      ...action,
      payload: { ...action.payload, percent: 85 },
    });
    expect(next.appointments[0].appliedDiscount).toBe(85);
    expect(next.records.discountCodeAuthorizations[0].status).toBe("consumed");
    expect(apply(next, action)).toBe(next);
  });
  it("OC07 / T0131 importer auto matches personnel group/package and reports cross-group error with line", () => {
    const s = groupState(),
      row = {
        name: s.patients[0].name,
        identity: "DEMO-P001",
        group: "",
        packageName: "",
        date: "2026-10-15",
        line: 3,
      };
    expect(resolveGroupImportRow(s, row, { groupOrderId: "G1" })).toMatchObject(
      {
        patientId: "P001",
        packageId: "PK01",
        groupPersonnelId: "PG1",
        groupOrderId: "G1",
        errors: [],
      },
    );
    expect(
      resolveGroupImportRow(
        s,
        { ...row, group: "合成组乙" },
        { groupOrderId: "G1" },
      ).errors.join(),
    ).toMatch(/第 3 行.*不属于/);
  });
  it("OC08 / T0133 synthetic identity checks shape, date and independently known checksum without real IDs", () => {
    expect(makeSyntheticIdentity()).toBe("SYNTHETIC-999999199001010016");
    expect(syntheticIdentityCheck("SYNTHETIC-999999199001010016")).toEqual([]);
    expect(
      syntheticIdentityCheck("SYNTHETIC-999999199001010010").join(),
    ).toContain("校验位");
    expect(
      syntheticIdentityCheck("SYNTHETIC-999999199002310019").join(),
    ).toContain("日期");
    expect(syntheticIdentityCheck("110000199001010000").join()).toContain(
      "不接受真实",
    );
  });
  it("OC09 / T0135 special blank identity creates stable synthetic personnel key and normal mode rejects", () => {
    const s = groupState(),
      row = {
        name: "纯合成人员甲",
        identity: "",
        group: "",
        packageName: "PK01",
        date: "2026-10-15",
        line: 5,
      };
    expect(
      resolveGroupImportRow(s, row, { identityMode: "demo" }).errors[0],
    ).toContain("第 5 行");
    const one = resolveGroupImportRow(s, row, {
        identityMode: "special-empty",
        company: "合成单位",
      }),
      two = resolveGroupImportRow(s, row, {
        identityMode: "special-empty",
        company: "合成单位",
      });
    expect(one.errors).toEqual([]);
    expect(one.patientId).toBe(two.patientId);
    expect(one.newPatient?.certificate).toBe("");
    expect(one.syntheticPersonnelKey).toBe(one.patientId);
  });
  it("OC10 / T0137 internal swap recalculates exact quote and unit budget/personal difference", () => {
    const s = groupState();
    s.appointments[0].groupOrderId = "G1";
    const draft = {
      operation: "swap" as const,
      appointmentIds: [s.appointments[0].id],
      items: ["骨密度"],
      removeItems: ["血脂四项"],
      reason: "合成内部换项",
    };
    const p = createBatchOrderPlan(s, draft, "SWAP");
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: p });
    expect(
      next.records.orderBatches[0].success,
      JSON.stringify(next.records.orderBatches[0]),
    ).toBe(1);
    expect(next.appointments[0].items).not.toContain("血脂四项");
    expect(next.appointments[0].items).toContain("骨密度");
    expect(next.appointments[0].groupSplit.unit).toBe(399);
    expect(next.appointments[0].groupSplit.personal).toBeCloseTo(
      next.appointments[0].amount - 399,
      2,
    );
  });
  it("OC11 / T0143 third-party synthetic import creates real booked source and rejects duplicate/capacity/stale payload", () => {
    const s = fresh(),
      draft = {
        id: "TH-1",
        externalId: "DEMO-THIRD-ONE",
        patientId: "P004",
        packageId: "PK01",
        date: "2026-10-15",
        time: "08:00",
        campus: "中心院区",
      };
    const p = previewThirdPartyOrder(s, draft);
    expect(p.errors).toEqual([]);
    const a = {
        type: "ORDER_THIRD_PARTY_IMPORT",
        payload: { ...draft, expected: p.signature },
      },
      next = apply(s, a);
    expect(next.appointments[0]).toMatchObject({
      id: "TH-1",
      sourceClass: "第三方预约",
    });
    expect(queryOrders(next, { source: "第三方预约" })).toHaveLength(1);
    expect(apply(next, a)).toBe(next);
    s.records.bookingResourceLimits = [
      {
        id: "LIMIT",
        kind: "package",
        resourceId: "PK01",
        dailyCapacity: 0,
        enabled: true,
      },
    ];
    expect(previewThirdPartyOrder(s, draft).errors.join()).toMatch(/套餐|预约/);
  });
  it("OC12 / T0152 T0249 result-driven project state distinguishes unstarted, in-progress, registered and received report", () => {
    let s = fresh();
    s.appointments[0].status = "checked";
    const item = s.appointments[0].items[1];
    s = apply(s, itemAction(s));
    expect(
      orderItemRows(s, s.appointments[0]).find((r) => r.item === item)?.state,
    ).toBe("检查中");
    expect(
      orderItemRows(s, s.appointments[0]).filter((r) => r.state === "未执行")
        .length,
    ).toBeGreaterThan(0);
    s.appointments[0].results[item] = "合成检查结果";
    expect(
      orderItemRows(s, s.appointments[0]).find((r) => r.item === item)?.state,
    ).toBe("已完成");
    s = apply(
      s,
      itemAction(s, {
        id: "I2",
        operation: "report_received",
        reference: "DEMO-REPORT-1",
      }),
    );
    expect(
      orderItemRows(s, s.appointments[0]).find((r) => r.item === item)?.state,
    ).toBe("已收到报告");
    expect(queryOrders(s, { itemState: "已收到报告" })).toHaveLength(1);
  });
  it("OC13 / T0177 per-item reschedule and confirmation do not move other items/order or create result", () => {
    let s = fresh();
    s.appointments[0].status = "checked";
    s = apply(
      s,
      itemAction(s, { operation: "reschedule", date: "2026-10-20" }),
    );
    expect(s.appointments[0].date).toBe("2026-10-15");
    expect(
      orderItemRows(s, s.appointments[0]).filter(
        (r) => r.rescheduleDate === "2026-10-20",
      ),
    ).toHaveLength(1);
    s = apply(
      s,
      itemAction(s, {
        id: "CONF",
        operation: "confirm",
        confirmation: "待回传",
      }),
    );
    expect(s.appointments[0].results).toEqual({});
    expect(s.records.orderItemEvents[0].confirmation).toBe("待回传");
    const action = itemAction(s, {
      id: "REPEAT",
      operation: "confirm",
      confirmation: "待回传",
    });
    expect(apply(s, action)).toBe(s);
  });
  it("OC14 / T0177 locked, reviewed, already resulted and required projects cannot be waived or rescheduled", () => {
    const s = fresh();
    s.appointments[0].status = "checked";
    s.appointments[0].locked = true;
    expect(apply(s, itemAction(s))).toBe(s);
    s.appointments[0].locked = false;
    s.appointments[0].results[s.appointments[0].items[1]] = "合成结果";
    expect(apply(s, itemAction(s, { operation: "waive" }))).toBe(s);
    const first = s.appointments[0].items[0];
    s.records.orderingRules = getOrderRules(s).map((r) => ({
      ...r,
      required: r.item === first,
    }));
    expect(apply(s, itemAction(s, { item: first, operation: "waive" }))).toBe(
      s,
    );
  });
  it("OC15 / T0154 T0170 range uses selected real date field and lists only missing projects", () => {
    const s = fresh();
    s.appointments[0].createdAt = "2026-10-10T12:00:00Z";
    s.appointments[0].checkedAt = "2026-10-12T12:00:00Z";
    s.appointments[0].results = Object.fromEntries(
      s.appointments[0].items.map((i) => [i, "合成结果"]),
    );
    expect(
      queryOrders(s, {
        dateField: "created",
        start: "2026-10-10",
        end: "2026-10-10",
      }),
    ).toHaveLength(1);
    expect(
      queryOrders(s, {
        dateField: "checked",
        start: "2026-10-10",
        end: "2026-10-10",
      }),
    ).toHaveLength(0);
    expect(
      queryOrders(s, {
        dateField: "appointment",
        start: "2026-10-15",
        end: "2026-10-15",
        missingOnly: true,
      }).map((a) => a.id),
    ).toEqual([s.appointments[1].id]);
  });
  it("OC16 / T0182 configured unlock permission is checked with role/scope and structured audit", () => {
    let s = fresh();
    s.config.role = "reception";
    s.appointments[0].locked = true;
    const unlock = () => ({
      type: "ORDER_UNLOCK",
      payload: {
        id: "UN",
        appointmentId: s.appointments[0].id,
        expected: appointmentFingerprint(s.appointments[0]),
        reason: "合成解禁",
      },
    });
    expect(canUnlockOrder(s, s.appointments[0])).toBe(false);
    expect(apply(s, unlock())).toBe(s);
    s = { ...s, config: { ...s.config, role: "admin" } };
    s = apply(s, {
      type: "ORDER_UNLOCK_CONFIGURE",
      payload: { id: "CFG", roles: ["admin", "reception"] },
    });
    s.config.role = "reception";
    const next = apply(s, unlock());
    expect(next.appointments[0].locked).toBe(false);
    expect(next.audit[0]).toMatchObject({
      action: "ORDER_UNLOCK",
      before: { locked: true },
      after: { locked: false },
    });
  });
  it("OC17 / T0479 unit packages first and explicit all view marks outside package fully personal", () => {
    const s = groupState(),
      only = groupPackageChoices(s, "P001", "中心院区", "G1", false),
      all = groupPackageChoices(s, "P001", "中心院区", "G1", true);
    expect(only.map((p) => p.id)).toEqual(["PK01"]);
    expect(all[0].unitCovered).toBe(true);
    expect(all.filter((p) => p.id !== "PK01").every((p) => p.personalPay)).toBe(
      true,
    );
    const select = vi.fn();
    render(
      <GroupPackageBrowser
        state={s}
        patientId="P001"
        campus="中心院区"
        groupOrderId="G1"
        onSelect={select}
      />,
    );
    fireEvent.click(screen.getByLabelText("查看全部套餐"));
    const target = all.find((p) => p.personalPay && p.available)!;
    click(`选择浏览套餐${target.id}`);
    expect(select).toHaveBeenCalledWith(target.id, true);
  });
  it("OC18 / T0483 same-company contracts keep separate schedule dates/times and capacity", () => {
    const s = groupState();
    s.records.groupOrderBookingRules = [
      {
        id: "S1",
        groupOrderId: "G1",
        startDate: "2026-10-15",
        endDate: "2026-10-15",
        dailyCapacity: 1,
        allowedTimes: "08:00",
        enabled: true,
      },
      {
        id: "S2",
        groupOrderId: "G2",
        startDate: "2026-10-16",
        endDate: "2026-10-16",
        dailyCapacity: 2,
        allowedTimes: "09:00",
        enabled: true,
      },
    ];
    const input = {
      patientId: "P001",
      date: "2026-10-15",
      time: "08:00",
      packageIds: ["PK01"],
      items: s.appointments[0].items,
    };
    expect(validateGroupOrderBooking(s, "G1", input)).toEqual([]);
    expect(validateGroupOrderBooking(s, "G2", input).join()).toContain(
      "仅可预约",
    );
    s.appointments[0].groupOrderId = "G1";
    expect(validateGroupOrderBooking(s, "G1", input).join()).toContain(
      "独立日容量",
    );
    expect(
      validateGroupOrderBooking(s, "G2", {
        ...input,
        date: "2026-10-16",
        time: "09:00",
      }),
    ).toEqual([]);
  });
  it("OC19 / T0177 preview cancel leaves state intact, confirmed single item change persists", () => {
    const s = fresh();
    s.appointments[0].status = "checked";
    render(<Harness initial={s} />);
    change("项目动作", "reschedule");
    change("项目改期日期", "2026-10-20");
    change("项目操作原因", "合成改期");
    click("预览项目操作");
    click("取消项目操作");
    expect(current().records.orderItemEvents).toBeUndefined();
    click("预览项目操作");
    click("确认项目操作");
    expect(current().records.orderItemEvents[0].date).toBe("2026-10-20");
  });
  it("OC20 / T0162 simulated identity fills saved bounded history search with no physical reader", () => {
    const s = fresh();
    render(<Harness initial={s} mode="query" />);
    change("刷卡历史开始", "2026-10-15");
    change("刷卡历史结束", "2026-10-15");
    click("模拟刷证件并查询");
    expect(screen.getByLabelText("订单检索词")).toHaveValue("DEMO-P001");
    expect(current().config.cardHistoryStart).toBe("2026-10-15");
    expect(screen.getByText(/匹配 1 单/)).toBeInTheDocument();
  });
  it("OC21 / T0153 real four-node review events cover starts/passes/returns and never fabricate unvisited nodes", () => {
    let s = fresh();
    const a = s.appointments[0];
    expect(ORDER_FLOW_STATES).toHaveLength(22);
    expect(orderFlowEvents(s, a).some((e) => e.label === "终审完成")).toBe(
      false,
    );
    s = apply(s, {
      type: "ORDER_REVIEW_CONFIGURE",
      payload: {
        id: "FOUR",
        appointmentId: a.id,
        expected: appointmentFingerprint(a),
      },
    });
    s.appointments[0].status = "review";
    s.appointments[0].results = Object.fromEntries(
      a.items.map((i) => [i, "合成结果"]),
    );
    for (let stage = 0; stage < 4; stage++) {
      s = apply(s, {
        type: "ORDER_REVIEW_START",
        payload: {
          id: `START${stage}`,
          appointmentId: a.id,
          expected: appointmentFingerprint(s.appointments[0]),
          reason: "合成审核开始",
        },
      });
      s = reducer(s, {
        type: "REVIEW",
        payload: {
          id: a.id,
          expectedStage: stage,
          doctor: "周医生",
          conclusion: "合成审核",
        },
      });
      expect(s.appointments[0].reviewStage).toBe(stage + 1);
    }
    for (const node of ["初审", "主检", "总检", "终审"]) {
      expect(
        orderFlowEvents(s, s.appointments[0]).some(
          (e) => e.label === `${node}中`,
        ),
      ).toBe(true);
      expect(
        orderFlowEvents(s, s.appointments[0]).some(
          (e) => e.label === `${node}完成`,
        ),
      ).toBe(true);
    }
    s = apply(s, {
      type: "ORDER_UNLOCK",
      payload: {
        id: "UNLOCK-REVIEW",
        appointmentId: a.id,
        expected: appointmentFingerprint(s.appointments[0]),
        reason: "合成审核更正",
      },
    });
    s = apply(s, {
      type: "ORDER_REVIEW_RETURN",
      payload: {
        id: "RETURN",
        appointmentId: a.id,
        expected: appointmentFingerprint(s.appointments[0]),
        target: "主检",
        reason: "合成重核",
      },
    });
    expect(s.appointments[0].reviewStage).toBe(1);
    expect(queryOrders(s, { flow: "驳回至主检" })).toHaveLength(1);
  });
  it("OC22 / T0143 third-party import UI cancellation does not create order", () => {
    const s = fresh();
    render(<Harness initial={s} mode="third" />);
    change("第三方预约日期", "2026-10-15");
    click("预览第三方导入");
    click("取消第三方导入");
    expect(current().appointments).toHaveLength(2);
    click("预览第三方导入");
    click("确认第三方导入");
    expect(current().appointments).toHaveLength(3);
  });
  it("OC23 final resource capacity is rechecked sequentially for batch and changed resource config invalidates quote", () => {
    const s = fresh();
    s.records.bookingResourceLimits = [
      {
        id: "LIMIT",
        kind: "item",
        resourceId: "骨密度",
        dailyCapacity: 1,
        enabled: true,
      },
    ];
    const plan = createBatchOrderPlan(
      s,
      {
        operation: "add",
        appointmentIds: s.appointments.map((a) => a.id),
        items: ["骨密度"],
        reason: "合成有限容量",
      },
      "LIMIT-BATCH",
    );
    const next = apply(s, { type: "BATCH_ORDER_APPLY", payload: plan });
    expect(next.records.orderBatches[0]).toMatchObject({
      success: 1,
      failed: 1,
    });
    expect(
      next.appointments.filter((a) => a.items.includes("骨密度")),
    ).toHaveLength(1);
    expect(
      pricingCatalogSignature({
        ...s,
        records: { ...s.records, bookingResourceLimits: [] },
      }),
    ).not.toBe(pricingCatalogSignature(s));
  });
  it("OC24 / T0153 retains completed review events after the live history is reset by rejection", () => {
    const s = fresh(),
      a = s.appointments[0];
    s.audit = [
      {
        id: "R1",
        action: "REVIEW",
        entity: a.id,
        time: "2026-10-13T08:00:00Z",
        before: { reviewStage: 0 },
        after: {
          reviewStage: 1,
          reviewHistory: [
            {
              node: "初审",
              status: "已通过",
              completedAt: "2026-10-13T08:00:00Z",
            },
          ],
        },
      },
      {
        id: "R2",
        action: "REJECT",
        entity: a.id,
        time: "2026-10-13T08:01:00Z",
        before: { status: "review" },
        after: { status: "in_exam", reviewHistory: [] },
      },
    ];
    a.reviewHistory = [];
    expect(orderFlowEvents(s, a).map((e) => e.label)).toContain("初审完成");
    expect(orderFlowEvents(s, a).map((e) => e.label)).toContain("检查被驳回");
    expect(queryOrders(s, { flow: "初审完成" })).toHaveLength(1);
  });
  it("OC25 / T0152 manual received-report evidence distinguishes unreturned from unfinished and preserves reschedule date", () => {
    let s = fresh();
    s.appointments[0].status = "checked";
    s = apply(
      s,
      itemAction(s, { operation: "reschedule", date: "2026-10-20" }),
    );
    s = apply(
      s,
      itemAction(s, {
        id: "RCV",
        operation: "report_received",
        reference: "DEMO-REPORT",
      }),
    );
    const row = orderItemRows(s, s.appointments[0]).find(
      (r) => r.item === s.appointments[0].items[1],
    )!;
    expect(row).toMatchObject({
      unfinished: true,
      unreturned: false,
      rescheduleDate: "2026-10-20",
      reference: "DEMO-REPORT",
    });
    expect(s.appointments[0].results).toEqual({});
  });
  it("OC26 / T0153 respects disabled global initial review when order has no node snapshot", () => {
    let s = fresh();
    s.config.initialReviewEnabled = false;
    s.appointments[0].status = "review";
    s = apply(s, {
      type: "ORDER_REVIEW_START",
      payload: {
        id: "MAIN-START",
        appointmentId: s.appointments[0].id,
        expected: appointmentFingerprint(s.appointments[0]),
        reason: "合成主检开始",
      },
    });
    expect(s.appointments[0].stageStartedAt["主检"]).toBeTruthy();
    expect(s.appointments[0].stageStartedAt["初审"]).toBeUndefined();
    expect(orderFlowEvents(s, s.appointments[0]).map((e) => e.label)).toContain(
      "主检中",
    );
  });
});
