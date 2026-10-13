// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import ControlCenter from "../src/modules/ControlCenter";
import {
  DemoProvider,
  useDemo,
  createInitialState,
  reducer,
} from "../src/store";
function Probe() {
  const { state } = useDemo();
  return <pre data-testid="control-state">{JSON.stringify(state)}</pre>;
}
function mount(section: string) {
  return render(
    <DemoProvider>
      <ControlCenter section={section} />
      <Probe />
    </DemoProvider>,
  );
}
function state() {
  return JSON.parse(screen.getByTestId("control-state").textContent || "{}");
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe("Dedicated local service and quality controls", () => {
  it("validates recipients, previews resolved messages, and records per-recipient failure and retry history", () => {
    mount("notifications");
    fireEvent.click(screen.getByRole("button", { name: "预览通知" }));
    expect(screen.getByRole("alert")).toHaveTextContent("至少选择一位");
    fireEvent.click(screen.getByRole("checkbox", { name: /林知远/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /苏清禾/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /模拟首位接收失败/ }));
    fireEvent.click(screen.getByRole("button", { name: "预览通知" }));
    const preview = screen.getByRole("dialog", {
      name: "通知预览 · 确认本地模拟",
    });
    expect(preview).toHaveTextContent("林知远，您的体检预约");
    expect(state().records.controlNotifications).toBeUndefined();
    fireEvent.click(
      within(preview).getByRole("button", { name: "确认模拟发送" }),
    );
    expect(state().records.controlNotifications).toHaveLength(2);
    const failed = state().records.controlNotifications.find(
      (r: any) => r.status === "模拟失败",
    );
    expect(failed.patientName).toBe("林知远");
    fireEvent.click(screen.getByRole("button", { name: "重试模拟通知" }));
    const retried = state().records.controlNotifications.find(
      (r: any) => r.id === failed.id,
    );
    expect(retried.status).toBe("模拟送达");
    expect(retried.attempts).toHaveLength(2);
    expect(retried.attempts[0].status).toBe("模拟失败");
    expect(retried.attempts[1].actor).toBe("admin");
    expect(screen.queryByRole("button", { name: "重试模拟通知" })).toBeNull();
  });
  it("builds abnormal notifications from shared results and validates chosen projects", () => {
    mount("notifications");
    change("通知模板", "abnormal");
    expect(screen.queryByRole("checkbox", { name: /苏清禾/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /陈映山/ }));
    expect(
      screen.getByRole("link", { name: "查看共享分检结果" }),
    ).toHaveAttribute("href", "#/exam");
    fireEvent.click(screen.getByRole("checkbox", { name: "血脂四项" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "空腹血糖" }));
    fireEvent.click(screen.getByRole("button", { name: "预览通知" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "至少选择一个关联异常项目",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "空腹血糖" }));
    fireEvent.click(screen.getByRole("button", { name: "预览通知" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "待复核项目：空腹血糖",
    );
    fireEvent.click(screen.getByRole("button", { name: "确认模拟发送" }));
    expect(state().records.controlNotifications[0].abnormalItems).toEqual([
      "空腹血糖",
    ]);
  });
  it("filters report notifications to audited reports and rejects unknown merge fields", () => {
    mount("notifications");
    change("通知模板", "report");
    expect(screen.queryByRole("checkbox", { name: /林知远/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /沈砚秋/ }));
    change("通知正文", "测试 {未知字段}");
    fireEvent.click(screen.getByRole("button", { name: "预览通知" }));
    expect(screen.getByRole("alert")).toHaveTextContent("未知占位符");
    expect(state().records.controlNotifications).toBeUndefined();
  });
  it("requires a manual double-image confirmation and records mismatch reason on the shared appointment", () => {
    mount("identity");
    expect(
      screen.getAllByRole("img", { name: /抽象合成人像示意/ }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "确认一致" }));
    expect(screen.getByRole("alert")).toHaveTextContent("人工核对");
    fireEvent.click(screen.getByRole("checkbox", { name: /我已人工核对/ }));
    fireEvent.click(screen.getByRole("button", { name: "标记不一致" }));
    expect(screen.getByRole("alert")).toHaveTextContent("填写不一致");
    change("核验 / 复核说明", "合成示意位置有差异，演示复核。");
    fireEvent.click(screen.getByRole("button", { name: "标记不一致" }));
    expect(state().appointments[0].identityVerification.outcome).toBe(
      "不一致，待复核",
    );
    expect(state().records.controlIdentity[0].synthetic).toBe(true);
    expect(state().records.controlIdentity[0].note).toContain("合成示意位置");
  });
  it("requires fixed demo signature and explicit operation confirmation then supports archive lookup and preview", () => {
    mount("signatures");
    change("确认操作", "导检单回收");
    change("本次操作说明", "仅回收合成导检单的签名留样");
    change("演示签名文字", "不接受真实姓名");
    fireEvent.click(screen.getByRole("button", { name: "归档演示签名" }));
    expect(screen.getByRole("alert")).toHaveTextContent("固定文字");
    change("演示签名文字", "演示签名");
    fireEvent.click(screen.getByRole("button", { name: "归档演示签名" }));
    expect(screen.getByRole("alert")).toHaveTextContent("勾选");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /确认本次“导检单回收”/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "归档演示签名" }));
    const archive = state().records.controlSignatures[0];
    expect(archive.operation).toBe("导检单回收");
    expect(archive.typed).toBe("演示签名");
    expect(archive.synthetic).toBe(true);
    expect(state().appointments[0].status).toBe("in_exam");
    expect(screen.getByLabelText("演示签名文字")).toHaveValue("");
    change("查询签名档案", "不存在");
    expect(screen.queryByRole("button", { name: "查看签名档案" })).toBeNull();
    change("查询签名档案", "导检单回收");
    fireEvent.click(screen.getByRole("button", { name: "查看签名档案" }));
    expect(
      screen.getByRole("dialog", { name: "演示签名档案" }),
    ).toHaveTextContent("仅回收合成导检单");
    expect(
      screen.getByRole("img", { name: "演示签名预览，无签字法律效力" }),
    ).toBeInTheDocument();
  });
  it("derives rejection counts, responsible doctor and reasons from actual REJECT audit snapshots", () => {
    const initial = createInitialState();
    const after = reducer(initial, {
      type: "REJECT",
      payload: { id: initial.appointments[2].id, reason: "缺少复核说明" },
    });
    localStorage.setItem("qinghe.health.demo.v1", JSON.stringify(after));
    mount("rejections");
    expect(screen.getByRole("table")).toHaveTextContent("余医生");
    expect(screen.getByRole("table")).toHaveTextContent("缺少复核说明");
    expect(screen.getByRole("table")).toHaveTextContent("100.0%");
    expect(
      state().audit.filter((r: any) => r.action === "REJECT"),
    ).toHaveLength(1);
    expect(screen.getByText(/不代表医生临床错误概率/)).toBeInTheDocument();
  });
  it("validates demo hospital hotline and persists distinct portal and guide fields", () => {
    mount("portal");
    change("中心名称", "演示康宁中心");
    change("演示热线", "1234567");
    fireEvent.click(screen.getByRole("button", { name: "保存医院演示配置" }));
    expect(screen.getByRole("alert")).toHaveTextContent("DEMO-");
    change("演示热线", "DEMO-8888");
    fireEvent.click(screen.getByRole("button", { name: "保存医院演示配置" }));
    expect(state().config.portalHospital.name).toBe("演示康宁中心");
    expect(state().config.portalHospital.hotline).toBe("DEMO-8888");
    fireEvent.click(screen.getByRole("tab", { name: "导检科室", exact: true }));
    expect(state().records.guideDepartments[0]).toMatchObject({
      code: "LAB-DEMO",
      minutes: 5,
      sex: "不限",
    });
    fireEvent.click(screen.getByRole("tab", { name: "诊室", exact: true }));
    expect(state().records.guideRooms[0]).toMatchObject({
      department: "检验科",
      queue: "Q-LAB-DEMO",
      capacity: 1,
    });
  });
  it("validates simulated password change, clears inputs and never persists entered values in state or audit", () => {
    mount("password");
    change("当前模拟口令", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "完成密码修改演练" }));
    expect(screen.getByRole("alert")).toHaveTextContent("DEMO-OLD");
    change("当前模拟口令", "DEMO-OLD");
    change("新模拟口令", "DEMO-short");
    fireEvent.click(screen.getByRole("button", { name: "完成密码修改演练" }));
    expect(screen.getByRole("alert")).toHaveTextContent("至少 12 位");
    change("新模拟口令", "DEMO-Next123!");
    change("再次输入新模拟口令", "DEMO-Different123!");
    fireEvent.click(screen.getByRole("button", { name: "完成密码修改演练" }));
    expect(screen.getByRole("alert")).toHaveTextContent("不一致");
    change("再次输入新模拟口令", "DEMO-Next123!");
    fireEvent.click(screen.getByRole("button", { name: "完成密码修改演练" }));
    expect(state().config.passwordDemoChanged).toBe(true);
    expect(state().config.passwordDemoStrength).toBe("强（演示规则）");
    for (const label of ["当前模拟口令", "新模拟口令", "再次输入新模拟口令"])
      expect(screen.getByLabelText(label)).toHaveValue("");
    const stored = localStorage.getItem("qinghe.health.demo.v1") || "";
    expect(stored).not.toContain("DEMO-OLD");
    expect(stored).not.toContain("DEMO-Next123!");
    expect(stored).not.toContain("DEMO-Different123!");
    expect(
      state().audit.some((r: any) =>
        r.message.includes("未保存或修改任何真实凭据"),
      ),
    ).toBe(true);
  });
});
