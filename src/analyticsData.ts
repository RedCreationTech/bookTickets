import type { DemoState } from "./model";
import {
  groupAppointmentCompany,
  getBookingSlots,
  normalizeBookingTime,
  getBookingAvailability,
  getBookingResourceAvailability,
  anonymizedBookingResourceUsage,
} from "./bookingRules";
import { buildProjectRows } from "./projectStatisticsRules";
export const analyticsDay = (value: unknown) => {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
    ? s
    : "";
};
export const moneyCents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100)
    : null;
export const uniqueStrings = (xs: unknown[]) => [
  ...new Set(xs.filter((x): x is string => typeof x === "string" && !!x)),
];
export const completeResult = (value: unknown) =>
  !!String(value ?? "").trim() &&
  !["未检查", "待检查", "待检", "未录入", "待录入"].includes(
    String(value).trim(),
  );
export function inclusiveDays(from: string, to: string) {
  if (
    !analyticsDay(from) ||
    !analyticsDay(to) ||
    from > to ||
    (Date.parse(to) - Date.parse(from)) / 86400000 > 365
  )
    return [];
  const rows: string[] = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000)
    rows.push(new Date(time).toISOString().slice(0, 10));
  return rows;
}
export function buildOrderAnalytics(state: DemoState) {
  const projects = buildProjectRows(state);
  return state.appointments.map((a) => {
    const patient = state.patients.find((p) => p.id === a.patientId);
    const group = state.records.groupOrders?.find(
      (g) => g.id === a.groupOrderId,
    );
    const company =
      a.groupCompany || group?.company || patient?.company || "未登记单位";
    const groupCompany = groupAppointmentCompany(state, a);
    const kind = groupCompany ? "团检" : "个检";
    const entries = projects.filter((r) => r.appointmentId === a.id);
    const active = entries.filter(
      (r) =>
        a.status !== "cancelled" &&
        a.items.includes(r.item) &&
        !(a.waived || []).includes(r.item),
    );
    const priced = active.filter((r) => !r.exclusion);
    const completed = active.filter((r) => r.completed);
    const missing = active.filter((r) => !r.completed);
    const originalUnknown = priced.some((r) => r.originalCents === null);
    const executionUnknown = priced.some((r) => r.executionCents === null);
    const creator =
      a.createdBy || a.creator || a.registeredBy || "未记录创建人";
    const seller =
      a.salesperson ||
      a.salesPerson ||
      a.seller ||
      group?.seller ||
      group?.salesperson ||
      "未记录业务员";
    const time = normalizeBookingTime(a.time);
    const customerType =
      (state.records.customerTypes || []).find(
        (t) => t.id === (a.customerType || patient?.customerType),
      )?.name ||
      a.customerType ||
      patient?.customerType ||
      "未分类";
    return {
      id: a.id,
      patientId: a.patientId,
      name: patient?.name || "未登记客户",
      sex: patient?.sex || "未登记",
      age: typeof patient?.age === "number" ? patient.age : null,
      company,
      kind,
      type: a.orderType || kind,
      customerType,
      date: analyticsDay(a.date),
      time,
      timeStart: time.slice(0, 5),
      timeEnd: time.slice(-5),
      status: a.status,
      source: a.source || "未记录来源",
      creator,
      seller,
      createdDate:
        analyticsDay(a.createdAt || a.orderedAt) || analyticsDay(a.date),
      creationDateSource:
        a.createdAt || a.orderedAt ? "开单时间" : "体检日期代理",
      cancelled: a.status === "cancelled",
      refunded: !!a.refunded || Number(a.refundAmount) > 0,
      arrived:
        !!a.checkedAt ||
        ["checked", "in_exam", "review", "approved", "printed"].includes(
          a.status,
        ),
      completed: active.length > 0 && !missing.length,
      itemCount: active.length,
      completedCount: completed.length,
      missingCount: missing.length,
      missingItems: missing.map((r) => r.item),
      waivedItems: a.waived || [],
      items: active.map((r) => r.item),
      originalCents: originalUnknown
        ? null
        : priced.reduce((n, r) => n + (r.originalCents || 0), 0),
      executionCents: executionUnknown
        ? null
        : priced.reduce((n, r) => n + (r.executionCents || 0), 0),
      amountCents: moneyCents(a.amount),
      appointment: a,
    };
  });
}
export interface AppointmentAnalyticsFilters {
  from: string;
  to: string;
  timeFrom: string;
  timeTo: string;
  company: string;
  sex: string;
  kind: string;
  type: string;
  customerType: string;
  includeCancelled: boolean;
}
export function filterAppointmentAnalytics(
  state: DemoState,
  f: AppointmentAnalyticsFilters,
) {
  if (
    !inclusiveDays(f.from, f.to).length ||
    (f.timeFrom && f.timeTo && f.timeFrom > f.timeTo)
  )
    return [];
  return buildOrderAnalytics(state).filter(
    (r) =>
      (f.includeCancelled || !r.cancelled) &&
      r.date >= f.from &&
      r.date <= f.to &&
      (!f.timeFrom || r.timeStart >= f.timeFrom) &&
      (!f.timeTo || r.timeStart <= f.timeTo) &&
      (!f.company || r.company === f.company) &&
      (!f.sex || r.sex === f.sex) &&
      (!f.kind || r.kind === f.kind) &&
      (!f.type || r.type === f.type) &&
      (!f.customerType || r.customerType === f.customerType),
  );
}
export function countGroups<T>(rows: T[], label: (row: T) => string) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const key = label(row);
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });
  return [...grouped]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}
export function appointmentDailyStatistics(
  state: DemoState,
  f: AppointmentAnalyticsFilters,
) {
  const filtered = filterAppointmentAnalytics(state, f);
  return inclusiveDays(f.from, f.to).map((date) => {
    const selected = filtered.filter((r) => r.date === date);
    const availability = getBookingAvailability(state, date);
    return {
      date,
      count: selected.length,
      arrived: selected.filter((r) => r.arrived).length,
      globalBooked: availability.used,
      capacity: availability.capacity,
      remaining: availability.remaining,
      types: countGroups(selected, (r) => r.type),
    };
  });
}
export function appointmentCapacityDetails(
  state: DemoState,
  f: AppointmentAnalyticsFilters,
) {
  const filtered = filterAppointmentAnalytics(state, f).filter(
    (r) => !r.cancelled,
  );
  const usage =
    state.records.bookingResourceUsage || anonymizedBookingResourceUsage(state);
  const limits = state.records.bookingResourceLimits || [];
  const kinds = ["item", "package"] as const;
  return inclusiveDays(f.from, f.to).flatMap((date) => {
    const selected = filtered.filter((r) => r.date === date);
    const typeRows = uniqueStrings(selected.map((r) => r.type)).map((name) => ({
      id: `TYPE-${date}-${name}`,
      scope: "类型",
      name,
      date,
      time: "",
      count: selected.filter((r) => r.type === name).length,
      used: null as number | null,
      capacity: null as number | null,
      remaining: null as number | null,
      rule: "仅分布；类型没有独立拒单额度，不推定剩余号源",
    }));
    const resources = kinds.flatMap((kind) =>
      uniqueStrings([
        ...usage.filter((r) => r.kind === kind).map((r) => r.resourceId),
        ...limits
          .filter((r) => r.kind === kind && r.enabled !== false)
          .map((r) => r.resourceId),
      ]).flatMap((resourceId) => {
        const resourceContext =
          kind === "item"
            ? { items: [resourceId] }
            : { packageIds: [resourceId] };
        const availability = getBookingResourceAvailability(
          state,
          date,
          resourceContext,
        );
        const applicable = (
          r: ReturnType<typeof buildOrderAnalytics>[number],
        ) =>
          kind === "item"
            ? r.appointment.items.includes(resourceId)
            : (r.appointment.packageIds || [r.appointment.packageId]).includes(
                resourceId,
              );
        const matching = selected.filter(applicable);
        const used = usage
          .filter(
            (r) =>
              r.date === date && r.kind === kind && r.resourceId === resourceId,
          )
          .reduce((n, r) => n + Number(r.used || 0), 0);
        const capacities = availability.flatMap((r) =>
          r.dailyCapacity == null
            ? []
            : [Math.max(0, Math.floor(Number(r.dailyCapacity)))],
        );
        const capacity = capacities.length ? Math.min(...capacities) : null;
        const name =
          kind === "item"
            ? resourceId
            : state.packages.find((p) => p.id === resourceId)?.name ||
              resourceId;
        const scope = kind === "item" ? "项目" : "套餐";
        const daily = {
          id: `${kind}-${resourceId}-${date}-daily`,
          scope,
          name,
          date,
          time: "",
          count: matching.length,
          used,
          capacity,
          remaining: capacity === null ? null : Math.max(0, capacity - used),
          rule:
            availability.map((r) => r.id).join("；") || "未配置独立资源限额",
        };
        const slots = getBookingSlots(state).flatMap((slot) => {
          const rules = getBookingResourceAvailability(state, date, {
            ...resourceContext,
            time: slot.time,
          }).filter((r) => r.slotRemaining !== undefined);
          if (!rules.length) return [];
          const cap = Math.min(...rules.map((r) => Number(r.slotCapacity)));
          const used = rules[0].slotUsed;
          return [
            {
              id: `${kind}-${resourceId}-${date}-${slot.time}`,
              scope: `${scope}时段`,
              name,
              date,
              time: slot.time,
              count: matching.filter((r) => r.time === slot.time).length,
              used,
              capacity: cap,
              remaining: Math.min(...rules.map((r) => r.slotRemaining!)),
              rule: rules.map((r) => r.id).join("；"),
            },
          ];
        });
        return [daily, ...slots];
      }),
    );
    return [...typeRows, ...resources];
  });
}
export function appointmentSlotStatistics(
  state: DemoState,
  f: AppointmentAnalyticsFilters,
) {
  const rows = filterAppointmentAnalytics(state, f);
  return countGroups(rows, (r) => r.time || "未登记时段").map((row) => ({
    ...row,
    capacity:
      getBookingSlots(state).find((s) => s.time === row.name)?.capacity ?? null,
  }));
}
