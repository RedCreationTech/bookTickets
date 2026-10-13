// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { createInitialState, reducer, DemoProvider } from "../src/store";
import type { Action, DemoState } from "../src/model";
import {
  ReportArchive,
  ReportSearchControls,
} from "../src/modules/ReportArchive";
import {
  reduceReportArchiveAction,
  augmentReportArchiveEvents,
  filterReports,
  defaultReportFilters,
  reportMainDoctor,
  getReportArchive,
  archiveVersion,
  validateReportArchiveOperation,
} from "../src/modules/reportArchiveRules";
import type {
  ReportArchiveInput,
  ArchiveOperation,
  ReportFilters,
} from "../src/modules/reportArchiveRules";
const key = "hongchuang.health.demo.v1";
const now = "2026-10-13T08:00:00Z";
const current = (): DemoState => JSON.parse(localStorage.getItem(key) || "{}");
const transition = (s: DemoState, a: Action) =>
  augmentReportArchiveEvents(
    s,
    reduceReportArchiveAction(s, a) ?? reducer(s, a),
    a,
  );
function seed() {
  const s = createInitialState();
  s.appointments = s.appointments.slice(0, 3).map((a, i) => ({
    ...a,
    id: `R${i}`,
    status: "approved",
    locked: true,
    delivered: false,
    date: `2026-10-${13 + i}`,
    results: { 一般检查: "合成正常" },
    conclusion: "已审合成结论",
    reviewHistory: [
      {
        node: "主检",
        doctor: i === 0 ? "主检甲" : "主检乙",
        status: "已通过",
      },
    ],
  }));
  s.patients[0].name = s.patients[1].name = "演示同名";
  s.patients[0].certificate = "DEMO-ARCHIVE-ONE";
  s.patients[1].certificate = "DEMO-ARCHIVE-TWO";
  s.patients[0].company = "单位甲";
  s.patients[1].company = "单位乙";
  s.records.reportCabinetCategories = [
    { id: "CAT", name: "个检档案", status: "已启用" },
  ];
  s.records.reportCabinetSlots = [
    {
      id: "S1",
      name: "A-01",
      categoryId: "CAT",
      capacity: 2,
      status: "已启用",
    },
    {
      id: "S2",
      name: "A-02",
      categoryId: "CAT",
      capacity: 2,
      status: "已启用",
    },
  ];
  return s;
}
function input(
  operation: ArchiveOperation,
  requestId: string,
  extra: Partial<ReportArchiveInput> = {},
): ReportArchiveInput {
  return {
    operation,
    requestId,
    appointmentIds: ["R0", "R1"],
    actor: "演示档案员",
    at: now,
    ...extra,
  };
}
const apply = (s: DemoState, p: ReportArchiveInput) =>
  transition(s, { type: "REPORT_ARCHIVE_APPLY", payload: p });
const mount = (s: DemoState, ui: any) => (
  localStorage.setItem(key, JSON.stringify(s)),
  render(<DemoProvider>{ui}</DemoProvider>)
);
describe("T0336/T0340/T0350 exact and fuzzy report queries", () => {
  it("combines name, exam ID, DEMO identity, company, genuine chief-review doctor and inclusive dates", () => {
    const s = seed();
    expect(filterReports(s, s.appointments, { name: "演示同" })).toHaveLength(
      2,
    );
    expect(
      filterReports(s, s.appointments, { mode: "exact", name: "演示同" }),
    ).toHaveLength(0);
    expect(
      filterReports(s, s.appointments, {
        mode: "exact",
        name: "演示同名",
        identity: "DEMO-ARCHIVE-ONE",
        company: "单位甲",
        doctor: "主检甲",
        from: "2026-10-13",
        to: "2026-10-13",
      }).map((a) => a.id),
    ).toEqual(["R0"]);
    expect(
      filterReports(s, s.appointments, {
        appointmentId: "R",
        doctor: "乙",
      }).map((a) => a.id),
    ).toEqual(["R1", "R2"]);
    expect(
      filterReports(s, s.appointments, {
        mode: "exact",
        appointmentId: "R0",
        company: "单位乙",
      }),
    ).toEqual([]);
    expect(
      filterReports(s, s.appointments, {
        from: "2026-10-15",
        to: "2026-10-13",
      }),
    ).toEqual([]);
    expect(filterReports(s, s.appointments, { from: "2026-02-30" })).toEqual(
      [],
    );
  });
  it("does not label a referring doctor as chief reviewer and applies custom scope to actual results", () => {
    const s = seed();
    s.appointments[0].reviewHistory = [];
    s.appointments[0].doctor = "分检甲";
    expect(reportMainDoctor(s.appointments[0])).toBe("");
    expect(filterReports(s, s.appointments, { doctor: "分检甲" })).toEqual([]);
    s.config.customRoleId = "LIMIT";
    s.records.roles = [
      {
        id: "LIMIT",
        menuPaths: ["/reports"],
        allowedPatientIds: [s.patients[1].id],
      },
    ];
    expect(filterReports(s, s.appointments).map((a) => a.id)).toEqual(["R1"]);
    s.appointments[1].status = "review";
    expect(filterReports(s, s.appointments)).toEqual([]);
  });
  it("search controls update a real list, clear filters and show invalid date ranges", () => {
    const s = seed();
    function Harness() {
      const [f, setF] = React.useState<ReportFilters>({
        ...defaultReportFilters,
      });
      return (
        <>
          <ReportSearchControls onChange={setF} />
          <p data-testid="matches">
            {filterReports(s, s.appointments, f)
              .map((a) => a.id)
              .join(",")}
          </p>
        </>
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("报告 DEMO 证件号"), {
      target: { value: "TWO" },
    });
    expect(screen.getByTestId("matches")).toHaveTextContent("R1");
    expect(screen.getByTestId("matches")).not.toHaveTextContent("R0");
    fireEvent.change(screen.getByLabelText("报告匹配方式"), {
      target: { value: "exact" },
    });
    expect(screen.getByTestId("matches")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "清空报告组合条件" }));
    expect(screen.getByTestId("matches")).toHaveTextContent("R0,R1,R2");
    fireEvent.change(screen.getByLabelText("报告日期起"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.change(screen.getByLabelText("报告日期止"), {
      target: { value: "2026-10-13" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "开始日期不能晚于结束日期",
    );
  });
});
import * as React from "react";
describe("T0343/T0344/T0345/T0346/T0348 report archive state transitions", () => {
  it("records distinct printing, binding and handoff people/time and preserves report medical lock/content", () => {
    let s = seed();
    const original = JSON.stringify(s.appointments[0].results);
    s = apply(
      s,
      input("print", "PRINT", {
        actor: "演示打印员",
        at: "2026-10-13T08:00:00Z",
      }),
    );
    s = apply(
      s,
      input("bind", "BIND", {
        actor: "演示装订员",
        at: "2026-10-13T08:10:00Z",
      }),
    );
    s = apply(
      s,
      input("handoff", "HAND", {
        actor: "演示交接员",
        receiver: "演示接收员",
        at: "2026-10-13T08:20:00Z",
      }),
    );
    expect(getReportArchive(s, "R0")).toMatchObject({
      printedBy: "演示打印员",
      printedAt: "2026-10-13T08:00:00Z",
      boundBy: "演示装订员",
      boundAt: "2026-10-13T08:10:00Z",
      handedBy: "演示交接员",
      handedAt: "2026-10-13T08:20:00Z",
      handoffReceiver: "演示接收员",
    });
    expect(getReportArchive(s, "R0").history).toHaveLength(3);
    expect(s.appointments[0].locked).toBe(true);
    expect(JSON.stringify(s.appointments[0].results)).toBe(original);
    expect(
      apply(
        s,
        input("handoff", "HAND2", {
          receiver: "重复接收员",
          at: "2026-10-13T08:30:00Z",
        }),
      ),
    ).toBe(s);
  });
  it("batch stock-in, move and empty-cabinet stock-out update all shared positions and retain inventory timestamps", () => {
    let s = apply(seed(), input("print", "PRINT"));
    s = apply(s, input("stock_in", "IN", { slotId: "S1" }));
    expect(
      s.appointments.slice(0, 2).every((a) => a.cabinet === "个检档案/A-01"),
    ).toBe(true);
    expect(getReportArchive(s, "R0")).toMatchObject({
      inventoryStatus: "in",
      slotId: "S1",
      storedAt: now,
    });
    expect(apply(s, input("stock_in", "IN2", { slotId: "S1" }))).toBe(s);
    s = apply(s, input("move", "MOVE", { slotId: "S2" }));
    expect(
      s.appointments.slice(0, 2).every((a) => a.cabinet === "个检档案/A-02"),
    ).toBe(true);
    s = apply(s, input("stock_out", "OUT"));
    expect(s.appointments.slice(0, 2).every((a) => a.cabinet === "")).toBe(
      true,
    );
    expect(getReportArchive(s, "R0")).toMatchObject({
      inventoryStatus: "out",
      slotId: "",
      outAt: now,
      previousSlotId: "S2",
    });
    expect(apply(s, input("stock_out", "OUT2"))).toBe(s);
  });
  it("enforces capacity and entire-batch validity without partially updating selected reports", () => {
    let s = apply(seed(), input("print", "PRINT"));
    s.records.reportCabinetSlots[0].capacity = 1;
    expect(apply(s, input("stock_in", "OVER", { slotId: "S1" }))).toBe(s);
    expect(getReportArchive(s, "R0").inventoryStatus).toBe("unrecorded");
    s.appointments[1].status = "review";
    expect(apply(s, input("stock_in", "INVALID", { slotId: "S2" }))).toBe(s);
    s.appointments[1].status = "approved";
    s.appointments[1].archiveLocked = true;
    expect(apply(s, input("stock_in", "LOCKED", { slotId: "S2" }))).toBe(s);
  });
  it("uses stable category/slot IDs across rename and forbids deleting occupied slots, shrinking capacity or deleting nonempty categories", () => {
    let s = apply(seed(), input("print", "P"));
    s = apply(s, input("stock_in", "IN", { slotId: "S1" }));
    s = transition(s, {
      type: "REPORT_ARCHIVE_SAVE_CATEGORY",
      payload: { id: "CAT", name: "已审核档案", status: "已启用" },
    });
    s = transition(s, {
      type: "REPORT_ARCHIVE_SAVE_SLOT",
      payload: {
        id: "S1",
        name: "B-09",
        categoryId: "CAT",
        capacity: 2,
        status: "已启用",
      },
    });
    expect(getReportArchive(s, "R0")).toMatchObject({
      slotId: "S1",
      cabinet: "已审核档案/B-09",
    });
    expect(s.appointments[0].cabinet).toBe("已审核档案/B-09");
    expect(
      getReportArchive(s, "R0").history.find((e) => e.operation === "stock_in")
        ?.toCabinet,
    ).toBe("个检档案/A-01");
    expect(
      transition(s, {
        type: "REPORT_ARCHIVE_DELETE_LOCATION",
        payload: { id: "S1", kind: "slot" },
      }),
    ).toBe(s);
    expect(
      transition(s, {
        type: "REPORT_ARCHIVE_SAVE_SLOT",
        payload: {
          id: "S1",
          name: "B-09",
          categoryId: "CAT",
          capacity: 1,
          status: "已启用",
        },
      }),
    ).toBe(s);
    expect(
      transition(s, {
        type: "REPORT_ARCHIVE_DELETE_LOCATION",
        payload: { id: "CAT", kind: "category" },
      }),
    ).toBe(s);
    s = apply(s, input("stock_out", "OUT"));
    s = transition(s, {
      type: "REPORT_ARCHIVE_DELETE_LOCATION",
      payload: { id: "S1", kind: "slot" },
    });
    expect(
      s.records.reportCabinetSlots.find((r) => r.id === "S1")?.status,
    ).toBe("已删除");
    expect(getReportArchive(s, "R0").history).toHaveLength(3);
  });
  it("records issuer, recipient, exact time and method; issuing clears inventory and cannot be duplicated", () => {
    let s = apply(seed(), input("print", "P"));
    s = apply(s, input("stock_in", "IN", { slotId: "S1" }));
    expect(
      apply(
        s,
        input("issue", "MISSING", { recipient: "", method: "个人领取" }),
      ),
    ).toBe(s);
    s = apply(
      s,
      input("issue", "ISSUE", {
        actor: "演示发放员",
        recipient: "演示单位经办人",
        method: "单位领取",
        at: "2026-10-13T09:00:00Z",
      }),
    );
    expect(s.appointments[0]).toMatchObject({
      delivered: true,
      deliveredAt: "2026-10-13T09:00:00Z",
      deliveredBy: "演示发放员",
      recipient: "演示单位经办人",
      deliveryMethod: "单位领取",
      cabinet: "",
    });
    expect(getReportArchive(s, "R0")).toMatchObject({
      inventoryStatus: "issued",
      issuedBy: "演示发放员",
      recipient: "演示单位经办人",
      slotId: "",
    });
    expect(
      apply(
        s,
        input("issue", "ISSUE2", {
          recipient: "重复",
          method: "个人领取",
          at: "2026-10-13T10:00:00Z",
        }),
      ),
    ).toBe(s);
  });
  it("prevents duplicate request, stale preview, invalid times, disabled locations and unsaved stages", () => {
    let s = seed();
    expect(apply(s, input("bind", "NOPRINT"))).toBe(s);
    const p = input("print", "P");
    s = apply(s, p);
    expect(apply(s, p)).toBe(s);
    const expected = Object.fromEntries(
      ["R0", "R1"].map((id) => [id, archiveVersion(s, id)]),
    );
    s = apply(s, input("bind", "B"));
    expect(
      apply(s, input("stock_in", "STALE", { slotId: "S1", expected })),
    ).toBe(s);
    expect(
      apply(
        s,
        input("stock_in", "TIME", { slotId: "S1", at: "2026-10-12T08:00:00Z" }),
      ),
    ).toBe(s);
    expect(
      apply(
        s,
        input("stock_in", "DATE", { slotId: "S1", at: "2026-02-30T08:00:00Z" }),
      ),
    ).toBe(s);
    s.records.reportCabinetSlots[0].status = "已停用";
    expect(apply(s, input("stock_in", "DISABLED", { slotId: "S1" }))).toBe(s);
  });
  it("rejects unauthorized and mixed custom-scope selections and allows explicitly recorded electronic delivery without claiming printing", () => {
    let s = seed();
    s.config.role = "enterprise";
    expect(apply(s, input("print", "NO"))).toBe(s);
    s.config.role = "admin";
    s.config.customRoleId = "ONE";
    s.records.roles = [
      {
        id: "ONE",
        menuPaths: ["/reports"],
        allowedPatientIds: [s.patients[0].id],
      },
    ];
    expect(apply(s, input("print", "MIXED"))).toBe(s);
    s = apply(
      s,
      input("issue", "ONLINE", {
        appointmentIds: ["R0"],
        method: "线上查询",
        recipient: "演示本人",
      }),
    );
    expect(getReportArchive(s, "R0").inventoryStatus).toBe("issued");
    expect(getReportArchive(s, "R0").printedAt).toBe("");
  });
  it("archives legacy successful PRINT events once and never invents binding or handoff personnel", () => {
    let s = seed();
    s = transition(s, { type: "PRINT", payload: { id: "R0" } });
    expect(getReportArchive(s, "R0").history).toHaveLength(1);
    expect(getReportArchive(s, "R0").printedBy).toBe("admin");
    expect(getReportArchive(s, "R0").boundAt).toBe("");
    expect(
      augmentReportArchiveEvents(s, s, {
        type: "PRINT",
        payload: { id: "R0" },
      }),
    ).toBe(s);
    s.appointments[1].status = "cancelled";
    const failed = transition(s, { type: "PRINT", payload: { id: "R1" } });
    expect(getReportArchive(failed, "R1").history).toHaveLength(0);
  });
});
describe("Report archive actual controls", () => {
  it("creates and renames categories/slots, then previews, cancels and commits actual batch flow", () => {
    const s = seed();
    s.records.reportCabinetCategories = [];
    s.records.reportCabinetSlots = [];
    mount(s, <ReportArchive appointmentIds={["R0", "R1"]} />);
    fireEvent.click(screen.getByRole("button", { name: "新建报告柜类别" }));
    let dialog = screen.getByRole("dialog", { name: "报告柜类别维护" });
    fireEvent.change(within(dialog).getByLabelText("报告柜维护名称"), {
      target: { value: "合成A类" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存报告柜配置" }),
    );
    expect(current().records.reportCabinetCategories[0].name).toBe("合成A类");
    fireEvent.click(screen.getByRole("button", { name: "新建报告柜位" }));
    dialog = screen.getByRole("dialog", { name: "报告柜位维护" });
    fireEvent.change(within(dialog).getByLabelText("报告柜维护名称"), {
      target: { value: "一号柜" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存报告柜配置" }),
    );
    const slot = current().records.reportCabinetSlots[0];
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    fireEvent.click(screen.getByRole("button", { name: "取消本次流转" }));
    expect(current().records.reportArchiveEvents).toBeUndefined();
    expect(current().appointments[0].status).toBe("approved");
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    fireEvent.click(screen.getByRole("button", { name: "确认登记本次流转" }));
    expect(current().records.reportArchiveEvents).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("报告流转动作"), {
      target: { value: "stock_in" },
    });
    fireEvent.change(screen.getByLabelText("目标报告柜位"), {
      target: { value: slot.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    fireEvent.click(screen.getByRole("button", { name: "确认登记本次流转" }));
    expect(current().appointments[0].cabinet).toBe("合成A类/一号柜");
    expect(
      screen.getByRole("button", { name: "删除柜位 一号柜" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "编辑柜位 一号柜" }));
    dialog = screen.getByRole("dialog", { name: "报告柜位维护" });
    fireEvent.change(within(dialog).getByLabelText("报告柜维护名称"), {
      target: { value: "改名柜" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存报告柜配置" }),
    );
    expect(current().appointments[0].cabinet).toBe("合成A类/改名柜");
    fireEvent.click(screen.getByRole("button", { name: "流转历史 R0" }));
    expect(
      screen.getByRole("dialog", { name: "报告流转完整历史" }),
    ).toHaveTextContent("合成A类/一号柜");
  });
  it("requires recipient before preview, then commits issuance metadata and blocks repeated issue", () => {
    const s = apply(seed(), input("print", "P"));
    mount(s, <ReportArchive appointmentIds={["R0"]} />);
    fireEvent.change(screen.getByLabelText("报告流转动作"), {
      target: { value: "issue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    expect(
      screen.queryByRole("dialog", { name: "确认本地报告流转" }),
    ).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("领取人");
    fireEvent.change(screen.getByLabelText("合成报告领取人"), {
      target: { value: "演示领取人" },
    });
    fireEvent.change(screen.getByLabelText("本次合成操作人"), {
      target: { value: "演示发放人员" },
    });
    fireEvent.change(screen.getByLabelText("本次领取方式"), {
      target: { value: "代领" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    fireEvent.click(screen.getByRole("button", { name: "确认登记本次流转" }));
    expect(current().appointments[0]).toMatchObject({
      recipient: "演示领取人",
      deliveredBy: "演示发放人员",
      deliveryMethod: "代领",
    });
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    expect(screen.getByRole("status")).toHaveTextContent("已发放");
  });
});

describe("Report archive interrupted and device flows", () => {
  it("only a successful current kiosk binding event records binding, while print-only and failed operations do not", () => {
    let s = seed();
    s = transition(s, {
      type: "PRINT",
      payload: {
        id: "R0",
        actor: "报告自助机（本地模拟）",
        bound: true,
        boundAt: now,
        source: "kiosk",
      },
    });
    expect(getReportArchive(s, "R0")).toMatchObject({
      printedBy: "报告自助机（本地模拟）",
      boundBy: "报告自助机（本地模拟）",
    });
    expect(
      getReportArchive(s, "R0")
        .history.map((e) => e.operation)
        .sort(),
    ).toEqual(["bind", "print"]);
    s = transition(s, {
      type: "PRINT",
      payload: {
        id: "R1",
        actor: "报告自助机（本地模拟）",
        bound: false,
        source: "kiosk",
      },
    });
    expect(getReportArchive(s, "R1").boundAt).toBe("");
    s.appointments[2].status = "cancelled";
    s = transition(s, {
      type: "PRINT",
      payload: { id: "R2", bound: true, boundAt: now, source: "kiosk" },
    });
    expect(getReportArchive(s, "R2").history).toHaveLength(0);
  });
  it("a reasoned reprint creates a new print version and preserves previous binding in immutable history", () => {
    let s = apply(seed(), input("print", "P"));
    s = apply(s, input("bind", "B"));
    expect(apply(s, input("print", "P2"))).toBe(s);
    s = apply(s, input("print", "P2", { note: "演示重印原因：排版更新" }));
    expect(s.appointments[0].printCount).toBe(2);
    expect(getReportArchive(s, "R0").boundAt).toBe("");
    expect(
      getReportArchive(s, "R0").history.filter((e) => e.operation === "bind"),
    ).toHaveLength(1);
    s = apply(s, input("bind", "B2"));
    expect(
      getReportArchive(s, "R0").history.filter((e) => e.operation === "bind"),
    ).toHaveLength(2);
  });
  it("category and empty-slot deletion are explicitly confirmed and cancellation leaves configuration unchanged", () => {
    const s = seed();
    mount(s, <ReportArchive appointmentIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "删除柜位 A-01" }));
    fireEvent.click(screen.getByRole("button", { name: "取消删除" }));
    expect(current().records.reportCabinetSlots[0].status).toBe("已启用");
    fireEvent.click(screen.getByRole("button", { name: "删除柜位 A-01" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除空柜配置" }));
    expect(
      current().records.reportCabinetSlots.find((s) => s.id === "S1")?.status,
    ).toBe("已删除");
    fireEvent.click(screen.getByRole("button", { name: "删除柜位 A-02" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除空柜配置" }));
    fireEvent.click(screen.getByRole("button", { name: "删除类别 个检档案" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除空柜配置" }));
    expect(current().records.reportCabinetCategories[0].status).toBe("已删除");
  });
  it("changing selected orders during a confirmation prevents applying a stale batch", () => {
    const s = seed();
    localStorage.setItem(key, JSON.stringify(s));
    const { rerender } = render(
      <DemoProvider>
        <ReportArchive appointmentIds={["R0"]} />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    rerender(
      <DemoProvider>
        <ReportArchive appointmentIds={["R1"]} />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "确认登记本次流转" }));
    expect(current().records.reportArchiveEvents).toBeUndefined();
    expect(screen.getByRole("status")).toHaveTextContent("报告选择已变化");
  });
});
