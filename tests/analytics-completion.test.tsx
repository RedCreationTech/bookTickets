// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createInitialState,
  DemoProvider,
  exportCsv,
  reducer,
  useDemo,
} from "../src/store";
import {
  buildOrderAnalytics,
  appointmentDailyStatistics,
  appointmentCapacityDetails,
  filterAppointmentAnalytics,
} from "../src/analyticsData";
import type { AppointmentAnalyticsFilters } from "../src/analyticsData";
import {
  buildFinancialTransactions,
  buildInvoiceAging,
  buildReviewWorkloads,
  agingBucket,
  financialUnknowns,
} from "../src/financialAnalyticsRules";
import {
  abnormalitySummary,
  defaultQualityFilter,
  qualityOrders,
  qualityTimingRows,
  rejectionQualityRows,
} from "../src/qualityAnalyticsRules";
import { newReport, executeReport, reportCsv } from "../src/reportBuilderRules";
import { AppointmentDashboard } from "../src/modules/AppointmentDashboard";
import { ReportBuilder } from "../src/modules/ReportBuilder";
import { QualityAnalytics } from "../src/modules/QualityAnalytics";
import { BusinessAnalytics } from "../src/modules/BusinessAnalytics";
import { InvoiceAging } from "../src/modules/InvoiceAging";
vi.mock("../src/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/store")>()),
  exportCsv: vi.fn(),
}));
import {
  previewOrderPayment,
  previewGroupAccountSettlement,
} from "../src/orderFinanceRules";
import type { PaymentDraft } from "../src/orderFinanceRules";
import {
  appointmentFingerprint,
  pricingCatalogSignature,
} from "../src/batchOrderingRules";
import {
  getBookingAvailability,
  anonymizedBookingResourceUsage,
} from "../src/bookingRules";
import { anonymizedBookingUsage } from "../src/store";
import type { DemoState } from "../src/model";
import { aggregateClinicalResults } from "../src/clinicalRules";
import { abnormalityFacts } from "../src/qualityAnalyticsRules";
import {
  buildGroupReport,
  defaultGroupReportFilter,
} from "../src/groupReportRules";
const key = "hongchuang.health.demo.v1";
function sample() {
  const s = createInitialState();
  const base = s.appointments[0];
  s.audit = [];
  s.patients = [
    {
      ...s.patients[0],
      id: "P1",
      name: "合成甲",
      sex: "男",
      age: 40,
      company: "合成一厂",
    },
    {
      ...s.patients[1],
      id: "P2",
      name: "合成乙",
      sex: "女",
      age: 30,
      company: "合成二厂",
    },
  ];
  s.appointments = [
    {
      ...base,
      id: "O1",
      patientId: "P1",
      date: "2026-10-13",
      time: "08:00-08:30",
      status: "in_exam",
      doctor: "医生甲",
      source: "团检",
      groupCompany: "合成一厂",
      groupOrderId: "G1",
      createdBy: "登记甲",
      seller: "销售甲",
      createdAt: "2026-10-01T00:00:00Z",
      amount: 120,
      items: ["血糖", "血压"],
      pricing: [
        { item: "血糖", price: 100, amount: 80 },
        { item: "血压", price: 50, amount: 40 },
      ],
      results: { 血糖: "8.2", 血压: "120/80" },
      resultMetadata: {
        血糖: {
          doctor: "医生甲",
          department: "检验科",
          room: "101",
          at: "2026-10-13T01:00:00Z",
        },
        血压: {
          doctor: "医生甲",
          department: "全科",
          room: "102",
          at: "2026-10-13T01:00:00Z",
        },
      },
      paidAmount: 120,
      paidAt: "2026-10-02T10:00:00Z",
      checkedAt: "2026-10-13T00:00:00Z",
      stageMetadata: [],
    },
    {
      ...base,
      id: "O2",
      patientId: "P2",
      date: "2026-10-13",
      time: "09:00-09:30",
      status: "booked",
      source: "个人",
      groupCompany: undefined,
      groupOrderId: undefined,
      createdBy: "登记乙",
      seller: "销售乙",
      amount: 80,
      items: ["血糖"],
      pricing: [{ item: "血糖", price: 100, amount: 80 }],
      results: { 血糖: "" },
      resultMetadata: {},
      paidAmount: undefined,
      paidAt: undefined,
      checkedAt: undefined,
      stageMetadata: [],
    },
  ];
  s.records.groupOrders = [{ id: "G1", company: "合成一厂", seller: "销售甲" }];
  s.config.dailyCapacity = 5;
  s.config.redCapacity = 5;
  return s;
}
const filters: AppointmentAnalyticsFilters = {
  from: "2026-10-13",
  to: "2026-10-13",
  company: "",
  sex: "",
  kind: "",
  type: "",
  customerType: "",
  timeFrom: "",
  timeTo: "",
  includeCancelled: false,
};
function mount(node: React.ReactNode, s = sample()) {
  localStorage.setItem(key, JSON.stringify(s));
  return render(<DemoProvider>{node}</DemoProvider>);
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => vi.useRealTimers());
describe("actual appointment and price data", () => {
  it("combines date, time, sex, company and kind without inflating capacity from a filtered subset", () => {
    const s = sample();
    const f = {
      ...filters,
      company: "合成一厂",
      sex: "男",
      kind: "团检",
      timeFrom: "08:00",
      timeTo: "08:30",
    };
    expect(filterAppointmentAnalytics(s, f).map((r) => r.id)).toEqual(["O1"]);
    expect(appointmentDailyStatistics(s, f)[0]).toMatchObject({
      count: 1,
      globalBooked: 2,
      remaining: 3,
    });
    s.records.bookingResourceLimits = [
      { id: "c", kind: "item", resourceId: "血糖", dailyCapacity: 4 },
    ];
    expect(
      appointmentCapacityDetails(s, f).find((r) => r.name === "血糖"),
    ).toMatchObject({ count: 1, used: 2, remaining: 2 });
    expect(
      filterAppointmentAnalytics(s, {
        ...f,
        timeFrom: "10:00",
        timeTo: "09:00",
      }),
    ).toEqual([]);
  });
  it("counts actual completed projects even after refund without treating their price as revenue", () => {
    const s = sample();
    s.appointments[0].refundAmount = 20;
    const row = buildOrderAnalytics(s)[0];
    expect(row.completedCount).toBe(2);
    expect(row.executionCents).toBe(0);
    s.appointments[0].waived = ["血压"];
    expect(buildOrderAnalytics(s)[0].itemCount).toBe(1);
  });
  it("renders chart changes and exports the exact filtered people", () => {
    mount(<AppointmentDashboard />);
    change("预约统计性别", "女");
    expect(
      within(screen.getByRole("table", { name: "预约统计人员明细" })).getByText(
        "合成乙",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("table", { name: "预约统计人员明细" }),
      ).queryByText("合成甲"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("导出预约筛选明细"));
    expect(vi.mocked(exportCsv).mock.calls.at(-1)?.[1]).toHaveLength(1);
  });
  it("executes fullscreen API and automatic refresh, pause stops observable refresh", () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    mount(<AppointmentDashboard />);
    fireEvent.click(screen.getByText("进入统计全屏"));
    expect(request).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByTestId("dashboard-refresh")).toHaveTextContent(
      "刷新轮次 1",
    );
    fireEvent.click(screen.getByLabelText("图表自动刷新"));
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByTestId("dashboard-refresh")).toHaveTextContent(
      "刷新轮次 1",
    );
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  });
});
describe("actual financial facts and aging boundaries", () => {
  it("does not infer income from status, deduplicates snapshots, preserves refunds and separates prepayment allocation", () => {
    const s = sample();
    s.appointments[0].refundAmount = 20;
    s.appointments[0].refundedAt = "2026-10-03";
    s.audit = [
      {
        id: "pay",
        action: "PAYMENT",
        entity: "O1",
        time: "2026-10-02",
        after: { id: "O1", amount: 120 },
      },
    ];
    s.appointments[1].status = "paid";
    s.records.groupAccounts = [
      {
        id: "GA-G1",
        ledger: [
          { id: "a", type: "预付款入账", amount: 100, at: "2026-10-01" },
          {
            id: "b",
            type: "单位体检结算",
            amount: -60,
            at: "2026-10-02",
            appointmentId: "O1",
          },
        ],
      },
    ];
    const rows = buildFinancialTransactions(s);
    expect(rows.filter((r) => r.type === "订单收款")).toHaveLength(1);
    expect(
      rows.filter((r) => r.cash).reduce((n, r) => n + r.amountCents, 0),
    ).toBe(20000);
    expect(rows.find((r) => r.type === "预收款结算分配")).toMatchObject({
      amountCents: 6000,
      cash: false,
    });
    expect(rows.some((r) => r.appointmentId === "O2")).toBe(false);
  });
  it("uses distinct completed review nodes with actual doctors rather than audit event counts", () => {
    const s = sample();
    s.appointments[0].stageMetadata = [
      {
        stage: "主检",
        doctor: "主检甲",
        status: "已通过",
        completedAt: "2026-10-12T10:00:00Z",
      },
      {
        stage: "总检",
        doctor: "总检乙",
        status: "已通过",
        completedAt: "2026-10-13T10:00:00Z",
      },
    ];
    s.audit = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      action: "REVIEW",
    }));
    expect(buildReviewWorkloads(s).map((r) => r.doctor)).toEqual([
      "主检甲",
      "总检乙",
    ]);
  });
  it("places all age boundaries correctly and excludes void/future invoices while subtracting only valid dated receipts", () => {
    expect([0, 30, 31, 60, 61, 90, 91, 180, 181].map(agingBucket)).toEqual([
      "0–30天",
      "0–30天",
      "31–60天",
      "31–60天",
      "61–90天",
      "61–90天",
      "91–180天",
      "91–180天",
      "181天以上",
    ]);
    const s = sample();
    s.records.invoiceLedger = [
      {
        id: "I1",
        appointmentIds: ["O1"],
        createdAt: "2026-09-13",
        amount: 100,
        status: "有效",
        paymentTermDays: 30,
      },
      { id: "I2", createdAt: "2026-09-01", amount: 100, status: "已作废" },
      { id: "I3", createdAt: "2026-10-14", amount: 100, status: "有效" },
      { id: "I4", amount: 80, status: "有效" },
    ];
    s.records.invoiceReceipts = [
      {
        id: "R1",
        invoiceId: "I1",
        amount: 20,
        date: "2026-10-12",
        status: "已登记",
      },
      {
        id: "R2",
        invoiceId: "I1",
        amount: 40,
        date: "2026-10-14",
        status: "已登记",
      },
    ];
    const rows = buildInvoiceAging(s, "2026-10-13");
    expect(rows[0]).toMatchObject({
      age: 30,
      bucket: "0–30天",
      outstandingCents: 8000,
      due: "2026-10-13",
      overdueDays: 0,
    });
    expect(rows.filter((r) => r.eligible).map((r) => r.id)).toEqual([
      "I1",
      "I4",
    ]);
    expect(rows[3].bucket).toBe("日期未知");
  });
  it("persists unit terms and consumes them in aging immediately", () => {
    const s = sample();
    s.records.invoiceLedger = [
      {
        id: "I1",
        appointmentIds: ["O1"],
        createdAt: "2026-10-01",
        amount: 100,
        status: "有效",
      },
    ];
    mount(<InvoiceAging />, s);
    change("账期单位", "合成一厂");
    change("账期天数", "10");
    fireEvent.click(screen.getByText("保存单位账期"));
    expect(
      screen.getByRole("table", { name: "发票账龄明细" }),
    ).toHaveTextContent("2026-10-11");
    expect(
      JSON.parse(localStorage.getItem(key)!).records.invoiceCompanyTerms[0]
        .days,
    ).toBe(10);
  });
});
describe("quality denominators, timing and correction workflow", () => {
  it("keeps missing results out of abnormal denominators, honors age/company filters and critical config", () => {
    const s = sample();
    const summary = abnormalitySummary(s, defaultQualityFilter).find(
      (r) => r.name === "血糖升高",
    )!;
    expect(summary).toMatchObject({
      numerator: 1,
      denominator: 1,
      unknown: 1,
      rate: 1,
      critical: 1,
    });
    expect(
      qualityOrders(s, { ...defaultQualityFilter, ageMax: "35" }).map(
        (r) => r.id,
      ),
    ).toEqual(["O2"]);
    s.appointments[1].results.血糖 = "正常";
    expect(abnormalitySummary(s, defaultQualityFilter)[0].denominator).toBe(1);
    s.appointments[1].results.血糖 = "5.1";
    expect(abnormalitySummary(s, defaultQualityFilter)[0].rate).toBe(0.5);
  });
  it("uses actual stage times and type limits but never reports submitted-time proxies as actual duration", () => {
    const s = sample();
    const a = s.appointments[0];
    a.orderType = "贵宾";
    a.reportReturnedAt = "2026-10-13T06:00:00Z";
    a.submittedAt = "2026-10-13T06:00:00Z";
    a.stageMetadata = [
      {
        stage: "主检",
        startedAt: "2026-10-13T06:00:00Z",
        completedAt: "2026-10-13T10:00:00Z",
        startedAtSource: "送审代理",
      },
      {
        stage: "总检",
        startedAt: "2026-10-13T10:00:00Z",
        completedAt: "2026-10-13T13:00:00Z",
        startedAtSource: "实际开始",
      },
    ];
    s.records.qualityStageThresholds = [
      { id: "t", type: "贵宾", stage: "总检", hours: 2 },
    ];
    const rs = qualityTimingRows(s, defaultQualityFilter).filter(
      (r) => r.appointmentId === "O1",
    );
    expect(rs.find((r) => r.stage === "主检")?.hours).toBeNull();
    expect(rs.find((r) => r.stage === "总检")).toMatchObject({
      hours: 3,
      limit: 2,
      slow: true,
    });
  });
  it("attributes rejection to actual pre-rejection project doctor with distinct-sample denominator, never operator", () => {
    const s = sample();
    const before = structuredClone(s.appointments[0]);
    s.audit = [1, 2].map((i) => ({
      id: `R${i}`,
      action: "REJECT",
      actor: "审核操作人",
      time: "2026-10-13",
      before,
      after: { ...before, redoItems: ["血糖"], rejectReason: "单位漏填" },
    }));
    const row = rejectionQualityRows(s)[0];
    expect(row).toMatchObject({
      doctor: "医生甲",
      events: 2,
      rejected: 1,
      total: 2,
      rate: 0.5,
    });
  });
  it("saves and completes a concrete correction plan with required completion evidence", () => {
    mount(<QualityAnalytics />);
    change("质控视图", "驳回质控");
    change("整改责任人", "医生甲");
    change("整改问题或原因", "单位漏填");
    change("整改计划", "增加结果单位复核");
    fireEvent.click(screen.getByText("保存整改计划"));
    fireEvent.click(screen.getByText("确认完成此整改"));
    expect(screen.getByRole("status")).toHaveTextContent("完成说明");
    change("整改完成说明", "已复核合成样本两例");
    fireEvent.click(screen.getByText("确认完成此整改"));
    expect(
      JSON.parse(localStorage.getItem(key)!).records.qualityImprovements[0],
    ).toMatchObject({ status: "已完成", completion: "已复核合成样本两例" });
  });
});
describe("saved report execution and same-source export", () => {
  it("filters, groups and sums with explicit unknown amounts and matching CSV totals", () => {
    const s = sample();
    const d = {
      ...newReport(),
      name: "项目报表",
      dataset: "projects",
      fields: ["name", "item", "executionAmount"],
      groupBy: "item",
      sumFields: ["quantity", "executionAmount"],
      conditions: [{ field: "item", operator: "等于" as const, value: "血糖" }],
    };
    const result = executeReport(s, d);
    expect(result.count).toBe(2);
    expect(result.totals.executionAmount).toEqual({ known: 160, unknown: 0 });
    const csv = reportCsv(s, d);
    expect(csv.filter((r) => r.行类型 === "数据")).toHaveLength(2);
    expect(csv.at(-1)).toMatchObject({
      行类型: "总计",
      记录数: 2,
      "汇总:执行价金额": 160,
    });
    expect(
      executeReport(s, {
        ...d,
        conditions: [{ field: "quantity", operator: "大于等于", value: "NaN" }],
      }).error,
    ).toContain("有限数字");
  });
  it("saves two different reports, reloads each definition and exports both data and aggregate rows", () => {
    const view = mount(<ReportBuilder />);
    change("自定义报表名称", "单位进度甲");
    fireEvent.click(screen.getByText("保存报表配置"));
    const first = JSON.parse(localStorage.getItem(key)!).records
      .customAnalyticsReports[0].id;
    fireEvent.click(screen.getByText("添加报表"));
    change("自定义报表名称", "现金交易乙");
    change("报表数据源", "transactions");
    fireEvent.click(screen.getByText("保存报表配置"));
    expect(
      JSON.parse(localStorage.getItem(key)!).records.customAnalyticsReports,
    ).toHaveLength(2);
    view.unmount();
    mount(<ReportBuilder />, JSON.parse(localStorage.getItem(key)!));
    change("已保存报表", first);
    expect(screen.getByLabelText("自定义报表名称")).toHaveValue("单位进度甲");
    expect(
      within(screen.getByRole("table", { name: "自定义报表汇总" })).getByText(
        "总计",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("导出数据和汇总"));
    expect(vi.mocked(exportCsv).mock.calls.at(-1)?.[1].at(-1)).toMatchObject({
      行类型: "总计",
      记录数: 2,
    });
  });
  it("keeps business UI totals and exported transaction records in the same date range", () => {
    mount(<BusinessAnalytics />);
    change("业务视图", "交易与对账");
    change("业务开始日期", "2026-10-02");
    change("业务结束日期", "2026-10-02");
    expect(
      screen.getByRole("table", { name: "实际交易明细" }),
    ).toHaveTextContent("¥120.00");
    fireEvent.click(screen.getByText("导出当前业务口径"));
    const rows = vi.mocked(exportCsv).mock.calls.at(-1)![1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 日期: "2026-10-02", 金额: 120 });
  });
});
describe("analytics edge evidence", () => {
  it("recognizes the real seed project names and leaves numeric-text uncertainty out of rates", () => {
    const s = createInitialState();
    const summary = abnormalitySummary(s, defaultQualityFilter);
    expect(
      summary.find((r) => r.name === "血糖升高")?.numerator,
    ).toBeGreaterThan(0);
    expect(
      summary.find((r) => r.name === "血脂异常")?.numerator,
    ).toBeGreaterThan(0);
    const r = sample();
    r.appointments[0].items.push("定制项目");
    r.appointments[0].results["定制项目"] = "阳性";
    r.records.clinicalItemRules = [
      { id: "X", item: "定制项目", kind: "text", keywords: "阳性" },
    ];
    expect(
      abnormalitySummary(r, defaultQualityFilter).find(
        (x) => x.name === "定制项目异常",
      ),
    ).toMatchObject({ numerator: 1, denominator: 1 });
  });
  it("counts one multi-project rejection as one doctor event but two samples and applies company and date filters", () => {
    const s = sample();
    const before = structuredClone(s.appointments[0]);
    s.audit = [
      {
        id: "R",
        action: "REJECT",
        actor: "审核者",
        time: "2026-10-13",
        before,
        after: {
          ...before,
          redoItems: ["血糖", "血压"],
          rejectReason: "同一原因",
        },
      },
    ];
    expect(rejectionQualityRows(s)[0]).toMatchObject({
      events: 1,
      rejected: 2,
      total: 2,
      rate: 1,
    });
    expect(
      rejectionQualityRows(s, { ...defaultQualityFilter, company: "合成二厂" }),
    ).toEqual([]);
    expect(
      rejectionQualityRows(s, { ...defaultQualityFilter, from: "2026-10-14" }),
    ).toEqual([]);
  });
  it("preserves unknown original prices through custom report sums and CSV", () => {
    const s = sample();
    s.appointments[0].packageId = "MISSING";
    s.appointments[0].items = ["未知项目"];
    s.appointments[0].results = {};
    s.appointments[0].pricing = [];
    const d = {
      ...newReport(),
      name: "未知原价",
      dataset: "projects",
      fields: ["item", "originalAmount"],
      sumFields: ["originalAmount"],
      groupBy: "",
    };
    const result = executeReport(s, d);
    expect(result.totals.originalAmount).toEqual({ known: 100, unknown: 1 });
    expect(reportCsv(s, d).at(-1)?.["汇总:原价金额"]).toBe(
      "100（已知）+ 1项未知",
    );
  });
  it("exports a selected unit progress list using exam dates and keeps the original/execution totals separate", () => {
    mount(<BusinessAnalytics />);
    change("业务视图", "单位体检进度");
    change("业务单位", "合成一厂");
    change("业务开始日期", "2026-10-13");
    change("业务结束日期", "2026-10-13");
    const table = screen.getByRole("table", { name: "单位结算进度汇总" });
    expect(table).toHaveTextContent("¥120.00");
    change("单位统计价格口径", "原价");
    expect(table).toHaveTextContent("¥150.00");
    fireEvent.click(screen.getByText("导出当前业务口径"));
    expect(vi.mocked(exportCsv).mock.calls.at(-1)?.[1][0]).toMatchObject({
      订单: "O1",
      体检日期: "2026-10-13",
      原价: 150,
      执行价: 120,
    });
  });
});
function applyItemPayment(s: DemoState, patch: Partial<PaymentDraft>) {
  const a = s.appointments[0];
  const draft = {
    id: `PAY-${s.records.orderTransactions?.length || 0}`,
    appointmentId: a.id,
    mode: "items" as const,
    channel: "微信",
    chargeItems: [],
    refundItems: [],
    reason: "统计回归合成收退",
    ...patch,
  };
  const preview = previewOrderPayment(s, draft);
  expect(preview.errors).toEqual([]);
  return reducer(s, {
    type: "ORDER_PAYMENT_APPLY",
    payload: {
      ...draft,
      expected: appointmentFingerprint(a),
      catalogSignature: pricingCatalogSignature(s),
      previewSignature: JSON.stringify(preview),
    },
  });
}
function installments() {
  let s = sample();
  s.config.role = "admin";
  s.appointments = [
    {
      ...s.appointments[0],
      status: "booked",
      results: {},
      paidAmount: 0,
      paidAt: undefined,
      locked: false,
    },
  ];
  vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
  s = applyItemPayment(s, {
    id: "FIRST",
    channel: "微信",
    chargeItems: ["血糖"],
  });
  expect(s.appointments[0].paidAt).toBeUndefined();
  vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
  s = applyItemPayment(s, {
    id: "SECOND",
    channel: "现金",
    chargeItems: ["血压"],
  });
  vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
  s = applyItemPayment(s, {
    id: "PARTIAL-REFUND",
    channel: "微信",
    refundItems: ["血糖"],
  });
  return s;
}
describe("cross-module immutable transaction ledger", () => {
  it("uses real reducer two-date installment charges and partial refund instead of the final paid balance/date", () => {
    const s = installments();
    expect(s.records.orderTransactions).toHaveLength(3);
    expect(s.appointments[0].paidAmount).toBe(40);
    const rows = buildFinancialTransactions(s);
    expect(rows).toHaveLength(3);
    expect(
      rows.map((r) => [r.date, r.channel, r.item, r.direction, r.amountCents]),
    ).toEqual([
      ["2026-10-01", "微信", "血糖", "收款", 8000],
      ["2026-10-02", "现金", "血压", "收款", 4000],
      ["2026-10-02", "微信", "血糖", "退款", -8000],
    ]);
    expect(
      rows
        .filter((r) => r.date === "2026-10-01")
        .reduce((n, r) => n + r.amountCents, 0),
    ).toBe(8000);
    expect(
      rows
        .filter((r) => r.date === "2026-10-02")
        .reduce((n, r) => n + r.amountCents, 0),
    ).toBe(-4000);
    expect(financialUnknowns(s)).toEqual([]);
    s.records.orderTransactions.push(
      structuredClone(s.records.orderTransactions[0]),
    );
    expect(buildFinancialTransactions(s)).toHaveLength(3);
  });
  it("keeps verified legacy opening collection once, then records real project refunds without re-counting the balance snapshot", () => {
    let s = sample();
    s.config.role = "admin";
    s.appointments = [
      {
        ...s.appointments[0],
        status: "booked",
        results: {},
        paidAmount: 0,
        paidAt: undefined,
        locked: false,
      },
    ];
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
    s = reducer(s, { type: "PAYMENT", payload: { id: "O1", method: "现金" } });
    // Emulate an older saved state produced before PAYMENT wrote the canonical ledger.
    s.records.orderTransactions = [];
    delete s.appointments[0].paymentOpeningAllocations;
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    s = applyItemPayment(s, {
      id: "AFTER-LEGACY",
      channel: "现金",
      refundItems: ["血糖"],
    });
    const rows = buildFinancialTransactions(s);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.amountCents)).toEqual([12000, -8000]);
    expect(rows[0].source).toContain("期初分配一致");
    expect(rows.reduce((n, r) => n + r.amountCents, 0)).toBe(4000);
  });
  it("quarantines a conflicting/mismatched ledger instead of falling back to an apparently paid snapshot", () => {
    const s = installments();
    s.records.orderTransactions[0].grossRefund = 999;
    const rows = buildFinancialTransactions(s);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.source.includes("旧订单实收"))).toBe(false);
    expect(financialUnknowns(s)).toEqual([
      expect.objectContaining({ reason: expect.stringContaining("已隔离") }),
    ]);
  });
  it("exports channel/item/time-filtered real ledger rows and reruns custom reports from the same signed facts", () => {
    const s = installments();
    mount(<BusinessAnalytics />, s);
    change("业务视图", "交易与对账");
    change("业务开始日期", "2026-10-02");
    change("业务结束日期", "2026-10-02");
    change("交易渠道", "微信");
    change("交易检查项目", "血糖");
    expect(
      screen.getByRole("table", { name: "实际交易明细" }),
    ).toHaveTextContent("¥-80.00");
    fireEvent.click(screen.getByText("导出当前业务口径"));
    expect(vi.mocked(exportCsv).mock.calls.at(-1)?.[1]).toEqual([
      expect.objectContaining({
        日期: "2026-10-02",
        渠道: "微信",
        项目: "血糖",
        收退方向: "退款",
        金额: -80,
        交易时间: "2026-10-02T10:00:00.000Z",
      }),
    ]);
    const definition = {
      ...newReport(),
      name: "逐日现金流水",
      dataset: "transactions",
      fields: [
        "transactionId",
        "date",
        "at",
        "channel",
        "item",
        "direction",
        "amount",
      ],
      conditions: [
        { field: "date", operator: "等于" as const, value: "2026-10-02" },
      ],
      groupBy: "channel",
      sumFields: ["amount"],
    };
    const report = executeReport(s, definition);
    expect(report.count).toBe(2);
    expect(report.totals.amount).toEqual({ known: -40, unknown: 0 });
    expect(reportCsv(s, definition).at(-1)).toMatchObject({
      行类型: "总计",
      "汇总:收退款金额": -40,
    });
  });
});
function ScopedCapacityProbe() {
  const { state } = useDemo();
  const day = appointmentDailyStatistics(state, filters)[0];
  const resource = appointmentCapacityDetails(state, filters).find(
    (r) => r.name === "血糖" && r.scope === "项目",
  );
  const booking = getBookingAvailability(state, "2026-10-13", undefined, {
    kind: "individual",
    items: ["血糖"],
    checkQuestionnaire: false,
  });
  return (
    <output data-testid="scoped-booking">
      {JSON.stringify({
        visible: state.appointments.length,
        dailyUsed: day.globalBooked,
        resourceUsed: resource?.used,
        remaining: resource?.remaining,
        allowed: booking.allowed,
        error: booking.error,
      })}
    </output>
  );
}
describe("shared quota and main-review rejection integrations", () => {
  it("counts anonymous hidden occupancy and the exact resource limit used to reject actual bookings", () => {
    const s = sample();
    s.records.bookingResourceLimits = [
      { id: "R", kind: "item", resourceId: "血糖", dailyCapacity: 2 },
    ];
    s.records.roles = [
      { id: "scoped", permissions: ["统计分析"], allowedPatientIds: ["P1"] },
    ];
    s.config.customRoleId = "scoped";
    mount(<ScopedCapacityProbe />, s);
    const probe = JSON.parse(screen.getByTestId("scoped-booking").textContent!);
    expect(probe).toMatchObject({
      visible: 1,
      dailyUsed: 2,
      resourceUsed: 2,
      remaining: 0,
      allowed: false,
    });
    expect(probe.error).toContain("项目「血糖」当日名额已满");
    const hidden = {
      ...s,
      appointments: s.appointments.slice(0, 1),
      records: {
        ...s.records,
        bookingUsage: anonymizedBookingUsage(s),
        bookingResourceUsage: anonymizedBookingResourceUsage(s),
      },
    };
    expect(appointmentDailyStatistics(hidden, filters)[0].globalBooked).toBe(2);
    expect(
      appointmentCapacityDetails(hidden, filters).find(
        (r) => r.name === "血糖",
      ),
    ).toMatchObject({ used: 2, remaining: 0 });
  });
  it("saves zero into shared bookingResourceLimits and the booking gate immediately rejects that project", () => {
    const s = sample();
    mount(<AppointmentDashboard />, s);
    change("额度统计名称", "血糖");
    change("每日统计额度", "0");
    fireEvent.click(screen.getByText("保存共享预约额度"));
    const stored = JSON.parse(localStorage.getItem(key)!) as DemoState;
    expect(stored.records.bookingResourceLimits[0]).toMatchObject({
      kind: "item",
      resourceId: "血糖",
      dailyCapacity: 0,
    });
    expect(stored.records.analyticsCapacities).toBeUndefined();
    expect(
      appointmentCapacityDetails(stored, filters).find(
        (r) => r.name === "血糖",
      ),
    ).toMatchObject({ capacity: 0, remaining: 0 });
    expect(
      getBookingAvailability(stored, "2026-10-13", undefined, {
        kind: "individual",
        items: ["血糖"],
        checkQuestionnaire: false,
      }),
    ).toMatchObject({
      allowed: false,
      error: "项目「血糖」当日名额已满（0人）",
    });
  });
  it("attributes real REJECT_TO_MAIN reducer events to the completed main doctor rather than the rejecting operator", () => {
    let s = sample();
    s.config.role = "reviewer";
    s.config.currentUserName = "总检退回操作人";
    s.appointments = [
      {
        ...s.appointments[0],
        status: "review",
        reviewStage: 2,
        reviewNodes: ["初审", "主检", "总检"],
        locked: false,
        stageMetadata: [
          {
            stage: "主检",
            doctor: "真实主检医生",
            status: "已通过",
            startedAt: "2026-10-13T01:00:00Z",
            completedAt: "2026-10-13T02:00:00Z",
          },
        ],
        reviewHistory: [
          { stage: 1, node: "主检", doctor: "真实主检医生", status: "已通过" },
        ],
      },
    ];
    s = reducer(s, {
      type: "REJECT_TO_MAIN",
      payload: { id: "O1", reason: "主检结论需补充" },
    });
    expect(s.appointments[0].reviewStage).toBe(1);
    expect(s.audit[0].action).toBe("REJECT_TO_MAIN");
    const rows = rejectionQualityRows(s);
    expect(rows).toEqual([
      expect.objectContaining({
        doctor: "真实主检医生",
        stage: "主检",
        reason: "主检结论需补充",
        events: 1,
        rejected: 1,
        total: 1,
        rate: 1,
      }),
    ]);
    expect(rows.some((r) => r.doctor === "总检退回操作人")).toBe(false);
  });
  it("contains every analytics table in a horizontal scrolling boundary across all business and quality views", () => {
    const view = mount(<BusinessAnalytics />);
    const assertWrapped = () =>
      screen
        .getAllByRole("table")
        .forEach((table) =>
          expect(table.closest(".ops-table-wrap,.table-scroll")).not.toBeNull(),
        );
    for (const mode of [
      "开单与销售",
      "单位体检进度",
      "交易与对账",
      "审核医生",
    ]) {
      change("业务视图", mode);
      assertWrapped();
    }
    view.unmount();
    mount(<QualityAnalytics />);
    for (const mode of ["结果与到检", "异常与危急值", "节点时效", "驳回质控"]) {
      change("质控视图", mode);
      assertWrapped();
    }
  });
});
function paidArchivedState() {
  let s = sample();
  s.config.role = "admin";
  s.config.cancellationPolicy = "deleteBusiness";
  s.appointments = [
    {
      ...s.appointments[0],
      status: "booked",
      locked: false,
      results: {},
      paidAt: undefined,
      paidAmount: 0,
      groupSplit: { unit: 21, personal: 99 },
      selfPay: 99,
    },
  ];
  s = reducer(s, { type: "PAYMENT", payload: { id: "O1", method: "微信" } });
  expect(s.appointments[0].paidAmount).toBe(99);
  const before = buildFinancialTransactions(s)
    .filter((r) => r.cash)
    .reduce((n, r) => n + r.amountCents, 0);
  s = reducer(s, {
    type: "CANCEL_PATIENT_APPOINTMENT",
    payload: { id: "O1", patientId: "P1" },
  });
  expect(s.appointments).toHaveLength(0);
  expect(
    buildFinancialTransactions(s)
      .filter((r) => r.cash)
      .reduce((n, r) => n + r.amountCents, 0),
  ).toBe(before);
  return s;
}
function FinanceScopeProbe() {
  const { state } = useDemo();
  return (
    <output data-testid="archive-finance">
      {JSON.stringify(buildFinancialTransactions(state))}
    </output>
  );
}
describe("final archive, unit allocation and report-item integration", () => {
  it("retains canonical personal collections after deleteBusiness cancellation and does not duplicate after archive restore", () => {
    let s = paidArchivedState();
    expect(
      buildFinancialTransactions(s)
        .filter((r) => r.cash)
        .reduce((n, r) => n + r.amountCents, 0),
    ).toBe(9900);
    expect(buildFinancialTransactions(s)[0].source).toContain("取消归档订单");
    s = reducer(s, {
      type: "RESTORE_CANCELLED_APPOINTMENT",
      payload: { id: "O1", patientId: "P1" },
    });
    expect(s.appointments).toHaveLength(1);
    expect(
      buildFinancialTransactions(s)
        .filter((r) => r.cash)
        .reduce((n, r) => n + r.amountCents, 0),
    ).toBe(9900);
  });
  it("honors scoped archive patient and campus visibility instead of recovering hidden transaction metadata", () => {
    const s = paidArchivedState();
    const source = s.records.cancelledAppointmentArchive[0];
    const tx = s.records.orderTransactions[0];
    s.records.cancelledAppointmentArchive.push(
      {
        ...structuredClone(source),
        id: "HIDDEN-CAMPUS",
        appointment: {
          ...source.appointment,
          id: "HIDDEN-CAMPUS",
          campus: "东院区",
        },
      },
      {
        ...structuredClone(source),
        id: "HIDDEN-PATIENT",
        patientId: "P2",
        appointment: {
          ...source.appointment,
          id: "HIDDEN-PATIENT",
          patientId: "P2",
        },
      },
    );
    s.records.orderTransactions.push(
      {
        ...structuredClone(tx),
        id: "TX-HIDDEN-CAMPUS",
        appointmentId: "HIDDEN-CAMPUS",
      },
      {
        ...structuredClone(tx),
        id: "TX-HIDDEN-PATIENT",
        appointmentId: "HIDDEN-PATIENT",
        patientId: "P2",
      },
    );
    s.records.roles = [
      {
        id: "scoped-finance",
        permissions: ["财务查询"],
        allowedPatientIds: ["P1"],
        allowedCampus: "中心院区",
      },
    ];
    s.config.customRoleId = "scoped-finance";
    mount(<FinanceScopeProbe />, s);
    const rows = JSON.parse(screen.getByTestId("archive-finance").textContent!);
    expect(rows).toHaveLength(2);
    expect(
      rows.every((r: { appointmentId: string }) => r.appointmentId === "O1"),
    ).toBe(true);
    expect(
      rows.reduce(
        (n: number, r: { amountCents: number }) => n + r.amountCents,
        0,
      ),
    ).toBe(9900);
  });
  it("respects cash:false and counts one canonical unit allocation despite its mirrored group-account ledger", () => {
    let s = sample();
    s.config.role = "admin";
    s.appointments = [
      {
        ...s.appointments[0],
        status: "booked",
        locked: false,
        results: {},
        paidAt: undefined,
        paidAmount: 0,
        amount: 399,
        pricing: [
          { item: "血糖", price: 240, amount: 240 },
          { item: "血压", price: 159, amount: 159 },
        ],
        groupSplit: { unit: 300, personal: 99 },
        selfPay: 99,
      },
    ];
    s.records.groupOrders = [
      {
        id: "G1",
        company: "合成一厂",
        status: "生效",
        mode: "限额自选",
        budget: 300,
      },
    ];
    s.records.groupAccounts = [
      {
        id: "GA-G1",
        balance: 500,
        settledIds: [],
        ledger: [
          {
            id: "PREPAY",
            type: "预付款入账",
            amount: 500,
            at: "2026-10-12T08:00:00Z",
          },
        ],
      },
    ];
    s = reducer(s, { type: "PAYMENT", payload: { id: "O1", method: "微信" } });
    const before = buildFinancialTransactions(s)
      .filter((r) => r.cash)
      .reduce((n, r) => n + r.amountCents, 0);
    expect(before).toBe(59900);
    const preview = previewGroupAccountSettlement(s, "O1");
    expect(preview.errors).toEqual([]);
    s = reducer(s, {
      type: "GROUP_ACCOUNT_SETTLE",
      payload: {
        id: "UNIT-SETTLE",
        appointmentId: "O1",
        expected: preview.signature,
      },
    });
    const rows = buildFinancialTransactions(s),
      allocations = rows.filter((r) => r.type === "预收款结算分配");
    expect(allocations).toHaveLength(2);
    expect(
      allocations.every((r) => !r.cash && r.transactionId === "UNIT-SETTLE"),
    ).toBe(true);
    expect(allocations.reduce((n, r) => n + r.amountCents, 0)).toBe(30000);
    expect(
      rows.filter((r) => r.cash).reduce((n, r) => n + r.amountCents, 0),
    ).toBe(before);
    expect(s.appointments[0].paidAmount).toBe(399);
  });
  it("expands charged parent items to report children for abnormal denominators without charging or counting an extra project", () => {
    let s = sample();
    s.config.role = "admin";
    s.records.clinicalItemRules = [
      {
        id: "PARENT",
        item: "合成生化父项",
        department: "检验",
        kind: "text",
        reportItems: ["空腹血糖"],
      },
    ];
    s.appointments = [
      {
        ...s.appointments[0],
        items: ["合成生化父项"],
        pricing: [{ item: "合成生化父项", price: 100, amount: 100 }],
        amount: 100,
        status: "in_exam",
        locked: false,
        results: {},
        source: "团检备单",
        groupCompany: "合成一厂",
      },
    ];
    const results = aggregateClinicalResults(s, s.appointments[0], {
      空腹血糖: "9.2",
    });
    s = reducer(s, {
      type: "SAVE_RESULTS",
      payload: {
        id: "O1",
        results,
        doctor: "子项医生",
        department: "检验",
        room: "101",
      },
    });
    expect(
      abnormalityFacts(s).find((r) => r.abnormality === "血糖升高"),
    ).toMatchObject({
      item: "空腹血糖",
      outcome: true,
      critical: true,
      denominator: true,
    });
    expect(buildOrderAnalytics(s)[0]).toMatchObject({
      itemCount: 1,
      completedCount: 1,
      executionCents: 10000,
    });
    expect(
      buildGroupReport(
        s,
        { ...defaultGroupReportFilter, company: "合成一厂" },
        ["血糖升高"],
      ).summary,
    ).toEqual([
      expect.objectContaining({ name: "血糖升高", count: 1, denominator: 1 }),
    ]);
    s.appointments[0].waived = ["合成生化父项"];
    expect(
      abnormalityFacts(s).find((r) => r.abnormality === "血糖升高"),
    ).toMatchObject({ outcome: null, denominator: false });
  });
});
