// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
  act,
} from "@testing-library/react";
import { DemoProvider, createInitialState, useDemo } from "../src/store";
import InvoiceReminder, {
  invoiceDueDate,
  getInvoiceReminderRows,
} from "../src/modules/InvoiceReminder";
import ResearchFilters, {
  evaluateResearchCriteria,
  buildResearchResults,
  RESEARCH_EXPORT_FIELDS,
} from "../src/modules/ResearchFilters";
import type { ResearchCriterion } from "../src/modules/ResearchFilters";
import Health from "../src/modules/Health";
import * as Operations from "../src/modules/Operations";
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
  return JSON.parse(screen.getByTestId("state").textContent!);
}
function fixture() {
  const s = createInitialState();
  s.config.invoiceDemoDate = "2026-10-05";
  s.config.invoiceReminderSeller = "业务员甲";
  s.records.invoiceLedger = [
    {
      id: "INV-A",
      seller: "业务员甲",
      amount: 100,
      parts: [100],
      appointmentIds: ["A1"],
      status: "有效",
      createdAt: "2026-10-01T08:00:00Z",
      paymentTermDays: 10,
    },
    {
      id: "INV-B",
      seller: "业务员乙",
      amount: 200,
      parts: [200],
      appointmentIds: ["A2"],
      status: "有效",
      createdAt: "2026-10-01T08:00:00Z",
      paymentTermDays: 2,
    },
  ];
  return s;
}
function seed(s: ReturnType<typeof createInitialState>) {
  localStorage.setItem("hongchuang.health.demo.v1", JSON.stringify(s));
}
const criteria: ResearchCriterion[] = [
  { id: "1", metric: "totalCholesterol", operator: ">=", threshold: 5.2 },
  { id: "2", metric: "systolic", operator: ">=", threshold: 140 },
];
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Invoice-time-linked local salesperson reminders T0196", () => {
  it("derives dates in UTC and rejects invalid dates and fractional terms", () => {
    expect(invoiceDueDate("2026-01-31T23:00:00Z", 30)).toBe("2026-03-02");
    expect(invoiceDueDate("2026-02-30", 1)).toBeNull();
    expect(invoiceDueDate("2026-10-01", 1.5)).toBeNull();
  });
  it("only counts posted receipts linked to the exact invoice and visible at demo time", () => {
    const s = fixture();
    s.records.invoiceReceipts = [
      {
        id: "R1",
        invoiceId: "INV-A",
        amount: 25,
        status: "已登记",
        date: "2026-10-03",
      },
      {
        id: "R2",
        invoiceId: "INV-B",
        amount: 200,
        status: "已登记",
        date: "2026-10-03",
      },
      {
        id: "R3",
        invoiceId: "INV-A",
        amount: 50,
        status: "已作废",
        date: "2026-10-03",
      },
      {
        id: "R4",
        invoiceId: "INV-A",
        amount: 50,
        status: "已登记",
        date: "2026-10-12",
      },
    ];
    const rows = getInvoiceReminderRows(s, "2026-10-11");
    expect(rows[0]).toMatchObject({
      collected: 25,
      outstanding: 75,
      dueNow: true,
      receiptIds: ["R1"],
    });
    expect(rows[1]).toMatchObject({ outstanding: 0, dueNow: false });
    s.records.invoiceLedger[0].status = "已作废";
    expect(getInvoiceReminderRows(s, "2026-10-11")[0].dueNow).toBe(false);
  });
  it("opens a targeted popup when demo time reaches the invoice due date and retains acknowledgements", () => {
    seed(fixture());
    const view = mount(<InvoiceReminder />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(screen.getByLabelText("发票提醒演示日期"), {
      target: { value: "2026-10-11" },
    });
    let popup = screen.getByRole("dialog", { name: "业务员到期回款提醒" });
    expect(popup.textContent).toContain("INV-A");
    expect(popup.textContent).not.toContain("INV-B");
    fireEvent.click(within(popup).getByRole("button", { name: "确认已查看" }));
    expect(state().records.invoiceReminders).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    mount(<InvoiceReminder />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(screen.getByLabelText("回款提醒业务员"), {
      target: { value: "业务员乙" },
    });
    popup = screen.getByRole("dialog");
    expect(popup.textContent).toContain("INV-B");
    expect(popup.textContent).not.toContain("INV-A");
  });
  it("saves invoice-based due dates, rejects overpayment and prevents batched double receipts", () => {
    const s = fixture();
    delete s.records.invoiceLedger[0].paymentTermDays;
    seed(s);
    mount(<InvoiceReminder />);
    fireEvent.change(screen.getByLabelText("开票后回款天数"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存发票回款时间" }));
    expect(state().records.invoiceLedger[0]).toMatchObject({
      paymentDueDate: "2026-10-04",
      paymentTermDays: 3,
      appointmentIds: ["A1"],
      parts: [100],
    });
    fireEvent.click(screen.getByRole("button", { name: "稍后查看" }));
    fireEvent.change(screen.getByLabelText("本次发票回款金额"), {
      target: { value: "101" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "登记关联发票回款（模拟）" }),
    );
    expect(state().records.invoiceReceipts).toBeUndefined();
    fireEvent.change(screen.getByLabelText("本次发票回款金额"), {
      target: { value: "100" },
    });
    const button = screen.getByRole("button", {
      name: "登记关联发票回款（模拟）",
    });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(state().records.invoiceReceipts).toHaveLength(1);
    expect(state().records.invoiceReceipts[0]).toMatchObject({
      invoiceId: "INV-A",
      amount: 100,
      status: "已登记",
      date: "2026-10-05",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "检查到期提醒" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not seed a replacement invoice ledger", () => {
    mount(<InvoiceReminder />);
    expect(screen.getByRole("status").textContent).toContain("尚无发票");
    expect(state().records.invoiceLedger).toBeUndefined();
  });
});
describe("Composite research screening T0401", () => {
  it("uses three-valued AND/OR without treating missing metrics as abnormal", () => {
    expect(
      evaluateResearchCriteria(
        { totalCholesterol: 6, systolic: 150 },
        criteria,
        "AND",
      ).status,
    ).toBe("matched");
    expect(
      evaluateResearchCriteria({ totalCholesterol: 6 }, criteria, "AND").status,
    ).toBe("unknown");
    expect(
      evaluateResearchCriteria({ totalCholesterol: 4 }, criteria, "AND").status,
    ).toBe("excluded");
    expect(
      evaluateResearchCriteria({ totalCholesterol: 6 }, criteria, "OR"),
    ).toMatchObject({ status: "matched", unknownCount: 1 });
    expect(
      evaluateResearchCriteria({ totalCholesterol: 4 }, criteria, "OR").status,
    ).toBe("unknown");
    for (const value of [null, undefined, "", NaN, Infinity])
      expect(
        evaluateResearchCriteria(
          { totalCholesterol: value, systolic: value },
          criteria,
          "OR",
        ).status,
      ).toBe("unknown");
  });
  it("exports the exact filtered rows and their measurements, then allows OR and rule editing", () => {
    const s = createInitialState();
    s.patients = s.patients
      .slice(0, 3)
      .map((p, i) => ({
        ...p,
        health:
          i === 0
            ? { totalCholesterol: 6, systolic: 150 }
            : i === 1
              ? { totalCholesterol: 6 }
              : { totalCholesterol: 4, systolic: 160 },
      }));
    seed(s);
    const download = vi
      .spyOn(Operations, "downloadCsv")
      .mockImplementation(() => {});
    mount(<ResearchFilters />);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "查看明细" }));
    expect(screen.getByText(/实测 150 mmHg/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "导出当前结果（1）" }));
    expect(download).toHaveBeenLastCalledWith(
      "红创科研筛选_合成演示",
      buildResearchResults(s.patients, criteria, "AND").filter(
        (r) => r.status === "matched",
      ),
      RESEARCH_EXPORT_FIELDS,
    );
    fireEvent.change(screen.getByLabelText("科研条件组合"), {
      target: { value: "OR" },
    });
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(
      3,
    );
    fireEvent.change(screen.getByLabelText("科研条件组合"), {
      target: { value: "AND" },
    });
    fireEvent.change(screen.getByLabelText("科研结果范围"), {
      target: { value: "unknown" },
    });
    expect(screen.getByRole("table").textContent).toContain(s.patients[1].name);
    fireEvent.click(screen.getByRole("button", { name: "添加指标条件" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "导出当前结果（0）" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("研究阈值 3"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "删除条件 3" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("is reachable from the enterprise workspace with the stable synthetic health mapping", () => {
    mount(<Health section="enterprise" />);
    fireEvent.click(screen.getByRole("button", { name: "科研复合筛选" }));
    expect(
      screen.getByRole("region", { name: "红创科研多指标筛选" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("科研条件组合")).toBeTruthy();
  });
});
