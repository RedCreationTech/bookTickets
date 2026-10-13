// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { DemoProvider, useDemo, createInitialState, today } from "../src/store";
import Operations, {
  applyLoyaltyChange,
  quoteCommerceOrder,
} from "../src/modules/Operations";
import Health, {
  getPatientHealth,
  cohortLabel,
  scoreDemoAssessment,
} from "../src/modules/Health";
function Probe() {
  const { state } = useDemo();
  return <pre data-testid="state">{JSON.stringify(state)}</pre>;
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
  return JSON.parse(screen.getByTestId("state").textContent || "{}");
}
function openRecord(name: string) {
  const row = screen
    .getByRole("button", { name: new RegExp(name) })
    .closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "详情" }));
  return screen.getByRole("dialog", { name: "记录详情" });
}
beforeEach(() => localStorage.clear());
afterEach(() => cleanup());
describe("Operations working business flows", () => {
  it("advances a service order only through its permitted lifecycle and retains history", () => {
    mount(<Operations section="services" />);
    const drawer = openRecord("体检报告解读");
    fireEvent.click(
      within(drawer).getByRole("button", { name: "待服务", exact: true }),
    );
    expect(
      state().records.serviceOrders.find((x: any) => x.id === "SV-2026101301")
        .status,
    ).toBe("待服务");
    fireEvent.click(
      within(drawer).getByRole("button", { name: "服务中", exact: true }),
    );
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已完成", exact: true }),
    );
    const order = state().records.serviceOrders.find(
      (x: any) => x.id === "SV-2026101301",
    );
    expect(order.status).toBe("已完成");
    expect(order.history).toHaveLength(3);
    expect(
      within(drawer).queryByRole("button", { name: "已取消", exact: true }),
    ).toBeNull();
  });
  it("requires a cancellation explanation and preserves it in service history", () => {
    mount(<Operations section="services" />);
    const drawer = openRecord("体检报告解读");
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已取消", exact: true }),
    );
    expect(within(drawer).getByRole("alert").textContent).toContain(
      "请先填写处理说明",
    );
    expect(
      state().records.serviceOrders.find((x: any) => x.id === "SV-2026101301")
        .status,
    ).toBe("待处理");
    fireEvent.change(within(drawer).getByLabelText("处理说明"), {
      target: { value: "客户演示改期，取消本次服务。" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已取消", exact: true }),
    );
    expect(
      state()
        .records.serviceOrders.find((x: any) => x.id === "SV-2026101301")
        .history.at(-1).text,
    ).toContain("客户演示改期");
  });
  it("rejects negative stock and supports valid adjustments plus shelf transitions", () => {
    mount(<Operations section="commerce" />);
    const drawer = openRecord("轻量运动水杯");
    const quantity = within(drawer).getByLabelText("库存变动数量");
    fireEvent.change(quantity, { target: { value: "-999" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "确认调整" }));
    expect(
      state().records.products.find((x: any) => x.id === "P-1001").stock,
    ).toBe(126);
    expect(within(drawer).getByRole("alert").textContent).toContain(
      "不能小于零",
    );
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "确认调整" }));
    expect(
      state().records.products.find((x: any) => x.id === "P-1001").stock,
    ).toBe(131);
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已下架", exact: true }),
    );
    expect(
      state().records.products.find((x: any) => x.id === "P-1001").status,
    ).toBe("已下架");
    fireEvent.click(
      within(drawer).getByRole("button", { name: "在售", exact: true }),
    );
    expect(
      state().records.products.find((x: any) => x.id === "P-1001").status,
    ).toBe("在售");
  });
  it("records a support response and follows triage, resolution, closure, and reopen", () => {
    mount(<Operations section="support" />);
    const drawer = openRecord("报告查询入口咨询");
    fireEvent.click(
      within(drawer).getByRole("button", { name: "处理中", exact: true }),
    );
    fireEvent.change(within(drawer).getByLabelText("处理说明"), {
      target: { value: "已演示说明报告查看入口。" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "保存模拟回复" }),
    );
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已解决", exact: true }),
    );
    fireEvent.change(within(drawer).getByLabelText("处理说明"), {
      target: { value: "合成客户确认问题已解决。" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已关闭", exact: true }),
    );
    let ticket = state().records.tickets.find(
      (x: any) => x.id === "tickets-1001",
    );
    expect(ticket.status).toBe("已关闭");
    expect(ticket.history.some((x: any) => x.text.includes("未对外发送"))).toBe(
      true,
    );
    fireEvent.click(
      within(drawer).getByRole("button", { name: "处理中", exact: true }),
    );
    expect(
      state().records.tickets.find((x: any) => x.id === "tickets-1001").status,
    ).toBe("处理中");
  });
  it("assigns a claimed consultation and filters it into my orders", () => {
    mount(<Operations section="services" />);
    fireEvent.click(
      screen.getByRole("button", { name: "快速咨询抢单", exact: true }),
    );
    const drawer = openRecord("如何查看今年的体检报告");
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已领取", exact: true }),
    );
    expect(
      state().records.consultations.find((r: any) => r.id === "Q-801").owner,
    ).toBe("当前医生（演示）");
    fireEvent.click(within(drawer).getByRole("button", { name: "关闭详情" }));
    fireEvent.click(screen.getByRole("button", { name: "我的抢单" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("如何查看今年的体检报告？")).toBeTruthy();
  });
  it("requires a saved simulated tracking number before shipping a shop order", () => {
    mount(<Operations section="commerce" />);
    fireEvent.click(
      screen.getByRole("button", { name: "商城订单", exact: true }),
    );
    const row = screen
      .getAllByRole("row")
      .find((r) => r.textContent?.includes("SO-10201"))!;
    fireEvent.click(within(row).getByRole("button", { name: "详情" }));
    const drawer = screen.getByRole("dialog", { name: "记录详情" });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已发货", exact: true }),
    );
    expect(within(drawer).getByRole("alert").textContent).toContain(
      "发货前请保存",
    );
    fireEvent.change(within(drawer).getByLabelText("模拟物流单号"), {
      target: { value: "DEMO-SF-1001" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "保存物流信息" }),
    );
    fireEvent.click(
      within(drawer).getByRole("button", { name: "已发货", exact: true }),
    );
    expect(
      state().records.shopOrders.find((r: any) => r.id === "SO-10201").status,
    ).toBe("已发货");
    expect(
      state().records.shopOrders.find((r: any) => r.id === "SO-10201").tracking,
    ).toBe("DEMO-SF-1001");
  });
  it("validates CSV before importing and persists actual imported service records", () => {
    mount(<Operations section="services" />);
    fireEvent.click(screen.getByRole("button", { name: "导入", exact: true }));
    const dialog = screen.getByRole("dialog", { name: "导入 CSV" });
    const input = within(dialog).getByLabelText("CSV 导入内容");
    fireEvent.change(input, {
      target: {
        value:
          "订单项目,客户,服务人员,金额 / 元,预约日期,服务说明\n示例导入,虚构客户,当前医生,-1,2026-10-13,合成说明",
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "校验并导入" }));
    expect(state().records.serviceOrders).toHaveLength(4);
    expect(within(dialog).getByText(/存在缺失必填字段或非法数值/)).toBeTruthy();
    fireEvent.change(input, {
      target: {
        value:
          "订单项目,客户,服务人员,金额 / 元,预约日期,服务说明\n示例导入,虚构客户,当前医生,30,2026-10-13,合成说明",
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "校验并导入" }));
    expect(state().records.serviceOrders).toHaveLength(5);
    expect(state().records.serviceOrders[0].name).toBe("示例导入");
  });
  it("validates and persists booking capacity into the shared configuration", () => {
    mount(<Operations section="settings" />);
    fireEvent.change(screen.getByLabelText(/每日预约总容量/), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存预约规则" }));
    expect(screen.getByRole("status").textContent).toContain("保存失败");
    expect(state().config.dailyCapacity).toBe(80);
    fireEvent.change(screen.getByLabelText(/黄线预警人数/), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/红线限制人数/), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存预约规则" }));
    expect(state().config.dailyCapacity).toBe(20);
    expect(state().config.redCapacity).toBe(15);
  });
  it("never reseeds a deleted collection after navigating away and back", () => {
    mount(<Operations section="services" />);
    const drawer = openRecord("体检报告解读");
    fireEvent.click(within(drawer).getByRole("button", { name: "删除记录" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "确认删除" }));
    expect(state().records.serviceOrders).toHaveLength(3);
    fireEvent.click(
      screen.getByRole("button", { name: "医生团队", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "服务订单", exact: true }),
    );
    expect(state().records.serviceOrders).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /体检报告解读 SV-2026101301/ }),
    ).toBeNull();
  });
});
describe("Health management linked workflows", () => {
  it("requires a followup outcome before completing the shared clinical task", () => {
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "干预随访", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "完成随访", exact: true }),
    );
    const dialog = screen.getByRole("dialog", { name: "随访详情" });
    expect(within(dialog).getByText("完成前请记录本次随访结果。")).toBeTruthy();
    expect(state().tasks.find((x: any) => x.id === "TASK02").status).toBe(
      "进行中",
    );
    fireEvent.change(within(dialog).getByLabelText("本次随访结果"), {
      target: { value: "已完成合成客户回访与教育记录。" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "记录并完成随访" }),
    );
    expect(state().tasks.find((x: any) => x.id === "TASK02").status).toBe(
      "已完成",
    );
    expect(state().tasks.find((x: any) => x.id === "TASK02").note).toContain(
      "合成客户",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "重新跟进" }));
    expect(state().tasks.find((x: any) => x.id === "TASK02").status).toBe(
      "进行中",
    );
  });
  it("filters enterprise cohorts and creates only missing open followup tasks", () => {
    mount(<Health section="enterprise" />);
    fireEvent.change(screen.getByLabelText("筛选企业"), {
      target: { value: "星辰科技" },
    });
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("林知远")).toBeTruthy();
    expect(within(table).getByText("陈映山")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "为重点人群创建随访" }));
    expect(state().tasks).toHaveLength(3);
    expect(
      screen.getByText("所有重点客户已有开放随访任务，无需重复创建"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("筛选企业"), {
      target: { value: "所有单位" },
    });
    fireEvent.click(screen.getByRole("button", { name: "为重点人群创建随访" }));
    expect(state().tasks).toHaveLength(4);
    expect(state().tasks[0].patientId).toBe("P005");
  });
  it("captures educational questionnaire reports without making medical diagnoses", () => {
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "风险评估", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "较少", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "生成教育性流程报告" }));
    expect(screen.getByText("问卷采集完成")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "保存报告，等待专业复核" }),
    );
    expect(state().records.assessments).toHaveLength(1);
    expect(state().records.assessments[0].answers.activity).toBe("较少");
    expect(state().records.assessments[0].status).toBe("待专业复核");
    expect(state().records.assessments[0].description).toContain(
      "不代表医学评估结论",
    );
  });
  it("stores and downloads only accepted small synthetic local report files", async () => {
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "资料与设备", exact: true }),
    );
    const file = new File(["虚构报告测试文本"], "synthetic-report.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText("选择报告文件"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(state().records.healthAttachments).toHaveLength(1),
    );
    expect(state().records.healthAttachments[0].patientId).toBe("P001");
    expect(
      screen.getByRole("link", { name: "下载原文件" }).getAttribute("href"),
    ).toMatch(/^data:text\/plain;base64,/);
    fireEvent.change(screen.getByLabelText("选择报告文件"), {
      target: {
        files: [
          new File(["bad"], "unsafe.exe", { type: "application/octet-stream" }),
        ],
      },
    });
    expect(screen.getByRole("alert").textContent).toContain("仅支持 PDF");
    expect(state().records.healthAttachments).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "删除", exact: true }));
    expect(state().records.healthAttachments).toHaveLength(0);
  });
  it("creates a patient in the shared patient collection and retains it after remount", async () => {
    const view = mount(<Health />);
    fireEvent.click(screen.getByRole("button", { name: "新建客户档案" }));
    const dialog = screen.getByRole("dialog", { name: "健康档案编辑" });
    fireEvent.change(within(dialog).getByLabelText(/姓名/), {
      target: { value: "新客户演示" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存档案" }));
    expect(state().patients.some((p: any) => p.name === "新客户演示")).toBe(
      true,
    );
    await waitFor(() =>
      expect(localStorage.getItem("hongchuang.health.demo.v1")).toContain(
        "新客户演示",
      ),
    );
    view.unmount();
    mount(<Health />);
    expect(state().patients.some((p: any) => p.name === "新客户演示")).toBe(
      true,
    );
  });
});
function initState(patch: any) {
  const initial = { ...createInitialState(), ...patch };
  localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(initial));
  return initial;
}
function contentRewards() {
  mount(<Operations section="content" />);
  fireEvent.click(
    screen.getByRole("button", { name: "健康广场与活动", exact: true }),
  );
}
function checkout() {
  mount(<Operations section="commerce" />);
  fireEvent.click(
    screen.getByRole("button", { name: "交易与预约模拟", exact: true }),
  );
}
function createTrade() {
  fireEvent.click(screen.getByRole("button", { name: "预览并确认交易" }));
  fireEvent.click(screen.getByRole("button", { name: "确认创建本地交易" }));
}
describe("Completed health template, grouping and assessment interactions", () => {
  it("applies enabled plan units and terms as immutable snapshots into actual tasks and prescription records", () => {
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "健康计划", exact: true }),
    );
    fireEvent.click(screen.getByLabelText(/个体目标记录词条/));
    fireEvent.click(screen.getByLabelText(/报告资料再核对/));
    fireEvent.click(screen.getByLabelText("已确认模板及词条适合本次合成演示"));
    fireEvent.click(
      screen.getByRole("button", { name: "应用模板并生成计划任务" }),
    );
    const plan = state().records.healthPlans.find(
      (p: any) => p.templateId === "HT1001",
    );
    expect(plan.patientId).toBe("P001");
    expect(plan.units).toHaveLength(5);
    expect(plan.termsSnapshot).toHaveLength(2);
    expect(plan.templateSnapshot.name).toBe("基础健康教育 · 30 天");
    expect(state().tasks.filter((t: any) => t.planId === plan.id)).toHaveLength(
      5,
    );
    expect(
      state().records.medicalRecords.find(
        (r: any) => r.sourcePlanId === plan.id,
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("计划终止原因"), {
      target: { value: "合成客户计划调整" },
    });
    fireEvent.click(screen.getByRole("button", { name: "终止关联计划" }));
    expect(
      state().records.healthPlans.find((p: any) => p.id === plan.id).status,
    ).toBe("已终止");
    expect(
      state()
        .tasks.filter((t: any) => t.planId === plan.id)
        .every((t: any) => t.status === "已取消"),
    ).toBe(true);
  });
  it("previews actual group membership and creates deduplicated intervention tasks", () => {
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "人群分组", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("分组单位条件"), {
      target: { value: "星辰科技" },
    });
    fireEvent.change(screen.getByLabelText("分组风险条件"), {
      target: { value: "B类" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "保存分组并生成干预任务" }),
    );
    const g = state().records.healthGroups.find((g: any) => g.rule);
    expect(g.memberIds).toEqual(["P001"]);
    expect(g.rule.company).toBe("星辰科技");
    expect(state().tasks.filter((t: any) => t.groupId === g.id)).toHaveLength(
      1,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "保存分组并生成干预任务" }),
    );
    expect(state().tasks.filter((t: any) => t.groupId === g.id)).toHaveLength(
      1,
    );
  });
  it("derives every cohort from stable individual fields and preserves classifications under filtering", () => {
    const p = createInitialState().patients[2];
    const first = cohortLabel(p, 2, "血糖");
    expect(first).toBe("≥7.0 mmol/L");
    expect(cohortLabel(p, 0, "血糖")).toBe(first);
    expect(cohortLabel({ ...p, id: "NEW" }, 0, "血糖")).toBe("待补充");
    expect(
      cohortLabel({ ...p, health: { fastingGlucose: 5.5 } }, 99, "血糖"),
    ).toBe("＜6.0 mmol/L");
    expect(cohortLabel(p, 0, "血糖", true)).toBe("无上期数据");
    mount(<Health section="enterprise" />);
    fireEvent.click(screen.getByRole("button", { name: "血糖", exact: true }));
    let row = within(screen.getByRole("table"))
      .getByText(p.name)
      .closest("tr")!;
    const label = within(row).getAllByRole("cell")[3].textContent;
    fireEvent.change(screen.getByLabelText("筛选企业"), {
      target: { value: "星辰科技" },
    });
    row = within(screen.getByRole("table")).getByText(p.name).closest("tr")!;
    expect(within(row).getAllByRole("cell")[3].textContent).toBe(label);
  });
  it("uses distinct nonclinical assessment structures and deterministic dimension calculations", () => {
    const psychological = scoreDemoAssessment("心理健康自评流程", {
      mood: "很少舒适",
      stress: "几乎每天",
      energy: "很少",
      connection: "暂无",
    });
    expect(psychological.total).toBe(12);
    expect(psychological.dimensions).toHaveLength(2);
    const chinese = scoreDemoAssessment("中医体质辨识流程", {
      cold: "经常",
      warm: "经常",
      tired: "经常",
      digest: "经常",
      dry: "经常",
      rest: "较少",
    });
    expect(chinese.dimensions).toHaveLength(3);
    expect(chinese.total).toBe(12);
    const device = scoreDemoAssessment(
      "设备慢病评估套餐",
      {},
      { systolic: 125, diastolic: 80, fastingGlucose: "", bmi: 23 },
    );
    expect(device.dimensions[0].value).toBe(3);
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "风险评估", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("评估类型"), {
      target: { value: "心理健康自评流程" },
    });
    expect(screen.getByText("近一周情绪舒适感")).toBeTruthy();
    expect(screen.queryByText("日常活动频率")).toBeNull();
    fireEvent.change(screen.getByLabelText("评估类型"), {
      target: { value: "中医体质辨识流程" },
    });
    expect(screen.getByText("怕冷感受频率")).toBeTruthy();
    expect(screen.queryByText("近一周情绪舒适感")).toBeNull();
  });
  it("edits risk colors used by displayed labels, locks a client, and merges identical alert sets only once", () => {
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "异常与随访规则", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("异常等级名称"), {
      target: { value: "优先复核演示" },
    });
    fireEvent.change(screen.getByLabelText("异常等级颜色"), {
      target: { value: "#123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存等级显示" }));
    expect(
      state().records.riskLevels.find((l: any) => l.code === "A类").color,
    ).toBe("#123456");
    fireEvent.click(screen.getByRole("button", { name: "认领并锁定回访客户" }));
    expect(state().records.followupLocks[0].owner).toBe("admin");
    for (const title of ["合成异常甲", "合成异常乙"]) {
      fireEvent.change(screen.getByLabelText("新增合成异常标题"), {
        target: { value: title },
      });
      fireEvent.click(screen.getByRole("button", { name: "添加合成异常" }));
    }
    screen.getAllByRole("checkbox").forEach((c) => fireEvent.click(c));
    fireEvent.click(
      screen.getByRole("button", { name: "合并所选异常为一个随访" }),
    );
    const merged = state().tasks.filter((t: any) => t.mergeKey);
    expect(merged).toHaveLength(1);
    expect(merged[0].alertIds).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "合并所选异常为一个随访" }),
    );
    expect(state().tasks.filter((t: any) => t.mergeKey)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "申请解锁当前客户" }));
    expect(state().records.followupLocks[0].status).toBe("locked");
    fireEvent.click(screen.getByRole("button", { name: "确认解锁客户" }));
    expect(state().records.followupLocks[0].status).toBe("released");
  });
  it("prevents a different local operator from completing a locked customer followup", () => {
    initState({
      records: {
        followupLocks: [
          {
            id: "LOCK-P001",
            patientId: "P001",
            owner: "doctor-other",
            status: "locked",
          },
        ],
      },
    });
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "干预随访", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "完成随访", exact: true }),
    );
    expect(
      screen.getByText("客户已由 doctor-other 锁定，当前人员不能处理。"),
    ).toBeTruthy();
    expect(state().tasks.find((t: any) => t.id === "TASK02").status).toBe(
      "进行中",
    );
  });
});
describe("Health bean ledger, redemption and activity workflows", () => {
  it("enforces nonnegative balances and idempotent reward sources", () => {
    const a = { balance: 10, ledger: [] };
    const next = applyLoyaltyChange(a, 5, "合成任务", "task:1");
    expect(next.balance).toBe(15);
    expect(applyLoyaltyChange(next, 5, "合成任务", "task:1")).toBe(next);
    expect(() => applyLoyaltyChange(next, -16, "兑换", "r1")).toThrow(
      /余额不足/,
    );
  });
  it("awards a completed task once, debits redemption and refunds cancellation once", () => {
    contentRewards();
    fireEvent.change(screen.getByLabelText("梦想任务完成记录"), {
      target: { value: "已阅读合成知识卡并记录。" },
    });
    const row = screen
      .getByText("阅读健康知识卡 · +20 豆")
      .closest(".health-attention-row")!;
    fireEvent.click(within(row).getByRole("button", { name: "完成并领取" }));
    expect(state().records.loyaltyAccounts[0].balance).toBe(120);
    expect(
      within(row)
        .getByRole("button", { name: "已领取" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("健康豆调整数量"), {
      target: { value: "-999" },
    });
    fireEvent.change(screen.getByLabelText("健康豆调整原因"), {
      target: { value: "超额扣减验证" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记合成调整" }));
    expect(state().records.loyaltyAccounts[0].balance).toBe(120);
    const product = screen
      .getByText("健康主题帆布袋（合成）")
      .closest(".health-attention-row")!;
    fireEvent.click(within(product).getByRole("button", { name: "兑换商品" }));
    fireEvent.click(screen.getByRole("button", { name: "确认兑换（模拟）" }));
    expect(state().records.loyaltyAccounts[0].balance).toBe(40);
    fireEvent.click(screen.getByRole("button", { name: "取消并退豆" }));
    expect(state().records.loyaltyAccounts[0].balance).toBe(120);
    expect(state().records.loyaltyAccounts[0].redemptions[0].status).toBe(
      "已取消",
    );
    expect(screen.queryByRole("button", { name: "取消并退豆" })).toBeNull();
  });
  it("enforces activity capacity across customers, cancellation releases a place, and check-in awards once", () => {
    initState({
      records: {
        communityActivities: [
          {
            id: "ONE",
            name: "单名额活动",
            team: "合成团队",
            date: today(),
            capacity: 1,
            points: 15,
            status: "已启用",
          },
        ],
      },
    });
    contentRewards();
    fireEvent.click(screen.getByRole("button", { name: "报名活动" }));
    expect(state().records.loyaltyAccounts[0].enrollments[0].status).toBe(
      "已报名",
    );
    fireEvent.change(screen.getByLabelText("健康豆客户账户"), {
      target: { value: "P002" },
    });
    expect(
      screen.getByRole("button", { name: "名额已满" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("健康豆客户账户"), {
      target: { value: "P001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取消报名" }));
    fireEvent.change(screen.getByLabelText("健康豆客户账户"), {
      target: { value: "P002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "报名活动" }));
    fireEvent.click(screen.getByRole("button", { name: "签到并发放" }));
    const account = state().records.loyaltyAccounts.find(
      (a: any) => a.patientId === "P002",
    );
    expect(account.balance).toBe(115);
    expect(
      account.ledger.filter((l: any) => l.sourceKey === "activity:ONE"),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "签到并发放" })).toBeNull();
  });
});
describe("Rule-linked commerce, media and account administration", () => {
  it("calculates region, weight, group discount and postdiscount free-shipping thresholds", () => {
    const p = { price: 69, weight: 0.75 };
    const ship = {
      region: "青岛市",
      baseFee: 8,
      firstWeight: 1,
      additionalWeight: 0.5,
      additionalFee: 3,
      freeAbove: 200,
    };
    const rule = { minPeople: 2, discount: 9 };
    let quote = quoteCommerceOrder(p, 2, ship, rule, "配送", "青岛市");
    expect(quote.subtotal).toBe(138);
    expect(quote.discount).toBe(13.8);
    expect(quote.shipping).toBe(11);
    expect(quote.total).toBe(135.2);
    expect(
      quoteCommerceOrder(p, 2, ship, rule, "配送", "上海市").errors.join(),
    ).toContain("不在运费模板服务范围");
    expect(
      quoteCommerceOrder(p, 4, ship, rule, "配送", "青岛市").shipping,
    ).toBe(0);
  });
  it("reserves stock, converts a reservation to an order without double allocation and freezes its pricing", () => {
    checkout();
    fireEvent.change(screen.getByLabelText("交易方式"), {
      target: { value: "商品预约" },
    });
    createTrade();
    expect(state().records.commerceReservations).toHaveLength(1);
    expect(state().records.commerceReservations[0].amount).toBe(77);
    fireEvent.click(screen.getByRole("button", { name: "预约转订单" }));
    expect(state().records.commerceReservations[0].status).toBe("已转订单");
    const order = state().records.shopOrders.find(
      (o: any) => o.sourceReservationId,
    );
    expect(order.amount).toBe(77);
    expect(order.pricingSnapshot.product.price).toBe(69);
    expect(order.quantity).toBe(1);
  });
  it("uses two distinct customers to form a group before unlocking simulated payment", () => {
    checkout();
    fireEvent.change(screen.getByLabelText("交易方式"), {
      target: { value: "参与团购" },
    });
    createTrade();
    expect(state().records.groupBuyRounds[0].status).toBe("待成团");
    expect(
      state().records.shopOrders.find((o: any) => o.mode === "参与团购").status,
    ).toBe("待成团");
    expect(
      screen.queryByRole("button", { name: "模拟付款", exact: true }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("交易客户"), {
      target: { value: "P002" },
    });
    createTrade();
    expect(state().records.groupBuyRounds[0].status).toBe("已成团");
    expect(state().records.groupBuyRounds[0].members).toHaveLength(2);
    expect(
      state()
        .records.shopOrders.filter((o: any) => o.mode === "参与团购")
        .every((o: any) => o.status === "待付款"),
    ).toBe(true);
  });
  it("generates a unique consumption code, validates exact input and prevents repeated redemption", () => {
    checkout();
    fireEvent.change(screen.getByLabelText("履约方式"), {
      target: { value: "到店自取" },
    });
    createTrade();
    fireEvent.click(
      screen.getByRole("button", { name: "模拟付款", exact: true }),
    );
    const order = state().records.shopOrders.find(
      (o: any) => o.pricingSnapshot,
    );
    expect(order.status).toBe("待核销");
    const input = screen.getByLabelText(`订单消费码 ${order.id}`);
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "确认消费码核销" }));
    expect(
      state().records.shopOrders.find((o: any) => o.id === order.id).status,
    ).toBe("待核销");
    fireEvent.change(input, { target: { value: order.consumptionCode } });
    fireEvent.click(screen.getByRole("button", { name: "确认消费码核销" }));
    expect(
      state().records.shopOrders.find((o: any) => o.id === order.id).status,
    ).toBe("已签收");
    expect(screen.queryByRole("button", { name: "确认消费码核销" })).toBeNull();
  });
  it("stores validated product image previews and managed HTML video media", async () => {
    const view = mount(<Operations section="commerce" />);
    let drawer = openRecord("轻量运动水杯");
    fireEvent.change(within(drawer).getByLabelText("上传商品图片"), {
      target: {
        files: [new File(["image"], "demo.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(
        state().records.products.find((p: any) => p.id === "P-1001").images,
      ).toHaveLength(1),
    );
    expect(within(drawer).getByAltText("demo.png").getAttribute("src")).toMatch(
      /^data:image\/png/,
    );
    fireEvent.click(within(drawer).getByRole("button", { name: "删除图片" }));
    expect(
      state().records.products.find((p: any) => p.id === "P-1001").images,
    ).toHaveLength(0);
    view.unmount();
    mount(<Operations section="content" />);
    drawer = openRecord("把日常活动融入工作日");
    fireEvent.change(within(drawer).getByLabelText("上传健康视频"), {
      target: {
        files: [
          new File(["synthetic video bytes"], "demo.mp4", {
            type: "video/mp4",
          }),
        ],
      },
    });
    await waitFor(() =>
      expect(
        state().records.articles.find((a: any) => a.id === "ART-1002")
          .videoData,
      ).toMatch(/^data:video\/mp4/),
    );
    const video = within(drawer).getByLabelText("健康视频预览播放器");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("src")).toMatch(/^data:video\/mp4/);
    fireEvent.click(
      within(drawer).getByRole("button", { name: "删除视频媒体" }),
    );
    expect(within(drawer).queryByLabelText("健康视频预览播放器")).toBeNull();
  });
  it("applies edited doctor permissions and saves the shared patient booking blacklist", () => {
    mount(<Operations section="settings" />);
    fireEvent.click(
      screen.getByRole("button", { name: "人员与资质", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "按配置校验并模拟执行" }),
    );
    expect(screen.getByRole("status").textContent).toContain("允许模拟执行");
    fireEvent.click(screen.getByLabelText("审核报告"));
    const audits = state().audit.length;
    fireEvent.click(
      screen.getByRole("button", { name: "按配置校验并模拟执行" }),
    );
    expect(state().audit.length).toBe(audits);
    expect(screen.getByRole("status").textContent).toContain("已拦截");
    fireEvent.change(screen.getByLabelText("黑名单原因"), {
      target: { value: "合成预约限制测试" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客户限制" }));
    expect(state().records.bookingBlacklist[0].patientId).toBe("P001");
    expect(state().records.bookingBlacklist[0].status).toBe("已启用");
    fireEvent.click(screen.getByRole("button", { name: "解除客户限制" }));
    expect(state().records.bookingBlacklist[0].status).toBe("已解除");
  });
});
describe("Linked CRM, settlement and explicit custom-role data", () => {
  it("limits CRM monetary and monthly receipt statistics to the selected year and salesperson", () => {
    const dateYear = today().slice(0, 4),
      old = String(Number(dateYear) - 1);
    initState({
      records: {
        crmContracts: [
          {
            id: "C1",
            name: "本年甲",
            customerId: "CRM-1001",
            customer: "星辰科技",
            owner: "陈晓",
            amount: 1000,
            received: 100,
            date: `${dateYear}-09-10`,
            dueDate: `${dateYear}-12-31`,
            status: "履约中",
          },
          {
            id: "C2",
            name: "本年乙",
            customerId: "CRM-1002",
            customer: "远帆制造",
            owner: "周医生",
            amount: 2000,
            received: 200,
            date: `${dateYear}-09-10`,
            dueDate: `${dateYear}-12-31`,
            status: "履约中",
          },
          {
            id: "C3",
            name: "去年甲",
            customerId: "CRM-1001",
            customer: "星辰科技",
            owner: "陈晓",
            amount: 9999,
            received: 999,
            date: `${old}-09-10`,
            dueDate: `${old}-12-31`,
            status: "已完成",
          },
        ],
        crmActivities: [
          {
            id: "A1",
            name: "本年回款",
            customerId: "CRM-1001",
            contractId: "C1",
            category: "实际回款",
            amount: 100,
            owner: "陈晓",
            date: `${dateYear}-09-10`,
            status: "已完成",
          },
          {
            id: "A2",
            name: "去年回款",
            customerId: "CRM-1001",
            contractId: "C3",
            category: "实际回款",
            amount: 999,
            owner: "陈晓",
            date: `${old}-09-10`,
            status: "已完成",
          },
        ],
      },
    });
    mount(<Operations section="services" />);
    fireEvent.click(
      screen.getByRole("button", { name: "合同与回款", exact: true }),
    );
    expect(screen.getByTestId("crm-year-total").textContent).toBe("¥3,000");
    expect(screen.getByTestId("crm-month-9").textContent).toBe("¥100");
    fireEvent.click(screen.getByRole("button", { name: "仅看我的业绩" }));
    expect(screen.getByTestId("crm-year-total").textContent).toBe("¥1,000");
    fireEvent.change(screen.getByLabelText("CRM统计年份"), {
      target: { value: old },
    });
    expect(screen.getByTestId("crm-year-total").textContent).toBe("¥9,999");
    expect(screen.getByTestId("crm-month-9").textContent).toBe("¥999");
  });
  it("records contract-linked receipts and rejects amounts exceeding the remaining balance", () => {
    mount(<Operations section="services" />);
    fireEvent.click(
      screen.getByRole("button", { name: "合同与回款", exact: true }),
    );
    fireEvent.click(
      screen.getByText("客户关联、合同立项与计划 / 实际回款登记"),
    );
    fireEvent.change(screen.getByLabelText("CRM登记回款金额"), {
      target: { value: "50000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记关联合同回款" }));
    expect(
      state().records.crmContracts.find((c: any) => c.id === "CON-1001")
        .received,
    ).toBe(45000);
    fireEvent.change(screen.getByLabelText("CRM登记回款金额"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登记关联合同回款" }));
    expect(
      state().records.crmContracts.find((c: any) => c.id === "CON-1001")
        .received,
    ).toBe(45100);
    const receipt = state().records.crmActivities[0];
    expect(receipt.customerId).toBe("CRM-1001");
    expect(receipt.contractId).toBe("CON-1001");
    expect(receipt.amount).toBe(100);
  });
  it("derives a monthly settlement snapshot from actual local order statuses", () => {
    initState({
      records: {
        shopOrders: [
          {
            id: "S1",
            name: "已收",
            customer: "合成甲",
            amount: 100,
            date: today(),
            status: "待发货",
          },
          {
            id: "S2",
            name: "退回",
            customer: "合成乙",
            amount: 50,
            date: today(),
            status: "已退款",
          },
          {
            id: "S3",
            name: "待收",
            customer: "合成丙",
            amount: 70,
            date: today(),
            status: "待付款",
          },
        ],
      },
    });
    mount(<Operations section="commerce" />);
    fireEvent.click(
      screen.getByRole("button", { name: "财务结算", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "生成本月结算账单" }));
    const bill = state().records.settlements.find(
      (b: any) => b.id === `SETTLE-${today().slice(0, 7)}`,
    );
    expect(bill.gross).toBe(150);
    expect(bill.refund).toBe(50);
    expect(bill.amount).toBe(100);
    expect(bill.unpaid).toBe(70);
    expect(bill.sourceSnapshot).toHaveLength(3);
  });
  it("saves explicit menu, patient and campus scopes before activating a custom role", () => {
    mount(<Operations section="settings" />);
    fireEvent.click(
      screen.getByRole("button", { name: "人员与资质", exact: true }),
    );
    fireEvent.click(screen.getByLabelText("总检审核"));
    fireEvent.click(screen.getByLabelText("林知远"));
    fireEvent.change(screen.getByLabelText("角色限定院区"), {
      target: { value: "东院区" },
    });
    fireEvent.change(screen.getByLabelText("角色折扣下限"), {
      target: { value: "0.7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "激活此自定义角色" }));
    const role = state().records.roles.find(
      (r: any) => r.id === state().config.customRoleId,
    );
    expect(role.menuPaths).not.toContain("/review");
    expect(role.allowedPatientIds).toEqual(["P001"]);
    expect(role.allowedCampus).toBe("东院区");
    expect(state().config.discountMin).toBe(0.7);
  });
});

describe("Submission latches survive batched repeat activation", () => {
  it("deduplicates batched group intervention creation with stable task ids", () => {
    initState({ tasks: [] });
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "人群分组", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("分组单位条件"), {
      target: { value: "星辰科技" },
    });
    fireEvent.change(screen.getByLabelText("分组风险条件"), {
      target: { value: "B类" },
    });
    const submit = screen.getByRole("button", {
      name: "保存分组并生成干预任务",
    });
    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    const group = state().records.healthGroups.find((g: any) => g.rule);
    expect(group.memberIds).toEqual(["P001"]);
    expect(
      state().tasks.filter((t: any) => t.groupId === group.id),
    ).toHaveLength(1);
    fireEvent.click(submit);
    expect(state().tasks).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("规则分组名称"), {
      target: { value: "第二个合成干预组" },
    });
    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    expect(state().tasks).toHaveLength(2);
    expect(new Set(state().tasks.map((t: any) => t.id)).size).toBe(2);
  });

  it("creates one plan, task set and prescription until an explicit new template application", () => {
    initState({ tasks: [], records: { healthPlans: [], medicalRecords: [] } });
    mount(<Health />);
    fireEvent.click(
      screen.getByRole("button", { name: "健康计划", exact: true }),
    );
    fireEvent.click(screen.getByLabelText(/个体目标记录词条/));
    fireEvent.click(screen.getByLabelText("已确认模板及词条适合本次合成演示"));
    const submit = screen.getByRole("button", {
      name: "应用模板并生成计划任务",
    });
    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    const first = state().records.healthPlans[0];
    expect(state().records.healthPlans).toHaveLength(1);
    expect(state().tasks).toHaveLength(first.units.length);
    expect(state().records.medicalRecords).toHaveLength(1);
    expect(submit.hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByLabelText("已确认模板及词条适合本次合成演示")
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "开始新的模板应用" }));
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("已确认模板及词条适合本次合成演示"));
    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    expect(state().records.healthPlans).toHaveLength(2);
    expect(state().tasks).toHaveLength(first.units.length * 2);
    expect(state().records.medicalRecords).toHaveLength(2);
  });
  it("allocates a one-stock product once despite batched confirmation and revalidates a reopened flow", () => {
    initState({
      records: {
        products: [
          {
            id: "ONE",
            name: "单库存合成商品",
            price: 50,
            weight: 1,
            stock: 1,
            status: "在售",
          },
        ],
        shopOrders: [],
      },
    });
    checkout();
    fireEvent.click(screen.getByRole("button", { name: "预览并确认交易" }));
    const submit = screen.getByRole("button", { name: "确认创建本地交易" });
    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    expect(state().records.shopOrders).toHaveLength(1);
    expect(
      state().records.shopOrders.reduce(
        (n: number, o: any) => n + o.quantity,
        0,
      ),
    ).toBe(1);
    expect(
      screen.queryByRole("dialog", { name: "确认本地商品交易" }),
    ).toBeNull();
    createTrade();
    expect(state().records.shopOrders).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("可用库存不足");
  });
  it("grants a fresh single submission only after reopening transaction preview", () => {
    initState({
      records: {
        products: [
          {
            id: "TWO",
            name: "双库存合成商品",
            price: 50,
            weight: 1,
            stock: 2,
            status: "在售",
          },
        ],
        shopOrders: [],
      },
    });
    checkout();
    fireEvent.click(screen.getByRole("button", { name: "预览并确认交易" }));
    fireEvent.click(screen.getByRole("button", { name: "返回修改" }));
    expect(state().records.shopOrders).toHaveLength(0);
    for (const count of [1, 2]) {
      fireEvent.click(screen.getByRole("button", { name: "预览并确认交易" }));
      const submit = screen.getByRole("button", { name: "确认创建本地交易" });
      act(() => {
        fireEvent.click(submit);
        fireEvent.click(submit);
      });
      expect(state().records.shopOrders).toHaveLength(count);
    }
    expect(new Set(state().records.shopOrders.map((o: any) => o.id)).size).toBe(
      2,
    );
  });
});

describe("Anonymous global resource counts preserve scoped customer privacy", () => {
  it("blocks reward redemption and activity enrollment already consumed by a hidden account", () => {
    const initial = createInitialState();
    initState({
      config: { ...initial.config, customRoleId: "LIMITED" },
      records: {
        roles: [
          { id: "LIMITED", name: "单客户运营", allowedPatientIds: ["P001"] },
        ],
        rewardProducts: [
          {
            id: "GLOBAL-REWARD",
            name: "单库存全局兑换",
            pointsCost: 10,
            stock: 1,
            status: "已启用",
          },
        ],
        communityActivities: [
          {
            id: "GLOBAL-ACTIVITY",
            name: "单名额全局活动",
            capacity: 1,
            points: 10,
            status: "已启用",
            date: today(),
          },
        ],
        loyaltyAccounts: [
          {
            id: "HIDDEN-ACCOUNT",
            patientId: "P002",
            balance: 90,
            ledger: [],
            completedTasks: [],
            redemptions: [
              { id: "HIDDEN-R", productId: "GLOBAL-REWARD", status: "待领取" },
            ],
            enrollments: [
              {
                id: "HIDDEN-E",
                activityId: "GLOBAL-ACTIVITY",
                status: "已报名",
              },
            ],
          },
        ],
      },
    });
    contentRewards();
    expect(state().records.loyaltyAccounts).toHaveLength(0);
    expect(
      screen
        .getByRole("button", { name: "兑换商品", exact: true })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "名额已满" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(state().records.resourceUsage).toEqual(
      expect.arrayContaining([
        {
          id: "reward:GLOBAL-REWARD",
          kind: "reward",
          resourceId: "GLOBAL-REWARD",
          used: 1,
        },
        {
          id: "activity:GLOBAL-ACTIVITY",
          kind: "activity",
          resourceId: "GLOBAL-ACTIVITY",
          used: 1,
        },
      ]),
    );
    expect(JSON.stringify(state().records.resourceUsage)).not.toContain("P002");
    expect(
      JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!).records
        .loyaltyAccounts,
    ).toHaveLength(1);
  });
  it("does not reallocate stock held by an order outside the current patient scope", () => {
    const initial = createInitialState();
    initState({
      config: { ...initial.config, customRoleId: "LIMITED" },
      records: {
        roles: [
          { id: "LIMITED", name: "单客户运营", allowedPatientIds: ["P001"] },
        ],
        products: [
          {
            id: "ONE",
            name: "跨客户单库存",
            price: 50,
            weight: 1,
            stock: 1,
            status: "在售",
          },
        ],
        shopOrders: [
          {
            id: "HIDDEN-ORDER",
            customerId: "P002",
            productId: "ONE",
            quantity: 1,
            amount: 58,
            status: "待付款",
          },
        ],
      },
    });
    checkout();
    expect(state().records.shopOrders).toHaveLength(0);
    createTrade();
    expect(screen.getByRole("status").textContent).toContain("可用库存不足");
    expect(
      JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!).records
        .shopOrders,
    ).toHaveLength(1);
    expect(state().records.resourceUsage).toEqual([
      { id: "commerce:ONE", kind: "commerce", resourceId: "ONE", used: 1 },
    ]);
  });
});
