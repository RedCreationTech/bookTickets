// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { DemoProvider, useDemo, createInitialState, today } from "../src/store";
import {
  Analytics,
  GroupImport,
  parseCsvText,
  validateGroupCsv,
  auditKind,
} from "../src/modules/Advanced";
function Probe() {
  const { state } = useDemo();
  return <pre data-testid="advanced-state">{JSON.stringify(state)}</pre>;
}
function mount(node: React.ReactNode) {
  return render(
    <DemoProvider>
      {node}
      <Probe />
    </DemoProvider>,
  );
}
function state() {
  return JSON.parse(screen.getByTestId("advanced-state").textContent || "{}");
}
function dateAhead() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
const headers = "姓名,证件标识,套餐,分组,日期,时段,院区";
const validLine = () =>
  `林知远,DEMO-P001,PK01,星辰科技,${dateAhead()},08:00–08:30,中心院区`;
beforeEach(() => localStorage.clear());
afterEach(() => cleanup());
describe("Validated group CSV import", () => {
  it("parses UTF-8 BOM, escaped delimiters and multiline fields with physical line numbers", () => {
    const parsed = parseCsvText(
      '\uFEFF姓名,备注\r\n林知远,"第一行,含逗号\n第二行"\r\n苏清禾,"包含""引号"""',
    );
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows[1].cells[1]).toBe("第一行,含逗号\n第二行");
    expect(parsed.rows[2].line).toBe(4);
    expect(parsed.rows[2].cells[1]).toBe('包含"引号"');
    expect(parseCsvText('姓名,备注\n林知远,"未关闭').error).toContain(
      "未闭合引号",
    );
  });
  it("reports invalid identity, missing package/group, bad dates and duplicate row errors without mutating state", () => {
    const initial = createInitialState();
    const text =
      headers +
      "\n" +
      validLine() +
      "\n" +
      validLine() +
      "\n" +
      `姓名不匹配,真实证件禁止,PK999,不存在,2026-02-31,22:00–08:00,不存在院区`;
    const result = validateGroupCsv(text, initial);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[1].errors.join()).toContain("同一文件");
    expect(result.rows[2].errors.join()).toContain("禁止真实证件号");
    expect(result.rows[2].errors.join()).toContain("套餐编号或名称不存在");
    expect(result.rows[2].errors.join()).toContain("日期格式或值错误");
    expect(result.rows[2].line).toBe(4);
    expect(initial.appointments).toHaveLength(8);
  });
  it("rejects total daily capacity overflow including a zero-capacity closed day", () => {
    const initial = createInitialState();
    initial.config.dailyCapacity = 0;
    expect(
      validateGroupCsv(
        headers + "\n" + validLine(),
        initial,
      ).rows[0].errors.join(),
    ).toContain("超过该日预约容量");
  });
  it("requires preview and explicit confirmation, creates mapped appointments once, and rejects reimport duplicates", () => {
    const done = vi.fn();
    mount(<GroupImport onComplete={done} />);
    fireEvent.change(screen.getByLabelText("团检 CSV 内容"), {
      target: { value: headers + "\n" + validLine() },
    });
    expect(
      screen
        .getByRole("button", { name: "确认创建 0 条预约" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "校验名单" }));
    expect(
      screen
        .getByRole("button", { name: "确认创建 1 条预约" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "确认创建 1 条预约" }));
    expect(state().appointments).toHaveLength(9);
    const imported = state().appointments[0];
    expect(imported.patientId).toBe("P001");
    expect(imported.packageId).toBe("PK01");
    expect(imported.amount).toBe(399);
    expect(imported.group).toBe("星辰科技");
    expect(imported.source).toBe("团检 CSV 导入");
    expect(done).toHaveBeenCalledExactlyOnceWith(1);
    fireEvent.click(screen.getByRole("button", { name: "已完成导入" }));
    expect(state().appointments).toHaveLength(9);
    fireEvent.change(screen.getByLabelText("团检 CSV 内容"), {
      target: { value: headers + "\n" + validLine() + "\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "校验名单" }));
    expect(screen.getByText("该客户在此日期和院区已有有效预约")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("never submits a partially invalid batch", () => {
    mount(<GroupImport />);
    fireEvent.change(screen.getByLabelText("团检 CSV 内容"), {
      target: {
        value:
          headers +
          "\n" +
          validLine() +
          "\n" +
          `坏客户,DEMO-P999,PK01,星辰科技,${dateAhead()},08:00–08:30,中心院区`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "校验名单" }));
    expect(screen.getByText("证件标识未匹配现有演示客户")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "确认创建 1 条预约" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(state().appointments).toHaveLength(8);
  });
});
describe("Audit-driven workload analytics", () => {
  it("classifies structured and legacy events including actual alert resolution", () => {
    expect(auditKind({ action: "CREATE_APPOINTMENT", message: "opaque" })).toBe(
      "开单",
    );
    expect(auditKind({ message: "总检通过 TJ1001" })).toBe("审核");
    expect(
      auditKind({
        action: "UPSERT_RECORD",
        entity: "ALERT-1",
        before: { status: "待处理" },
        after: { status: "已处理" },
        message: "alerts：保存",
      }),
    ).toBe("异常处置");
    expect(
      auditKind({
        action: "UPSERT_RECORD",
        entity: "ALERT-1",
        before: { status: "已处理" },
        after: { status: "已处理" },
        message: "alerts：保存",
      }),
    ).toBe("其他操作");
  });
  it("aggregates the actual audit records and filters operator and business type", () => {
    const initial = createInitialState();
    initial.audit = [
      {
        id: "a1",
        time: today() + "T08:00:00Z",
        actor: "前台甲",
        action: "CREATE_APPOINTMENT",
        message: "创建预约 TJ1001",
        entity: "TJ1001",
        before: null,
        after: { status: "booked" },
      },
      {
        id: "a2",
        time: today() + "T08:01:00Z",
        actor: "前台甲",
        action: "CREATE_APPOINTMENT",
        message: "创建预约 TJ1002",
        entity: "TJ1002",
      },
      {
        id: "a3",
        time: today() + "T09:00:00Z",
        actor: "医生乙",
        action: "REVIEW",
        message: "主检通过 TJ1001",
        entity: "TJ1001",
        before: { status: "review" },
        after: { status: "approved" },
      },
      {
        id: "a4",
        time: today() + "T09:01:00Z",
        actor: "医生乙",
        action: "PRINT",
        message: "模拟打印并装订报告 TJ1001",
      },
    ];
    localStorage.setItem("qinghe.health.demo.v1", JSON.stringify(initial));
    mount(<Analytics />);
    const workload = screen.getByRole("table", { name: "人员工作量" });
    expect(within(workload).getAllByRole("row")).toHaveLength(3);
    let clerk = within(workload).getByText("前台甲").closest("tr")!;
    expect(within(clerk).getAllByRole("cell")[1].textContent).toBe("2");
    let doctor = within(workload).getByText("医生乙").closest("tr")!;
    expect(within(doctor).getAllByRole("cell")[3].textContent).toBe("1");
    expect(within(doctor).getAllByRole("cell")[4].textContent).toBe("1");
    fireEvent.change(screen.getByLabelText("工作量操作人"), {
      target: { value: "医生乙" },
    });
    expect(within(workload).queryByText("前台甲")).toBeNull();
    fireEvent.change(screen.getByLabelText("工作量业务类型"), {
      target: { value: "审核" },
    });
    const events = screen.getByRole("table", { name: "操作事件" });
    expect(within(events).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(within(events).getByRole("button", { name: "查看变更" }));
    const dialog = screen.getByRole("dialog", { name: "审计事件详情" });
    expect(dialog.textContent).toContain("review");
    expect(dialog.textContent).toContain("approved");
  });
});
