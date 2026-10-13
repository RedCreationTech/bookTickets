import { createContext, useContext, useReducer, useEffect } from "react";
import type { ReactNode } from "react";
import { createInitialState, reducer } from "./model";
import type { DemoState, Action } from "./model";
export * from "./model";
import { groupAppointmentCompany, normalizeBookingTime } from "./bookingRules";
const KEY = "hongchuang.health.demo.v1";
const LEGACY_KEY = "qinghe.health.demo.v1";
function validState(s: any) {
  return (
    s &&
    s.version === 1 &&
    Array.isArray(s.appointments) &&
    Array.isArray(s.patients) &&
    s.config &&
    typeof s.config === "object" &&
    Array.isArray(s.packages) &&
    Array.isArray(s.tasks) &&
    Array.isArray(s.audit) &&
    s.records &&
    typeof s.records === "object" &&
    Object.values(s.records).every(Array.isArray) &&
    s.appointments.every(
      (a: any) =>
        Array.isArray(a.items) && a.results && typeof a.results === "object",
    )
  );
}
export function migrateDemoBrand(
  original: DemoState,
  legacy = false,
): DemoState {
  let changed = legacy;
  const visit = (value: any, key = ""): any => {
    if (typeof value === "string") {
      if (key === "id" || /Ids?$/.test(key)) return value;
      const next = value
        .replaceAll("青禾", "红创")
        .replaceAll("QINGHE", "HONGCHUANG")
        .replaceAll("Qinghe", "Hongchuang")
        .replaceAll("qinghe", "hongchuang");
      if (next !== value) changed = true;
      return next;
    }
    if (Array.isArray(value)) return value.map((v) => visit(v, key));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, visit(v, k)]),
      );
    return value;
  };
  const migrated = visit(original) as DemoState;
  if (changed && !migrated.config.brandMigrationAt) {
    const time = new Date().toISOString();
    migrated.config = { ...migrated.config, brandMigrationAt: time };
    migrated.audit = [
      {
        id: "BRAND-MIGRATION-v2",
        action: "BRAND_MIGRATION",
        entity: "demo-brand",
        actor: "系统",
        time,
        message:
          "演示品牌已统一为红创：保留订单、金额、客户、配置和任务；历史演示品牌文字同步更新，原业务事件不变。",
        before: { brand: "旧版演示品牌" },
        after: { brand: "红创" },
      },
      ...migrated.audit,
    ];
  }
  return migrated;
}
function load() {
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw);
        if (validState(s))
          return migrateDemoBrand(
            { ...createInitialState(), ...s },
            key === LEGACY_KEY,
          );
      }
    } catch {}
  }
  return createInitialState();
}

const Context = createContext<{
  state: DemoState;
  act: (action: Action) => void;
}>({ state: createInitialState(), act: () => {} });
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, act] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      console.warn("演示存储已满或不可用");
    }
  }, [state]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (validState(data)) act({ type: "SYNC", payload: data });
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return <Context.Provider value={{ state, act }}>{children}</Context.Provider>;
}
export function anonymizedResourceUsage(state: DemoState) {
  const counts = new Map<
    string,
    { id: string; kind: string; resourceId: string; used: number }
  >();
  const add = (kind: string, id: string, n = 1) => {
    if (!id) return;
    const key = kind + ":" + id;
    const row = counts.get(key) || { id: key, kind, resourceId: id, used: 0 };
    row.used += n;
    counts.set(key, row);
  };
  for (const order of [
    ...(state.records.shopOrders || []),
    ...(state.records.commerceReservations || []),
  ])
    if (!["已取消", "已退款", "已转订单"].includes(order.status))
      add("commerce", order.productId, Number(order.quantity ?? 1));
  for (const account of state.records.loyaltyAccounts || []) {
    for (const r of account.redemptions || [])
      if (r.status !== "已取消") add("reward", r.productId);
    for (const r of account.enrollments || [])
      if (r.status !== "已取消") add("activity", r.activityId);
  }
  return [...counts.values()];
}
export function anonymizedBookingUsage(state: DemoState) {
  const rows = new Map<string, any>();
  for (const a of state.appointments) {
    if (a.status === "cancelled") continue;
    const groupCompany = groupAppointmentCompany(state, a);
    const time = normalizeBookingTime(a.time);
    const id = [a.date, time, groupCompany].join("|");
    const row = rows.get(id) || {
      id,
      date: a.date,
      time,
      groupCompany,
      used: 0,
    };
    row.used++;
    rows.set(id, row);
  }
  return [...rows.values()];
}
export function useDemo() {
  const context = useContext(Context);
  const state: DemoState = {
    ...context.state,
    records: {
      ...context.state.records,
      resourceUsage: anonymizedResourceUsage(context.state),
      bookingUsage: anonymizedBookingUsage(context.state),
    },
  };
  const role = (state.records.roles || []).find(
    (r) => r.id === state.config.customRoleId,
  );
  if (
    !role ||
    (typeof window !== "undefined" &&
      /^#\/(patient|kiosk)/.test(window.location.hash))
  )
    return { ...context, state };
  const patients = state.patients.filter(
    (p) =>
      !role.allowedPatientIds?.length || role.allowedPatientIds.includes(p.id),
  );
  const ids = new Set(patients.map((p) => p.id));
  const archivedAppointments = (state.records.cancelledAppointmentArchive || [])
    .map((row) => row.appointment)
    .filter(Boolean);
  const scopedAppointment = (a: any) =>
    ids.has(a.patientId) &&
    (!role.allowedCampus || a.campus === role.allowedCampus) &&
    (!role.examTypes?.length ||
      role.examTypes.includes(
        a.orderType ||
          (state.patients.find((p) => p.id === a.patientId)?.company === "个检"
            ? "个检"
            : "团检"),
      ));
  const appointments = state.appointments.filter(scopedAppointment);
  const appointmentIds = new Set(
    [...appointments, ...archivedAppointments.filter(scopedAppointment)].map(
      (a) => a.id,
    ),
  );
  const knownPatients = new Set(state.patients.map((p) => p.id));
  const knownAppointments = new Set(
    [...state.appointments, ...archivedAppointments].map((a) => a.id),
  );
  const permitted = (
    record: any,
    checked: Set<string> = new Set(),
  ): boolean => {
    if (!record || typeof record !== "object") return true;
    if (
      record.appointment?.id &&
      knownAppointments.has(record.appointment.id) &&
      !appointmentIds.has(record.appointment.id)
    )
      return false;
    for (const key of ["patientId", "customerId"])
      if (
        record[key] &&
        knownPatients.has(record[key]) &&
        !ids.has(record[key])
      )
        return false;
    for (const key of ["appointmentId", "orderId"])
      if (
        record[key] &&
        knownAppointments.has(record[key]) &&
        !appointmentIds.has(record[key])
      )
        return false;
    for (const id of record.patientIds || [])
      if (knownPatients.has(id) && !ids.has(id)) return false;
    for (const id of record.appointmentIds || [])
      if (knownAppointments.has(id) && !appointmentIds.has(id)) return false;
    if (record.invoiceId && !checked.has(record.invoiceId)) {
      const invoice = (state.records.invoiceLedger || []).find(
        (row) => row.id === record.invoiceId,
      );
      if (
        invoice &&
        !permitted(invoice, new Set([...checked, record.invoiceId]))
      )
        return false;
    }
    const namedPatient = state.patients.find(
      (p) => record.patient === p.name || record.customer === p.name,
    );
    return !namedPatient || ids.has(namedPatient.id);
  };
  const records = Object.fromEntries(
    Object.entries(state.records).map(([key, rows]) => [
      key,
      rows.filter((row) => permitted(row)),
    ]),
  );
  const audit = state.audit.filter(
    (row) =>
      permitted(row.before) &&
      permitted(row.after) &&
      (!knownPatients.has(row.entity) || ids.has(row.entity)) &&
      (!knownAppointments.has(row.entity) || appointmentIds.has(row.entity)),
  );
  return {
    ...context,
    state: {
      ...state,
      patients,
      appointments,
      records,
      audit,
      tasks: state.tasks.filter((row) => permitted(row)),
    },
  };
}
