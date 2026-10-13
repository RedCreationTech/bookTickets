// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { createInitialState, DemoProvider, useDemo } from "../src/store";
import Health from "../src/modules/Health";
import {
  buildFollowupAllocation,
  allocationLoads,
  filterFollowupTasks,
  customerTypeOptions,
} from "../src/modules/FollowupAllocation";
import {
  defaultAssessmentTemplate,
  applyAssessmentTemplate,
  validateAssessmentTemplate,
  renderAssessmentTemplate,
  assessmentExportContent,
} from "../src/modules/AssessmentTemplates";
const filters = {
  patientId: "",
  customerType: "regular",
  status: "",
  query: "",
};
function fixture() {
  const s = createInitialState();
  s.patients = s.patients.slice(0, 4).map((p, i) => ({
    ...p,
    customerType: i === 1 ? "group" : i === 3 ? undefined : "regular",
  }));
  s.records.staff = [
    { id: "A", name: "甲", status: "已通过" },
    { id: "B", name: "乙", status: "已通过" },
    { id: "C", name: "停用人员", status: "已停用" },
  ];
  s.records.followupLocks = [
    { id: "LOCK", patientId: "P003", status: "locked", owner: "甲" },
  ];
  s.tasks = [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `T${i + 1}`,
      patientId: "P001",
      title: `选中任务${i + 1}`,
      owner: "未分配",
      status: "待处理",
      date: "2026-10-13",
      history: [],
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `BG${i}`,
      patientId: "P002",
      title: `单位任务${i}`,
      owner: "甲",
      status: "进行中",
      date: "2026-10-13",
    })),
    {
      id: "LOCKED",
      patientId: "P003",
      title: "锁定客户任务",
      owner: "甲",
      status: "待处理",
      date: "2026-10-13",
    },
    {
      id: "DONE",
      patientId: "P001",
      title: "已经完成",
      owner: "甲",
      status: "已完成",
      date: "2026-10-13",
    },
    {
      id: "CANCEL",
      patientId: "P001",
      title: "已经取消",
      owner: "乙",
      status: "已取消",
      date: "2026-10-13",
    },
    {
      id: "MISSING",
      patientId: "P004",
      title: "类型未登记",
      owner: "未分配",
      status: "待处理",
      date: "2026-10-13",
    },
  ];
  return s;
}
function Probe() {
  const { state, act } = useDemo();
  return (
    <>
      <pre data-testid="state">{JSON.stringify(state)}</pre>
      <button
        onClick={() =>
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "followupLocks",
              record: {
                id: "LOCK-T1",
                patientId: "P001",
                status: "locked",
                owner: "其他人员",
              },
            },
          })
        }
      >
        测试插入新锁
      </button>
    </>
  );
}
function state() {
  return JSON.parse(screen.getByTestId("state").textContent!);
}
function mount(s = fixture()) {
  localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(s));
  return render(
    <DemoProvider>
      <Health />
      <Probe />
    </DemoProvider>,
  );
}
function followup() {
  fireEvent.click(
    screen.getByRole("button", { name: "干预随访", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("筛选随访客户类型"), {
    target: { value: "regular" },
  });
}
function preview() {
  fireEvent.click(screen.getByRole("button", { name: "预览随访分配" }));
  return screen.getByRole("dialog", { name: "随访分配预览" });
}
describe("T0277–278 deterministic visible followup allocation", () => {
  it("balances real open load and evenly allocates batch counts using stable ordering", () => {
    const s = fixture();
    const automatic = buildFollowupAllocation(
      s,
      filters,
      ["甲", "乙", "停用人员"],
      "workload",
    );
    expect(automatic).toHaveLength(4);
    expect(automatic.every((r) => r.to === "乙")).toBe(true);
    const loads = allocationLoads(s.tasks, ["甲", "乙"], automatic);
    expect(loads.find((l) => l.owner === "甲")).toMatchObject({
      before: 5,
      after: 5,
    });
    expect(loads.find((l) => l.owner === "乙")).toMatchObject({
      before: 0,
      after: 4,
    });
    const average = buildFollowupAllocation(
      s,
      filters,
      ["甲", "乙"],
      "average",
    );
    expect(average.filter((r) => r.to === "甲")).toHaveLength(2);
    expect(average.filter((r) => r.to === "乙")).toHaveLength(2);
    expect(
      buildFollowupAllocation(s, filters, ["乙", "甲"], "average"),
    ).toEqual(average);
  });
  it("intersects customer type, patient and status filters and excludes missing or unauthorized patients", () => {
    const s = fixture();
    expect(
      filterFollowupTasks(s, {
        ...filters,
        patientId: "P001",
        status: "已完成",
      }).map((t) => t.id),
    ).toEqual(["DONE"]);
    expect(
      filterFollowupTasks(s, { ...filters, customerType: "__missing__" }).map(
        (t) => t.id,
      ),
    ).toEqual(["MISSING"]);
    s.patients = s.patients.filter((p) => p.id === "P001");
    expect(
      buildFollowupAllocation(
        s,
        { ...filters, customerType: "" },
        ["甲", "乙"],
        "workload",
      ).map((t) => t.id),
    ).toEqual(["T1", "T2", "T3", "T4"]);
    s.records.customerTypes = [
      { id: "regular", name: "合成康复观察客户" },
      { id: "custom", name: "自定义服务客户" },
    ];
    expect(customerTypeOptions(s).find((t) => t.id === "regular")?.name).toBe(
      "合成康复观察客户",
    );
  });
  it("cancels without writes, permits manual row exclusion, confirms once and persists after remount", () => {
    const s = fixture();
    let view = mount(s);
    followup();
    let dialog = preview();
    expect(
      within(dialog).getByRole("table", { name: "分配前后人员负载" }),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "取消本批分配" }),
    );
    expect(state().tasks).toEqual(s.tasks);
    expect(state().records.followupAllocationBatches).toBeUndefined();
    dialog = preview();
    fireEvent.change(within(dialog).getByLabelText("任务 T1 分配给"), {
      target: { value: "甲" },
    });
    fireEvent.change(within(dialog).getByLabelText("任务 T2 分配给"), {
      target: { value: "" },
    });
    const button = within(dialog).getByRole("button", {
      name: "确认本批随访分配",
    });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(state().records.followupAllocationBatches).toHaveLength(1);
    expect(state().tasks.find((t: any) => t.id === "T1")).toMatchObject({
      owner: "甲",
    });
    expect(state().tasks.find((t: any) => t.id === "T1").history).toHaveLength(
      1,
    );
    expect(state().tasks.find((t: any) => t.id === "T2").owner).toBe("未分配");
    for (const id of ["LOCKED", "DONE", "CANCEL", "BG0"])
      expect(state().tasks.find((t: any) => t.id === id)).toEqual(
        s.tasks.find((t) => t.id === id),
      );
    view.unmount();
    view = render(
      <DemoProvider>
        <Health />
        <Probe />
      </DemoProvider>,
    );
    followup();
    expect(state().tasks.find((t: any) => t.id === "T1").owner).toBe("甲");
    expect(state().records.followupAllocationBatches).toHaveLength(1);
    view.unmount();
  });
  it("rejects the entire preview after a new customer lock instead of partially committing", () => {
    const s = fixture();
    mount(s);
    followup();
    preview();
    fireEvent.click(screen.getByRole("button", { name: "测试插入新锁" }));
    fireEvent.click(screen.getByRole("button", { name: "确认本批随访分配" }));
    expect(state().tasks).toEqual(s.tasks);
    expect(state().records.followupAllocationBatches).toBeUndefined();
    expect(screen.getByRole("status").textContent).toContain("已变化");
  });
  it("uses the shared customer type dictionary and retains scoped invisible tasks unchanged", () => {
    const s = fixture();
    s.config.customRoleId = "ONLY-P1";
    s.records.roles = [{ id: "ONLY-P1", allowedPatientIds: ["P001"] }];
    s.records.customerTypes = [
      { id: "regular", name: "合成康复观察客户" },
      { id: "group", name: "单位客户" },
    ];
    mount(s);
    followup();
    expect(
      screen.getByRole("option", { name: "合成康复观察客户" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("筛选随访状态"), {
      target: { value: "待处理" },
    });
    expect(document.querySelectorAll(".health-task")).toHaveLength(4);
    const dialog = preview();
    expect(within(dialog).queryByText(/单位任务/)).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "确认本批随访分配" }),
    );
    const raw = JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!);
    expect(raw.tasks.find((t: any) => t.id === "BG0")).toEqual(
      s.tasks.find((t) => t.id === "BG0"),
    );
    expect(raw.tasks).toHaveLength(s.tasks.length);
  });
});
describe("T0725 applied assessment template rendering", () => {
  it("validates required placeholders and keeps dangerous-looking content as inert text", () => {
    expect(
      validateAssessmentTemplate({
        ...defaultAssessmentTemplate,
        description: "{{patientName}} {{unknown}}",
      }).join(),
    ).toContain("缺少必填变量");
    expect(
      validateAssessmentTemplate({
        ...defaultAssessmentTemplate,
        description: defaultAssessmentTemplate.description + "{{unknown}}",
      }).join(),
    ).toContain("不支持变量");
    const report = {
      id: "R",
      patientId: "P001",
      category: "慢病风险教育",
      date: "2026-10-13",
      description: "合成摘要",
      score: { total: 2, max: 10, disclaimer: "非临床", dimensions: [] },
      answers: {},
    };
    const result = applyAssessmentTemplate(report, {
      name: "<img src=x onerror=alert(1)>",
    });
    expect(result.renderedTemplateText).toContain("<img");
    expect(assessmentExportContent(result)).toBe(result.renderedTemplateText);
    expect(
      renderAssessmentTemplate(
        { ...defaultAssessmentTemplate, assessmentType: "心理健康评估" },
        report,
        {},
      ).errors,
    ).toContain("模板未启用或不适用于当前评估类型。");
  });
  it("saves a configured template, applies it to preview/archive/export, and preserves old snapshots when edited", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "风险评估", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "生成教育性流程报告" }));
    expect(
      screen.getByTestId("assessment-template-preview").textContent,
    ).toContain("红创健康评估流程报告");
    fireEvent.click(screen.getByRole("button", { name: "编辑或另存模板" }));
    fireEvent.change(screen.getByLabelText("评估模板名称"), {
      target: { value: "我的慢病流程模板" },
    });
    fireEvent.change(screen.getByLabelText("评估模板适用类型"), {
      target: { value: "慢病风险教育" },
    });
    const template =
      "自定义标题\n{{patientName}} / {{assessmentType}} / {{date}}\n{{summary}}\n{{disclaimer}}\n<img src=x onerror=alert(1)>";
    fireEvent.change(screen.getByLabelText("评估模板正文"), {
      target: { value: template },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存评估模板配置" }));
    expect(state().records.clinicalConfig[0]).toMatchObject({
      name: "我的慢病流程模板",
      category: "评估报告模板",
      assessmentType: "慢病风险教育",
    });
    fireEvent.click(screen.getByRole("button", { name: "应用所选模板到报告" }));
    const preview = screen.getByTestId("assessment-template-preview");
    expect(preview.textContent).toContain("自定义标题");
    expect(preview.textContent).toContain("林知远 / 慢病风险教育");
    expect(preview.querySelector("img")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "保存报告，等待专业复核" }),
    );
    const report = state().records.assessments[0];
    expect(report.reportTemplate.description).toBe(template);
    expect(report.renderedTemplateText).toBe(preview.textContent);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(
      screen.getByRole("button", { name: "导出当前模板报告 TXT" }),
    );
    const blob = (
      URL.createObjectURL as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)![0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toBe(report.renderedTemplateText);
    fireEvent.click(screen.getByRole("button", { name: "编辑或另存模板" }));
    fireEvent.change(screen.getByLabelText("评估模板正文"), {
      target: { value: template.replace("自定义标题", "后续模板修订") },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存评估模板配置" }));
    expect(state().records.clinicalConfig[0].description).toContain(
      "后续模板修订",
    );
    expect(state().records.assessments[0].renderedTemplateText).toBe(
      report.renderedTemplateText,
    );
    expect(screen.getByTestId("assessment-template-preview").textContent).toBe(
      report.renderedTemplateText,
    );
  });
  it("consumes a template already saved by settings and disables unrelated assessment types", () => {
    const s = fixture();
    s.records.clinicalConfig = [
      {
        ...defaultAssessmentTemplate,
        id: "FROM-SETTINGS",
        name: "设置内模板",
        assessmentType: "慢病风险教育",
        description: defaultAssessmentTemplate.description.replace(
          "红创健康评估流程报告",
          "配置来源标题",
        ),
      },
      {
        ...defaultAssessmentTemplate,
        id: "PSYCH",
        name: "仅心理模板",
        assessmentType: "心理健康评估",
      },
    ];
    mount(s);
    fireEvent.click(
      screen.getByRole("button", { name: "风险评估", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "生成教育性流程报告" }));
    expect(
      screen
        .getByRole("option", { name: /仅心理模板/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("选用评估报告模板"), {
      target: { value: "FROM-SETTINGS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用所选模板到报告" }));
    expect(
      screen.getByTestId("assessment-template-preview").textContent,
    ).toContain("配置来源标题");
  });
});
