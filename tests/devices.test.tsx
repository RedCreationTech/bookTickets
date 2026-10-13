// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act as reactAct,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import Patient from "../src/modules/Patient";
import Kiosk from "../src/modules/Kiosk";
import { createInitialState, DemoProvider, useDemo } from "../src/store";
import { getBookingAvailability } from "../src/bookingRules";

const STORAGE = "qinghe.health.demo.v1";
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
    fireEvent.click(screen.getByLabelText("套餐项目：一般检查"));
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
    expect(state().appointments[0].items).not.toContain("一般检查");
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
    fireEvent.click(screen.getByLabelText("套餐项目：一般检查"));
    fireEvent.click(screen.getByLabelText("增加项目：甲状腺彩超"));
    const count = state().appointments.length;
    const confirm = screen.getByRole("button", { name: "创建模拟预约" });
    reactAct(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(state().appointments).toHaveLength(count + 1);
    expect(state().appointments[0].items).not.toContain("一般检查");
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
