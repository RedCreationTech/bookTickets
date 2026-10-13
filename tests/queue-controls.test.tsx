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

describe("Final queue filter and resume-slip workflows", () => {
  it("filters by real waiting-count bounds and computes transparent bottleneck flags", () => {
    const s = createInitialState();
    s.records.queueTickets = [
      {
        id: "WAIT-LAB",
        department: "采血区",
        appointmentId: s.appointments[0].id,
        status: "waiting",
        position: 0,
      },
      ...[0, 1, 2].map((i) => ({
        id: `WAIT-US-${i}`,
        department: "超声区",
        appointmentId: s.appointments[i].id,
        status: "waiting",
        position: i,
      })),
    ];
    localStorage.setItem(key, JSON.stringify(s));
    mount();
    const table = screen.getByRole("table", { name: "队列筛选结果" });
    fireEvent.change(screen.getByLabelText("候检人数下限"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("候检人数上限"), {
      target: { value: "1" },
    });
    expect(
      within(table).getByRole("checkbox", { name: "选择队列采血区" }),
    ).toBeInTheDocument();
    expect(
      within(table).queryByRole("checkbox", { name: "选择队列超声区" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("候检人数上限"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("瓶颈负荷阈值（分钟）"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用瓶颈阈值" }));
    const ultrasound = within(table)
      .getByRole("checkbox", { name: "选择队列超声区" })
      .closest("tr")!;
    expect(ultrasound).toHaveTextContent("瓶颈队列");
    expect(ultrasound).toHaveTextContent("3 人 × 5 分钟 = 15 分钟");
    expect(
      within(table)
        .getByRole("checkbox", { name: "选择队列采血区" })
        .closest("tr"),
    ).toHaveTextContent("负荷正常");
    expect(state().config.queueBottleneckMinutes).toBe(12);
    fireEvent.change(screen.getByLabelText("候检人数下限"), {
      target: { value: "4" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("下限不能大于上限");
    expect(within(table).queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("issues a unique QR slip, persists pause history and restores the original queue once", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "暂停并生成凭条" })[0],
    );
    expect(
      screen.getByRole("button", { name: "确认暂停并生成凭条" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("中断检查原因"), {
      target: { value: "演示临时离开，稍后继续" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认暂停并生成凭条" }));
    const token = (screen.getByLabelText("演示凭条编号") as HTMLInputElement)
      .value;
    expect(token).toMatch(/^DEMO-RESUME-/);
    expect(
      screen
        .getByTitle("中断检查唯一演示凭条二维码")
        .closest("svg")
        ?.querySelector("path"),
    ).toBeTruthy();
    const record = state().records.queueResumeSlips[0];
    expect(
      state().records.queueTickets.find((t: any) => t.id === record.ticketId)
        .status,
    ).toBe("paused");
    fireEvent.click(screen.getByRole("button", { name: "关闭凭条预览" }));
    fireEvent.click(
      screen.getByRole("button", { name: "超声区", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("扫描模拟 / 输入凭条编号"), {
      target: { value: token },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "核验凭条并恢复原队列" }),
    );
    expect(screen.getByText("采血区候检队列")).toBeInTheDocument();
    expect(
      state().records.queueTickets.find((t: any) => t.id === record.ticketId),
    ).toMatchObject({
      status: "waiting",
      department: "采血区",
      lastResumeToken: token,
    });
    expect(state().records.queueResumeSlips[0].status).toBe("已恢复");
    const count = state().audit.length;
    fireEvent.change(screen.getByLabelText("扫描模拟 / 输入凭条编号"), {
      target: { value: token },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "核验凭条并恢复原队列" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("不能重复使用");
    expect(state().audit).toHaveLength(count);
    expect(
      state().audit.some(
        (entry: any) =>
          entry.entity === record.ticketId &&
          entry.before?.status === "paused" &&
          entry.after?.status === "waiting",
      ),
    ).toBe(true);
  });
  it("blocks unknown tokens and does not consume a slip while its original queue is closed", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "暂停并生成凭条" })[0],
    );
    fireEvent.change(screen.getByLabelText("中断检查原因"), {
      target: { value: "中断演示" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认暂停并生成凭条" }));
    const token = state().records.queueResumeSlips[0].token;
    fireEvent.click(screen.getByRole("button", { name: "关闭凭条预览" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择队列采血区" }));
    fireEvent.click(screen.getByRole("button", { name: "批量关闭" }));
    fireEvent.change(screen.getByLabelText("扫描模拟 / 输入凭条编号"), {
      target: { value: token },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "核验凭条并恢复原队列" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("原科室队列已关闭");
    expect(state().records.queueResumeSlips[0].status).toBe("未恢复");
    fireEvent.change(screen.getByLabelText("扫描模拟 / 输入凭条编号"), {
      target: { value: "UNKNOWN" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "核验凭条并恢复原队列" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("未找到");
  });
});

describe("Precise final queue requirements", () => {
  it("combines queue type and actual passed/completed lower and upper bounds", () => {
    const s = createInitialState();
    s.records.queueDefinitions = [
      {
        id: "采血区",
        name: "采血区",
        department: "采血区",
        zone: "采血区",
        items: ["血常规"],
        minutes: 5,
        enabled: true,
        type: "VIP",
      },
    ];
    s.records.queueTickets = [
      {
        id: "LAB-M",
        department: "采血区",
        appointmentId: s.appointments[0].id,
        status: "missed",
        position: 0,
      },
      {
        id: "LAB-D1",
        department: "采血区",
        appointmentId: s.appointments[1].id,
        status: "done",
        position: 1,
      },
      {
        id: "LAB-D2",
        department: "采血区",
        appointmentId: s.appointments[2].id,
        status: "done",
        position: 2,
      },
      {
        id: "US-M1",
        department: "超声区",
        appointmentId: s.appointments[0].id,
        status: "missed",
        position: 0,
      },
      {
        id: "US-M2",
        department: "超声区",
        appointmentId: s.appointments[1].id,
        status: "missed",
        position: 1,
      },
      {
        id: "US-D",
        department: "超声区",
        appointmentId: s.appointments[2].id,
        status: "done",
        position: 2,
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    mount();
    const table = screen.getByRole("table", { name: "队列筛选结果" });
    const set = (name: string, value: string) =>
      fireEvent.change(screen.getByLabelText(name), { target: { value } });
    set("过检人数下限（演示按过号）", "1");
    set("过检人数上限（演示按过号）", "1");
    set("已检人数下限", "2");
    set("已检人数上限", "2");
    set("队列类型筛选", "VIP");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(1);
    expect(
      within(table)
        .getByRole("checkbox", { name: "选择队列采血区" })
        .closest("tr"),
    ).toHaveTextContent("VIP");
    set("队列类型筛选", "常规");
    expect(within(table).queryAllByRole("checkbox")).toHaveLength(0);
    set("队列类型筛选", "全部类型");
    set("过检人数上限（演示按过号）", "2");
    set("已检人数下限", "1");
    expect(within(table).getAllByRole("checkbox")).toHaveLength(2);
    set("已检人数下限", "3");
    expect(screen.getByRole("alert")).toHaveTextContent("每组下限不能大于上限");
    set("已检人数下限", "1");
    fireEvent.click(screen.getByRole("button", { name: "编辑当前队列" }));
    fireEvent.change(screen.getByLabelText("配置队列类型"), {
      target: { value: "常规" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并应用队列配置" }));
    expect(
      state().records.queueDefinitions.find((q: any) => q.id === "采血区").type,
    ).toBe("常规");
  });
  it("opens browser printing for the slip without consuming it or changing queue/audit counts", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "暂停并生成凭条" })[0],
    );
    fireEvent.change(screen.getByLabelText("中断检查原因"), {
      target: { value: "演示打印凭条" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认暂停并生成凭条" }));
    const before = state();
    const sheet = screen.getByTestId("queue-slip-print-sheet");
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet).toHaveTextContent(before.records.queueResumeSlips[0].token);
    expect(sheet.querySelector("style")?.textContent).toContain(
      "body > :not(.queue-slip-print-sheet)",
    );
    expect(sheet.querySelector("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "浏览器打印凭条" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(state()).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "关闭凭条预览" }));
    expect(screen.queryByTestId("queue-slip-print-sheet")).toBeNull();
    expect(state().records.queueResumeSlips[0].status).toBe("未恢复");
  });
  it("guards pause and resume against two synchronous clicks within the same React batch", () => {
    mount();
    fireEvent.click(
      screen.getAllByRole("button", { name: "暂停并生成凭条" })[0],
    );
    fireEvent.change(screen.getByLabelText("中断检查原因"), {
      target: { value: "同批次双击演示" },
    });
    const pauseButton = screen.getByRole("button", {
      name: "确认暂停并生成凭条",
    });
    act(() => {
      pauseButton.click();
      pauseButton.click();
    });
    expect(state().records.queueResumeSlips).toHaveLength(1);
    const token = state().records.queueResumeSlips[0].token;
    fireEvent.click(screen.getByRole("button", { name: "关闭凭条预览" }));
    fireEvent.change(screen.getByLabelText("扫描模拟 / 输入凭条编号"), {
      target: { value: token },
    });
    const count = state().audit.length;
    const resumeButton = screen.getByRole("button", {
      name: "核验凭条并恢复原队列",
    });
    act(() => {
      resumeButton.click();
      resumeButton.click();
    });
    expect(state().audit.length - count).toBe(2);
    expect(state().records.queueResumeSlips[0].status).toBe("已恢复");
    fireEvent.click(
      screen.getAllByRole("button", { name: "暂停并生成凭条" })[0],
    );
    fireEvent.change(screen.getByLabelText("中断检查原因"), {
      target: { value: "重新打开弹窗后允许新暂停" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认暂停并生成凭条" }));
    expect(state().records.queueResumeSlips).toHaveLength(2);
    expect(
      new Set(state().records.queueResumeSlips.map((r: any) => r.token)).size,
    ).toBe(2);
  });
});

describe("C-group guide workflow requirements", () => {
  it("tracks configured focused departments using actual completion progress", () => {
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "关注科室采血区" }));
    const table = screen.getByRole("table", { name: "重点科室进度统计" });
    expect(table).toHaveTextContent("0 / 2");
    expect(table).toHaveTextContent("0%");
    fireEvent.click(screen.getAllByRole("button", { name: "完成出队" })[0]);
    expect(table).toHaveTextContent("1 / 2");
    expect(table).toHaveTextContent("50%");
    expect(state().config.queueFocusIds).toContain("采血区");
  });
  it("preserves fixed ultrasound numbers while masking names and uses configured pronunciation for simulated calls", () => {
    mount();
    fireEvent.click(screen.getByText("固定超声号与姓名多音字"));
    fireEvent.change(screen.getByLabelText("固定超声号"), {
      target: { value: "US-0088" },
    });
    fireEvent.change(screen.getByLabelText("姓名模拟呼叫读音"), {
      target: { value: "lin2 zhi1 yuan3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存固定号与读音" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "隐藏姓名中间字（大屏同步）" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "超声区", exact: true }),
    );
    expect(screen.getByText("林*远 · 超声号 US-0088")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "呼叫 / 重呼" })[0]);
    expect(screen.getByLabelText("本次模拟呼叫读音")).toHaveTextContent(
      "lin2 zhi1 yuan3",
    );
    expect(
      state().records.queueTickets.find((t: any) => t.status === "calling")
        .spokenText,
    ).toContain("lin2 zhi1 yuan3");
    fireEvent.click(screen.getByRole("button", { name: "下移林知远" }));
    expect(state().records.queuePatientPreferences[0].ultrasoundNumber).toBe(
      "US-0088",
    );
    fireEvent.change(screen.getByLabelText("呼叫信息客户"), {
      target: { value: "P002" },
    });
    fireEvent.change(screen.getByLabelText("固定超声号"), {
      target: { value: "US-0088" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存固定号与读音" }));
    expect(
      screen.getByText("该固定超声号已被其他客户使用。"),
    ).toBeInTheDocument();
    expect(state().records.queuePatientPreferences).toHaveLength(1);
  });
  it("executes queue schedules against an explicit clock, closing on the boundary and avoiding repeated writes", () => {
    mount();
    fireEvent.click(screen.getByText("定时队列开关 · 演示时钟"));
    fireEvent.change(screen.getByLabelText("每日关闭时间"), {
      target: { value: "09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存队列定时计划" }));
    fireEvent.change(screen.getByLabelText("导检演示时钟（UTC）"), {
      target: { value: "2026-10-13T08:59" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "推进导检演示时钟并执行" }),
    );
    expect(state().config.queueOpen["采血区"]).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    fireEvent.change(screen.getByLabelText("导检演示时钟（UTC）"), {
      target: { value: "2026-10-13T09:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "推进导检演示时钟并执行" }),
    );
    expect(state().config.queueOpen["采血区"]).toBe(false);
    expect(
      state().records.queueTickets.some(
        (t: any) => t.department === "采血区" && t.status === "calling",
      ),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeDisabled();
    const auditCount = state().audit.length;
    fireEvent.click(
      screen.getByRole("button", { name: "推进导检演示时钟并执行" }),
    );
    expect(state().audit).toHaveLength(auditCount);
  });
  it("enforces guide-user queue scopes, counts actual local doctor sessions, and disables logins immediately", () => {
    mount();
    fireEvent.click(screen.getByText("维护导检用户"));
    fireEvent.change(screen.getByLabelText("导检用户名称"), {
      target: { value: "合成超声医生" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "授权超声区" }));
    fireEvent.click(screen.getByRole("button", { name: "保存导检用户" }));
    fireEvent.click(
      screen.getByRole("button", { name: "模拟登录 合成超声医生" }),
    );
    expect(screen.getByTestId("online-guide-doctors")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "超声区", exact: true }),
    );
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    expect(
      state().records.queueTickets.find((t: any) => t.status === "calling")
        .guideUserId,
    ).toBe(state().records.guideUsers[0].id);
    fireEvent.click(
      screen.getByRole("button", { name: "编辑用户 合成超声医生" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "启用导检用户" }));
    fireEvent.click(screen.getByRole("button", { name: "保存导检用户" }));
    expect(
      screen.getByRole("button", { name: "模拟登录 合成超声医生" }),
    ).toBeDisabled();
    expect(screen.getByTestId("online-guide-doctors")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeDisabled();
    expect(state().records.guideSessions[0].status).toBe("offline");
    fireEvent.click(screen.getByRole("button", { name: "切回管理员演示会话" }));
    expect(screen.getByRole("button", { name: "呼叫下一位" })).toBeEnabled();
  });
});
