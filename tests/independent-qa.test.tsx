/** @vitest-environment jsdom */
// Independent behavioral QA. jsdom tests are NOT real-browser or visual verification.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import App, { roles } from "../src/App";
import { DemoProvider } from "../src/store";
import { createInitialState, reducer, type DemoState } from "../src/model";
const KEY = "hongchuang.health.demo.v1";
const snapshot = (): DemoState => JSON.parse(localStorage.getItem(KEY)!);
function seed(update?: (state: DemoState) => void) {
  const state = createInitialState();
  update?.(state);
  localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}
async function mount(route = "/dashboard") {
  window.location.hash = "#" + route;
  const result = render(
    <DemoProvider>
      <App />
    </DemoProvider>,
  );
  await waitFor(() => expect(screen.queryByText(/正在加载/)).toBeNull());
  return result;
}
async function remount(route: string) {
  cleanup();
  return mount(route);
}
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T08:00:00Z"));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("independent QA: cross-surface lifecycle and persistence", () => {
  it("runs H5 booking/payment → kiosk check-in → exam → three-stage review → report printing/binding → followup", async () => {
    seed((s) => {
      s.appointments = [];
      s.tasks = [];
    });
    await mount("/patient");
    click("开启健康计划");
    fireEvent.click(screen.getByRole("checkbox", { name: /已阅读预约须知/ }));
    click("确认预约");
    expect(snapshot().appointments).toHaveLength(1);
    const id = snapshot().appointments[0].id;
    click("模拟支付");
    click("关闭支付");
    expect(snapshot().appointments[0].status).toBe("booked");
    click("模拟支付");
    click("确认模拟付款");
    expect(snapshot().appointments[0].status).toBe("paid");
    await remount("/kiosk");
    click(/自助签到/);
    click("模拟识别并继续");
    click("确认签到");
    expect(snapshot().appointments[0].status).toBe("checked");
    await remount("/exam");
    click("填入正常示例");
    fireEvent.change(screen.getByLabelText("分检小结 / 医学建议（演示）"), {
      target: { value: "合成演示结果，待总检复核。" },
    });
    click("提交分检结果");
    expect(snapshot().appointments[0].status).toBe("review");
    await remount("/review");
    click("通过初审");
    expect(snapshot().appointments[0].reviewStage).toBe(1);
    click("通过主检");
    expect(snapshot().appointments[0].reviewStage).toBe(2);
    click("创建随访任务");
    expect(snapshot().tasks).toHaveLength(1);
    click("通过总检");
    expect(snapshot().appointments[0].status).toBe("approved");
    expect(snapshot().appointments[0].locked).toBe(true);
    await remount("/kiosk?mode=report");
    click(/打印体检报告/);
    click("模拟识别并继续");
    vi.useFakeTimers();
    click("开始模拟打印与装订");
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("您的报告已完成模拟打印")).toBeTruthy();
    expect(snapshot().appointments[0]).toMatchObject({
      id,
      status: "printed",
      printCount: 1,
    });
    click("完成并退出");
    expect(
      screen.getByRole("heading", { name: "让健康服务，更近一步" }),
    ).toBeTruthy();
    vi.useRealTimers();
    await remount("/health");
    click("干预随访");
    click("开始跟进");
    click("完成随访");
    expect(screen.getByText("完成前请记录本次随访结果。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("本次随访结果"), {
      target: { value: "合成回访已完成，用户知晓演示报告。" },
    });
    click("记录并完成随访");
    expect(snapshot().tasks[0].status).toBe("已完成");
    await remount("/patient");
    click("报告");
    expect(screen.getByText("林知远的健康体检报告")).toBeTruthy();
    expect(snapshot().appointments[0].results["空腹血糖"]).toBe("5.8");
  });
  it("supports cancel/back without cancelling until confirmed, survives remount, and blocks cancelled check-in", async () => {
    seed((s) => {
      s.appointments = [{ ...s.appointments[1], patientId: "P001" }];
    });
    await mount("/patient");
    click("查看预约");
    click("取消预约");
    click("保留预约");
    expect(snapshot().appointments[0].status).toBe("paid");
    click("取消预约");
    click("确认取消");
    expect(snapshot().appointments[0].status).toBe("cancelled");
    await remount("/kiosk");
    click(/自助签到/);
    click("模拟识别并继续");
    expect(screen.getByText("当前没有有效预约")).toBeTruthy();
    expect(snapshot().appointments[0].status).toBe("cancelled");
  });
  it("shows a patient H5 follow-up request in the management task board", async () => {
    seed((s) => {
      s.tasks = [];
    });
    await mount("/patient");
    click("健康随访计划");
    click("申请健康随访");
    expect(snapshot().tasks).toHaveLength(1);
    await remount("/health");
    click("干预随访");
    expect(screen.getByText("H5 用户申请健康随访")).toBeTruthy();
    expect(snapshot().tasks[0].status).toBe("待处理");
  });
});

describe("independent QA: role and safety presentation", () => {
  it.each(Object.entries(roles).filter(([key]) => key !== "admin"))(
    "%s role blocks a route outside its navigation after reload",
    async (key, role) => {
      const forbidden = roles.admin.paths.find(
        (path) => !role.paths.includes(path),
      )!;
      seed((s) => {
        s.config.role = key;
      });
      await mount(forbidden);
      expect(screen.getByText("当前角色无此页面权限")).toBeTruthy();
      expect(screen.getByText(/生产授权须服务端强制执行/)).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "返回工作台" }).getAttribute("href"),
      ).toBe("#" + role.home);
    },
  );
  it("persists same-origin storage changes sent by another tab", async () => {
    const next = seed();
    await mount("/dashboard");
    next.config.campus = "东院区";
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: KEY,
          newValue: JSON.stringify(next),
        }),
      ),
    );
    expect((screen.getByLabelText("选择院区") as HTMLSelectElement).value).toBe(
      "东院区",
    );
    expect(snapshot().config.campus).toBe("东院区");
  });
});

describe("independent QA: audit of exposed mutation guards", () => {
  it("locked exam must not report apparent success or create alerts when results are not saved", async () => {
    seed((s) => {
      s.appointments = [{ ...s.appointments[0], locked: true }];
    });
    await mount("/exam");
    click("填入正常示例");
    fireEvent.change(screen.getByLabelText("空腹血糖结果"), {
      target: { value: "9.0" },
    });
    fireEvent.change(screen.getByLabelText("分检小结 / 医学建议（演示）"), {
      target: { value: "合成异常已复核。" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /已复核异常结果/ }));
    click("提交分检结果");
    expect(snapshot().appointments[0].status).toBe("in_exam");
    expect(snapshot().records.alerts || []).toHaveLength(0);
  });
  it("locked appointment details disable item additions and cancellation", async () => {
    seed((s) => {
      s.appointments = [{ ...s.appointments[0], locked: true }];
    });
    await mount("/appointments");
    click("详情");
    const dialog = screen.getByRole("dialog");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "加项：肺功能 ¥50",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "取消预约",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe("independent QA: selected star-clause interactions and regression cases", () => {
  it("T0015 group entry carries an explicit unit identifier and renders a real QR SVG (scan not tested)", async () => {
    seed();
    await mount("/patient");
    click(/单位团检专属/);
    const link = screen.getByRole("link", { name: /打开同一单位预约入口/ });
    expect(link.getAttribute("href")).toContain(
      "#/patient?group=xingchen-2026",
    );
    expect(document.querySelector(".pt-unit-qr svg path")).toBeTruthy();
    click("进入单位预约");
    expect(screen.getByText("星辰科技 · 年度体检福利")).toBeTruthy();
    await remount("/patient?group=xingchen-2026");
    expect(screen.getByText("星辰科技 · 年度体检福利")).toBeTruthy();
  });
  it("T0025 compares selected packages and exposes differing project meanings", async () => {
    seed();
    await mount("/patient");
    click("开启健康计划");
    click("对比已选套餐（2）");
    const table = screen.getByRole("table");
    expect(within(table).getByText("基础安心体检")).toBeTruthy();
    expect(within(table).getByText("都市精英体检")).toBeTruthy();
    expect(within(table).getByText("了解空腹状态下的血糖水平")).toBeTruthy();
    expect(within(table).getByText("记录心脏电活动及节律信息")).toBeTruthy();
  });
  it("T0237/38/39 and T0415/16 display global alert and persist four handling fields with optional followup", async () => {
    seed((s) => {
      s.records.alerts = [
        {
          id: "QA-ALERT",
          patientId: "P001",
          title: "独立QA合成异常",
          value: "8.9",
          status: "待处理",
        },
      ];
      s.tasks = [];
      s.config.role = "manager";
    });
    await mount("/health");
    const dialog = screen.getByRole("dialog", {
      name: "重大异常全局提醒 · 模拟",
    });
    expect(
      (
        within(dialog).getByRole("button", {
          name: "保存处置",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("处理结果（必填）"), {
      target: { value: "已做合成复核，请继续演示随访。" },
    });
    fireEvent.change(within(dialog).getByLabelText("处理方式"), {
      target: { value: "现场复核（模拟）" },
    });
    click("保存处置");
    expect(snapshot().records.alerts[0]).toMatchObject({
      status: "已处理",
      method: "现场复核（模拟）",
      result: "已做合成复核，请继续演示随访。",
      handler: "健康管理师",
    });
    expect(snapshot().records.alerts[0].handledAt).toBeTruthy();
    expect(snapshot().tasks).toHaveLength(1);
    await remount("/health");
    expect(
      screen.queryByRole("dialog", { name: "重大异常全局提醒 · 模拟" }),
    ).toBeNull();
  });
  it("T0239 lets staff opt out of creating a followup task", async () => {
    seed((s) => {
      s.records.alerts = [
        {
          id: "QA-ALERT",
          patientId: "P001",
          title: "独立QA合成异常",
          value: "8.9",
          status: "待处理",
        },
      ];
      s.tasks = [];
    });
    await mount("/health");
    fireEvent.change(screen.getByLabelText("处理结果（必填）"), {
      target: { value: "合成复核完成，无需新增任务。" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "进入随访系统持续跟踪" }),
    );
    click("保存处置");
    expect(snapshot().tasks).toHaveLength(0);
    expect(snapshot().records.alerts[0].status).toBe("已处理");
  });
  it("T0342 hides unselected synthetic history years and never fills missing history with normal", async () => {
    seed((s) => {
      s.appointments = [s.appointments[4]];
    });
    await mount("/reports");
    click("预览 / 管理");
    fireEvent.change(screen.getByLabelText("历史对比次数"), {
      target: { value: "3" },
    });
    expect(screen.getByRole("columnheader", { name: "2025年" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "2025 年订单" }));
    expect(screen.queryByRole("columnheader", { name: "2025年" })).toBeNull();
    expect(screen.getAllByText("— 未收录").length).toBeGreaterThan(0);
  });
  it("T0434/35 validates nonzero and excessive repayments before updating a single persistent bill", async () => {
    seed();
    await mount("/finance");
    fireEvent.click(screen.getAllByRole("button", { name: "分批结算" })[0]);
    const amount = screen.getByLabelText("本批次回款金额") as HTMLInputElement;
    const full = Number(amount.value);
    fireEvent.change(amount, { target: { value: "0" } });
    click("登记模拟回款");
    expect(snapshot().records.bills || []).toHaveLength(0);
    fireEvent.change(amount, { target: { value: String(full + 1) } });
    click("登记模拟回款");
    expect(snapshot().records.bills || []).toHaveLength(0);
    fireEvent.change(amount, { target: { value: "100" } });
    click("登记模拟回款");
    expect(snapshot().records.bills).toHaveLength(1);
    const bill = snapshot().records.bills[0];
    await remount("/finance");
    expect(snapshot().records.bills[0]).toEqual(bill);
    expect(snapshot().audit[0].message).toContain("bills");
  });
  it("H5 double activation of one confirmation does not create two appointments", async () => {
    seed((s) => {
      s.appointments = [];
    });
    await mount("/patient");
    click("开启健康计划");
    fireEvent.click(screen.getByRole("checkbox", { name: /已阅读预约须知/ }));
    const confirm = screen.getByRole("button", { name: "确认预约" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(snapshot().appointments).toHaveLength(1);
  });
  it("an accidental double activation cannot skip two report-review stages", async () => {
    seed((s) => {
      s.appointments = [
        { ...s.appointments[2], conclusion: "合成总检结论", reviewStage: 0 },
      ];
    });
    await mount("/review");
    const confirm = screen.getByRole("button", { name: "通过初审" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(snapshot().appointments[0].reviewStage).toBe(1);
  });
});

describe("independent QA: multi-campus and locked self-service regression", () => {
  it("T0090 preserves the selected appointment campus at identification and check-in", async () => {
    seed((s) => {
      s.appointments = [
        { ...s.appointments[1], patientId: "P001", campus: "东院区" },
      ];
      s.config.campus = "中心院区";
    });
    await mount("/kiosk");
    click(/自助签到/);
    click("模拟识别并继续");
    expect((screen.getByLabelText("到检院区") as HTMLSelectElement).value).toBe(
      "东院区",
    );
    click("确认签到");
    expect(snapshot().appointments[0].campus).toBe("东院区");
  });
  it("T0090 allows an explicit check-in campus change and persists it", async () => {
    seed((s) => {
      s.appointments = [
        { ...s.appointments[1], patientId: "P001", campus: "中心院区" },
      ];
    });
    await mount("/kiosk");
    click(/自助签到/);
    click("模拟识别并继续");
    fireEvent.change(screen.getByLabelText("到检院区"), {
      target: { value: "东院区" },
    });
    click("确认签到");
    expect(snapshot().appointments[0].campus).toBe("东院区");
    await remount("/appointments");
    expect(screen.getByText(/东院区 ·/)).toBeTruthy();
  });
  it("a locked appointment cannot appear to check-in successfully", async () => {
    seed((s) => {
      s.appointments = [
        { ...s.appointments[1], patientId: "P001", locked: true },
      ];
    });
    await mount("/kiosk");
    click(/自助签到/);
    click("模拟识别并继续");
    const button = screen.queryByRole("button", { name: "确认签到" });
    if (button) fireEvent.click(button);
    expect(snapshot().appointments[0].status).toBe("paid");
    expect(screen.queryByText("到检签到成功，已同步医护工作台。")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "您的导检单已准备好" }),
    ).toBeNull();
  });
});

describe("independent QA: route render smoke (DOM only)", () => {
  it.each([...roles.admin.paths, "/patient", "/kiosk", "/kiosk?mode=report"])(
    "%s mounts without an exception and renders a page heading",
    async (route) => {
      seed();
      await mount(route);
      expect(
        screen.getAllByRole("heading", { level: 1 }).length,
      ).toBeGreaterThan(0);
    },
  );
});

describe("independent QA: positive critical-result reporting", () => {
  it("T0237 links an actual abnormal exam submission to the global handling dialog", async () => {
    seed((s) => {
      s.appointments = [s.appointments[0]];
      s.tasks = [];
    });
    await mount("/exam");
    click("填入正常示例");
    fireEvent.change(screen.getByLabelText("空腹血糖结果"), {
      target: { value: "9.0" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /已复核异常结果/ }));
    click("提交分检结果");
    expect(snapshot().records.alerts || []).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("分检小结 / 医学建议（演示）"), {
      target: { value: "合成异常已经复核，请演示处理。" },
    });
    click("提交分检结果");
    expect(snapshot().appointments[0].status).toBe("review");
    expect(snapshot().appointments[0].results["空腹血糖"]).toBe("9.0");
    expect(snapshot().records.alerts).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "重大异常全局提醒 · 模拟" }),
    ).toBeTruthy();
  });
  it("does not carry another patient’s abnormal-result confirmation into a new exam", async () => {
    seed((s) => {
      s.appointments = [0, 1].map((i) => ({
        ...s.appointments[i],
        status: "in_exam",
        results: Object.fromEntries(
          s.appointments[i].items.map((item) => [
            item,
            item === "空腹血糖" ? "9.0" : "正常",
          ]),
        ),
      }));
    });
    await mount("/exam");
    fireEvent.click(screen.getByRole("checkbox", { name: /已复核异常结果/ }));
    fireEvent.change(screen.getByLabelText("分检小结 / 医学建议（演示）"), {
      target: { value: "仅第一个患者的合成说明。" },
    });
    click(/苏清禾.*检查中/);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /已复核异常结果/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        screen.getByLabelText(
          "分检小结 / 医学建议（演示）",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });
});

describe('independent QA: final entrypoint integration',()=>{
 it('opens the actual appointment CSV import entry, validates a sample, and persists its booking once',async()=>{
  seed(s=>{s.appointments=[];});await mount('/appointments');click('团检 CSV 导入');
  await screen.findByRole('button',{name:'填入合成示例'});
  click('填入合成示例');click('校验名单');
  expect(screen.getByRole('table',{name:'团检导入预览'})).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox',{name:/我已确认上述 1 条合成名单/}));
  click('确认创建 1 条预约');expect(snapshot().appointments).toHaveLength(1);
  expect(snapshot().appointments[0].source).toBe('团检 CSV 导入');click('完成');
  await remount('/appointments');expect(screen.getByText(/团检 CSV 导入/,{selector:'small'})).toBeTruthy();
 });
 it('opens workload analytics through the navigation and displays structured change details',async()=>{
  seed(s=>Object.assign(s,reducer(s,{type:'UPDATE_CONFIG',payload:{dailyCapacity:12}})));
  await mount('/dashboard');
  fireEvent.click(screen.getByRole('link',{name:'工作量统计'}));
  await waitFor(()=>expect(screen.getByRole('heading',{name:'工作量统计'})).toBeTruthy());
  expect(screen.getByRole('table',{name:'人员工作量'})).toBeTruthy();
  fireEvent.click(within(screen.getByRole('table',{name:'操作事件'})).getAllByRole('button')[0]);
  const dialog=screen.getByRole('dialog',{name:'审计事件详情'});
  expect(within(dialog).getByText('变更前')).toBeTruthy();
  expect(within(dialog).getByText('变更后')).toBeTruthy();
  expect(dialog.textContent).toContain('dailyCapacity');
  expect(snapshot().audit[0]).toMatchObject({action:'UPDATE_CONFIG',entity:'config',before:{dailyCapacity:80},after:{dailyCapacity:12}});
 });
 it('T0103 updates the synthetic historical reference when the selected booking patient changes',async()=>{
  seed();await mount('/appointments');click('新建预约');
  const dialog=screen.getByRole('dialog');
  const before=within(dialog).getByText(/林知远的合成记录/).textContent;
  fireEvent.change(within(dialog).getByLabelText('体检人'),{target:{value:'P003'}});
  const after=within(dialog).getByText(/陈映山的合成记录/).textContent;
  expect(after).not.toEqual(before);expect(after).toContain('A类');
  expect(within(dialog).getByRole('checkbox',{name:/增加/})).toBeTruthy();
 });
});
