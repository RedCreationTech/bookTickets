// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
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
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(after));
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
    const stored = localStorage.getItem("hongchuang.health.demo.v1") || "";
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

describe("Additional persisted control workflows", () => {
  it("persists an edited notification template and reapplies it after switching and remounting", () => {
    const view = mount("notifications");
    change("通知正文", "【预约演示】{姓名}，请在 {日期} 查看体检安排。");
    fireEvent.click(screen.getByRole("button", { name: "保存为当前通知模板" }));
    expect(state().records.notificationTemplates[0]).toMatchObject({
      id: "appointment",
      version: 1,
    });
    change("通知模板", "report");
    change("通知模板", "appointment");
    expect(screen.getByLabelText("通知正文")).toHaveValue(
      "【预约演示】{姓名}，请在 {日期} 查看体检安排。",
    );
    view.unmount();
    mount("notifications");
    expect(screen.getByLabelText("通知正文")).toHaveValue(
      "【预约演示】{姓名}，请在 {日期} 查看体检安排。",
    );
    change("通知正文", "未保存草稿");
    fireEvent.click(screen.getByRole("button", { name: "重新套用已存模板" }));
    expect(screen.getByLabelText("通知正文")).toHaveValue(
      "【预约演示】{姓名}，请在 {日期} 查看体检安排。",
    );
  });
  it("queries pending identity rechecks then closes their prior records on a confirmed match", () => {
    mount("identity");
    change("核验 / 复核说明", "抽象示意需人工复核");
    fireEvent.click(screen.getByRole("checkbox", { name: /我已人工核对/ }));
    fireEvent.click(screen.getByRole("button", { name: "标记不一致" }));
    const priorId = state().records.controlIdentity[0].id;
    change("核验状态", "不一致，待复核");
    change("核验查询", "林知远");
    expect(
      screen.getAllByRole("button", { name: "打开核验记录" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "打开核验记录" }));
    change("核验 / 复核说明", "合成演示复核后确认一致");
    fireEvent.click(screen.getByRole("checkbox", { name: /我已人工核对/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认一致" }));
    expect(
      state().records.controlIdentity.find((r: any) => r.id === priorId),
    ).toMatchObject({ status: "复核已关闭" });
    expect(screen.queryByRole("button", { name: "打开核验记录" })).toBeNull();
    expect(state().appointments[0].identityVerification.outcome).toBe("一致");
  });
  it("executes an explicitly selected local waiver with an archive reference and protects completed/locked projects", () => {
    mount("signatures");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /同时执行所选本地订单动作/ }),
    );
    expect(
      within(screen.getByLabelText("签名确认弃检项目")).queryByRole("option", {
        name: "一般检查",
      }),
    ).toBeNull();
    change("签名确认弃检项目", "肾功能");
    change("本次操作说明", "模拟弃检肾功能并归档演示确认");
    change("演示签名文字", "演示签名");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /确认本次“弃检确认”/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "归档演示签名" }));
    const a = state().appointments[0];
    const signature = state().records.controlSignatures[0];
    expect(a.items).not.toContain("肾功能");
    expect(a.waived).toContain("肾功能");
    expect(a.signatureArchiveIds).toContain(signature.id);
    expect(signature.executed).toBe(true);
    expect(
      state().audit.some(
        (r: any) =>
          r.action === "UPDATE_APPOINTMENT" &&
          r.before.items.includes("肾功能") &&
          !r.after.items.includes("肾功能"),
      ),
    ).toBe(true);
  });
  it("rejects report collection without an audited report and executes guide recovery independently", () => {
    mount("signatures");
    change("确认操作", "特殊报告领取");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /同时执行所选本地订单动作/ }),
    );
    change("本次操作说明", "演示报告领取");
    change("演示签名文字", "演示签名");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /确认本次“特殊报告领取”/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "归档演示签名" }));
    expect(screen.getByRole("alert")).toHaveTextContent("已审核或已打印");
    expect(state().records.controlSignatures).toBeUndefined();
    change("确认操作", "导检单回收");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /确认本次“导检单回收”/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "归档演示签名" }));
    expect(state().appointments[0].guideRecovered).toBe(true);
    expect(state().appointments[0].results).toEqual({
      一般检查: "128/82",
      血常规: "正常",
      肝功能: "24",
    });
  });
  it("updates abnormal level labels and colours without changing the patient risk classification", () => {
    mount("abnormal-levels");
    change("A类显示名称", "需及时复核（演示）");
    change("A类展示颜色", "#123abc");
    fireEvent.click(screen.getByRole("button", { name: "保存异常等级展示" }));
    expect(
      state().config.abnormalLevels.find((l: any) => l.id === "A类"),
    ).toMatchObject({ name: "需及时复核（演示）", color: "#123abc" });
    expect(state().patients.find((p: any) => p.id === "P003").risk).toBe("A类");
    expect(screen.getByText("需及时复核（演示）")).toHaveStyle({
      borderLeft: "5px solid #123abc",
    });
  });
});

describe("Published poster images and safe portal links", () => {
  it("validates image types and size, then previews, publishes and edits a local poster", async () => {
    mount("portal");
    fireEvent.click(screen.getByRole("tab", { name: "图片海报", exact: true }));
    const upload = screen.getByLabelText("海报图片文件");
    fireEvent.change(upload, {
      target: {
        files: [new File(["<svg />"], "unsafe.svg", { type: "image/svg+xml" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("512KB");
    expect(state().records.portalPosters).toBeUndefined();
    fireEvent.change(upload, {
      target: {
        files: [
          new File([new Uint8Array(512 * 1024 + 1)], "large.png", {
            type: "image/png",
          }),
        ],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("512KB");
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNqUAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    change("海报标题", "红创预约服务海报");
    change("海报图片说明", "合成绿色预约服务示意");
    fireEvent.change(upload, {
      target: {
        files: [new File([bytes], "poster.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "海报草稿预览：合成绿色预约服务示意" }),
      ).toHaveAttribute(
        "src",
        expect.stringContaining("data:image/png;base64,"),
      ),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "在患者端发布图片海报" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存图片海报" }));
    expect(state().records.portalPosters[0]).toMatchObject({
      name: "红创预约服务海报",
      alt: "合成绿色预约服务示意",
      enabled: true,
      status: "已发布",
      target: "预约体检",
    });
    expect(state().records.portalPosters[0].imageData).toMatch(
      /^data:image\/png;base64,/,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "编辑海报 红创预约服务海报" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "在患者端发布图片海报" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存图片海报" }));
    expect(state().records.portalPosters).toHaveLength(1);
    expect(state().records.portalPosters[0].status).toBe("草稿");
  });
  it("rejects unsafe links and persists a normalized credential-free HTTPS link with publication status", () => {
    mount("portal");
    fireEvent.click(screen.getByRole("tab", { name: "友情链接", exact: true }));
    change("友情链接名称", "演示服务帮助");
    change("友情链接说明", "安全外部链接演示");
    for (const url of [
      "javascript:alert(1)",
      "http://example.org/help",
      "https://user:secret@example.org/help",
      "https://example.org/unsafe path",
    ]) {
      change("友情链接 HTTPS 地址", url);
      fireEvent.click(screen.getByRole("button", { name: "保存友情链接" }));
      expect(screen.getByRole("alert")).toHaveTextContent("有效的 HTTPS");
      expect(state().records.portalLinks).toBeUndefined();
    }
    change("友情链接 HTTPS 地址", "https://example.org/help");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "在患者端发布友情链接" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存友情链接" }));
    expect(state().records.portalLinks[0]).toMatchObject({
      url: "https://example.org/help",
      name: "演示服务帮助",
      status: "已发布",
      enabled: true,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "编辑链接 演示服务帮助" }),
    );
    change("友情链接说明", "更新后的合成说明");
    fireEvent.click(screen.getByRole("button", { name: "保存友情链接" }));
    expect(state().records.portalLinks).toHaveLength(1);
    expect(state().records.portalLinks[0].description).toBe("更新后的合成说明");
  });
});

describe("C-group event-triggered local notifications", () => {
  it("creates source-backed rejection and overdue station notifications and preserves read status on rescans", () => {
    const initial = createInitialState();
    initial.appointments[2].reviewStage = 2;
    initial.appointments[0].date = "2026-10-01";
    const rejected = reducer(initial, {
      type: "REJECT",
      payload: {
        id: initial.appointments[2].id,
        reason: "合成总检需要补充说明",
      },
    });
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(rejected));
    mount("event-notifications");
    change("通知演示时钟（UTC）", "2026-10-13T08:01");
    fireEvent.click(
      screen.getByRole("button", { name: "推进通知演示时钟并触发" }),
    );
    expect(
      state().records.stationNotifications.filter(
        (r: any) => r.kind === "审核驳回",
      ),
    ).toHaveLength(1);
    expect(
      state().records.stationNotifications.find(
        (r: any) => r.kind === "审核驳回",
      ),
    ).toMatchObject({
      title: "总检驳回通知",
      recipientRole: "reviewer",
      sourceId: rejected.audit[0].id,
    });
    expect(
      state().records.stationNotifications.some(
        (r: any) =>
          r.kind === "报告超期" &&
          r.appointmentId === initial.appointments[0].id,
      ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "标记已读 总检驳回通知" }),
    );
    const count = state().records.stationNotifications.length;
    change("通知演示时钟（UTC）", "2026-10-13T08:02");
    fireEvent.click(
      screen.getByRole("button", { name: "推进通知演示时钟并触发" }),
    );
    expect(state().records.stationNotifications).toHaveLength(count);
    expect(
      state().records.stationNotifications.find(
        (r: any) => r.kind === "审核驳回",
      ).status,
    ).toBe("已读");
    fireEvent.click(screen.getByRole("checkbox", { name: "仅看未读事件通知" }));
    expect(
      screen.queryByRole("button", { name: "标记已读 总检驳回通知" }),
    ).toBeNull();
  });
  it("matches birthdays and built-in holidays using the explicit date and generates idempotent local SMS logs", () => {
    const initial = createInitialState();
    initial.patients[0].demoBirthday = "1980-01-01";
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(initial));
    mount("event-notifications");
    change("通知演示时钟（UTC）", "2026-01-01T08:00");
    fireEvent.click(
      screen.getByRole("button", { name: "推进通知演示时钟并触发" }),
    );
    expect(
      state().records.stationNotifications.filter(
        (r: any) => r.kind === "生日祝福",
      ),
    ).toHaveLength(1);
    expect(
      state().records.stationNotifications.filter(
        (r: any) => r.kind === "节日祝福",
      ),
    ).toHaveLength(initial.patients.length);
    expect(state().records.controlNotifications).toHaveLength(
      initial.patients.length + 1,
    );
    expect(
      state().records.controlNotifications.every(
        (r: any) => r.status === "模拟送达" && r.channel === "短信（本地模拟）",
      ),
    ).toBe(true);
    const snapshot = JSON.stringify(state());
    fireEvent.click(
      screen.getByRole("button", { name: "推进通知演示时钟并触发" }),
    );
    expect(JSON.stringify(state())).toBe(snapshot);
    change("通知演示时钟（UTC）", "2027-01-01T08:00");
    fireEvent.click(
      screen.getByRole("button", { name: "推进通知演示时钟并触发" }),
    );
    expect(
      state().records.stationNotifications.filter(
        (r: any) => r.kind === "生日祝福",
      ),
    ).toHaveLength(2);
  });
  it("saves a synthetic birthday, filters notification types and never invents a birthday for other patients", () => {
    mount("event-notifications");
    fireEvent.click(screen.getByText("设置合成客户演示生日"));
    change("合成演示生日", "1990-10-13");
    fireEvent.click(screen.getByRole("button", { name: "保存合成生日" }));
    expect(state().patients[0].demoBirthday).toBe("1990-10-13");
    change("通知演示时钟（UTC）", "2026-10-13T08:00");
    fireEvent.click(
      screen.getByRole("button", { name: "推进通知演示时钟并触发" }),
    );
    change("事件通知类型", "生日祝福");
    expect(
      screen.getAllByRole("button", { name: "标记已读 生日祝福（演示）" }),
    ).toHaveLength(1);
    expect(
      state()
        .records.stationNotifications.filter((r: any) => r.kind === "生日祝福")
        .map((r: any) => r.patientId),
    ).toEqual(["P001"]);
  });
});
