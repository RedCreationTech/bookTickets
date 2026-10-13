// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createInitialState, DemoProvider, useDemo } from "../src/store";
import { reducer } from "../src/model";
import type { DemoState, Appointment } from "../src/model";
import {
  aggregateClinicalResults,
  clinicalAbnormalities,
  clinicalItems,
  localHistoricalOrders,
  reviewNodes,
  validateClinicalResults,
} from "../src/clinicalRules";
import {
  ClinicalRuleEditor,
  HistoricalOrderPanel,
  InExamAdditions,
  ResultTemplateTools,
  SyntheticRecording,
} from "../src/modules/ClinicalWorkbench";
import {
  ReviewWorkflowSettings,
  ReviewWorkflowTools,
  reviewCollectedText,
} from "../src/modules/ReviewWorkflow";
import {
  SpecimenStation,
  specimenCode,
  specimenItems,
  specimenTypes,
} from "../src/modules/SpecimenStation";
import { Exam, Review } from "../src/modules/Core";
const KEY = "hongchuang.health.demo.v1";
const click = (name: string | RegExp) =>
  fireEvent.click(
    screen.getByRole("button", { name, exact: typeof name === "string" }),
  );
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const toggle = (label: string) => fireEvent.click(screen.getByLabelText(label));
function base(status: Appointment["status"] = "checked") {
  const s = createInitialState();
  s.config.role = "admin";
  s.appointments = [
    {
      ...s.appointments[0],
      id: "CL-ORDER",
      patientId: "P001",
      date: "2026-10-13",
      items: ["一般检查", "血常规"],
      results: {},
      status,
      locked: false,
      reviewStage: 0,
      amount: 100,
      paidAmount: 100,
      conclusion: "合成总检结论",
    },
  ];
  return s;
}
function send(
  s: DemoState,
  type: string,
  payload: Record<string, unknown> = {},
) {
  return reducer(s, { type, payload: { id: "CL-ORDER", ...payload } });
}
function Probe() {
  const { state } = useDemo();
  return (
    <pre hidden data-testid="clinical-state">
      {JSON.stringify(state)}
    </pre>
  );
}
function mount(node: React.ReactNode, s = base()) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(
    <DemoProvider>
      {node}
      <Probe />
    </DemoProvider>,
  );
}
const current = (): DemoState =>
  JSON.parse(screen.getByTestId("clinical-state").textContent || "{}");
function Bound({ kind }: { kind: "add" | "audio" | "workflow" }) {
  const { state } = useDemo();
  const a = state.appointments[0];
  return kind === "add" ? (
    <InExamAdditions appointment={a} />
  ) : kind === "audio" ? (
    <SyntheticRecording appointment={a} />
  ) : (
    <ReviewWorkflowTools appointment={a} onConclusion={() => {}} />
  );
}
const numberRules = [
  {
    id: "GL",
    item: "空腹血糖",
    department: "全科检查",
    kind: "number",
    min: 0,
    max: 50,
    abnormalMin: 3.9,
    abnormalMax: 6.1,
    criticalMax: 10,
  },
  {
    id: "HB",
    item: "血红蛋白",
    department: "全科检查",
    kind: "number",
    min: 0,
    max: 300,
    abnormalMin: 110,
    abnormalMax: 160,
    criticalMin: 50,
  },
  {
    id: "TXT",
    item: "合成描述",
    department: "全科检查",
    kind: "text",
    allowedWords: "阴性、阳性",
    keywords: "阳性",
  },
];
const mapped = (status: Appointment["status"] = "checked") => {
  const s = base(status);
  s.records.clinicalItemRules = [
    {
      id: "PARENT",
      item: "血常规",
      department: "全科检查",
      kind: "text",
      reportItems: ["白细胞", "血红蛋白"],
    },
    {
      id: "WBC",
      item: "白细胞",
      department: "全科检查",
      kind: "number",
      min: 0,
      max: 100,
    },
    {
      id: "HGB",
      item: "血红蛋白",
      department: "全科检查",
      kind: "number",
      min: 0,
      max: 300,
    },
  ];
  return s;
};
beforeEach(() => {
  // jsdom has no canvas implementation. Keep real JsBarcode SVG encoding; only
  // supply the text-width measurement normally provided by the browser canvas.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (value: string) => ({ width: value.length * 7 }),
  } as CanvasRenderingContext2D);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("independent clinical correction and parent-child report rules", () => {
  it("C01 numeric and text correction uses each configured item, not just glucose", () => {
    const s = base();
    s.records.clinicalItemRules = numberRules.map((r) => ({ ...r }));
    expect(
      validateClinicalResults(s, ["血红蛋白", "合成描述"], {
        血红蛋白: "不是数字",
        合成描述: "未知",
      }),
    ).toHaveLength(2);
    expect(
      validateClinicalResults(s, ["血红蛋白"], { 血红蛋白: "301" })[0],
    ).toContain("纠错范围");
    expect(
      validateClinicalResults(s, ["血红蛋白", "合成描述"], {
        血红蛋白: "140",
        合成描述: "阴性",
      }),
    ).toEqual([]);
    s.records.clinicalItemRules[1].enabled = false;
    expect(
      validateClinicalResults(s, ["血红蛋白"], { 血红蛋白: "非数字" }),
    ).toEqual([]);
  });
  it("C02 multi-item abnormal and critical thresholds are independent, boundary-aware and disabled rules excluded", () => {
    const s = base();
    s.records.clinicalItemRules = numberRules.map((r) => ({ ...r }));
    const rows = clinicalAbnormalities(s, {
      空腹血糖: "10",
      血红蛋白: "100",
      合成描述: "阳性",
    });
    expect(rows.map((r) => r.item)).toEqual([
      "空腹血糖",
      "血红蛋白",
      "合成描述",
    ]);
    expect(rows.filter((r) => r.critical).map((r) => r.item)).toEqual([
      "空腹血糖",
    ]);
    expect(
      clinicalAbnormalities(s, {
        空腹血糖: "6.1",
        血红蛋白: "110",
        合成描述: "阴性",
      }),
    ).toEqual([]);
    s.records.clinicalItemRules[0].enabled = false;
    expect(clinicalAbnormalities(s, { 空腹血糖: "11" })).toEqual([]);
  });
  it("C03 clinical rule editor persists parent/report children, department and specimen rules and rejects self mapping", () => {
    mount(<ClinicalRuleEditor />);
    change("配置检查项目", "血常规");
    change("报告子项目（留空为本项目，逗号分隔）", "白细胞、血红蛋白");
    change("项目所属科室", "检验科");
    click("保存临床演示规则");
    expect(clinicalItems(current(), current().appointments[0])).toEqual([
      "一般检查",
      "白细胞",
      "血红蛋白",
    ]);
    expect(
      current().records.clinicalItemRules.find((r) => r.item === "白细胞")
        ?.department,
    ).toBe("检验科");
    change("报告子项目（留空为本项目，逗号分隔）", "血常规");
    click("保存临床演示规则");
    expect(screen.getByRole("status").textContent).toContain("不能包含自身");
    expect(
      current().records.clinicalItemRules.find((r) => r.item === "血常规")
        ?.reportItems,
    ).toEqual(["白细胞", "血红蛋白"]);
  });
  it("C04 aggregation leaves incomplete parents blank and deduplicates shared report children", () => {
    const s = mapped();
    s.appointments[0].items.push("白细胞");
    expect(clinicalItems(s, s.appointments[0])).toEqual([
      "一般检查",
      "白细胞",
      "血红蛋白",
    ]);
    expect(
      aggregateClinicalResults(s, s.appointments[0], { 白细胞: "5.8" }).血常规,
    ).toBe("");
    expect(
      aggregateClinicalResults(s, s.appointments[0], {
        白细胞: "5.8",
        血红蛋白: "140",
      }).血常规,
    ).toBe("白细胞：5.8；血红蛋白：140");
  });
  it("C05 Core Exam renders mapped child fields and actually blocks invalid/incomplete before saving aggregated results", () => {
    mount(<Exam />, mapped());
    expect(screen.queryByLabelText("血常规结果")).toBeNull();
    change("一般检查结果", "合成正常");
    change("白细胞结果", "错误");
    change("血红蛋白结果", "140");
    click("提交分检结果");
    expect(screen.getByRole("alert").textContent).toContain("白细胞必须为数值");
    expect(current().appointments[0].status).toBe("checked");
    change("白细胞结果", "5.8");
    change("血红蛋白结果", "");
    click("提交分检结果");
    expect(screen.getByRole("alert").textContent).toContain("未录入");
    change("血红蛋白结果", "140");
    click("提交分检结果");
    expect(current().appointments[0]).toMatchObject({
      status: "review",
      results: {
        一般检查: "合成正常",
        白细胞: "5.8",
        血红蛋白: "140",
        血常规: "白细胞：5.8；血红蛋白：140",
      },
    });
  });
  it("C06 Core Exam independently checks configured text dictionary and all critical results require confirmation", () => {
    const s = base();
    s.appointments[0].items = ["空腹血糖", "血红蛋白", "合成描述"];
    s.records.clinicalItemRules = numberRules.map((r) => ({ ...r }));
    mount(<Exam />, s);
    change("空腹血糖结果", "11");
    change("血红蛋白结果", "40");
    change("合成描述结果", "未维护文字");
    click("提交分检结果");
    expect(screen.getByRole("alert").textContent).toContain("描述结果字典");
    change("合成描述结果", "阳性");
    click("提交分检结果");
    expect(screen.getByRole("alert").textContent).toContain("确认已复核");
    toggle("已复核异常结果，确认继续并进入异常上报流程");
    change("分检小结 / 医学建议（演示）", "已复核合成异常，仅演示。");
    click("提交分检结果");
    expect(current().appointments[0].status).toBe("review");
    expect(current().records.alerts.map((r) => r.item)).toEqual(
      expect.arrayContaining(["空腹血糖", "血红蛋白"]),
    );
  });
});

describe("independent actual history and reusable clinical templates", () => {
  it("C07 history excludes other patient cancelled and empty records; selection range/count gives real values to draft only", () => {
    const s = base();
    const a = s.appointments[0];
    s.appointments.push(
      {
        ...a,
        id: "H1",
        date: "2026-09-01",
        results: { 一般检查: "真实本地旧值甲" },
        status: "approved",
      },
      {
        ...a,
        id: "H2",
        date: "2026-08-01",
        results: { 一般检查: "真实本地旧值乙" },
        status: "approved",
      },
      {
        ...a,
        id: "OTHER",
        patientId: "P002",
        results: { 一般检查: "他人结果" },
      },
      {
        ...a,
        id: "CANCEL",
        status: "cancelled",
        results: { 一般检查: "取消结果" },
      },
      { ...a, id: "EMPTY", results: {} },
    );
    expect(localHistoricalOrders(s, a).map((r) => r.id)).toEqual(["H1", "H2"]);
    const apply = vi.fn();
    mount(<HistoricalOrderPanel appointment={a} onUse={apply} />, s);
    toggle("对比历史订单H1");
    click("使用选中上次结果到草稿");
    expect(apply).toHaveBeenCalledWith({ 一般检查: "真实本地旧值甲" });
    expect(current().appointments[0].results).toEqual({});
    toggle("对比历史订单H2");
    change("展示历史次数", "1");
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    change("历史体检起日", "2026-09-01");
    expect(screen.queryByLabelText("对比历史订单H2")).toBeNull();
    expect(screen.queryByText("他人结果")).toBeNull();
  });
  it("C08 custom result template persists, applies seen/summary/conclusion and literal markup remains text", () => {
    const s = base();
    const apply = vi.fn();
    mount(
      <ResultTemplateTools appointment={s.appointments[0]} onApply={apply} />,
      s,
    );
    change("模板所见", "合成所见甲");
    change("模板小结", "合成小结甲");
    change("模板结论", "<script>仅作为文本</script>");
    click("保存自定义结果模板");
    expect(current().records.resultTemplates[0]).toMatchObject({
      seen: "合成所见甲",
      summary: "合成小结甲",
    });
    click("填入结果与项目小结草稿");
    expect(apply).toHaveBeenCalledWith(
      "一般检查",
      "合成所见甲",
      "合成小结甲；<script>仅作为文本</script>",
    );
    expect(current().appointments[0].results).toEqual({});
    change("模板小结", "");
    click("按所见匹配生成小结");
    expect((screen.getByLabelText("模板小结") as HTMLInputElement).value).toBe(
      "合成小结甲",
    );
  });
  it("C09 abnormal collection and doctor-summary collection contain distinct exact sources", () => {
    const s = base("review");
    s.records.clinicalItemRules = numberRules.map((r) => ({ ...r }));
    s.appointments[0].results = { 空腹血糖: "8", 血红蛋白: "100" };
    s.appointments[0].examSummaries = [
      { department: "全科", text: "医生人工小结甲" },
    ];
    expect(reviewCollectedText(s, s.appointments[0], "异常汇总")).toContain(
      "血红蛋白：100",
    );
    expect(reviewCollectedText(s, s.appointments[0], "小结合并")).toBe(
      "全科：医生人工小结甲",
    );
    const use = vi.fn();
    mount(
      <ReviewWorkflowTools
        appointment={s.appointments[0]}
        onConclusion={use}
      />,
      s,
    );
    change("汇总抓取模式", "小结合并");
    click("载入所选来源到结论草稿");
    expect(use).toHaveBeenCalledWith("全科：医生人工小结甲");
  });
});

describe("independent synthetic recording and in-exam charge workflow", () => {
  it("C10 synthetic recording start pause resume save makes valid local WAV once, cancellation never saves", () => {
    vi.useFakeTimers();
    mount(<Bound kind="audio" />);
    click("开始合成录制");
    act(() => vi.advanceTimersByTime(3000));
    click("暂停录制");
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("status").textContent).toContain("3 秒");
    click("继续录制");
    act(() => vi.advanceTimersByTime(1000));
    const save = screen.getByRole("button", { name: "结束并保存合成录音" });
    fireEvent.click(save);
    fireEvent.click(save);
    const audio = current().appointments[0].audio;
    expect(audio).toHaveLength(1);
    expect(audio[0]).toMatchObject({
      synthetic: true,
      seconds: 4,
      type: "audio/wav",
    });
    expect(atob(audio[0].src.split(",")[1]).slice(0, 4)).toBe("RIFF");
    click("开始合成录制");
    act(() => vi.advanceTimersByTime(1000));
    click("取消本次录制");
    expect(current().appointments[0].audio).toHaveLength(1);
  });
  it("C11 recording respects 20-second cap and locked order guard", () => {
    vi.useFakeTimers();
    const p = mount(<Bound kind="audio" />);
    click("开始合成录制");
    act(() => vi.advanceTimersByTime(21000));
    expect(screen.getByRole("status").textContent).toContain("已暂停 · 20 秒");
    p.unmount();
    const s = base();
    s.appointments[0].locked = true;
    mount(<Bound kind="audio" />, s);
    expect(screen.getByRole("button", { name: "开始合成录制" })).toBeDisabled();
  });
  it("C12 in-exam requests are pending without new items, prevent completion, then pay once and append ledger", () => {
    let s = base();
    s.records.orderingRules = [
      { id: "BASE", item: "一般检查", required: true, price: 20 },
      { id: "EXTRA", item: "合成新增项目", price: 80 },
    ];
    s = send(s, "IN_EXAM_ADD_REQUEST", {
      requestId: "REQ1",
      items: ["合成新增项目", "合成新增项目"],
    });
    expect(s.appointments[0].items).not.toContain("合成新增项目");
    expect(s.appointments[0].examAdditions[0]).toMatchObject({
      amount: 80,
      status: "待付款",
      items: ["合成新增项目"],
    });
    expect(
      send(s, "IN_EXAM_ADD_REQUEST", {
        requestId: "REQ1",
        items: ["合成新增项目"],
      }),
    ).toEqual(s);
    expect(
      send(s, "SAVE_RESULTS", {
        results: { 一般检查: "正常", 血常规: "正常" },
        complete: true,
      }).appointments[0].status,
    ).toBe("checked");
    s = send(s, "IN_EXAM_ADD_PAY", { chargeId: "REQ1" });
    expect(s.appointments[0].items).toContain("合成新增项目");
    expect(s.appointments[0].amount).toBe(180);
    expect(s.records.paymentTransactions).toHaveLength(1);
    expect(send(s, "IN_EXAM_ADD_PAY", { chargeId: "REQ1" })).toEqual(s);
  });
  it("C13 cancellation/free additions/locked and withdrawn item gates preserve amounts", () => {
    let s = base();
    s.records.orderingRules = [{ id: "EXTRA", item: "免费合成项目", price: 0 }];
    s = send(s, "IN_EXAM_ADD_REQUEST", {
      requestId: "FREE",
      items: ["免费合成项目"],
    });
    const paid = send(s, "IN_EXAM_ADD_PAY", { chargeId: "FREE" });
    expect(paid.appointments[0].amount).toBe(100);
    expect(paid.appointments[0].items).toContain("免费合成项目");
    const cancelled = send(s, "IN_EXAM_ADD_CANCEL", { chargeId: "FREE" });
    expect(cancelled.appointments[0].examAdditions[0].status).toBe("已取消");
    expect(send(cancelled, "IN_EXAM_ADD_PAY", { chargeId: "FREE" })).toEqual(
      cancelled,
    );
    s.records.orderingRules[0].enabled = false;
    expect(send(s, "IN_EXAM_ADD_PAY", { chargeId: "FREE" })).toEqual(s);
    s.appointments[0].locked = true;
    expect(send(s, "IN_EXAM_ADD_CANCEL", { chargeId: "FREE" })).toEqual(s);
  });
  it("C14 in-exam UI genuinely creates, cancels and pays a later fresh pending request", () => {
    const s = base();
    s.records.orderingRules = [
      { id: "EXTRA", item: "合成新增项目", price: 80 },
    ];
    mount(<Bound kind="add" />, s);
    toggle("合成新增项目 · ¥80");
    click("生成检中加项待缴单");
    expect(current().appointments[0].examAdditions[0].status).toBe("待付款");
    click("取消未付款加项");
    toggle("合成新增项目 · ¥80");
    toggle("合成新增项目 · ¥80");
    click("生成检中加项待缴单");
    click("确认模拟支付加项差额");
    expect(current().appointments[0].items).toContain("合成新增项目");
    expect(current().records.paymentTransactions).toHaveLength(1);
  });
});

describe("independent configured review nodes undo and selective rejection", () => {
  it.each([false, true])(
    "C15 explicit initial-review=%s controls exact nodes and snapshots in-progress workflow",
    (initial) => {
      let s = base("review");
      s.config.initialReviewEnabled = initial;
      s.appointments[0].results = { 一般检查: "正常", 血常规: "正常" };
      const nodes = initial ? ["初审", "主检", "总检"] : ["主检", "总检"];
      expect(reviewNodes(s)).toEqual(nodes);
      s = send(s, "REVIEW", { expectedStage: 0 });
      expect(s.appointments[0].reviewHistory[0].node).toBe(nodes[0]);
      s.config.initialReviewEnabled = !initial;
      for (let stage = 1; stage < nodes.length; stage++)
        s = send(s, "REVIEW", { expectedStage: stage });
      expect(s.appointments[0].status).toBe("approved");
      expect(
        s.appointments[0].reviewHistory.map((r: { node: string }) => r.node),
      ).toEqual(nodes);
      expect(s.appointments[0].locked).toBe(true);
    },
  );
  it("C16 stale stage or unauthorized undo cannot roll back; permitted latest undo preserves audit history", () => {
    let s = base("review");
    s.config.initialReviewEnabled = true;
    s = send(s, "REVIEW", { expectedStage: 0 });
    expect(
      send(s, "UNDO_REVIEW_STAGE", { expectedStage: 0, reason: "过期点击" }),
    ).toEqual(s);
    s.config.role = "doctor";
    expect(
      send(s, "UNDO_REVIEW_STAGE", { expectedStage: 1, reason: "无权限" }),
    ).toEqual(s);
    s.config.role = "admin";
    s = send(s, "UNDO_REVIEW_STAGE", {
      expectedStage: 1,
      reason: "复核合成信息",
    });
    expect(s.appointments[0]).toMatchObject({
      reviewStage: 0,
      status: "review",
      reviewHistory: [],
    });
    expect(s.appointments[0].reviewUndoHistory).toHaveLength(1);
    expect(s.audit[0].message).toContain("撤销");
  });
  it("C17 final review rejects to main review without clearing valid exam results", () => {
    let s = base("review");
    s.appointments[0].results = { 一般检查: "已录入", 血常规: "已录入" };
    s = send(s, "REVIEW", { expectedStage: 0 });
    s = send(s, "REVIEW", { expectedStage: 1 });
    const results = s.appointments[0].results;
    s = send(s, "REJECT_TO_MAIN", { reason: "请主检补充演示说明" });
    expect(s.appointments[0]).toMatchObject({
      status: "review",
      reviewStage: 1,
      results,
    });
    expect(s.appointments[0].reviewHistory).toHaveLength(1);
  });
  it("C18 selective re-examination preserves unrelated results and records exact selected items/reason", () => {
    let s = base("review");
    s.appointments[0].results = { 一般检查: "正常保留", 血常规: "需要重检" };
    s = send(s, "REJECT", { items: ["血常规"], reason: "合成复测" });
    expect(s.appointments[0]).toMatchObject({
      status: "in_exam",
      redoItems: ["血常规"],
      results: { 一般检查: "正常保留", 血常规: "" },
      rejectReason: "合成复测",
    });
    expect(s.appointments[0].reviewRejectHistory[0].items).toEqual(["血常规"]);
  });
  it("C19 rejecting a parent must clear its mapped child results, otherwise stale children can immediately repopulate it", () => {
    let s = mapped("review");
    s.appointments[0].results = {
      一般检查: "正常保留",
      血常规: "白细胞：5.8；血红蛋白：140",
      白细胞: "5.8",
      血红蛋白: "140",
    };
    s = send(s, "REJECT", { items: ["血常规"], reason: "要求复测父项目" });
    expect(s.appointments[0].results.白细胞).toBe("");
    expect(s.appointments[0].results.血红蛋白).toBe("");
    expect(s.appointments[0].results.一般检查).toBe("正常保留");
  });
  it("C20 Core Review consumes two-node configuration and selected rejection; settings actually toggle first node", () => {
    const s = base("review");
    s.config.initialReviewEnabled = false;
    s.appointments[0].results = { 一般检查: "正常", 血常规: "正常" };
    mount(<Review />, s);
    expect(screen.getByRole("button", { name: "通过主检" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "通过初审" })).toBeNull();
    click("驳回重检");
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByLabelText("一般检查"));
    fireEvent.change(dialog.getByLabelText("驳回原因（必填）"), {
      target: { value: "复查血常规" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "确认驳回" }));
    expect(current().appointments[0].redoItems).toEqual(["血常规"]);
    cleanup();
    mount(<ReviewWorkflowSettings />, s);
    toggle("启用初审节点");
    expect(current().config.initialReviewEnabled).toBe(true);
  });
});

describe("independent six-station barcodes and print/collection history", () => {
  function specimenState() {
    const s = base();
    s.appointments[0].items = specimenTypes.flatMap((type, i) =>
      i === 0 ? ["采血甲", "采血乙"] : [`${type}甲`],
    );
    s.records.clinicalItemRules = s.appointments[0].items.map((item) => ({
      id: item,
      item,
      department: "演示科",
      kind: "text",
      sampleType: specimenTypes.find((t) => item.startsWith(t)),
      barcodeTemplate: "HC-{体检号}-{标本}-{序号}",
    }));
    return s;
  }
  it("C21 all six stations use their own associated items and deterministic valid CODE128 text", () => {
    const s = specimenState();
    const codes = specimenTypes.map((type) => {
      const items = specimenItems(s, s.appointments[0], type);
      expect(items.length).toBe(type === "采血" ? 2 : 1);
      const code = specimenCode(s, s.appointments[0], type, items);
      expect(code).toMatch(/^HC-CL-ORDER-[1-6]-[A-Z0-9]+$/);
      expect(
        specimenCode(s, s.appointments[0], type, [...items].reverse()),
      ).toBe(code);
      return code;
    });
    expect(new Set(codes).size).toBe(6);
  });
  it("C22 auto and manual merging produce different codes without including another order or station", () => {
    const s = specimenState();
    mount(<SpecimenStation initialAppointmentId="CL-ORDER" />, s);
    const combined = screen
      .getByRole("img", { name: /CODE128条码/ })
      .getAttribute("aria-label");
    expect(
      screen.getByRole("img", { name: /CODE128条码/ }).querySelectorAll("rect")
        .length,
    ).toBeGreaterThan(10);
    toggle("按同订单同标本自动合并");
    expect(screen.queryByRole("img", { name: /CODE128条码/ })).toBeNull();
    toggle("采血甲");
    expect(
      screen
        .getByRole("img", { name: /CODE128条码/ })
        .getAttribute("aria-label"),
    ).not.toBe(combined);
    change("采样工作站", "尿液");
    expect(screen.queryByLabelText("采血甲")).toBeNull();
    toggle("尿液甲");
    expect(
      screen
        .getByRole("img", { name: /CODE128条码/ })
        .getAttribute("aria-label"),
    ).toContain("-2-");
    expect(current().records.specimenBarcodes || []).toHaveLength(0);
  });
  it("C23 print then collect records actual local history once; duplicate click and duplicate collection are harmless", () => {
    vi.useFakeTimers();
    const s = specimenState();
    mount(<SpecimenStation initialAppointmentId="CL-ORDER" />, s);
    click("确认标本采集");
    expect(screen.getByRole("status").textContent).toContain("请先");
    const print = screen.getByRole("button", { name: "生成并模拟打印条码" });
    fireEvent.click(print);
    fireEvent.click(print);
    expect(current().records.specimenBarcodes[0].prints).toHaveLength(1);
    act(() => vi.advanceTimersByTime(0));
    click("模拟补打条码");
    expect(current().records.specimenBarcodes[0].prints).toHaveLength(2);
    act(() => vi.advanceTimersByTime(0));
    click("确认标本采集");
    expect(current().records.reportSpecimens).toHaveLength(1);
    expect(current().records.specimenBarcodes[0].status).toBe("已采集");
    expect(screen.getByRole("button", { name: "确认标本采集" })).toBeDisabled();
    expect(window.print).not.toHaveBeenCalled();
  });
  it("C24 locked/cancelled/unstarted and unknown identities cannot print or collect", () => {
    const s = specimenState();
    s.appointments[0].locked = true;
    const page = mount(<SpecimenStation initialAppointmentId="CL-ORDER" />, s);
    expect(
      screen.getByRole("button", { name: "生成并模拟打印条码" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认标本采集" })).toBeDisabled();
    page.unmount();
    s.appointments[0].status = "booked";
    mount(<SpecimenStation />, s);
    change("工作站体检号", "CL-ORDER");
    click("定位待采客户");
    expect(screen.getByRole("status").textContent).toContain("尚未开始");
    expect(
      screen.queryByRole("button", { name: "生成并模拟打印条码" }),
    ).toBeNull();
    change("工作站体检号", "UNKNOWN");
    click("定位待采客户");
    expect(current().records.specimenBarcodes || []).toHaveLength(0);
    cleanup();
    s.appointments[0].status = "cancelled";
    mount(<SpecimenStation initialAppointmentId="CL-ORDER" />, s);
    expect(
      screen.queryByRole("button", { name: "生成并模拟打印条码" }),
    ).toBeNull();
  });
  it("C25 Core Exam mounts the real specimen workstation rather than a decorative print action", () => {
    mount(<Exam />, specimenState());
    click("采样条码");
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("采样工作站")).toBeTruthy();
    expect(dialog.getByRole("img", { name: /CODE128条码/ })).toBeTruthy();
  });
});
