// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act as reactAct,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import Patient, { UnitBookingCalendar } from "../src/modules/Patient";
import Kiosk from "../src/modules/Kiosk";
import { createInitialState, DemoProvider, useDemo } from "../src/store";
import {
  getBookingAvailability,
  getOnlineExtraCatalog,
  getBookingDates,
  getGroupBookingSchedules,
} from "../src/bookingRules";

const STORAGE = "hongchuang.health.demo.v1";
function Probe() {
  const { state } = useDemo();
  return (
    <div hidden data-testid="state-probe">
      {JSON.stringify(state)}
    </div>
  );
}
function renderPortal(component: "patient" | "kiosk", hash: string) {
  window.history.replaceState({}, "", hash);
  return render(
    <DemoProvider>
      {component === "patient" ? <Patient /> : <Kiosk />}
      <Probe />
    </DemoProvider>,
  );
}
function state() {
  return JSON.parse(screen.getByTestId("state-probe").textContent || "{}");
}
function click(name: string | RegExp) {
  fireEvent.click(
    screen.getByRole("button", { name, exact: typeof name === "string" }),
  );
}
function identify(id: string) {
  fireEvent.change(screen.getByLabelText("合成身份"), {
    target: { value: id },
  });
  click("模拟识别并继续");
}
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function futureDate(weekday?: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (
    weekday === undefined
      ? [0, 6].includes(d.getUTCDay())
      : d.getUTCDay() !== weekday
  )
    d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("患者 H5 业务流程", () => {
  it("从预约进入套餐比较，展示不同项目的具体检查意义", () => {
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    click("对比已选套餐（2）");
    expect(screen.getByText("记录身高、体重、血压等基础健康指标")).toBeTruthy();
    expect(screen.getByText("了解肝脏相关生化指标")).toBeTruthy();
    expect(screen.getByText("记录心脏电活动及节律信息")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByText("¥399").length).toBeGreaterThan(0);
    expect(screen.getAllByText("¥899").length).toBeGreaterThan(0);
  });

  it("预约需确认须知，创建后可模拟支付并在电子导检中查看", () => {
    renderPortal("patient", "#/patient");
    const initialCount = state().appointments.length;
    click("开启健康计划");
    click("确认预约");
    expect(state().appointments).toHaveLength(initialCount);
    expect(screen.getByRole("status").textContent).toContain("请先确认");
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments).toHaveLength(initialCount + 1);
    const id = state().appointments[0].id;
    expect(state().appointments[0].status).toBe("booked");
    expect(state().appointments[0].campus).toBe("中心院区");
    click("模拟支付");
    click("确认模拟付款");
    expect(
      state().appointments.find((a: { id: string }) => a.id === id).status,
    ).toBe("paid");
    fireEvent.click(
      screen.getAllByRole("button", { name: "电子导检", exact: true })[0],
    );
    expect(screen.getByText("一层 · 自助报到区")).toBeTruthy();
    expect(screen.getByText(/中心院区 · 电子导检单/)).toBeTruthy();
  });

  it("单位入口二维码是真实 SVG，单位链接直接进入对应预约并拆分单位/自费金额", () => {
    const first = renderPortal("patient", "#/patient?group=unknown");
    expect(
      screen
        .getByRole("link", { name: "打开同一单位预约入口" })
        .getAttribute("href"),
    ).toContain("#/patient?group=xingchen-2026");
    expect(document.querySelector(".pt-unit-qr svg path")).toBeTruthy();
    first.unmount();
    renderPortal("patient", "#/patient?group=xingchen-2026");
    expect(screen.getByText("星辰科技 · 年度体检福利")).toBeTruthy();
    click(/都市精英体检/);
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    const order = state().appointments[0];
    expect(order.amount).toBe(899);
    expect(order.selfPay).toBe(99);
    expect(order.groupBudget).toBe(800);
    click("模拟支付");
    expect(screen.getByRole("dialog").textContent).toContain("单位承担 ¥800");
    expect(screen.getByRole("dialog").textContent).toContain("本次自费 ¥99");
  });

  it("改期与取消保留订单及操作记录", () => {
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    const id = state().appointments[0].id;
    click("改期");
    const date = new Date();
    date.setDate(date.getDate() + 7);
    const updated = date.toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText("新预约日期"), {
      target: { value: updated },
    });
    click("确认改期");
    expect(
      state().appointments.find((a: { id: string }) => a.id === id).date,
    ).toBe(updated);
    click("取消预约");
    click("保留预约");
    expect(
      state().appointments.find((a: { id: string }) => a.id === id).status,
    ).toBe("booked");
    click("取消预约");
    click("确认取消");
    expect(
      state().appointments.find((a: { id: string }) => a.id === id).status,
    ).toBe("cancelled");
    expect(
      state().audit.some((a: { message: string }) => a.message.includes(id)),
    ).toBe(true);
  });

  it("服务申请统一使用后台待处理状态", () => {
    renderPortal("patient", "#/patient");
    fireEvent.click(
      screen.getByRole("button", { name: "健康服务", exact: true }),
    );
    click(/体检报告解读/);
    click("提交申请");
    expect(state().tasks[0].title).toBe("体检报告解读");
    expect(state().tasks[0].status).toBe("待处理");
  });

  it("报告可选择历史对比次数，并使用保存的合成指标", () => {
    renderPortal("patient", "#/patient");
    click("管理我的健康档案");
    click(/沈砚秋/);
    click("体检报告");
    expect(screen.getByText("沈砚秋的健康体检报告")).toBeTruthy();
    expect((screen.getByLabelText("对比次数") as HTMLSelectElement).value).toBe(
      "3",
    );
    expect(screen.getByText("前 2 次")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("对比次数"), {
      target: { value: "2" },
    });
    expect(screen.queryByText("前 2 次")).toBeNull();
    expect(screen.getByText("前 1 次")).toBeTruthy();
    expect(screen.getByText("6.1")).toBeTruthy();
  });
});

describe("预约规则与防重复提交", () => {
  it("共享规则执行容量、周末与无效日期，改期排除原订单，取消释放名额", () => {
    const seeded = createInitialState();
    const date = futureDate();
    seeded.config.dailyCapacity = 1;
    seeded.appointments = [{ ...seeded.appointments[0], date, status: "paid" }];
    expect(getBookingAvailability(seeded, date).allowed).toBe(false);
    expect(
      getBookingAvailability(seeded, date, seeded.appointments[0].id).allowed,
    ).toBe(true);
    seeded.appointments[0].status = "cancelled";
    expect(getBookingAvailability(seeded, date).remaining).toBe(1);
    expect(getBookingAvailability(seeded, futureDate(6)).error).toContain(
      "周末",
    );
    seeded.config.weekendAllowed = true;
    expect(getBookingAvailability(seeded, futureDate(6)).allowed).toBe(true);
    expect(getBookingAvailability(seeded, "2026-02-30").allowed).toBe(false);
  });

  it("H5 日容量满或周末禁约时不可提交", () => {
    const seeded = createInitialState();
    seeded.config.dailyCapacity = 1;
    seeded.config.weekendAllowed = false;
    seeded.appointments = [{ ...seeded.appointments[0], date: futureDate() }];
    localStorage.setItem(STORAGE, JSON.stringify(seeded));
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    fireEvent.change(screen.getByLabelText("预约日期"), {
      target: { value: futureDate() },
    });
    expect(
      (screen.getByRole("button", { name: "确认预约" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("note").textContent).toContain("预约已满");
    fireEvent.change(screen.getByLabelText("预约日期"), {
      target: { value: futureDate(6) },
    });
    expect(screen.getByRole("note").textContent).toContain("周末不开放");
    click("确认预约");
    expect(state().appointments).toHaveLength(1);
  });

  it("H5 增删项目与价格开关实际影响展示及订单", () => {
    const seeded = createInitialState();
    Object.assign(seeded.config, {
      allowAdd: false,
      allowRemove: false,
      showPrices: false,
    });
    localStorage.setItem(STORAGE, JSON.stringify(seeded));
    renderPortal("patient", "#/patient");
    expect(screen.queryByText("399")).toBeNull();
    click("开启健康计划");
    expect(
      (screen.getByLabelText("套餐项目：一般检查") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/甲状腺彩超/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getAllByText("价格待咨询").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments[0].items).toEqual(seeded.packages[0].items);
    expect(state().appointments[0].amount).toBe(399);
  });

  it("H5 开放增删时实际保留选择项目，重复确认只创建一单且新流程可再次预约", () => {
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    fireEvent.click(screen.getByLabelText("套餐项目：肝功能"));
    fireEvent.click(screen.getByLabelText(/甲状腺彩超/));
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    const count = state().appointments.length;
    const confirm = screen.getByRole("button", { name: "确认预约" });
    reactAct(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(state().appointments).toHaveLength(count + 1);
    expect(state().appointments[0].items).not.toContain("肝功能");
    expect(state().appointments[0].items).toContain("甲状腺彩超");
    expect(state().appointments[0].amount).toBe(519);
    click("返回首页");
    click("开启健康计划");
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments).toHaveLength(count + 2);
  });

  it("自助机执行容量、周末、项目和价格规则", () => {
    const seeded = createInitialState();
    Object.assign(seeded.config, {
      dailyCapacity: 0,
      weekendAllowed: false,
      allowAdd: false,
      allowRemove: false,
      showPrices: false,
    });
    localStorage.setItem(STORAGE, JSON.stringify(seeded));
    renderPortal("kiosk", "#/kiosk");
    click(/体检预约/);
    identify("P004");
    expect(
      (
        screen.getByRole("button", {
          name: "创建模拟预约",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("note").textContent).toContain("预约已满");
    expect(
      (screen.getByLabelText("套餐项目：一般检查") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("增加项目：甲状腺彩超") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getAllByText("价格待咨询")).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("预约日期"), {
      target: { value: futureDate(0) },
    });
    expect(screen.getByRole("note").textContent).toContain("周末不开放");
  });

  it("自助机重复确认只创建一次预约，且项目增删真实写入", () => {
    renderPortal("kiosk", "#/kiosk");
    click(/体检预约/);
    identify("P004");
    fireEvent.change(screen.getByLabelText("预约日期"), {
      target: { value: futureDate() },
    });
    fireEvent.click(screen.getByLabelText("套餐项目：肝功能"));
    fireEvent.click(screen.getByLabelText("增加项目：甲状腺彩超"));
    const count = state().appointments.length;
    const confirm = screen.getByRole("button", { name: "创建模拟预约" });
    reactAct(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(state().appointments).toHaveLength(count + 1);
    expect(state().appointments[0].items).not.toContain("肝功能");
    expect(state().appointments[0].items).toContain("甲状腺彩超");
    expect(state().appointments[0].amount).toBe(519);
  });

  it("锁定的已支付订单不能假签到或隐式签到打印", () => {
    const seeded = createInitialState();
    seeded.appointments.find((a) => a.patientId === "P002")!.locked = true;
    localStorage.setItem(STORAGE, JSON.stringify(seeded));
    renderPortal("kiosk", "#/kiosk");
    click(/自助签到/);
    identify("P002");
    expect(
      (screen.getByRole("button", { name: "确认签到" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    click("确认签到");
    expect(
      state().appointments.find(
        (a: { patientId: string }) => a.patientId === "P002",
      ).status,
    ).toBe("paid");
    expect(screen.queryByText("到检签到成功，已同步医护工作台。")).toBeNull();
    click("返回首页");
    click(/打印导检单/);
    identify("P002");
    expect(
      (
        screen.getByRole("button", {
          name: "模拟打印导检单",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("订单已锁定，无法签到或打印导检单。")).toBeTruthy();
  });
});

describe("自助终端业务与异常状态", () => {
  it("直接报告模式入口正确，未审核报告不能进入打印", () => {
    renderPortal("kiosk", "#/kiosk?mode=report");
    expect(screen.getByRole("button", { name: /打印体检报告/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /自助缴费/ })).toBeNull();
    click(/打印体检报告/);
    identify("P001");
    expect(screen.getByText("您的报告暂未完成审核")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /开始模拟打印/ })).toBeNull();
  });

  it("签到默认保留订单原院区，并支持显式选择另一院区", () => {
    const seeded = createInitialState();
    seeded.appointments.find((a) => a.patientId === "P002")!.campus = "东院区";
    localStorage.setItem(STORAGE, JSON.stringify(seeded));
    renderPortal("kiosk", "#/kiosk");
    click(/自助签到/);
    identify("P002");
    expect((screen.getByLabelText("到检院区") as HTMLSelectElement).value).toBe(
      "东院区",
    );
    fireEvent.change(screen.getByLabelText("到检院区"), {
      target: { value: "中心院区" },
    });
    click("确认签到");
    const order = state().appointments.find(
      (a: { patientId: string }) => a.patientId === "P002",
    );
    expect(order.status).toBe("checked");
    expect(order.campus).toBe("中心院区");
    expect(screen.getByRole("button", { name: "模拟打印导检单" })).toBeTruthy();
  });

  it("模拟缴费、签到、导检单打印可以闭环，打印不跳过状态校验", async () => {
    vi.useFakeTimers();
    renderPortal("kiosk", "#/kiosk");
    click(/自助缴费/);
    identify("P004");
    click("确认模拟支付");
    expect(
      state().appointments.find(
        (a: { patientId: string }) => a.patientId === "P004",
      ).status,
    ).toBe("paid");
    click("确认签到");
    click("模拟打印导检单");
    expect(screen.getByText("正在生成打印任务")).toBeTruthy();
    await reactAct(async () => {
      vi.advanceTimersByTime(1000);
    });
    await reactAct(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("导检单已完成模拟打印")).toBeTruthy();
    expect(
      state().audit.some((a: { message: string }) =>
        a.message.includes("模拟打印导检单"),
      ),
    ).toBe(true);
  });

  it("纸张不足阻止报告打印，恢复后打印和装订只记录一次", async () => {
    vi.useFakeTimers();
    renderPortal("kiosk", "#/kiosk?mode=report");
    click(/打印体检报告/);
    identify("P005");
    click("演示控制");
    click("纸张不足");
    click("关闭演示控制");
    click("开始模拟打印与装订");
    expect(screen.getByRole("status").textContent).toContain("纸张余量不足");
    expect(
      state().appointments.find(
        (a: { patientId: string }) => a.patientId === "P005",
      ).status,
    ).toBe("approved");
    click("演示控制");
    click("恢复设备并重试");
    click("关闭演示控制");
    click("开始模拟打印与装订");
    for (let i = 0; i < 3; i++)
      await reactAct(async () => {
        vi.advanceTimersByTime(1000);
      });
    expect(screen.getByText("您的报告已完成模拟打印")).toBeTruthy();
    const order = state().appointments.find(
      (a: { patientId: string }) => a.patientId === "P005",
    );
    expect(order.status).toBe("printed");
    expect(order.printCount).toBe(1);
    expect(screen.getByText(/模拟装订已完成/)).toBeTruthy();
  });

  it("离线识别失败、恢复可重试，120秒无操作后清除身份", async () => {
    vi.useFakeTimers();
    renderPortal("kiosk", "#/kiosk");
    click("演示控制");
    click("设备离线");
    click("关闭演示控制");
    click(/自助签到/);
    identify("P002");
    expect(screen.getByRole("status").textContent).toContain(
      "身份读取模拟失败",
    );
    click("演示控制");
    click("恢复设备并重试");
    click("关闭演示控制");
    click("模拟识别并继续");
    expect(screen.getByLabelText("到检院区")).toBeTruthy();
    await reactAct(async () => {
      vi.advanceTimersByTime(120000);
    });
    expect(screen.getByRole("status").textContent).toContain("会话已超时");
    expect(screen.getByRole("button", { name: /自助签到/ })).toBeTruthy();
    expect(screen.queryByLabelText("到检院区")).toBeNull();
  });
});

describe("单位排期、时钟、问卷与门户配置闭环", () => {
  const fixedState = () => {
    const s = createInitialState();
    s.config.bookingClock = "2026-10-13T15:00:00Z";
    s.appointments = [];
    return s;
  };
  const unit = {
    id: "xingchen-2026",
    company: "星辰科技",
    enabled: true,
    scheduled: true,
    startDate: "2026-10-14",
    endDate: "2026-10-16",
    dailyCapacity: 1,
    reservedCapacity: 0,
    allowedTimes: "08:00-08:30",
    allowRelatives: true,
  };
  it("单位真实日期、日限额、开关、排期与单位时段逐一实际阻止预约", () => {
    const s = fixedState();
    s.records.groupBookingSchedules = [{ ...unit }];
    const c = {
      kind: "group" as const,
      company: "星辰科技",
      patientId: "P001",
      time: "08:00-08:30",
    };
    expect(
      getBookingAvailability(s, "2026-10-13", undefined, c).error,
    ).toContain("仅可预约");
    expect(
      getBookingAvailability(s, "2026-10-14", undefined, {
        ...c,
        time: "09:00-09:30",
      }).error,
    ).toContain("单位可预约时段");
    expect(getBookingAvailability(s, "2026-10-14", undefined, c).allowed).toBe(
      true,
    );
    s.appointments = [
      {
        ...createInitialState().appointments[0],
        date: "2026-10-14",
        source: "H5团检",
        groupCompany: "星辰科技",
      },
    ];
    expect(
      getBookingAvailability(s, "2026-10-14", undefined, c).error,
    ).toContain("单位当日预约已满");
    s.records.groupBookingSchedules[0].enabled = false;
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, c).error,
    ).toContain("未开放预约");
    s.records.groupBookingSchedules[0].enabled = true;
    s.records.groupBookingSchedules[0].scheduled = false;
    expect(getBookingAvailability(s, "2026-10-20", undefined, c).allowed).toBe(
      true,
    );
  });
  it("模拟时钟跨越次日放号及团转个时刻后号源确实改变", () => {
    const s = fixedState();
    s.config.releaseHour = "18:00";
    expect(getBookingAvailability(s, "2026-10-14").error).toContain("18:00");
    s.config.bookingClock = "2026-10-13T18:00:00Z";
    expect(getBookingAvailability(s, "2026-10-14").allowed).toBe(true);
    s.config.dailyCapacity = 2;
    s.config.groupReleaseHour = "12:00";
    s.config.bookingClock = "2026-10-15T11:59:00Z";
    s.records.groupBookingSchedules = [
      { ...unit, dailyCapacity: 2, reservedCapacity: 2 },
    ];
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, { kind: "individual" })
        .remaining,
    ).toBe(0);
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, {
        kind: "group",
        company: "星辰科技",
      }).allowed,
    ).toBe(true);
    s.config.bookingClock = "2026-10-15T12:00:00Z";
    const rule = getBookingAvailability(s, "2026-10-15", undefined, {
      kind: "individual",
    });
    expect(rule.allowed).toBe(true);
    expect(rule.remaining).toBe(2);
    expect(rule.released).toBe(true);
  });
  it("分时容量实际校验，非开放时段与周末日期被过滤", () => {
    const s = fixedState();
    s.config.timeSlots = "08:00–08:30: 1; 08:30–09:00: 2";
    s.appointments = [
      {
        ...createInitialState().appointments[0],
        date: "2026-10-15",
        time: "08:00–08:30",
      },
    ];
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, {
        time: "08:00-08:30",
      }).error,
    ).toContain("时段预约已满");
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, {
        time: "10:00-10:30",
      }).error,
    ).toContain("未开放预约");
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, {
        time: "08:30-09:00",
      }).allowed,
    ).toBe(true);
    expect(getBookingDates(s)).not.toContain("2026-10-17");
    expect(getBookingDates(s)).not.toContain("2026-10-18");
  });
  it("黑名单根据生效和过期日期阻止共享预约校验及H5提交", () => {
    const s = fixedState();
    s.records.bookingBlacklist = [
      {
        id: "B1",
        patientId: "P001",
        status: "已启用",
        startDate: "2026-10-12",
        endDate: "2026-10-14",
        reason: "演示限制",
      },
    ];
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, { patientId: "P001" })
        .error,
    ).toContain("限制预约");
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    expect(screen.getByRole("button", { name: "确认预约" })).toBeDisabled();
    expect(screen.getByRole("note").textContent).toContain("限制预约");
    s.records.bookingBlacklist[0].endDate = "2026-10-12";
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, { patientId: "P001" })
        .allowed,
    ).toBe(true);
    s.records.bookingBlacklist[0].endDate = "2026-10-20";
    s.records.bookingBlacklist[0].startDate = "2026-10-14";
    expect(
      getBookingAvailability(s, "2026-10-15", undefined, { patientId: "P001" })
        .allowed,
    ).toBe(true);
  });
  it("日历编辑实际持久化单位限额，查看具体日期可见所属单位订单", () => {
    const s = fixedState();
    s.appointments = [
      {
        ...createInitialState().appointments[0],
        date: "2026-10-15",
        source: "团检备单",
        groupCompany: "星辰科技",
      },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    render(
      <DemoProvider>
        <UnitBookingCalendar editable />
        <Probe />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByLabelText("为单位设置日期排期"));
    fireEvent.change(screen.getByLabelText("单位开始日期"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.change(screen.getByLabelText("单位结束日期"), {
      target: { value: "2026-10-16" },
    });
    fireEvent.change(screen.getByLabelText("单位每日容量"), {
      target: { value: "1" },
    });
    click("保存单位排期");
    expect(state().records.groupBookingSchedules[0].dailyCapacity).toBe(1);
    expect(getGroupBookingSchedules(state()).length).toBeGreaterThan(1);
    click("查看 2026-10-15 星辰科技 排期");
    expect(screen.getByText(/林知远 · 08:00/)).toBeTruthy();
    expect(
      getBookingAvailability(state(), "2026-10-15", undefined, {
        kind: "group",
        company: "星辰科技",
      }).allowed,
    ).toBe(false);
  });
  it("单位关闭亲属预约时H5不可选择亲属，关闭整个单位时不能提交", () => {
    const s = fixedState();
    s.records.groupBookingSchedules = [
      { ...unit, allowRelatives: false, enabled: false },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient?group=xingchen-2026");
    expect(screen.getByLabelText("亲属预约（专属价自费）")).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认预约" })).toBeDisabled();
  });
  it("必填问卷阻止H5预约，完成后写入问卷答案且推荐关闭不加项目", () => {
    const s = fixedState();
    Object.assign(s.config, {
      questionnaireEnabled: true,
      questionnaireSkippable: false,
      recommendationEnabled: false,
    });
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    expect(screen.getByRole("button", { name: "确认预约" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "填写检前问卷" })[0]);
    expect(screen.queryByRole("button", { name: "跳过问卷" })).toBeNull();
    fireEvent.click(screen.getByLabelText("关注甲状腺健康"));
    click("提交问卷");
    expect(state().records.bookingQuestionnaires[0].recommended).toEqual([]);
    click("返回预约");
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments[0].questionnaireCompleted).toBe(true);
    expect(state().appointments[0].questionnaireAnswers).toContain(
      "关注甲状腺健康",
    );
    expect(state().appointments[0].items).not.toContain("甲状腺彩超");
  });
  it("问卷可跳过、关闭不拦截，开启推荐会选入对应参考项目", () => {
    const s = fixedState();
    Object.assign(s.config, {
      questionnaireEnabled: true,
      questionnaireSkippable: true,
      recommendationEnabled: true,
    });
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    fireEvent.click(screen.getAllByRole("button", { name: "填写检前问卷" })[0]);
    expect(screen.getByRole("button", { name: "跳过问卷" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("关注甲状腺健康"));
    click("完成问卷并生成参考方案");
    click("使用方案继续预约");
    expect(screen.getByLabelText(/甲状腺彩超/)).toBeChecked();
    expect(state().records.bookingQuestionnaires[0].recommended).toContain(
      "甲状腺彩超",
    );
    s.config.questionnaireEnabled = false;
    s.config.questionnaireSkippable = false;
    expect(
      getBookingAvailability(s, "2026-10-14", undefined, { patientId: "P001" })
        .allowed,
    ).toBe(true);
  });
  it("套餐非默认选中仍保留必检，允许勾选其他项目且默认规则不能绕过", () => {
    const s = fixedState();
    s.config.defaultSelected = false;
    s.config.allowRemove = false;
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    expect(screen.getByLabelText("套餐项目：一般检查")).toBeChecked();
    expect(screen.getByLabelText("套餐项目：一般检查")).toBeDisabled();
    expect(screen.getByLabelText("套餐项目：肝功能")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("套餐项目：肝功能"));
    expect(screen.getByLabelText("套餐项目：肝功能")).toBeChecked();
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments[0].items).toEqual(["一般检查", "肝功能"]);
  });
  it("自助机必填问卷、单位开关及黑名单都走共享规则", () => {
    const s = fixedState();
    s.config.questionnaireEnabled = true;
    s.config.questionnaireSkippable = false;
    s.config.recommendationEnabled = false;
    s.records.groupBookingSchedules = [{ ...unit, enabled: false }];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("kiosk", "#/kiosk");
    click(/体检预约/);
    identify("P004");
    expect(screen.getByRole("button", { name: "创建模拟预约" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "跳过自助机问卷" })).toBeNull();
    fireEvent.click(screen.getByLabelText("以上均无"));
    click("提交自助机问卷");
    expect(screen.getByRole("button", { name: "创建模拟预约" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("预约类型"), {
      target: { value: "group" },
    });
    fireEvent.change(screen.getByLabelText("团检单位"), {
      target: { value: "星辰科技" },
    });
    expect(screen.getByRole("button", { name: "创建模拟预约" })).toBeDisabled();
  });
  it("患者端消费医院、海报新闻、菜单、FAQ、团队、服务、链接，停用和未来内容不展示", () => {
    const s = fixedState();
    s.config.portalHospital = {
      name: "测试合成健康中心",
      intro: "测试中心介绍",
      address: "合成地址 DEMO",
      hotline: "DEMO-8899",
      hours: "演示开放时段",
    };
    s.records.portalMenus = [
      {
        id: "M",
        name: "了解本中心",
        target: "常见问题",
        icon: "客服",
        order: 1,
        status: "已启用",
      },
    ];
    s.records.portalBanners = [
      {
        id: "P",
        name: "测试文字海报",
        kind: "海报",
        date: "2026-10-13",
        summary: "预约活动内容",
        target: "预约体检",
        status: "已启用",
      },
      {
        id: "N",
        name: "测试医院新闻",
        kind: "新闻",
        date: "2026-10-12",
        summary: "新闻详情内容",
        status: "已启用",
      },
      { id: "F", name: "未来不展示", date: "2026-10-20", status: "已启用" },
      { id: "D", name: "停用不展示", status: "已停用" },
    ];
    s.records.portalFaq = [
      { id: "FAQ", name: "测试问题", answer: "测试答复", status: "已启用" },
    ];
    s.records.portalTeams = [
      {
        id: "T",
        name: "测试演示设备",
        kind: "检查设备",
        summary: "测试设备说明",
        status: "已启用",
      },
    ];
    s.records.portalServices = [
      {
        id: "S",
        name: "测试关怀服务",
        scope: "测试服务范围",
        hours: "每日",
        location: "演示中心",
        price: 0,
        status: "已启用",
      },
    ];
    s.records.portalLinks = [
      {
        id: "L",
        name: "测试帮助链接",
        url: "https://example.invalid/demo",
        description: "只显示链接配置",
        status: "已启用",
      },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient");
    expect(screen.getByText("测试文字海报")).toBeTruthy();
    expect(screen.getByText("测试医院新闻")).toBeTruthy();
    expect(screen.queryByText("未来不展示")).toBeNull();
    expect(screen.queryByText("停用不展示")).toBeNull();
    click(/了解本中心/);
    for (const text of [
      "测试中心介绍",
      "合成地址 DEMO",
      "测试问题",
      "测试演示设备 · 检查设备",
      "测试关怀服务",
      "测试帮助链接",
    ])
      expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "测试帮助链接" })).toBeNull();
  });
});

describe("合成身份、来源二维码与患者排队", () => {
  it("合成注册拒绝真实号码格式，新增体检人及常用关联并可移除关联", () => {
    renderPortal("patient", "#/patient");
    click("管理我的健康档案");
    const count = state().patients.length;
    fireEvent.change(screen.getByLabelText("合成称呼"), {
      target: { value: "演示小青" },
    });
    fireEvent.change(screen.getByLabelText("合成手机号标识"), {
      target: { value: "13800138000" },
    });
    click("注册并保存合成体检人");
    expect(state().patients).toHaveLength(count);
    fireEvent.change(screen.getByLabelText("合成手机号标识"), {
      target: { value: "DEMO-5678" },
    });
    click("注册并保存合成体检人");
    expect(state().patients).toHaveLength(count + 1);
    expect(state().patients[0].demoAccount).toBe(true);
    expect(state().patients[0].phone).toBe("DEMO-5678");
    expect(screen.getByLabelText("常用体检人：演示小青")).toBeChecked();
    fireEvent.click(screen.getByLabelText("常用体检人：演示小青"));
    expect(state().records.patientCommonPeople[0].status).toBe("removed");
    expect(state().patients).toHaveLength(count + 1);
  });
  it("个人推广二维码编码来源且新订单实时计入来源统计", () => {
    renderPortal("patient", "#/patient?distributor=D-P001");
    click("开启健康计划");
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments[0].distributorId).toBe("D-P001");
    click("管理我的健康档案");
    expect(
      screen
        .getByRole("link", { name: "打开个人推广预约入口" })
        .getAttribute("href"),
    ).toContain("distributor=D-P001");
    expect(screen.getByText(/通过此推广入口创建的订单：1 单/)).toBeTruthy();
    expect(document.querySelector("svg title")?.textContent).toBeTruthy();
  });
  it("排队二维码进入正确订单，可主动结束对应工作台排队记录", () => {
    const s = createInitialState();
    const order = s.appointments[0];
    s.records.queueTickets = [
      {
        id: "TICKET-1",
        appointmentId: order.id,
        department: "心电图区",
        status: "waiting",
        position: 0,
        zone: "二层演示区",
      },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", `#/patient?queue=${order.id}`);
    expect(screen.getByText("我的排队二维码")).toBeTruthy();
    expect(screen.getByText(/演示票号 TICKET-1/)).toBeTruthy();
    click("结束此排队");
    expect(state().records.queueTickets[0].status).toBe("cleared");
    expect(state().records.queueTickets[0].endedBy).toBe("patient");
    expect(screen.getByText("当前没有活动排队记录。")).toBeTruthy();
  });
  it("患者排队尊重已签到及队列开关，不会重复生成票号", () => {
    const s = createInitialState();
    s.records.queueTickets = [];
    s.config.queueOpen = { 心电图区: false };
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", `#/patient?queue=${s.appointments[0].id}`);
    fireEvent.change(screen.getByLabelText("选择排队科室"), {
      target: { value: "心电图区" },
    });
    click("加入演示排队");
    expect(state().records.queueTickets).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toContain("未开放");
    fireEvent.change(screen.getByLabelText("选择排队科室"), {
      target: { value: "超声区" },
    });
    click("加入演示排队");
    click("加入演示排队");
    expect(state().records.queueTickets).toHaveLength(1);
    expect(state().records.queueTickets[0].status).toBe("waiting");
  });
});

describe("共享单位订单与问卷上下游", () => {
  it("共享单位订单限制套餐及自选数量，按共享规则计算单位与个人分摊", () => {
    const s = createInitialState();
    s.appointments = [];
    s.records.groupOrders = [
      {
        id: "GO-1",
        name: "共享单位体检订单",
        company: "星辰科技",
        mode: "限额自选",
        budget: 800,
        packages: ["PK02"],
        optionalItems: ["甲状腺彩超", "骨密度"],
        choose: 1,
        personalItems: ["甲状腺彩超"],
        startDate: "2026-01-01",
        endDate: "2027-12-31",
        status: "生效",
      },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient?group=xingchen-2026");
    expect(screen.queryByRole("button", { name: /基础安心体检/ })).toBeNull();
    click(/都市精英体检/);
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toContain("需选择 1 项");
    fireEvent.click(screen.getByLabelText(/甲状腺彩超/));
    click("确认预约");
    const order = state().appointments[0];
    expect(order.groupOrderId).toBe("GO-1");
    expect(order.amount).toBe(979);
    expect(order.groupSplit).toEqual({ unit: 800, personal: 179 });
    expect(order.selfPay).toBe(179);
    expect(order.pricing).toHaveLength(9);
  });
  it("共享单位订单名单不适用时禁止退回旧的通用团检方案", () => {
    const s = createInitialState();
    s.records.groupOrders = [
      {
        id: "GO-1",
        company: "星辰科技",
        mode: "固定套餐",
        budget: 899,
        packages: ["PK02"],
        members: ["P003"],
        optionalItems: [],
        choose: 0,
        startDate: "2026-01-01",
        endDate: "2027-12-31",
        status: "生效",
      },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    renderPortal("patient", "#/patient?group=xingchen-2026");
    expect(screen.getByRole("button", { name: "确认预约" })).toBeDisabled();
    expect(
      screen.getAllByText("当前体检人不在单位订单有效名单或预约日期内").length,
    ).toBeGreaterThan(0);
  });
  it("问卷保存明确的合成既往史用药家族史，未填写保留空白", () => {
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    fireEvent.click(screen.getAllByRole("button", { name: "填写检前问卷" })[0]);
    fireEvent.change(screen.getByLabelText("合成既往史（可选）"), {
      target: { value: "合成既往史样例A（非真实信息）" },
    });
    fireEvent.change(screen.getByLabelText("合成用药记录（可选）"), {
      target: { value: "明确无相关演示记录" },
    });
    fireEvent.click(screen.getByLabelText("以上均无"));
    click("完成问卷并生成参考方案");
    expect(state().records.bookingQuestionnaires[0].history).toBe(
      "合成既往史样例A（非真实信息）",
    );
    expect(state().records.bookingQuestionnaires[0].medication).toBe(
      "明确无相关演示记录",
    );
    expect(state().records.bookingQuestionnaires[0].family).toBe("");
  });
  it("线上停用套餐与年龄不适用套餐从患者及自助机中移除", () => {
    const s = createInitialState();
    s.records.packageRules = [
      { packageId: "PK01", onlineEnabled: false },
      { packageId: "PK03", minAge: 60 },
    ];
    localStorage.setItem(STORAGE, JSON.stringify(s));
    const first = renderPortal("patient", "#/patient");
    click("开启健康计划");
    expect(screen.queryByRole("button", { name: /基础安心体检/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /全维深度体检/ })).toBeNull();
    first.unmount();
    renderPortal("kiosk", "#/kiosk");
    click(/体检预约/);
    identify("P004");
    expect(screen.queryByRole("button", { name: /基础安心体检/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /全维深度体检/ })).toBeNull();
  });
});

describe("共享医院项目字典的患者端消费", () => {
  function catalogState() {
    const s = createInitialState();
    s.appointments = [];
    s.records.orderingRules = [
      { id: "basic", item: "一般检查", price: 99, required: true },
      {
        id: "local",
        item: "演示新增检查",
        price: 129,
        meaning: "医院维护的合成项目说明",
      },
      { id: "off", item: "甲状腺彩超", price: 120, enabled: false },
      { id: "female", item: "演示女性限定检查", price: 99, sex: "女" },
      {
        id: "ignored",
        item: "演示已停用限制规则",
        price: 88,
        sex: "女",
        ruleEnabled: false,
      },
      { id: "duplicate", item: "血常规", price: 60 },
    ];
    return s;
  }
  it("项目停用与规则停用区分，限制条件实际过滤线上项目", () => {
    const s = catalogState();
    const catalog = getOnlineExtraCatalog(s, "P001");
    expect(catalog.some((row) => row.name === "甲状腺彩超")).toBe(false);
    expect(catalog.some((row) => row.name === "演示女性限定检查")).toBe(false);
    expect(catalog.some((row) => row.name === "演示已停用限制规则")).toBe(true);
    expect(catalog.find((row) => row.name === "演示新增检查")?.price).toBe(129);
  });
  it("医院维护项目可在 H5 加选并按维护价格计费，套餐既有项目不重复加购", () => {
    localStorage.setItem(STORAGE, JSON.stringify(catalogState()));
    renderPortal("patient", "#/patient");
    click("开启健康计划");
    expect(screen.queryByLabelText(/演示女性限定检查/)).toBeNull();
    expect(screen.getAllByLabelText(/血常规/)).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/演示新增检查/));
    fireEvent.click(
      screen.getByLabelText("已阅读预约须知，确认本次为本地模拟预约"),
    );
    click("确认预约");
    expect(state().appointments[0].items).toContain("演示新增检查");
    expect(state().appointments[0].amount).toBe(528);
  });
  it("自助机读取相同项目及价格，项目停用不再可选", () => {
    localStorage.setItem(STORAGE, JSON.stringify(catalogState()));
    renderPortal("kiosk", "#/kiosk");
    click(/体检预约/);
    identify("P001");
    expect(screen.queryByLabelText("增加项目：甲状腺彩超")).toBeNull();
    expect(screen.queryByLabelText("增加项目：血常规")).toBeNull();
    fireEvent.click(screen.getByLabelText("增加项目：演示新增检查"));
    click("创建模拟预约");
    expect(state().appointments[0].items).toContain("演示新增检查");
    expect(state().appointments[0].amount).toBe(528);
  });
});
