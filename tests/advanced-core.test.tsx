import { describe, it, expect } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { DemoProvider, createInitialState, reducer, today } from "../src/store";
import { Appointments, Review, Reports } from "../src/modules/Core";
import Queue from "../src/modules/Queue";
const KEY = "hongchuang.health.demo.v1";
const data = () => JSON.parse(localStorage.getItem(KEY)!);
const mount = (x: React.ReactNode) => render(<DemoProvider>{x}</DemoProvider>);
describe("advanced frontend scenarios", () => {
  it("A01 queue departments have independent membership and completion", () => {
    mount(<Queue />);
    expect(screen.getByText("采血区候检队列")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "完成出队" })[0]);
    const complete = data().records.queueTickets.filter(
      (x: any) => x.status === "done",
    );
    expect(complete).toHaveLength(1);
    expect(complete[0].department).toBe("采血区");
    fireEvent.click(screen.getByRole("button", { name: "超声区" }));
    expect(screen.getAllByRole("button", { name: "完成出队" })).toHaveLength(2);
  });
  it("A02 queue over-number requires reason and can recall", () => {
    mount(<Queue />);
    fireEvent.click(screen.getAllByRole("button", { name: "过号" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "确认过号" }),
    ).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "暂离" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认过号" }));
    expect(
      screen.getByRole("button", { name: "召回入队" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "召回入队" }));
    expect(
      data().records.queueTickets.filter((x: any) => x.status === "missed"),
    ).toHaveLength(0);
  });
  it("A03 queue privacy mask and move order persist", () => {
    mount(<Queue />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "隐藏姓名中间字（大屏同步）" }),
    );
    expect(screen.getByText("林*远")).toBeInTheDocument();
    const before = data().records.queueTickets.find(
      (x: any) => x.department === "采血区" && x.position === 0,
    ).id;
    fireEvent.click(screen.getByRole("button", { name: "下移林知远" }));
    expect(
      data().records.queueTickets.find(
        (x: any) => x.department === "采血区" && x.position === 1,
      ).id,
    ).toBe(before);
  });
  it("A04 audit captures before and after for item changes and config", () => {
    let s = createInitialState();
    const a = s.appointments[0];
    s = reducer(s, {
      type: "UPDATE_APPOINTMENT",
      payload: {
        id: a.id,
        amount: a.amount - 50,
        items: [...a.items, "测试检查"],
      },
    });
    expect(s.audit[0].before.amount).toBe(a.amount);
    expect(s.audit[0].after.amount).toBe(a.amount - 50);
    expect(s.audit[0].entity).toBe(a.id);
    s = reducer(s, { type: "UPDATE_CONFIG", payload: { dailyCapacity: 10 } });
    expect(s.audit[0].before.dailyCapacity).toBe(80);
    expect(s.audit[0].after.dailyCapacity).toBe(10);
  });
  it("A05 report overdue filtering derives from date and configured days", () => {
    const s = createInitialState();
    s.appointments[2].date = "2020-01-01";
    localStorage.setItem(KEY, JSON.stringify(s));
    mount(<Review />);
    expect(screen.getByText(/超期\d+天/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "仅看超期报告" }));
    expect(screen.queryByText("陆星遥")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "陈映山 的体检报告" }),
    ).toBeInTheDocument();
  });
  it("A06 batch report inventory uses stable cabinet IDs and selected orders only", () => {
    const s = createInitialState(),
      a = s.appointments.find(
        (a) => a.status === "printed" || a.status === "approved",
      )!;
    a.printedAt = "2026-10-13T07:00:00Z";
    a.printCount = 1;
    s.records.reportCabinetCategories = [
      { id: "C", name: "A区", status: "已启用" },
    ];
    s.records.reportCabinetSlots = [
      {
        id: "S",
        name: "02-03",
        categoryId: "C",
        capacity: 20,
        status: "已启用",
      },
    ];
    localStorage.setItem(KEY, JSON.stringify(s));
    mount(<Reports />);
    fireEvent.click(screen.getByLabelText("选择报告" + a.id));
    fireEvent.change(screen.getByLabelText("报告流转动作"), {
      target: { value: "stock_in" },
    });
    fireEvent.change(screen.getByLabelText("目标报告柜位"), {
      target: { value: "S" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览本次报告流转" }));
    fireEvent.click(screen.getByRole("button", { name: "确认登记本次流转" }));
    expect(data().appointments.filter((x: any) => x.cabinet)).toHaveLength(1);
    expect(
      data().records.reportArchives.find((x: any) => x.appointmentId === a.id),
    ).toMatchObject({ slotId: "S", inventoryStatus: "in" });
  });
  it("A07 appointment date filter and direct selected link work", () => {
    window.location.hash = "/appointments?selected=TJ2026100001";
    mount(<Appointments />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.change(screen.getByLabelText("筛选预约日期"), {
      target: { value: "2099-01-01" },
    });
    expect(screen.getByText("暂无符合条件的记录")).toBeInTheDocument();
  });
});
