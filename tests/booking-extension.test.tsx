// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Patient from "../src/modules/Patient";
import {
  GroupContractWorkbench,
  groupForBooking,
  groupDiscountPercent,
} from "../src/modules/Groups";
import { OrderingRuleEditor } from "../src/modules/Ordering";
import { createInitialState, reducer } from "../src/model";
import { DemoProvider, useDemo } from "../src/store";
import {
  getItemClassification,
  getPackageOptionalBundles,
  normalizeOrderItems,
  packageAvailableAtCampus,
  quoteOrder,
} from "../src/orderingRules";
const STORAGE = "hongchuang.health.demo.v1";
function Probe() {
  const { state } = useDemo();
  return (
    <pre hidden data-testid="extension-state">
      {JSON.stringify(state)}
    </pre>
  );
}
function read() {
  return JSON.parse(screen.getByTestId("extension-state").textContent || "{}");
}
function setup(
  state = createInitialState(),
  component: "patient" | "ordering" | "group" = "patient",
  hash = "#/patient",
) {
  localStorage.setItem(STORAGE, JSON.stringify(state));
  window.history.replaceState({}, "", hash);
  return render(
    <DemoProvider>
      {component === "patient" ? (
        <Patient />
      ) : component === "ordering" ? (
        <OrderingRuleEditor />
      ) : (
        <GroupContractWorkbench />
      )}
      <Probe />
    </DemoProvider>,
  );
}
function click(name: string | RegExp) {
  fireEvent.click(
    screen.getByRole("button", { name, exact: typeof name === "string" }),
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function consent() {
  fireEvent.click(
    screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
  );
}
function emptyState() {
  const s = createInitialState();
  s.appointments = [];
  return s;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("A组分类、院区与套餐自选包", () => {
  it("T0021 医院分类配置被患者筛选与加项计价消费", () => {
    const s = emptyState();
    s.records.orderingRules = [
      { id: "base", item: "一般检查", price: 99, required: true },
      {
        id: "x",
        item: "合成部位项目",
        price: 0,
        bodyPart: "演示头颈",
        diseaseType: "演示类别甲",
      },
    ];
    setup(s);
    click("开启健康计划");
    change("按检查部位添加", "演示头颈");
    change("按疾病类型添加", "演示类别甲");
    expect(screen.queryByLabelText(/甲状腺彩超/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/合成部位项目/));
    consent();
    click("确认预约");
    expect(read().appointments[0].items).toContain("合成部位项目");
    expect(read().appointments[0].amount).toBe(399);
    expect(getItemClassification(s, "合成部位项目")).toEqual({
      bodyPart: "演示头颈",
      diseaseType: "演示类别甲",
    });
  });
  it("T0021 分类维护不会复活停用项目或丢失规则开关", () => {
    const s = emptyState();
    s.records.orderingRules = [
      {
        id: "x",
        item: "合成项目",
        price: 30,
        bodyPart: "旧部位",
        diseaseType: "旧类型",
        enabled: false,
        ruleEnabled: false,
      },
    ];
    setup(s, "ordering");
    click("载入编辑");
    change("检查部位", "新部位");
    change("疾病类型", "新类型");
    click("保存并应用项目规则");
    expect(read().records.orderingRules[0]).toMatchObject({
      bodyPart: "新部位",
      diseaseType: "新类型",
      enabled: false,
      ruleEnabled: false,
    });
  });
  it("T0023 院区切换会失效旧套餐选择且仅显示对应院区套餐", () => {
    const s = emptyState();
    s.records.packageRules = [
      { id: "PKR1", packageId: "PK01", campuses: ["中心院区"] },
      { id: "PKR2", packageId: "PK02", campuses: ["东院区"] },
      { id: "PKR3", packageId: "PK03", onlineEnabled: false },
      { id: "PKR4", packageId: "PK04", onlineEnabled: false },
    ];
    setup(s);
    click("开启健康计划");
    expect(screen.queryByRole("button", { name: /都市精英体检/ })).toBeNull();
    change("就诊院区", "东院区");
    expect(screen.queryByRole("button", { name: /基础安心体检/ })).toBeNull();
    consent();
    click("确认预约");
    expect(read().appointments).toHaveLength(0);
    click(/都市精英体检/);
    click("确认预约");
    expect(read().appointments[0]).toMatchObject({
      campus: "东院区",
      packageId: "PK02",
    });
    expect(packageAvailableAtCampus(s, "PK01", "东院区")).toBe(false);
  });
  it("T0023/T0482 套餐配置加载并保留线上开关和独立自选包", () => {
    const s = emptyState();
    s.records.packageRules = [
      {
        id: "PERSIST",
        packageId: "PK02",
        onlineEnabled: false,
        campuses: ["东院区"],
        optionalItems: ["合成甲"],
        choose: 1,
        custom: "保留",
      },
    ];
    setup(s, "ordering");
    change("规则套餐", "PK02");
    expect(screen.getByLabelText("东院区")).toBeChecked();
    change("套餐自选项目（以顿号、逗号或换行分隔）", "合成甲、合成甲、合成乙");
    change("套餐自选项目必选数", "3");
    click("保存并应用套餐规则");
    expect(read().records.packageRules[0].optionalItems).toEqual(["合成甲"]);
    change("套餐自选项目必选数", "2");
    click("保存并应用套餐规则");
    expect(read().records.packageRules[0]).toMatchObject({
      id: "PERSIST",
      onlineEnabled: false,
      campuses: ["东院区"],
      optionalItems: ["合成甲", "合成乙"],
      choose: 2,
      custom: "保留",
    });
  });
  it("T0482 切换套餐只带出该套餐自选包，旧选择不能混入新单", () => {
    const s = emptyState();
    s.records.packageRules = [
      { id: "B1", packageId: "PK01", optionalItems: ["合成包甲"], choose: 1 },
      { id: "B2", packageId: "PK02", optionalItems: ["合成包乙"], choose: 1 },
    ];
    setup(s);
    click("开启健康计划");
    fireEvent.click(screen.getByLabelText("基础安心体检自选包：合成包甲"));
    click(/都市精英体检/);
    expect(screen.queryByLabelText("基础安心体检自选包：合成包甲")).toBeNull();
    consent();
    click("确认预约");
    expect(read().appointments).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("都市精英体检自选包：合成包乙"));
    click("确认预约");
    expect(read().appointments[0].items).toContain("合成包乙");
    expect(read().appointments[0].items).not.toContain("合成包甲");
    expect(read().appointments[0].amount).toBe(979);
  });
  it("T0482 多套餐各自满足必选数，共同自选项目只计一次费用", () => {
    const s = emptyState();
    s.config.packageChooseCount = 2;
    s.records.packageRules = [
      { id: "B1", packageId: "PK01", optionalItems: ["合成共享项"], choose: 1 },
      { id: "B2", packageId: "PK02", optionalItems: ["合成共享项"], choose: 1 },
    ];
    s.records.orderingRules = [
      { id: "base", item: "一般检查", required: true, price: 99 },
      { id: "shared", item: "合成共享项", price: 50 },
    ];
    setup(s);
    click("开启健康计划");
    click(/都市精英体检/);
    fireEvent.click(screen.getByLabelText("基础安心体检自选包：合成共享项"));
    consent();
    click("确认预约");
    expect(read().appointments).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("都市精英体检自选包：合成共享项"));
    click("确认预约");
    expect(
      read().appointments[0].items.filter(
        (item: string) => item === "合成共享项",
      ),
    ).toHaveLength(1);
    expect(read().appointments[0].amount).toBe(949);
    expect(read().appointments[0].packageOptionalSelections).toEqual({
      PK01: ["合成共享项"],
      PK02: ["合成共享项"],
    });
    expect(getPackageOptionalBundles(s, ["PK01", "PK02"])).toHaveLength(2);
  });
});

describe("A组亲属单位权益", () => {
  function relativeState(payment = "self") {
    const s = emptyState();
    s.records.groupOrders = [
      {
        id: "REL",
        company: "星辰科技",
        name: "合成亲属权益",
        mode: "限额自选",
        budget: 200,
        packages: ["PK01"],
        relativePackages: ["PK02"],
        discount: 80,
        relativeDiscount: 50,
        relativePayment: payment,
        packageChooseCount: 1,
        optionalItems: [],
        choose: 0,
        members: ["P001"],
        status: "生效",
        startDate: "2026-01-01",
        endDate: "2027-12-31",
      },
    ];
    s.records.packageRules = [
      { id: "REL-PACK", packageId: "PK02", company: "星辰科技" },
    ];
    return s;
  }
  function chooseRelative() {
    fireEvent.click(screen.getByLabelText("亲属预约（单位折扣及承担规则）"));
    change("体检人", "P004");
    click(/都市精英体检/);
    consent();
    click("确认预约");
  }
  it("T0037 非单位亲属关联有效员工后使用专属套餐和单位折扣", () => {
    const s = relativeState();
    const expected = quoteOrder(s, ["PK02"], 50).amount;
    setup(s, "patient", "#/patient?group=xingchen-2026");
    chooseRelative();
    expect(read().appointments[0]).toMatchObject({
      patientId: "P004",
      sponsorPatientId: "P001",
      relativeBooking: true,
      packageId: "PK02",
      amount: expected,
      groupDiscount: 50,
      groupSplit: { unit: 0, personal: expected },
    });
  });
  it("T0039 单位承担策略按折后金额及预算拆分，非全部自动免费", () => {
    const s = relativeState("unit");
    const expected = quoteOrder(s, ["PK02"], 50).amount;
    setup(s, "patient", "#/patient?group=xingchen-2026");
    chooseRelative();
    expect(read().appointments[0].groupSplit).toEqual({
      unit: 200,
      personal: expected - 200,
    });
    expect(read().appointments[0].selfPay).toBe(expected - 200);
  });
  it("T0037 亲属不能用自己作员工担保或关联名单外员工", () => {
    const s = relativeState();
    expect(
      groupForBooking(s, "P001", "2026-10-13", {
        relative: true,
        sponsorPatientId: "P001",
        company: "星辰科技",
      }),
    ).toBeUndefined();
    expect(
      groupForBooking(s, "P004", "2026-10-13", {
        relative: true,
        sponsorPatientId: "P003",
        company: "星辰科技",
      }),
    ).toBeUndefined();
    expect(
      groupForBooking(s, "P004", "2026-10-13", {
        relative: true,
        sponsorPatientId: "P001",
        company: "星辰科技",
      })?.packages,
    ).toEqual(["PK02"]);
    expect(groupDiscountPercent({ discount: 0 })).toBe(0);
    expect(groupDiscountPercent({ relativeDiscount: 0 }, true)).toBe(0);
  });
  it("T0037/T0039 单位编辑器保存亲属折扣付款策略及独立套餐", () => {
    const s = relativeState();
    setup(s, "group");
    click(/星辰科技 · 合成亲属权益/);
    change("单位执行折扣（%）", "75");
    change("亲属执行折扣（%）", "0");
    change("亲属付款策略", "unit");
    click("保存生效单位订单");
    expect(read().records.groupOrders[0]).toMatchObject({
      discount: 75,
      relativeDiscount: 0,
      relativePayment: "unit",
      relativePackages: ["PK02"],
    });
  });
});

describe("A组自动过滤规则与价格", () => {
  it("T0113 重复与互斥自动整理，必检优先且保留理由", () => {
    const s = emptyState();
    s.records.orderingRules = [
      { id: "req", item: "必检乙", required: true, price: 20 },
      { id: "a", item: "先选甲", excludes: "必检乙", price: 10 },
    ];
    const normalized = normalizeOrderItems(s, ["先选甲", "必检乙", "先选甲"]);
    expect(normalized.items).toEqual(["必检乙"]);
    expect(normalized.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: "先选甲",
          keptItem: "必检乙",
          reason: "与必检乙互斥，必检项目优先",
        }),
      ]),
    );
  });
  it("T0113 双必检互斥不能静默删除，依赖已删除项目也过滤并说明", () => {
    const s = emptyState();
    s.records.orderingRules = [
      { id: "a", item: "甲", required: true, excludes: "乙", price: 10 },
      { id: "b", item: "乙", required: true, price: 20 },
    ];
    expect(normalizeOrderItems(s, ["甲", "乙"]).errors[0]).toContain(
      "两个必检项目互斥",
    );
    s.records.orderingRules[1].required = false;
    s.records.orderingRules.push({
      id: "c",
      item: "丙",
      requires: "乙",
      price: 30,
    });
    expect(normalizeOrderItems(s, ["甲", "乙", "丙"]).items).toEqual(["甲"]);
    expect(normalizeOrderItems(s, ["甲", "乙", "丙"]).removed).toContainEqual({
      item: "丙",
      reason: "依赖项目乙已被过滤",
    });
  });
  it("T0113 被过滤项目无计价行；免费项目仍保持零元", () => {
    const s = emptyState();
    s.packages = [
      { id: "A", name: "A", tag: "演示", price: 100, items: ["甲", "乙"] },
    ];
    s.records.orderingRules = [{ id: "free", item: "免费项", price: 0 }];
    const q = quoteOrder(s, ["A"], 100, {}, ["免费项"], ["乙"]);
    expect(q.items).toEqual(["甲", "免费项"]);
    expect(q.amount).toBe(50);
    expect(q.rows.find((row) => row.item === "免费项")?.amount).toBe(0);
  });
});

describe("A组取消保留删除与恢复安全边界", () => {
  function cancellableState() {
    const s = createInitialState();
    s.config.cancellationPolicy = "deleteBusiness";
    s.appointments = [
      { ...s.appointments[0], id: "OWN", patientId: "P001", status: "paid" },
      {
        ...s.appointments[1],
        id: "OTHER",
        patientId: "P002",
        status: "booked",
      },
    ];
    for (const collection of [
      "queueTickets",
      "printTasks",
      "examRequests",
      "appointmentNotifications",
      "transactions",
      "invoices",
    ])
      s.records[collection] = [
        { id: "OWN-" + collection, appointmentId: "OWN" },
        { id: "OTHER-" + collection, appointmentId: "OTHER" },
      ];
    s.tasks = [
      { id: "OPEN", appointmentId: "OWN", status: "待处理" },
      { id: "DONE", appointmentId: "OWN", status: "已完成" },
      { id: "OTHER", appointmentId: "OTHER", status: "待处理" },
    ];
    return s;
  }
  it("T0029/T0042 删除策略严格限定自己业务，财务审计与其他人记录保留", () => {
    const s = cancellableState();
    const cancelled = reducer(s, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: "OWN", patientId: "P001" },
    });
    expect(cancelled.appointments.map((row) => row.id)).toEqual(["OTHER"]);
    expect(
      cancelled.records.queueTickets.map((row) => row.appointmentId),
    ).toEqual(["OTHER"]);
    expect(cancelled.records.transactions).toEqual(s.records.transactions);
    expect(cancelled.records.invoices).toEqual(s.records.invoices);
    expect(cancelled.audit.length).toBeGreaterThan(s.audit.length);
    expect(cancelled.tasks.map((row) => row.id)).toEqual(["DONE", "OTHER"]);
    expect(
      cancelled.records.cancelledAppointmentArchive[0].removedRecords
        .printTasks,
    ).toHaveLength(1);
    const restored = reducer(cancelled, {
      type: "RESTORE_CANCELLED_APPOINTMENT",
      payload: { id: "OWN", patientId: "P001" },
    });
    expect(restored.appointments.find((row) => row.id === "OWN")?.status).toBe(
      "cancelled",
    );
    expect(restored.records.queueTickets).toEqual(
      cancelled.records.queueTickets,
    );
    expect(restored.records.transactions).toEqual(s.records.transactions);
    expect(
      reducer(restored, {
        type: "RESTORE_CANCELLED_APPOINTMENT",
        payload: { id: "OWN", patientId: "P001" },
      }),
    ).toBe(restored);
  });
  it("T0029 归属、锁与已进入体检状态校验均拒绝取消", () => {
    const s = cancellableState();
    expect(
      reducer(s, {
        type: "CANCEL_PATIENT_APPOINTMENT",
        payload: { id: "OTHER", patientId: "P001" },
      }),
    ).toBe(s);
    s.appointments[0].locked = true;
    expect(
      reducer(s, {
        type: "CANCEL_PATIENT_APPOINTMENT",
        payload: { id: "OWN", patientId: "P001" },
      }),
    ).toBe(s);
    s.appointments[0].locked = false;
    s.appointments[0].status = "checked";
    expect(
      reducer(s, {
        type: "CANCEL_PATIENT_APPOINTMENT",
        payload: { id: "OWN", patientId: "P001" },
      }),
    ).toBe(s);
    s.appointments[0].status = "paid";
    const cancelled = reducer(s, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: "OWN", patientId: "P001" },
    });
    expect(
      reducer(cancelled, {
        type: "RESTORE_CANCELLED_APPOINTMENT",
        payload: { id: "OWN", patientId: "P002" },
      }),
    ).toBe(cancelled);
  });
  it("T0029/T0042 H5 明确删除策略，归档回看并只恢复取消历史", () => {
    setup(cancellableState());
    click("查看预约");
    click("取消预约");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "保留可恢复归档与审计",
    );
    click("确认取消");
    expect(
      read().appointments.some((row: { id: string }) => row.id === "OWN"),
    ).toBe(false);
    expect(screen.getByText(/已移除业务的取消预约 · OWN/)).toBeTruthy();
    click("恢复取消记录供查询");
    expect(
      read().appointments.find((row: { id: string }) => row.id === "OWN")
        .status,
    ).toBe("cancelled");
    expect(screen.queryByRole("button", { name: "模拟支付" })).toBeNull();
  });
  it("T0029 默认保留策略仍保留业务订单及审计", () => {
    const s = cancellableState();
    delete s.config.cancellationPolicy;
    const cancelled = reducer(s, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: "OWN", patientId: "P001" },
    });
    expect(cancelled.appointments.find((row) => row.id === "OWN")?.status).toBe(
      "cancelled",
    );
    expect(cancelled.records.queueTickets).toEqual(s.records.queueTickets);
    expect(cancelled.records.cancelledAppointmentArchive[0].policy).toBe(
      "retain",
    );
  });
});

describe("A组前端状态与可解释过滤边界", () => {
  it("T0113 默认展示自动过滤原因，关闭自动过滤后互斥阻断提交", () => {
    const s = emptyState();
    s.config.packageChooseCount = 2;
    s.packages = [
      {
        id: "A",
        name: "合成套餐甲",
        tag: "演示",
        price: 100,
        items: ["一般检查", "项目甲"],
      },
      {
        id: "B",
        name: "合成套餐乙",
        tag: "演示",
        price: 200,
        items: ["一般检查", "项目乙"],
      },
    ];
    s.records.orderingRules = [
      { id: "base", item: "一般检查", required: true, price: 10 },
      { id: "rule", item: "项目甲", excludes: "项目乙", price: 10 },
    ];
    setup(s);
    click("开启健康计划");
    click(/合成套餐乙/);
    expect(screen.getByLabelText("项目自动过滤说明")).toHaveTextContent(
      "项目乙：与项目甲互斥，先选项目优先；保留 项目甲",
    );
    fireEvent.click(
      screen.getByLabelText("自动过滤重复与互斥项目（必检优先，其余先选优先）"),
    );
    consent();
    click("确认预约");
    expect(read().appointments).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("项目甲与项目乙互斥");
  });
  it("T0482 已选自选包不能绕过后来关闭的增项开关", () => {
    const s = emptyState();
    s.records.packageRules = [
      {
        id: "bundle",
        packageId: "PK01",
        optionalItems: ["合成加项"],
        choose: 1,
      },
    ];
    function DisableAdd() {
      const { act } = useDemo();
      return (
        <button
          onClick={() =>
            act({ type: "UPDATE_CONFIG", payload: { allowAdd: false } })
          }
        >
          测试关闭增项
        </button>
      );
    }
    localStorage.setItem(STORAGE, JSON.stringify(s));
    window.history.replaceState({}, "", "#/patient");
    render(
      <DemoProvider>
        <Patient />
        <DisableAdd />
        <Probe />
      </DemoProvider>,
    );
    click("开启健康计划");
    fireEvent.click(screen.getByLabelText("基础安心体检自选包：合成加项"));
    click("测试关闭增项");
    consent();
    click("确认预约");
    expect(read().appointments).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("当前有效 0 项");
  });
  it("T0029 锁定的已付订单在患者页面不可取消", () => {
    const s = createInitialState();
    s.appointments = [
      { ...s.appointments[0], patientId: "P001", status: "paid", locked: true },
    ];
    setup(s);
    click("查看预约");
    expect(screen.getByRole("button", { name: "取消预约" })).toBeDisabled();
    click("取消预约");
    expect(screen.queryByRole("dialog", { name: "取消预约" })).toBeNull();
  });
});
