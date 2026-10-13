import { describe, it, expect } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { DemoProvider, createInitialState } from "../src/store";
import {
  quoteOrder,
  getOrderingIssues,
  resolveDependencies,
  percentFromAmount,
} from "../src/orderingRules";
import {
  splitGroupAmount,
  GroupContractWorkbench,
  InvoiceLedger,
  applicableGroup,
} from "../src/modules/Groups";
import { RegistrationProfile } from "../src/modules/Registration";
import { ExamExtras, UndoExam } from "../src/modules/ClinicalExtras";
import { Appointments, Exam, Finance } from "../src/modules/Core";
import App from "../src/App";
import {
  OrderingRuleEditor,
  PackageCatalogEditor,
} from "../src/modules/Ordering";
import { anonymizedBookingUsage } from "../src/store";
import { getBookingAvailability } from "../src/bookingRules";
import { reducer } from "../src/model";
const read = () =>
  JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!);
const wrap = (node: React.ReactNode) =>
  render(<DemoProvider>{node}</DemoProvider>);
describe("atomic ordering and clinical details", () => {
  it("O01 deduplicates package items, protects non-discount lines and recalculates individual prices", () => {
    const s = createInitialState();
    const q = quoteOrder(s, ["PK01", "PK02"], 80);
    expect(q.items).toHaveLength(8);
    expect(q.rows.find((r) => r.item === "一般检查")!.percent).toBe(100);
    const c = quoteOrder(s, ["PK02"], 100, { 血常规: 70 });
    expect(c.amount).toBeLessThan(899);
    expect(percentFromAmount(s, ["PK02"], 899)).toBe(100);
  });
  it("O02 rejects mutually exclusive and sex-specific items, follows dependencies and detects cycles", () => {
    const s = createInitialState();
    expect(
      getOrderingIssues(s, "P001", [
        "一般检查",
        "腹部CT",
        "腹部彩超",
        "乳腺彩超",
      ]).join(),
    ).toContain("互斥");
    expect(
      getOrderingIssues(s, "P001", ["一般检查", "乳腺彩超"]).join(),
    ).toContain("限女性");
    expect(resolveDependencies(s, ["骨密度"]).items).toContain("一般检查");
    s.records.orderingRules = [
      { id: "a", item: "甲", requires: "乙" },
      { id: "b", item: "乙", requires: "甲" },
    ];
    expect(resolveDependencies(s, ["甲"]).errors[0]).toContain("依赖循环");
  });
  it("O03 backend-shaped local group budgets leave over-budget and personal items to the individual", () => {
    const rows = [
      { item: "一般检查", amount: 200 },
      { item: "肺功能", amount: 50 },
    ];
    expect(
      splitGroupAmount(
        { mode: "限额自选", budget: 150, personalItems: ["肺功能"] },
        rows,
      ),
    ).toEqual({ unit: 150, personal: 100 });
    expect(
      splitGroupAmount(
        { mode: "无限额", budget: 0, personalItems: ["肺功能"] },
        rows,
      ),
    ).toEqual({ unit: 200, personal: 50 });
  });
  it("O04 group contract saves specific members, budget and options and guards negative deposit", () => {
    wrap(<GroupContractWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "保存生效单位订单" }));
    expect(read().records.groupOrders[0]).toMatchObject({
      company: "星辰科技",
      mode: "限额自选",
      budget: 899,
    });
    fireEvent.change(screen.getByLabelText("本地入账金额"), {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "模拟预付款入账" }));
    expect(screen.getByRole("status")).toHaveTextContent("大于0");
    expect(read().records.groupAccounts || []).toHaveLength(0);
  });
  it("O05 manual profile rejects real-like identification and persists only DEMO identity", () => {
    wrap(<RegistrationProfile />);
    fireEvent.change(screen.getByLabelText("合成证件标识"), {
      target: { value: "123456789012345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客户基本资料" }));
    expect(read().patients).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("合成证件标识"), {
      target: { value: "DEMO-NEW-009" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客户基本资料" }));
    expect(read().patients).toHaveLength(9);
    expect(read().patients[0].certificate).toBe("DEMO-NEW-009");
  });
  it("O06 graded summaries reorder and inquiry template writes structured editable data", () => {
    wrap(<ExamExtras appointmentId="TJ2026100001" />);
    fireEvent.change(screen.getByLabelText("新增分级小结"), {
      target: { value: "第一条" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加分级小结" }));
    fireEvent.change(screen.getByLabelText("新增分级小结"), {
      target: { value: "第二条" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加分级小结" }));
    fireEvent.click(screen.getAllByRole("button", { name: "上移小结" })[1]);
    expect(read().appointments[0].examSummaries[0].text).toBe("第二条");
    fireEvent.change(screen.getByLabelText("内科问诊模板"), {
      target: { value: "routine" },
    });
    expect(read().appointments[0].examInquiry.history).toContain("合成");
  });
  it("O07 report image upload is real file read, previewed and removable", async () => {
    wrap(<ExamExtras appointmentId="TJ2026100001" />);
    fireEvent.change(screen.getByLabelText("报告图片上传"), {
      target: {
        files: [new File(["demo"], "synthetic.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByAltText("合成报告图片 synthetic.png"),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(read().appointments[0].images?.[0]?.src).toContain(
        "data:image/png;base64,",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除图片" }));
    expect(read().appointments[0].images).toHaveLength(0);
  });
  it("O08 confirmed undo returns only unreviewed unlocked results to draft and records before/after", () => {
    const s = createInitialState();
    let r = reducer(s, {
      type: "UNDO_RESULTS",
      payload: { id: "TJ2026100003", reason: "补充合成小结" },
    });
    expect(r.appointments[2].status).toBe("in_exam");
    expect(r.audit[0].before.status).toBe("review");
    r = reducer(s, {
      type: "UNDO_RESULTS",
      payload: { id: "TJ2026100005", reason: "不能改已审" },
    });
    expect(r).toBe(s);
    wrap(<UndoExam />);
    fireEvent.change(screen.getByLabelText("待撤销订单"), {
      target: { value: "TJ2026100003" },
    });
    fireEvent.change(screen.getByLabelText("撤销原因"), {
      target: { value: "测试撤销" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认撤销分检提交" }));
    expect(
      read().appointments.find((a: any) => a.id === "TJ2026100003").status,
    ).toBe("in_exam");
  });
  it("O09 Ctrl+Enter uses the same completeness guard and then submits valid results", () => {
    wrap(<Exam />);
    const result = screen.getByLabelText("空腹血糖结果");
    fireEvent.keyDown(result, { key: "Enter", ctrlKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("未录入");
    fireEvent.click(screen.getByRole("button", { name: "填入正常示例" }));
    fireEvent.keyDown(result, { key: "Enter", ctrlKey: true });
    expect(read().appointments[0].status).toBe("review");
  });
  it("O10 replacing a group member updates identity and can be searched using the original name", () => {
    wrap(<Appointments />);
    fireEvent.click(screen.getAllByRole("button", { name: "详情" })[1]);
    const d = screen.getByRole("dialog");
    fireEvent.change(within(d).getByLabelText("替检人"), {
      target: { value: "P004" },
    });
    fireEvent.change(within(d).getByLabelText("替检原因"), {
      target: { value: "合成单位换人" },
    });
    fireEvent.click(
      within(d).getByRole("button", { name: "确认替检并更新订单" }),
    );
    const a = read().appointments.find((a: any) => a.id === "TJ2026100002");
    expect(a.patientId).toBe("P004");
    expect(a.replacements[0].originalPatientId).toBe("P002");
    fireEvent.click(within(d).getByRole("button", { name: "关闭" }));
    fireEvent.change(screen.getByLabelText("搜索预约"), {
      target: { value: "苏清禾" },
    });
    expect(screen.getByText("许悦宁")).toBeVisible();
  });
  it("O11 creating an appointment creates three linked simulated print jobs exactly once", () => {
    const s = createInitialState();
    const action = {
      type: "CREATE_APPOINTMENT",
      payload: { id: "DEMO-ORDER-ID", patientId: "P001", packageId: "PK02" },
    };
    const r = reducer(s, action);
    expect(
      r.records.printTasks.filter(
        (t: any) => t.appointmentId === "DEMO-ORDER-ID",
      ),
    ).toHaveLength(3);
    expect(reducer(r, action)).toBe(r);
  });
  it("O12 invoice split preserves transaction total and prevents duplicate active invoicing until voided", () => {
    wrap(<InvoiceLedger />);
    fireEvent.click(screen.getByRole("checkbox", { name: /TJ2026100001/ }));
    fireEvent.change(screen.getByLabelText("拆分第一张比例%"), {
      target: { value: "40" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认模拟合并/拆分开票" }),
    );
    const invoice = read().records.invoiceLedger[0];
    expect(invoice.amount).toBe(899);
    expect(invoice.parts.reduce((n: number, x: number) => n + x, 0)).toBe(899);
    expect(
      screen.getByRole("checkbox", { name: /TJ2026100001/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "模拟作废" }));
    expect(
      screen.getByRole("checkbox", { name: /TJ2026100001/ }),
    ).toBeEnabled();
  });
  it("O13 front desk group booking enforces package scope and persists per-party budget calculation", () => {
    const s = createInitialState();
    s.records.groupOrders = [
      {
        id: "GO-TEST",
        company: "星辰科技",
        name: "测试单位订单",
        status: "生效",
        mode: "限额自选",
        budget: 350,
        packages: ["PK01"],
        optionalItems: [],
        choose: 0,
      },
    ];
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(s));
    wrap(<Appointments />);
    fireEvent.click(screen.getByRole("button", { name: "新建预约" }));
    let d = screen.getByRole("dialog");
    expect(
      within(within(d).getByLabelText("体检套餐")).queryByRole("option", {
        name: /都市精英/,
      }),
    ).toBeNull();
    fireEvent.change(within(d).getByLabelText("体检套餐"), {
      target: { value: "PK01" },
    });
    fireEvent.click(within(d).getByRole("button", { name: "确认预约" }));
    expect(read().appointments[0]).toMatchObject({
      groupOrderId: "GO-TEST",
      amount: 399,
      groupSplit: { unit: 350, personal: 49 },
    });
  });
  it("O14 saved custom package actually joins the shared catalog", () => {
    wrap(<PackageCatalogEditor />);
    fireEvent.change(screen.getByLabelText("套餐名称"), {
      target: { value: "定制合成套餐" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存共享套餐目录" }));
    expect(
      read().packages.find((p: any) => p.id === "DEMO-PK-NEW"),
    ).toMatchObject({
      name: "定制合成套餐",
      price: 499,
      items: ["一般检查", "血常规", "肝功能"],
    });
  });
  it("O15 configured route and patient scopes affect actual frontend pages without deleting source data", async () => {
    const s = createInitialState();
    s.config.customRoleId = "CUSTOM-QA";
    s.records.roles = [
      {
        id: "CUSTOM-QA",
        name: "测试范围角色",
        menuPaths: ["/appointments"],
        allowedPatientIds: ["P002"],
        examTypes: ["团检"],
      },
    ];
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(s));
    window.location.hash = "#/appointments";
    wrap(<App />);
    await waitFor(() => expect(screen.getByText("苏清禾")).toBeInTheDocument());
    expect(screen.queryByText("林知远")).not.toBeInTheDocument();
    expect(read().patients).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "退出自定义权限" }));
    expect(screen.getAllByText("林知远").length).toBeGreaterThan(0);
  });
  it("O16 disabling a rule differs from retiring an item and retired selections cannot submit", () => {
    const s = createInitialState();
    s.records.orderingRules = [
      { id: "R", item: "演示项目", excludes: "对比项目", ruleEnabled: false },
    ];
    expect(getOrderingIssues(s, "P001", ["演示项目", "对比项目"])).toEqual([]);
    s.records.orderingRules[0].enabled = false;
    expect(getOrderingIssues(s, "P001", ["演示项目"]).join()).toContain(
      "项目已停用",
    );
  });
  it("O17 role-hidden bookings still occupy anonymous daily and slot capacity", () => {
    const s = createInitialState();
    s.config.dailyCapacity = 8;
    s.records.bookingUsage = anonymizedBookingUsage(s);
    s.appointments = s.appointments.filter((a) => a.patientId === "P001");
    s.patients = s.patients.filter((p) => p.id === "P001");
    const a = getBookingAvailability(s, "2026-10-13");
    expect(a.used).toBe(8);
    expect(a.allowed).toBe(false);
    expect(
      getBookingAvailability(s, "2026-10-13", s.appointments[0].id).used,
    ).toBe(7);
    expect(JSON.stringify(s.records.bookingUsage)).not.toContain("P002");
  });
  it("O18 package-choice config and unit limits persist with subgroup single-package override", () => {
    const ui = wrap(<OrderingRuleEditor />);
    fireEvent.change(screen.getByLabelText("小程序默认套餐必选套数"), {
      target: { value: "2" },
    });
    expect(read().config.packageChooseCount).toBe(2);
    ui.unmount();
    wrap(<GroupContractWorkbench />);
    fireEvent.change(screen.getByLabelText("允许套餐必须选M套"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存生效单位订单" }));
    expect(screen.getByRole("status")).toHaveTextContent("套餐N选M数量");
    expect(read().records.groupOrders || []).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("允许套餐必须选M套"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存生效单位订单" }));
    expect(read().records.groupOrders[0].packageChooseCount).toBe(1);
    const state = read();
    state.records.groupOrders[0].packageChooseCount = 2;
    state.records.groupPersonnelGroups = [
      {
        id: "SUB",
        groupOrderId: state.records.groupOrders[0].id,
        members: ["P001"],
        packageId: "PK01",
      },
    ];
    expect(applicableGroup(state, "P001").packageChooseCount).toBe(1);
  });
  it("O19 front desk automatically removes mutually exclusive package items and only charges retained rows", () => {
    const state = createInitialState();
    state.patients[0].company = "个检";
    state.packages = [
      {
        id: "PK01",
        name: "合成甲套餐",
        price: 100,
        tag: "演示",
        items: ["一般检查", "合成甲"],
      },
      {
        id: "PK02",
        name: "合成乙套餐",
        price: 200,
        tag: "演示",
        items: ["一般检查", "合成乙"],
      },
    ];
    state.records.orderingRules = [
      { id: "base", item: "一般检查", required: true },
      { id: "exclusive", item: "合成甲", excludes: "合成乙" },
    ];
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(state));
    wrap(<Appointments />);
    fireEvent.click(screen.getByRole("button", { name: "新建预约" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("合成甲套餐"));
    expect(within(dialog).getByLabelText("自动过滤项目说明")).toHaveTextContent(
      "合成甲",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "确认预约" }));
    expect(read().appointments[0]).toMatchObject({
      amount: 200,
      items: ["一般检查", "合成乙"],
    });
    expect(read().appointments[0].autoFilteredItems[0].item).toBe("合成甲");
  });
  it("O20 the finance page mounts real invoice-reminder controls", async () => {
    wrap(<Finance />);
    fireEvent.click(screen.getByText("发票回款到期与业务员提醒"));
    expect(
      await screen.findByLabelText("发票提醒演示日期"),
    ).toBeInTheDocument();
  });
});
