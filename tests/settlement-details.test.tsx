// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { createInitialState, DemoProvider } from "../src/store";
import SettlementDetails, {
  buildSettlementRows,
  settlementSubtotals,
  settlementCsvRows,
} from "../src/modules/SettlementDetails";
import * as Operations from "../src/modules/Operations";
function fixture() {
  const s = createInitialState();
  s.packages = [
    {
      id: "PK",
      name: "合成套餐",
      price: 100,
      tag: "测试",
      items: ["基础", "影像"],
    },
  ];
  s.records.groupOrders = [
    { id: "G", company: "测试单位", personalItems: ["自费"] },
  ];
  s.records.groupPersonnelGroups = [
    {
      id: "SUB",
      groupOrderId: "G",
      name: "合成一组",
      packageId: "PK",
      members: ["P001", "P003"],
    },
  ];
  s.appointments = [
    {
      id: "A1",
      patientId: "P001",
      packageId: "PK",
      date: "2026-10-10",
      time: "08:00",
      campus: "主院",
      status: "booked",
      amount: 150,
      items: ["基础", "影像", "外加", "自费"],
      results: {},
      conclusion: "",
      groupOrderId: "G",
      groupPersonnelId: "SUB",
      groupSplit: { unit: 100, personal: 50 },
      pricing: [
        { item: "基础", amount: 60 },
        { item: "影像", amount: 40 },
        { item: "外加", amount: 25 },
        { item: "自费", amount: 25 },
      ],
      waived: ["影像"],
    },
  ];
  return s;
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Redcreation synthetic settlement details", () => {
  it("classifies de-duplicated pricing against the union of all selected packages and marks missing catalogs unknown", () => {
    const s = fixture();
    s.packages.push({
      id: "PK2",
      name: "第二合成套餐",
      price: 85,
      tag: "测试",
      items: ["基础", "外加"],
    });
    s.appointments[0].packageIds = ["PK", "PK2"];
    const r = buildSettlementRows(s)[0];
    expect(r.packageName).toBe("合成套餐、第二合成套餐");
    expect(r.packageAmount).toBe(125);
    expect(r.lines.find((l) => l.item === "外加")?.packageItem).toBe(true);
    expect(r.extraUnitAmount).toBe(0);
    expect(r.lines.filter((l) => l.item === "基础")).toHaveLength(1);
    s.packages = s.packages.filter((p) => p.id !== "PK2");
    const missing = buildSettlementRows(s)[0];
    expect(missing.packageAmount).toBeNull();
    expect(missing.extraUnitAmount).toBeNull();
    expect(missing.lines.every((l) => l.packageItem === null)).toBe(true);
  });

  it("reconciles unit and personal line allocations, package/extras and waived amounts", () => {
    const r = buildSettlementRows(fixture())[0];
    expect(r).toMatchObject({
      total: 150,
      unit: 100,
      personal: 50,
      due: 150,
      pendingRefund: 0,
      packageAmount: 100,
      subgroupPackageAmount: 100,
      extraUnitAmount: 20,
      waivedAmount: 40,
      selfPayAmount: 50,
      groupMembers: 2,
    });
    expect(r.lines.map((l) => l.unit)).toEqual([48, 32, 20, 0]);
    expect(r.lines.map((l) => l.personal)).toEqual([12, 8, 5, 25]);
    expect(settlementSubtotals([r])[0]).toMatchObject({
      count: 1,
      people: 1,
      registeredMembers: 2,
      total: 150,
    });
  });
  it("does not invent pricing or paid amounts from a clinical workflow status", () => {
    const s = fixture();
    delete s.appointments[0].pricing;
    s.appointments[0].status = "approved";
    const r = buildSettlementRows(s)[0];
    expect(r.total).toBe(150);
    expect(r.paid).toBeNull();
    expect(r.due).toBeNull();
    expect(r.packageAmount).toBeNull();
    expect(r.waivedAmount).toBeNull();
    expect(r.lines.every((l) => l.amount === null)).toBe(true);
  });
  it("uses explicit personal collection and unit settlement, then separates pending and completed refunds", () => {
    const s = fixture();
    s.records.groupAccounts = [{ id: "GA-G", settledIds: ["A1"] }];
    Object.assign(s.appointments[0], {
      status: "paid",
      paidAt: "2026-10-10T10:00:00Z",
    });
    expect(buildSettlementRows(s)[0]).toMatchObject({ paid: 150, due: 0 });
    Object.assign(s.appointments[0], {
      status: "cancelled",
      refundRequested: true,
      refundRequestedAmount: 40,
    });
    expect(buildSettlementRows(s)[0]).toMatchObject({
      pendingRefund: 40,
      due: 0,
    });
    Object.assign(s.appointments[0], { refunded: true, refundAmount: 40 });
    expect(buildSettlementRows(s)[0]).toMatchObject({
      pendingRefund: 0,
      refund: 40,
    });
  });
  it("preserves zero-priced lines and refuses to allocate inconsistent pricing", () => {
    const s = fixture();
    s.appointments[0].pricing[3].amount = 0;
    s.appointments[0].amount = 125;
    s.appointments[0].groupSplit = { unit: 100, personal: 25 };
    expect(buildSettlementRows(s)[0].lines[3]).toMatchObject({
      amount: 0,
      unit: 0,
      personal: 0,
    });
    s.appointments[0].amount = 126;
    expect(buildSettlementRows(s)[0].lines.every((l) => l.unit === null)).toBe(
      true,
    );
  });
  it("filters the actual order population and exports matching group subtotals", () => {
    const s = fixture();
    s.appointments.push({
      ...s.appointments[0],
      id: "A2",
      date: "2026-11-12",
      patientId: "P002",
      groupOrderId: undefined,
      groupPersonnelId: undefined,
      groupSplit: undefined,
    });
    localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(s));
    const download = vi
      .spyOn(Operations, "downloadCsv")
      .mockImplementation(() => {});
    render(
      <DemoProvider>
        <SettlementDetails />
      </DemoProvider>,
    );
    fireEvent.change(screen.getByLabelText("结算单位"), {
      target: { value: "测试单位" },
    });
    fireEvent.change(screen.getByLabelText("结算人员组"), {
      target: { value: "SUB" },
    });
    fireEvent.change(screen.getByLabelText("结算结束日期"), {
      target: { value: "2026-10-31" },
    });
    expect(screen.getByText(/林知远 · A1/)).toBeTruthy();
    expect(screen.queryByText(/A2/)).toBeNull();
    expect(
      within(screen.getByRole("table", { name: "分组结算小计" })).getAllByRole(
        "row",
      ),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /导出分组小计/ }));
    expect(download).toHaveBeenCalledWith(
      "红创-分组结算小计",
      settlementCsvRows(buildSettlementRows(s).slice(0, 1)),
      expect.any(Array),
    );
    fireEvent.change(screen.getByLabelText("结算开始日期"), {
      target: { value: "2026-11-01" },
    });
    expect(screen.getByRole("status").textContent).toContain("没有订单");
  });
});
