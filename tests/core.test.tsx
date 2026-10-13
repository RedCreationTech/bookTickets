import { describe, it, expect } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { DemoProvider, createInitialState } from "../src/store";
import App from "../src/App";
import {
  Appointments,
  Exam,
  Review,
  Reports,
  Finance,
} from "../src/modules/Core";
const wrap = (node: React.ReactNode) =>
  render(<DemoProvider>{node}</DemoProvider>);
describe("core frontend interactions", () => {
  it("U01 creates a booking, persists it and records payment", () => {
    wrap(<Appointments />);
    fireEvent.click(screen.getByRole("button", { name: "新建预约" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认预约" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!);
    expect(saved.appointments).toHaveLength(9);
    expect(saved.appointments[0].status).toBe("booked");
    const payments = screen.getAllByRole("button", { name: "模拟收款" });
    fireEvent.click(payments[0]);
    expect(
      JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!).appointments[0]
        .status,
    ).toBe("paid");
  });
  it("U02 closes booking without creating it", () => {
    wrap(<Appointments />);
    fireEvent.click(screen.getByRole("button", { name: "新建预约" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }),
    );
    expect(
      JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!).appointments,
    ).toHaveLength(8);
  });
  it("U03 blocks nonnumeric clinical results and incomplete submissions", () => {
    wrap(<Exam />);
    fireEvent.click(screen.getByRole("button", { name: "提交分检结果" }));
    expect(screen.getByRole("alert")).toHaveTextContent("未录入");
    fireEvent.click(screen.getByRole("button", { name: "填入正常示例" }));
    fireEvent.change(screen.getByLabelText("空腹血糖结果"), {
      target: { value: "正常" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交分检结果" }));
    expect(screen.getByRole("alert")).toHaveTextContent("必须为数值型");
    fireEvent.change(screen.getByLabelText("空腹血糖结果"), {
      target: { value: "5.8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交分检结果" }));
    const data = JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!);
    expect(data.appointments[0].status).toBe("review");
  });
  it("U04 generates actual associated demo conclusion and advances three review stages", () => {
    wrap(<Review />);
    fireEvent.click(
      screen.getByRole("button", { name: "生成关联异常综合建议" }),
    );
    expect(
      (screen.getByRole("textbox") as HTMLTextAreaElement).value,
    ).toContain("关联指标");
    fireEvent.click(screen.getByRole("button", { name: "通过初审" }));
    fireEvent.click(screen.getByRole("button", { name: "通过主检" }));
    fireEvent.click(screen.getByRole("button", { name: "通过总检" }));
    const data = JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!);
    expect(
      data.appointments.find((x: any) => x.patientId === "P003").status,
    ).toBe("approved");
  });
  it("U05 report exposes selectable synthetic history years and records issuance", () => {
    wrap(<Reports />);
    fireEvent.click(screen.getAllByRole("button", { name: "预览 / 管理" })[0]);
    expect(screen.getByLabelText("2025 年订单")).toBeChecked();
    fireEvent.click(screen.getByLabelText("2025 年订单"));
    expect(screen.getByLabelText("2025 年订单")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "登记领取" }));
    expect(screen.getByRole("button", { name: "登记领取" })).toBeDisabled();
  });
  it("U06 role switching changes workbench and denies direct unauthorized route", async () => {
    wrap(<App />);
    fireEvent.change(screen.getByLabelText("切换演示角色"), {
      target: { value: "doctor" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "分检工作站" }),
      ).toBeInTheDocument(),
    );
    window.location.hash = "/finance";
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() =>
      expect(screen.getByText("当前角色无此页面权限")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "财务结算中心" }),
    ).not.toBeInTheDocument();
  });
  it("U07 rejects overpayment and supports partial group settlement", () => {
    wrap(<Finance />);
    fireEvent.click(screen.getAllByRole("button", { name: "分批结算" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton"), {
      target: { value: "999999" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "登记模拟回款" }),
    );
    expect(
      screen.getByText("金额须大于 0，且不能超过剩余应收"),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("spinbutton"), {
      target: { value: "1000" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "登记模拟回款" }),
    );
    expect(
      JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!).records
        .bills[0].paid,
    ).toBe(81000);
  });
});
