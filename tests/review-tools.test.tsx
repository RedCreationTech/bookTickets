import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { DemoProvider, createInitialState } from "../src/store";
import type { DemoState } from "../src/model";
import {
  ReviewTools,
  ReportOperations,
  ReviewTextTools,
  ReportTemplateTools,
  matchReviewText,
  parseReportTemplate,
  reportTemplateText,
  getReportTemplate,
  reviewWorkload,
  reportAgeDays,
  reportDeadlineDays,
  isReportOverdue,
  isCriticalReviewAppointment,
  sortReviewAppointments,
  queryReportOperations,
  REVIEW_ORDER_TYPES,
} from "../src/modules/ReviewTools";
const KEY = "hongchuang.health.demo.v1";
const state = (): DemoState => JSON.parse(localStorage.getItem(KEY)!);
const seed = (change?: (s: DemoState) => void) => {
  const s = createInitialState();
  change?.(s);
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
};
const mount = (node: ReactNode) => render(<DemoProvider>{node}</DemoProvider>);
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const dialogClick = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name,
      exact: true,
    }),
  );
const current = (id: string) => state().appointments.find((a) => a.id === id)!;
function openDetails(label: string) {
  fireEvent.click(screen.getByText(label));
}
const template = {
  version: 1,
  id: "demo-vip",
  name: "合成精简模板",
  heading: "我的合成标题",
  footer: "仅供合成演示",
  sections: ["customer", "conclusion"],
};

describe("dedicated review controls and report operations", () => {
  it("RT01 / T0286 T0288 saves date schedules, assigns shared orders, updates workload and prevents duplicate assignments", () => {
    const s = seed(),
      a = s.appointments[6];
    mount(<ReviewTools appointmentId={a.id} />);
    click("安排医生排班");
    change("排班医生", "余医生");
    change("审核日容量", "1");
    dialogClick("保存医生排班");
    expect(state().records.reviewSchedules).toHaveLength(1);
    click("分配给余医生");
    expect(current(a.id).doctor).toBe("余医生");
    expect(current(a.id).reviewWorkDate).toBe("2026-10-13");
    expect(state().records.reviewAssignments).toHaveLength(1);
    expect(screen.getByRole("button", { name: "分配给余医生" })).toBeDisabled();
    const load = reviewWorkload(state(), state().records.reviewSchedules[0]);
    expect(load.count).toBeGreaterThan(0);
    expect(load.index).toBeGreaterThan(100);
    expect(screen.getByRole("button", { name: "撤销空闲排班" })).toBeDisabled();
    const count = state().audit.length;
    fireEvent.click(screen.getByRole("button", { name: "分配给余医生" }));
    expect(state().audit).toHaveLength(count);
  });
  it("RT02 / T0286 schedule save is idempotent, cancel does not write and empty schedules can be withdrawn", () => {
    const s = seed();
    mount(<ReviewTools appointmentId={s.appointments[6].id} />);
    click("安排医生排班");
    change("排班医生", "陈医生（演示）");
    dialogClick("取消");
    expect(state().records.reviewSchedules).toBeUndefined();
    click("安排医生排班");
    change("排班医生", "陈医生（演示）");
    dialogClick("保存医生排班");
    const n = state().audit.length;
    click("安排医生排班");
    change("排班医生", "陈医生（演示）");
    dialogClick("保存医生排班");
    expect(state().records.reviewSchedules).toHaveLength(1);
    expect(state().audit).toHaveLength(n);
    click("撤销空闲排班");
    expect(state().records.reviewSchedules[0].status).toBe("cancelled");
    expect(
      screen.getByRole("button", { name: "分配给陈医生（演示）" }),
    ).toBeDisabled();
  });
  it("RT03 / T0291 T0309 validates, cancels and persists dimension weights and per-order-type deadlines", () => {
    const s = seed();
    mount(<ReviewTools appointmentId={s.appointments[6].id} />);
    click("配置权重与分类时限");
    change("年龄权重", "40");
    dialogClick("保存审核配置");
    expect(screen.getByRole("alert")).toHaveTextContent("合计为 100%");
    expect(state().records.reviewSettings).toBeUndefined();
    change("项目数量权重", "0");
    change("入职订单时限", "0");
    dialogClick("保存审核配置");
    expect(screen.getByRole("alert")).toHaveTextContent("1–365");
    dialogClick("取消");
    expect(state().records.reviewSettings).toBeUndefined();
    click("配置权重与分类时限");
    change("年龄权重", "40");
    change("项目数量权重", "0");
    change("入职订单时限", "2");
    dialogClick("保存审核配置");
    expect(state().records.reviewSettings[0].weights.age).toBe(40);
    expect(state().records.reviewSettings[0].deadlines["入职"]).toBe(2);
    const a = { ...s.appointments[6], orderType: "入职", date: "2026-10-10" };
    expect(reportDeadlineDays(state(), a)).toBe(2);
    expect(isReportOverdue(state(), a)).toBe(true);
    expect(isReportOverdue(state(), { ...a, orderType: "普通" })).toBe(false);
    expect(isReportOverdue(state(), { ...a, status: "approved" })).toBe(false);
  });
  it("RT04 / T0308 T0309 critical review ordering is deterministic and does not mutate the input", () => {
    const s = seed();
    const ordinary = {
      ...s.appointments[6],
      id: "old",
      date: "2026-09-01",
      results: {},
    };
    const critical = {
      ...s.appointments[6],
      id: "critical",
      date: "2026-10-13",
      manualMajorPositive: true,
    };
    const numeric = {
      ...s.appointments[6],
      id: "numeric",
      date: "2026-10-12",
      results: { 空腹血糖: "9.0" },
    };
    const input = [ordinary, critical, numeric];
    expect(sortReviewAppointments(s, input).map((a) => a.id)).toEqual([
      "numeric",
      "critical",
      "old",
    ]);
    expect(input.map((a) => a.id)).toEqual(["old", "critical", "numeric"]);
    expect(
      reportAgeDays({ ...ordinary, checkedAt: "2026-10-11T21:00:00Z" }),
    ).toBe(2);
    expect(isCriticalReviewAppointment(s, ordinary)).toBe(false);
  });
  it("RT05 / T0303 marking updates appointment and global alerts; cancel, no-op repeat and withdrawal are safe", () => {
    const s = seed(),
      a = s.appointments[6];
    mount(<ReviewTools appointmentId={a.id} />);
    click("人工标记重大阳性");
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认重大阳性标记",
      }),
    ).toBeDisabled();
    change("重大阳性原因", "合成异常需复核");
    dialogClick("取消");
    expect(current(a.id).manualMajorPositive).toBeUndefined();
    click("人工标记重大阳性");
    change("重大阳性原因", "合成异常需复核");
    dialogClick("确认重大阳性标记");
    expect(current(a.id).manualMajorPositive).toBe(true);
    expect(state().records.alerts).toHaveLength(1);
    expect(state().records.alerts[0]).toMatchObject({
      appointmentId: a.id,
      status: "待处理",
      id: `MANUAL-POSITIVE-${a.id}`,
    });
    expect(isCriticalReviewAppointment(state(), current(a.id))).toBe(true);
    const n = state().audit.length;
    click("编辑重大阳性标记");
    dialogClick("确认重大阳性标记");
    expect(state().audit).toHaveLength(n);
    click("撤销重大阳性标记");
    change("重大阳性原因", "合成复核后撤销");
    dialogClick("确认撤销标记");
    expect(current(a.id).manualMajorPositive).toBe(false);
    expect(state().records.alerts).toHaveLength(1);
    expect(state().records.alerts[0].status).toBe("已撤销");
    expect(isCriticalReviewAppointment(state(), current(a.id))).toBe(false);
  });
  it("RT06 / T0307 manually reorders suggestions, persists conclusion and discards canceled changes", () => {
    const s = seed(),
      a = s.appointments[6];
    mount(<ReviewTools appointmentId={a.id} />);
    click("编排报告建议");
    change("新增合成建议", "合成建议甲");
    dialogClick("加入建议列表");
    change("新增合成建议", "合成建议乙");
    dialogClick("加入建议列表");
    dialogClick("上移建议2");
    dialogClick("保存建议顺序与结论");
    expect(current(a.id).reviewSuggestions).toEqual([
      "合成建议乙",
      "合成建议甲",
    ]);
    expect(current(a.id).conclusion).toContain("1. 合成建议乙\n2. 合成建议甲");
    click("编排报告建议");
    dialogClick("下移建议1");
    dialogClick("取消");
    expect(current(a.id).reviewSuggestions).toEqual([
      "合成建议乙",
      "合成建议甲",
    ]);
  });
  it("RT07 / T0318 marks special-order recheck items and can revoke without erasing source results", () => {
    const s = seed(),
      a = s.appointments[6];
    mount(<ReviewTools appointmentId={a.id} />);
    click("订单类型与复查项目");
    change("体检订单类型", "公务员");
    fireEvent.click(screen.getByRole("checkbox", { name: "复查 血常规" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "保存订单复查设置",
      }),
    ).toBeDisabled();
    change("复查说明", "合成复查说明");
    dialogClick("保存订单复查设置");
    expect(current(a.id).orderType).toBe("公务员");
    expect(current(a.id).recheckItems).toEqual(["血常规"]);
    expect(state().records.reviewRechecks).toHaveLength(1);
    click("订单类型与复查项目");
    fireEvent.click(screen.getByRole("checkbox", { name: "复查 血常规" }));
    dialogClick("保存订单复查设置");
    expect(current(a.id).recheckItems).toEqual([]);
    expect(current(a.id).results).toEqual(a.results);
    expect(state().records.reviewRechecks[0].status).toBe("cancelled");
  });
  it("RT08 / T0352 T0353 T0376 interpretation preserves doctor/time, supports correction without recounting and survives reload", () => {
    const s = seed(),
      a = s.appointments[4];
    const view = mount(<ReportOperations appointmentId={a.id} />);
    click("登记 / 更正报告解读");
    change("业务登记操作人", "合成解读医生");
    change("业务发生时间", "2026-10-13T07:30");
    dialogClick("保存业务登记");
    expect(state().records.reportInterpretations).toHaveLength(1);
    expect(current(a.id)).toMatchObject({
      interpretedBy: "合成解读医生",
      interpretedAt: "2026-10-13T07:30:00Z",
    });
    expect(screen.getByTestId("interpretation-count")).toHaveTextContent("1");
    const n = state().audit.length;
    click("登记 / 更正报告解读");
    dialogClick("保存业务登记");
    expect(state().audit).toHaveLength(n);
    click("登记 / 更正报告解读");
    change("业务登记操作人", "另一合成医生");
    dialogClick("保存业务登记");
    expect(state().records.reportInterpretations).toHaveLength(1);
    expect(current(a.id).interpretedBy).toBe("另一合成医生");
    view.unmount();
    mount(<ReportOperations appointmentId={a.id} />);
    expect(screen.getByTestId("interpretation-count")).toHaveTextContent("1");
  });
  it("RT09 / T0352 disallows pre-approval interpretation and rejects future or pre-visit timestamps", () => {
    const s = seed();
    const view = mount(
      <ReportOperations appointmentId={s.appointments[0].id} />,
    );
    expect(
      screen.getByRole("button", { name: "登记 / 更正报告解读" }),
    ).toBeDisabled();
    view.unmount();
    mount(<ReportOperations appointmentId={s.appointments[4].id} />);
    click("登记 / 更正报告解读");
    change("业务发生时间", "2026-10-13T09:00");
    dialogClick("保存业务登记");
    expect(screen.getByRole("alert")).toHaveTextContent("不能晚于当前时间");
    change("业务发生时间", "2026-10-12T07:00");
    dialogClick("保存业务登记");
    expect(screen.getByRole("alert")).toHaveTextContent("早于体检日期");
    dialogClick("取消");
    expect(state().records.reportInterpretations).toBeUndefined();
  });
  it("RT10 / T0373 guide recovery supports cancel, safe reversal, and one valid count on re-registration", () => {
    const s = seed(),
      a = s.appointments[0];
    mount(<ReportOperations appointmentId={a.id} />);
    click("登记 / 更正导检单回收");
    dialogClick("取消");
    expect(current(a.id).guideRecovered).toBeUndefined();
    click("登记 / 更正导检单回收");
    dialogClick("保存业务登记");
    expect(current(a.id).guideRecovered).toBe(true);
    expect(screen.getByTestId("guide-count")).toHaveTextContent("1");
    click(`撤销导检单回收${a.id}`);
    change("业务登记说明", "合成误登记");
    dialogClick("确认撤销业务登记");
    expect(current(a.id).guideRecovered).toBe(false);
    expect(screen.getByTestId("guide-count")).toHaveTextContent("0");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "查询包含已撤销记录" }),
    );
    expect(screen.getByText(/撤销原因：合成误登记/)).toBeInTheDocument();
    click("登记 / 更正导检单回收");
    dialogClick("保存业务登记");
    expect(state().records.guideRecoveries).toHaveLength(1);
    expect(screen.getByTestId("guide-count")).toHaveTextContent("1");
  });
  it("RT11 / T0369 explicit specimen types filter independently and reject duplicate collection", () => {
    const s = seed(),
      a = s.appointments[0];
    mount(<ReportOperations appointmentId={a.id} />);
    click("登记合成标本采集");
    dialogClick("保存业务登记");
    click("登记合成标本采集");
    dialogClick("保存业务登记");
    expect(screen.getByRole("alert")).toHaveTextContent("不能重复计数");
    dialogClick("取消");
    click("登记合成标本采集");
    change("登记标本类型", "尿液");
    dialogClick("保存业务登记");
    expect(state().records.reportSpecimens).toHaveLength(2);
    expect(current(a.id).sampled).toBe(true);
    expect(screen.getByTestId("specimen-count")).toHaveTextContent("2");
    change("统计标本类型", "尿液");
    expect(screen.getByTestId("specimen-count")).toHaveTextContent("1");
    click(`撤销标本采集${a.id}尿液`);
    change("业务登记说明", "合成撤销");
    dialogClick("确认撤销业务登记");
    expect(screen.getByTestId("specimen-count")).toHaveTextContent("0");
    expect(current(a.id).sampled).toBe(true);
  });
  it("RT12 / T0369 supports examination module type/at records and never invents specimen types from sampled flags", () => {
    const s = seed((s) => {
      s.appointments[0].sampled = true;
      s.records.reportSpecimens = [
        {
          id: `SPEC-${s.appointments[0].id}-尿液`,
          appointmentId: s.appointments[0].id,
          patientId: s.appointments[0].patientId,
          type: "尿液",
          operator: "采集员（合成）",
          at: "2026-10-13T07:00:00Z",
          status: "已采集",
        },
      ];
    });
    expect(queryReportOperations(s, { specimenType: "尿液" })).toHaveLength(1);
    expect(queryReportOperations(s, { specimenType: "静脉血" })).toHaveLength(
      0,
    );
    mount(<ReportOperations statisticsOnly />);
    expect(screen.getByTestId("specimen-count")).toHaveTextContent("1");
    expect(
      screen.queryByRole("button", { name: "登记合成标本采集" }),
    ).not.toBeInTheDocument();
    change("统计标本类型", "静脉血");
    expect(screen.getByTestId("specimen-count")).toHaveTextContent("0");
  });
  it("RT13 / T0353 T0373 T0376 date/operator queries and canceled records do not inflate workload", () => {
    const s = seed((s) => {
      s.records.reportInterpretations = [
        {
          id: "I1",
          appointmentId: s.appointments[4].id,
          operator: "甲",
          performedAt: "2026-10-13T07:00:00Z",
          status: "active",
        },
        {
          id: "I2",
          appointmentId: s.appointments[7].id,
          operator: "甲",
          performedAt: "2026-10-13T07:10:00Z",
          status: "cancelled",
        },
      ];
      s.records.guideRecoveries = [
        {
          id: "G1",
          appointmentId: s.appointments[0].id,
          operator: "乙",
          performedAt: "2026-10-12T07:00:00Z",
          status: "active",
        },
      ];
    });
    expect(queryReportOperations(s, { operator: "甲" })).toHaveLength(1);
    expect(
      queryReportOperations(s, { from: "2026-10-13", to: "2026-10-13" }),
    ).toHaveLength(1);
    expect(
      queryReportOperations(s, { operator: "甲", includeCancelled: true }),
    ).toHaveLength(2);
    mount(<ReportOperations statisticsOnly />);
    expect(screen.getByTestId("interpretation-count")).toHaveTextContent("1");
    expect(screen.getByTestId("guide-count")).toHaveTextContent("1");
    change("专项统计操作人", "甲");
    expect(screen.getByTestId("guide-count")).toHaveTextContent("0");
    change("专项统计起始日期", "2026-10-14");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "起始日期不能晚于截止日期",
    );
    expect(screen.getByTestId("interpretation-count")).toHaveTextContent("0");
  });
  it("RT14 / T0298 T0299 T0300 punctuation segments unmatched text and maintained terms match immediately", () => {
    const s = seed(),
      a = s.appointments[6];
    mount(<ReviewTools appointmentId={a.id} />);
    openDetails("合成异常词条、编码匹配与分级回访");
    change("待核对异常文本", "合成词甲偏高，未知片段；合成词甲偏高。");
    expect(
      within(screen.getByLabelText("未匹配异常片段")).getAllByRole("listitem"),
    ).toHaveLength(2);
    click("维护新异常词条");
    change("匹配词条", "合成词甲");
    change("合成编码", "DEMO-A");
    change("词条严重度", "4");
    dialogClick("保存异常词条");
    expect(state().records.reviewTerms).toHaveLength(1);
    expect(
      matchReviewText(state(), "合成词甲偏高；未知片段").matched[0].term.code,
    ).toBe("DEMO-A");
    expect(
      within(screen.getByLabelText("未匹配异常片段")).getAllByRole("listitem"),
    ).toHaveLength(1);
    change("查询异常词条或编码", "DEMO-A");
    expect(screen.getAllByText("DEMO-A").length).toBeGreaterThan(0);
  });
  it("RT15 / T0304 T0306 custom grades sort findings/advice and generate deduplicated follow-up tasks", () => {
    const s = seed((s) => {
      s.records.reviewTerms = [
        {
          id: "TA",
          phrase: "合成甲",
          code: "DEMO-A",
          grade: "自定义普通",
          severity: 1,
          advice: "合成低优先建议",
          status: "active",
        },
        {
          id: "TB",
          phrase: "合成乙",
          code: "DEMO-B",
          grade: "自定义重要",
          severity: 4,
          advice: "合成高优先建议",
          status: "active",
        },
      ];
    });
    const a = s.appointments[6];
    mount(<ReviewTools appointmentId={a.id} />);
    openDetails("合成异常词条、编码匹配与分级回访");
    change("待核对异常文本", "合成甲；合成乙，合成乙重复片段");
    change("异常1级别", "自定义紧急等级");
    click("保存分级并按严重度生成建议");
    expect(current(a.id).reviewFindings[0].grade).toBe("自定义紧急等级");
    expect(current(a.id).reviewSuggestions).toEqual([
      "合成高优先建议",
      "合成低优先建议",
    ]);
    expect(state().tasks.filter((t) => t.appointmentId === a.id)).toHaveLength(
      2,
    );
    const n = state().audit.length;
    click("保存分级并按严重度生成建议");
    expect(state().tasks.filter((t) => t.appointmentId === a.id)).toHaveLength(
      2,
    );
    expect(state().audit).toHaveLength(n);
  });
  it("RT16 / T0300 word maintenance cancellation does not persist; changing severity updates next match", () => {
    const s = seed();
    mount(<ReviewTextTools appointment={s.appointments[6]} />);
    openDetails("合成异常词条、编码匹配与分级回访");
    click("维护新异常词条");
    change("匹配词条", "合成甲");
    dialogClick("取消");
    expect(state().records.reviewTerms).toBeUndefined();
    click("维护新异常词条");
    change("匹配词条", "合成甲");
    dialogClick("保存异常词条");
    click("修改词条");
    change("词条严重度", "5");
    dialogClick("保存异常词条");
    expect(state().records.reviewTerms).toHaveLength(1);
    expect(matchReviewText(state(), "合成甲").matched[0].term.severity).toBe(5);
  });
  it("RT17 / T0327 T0328 safe templates reject executable fields, persist local JSON, render selected sections and download", () => {
    const s = seed(),
      a = s.appointments[4];
    mount(<ReportTemplateTools appointment={a} />);
    openDetails("报告模板导入、下载与实际预览");
    click("导入 / 修改 JSON 模板");
    change(
      "报告模板 JSON 内容",
      JSON.stringify({ ...template, script: "alert(1)" }),
    );
    dialogClick("保存报告模板");
    expect(screen.getByRole("alert")).toHaveTextContent("不执行脚本或 HTML");
    expect(state().records.reportTemplates).toBeUndefined();
    change("报告模板 JSON 内容", JSON.stringify(template));
    dialogClick("校验并预览模板");
    expect(screen.getByLabelText("导入模板预览")).toHaveTextContent(
      "我的合成标题",
    );
    dialogClick("保存报告模板");
    change("预览报告模板", "demo-vip");
    click("应用模板到当前订单");
    expect(current(a.id).reportTemplateId).toBe("demo-vip");
    const preview = screen.getByLabelText("报告模板实际预览");
    expect(preview).toHaveTextContent(a.conclusion);
    expect(preview).not.toHaveTextContent("空腹血糖：");
    const spy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    click("下载报告模板");
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("RT18 / T0327 updating a stable template ID changes generated output and canceled import does not write", () => {
    const s = seed((s) => {
      s.records.reportTemplates = [template];
      s.appointments[4].reportTemplateId = template.id;
    });
    const a = s.appointments[4];
    mount(<ReportTemplateTools appointment={a} />);
    openDetails("报告模板导入、下载与实际预览");
    click("导入 / 修改 JSON 模板");
    change(
      "报告模板 JSON 内容",
      JSON.stringify({ ...template, heading: "新版模板标题" }),
    );
    dialogClick("取消");
    expect(getReportTemplate(state(), current(a.id)).heading).toBe(
      "我的合成标题",
    );
    click("导入 / 修改 JSON 模板");
    change(
      "报告模板 JSON 内容",
      JSON.stringify({ ...template, heading: "新版模板标题" }),
    );
    dialogClick("保存报告模板");
    expect(state().records.reportTemplates).toHaveLength(1);
    expect(reportTemplateText(state(), current(a.id))).toContain(
      "新版模板标题",
    );
  });
  it("RT19 / T0327 template schema is bounded, accepts text safely and local file upload is reviewable before save", async () => {
    expect(() => parseReportTemplate("no JSON")).toThrow("有效 JSON");
    expect(() =>
      parseReportTemplate(JSON.stringify({ ...template, sections: ["html"] })),
    ).toThrow("允许列表");
    expect(() => parseReportTemplate("x".repeat(65537))).toThrow("64 KB");
    const s = seed();
    mount(<ReportTemplateTools appointment={s.appointments[4]} />);
    openDetails("报告模板导入、下载与实际预览");
    click("导入 / 修改 JSON 模板");
    const uploaded = {
      ...template,
      heading: '<img src="x" onerror="alert(1)">',
    };
    const file = new File([JSON.stringify(uploaded)], "synthetic.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("上传报告模板 JSON"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("报告模板 JSON 内容")).toHaveValue(
        JSON.stringify(uploaded),
      ),
    );
    dialogClick("校验并预览模板");
    expect(
      screen.getByLabelText("导入模板预览").querySelector("img"),
    ).toBeNull();
    expect(screen.getByLabelText("导入模板预览")).toHaveTextContent(
      '<img src="x"',
    );
    dialogClick("取消");
    expect(state().records.reportTemplates).toBeUndefined();
  });
  it("RT20 / T0309 all configured order classes resolve independently at the deadline boundary", () => {
    const s = seed((s) => {
      s.records.reviewSettings = [
        {
          id: "REVIEW-SETTINGS",
          deadlines: Object.fromEntries(
            REVIEW_ORDER_TYPES.map((t, i) => [t, i + 1]),
          ),
        },
      ];
    });
    REVIEW_ORDER_TYPES.forEach((t, i) => {
      const a = { ...s.appointments[6], orderType: t, date: "2026-10-01" };
      expect(reportDeadlineDays(s, a)).toBe(i + 1);
      expect(
        isReportOverdue(
          s,
          a,
          new Date(`2026-10-${String(i + 2).padStart(2, "0")}T12:00:00Z`),
        ),
      ).toBe(false);
      expect(
        isReportOverdue(
          s,
          a,
          new Date(`2026-10-${String(i + 3).padStart(2, "0")}T00:00:00Z`),
        ),
      ).toBe(true);
    });
  });
  it("RT21 / T0304 saved custom grading is restored when reopening the same order", () => {
    const s = seed((s) => {
      s.records.reviewTerms = [
        {
          id: "TERM-S",
          phrase: "合成甲",
          code: "DEMO-S",
          grade: "默认等级",
          severity: 1,
          advice: "合成复核",
          status: "active",
        },
      ];
      s.appointments[6].reviewNarrative = "合成甲";
      s.appointments[6].reviewFindings = [
        { id: "TERM-S", grade: "已保存特殊等级", severity: 5 },
      ];
    });
    mount(<ReviewTools appointmentId={s.appointments[6].id} />);
    openDetails("合成异常词条、编码匹配与分级回访");
    expect(screen.getByLabelText("异常1级别")).toHaveValue("已保存特殊等级");
    expect(screen.getByLabelText("异常1严重度")).toHaveValue(5);
  });
  it("RT22 / T0369 latest examination collection time wins over older normalized fields and new specimen types remain queryable", () => {
    const s = seed((s) => {
      s.records.reportSpecimens = [
        {
          id: "SPEC-EXTERNAL",
          appointmentId: s.appointments[0].id,
          type: "其他外部合成类型",
          operator: "合成采集员",
          performedAt: "2026-10-12T07:00:00Z",
          at: "2026-10-13T07:00:00Z",
          status: "已采集",
        },
      ];
    });
    expect(
      queryReportOperations(s, { from: "2026-10-13", to: "2026-10-13" }),
    ).toHaveLength(1);
    mount(<ReportOperations statisticsOnly />);
    change("统计标本类型", "其他外部合成类型");
    expect(screen.getByTestId("specimen-count")).toHaveTextContent("1");
  });
});
