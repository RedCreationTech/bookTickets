import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DemoProvider, createInitialState, useDemo } from "../src/store";
import { reducer } from "../src/model";
import { RegistrationProfile } from "../src/modules/Registration";
import {
  RegistrationConsents,
  PastHistoryNotice,
} from "../src/modules/RegistrationConsents";
const key = "hongchuang.health.demo.v1";
const read = () => JSON.parse(localStorage.getItem(key)!);
const wrap = (node: React.ReactNode) =>
  render(<DemoProvider>{node}</DemoProvider>);
describe("locked registration extension scope", () => {
  it("B01 photo refusal has explicit consent, cancel is inert and repeated confirmation is idempotent", () => {
    wrap(<RegistrationConsents appointmentId="TJ2026100001" />);
    fireEvent.click(screen.getByRole("button", { name: "新建演示签署" }));
    fireEvent.click(screen.getByRole("button", { name: "取消签署" }));
    expect(read().records.registrationConsents || []).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "新建演示签署" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存演示留样" }));
    expect(screen.getByRole("alert")).toHaveTextContent("合成签署");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /我确认这是合成签署/ }),
    );
    const b = screen.getByRole("button", { name: "确认保存演示留样" });
    act(() => {
      b.click();
      b.click();
    });
    expect(read().records.registrationConsents).toHaveLength(1);
    expect(read().appointments[0].photoDeclined).toBe(true);
    expect(read().appointments[0].status).toBe("in_exam");
    expect(read().records.registrationConsents[0].kind).toBe("弃拍确认");
  });
  it("B02 all requested signature categories retain separate synthetic records without advancing a clinical order", () => {
    wrap(<RegistrationConsents appointmentId="TJ2026100001" />);
    for (const kind of [
      "弃检签字",
      "知情书签字",
      "检查结束签字",
      "职业病签字",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: "新建演示签署" }));
      fireEvent.change(screen.getByLabelText("签署类型"), {
        target: { value: kind },
      });
      fireEvent.click(
        screen.getByRole("checkbox", { name: /我确认这是合成签署/ }),
      );
      fireEvent.click(screen.getByRole("button", { name: "确认保存演示留样" }));
    }
    expect(read().records.registrationConsents).toHaveLength(4);
    expect(read().appointments[0].status).toBe("in_exam");
    expect(read().appointments[0].waived || []).toHaveLength(0);
  });
  it("B03 locked order prevents new signature collection", () => {
    const s = createInitialState();
    s.appointments[0].locked = true;
    localStorage.setItem(key, JSON.stringify(s));
    wrap(<RegistrationConsents appointmentId={s.appointments[0].id} />);
    expect(screen.getByRole("button", { name: "新建演示签署" })).toBeDisabled();
  });
  it("B04 custom synthetic medical history persists and is read by the downstream doctor reminder", () => {
    const ui = wrap(<RegistrationProfile patientId="P001" />);
    fireEvent.change(screen.getByLabelText("自定义既往史（仅合成资料）"), {
      target: { value: "合成：既往血压随访史，待人工核对" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客户基本资料" }));
    expect(read().patients[0].pastMedicalHistory).toContain("既往血压");
    ui.unmount();
    wrap(<PastHistoryNotice appointmentId="TJ2026100001" />);
    expect(
      screen.getByRole("region", { name: "分检既往史提醒" }),
    ).toHaveTextContent("既往血压");
    const button = screen.getByRole("button", { name: "确认已阅读既往史" });
    act(() => {
      button.click();
      button.click();
    });
    expect(read().records.medicalHistoryReads).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "已阅读本版既往史" }),
    ).toBeDisabled();
  });
  it("A-cancel reducer protects ownership and locked clinical work, archives only the target and restores as cancelled", () => {
    const s = createInitialState();
    const a = s.appointments[1];
    s.config.cancellationPolicy = "deleteBusiness";
    s.records.printTasks = [
      { id: "mine", appointmentId: a.id },
      { id: "other", appointmentId: s.appointments[0].id },
    ];
    s.records.invoiceLedger = [{ id: "finance", appointmentIds: [a.id] }];
    expect(
      reducer(s, {
        type: "CANCEL_PATIENT_APPOINTMENT",
        payload: { id: a.id, patientId: "P001" },
      }),
    ).toBe(s);
    const cancelled = reducer(s, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: a.id, patientId: a.patientId },
    });
    expect(cancelled.appointments).toHaveLength(s.appointments.length - 1);
    expect(cancelled.records.printTasks.map((r) => r.id)).toEqual(["other"]);
    expect(cancelled.records.invoiceLedger).toEqual(s.records.invoiceLedger);
    expect(
      cancelled.records.cancelledAppointmentArchive[0].appointment.id,
    ).toBe(a.id);
    expect(
      reducer(cancelled, {
        type: "CANCEL_PATIENT_APPOINTMENT",
        payload: { id: a.id, patientId: a.patientId },
      }),
    ).toBe(cancelled);
    const restored = reducer(cancelled, {
      type: "RESTORE_CANCELLED_APPOINTMENT",
      payload: { id: a.id, patientId: a.patientId },
    });
    expect(restored.appointments[0].status).toBe("cancelled");
    expect(restored.records.printTasks).toHaveLength(1);
    expect(
      reducer(restored, {
        type: "RESTORE_CANCELLED_APPOINTMENT",
        payload: { id: a.id, patientId: a.patientId },
      }),
    ).toBe(restored);
    s.appointments[1].locked = true;
    expect(
      reducer(s, {
        type: "CANCEL_PATIENT_APPOINTMENT",
        payload: { id: a.id, patientId: a.patientId },
      }),
    ).toBe(s);
  });
  it("A-cancel retain policy does not delete business records or other appointments", () => {
    const s = createInitialState();
    const a = s.appointments[1];
    const changed = reducer(s, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: a.id, patientId: a.patientId },
    });
    expect(changed.appointments).toHaveLength(s.appointments.length);
    expect(changed.appointments[1].status).toBe("cancelled");
    expect(changed.appointments[0]).toEqual(s.appointments[0]);
    expect(changed.records.cancelledAppointmentArchive[0].policy).toBe(
      "retain",
    );
  });
  it("B07 cancelled archived orders and invoice-linked receipts remain hidden from other patient scopes", () => {
    const initial = createInitialState();
    const target = initial.appointments[1];
    initial.config.cancellationPolicy = "deleteBusiness";
    initial.records.invoiceLedger = [
      {
        id: "OUTSIDE-INVOICE",
        appointmentIds: [target.id],
        seller: "演示业务员乙",
        amount: 399,
      },
    ];
    initial.records.invoiceReceipts = [
      { id: "OUTSIDE-RECEIPT", invoiceId: "OUTSIDE-INVOICE", amount: 399 },
    ];
    const state = reducer(initial, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: target.id, patientId: target.patientId },
    });
    state.records.roles = [{ id: "restricted", allowedPatientIds: ["P001"] }];
    state.config.customRoleId = "restricted";
    localStorage.setItem(key, JSON.stringify(state));
    function Probe() {
      const { state } = useDemo();
      return (
        <output data-testid="scoped">{JSON.stringify(state.records)}</output>
      );
    }
    wrap(<Probe />);
    const visible = JSON.parse(screen.getByTestId("scoped").textContent!);
    expect(visible.cancelledAppointmentArchive).toHaveLength(0);
    expect(visible.invoiceLedger).toHaveLength(0);
    expect(visible.invoiceReceipts).toHaveLength(0);
    expect(read().records.invoiceLedger).toHaveLength(1);
    expect(read().records.invoiceReceipts).toHaveLength(1);
  });
  it("B08 archived order snapshots still obey campus and exam-type restrictions", () => {
    const initial = createInitialState();
    const target = initial.appointments[1];
    target.patientId = "P001";
    target.campus = "东院区";
    initial.config.cancellationPolicy = "deleteBusiness";
    const state = reducer(initial, {
      type: "CANCEL_PATIENT_APPOINTMENT",
      payload: { id: target.id, patientId: target.patientId },
    });
    state.records.roles = [
      {
        id: "scoped-campus",
        allowedPatientIds: ["P001"],
        allowedCampus: "中心院区",
        examTypes: ["团检"],
      },
    ];
    state.config.customRoleId = "scoped-campus";
    localStorage.setItem(key, JSON.stringify(state));
    function Probe() {
      const { state } = useDemo();
      return (
        <output data-testid="campus-archive">
          {JSON.stringify(state.records.cancelledAppointmentArchive)}
        </output>
      );
    }
    wrap(<Probe />);
    expect(
      JSON.parse(screen.getByTestId("campus-archive").textContent!),
    ).toHaveLength(0);
    expect(read().records.cancelledAppointmentArchive).toHaveLength(1);
  });
});
