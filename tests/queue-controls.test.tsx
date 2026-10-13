// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Queue from "../src/modules/Queue";
import { createInitialState, DemoProvider } from "../src/store";
const key = "hongchuang.health.demo.v1";
const state = () => JSON.parse(localStorage.getItem(key) || "{}");
const mount = (isScreen = false) =>
  render(
    <DemoProvider>
      <Queue screen={isScreen} />
    </DemoProvider>,
  );
describe("Queue controls and display effects", () => {
  it("batch closing suspends calls and prevents adding/calling; reopening permits dispatch", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    expect(
      state().records.queueTickets.some((t: any) => t.status === "calling"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "选择队列采血区" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择队列超声区" }));
    fireEvent.click(screen.getByRole("button", { name: "批量关闭" }));
    expect(state().config.queueOpen).toMatchObject({
      采血区: false,
      超声区: false,
    });
    expect(
      state().records.queueTickets.some((t: any) => t.status === "calling"),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "手动入队" })).toBeDisabled();
    expect(
      within(screen.getByRole("region", { name: "当前呼叫大屏" })).getByText(
        "队列已关闭",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批量开启" }));
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeEnabled();
  });
  it("clears passed clients only after confirmation while preserving waiting/done and audit history", () => {
    const s = createInitialState();
    s.records.queueTickets = [
      {
        id: "W",
        department: "采血区",
        appointmentId: s.appointments[0].id,
        status: "waiting",
        position: 0,
      },
      {
        id: "M",
        department: "采血区",
        appointmentId: s.appointments[5].id,
        status: "missed",
        position: 1,
        reason: "暂离",
      },
      {
        id: "D",
        department: "采血区",
        appointmentId: s.appointments[2].id,
        status: "done",
        position: 2,
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "选择队列采血区" }));
    fireEvent.click(screen.getByRole("button", { name: "清空过检客户" }));
    expect(
      state().records.queueTickets.find((t: any) => t.id === "M").status,
    ).toBe("missed");
    fireEvent.click(screen.getByRole("button", { name: "确认清空" }));
    expect(
      state().records.queueTickets.find((t: any) => t.id === "M"),
    ).toMatchObject({ status: "cleared", previousStatus: "missed" });
    expect(
      state().records.queueTickets.find((t: any) => t.id === "W").status,
    ).toBe("waiting");
    expect(
      state().records.queueTickets.find((t: any) => t.id === "D").status,
    ).toBe("done");
    expect(
      state().audit.some(
        (r: any) =>
          r.entity === "M" &&
          r.before.status === "missed" &&
          r.after.status === "cleared",
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "清空全部客户" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清空" }));
    expect(
      state().records.queueTickets.every((t: any) => t.status === "cleared"),
    ).toBe(true);
    expect(screen.getByText("当前科室队列已清空")).toBeInTheDocument();
  });
  it("consumes department and room mappings in actual call assignment and screen directions", () => {
    const s = createInitialState();
    s.records.guideDepartments = [
      {
        id: "DEP",
        name: "新检验科",
        code: "LAB",
        items: "血常规",
        zone: "三层检验区",
        minutes: 8,
        sex: "不限",
        status: "已启用",
      },
    ];
    s.records.guideZones = [
      {
        id: "ZONE",
        name: "三层检验区",
        campus: "东院区",
        floor: "3F",
        directions: "电梯右侧",
        status: "已启用",
      },
    ];
    s.records.guideRooms = [
      {
        id: "ROOM",
        name: "检验 301 室",
        department: "新检验科",
        zone: "三层检验区",
        capacity: 1,
        status: "已启用",
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    expect(
      state().records.queueTickets.find((t: any) => t.status === "calling"),
    ).toMatchObject({
      roomId: "ROOM",
      roomName: "检验 301 室",
      zone: "三层检验区",
    });
    expect(
      screen.getByRole("region", { name: "当前呼叫大屏" }),
    ).toHaveTextContent("东院区 3F 三层检验区 · 电梯右侧");
  });
  it("creates a genuine configured queue and uses its project rule to select eligible appointments", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "新建业务队列" }));
    const dialog = screen.getByRole("dialog", { name: "业务队列配置" });
    for (const [label, value] of [
      ["队列名称", "肝功能专检"],
      ["所属科室", "生化科"],
      ["所属区域", "二层生化区"],
      ["平均服务分钟", "7"],
    ])
      fireEvent.change(within(dialog).getByLabelText(label), {
        target: { value },
      });
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "肝功能", exact: true }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存并应用队列配置" }),
    );
    expect(
      screen.getByRole("button", { name: "肝功能专检", exact: true }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "手动入队" }));
    fireEvent.click(screen.getByRole("button", { name: "确认入队" }));
    const def = state().records.queueDefinitions[0];
    expect(
      state().records.queueTickets.find((t: any) => t.department === def.id),
    ).toMatchObject({ status: "waiting", waitMinutes: 7 });
    expect(screen.getByText("肝功能专检候检队列")).toBeInTheDocument();
  });
  it("saves a doctor introduction and displays it on the actual screen", () => {
    mount();
    fireEvent.change(screen.getByLabelText("演示医生姓名"), {
      target: { value: "演示周医生" },
    });
    fireEvent.change(screen.getByLabelText("演示医生简介"), {
      target: { value: "合成说明：负责心电演示检查。" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "保存并同步大屏医生资料" }),
    );
    expect(
      screen.getByRole("region", { name: "当前呼叫大屏" }),
    ).toHaveTextContent("合成说明：负责心电演示检查。");
    expect(state().config.queueDoctor.name).toBe("演示周医生");
  });
  it("automatically scrolls long waiting and missed lists and pauses when disabled", () => {
    vi.useFakeTimers();
    mount(true);
    const waiting = screen.getByRole("region", { name: "等待客户滚动列表" });
    const missed = screen.getByRole("region", { name: "过检客户滚动列表" });
    for (const region of [waiting, missed]) {
      Object.defineProperty(region, "scrollHeight", {
        configurable: true,
        value: 900,
      });
      Object.defineProperty(region, "clientHeight", {
        configurable: true,
        value: 340,
      });
    }
    act(() => vi.advanceTimersByTime(600));
    expect(waiting.scrollTop).toBe(10);
    expect(missed.scrollTop).toBe(10);
    fireEvent.click(screen.getByRole("checkbox", { name: "大屏列表自动滚动" }));
    act(() => vi.advanceTimersByTime(600));
    expect(waiting.scrollTop).toBe(10);
    expect(missed.scrollTop).toBe(10);
    expect(screen.queryByRole("button", { name: "呼叫下一位" })).toBeNull();
    vi.useRealTimers();
  });
});

it("prefers a customer type's queue area unless the dispatcher explicitly chooses a room", () => {
  const s = createInitialState();
  s.appointments[0].preferredQueueArea = "VIP 区";
  s.records.guideRooms = [
    {
      id: "NORMAL",
      name: "普通采血室",
      department: "采血区",
      zone: "普通区",
      status: "已启用",
    },
    {
      id: "VIP",
      name: "专属采血室",
      department: "采血区",
      zone: "VIP 区",
      status: "已启用",
    },
  ];
  localStorage.setItem(key, JSON.stringify(s));
  mount();
  fireEvent.click(screen.getAllByRole("button", { name: "呼叫 / 重呼" })[0]);
  expect(
    state().records.queueTickets.find((t: any) => t.status === "calling")
      .roomId,
  ).toBe("VIP");
  fireEvent.change(screen.getByLabelText("呼叫诊室"), {
    target: { value: "NORMAL" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "呼叫 / 重呼" })[0]);
  expect(
    state().records.queueTickets.find((t: any) => t.status === "calling")
      .roomId,
  ).toBe("NORMAL");
});
