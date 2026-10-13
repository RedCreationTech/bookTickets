// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DemoProvider, createInitialState, reducer } from "../src/store";
import {
  PrintDesk,
  ExpiryDesk,
  GynecologySpecimens,
  getDeferredCandidates,
} from "../src/modules/ExecutionDesk";
const key = "hongchuang.health.demo.v1";
const data = () => JSON.parse(localStorage.getItem(key) || "{}");
function mount(node: React.ReactNode) {
  return render(<DemoProvider>{node}</DemoProvider>);
}
function set(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function setDeferred() {
  const s = createInitialState();
  s.appointments[0].deferredExam = {
    dueDate: "2026-10-12",
    items: ["肾功能", "血脂四项", "空腹血糖", "心电图", "腹部彩超"],
    status: "待改日检",
    scheduledAt: "2026-10-01T00:00:00Z",
  };
  s.appointments[5].deferredExam = {
    dueDate: "2026-10-16",
    items: [...s.appointments[5].items],
    status: "待改日检",
    scheduledAt: "2026-10-01T00:00:00Z",
  };
  s.appointments[4].locked = true;
  s.appointments[4].deferredExam = {
    dueDate: "2026-10-10",
    items: [...s.appointments[4].items],
    status: "待改日检",
    scheduledAt: "2026-10-01T00:00:00Z",
  };
  localStorage.setItem(key, JSON.stringify(s));
  return s;
}
describe("Print execution desk", () => {
  it("consumes automatic order-created tasks then confirms local execution with persisted target and prevents repeats", () => {
    const s = reducer(createInitialState(), {
      type: "CREATE_APPOINTMENT",
      payload: { id: "TJ-AUTO-PRINT", patientId: "P001", packageId: "PK01" },
    });
    expect(s.records.printTasks).toHaveLength(3);
    localStorage.setItem(key, JSON.stringify(s));
    mount(<PrintDesk />);
    fireEvent.click(screen.getByRole("button", { name: "选择当前待处理任务" }));
    fireEvent.click(screen.getByRole("button", { name: "执行选中模拟打印" }));
    expect(
      data().records.printTasks.every((t: any) => t.status === "已模拟打印"),
    ).toBe(true);
    expect(
      data().records.printTasks.find((t: any) => t.kind === "检验条码").target,
    ).toBe("DEMO-BARCODE-01");
    expect(
      data().records.printTasks.find((t: any) => t.kind === "导检单").target,
    ).toBe("DEMO-A4-01");
    fireEvent.click(screen.getByRole("button", { name: "选择当前待处理任务" }));
    expect(
      screen.getByRole("button", { name: "执行选中模拟打印" }),
    ).toBeDisabled();
    expect(
      data().records.printTasks.every((t: any) => t.attempts.length === 1),
    ).toBe(true);
  });
  it("generates batch tasks for a selected company and deduplicates repeated generation", () => {
    mount(<PrintDesk />);
    set("单位筛选", "星辰科技");
    fireEvent.click(screen.getByRole("button", { name: "选择当前筛选订单" }));
    fireEvent.click(screen.getByRole("button", { name: "批量生成打印任务" }));
    expect(data().records.printTasks).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "批量生成打印任务" }));
    expect(data().records.printTasks).toHaveLength(6);
    expect(
      new Set(data().records.printTasks.map((t: any) => t.appointmentId)).size,
    ).toBe(2);
  });
  it("applies photo visibility, column ordering and chosen targets to the actual guide preview", () => {
    const s = createInitialState();
    s.records.printTasks = [
      {
        id: "PRINT-GUIDE",
        appointmentId: s.appointments[0].id,
        kind: "导检单",
        status: "待模拟打印",
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    mount(<PrintDesk />);
    fireEvent.click(screen.getByText("打印目标与版式设置"));
    set("导检单照片显示", "id");
    set("A4 模拟打印目标", "DEMO-A4-TEST");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "显示单位", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "上移姓名表头" }));
    fireEvent.click(screen.getByRole("button", { name: "保存打印版式与目标" }));
    fireEvent.click(screen.getByRole("button", { name: "预览任务" }));
    const preview = screen.getByRole("dialog", { name: "打印任务预览" });
    expect(
      within(preview).getByRole("img", { name: "证件照抽象合成示意" }),
    ).toBeInTheDocument();
    expect(
      within(preview).queryByRole("img", { name: "现场照抽象合成示意" }),
    ).toBeNull();
    expect(within(preview).getAllByRole("columnheader")[0]).toHaveTextContent(
      "姓名",
    );
    expect(
      within(preview).queryByRole("columnheader", { name: "单位" }),
    ).toBeNull();
    expect(preview).toHaveTextContent("DEMO-A4-TEST");
    expect(data().config.printPhotoMode).toBe("id");
  });
  it("previews a genuine QR payload and retains failed print attempt history through retry", () => {
    const s = createInitialState();
    s.records.printTasks = [
      {
        id: "PRINT-CODE",
        appointmentId: s.appointments[0].id,
        kind: "检验条码",
        status: "待模拟打印",
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    mount(<PrintDesk />);
    fireEvent.click(screen.getByRole("button", { name: "预览任务" }));
    expect(
      screen
        .getByTitle("检验条码演示二维码")
        .closest("svg")
        ?.querySelector("path"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭预览" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "模拟首个任务失败" }));
    fireEvent.click(screen.getByRole("button", { name: "选择当前待处理任务" }));
    fireEvent.click(screen.getByRole("button", { name: "执行选中模拟打印" }));
    expect(data().records.printTasks[0].status).toBe("模拟失败");
    fireEvent.click(screen.getByRole("button", { name: "重试模拟打印" }));
    expect(data().records.printTasks[0].status).toBe("已模拟打印");
    expect(data().records.printTasks[0].attempts).toHaveLength(2);
    expect(data().records.printTasks[0].attempts[0].status).toBe("模拟失败");
  });
});
describe("Deferred exam expiry execution", () => {
  it("creates explicit deferred arrangements and preserves existing result data", () => {
    const s = createInitialState();
    mount(<ExpiryDesk />);
    set("改日检订单", s.appointments[0].id);
    set("改日检到期日期", "2026-10-20");
    fireEvent.click(screen.getByRole("button", { name: "保存改日检安排" }));
    const a = data().appointments[0];
    expect(a.deferredExam.dueDate).toBe("2026-10-20");
    expect(a.deferredExam.items).not.toContain("一般检查");
    expect(a.results).toEqual(s.appointments[0].results);
  });
  it("uses configurable reminder windows and creates one local reminder per due date", () => {
    setDeferred();
    mount(<ExpiryDesk />);
    fireEvent.click(
      screen.getByRole("button", { name: "生成临期模拟短信提醒" }),
    );
    expect(data().records.controlNotifications).toHaveLength(1);
    expect(data().records.controlNotifications[0].content).toContain(
      "2026-10-16",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "生成临期模拟短信提醒" }),
    );
    expect(data().records.controlNotifications).toHaveLength(1);
    set("提前提醒天数", "2");
    fireEvent.click(screen.getByRole("button", { name: "保存窗口与模拟日期" }));
    expect(data().config.deferredReminderDays).toBe(2);
    expect(
      screen.getByRole("button", { name: "生成临期模拟短信提醒" }),
    ).toBeDisabled();
  });
  it("requires confirmation before waiving only unfinished projects, preserves results and never processes locked reports", () => {
    const s = setDeferred();
    mount(<ExpiryDesk />);
    expect(
      screen.getByRole("checkbox", {
        name: `选择到期订单${s.appointments[4].id}`,
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "选择可处理过期订单" }));
    fireEvent.click(screen.getByRole("button", { name: "预览到期弃检并送审" }));
    expect(data().appointments[0].status).toBe("in_exam");
    expect(data().records.deferredExecutions).toBeUndefined();
    fireEvent.click(
      screen.getByRole("button", { name: "确认执行本地到期处理" }),
    );
    const a = data().appointments[0];
    expect(a.status).toBe("review");
    expect(a.reviewStage).toBe(0);
    expect(a.results).toEqual(s.appointments[0].results);
    expect(a.items).toEqual(["一般检查", "血常规", "肝功能"]);
    expect(a.waived).toEqual(expect.arrayContaining(["肾功能", "腹部彩超"]));
    expect(data().appointments[4]).toEqual(s.appointments[4]);
    expect(data().records.deferredExecutions).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "选择可处理过期订单" }));
    expect(
      screen.getByRole("button", { name: "预览到期弃检并送审" }),
    ).toBeDisabled();
    expect(data().records.deferredExecutions).toHaveLength(1);
  });
  it("excludes customers who arrived, fully completed orders, and non-admin execution", () => {
    const s = setDeferred();
    s.appointments[0].deferredExam.arrivedAt = "2026-10-12T00:00:00Z";
    expect(
      getDeferredCandidates(s, "2026-10-13", 3).find(
        (r) => r.appointment.id === s.appointments[0].id,
      )?.blocked,
    ).toBe(true);
    s.appointments[0].deferredExam.arrivedAt = undefined;
    s.config.role = "doctor";
    localStorage.setItem(key, JSON.stringify(s));
    mount(<ExpiryDesk />);
    fireEvent.click(screen.getByRole("button", { name: "选择可处理过期订单" }));
    fireEvent.click(screen.getByRole("button", { name: "预览到期弃检并送审" }));
    fireEvent.click(
      screen.getByRole("button", { name: "确认执行本地到期处理" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("仅限管理员");
    expect(data().appointments[0].status).toBe("in_exam");
  });
  it("shares gynecology specimen records, blocks duplicate sample confirmation and renders pathology QR", () => {
    const s = createInitialState();
    s.appointments[0].items.push("妇科 TCT");
    localStorage.setItem(key, JSON.stringify(s));
    mount(<GynecologySpecimens />);
    expect(screen.getByText("待采标本 · 请确认勿漏采")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认妇科模拟采集" }));
    expect(data().records.reportSpecimens[0]).toMatchObject({
      appointmentId: s.appointments[0].id,
      specimenType: "妇科病理",
      status: "已采集",
    });
    expect(
      screen.getByRole("button", { name: "确认妇科模拟采集" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "预览病理条码" }));
    expect(
      screen.getByRole("dialog", { name: "病理标本条码预览" }),
    ).toHaveTextContent("已采集");
    expect(
      screen
        .getByTitle("妇科病理标本演示二维码")
        .closest("svg")
        ?.querySelector("path"),
    ).toBeTruthy();
  });
});
