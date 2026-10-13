import type { DemoState } from "./model";

/** Shared frontend-only booking policy. Production capacity needs a server transaction. */
export function getBookingAvailability(
  state: DemoState,
  date: string,
  ignoreAppointmentId?: string,
) {
  const rawCapacity = Number(state.config.dailyCapacity ?? 80);
  const capacity = Number.isFinite(rawCapacity)
    ? Math.max(0, Math.floor(rawCapacity))
    : 80;
  const used = state.appointments.filter(
    (a) =>
      a.date === date &&
      a.status !== "cancelled" &&
      a.id !== ignoreAppointmentId,
  ).length;
  const remaining = Math.max(0, capacity - used);
  const parsed = new Date(`${date}T12:00:00Z`);
  let error = "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    error = "请选择有效的预约日期";
  else if (date < new Date().toISOString().slice(0, 10))
    error = "不可预约过去的日期";
  else if (
    state.config.weekendAllowed !== true &&
    [0, 6].includes(parsed.getUTCDay())
  )
    error = "周末不开放预约，请选择工作日";
  else if (used >= capacity)
    error = `该日期预约已满（全院每日 ${capacity} 人），请选择其他日期`;
  return { allowed: !error, error, used, capacity, remaining };
}
