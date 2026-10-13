// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createInitialState, DemoProvider, exportCsv } from "../src/store";
import type { DemoState } from "../src/model";
import ProjectStatistics from "../src/modules/ProjectStatistics";
import {
  allocateProjectCents,
  buildProjectRows,
  defaultProjectFilters,
  filterProjectRows,
  groupProjectRows,
  projectCsvRows,
  summarizeProjectRows,
} from "../src/projectStatisticsRules";
vi.mock("../src/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/store")>();
  return { ...actual, exportCsv: vi.fn() };
});
const key = "hongchuang.health.demo.v1";
function sample(): DemoState {
  const state = createInitialState();
  const source = state.appointments[0];
  state.appointments = [
    {
      ...source,
      id: "ORDER-STAT",
      doctor: "订单医生",
      amount: 240,
      items: ["一般检查", "血常规"],
      pricing: [
        { item: "一般检查", price: 100, amount: 80, percent: 80 },
        { item: "血常规", price: 200, amount: 160, percent: 80 },
      ],
      results: { 一般检查: "正常", 血常规: "正常" },
      createdAt: "2026-10-01T01:00:00Z",
      resultMetadata: {
        一般检查: {
          doctor: "张医生",
          department: "全科",
          room: "101诊室",
          at: "2026-10-10T09:00:00Z",
        },
        血常规: {
          doctor: "李医生",
          department: "检验科",
          room: "201诊室",
          at: "2026-10-12T09:00:00Z",
        },
      },
    },
  ];
  return state;
}
const filtered = (state: DemoState, options = {}) =>
  filterProjectRows(buildProjectRows(state), {
    ...defaultProjectFilters,
    ...options,
  });
const mount = (state = sample()) => {
  localStorage.setItem(key, JSON.stringify(state));
  return render(
    <DemoProvider>
      <ProjectStatistics />
    </DemoProvider>,
  );
};
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
describe("Project statistics pure evidence and arithmetic", () => {
  it("counts unique actual result items rather than audit actions and prefers per-item metadata and price snapshots", () => {
    const state = sample();
    state.appointments[0].items.push("一般检查");
    state.audit = Array.from({ length: 30 }, (_, i) => ({
      id: `A${i}`,
      action: "SAVE_RESULTS",
    }));
    const rows = filtered(state);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      doctor: "张医生",
      department: "全科",
      room: "101诊室",
      originalCents: 10000,
      executionCents: 8000,
      assignmentSource: "项目结果元数据",
      estimated: false,
    });
    expect(summarizeProjectRows(rows)).toMatchObject({
      count: 2,
      people: 1,
      originalCents: 30000,
      executionCents: 24000,
      estimatedCount: 0,
    });
    expect(
      groupProjectRows(rows, "department").find((g) => g.name === "检验科"),
    ).toMatchObject({ count: 1, executionCents: 16000 });
  });
  it("switches between ordering and completion dates and combines doctor, room, department, project and review filters", () => {
    const state = sample();
    state.appointments[0].status = "review";
    state.appointments[0].reviewStage = 1;
    expect(
      filtered(state, {
        start: "2026-10-10",
        end: "2026-10-10",
        doctor: "张医生",
        department: "全科",
        room: "101诊室",
        item: "一般检查",
        reviewFlow: "主检待办",
      }),
    ).toHaveLength(1);
    expect(
      filtered(state, {
        mode: "ordered",
        start: "2026-10-10",
        end: "2026-10-10",
      }),
    ).toHaveLength(0);
    expect(
      filtered(state, {
        mode: "ordered",
        start: "2026-10-01",
        end: "2026-10-01",
      }),
    ).toHaveLength(2);
    delete state.appointments[0].results["血常规"];
    expect(filtered(state)).toHaveLength(1);
    expect(filtered(state, { mode: "ordered" })).toHaveLength(2);
    expect(
      filtered(state, { start: "2026-10-20", end: "2026-10-10" }),
    ).toHaveLength(0);
  });
  it("excludes cancelled, waived and any refunded orders from valid counts and amounts, including partial refunds", () => {
    const state = sample();
    const base = state.appointments[0];
    state.appointments = [
      base,
      { ...base, id: "CANCEL", status: "cancelled" },
      { ...base, id: "REFUND", refunded: true, refundAmount: 20 },
      { ...base, id: "WAIVE", waived: ["一般检查"] },
    ];
    const rows = filtered(state);
    expect(rows).toHaveLength(3);
    expect(summarizeProjectRows(rows).executionCents).toBe(40000);
    const trace = filtered(state, { includeExcluded: true });
    expect(trace).toHaveLength(8);
    expect(summarizeProjectRows(trace)).toMatchObject({
      count: 3,
      excludedCount: 5,
      executionCents: 40000,
    });
    const csv = projectCsvRows(trace, {
      ...defaultProjectFilters,
      includeExcluded: true,
    });
    expect(
      csv
        .filter((r) => r.体检号 === "REFUND")
        .every(
          (r) => r.计入有效数量 === 0 && r.计入统计执行价 === "0.00（排除）",
        ),
    ).toBe(true);
  });
  it("allocates estimated legacy execution prices in exact cents and labels current catalog estimates and unknown original prices", () => {
    const state = sample();
    state.appointments[0].pricing = undefined;
    state.appointments[0].amount = 1.01;
    state.packages = [
      {
        id: "ONLY",
        name: "演示等分套餐",
        price: 30,
        tag: "demo",
        items: ["一般检查", "血常规"],
      },
    ];
    state.appointments[0].packageId = "ONLY";
    const rows = filtered(state);
    expect(rows.map((r) => r.executionCents)).toEqual([51, 50]);
    expect(rows.map((r) => r.originalCents)).toEqual([1500, 1500]);
    expect(
      rows.every((r) => r.estimated && r.priceSource.includes("估算")),
    ).toBe(true);
    expect(summarizeProjectRows(rows).executionCents).toBe(101);
    state.appointments[0].items = ["未知演示甲", "未知演示乙"];
    state.appointments[0].results = { 未知演示甲: "正常", 未知演示乙: "正常" };
    state.appointments[0].packageId = "MISSING";
    const unknown = filtered(state);
    expect(summarizeProjectRows(unknown)).toMatchObject({
      originalCents: null,
      originalUnknown: 2,
      executionCents: 101,
    });
    expect(allocateProjectCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
  it("never silently picks duplicate snapshots and flags snapshots that no longer match the current order amount", () => {
    const state = sample();
    state.appointments[0].pricing.push({
      item: "一般检查",
      price: 100,
      amount: 80,
    });
    const row = filtered(state).find((r) => r.item === "一般检查")!;
    expect(row.originalCents).toBeNull();
    expect(row.executionCents).toBeNull();
    expect(row.warning).toContain("多个价格快照");
    state.appointments[0].pricing.pop();
    state.appointments[0].amount = 200;
    expect(
      filtered(state).every((r) => r.warning.includes("当前订单金额不一致")),
    ).toBe(true);
    expect(summarizeProjectRows(filtered(state)).executionCents).toBe(24000);
  });
  it("uses configurable project attribution only when historical result metadata is absent and labels date fallbacks", () => {
    const state = sample();
    delete state.appointments[0].resultMetadata["血常规"];
    state.records.projectStatMappings = [
      { id: "MAP", item: "血常规", department: "当前检验科", room: "新201" },
      { id: "M2", item: "一般检查", department: "不应覆盖", room: "不应覆盖" },
    ];
    const rows = filtered(state);
    expect(rows.find((r) => r.item === "血常规")).toMatchObject({
      doctor: "订单医生",
      department: "当前检验科",
      room: "新201",
      resultDateSource: "缺项目时间，体检日期代理",
    });
    expect(rows.find((r) => r.item === "一般检查")?.department).toBe("全科");
  });
});
describe("Project statistics UI and export", () => {
  it("filters personnel and money consistently and exports the identical selected dataset", () => {
    vi.mocked(exportCsv).mockClear();
    const state = sample();
    mount(state);
    change("指定检查项目", "血常规");
    change("统计开始日期", "2026-10-12");
    change("统计结束日期", "2026-10-12");
    const table = screen.getByRole("table", { name: "项目统计人员明细" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(table).toHaveTextContent("血常规");
    expect(table).toHaveTextContent("李医生");
    expect(table).toHaveTextContent("¥200.00 / ¥160.00");
    fireEvent.click(screen.getByRole("button", { name: "导出当前明细 CSV" }));
    const filters = {
      ...defaultProjectFilters,
      item: "血常规",
      start: "2026-10-12",
      end: "2026-10-12",
    };
    expect(exportCsv).toHaveBeenCalledWith(
      "红创_项目工作量明细.csv",
      projectCsvRows(
        filterProjectRows(buildProjectRows(state), filters),
        filters,
      ),
    );
    change("统计开始日期", "2026-10-14");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "开始日期不能晚于结束日期",
    );
    expect(
      screen.getByRole("button", { name: "导出当前明细 CSV" }),
    ).toBeDisabled();
  });
  it("saves item-to-department and room mappings and immediately consumes them for missing metadata", () => {
    const state = sample();
    delete state.appointments[0].resultMetadata;
    mount(state);
    fireEvent.click(screen.getByText("价格与归属口径 / 项目映射配置"));
    change("映射检查项目", "血常规");
    change("统计映射科室", "合成检验部");
    change("统计映射诊室", "采血A室");
    fireEvent.click(screen.getByRole("button", { name: "保存项目统计归属" }));
    change("统计科室", "合成检验部");
    const table = screen.getByRole("table", { name: "项目统计人员明细" });
    expect(table).toHaveTextContent("采血A室");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(
      JSON.parse(localStorage.getItem(key)!).records.projectStatMappings[0],
    ).toMatchObject({
      item: "血常规",
      department: "合成检验部",
      room: "采血A室",
    });
  });
});
