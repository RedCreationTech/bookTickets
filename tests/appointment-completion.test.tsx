import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { DemoProvider, createInitialState } from "../src/store";
import { Appointments } from "../src/modules/Core";
import {
  AppointmentActions,
  AppointmentAudit,
} from "../src/modules/AppointmentActions";
import { validateGroupCsv } from "../src/modules/Advanced";
import { getBookingAvailability } from "../src/bookingRules";
import { makeSyntheticIdentity } from "../src/groupImportRules";
import { reducer } from "../src/model";
const key = "hongchuang.health.demo.v1";
const read = () => JSON.parse(localStorage.getItem(key)!);
const mount = (s: any, n: React.ReactNode) => {
  localStorage.setItem(key, JSON.stringify(s));
  return render(<DemoProvider>{n}</DemoProvider>);
};
describe("appointment source actions audit and group identity integration", () => {
  it("T0050 phone source is persisted and filters only the matching orders", () => {
    const s = createInitialState();
    mount(s, <Appointments />);
    fireEvent.click(screen.getByRole("button", { name: "新建预约" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("预约来源"), {
      target: { value: "电话预约" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "确认预约" }));
    expect(read().appointments[0].source).toBe("电话预约");
    fireEvent.change(screen.getByLabelText("预约渠道筛选"), {
      target: { value: "电话预约" },
    });
    expect(screen.getByText(/共 1 条/)).toBeInTheDocument();
  });
  it("T0072 current person blacklist actually prevents booking and release restores it", () => {
    const s = createInitialState(),
      a = s.appointments[0];
    mount(s, <AppointmentActions appointment={a} />);
    fireEvent.click(screen.getByRole("button", { name: "设置预约黑名单" }));
    expect(
      getBookingAvailability(read(), "2026-10-14", undefined, {
        patientId: a.patientId,
      }).allowed,
    ).toBe(false);
    expect(
      read().patients.find((p: any) => p.id !== a.patientId).blacklisted,
    ).not.toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "解除预约黑名单" }));
    expect(
      getBookingAvailability(read(), "2026-10-14", undefined, {
        patientId: a.patientId,
      }).allowed,
    ).toBe(true);
  });
  it("T0072 notification has exact order patient and same-batch double activation is idempotent", () => {
    const s = createInitialState(),
      a = s.appointments[0];
    mount(s, <AppointmentActions appointment={a} />);
    const b = screen.getByRole("button", { name: "为当前预约模拟发送通知" });
    act(() => {
      b.click();
      b.click();
    });
    expect(read().records.messages).toHaveLength(1);
    expect(read().records.messages[0]).toMatchObject({
      appointmentId: a.id,
      patientId: a.patientId,
      channel: "短信模拟",
    });
  });
  it("T0078 source question and chosen project timeline derives current order snapshots", () => {
    let s = createInitialState(),
      a = s.appointments[0];
    s = reducer(s, {
      type: "UPDATE_APPOINTMENT",
      payload: {
        id: a.id,
        source: "电话预约",
        date: "2026-10-14",
        questionnaireAnswers: { exercise: "合成每周两次" },
        recommendedItems: ["骨密度"],
      },
    });
    a = s.appointments[0];
    mount(s, <AppointmentAudit appointment={a} />);
    expect(screen.getAllByText(/电话预约/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/合成每周两次/).length).toBeGreaterThan(0);
    expect(screen.getByText(/系统推荐：骨密度/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-13 → 2026-10-14/)).toBeInTheDocument();
  });
  it("group CSV special-empty resolves stable synthetic patient identity without real identifiers", () => {
    const s = createInitialState(),
      text =
        "姓名,证件标识,套餐,分组,日期,时段,院区\n合成免证件客户,,PK01,,2026-10-14,08:00–08:30,中心院区";
    const a = validateGroupCsv(text, s, {
        identityMode: "special-empty",
        company: "合成单位",
      }),
      b = validateGroupCsv(text, s, {
        identityMode: "special-empty",
        company: "合成单位",
      });
    expect(a.rows[0].errors).toEqual([]);
    expect(a.rows[0].newPatient.certificate).toBe("");
    expect(a.rows[0].patientId).toBe(b.rows[0].patientId);
  });
  it("group CSV accepts only fictional-region test identity with valid checksum", () => {
    const s = createInitialState(),
      id = makeSyntheticIdentity();
    const csv = (identity: string) =>
      `姓名,证件标识,套餐,分组,日期,时段,院区\n合成身份客户,${identity},PK01,,2026-10-14,08:00–08:30,中心院区`;
    const a = validateGroupCsv(csv(id), s, { identityMode: "synthetic-id" });
    expect(a.rows[0].errors).toEqual([]);
    expect(a.rows[0].newPatient.syntheticIdentity).toBe(id);
    expect(
      validateGroupCsv(csv(id.replace("999999", "110101")), s, {
        identityMode: "synthetic-id",
      }).rows[0].errors.join(),
    ).toContain("虚构");
  });
});
