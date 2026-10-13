// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createInitialState, DemoProvider, useDemo } from "../src/store";
import type { DemoState } from "../src/model";
import Patient from "../src/modules/Patient";
import Kiosk from "../src/modules/Kiosk";
import MessageWorkbench, {
  PatientConversation,
} from "../src/modules/MessageWorkbench";
import PatientBookingSettings from "../src/modules/PatientBookingSettings";
import {
  anonymizedBookingResourceUsage,
  getBookingAvailability,
  getBookingDates,
} from "../src/bookingRules";
import {
  displayedItemPrice,
  displayedPackagePrice,
} from "../src/bookingDisplay";
const KEY = "hongchuang.health.demo.v1",
  DATE = "2026-10-14",
  TIME = "08:00-08:30";
function seed() {
  const state = createInitialState();
  state.config.bookingClock = "2026-10-13T15:00:00Z";
  state.config.releaseHour = "00:00";
  state.appointments = [];
  return state;
}
function Probe() {
  const { state, act } = useDemo();
  return (
    <>
      <pre hidden data-testid="state">
        {JSON.stringify(state)}
      </pre>
      <button
        onClick={() =>
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "articles",
              record: { id: "A", status: "已下线" },
            },
          })
        }
      >
        撤回文章A
      </button>
      <button
        onClick={() =>
          act({ type: "UPDATE_CONFIG", payload: { weekendAllowed: true } })
        }
      >
        开放周末
      </button>
    </>
  );
}
function mount(node: React.ReactNode, state: DemoState = seed()) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.history.replaceState({}, "", "#/patient");
  return render(
    <DemoProvider>
      {node}
      <Probe />
    </DemoProvider>,
  );
}
const current = (): DemoState =>
  JSON.parse(screen.getByTestId("state").textContent || "{}");
const click = (name: string | RegExp) =>
  fireEvent.click(
    screen.getByRole("button", { name, exact: typeof name === "string" }),
  );
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
function booking() {
  click("开启健康计划");
  change("预约日期", DATE);
}
function oldOrder(state: DemoState, values: Record<string, unknown> = {}) {
  return {
    ...createInitialState().appointments[0],
    id: "USED",
    patientId: "P002",
    date: DATE,
    time: TIME,
    status: "booked" as const,
    packageId: state.packages[0].id,
    packageIds: [state.packages[0].id],
    items: ["一般检查", "血常规"],
    ...values,
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("T0005/T0011 published education and persistent two-way conversations", () => {
  it("two different published article bodies are shared with H5; draft/future/withdrawn bodies never appear", () => {
    const s = seed();
    s.records.articles = [
      {
        id: "A",
        name: "科普文章甲",
        category: "健康文章",
        date: "2026-10-12",
        status: "已发布",
        description: "甲正文独立内容\n第二段甲",
        owner: "演示编辑",
      },
      {
        id: "B",
        name: "科普文章乙",
        category: "健康文章",
        date: "2026-10-13",
        status: "已发布",
        description: "乙正文不同内容",
      },
      {
        id: "C",
        name: "草稿保密",
        status: "草稿",
        description: "不能出现草稿正文",
      },
      {
        id: "D",
        name: "未来内容",
        status: "已发布",
        date: "2027-01-01",
        description: "未到发布日",
      },
    ];
    mount(<Patient />, s);
    click(/科普文章甲/);
    expect(screen.getByLabelText("已发布文章正文").textContent).toContain(
      "甲正文独立内容",
    );
    click("科普文章乙");
    expect(screen.getByLabelText("已发布文章正文").textContent).toContain(
      "乙正文不同内容",
    );
    expect(screen.queryByText("甲正文独立内容")).toBeNull();
    click("科普文章甲");
    click("撤回文章A");
    expect(screen.queryByLabelText("已发布文章正文")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("已撤回");
    expect(screen.queryByText("草稿保密")).toBeNull();
    expect(screen.queryByText("未来内容")).toBeNull();
  });
  it("patient message, staff reply and reload use the exact same durable thread; other patients isolated", () => {
    const s = seed();
    const page = mount(<PatientConversation patientId="P001" />, s);
    change("留言内容", "合成留言：到院入口在哪里？");
    click("提交留言");
    expect(current().records.patientMessages).toHaveLength(1);
    page.rerender(
      <DemoProvider>
        <MessageWorkbench />
        <Probe />
      </DemoProvider>,
    );
    expect(screen.getByText("合成留言：到院入口在哪里？")).toBeTruthy();
    change("回复内容", "合成回复：请从中心院区演示入口进入。");
    click("发送回复");
    expect(current().records.patientMessages).toHaveLength(2);
    page.unmount();
    mount(
      <PatientConversation patientId="P001" />,
      JSON.parse(localStorage.getItem(KEY)!),
    );
    expect(
      screen.getByText("合成回复：请从中心院区演示入口进入。"),
    ).toBeTruthy();
    cleanup();
    mount(
      <PatientConversation patientId="P002" />,
      JSON.parse(localStorage.getItem(KEY)!),
    );
    expect(screen.queryByText("合成留言：到院入口在哪里？")).toBeNull();
    expect(
      screen.queryByText("合成回复：请从中心院区演示入口进入。"),
    ).toBeNull();
  });
  it("cancelled drafts do not send and double activation creates only one message", () => {
    mount(<PatientConversation patientId="P001" />);
    change("留言内容", "取消的演示草稿");
    click("取消草稿");
    expect(current().records.patientMessages || []).toHaveLength(0);
    change("留言内容", "只发送一次");
    const submit = screen.getByRole("button", { name: "提交留言" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(current().records.patientMessages).toHaveLength(1);
  });
});

describe("T0051 resource quotas and T0054 date selection", () => {
  it("package daily and shared-project daily limits independently block and cancellation releases quota", () => {
    const s = seed();
    s.appointments = [oldOrder(s)];
    s.records.bookingResourceLimits = [
      {
        id: "PK",
        kind: "package",
        resourceId: s.packages[0].id,
        dailyCapacity: 1,
      },
      { id: "IT", kind: "item", resourceId: "血常规", dailyCapacity: 1 },
    ];
    expect(
      getBookingAvailability(s, DATE, undefined, {
        packageIds: [s.packages[0].id],
      }).error,
    ).toContain("套餐");
    expect(
      getBookingAvailability(s, DATE, undefined, {
        packageIds: [s.packages[1].id],
        items: ["血常规"],
      }).error,
    ).toContain("项目「血常规」");
    expect(
      getBookingAvailability(s, DATE, "USED", {
        packageIds: [s.packages[0].id],
        items: ["血常规"],
      }).allowed,
    ).toBe(true);
    s.appointments[0].status = "cancelled";
    expect(
      getBookingAvailability(s, DATE, undefined, {
        packageIds: [s.packages[0].id],
        items: ["血常规"],
      }).allowed,
    ).toBe(true);
  });
  it("time quotas, date overrides, zero and empty unlimited are deterministic; dedup per appointment", () => {
    const s = seed();
    s.appointments = [
      oldOrder(s, {
        items: ["血常规", "血常规"],
        packageIds: ["PK01", "PK01"],
      }),
    ];
    s.records.bookingResourceLimits = [
      {
        id: "I",
        kind: "item",
        resourceId: "血常规",
        dailyCapacity: null,
        slotCapacity: 1,
        time: TIME,
        date: DATE,
      },
    ];
    expect(
      anonymizedBookingResourceUsage(s).find(
        (r) => r.kind === "item" && r.resourceId === "血常规",
      )?.used,
    ).toBe(1);
    expect(
      getBookingAvailability(s, DATE, undefined, {
        time: TIME,
        items: ["血常规"],
      }).error,
    ).toContain("该时段名额已满");
    expect(
      getBookingAvailability(s, DATE, undefined, {
        time: "08:30-09:00",
        items: ["血常规"],
      }).allowed,
    ).toBe(true);
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, {
        time: TIME,
        items: ["血常规"],
      }).allowed,
    ).toBe(true);
    s.records.bookingResourceLimits[0].dailyCapacity = 0;
    expect(
      getBookingAvailability(s, DATE, undefined, { items: ["血常规"] }).allowed,
    ).toBe(false);
  });
  it("anonymized resource usage blocks hidden orders without including identity fields", () => {
    const s = seed();
    s.appointments = [oldOrder(s)];
    const usage = anonymizedBookingResourceUsage(s);
    expect(JSON.stringify(usage)).not.toContain("patientId");
    s.records.bookingResourceUsage = usage;
    s.appointments = [];
    s.records.bookingResourceLimits = [
      { id: "I", kind: "item", resourceId: "血常规", dailyCapacity: 1 },
    ];
    expect(
      getBookingAvailability(s, DATE, undefined, { items: ["血常规"] }).allowed,
    ).toBe(false);
  });
  it("settings persist live quota rules; H5 blocks selected package and self-service blocks shared item", () => {
    const s = seed();
    mount(<PatientBookingSettings />, s);
    change("资源每日名额", "0");
    click("保存资源名额");
    expect(current().records.bookingResourceLimits[0].dailyCapacity).toBe(0);
    const configured = current();
    cleanup();
    mount(<Patient />, configured);
    booking();
    expect(
      (screen.getByRole("button", { name: "确认预约" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("note").textContent).toContain("套餐");
    cleanup();
    configured.records.bookingResourceLimits = [
      { id: "I", kind: "item", resourceId: "一般检查", dailyCapacity: 0 },
    ];
    mount(<Kiosk />, configured);
    click(/体检预约/);
    change("合成身份", "P001");
    click("模拟识别并继续");
    change("预约日期", DATE);
    expect(screen.getByRole("note").textContent).toContain("项目「一般检查」");
    expect(
      (
        screen.getByRole("button", {
          name: "创建模拟预约",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("weekend dates are absent and rejected by date control until enabled for H5 and kiosk", () => {
    const s = seed();
    expect(getBookingDates(s)).not.toContain("2026-10-17");
    mount(<Patient />, s);
    booking();
    change("预约日期", "2026-10-17");
    expect((screen.getByLabelText("预约日期") as HTMLInputElement).value).toBe(
      "",
    );
    expect(screen.getByRole("note").textContent).toContain("该日期不可选");
    click("开放周末");
    change("预约日期", "2026-10-17");
    expect((screen.getByLabelText("预约日期") as HTMLInputElement).value).toBe(
      "2026-10-17",
    );
    cleanup();
    mount(<Kiosk />, s);
    click(/体检预约/);
    change("合成身份", "P001");
    click("模拟识别并继续");
    change("预约日期", "2026-10-18");
    expect((screen.getByLabelText("预约日期") as HTMLInputElement).value).toBe(
      "",
    );
    click("开放周末");
    change("预约日期", "2026-10-18");
    expect((screen.getByLabelText("预约日期") as HTMLInputElement).value).toBe(
      "2026-10-18",
    );
  });
});

describe("T0066 independent displayed prices and T0081 actual package types", () => {
  it.each(["原价", "执行价", "不显示"])(
    "%s display does not change booked execution amount",
    (mode) => {
      const s = seed();
      s.config.priceMode = mode;
      s.packages[0].originalPrice = 599;
      s.packages[0].price = 399;
      s.records.orderingRules = [
        { id: "THY", item: "甲状腺彩超", price: 100, originalPrice: 150 },
      ];
      mount(<Patient />, s);
      booking();
      expect(displayedPackagePrice(s, s.packages[0])).toBe(
        mode === "原价" ? 599 : 399,
      );
      expect(displayedItemPrice(s, "甲状腺彩超", 100)).toBe(
        mode === "原价" ? 150 : 100,
      );
      if (mode === "不显示") expect(screen.queryByText("¥599")).toBeNull();
      else
        expect(
          screen.getAllByText(mode === "原价" ? "¥599" : "¥399").length,
        ).toBeGreaterThan(0);
      fireEvent.click(
        screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
      );
      click("确认预约");
      expect(current().appointments[0].amount).toBe(399);
    },
  );
  it("settings edit original/execution independently including free execution, and persisted type filters H5 options", () => {
    const s = seed();
    mount(<PatientBookingSettings />, s);
    change("套餐原价", "500");
    change("套餐执行价", "0");
    change("套餐类型", "筛查套餐");
    click("保存套餐类型及价格");
    expect(current().packages[0]).toMatchObject({
      price: 0,
      originalPrice: 500,
      packageType: "筛查套餐",
    });
    const configured = current();
    cleanup();
    mount(<Patient />, configured);
    booking();
    change("筛选套餐类型", "筛查套餐");
    expect(
      screen.getByRole("button", {
        name: new RegExp(configured.packages[0].name),
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(configured.packages[1].name),
      }),
    ).toBeNull();
    change("筛选套餐类型", "固定套餐");
    expect(
      screen.queryByRole("button", {
        name: new RegExp(configured.packages[0].name),
      }),
    ).toBeNull();
  });
});

describe("T0485 own published report inclusive date range", () => {
  it("inclusive start/end, empty range and selected record fallback do not expose other people or pending reports", () => {
    const s = seed();
    s.appointments = [
      oldOrder(s, {
        id: "R1",
        patientId: "P001",
        status: "approved",
        date: "2026-10-01",
        conclusion: "本人首份结论",
      }),
      oldOrder(s, {
        id: "R2",
        patientId: "P001",
        status: "printed",
        date: "2026-10-10",
        conclusion: "本人第二份结论",
      }),
      oldOrder(s, {
        id: "R3",
        patientId: "P002",
        status: "approved",
        date: "2026-10-10",
        conclusion: "他人禁止展示结论",
      }),
      oldOrder(s, {
        id: "R4",
        patientId: "P001",
        status: "review",
        date: "2026-10-10",
        conclusion: "未发布禁止展示结论",
      }),
    ];
    mount(<Patient />, s);
    click("报告");
    expect(
      within(screen.getByLabelText("选择检查记录")).getAllByRole("option"),
    ).toHaveLength(2);
    change("选择检查记录", "R1");
    change("报告体检起始日期", "2026-10-10");
    change("报告体检结束日期", "2026-10-10");
    expect(
      (screen.getByLabelText("选择检查记录") as HTMLSelectElement).value,
    ).toBe("R2");
    expect(screen.queryByText("本人首份结论")).toBeNull();
    expect(screen.queryByText("他人禁止展示结论")).toBeNull();
    expect(screen.queryByText("未发布禁止展示结论")).toBeNull();
    change("报告体检起始日期", "2026-10-11");
    expect(screen.getByRole("alert").textContent).toContain("起始日期不能晚于");
    expect(screen.queryByLabelText("选择检查记录")).toBeNull();
    click("清除报告日期筛选");
    change("报告体检起始日期", "2026-11-01");
    expect(screen.getByText("没有符合日期范围的报告")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "生成并预览PDF" })).toBeNull();
  });
});

it("independent project price editor preserves shared mandatory rules; displayed original is never charged", () => {
  const s = seed();
  mount(<PatientBookingSettings />, s);
  change("维护单项目", "腹部CT");
  change("项目原价", "500");
  change("项目执行价", "200");
  click("保存项目价格");
  expect(
    current().records.orderingRules.find((r) => r.item === "一般检查")
      ?.required,
  ).toBe(true);
  expect(
    current().records.orderingRules.find((r) => r.item === "腹部CT"),
  ).toMatchObject({ price: 200, originalPrice: 500, excludes: "腹部彩超" });
  const configured = seed();
  configured.config.priceMode = "原价";
  configured.records.orderingRules = [
    { id: "THY", item: "甲状腺彩超", price: 100, originalPrice: 150 },
  ];
  cleanup();
  mount(<Patient />, configured);
  booking();
  expect(screen.getByText("+ ¥150")).toBeTruthy();
  fireEvent.click(screen.getByLabelText(/甲状腺彩超了解甲状腺/));
  fireEvent.click(
    screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
  );
  click("确认预约");
  expect(current().appointments[0].amount).toBe(499);
});

it("H5 uses shared next-station estimate and renders pending completed and historical queues separately", () => {
  const s = seed();
  s.appointments = [
    oldOrder(s, {
      id: "Q-OWN",
      patientId: "P001",
      status: "checked",
      items: ["一般检查", "血常规", "心电图"],
      results: { 一般检查: "已检查" },
    }),
  ];
  s.records.queueTickets = [
    {
      id: "QT-DONE",
      appointmentId: "Q-OWN",
      department: "一般检查区",
      status: "done",
      position: 0,
    },
    {
      id: "QT-HISTORY",
      appointmentId: "Q-OWN",
      department: "采血区",
      status: "cleared",
      position: 0,
    },
  ];
  mount(<Patient />, s);
  click(/智能导检/);
  expect(screen.getByLabelText("待检队列").textContent).toContain("尚未入队");
  expect(screen.getByLabelText("已检队列").textContent).toContain("一般检查区");
  expect(screen.getByLabelText("历史结束队列").textContent).toContain("采血区");
  expect(screen.queryByText("预计等候 6 分钟")).toBeNull();
});
