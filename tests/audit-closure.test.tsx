import {Dashboard} from "../src/modules/Core";
import { buildSettlementRows } from "../src/modules/SettlementDetails";
import Patient from "../src/modules/Patient";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DemoProvider, createInitialState } from "../src/store";
import { reducer } from "../src/model";
import { localHistoricalOrders } from "../src/clinicalRules";
import {
  orderPaidAllocations,
  previewOrderPayment,
} from "../src/orderFinanceRules";
import { ReviewWorkflowSettings } from "../src/modules/ReviewWorkflow";
const key = "hongchuang.health.demo.v1";
describe("fixed exhaustive audit gap closure", () => {
  it("T0226/T0305 prior history never includes future or ambiguous same-day results", () => {
    const s = createInitialState(),
      a = s.appointments[0];
    s.appointments = [
      a,
      { ...a, id: "PAST", date: "2025-10-13", results: { 空腹血糖: "5.5" } },
      { ...a, id: "FUTURE", date: "2027-10-13", results: { 空腹血糖: "9.5" } },
      { ...a, id: "SAME", results: { 空腹血糖: "6.5" } },
    ];
    expect(localHistoricalOrders(s, a).map((x) => x.id)).toEqual(["PAST"]);
  });
  it("T0312 visible permission configuration is actually consumed by the undo guard", () => {
    let s = createInitialState();
    s.config.role = "admin";
    s.appointments = [
      {
        ...s.appointments[0],
        status: "review",
        reviewStage: 1,
        reviewHistory: [{ stage: 0, node: "初审" }],
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    render(
      <DemoProvider>
        <ReviewWorkflowSettings />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByText("审核流程、医生等级与分检科室授权"));
    fireEvent.click(screen.getByLabelText("审核撤销权限 reviewer"));
    s = JSON.parse(localStorage.getItem(key)!);
    s.config.role = "reviewer";
    const action = {
      type: "UNDO_REVIEW_STAGE",
      payload: {
        id: s.appointments[0].id,
        expectedStage: 1,
        reason: "合成撤销",
      },
    };
    expect(reducer(s, action)).toBe(s);
    s.config.role = "admin";
    expect(reducer(s, action).appointments[0].reviewStage).toBe(0);
  });
  it("T0217 added-item payment updates canonical transaction and all existing paid allocations exactly once", () => {
    let s = createInitialState();
    const a = s.appointments[0];
    s.config.role = "admin";
    s.records.orderingRules = [
      { id: "B", item: "一般检查", required: true, price: 99 },
      { id: "X", item: "审计新项目", price: 50 },
    ];
    a.paymentAllocations = orderPaidAllocations(s, a);
    const old = { ...a.paymentAllocations };
    s = reducer(s, {
      type: "IN_EXAM_ADD_REQUEST",
      payload: { id: a.id, requestId: "AUDIT-ADD", items: ["审计新项目"] },
    });
    const pay = {
      type: "IN_EXAM_ADD_PAY",
      payload: { id: a.id, chargeId: "AUDIT-ADD", channel: "微信" },
    };
    s = reducer(s, pay);
    const paid = s.appointments[0];
    expect(paid.paymentAllocations).toEqual({ ...old, 审计新项目: 50 });
    expect(paid.pricing.map((r: any) => r.item)).toEqual(
      expect.arrayContaining([...a.items, "审计新项目"]),
    );
    expect(s.records.orderTransactions).toHaveLength(1);
    expect(s.records.orderTransactions[0]).toMatchObject({
      appointmentId: a.id,
      grossCharge: 50,
      grossRefund: 0,
      net: 50,
      lines: [{ item: "审计新项目", charge: 50, refund: 0 }],
    });
    const again = reducer(s, pay);
    expect(again.records.orderTransactions).toHaveLength(1);
    expect(orderPaidAllocations(s, paid)["审计新项目"]).toBe(50);
  });
  it("T0483 H5 consumes the chosen unit order's own capacity instead of only the company schedule", () => {
    const s = createInitialState();
    s.appointments = [];
    s.records.groupOrders = [
      {
        id: "ORDER-CAP",
        company: "星辰科技",
        name: "独立单位单",
        status: "生效",
        startDate: "2026-10-01",
        endDate: "2026-12-31",
        mode: "限额自选",
        budget: 300,
        packages: ["PK01"],
        members: ["P001"],
        optionalItems: [],
        choose: 0,
      },
    ];
    s.records.groupOrderBookingRules = [
      {
        id: "LIMIT",
        groupOrderId: "ORDER-CAP",
        dailyCapacity: 0,
        enabled: true,
      },
    ];
    localStorage.setItem(key, JSON.stringify(s));
    window.location.hash = "#/patient?group=xingchen-2026";
    render(
      <DemoProvider>
        <Patient />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /已阅读预约须知/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认预约" }));
    expect(JSON.parse(localStorage.getItem(key)!).appointments).toHaveLength(0);
    expect(
      screen.getByText(/所选单位订单的独立日容量已满/),
    ).toBeInTheDocument();
  });

  it("H5 personal payment records 99 actual receipts and keeps 300 unit credit outstanding", () => {
    let s = createInitialState(),
      a = {
        ...s.appointments[0],
        status: "booked" as const,
        packageId: "PK01",
        items: [...s.packages[0].items],
        results: {},
        amount: 399,
        groupOrderId: "G",
        groupSplit: { unit: 300, personal: 99 },
        selfPay: 99,
      };
    s.appointments = [a];
    s.records.groupOrders = [
      {
        id: "G",
        company: "星辰科技",
        status: "生效",
        budget: 300,
        packages: ["PK01"],
      },
    ];
    s = reducer(s, { type: "PAYMENT", payload: { id: a.id } });
    expect(s.appointments[0]).toMatchObject({
      status: "paid",
      paidAmount: 99,
      personalPaidAmount: 99,
      amountDue: 300,
    });
    expect(s.records.orderTransactions[0]).toMatchObject({
      grossCharge: 99,
      net: 99,
      payer: "personal",
    });
    expect(buildSettlementRows(s)[0]).toMatchObject({ paid: 99, due: 300 });
    const duplicate = reducer(s, { type: "PAYMENT", payload: { id: a.id } });
    expect(duplicate).toBe(s);
  });
  it("dashboard trend consumes actual seven-day orders and excludes cancelled and future appointments",()=>{const s=createInitialState(),a=s.appointments[0];s.appointments=[{...a,status:"in_exam"},{...a,id:"FUTURE",date:"2026-10-14"},{...a,id:"OLD",date:"2026-09-01"},{...a,id:"CANCELLED",status:"cancelled"}];localStorage.setItem(key,JSON.stringify(s));render(<DemoProvider><Dashboard/></DemoProvider>);expect(screen.getByText(/周度预约总量/).textContent).toMatch(/1\s*人/);expect(screen.getByRole("img",{name:"最近七日实际本地预约与到检趋势"})).toBeInTheDocument();expect(screen.queryByText("趋势为固定合成样例")).toBeNull();});

});
