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
import { DemoProvider, useDemo } from "../src/store";
import Operations from "../src/modules/Operations";
import Health from "../src/modules/Health";
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
      expect(localStorage.getItem("qinghe.health.demo.v1")).toContain(
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
