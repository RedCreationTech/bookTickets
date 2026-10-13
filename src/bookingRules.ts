import type { DemoState, Appointment } from "./model";
import { getOrderRules } from "./orderingRules";

const defaultOnlineExtras = [
  { name: "甲状腺彩超", price: 120, detail: "了解甲状腺形态与结构" },
  { name: "糖化血红蛋白", price: 65, detail: "评估近期血糖整体水平" },
  { name: "骨密度检查", price: 95, detail: "了解骨量变化情况" },
];

/** Uses the same editable project catalog as the clinical ordering desk. */
export function getOnlineExtraCatalog(
  state: DemoState,
  patientId: string,
  groupItems?: string[],
) {
  const patient = state.patients.find((row) => row.id === patientId);
  const rules = getOrderRules(state);
  const names = groupItems || [
    ...defaultOnlineExtras.map((row) => row.name),
    ...(state.records.orderingRules || []).map((row) => String(row.item)),
  ];
  return [...new Set(names)]
    .filter((name) => {
      const rule = rules.find((row) => row.item === name);
      return (
        name &&
        rule?.enabled !== false &&
        (rule?.ruleEnabled === false ||
          (!rule?.required &&
            (!rule?.sex || rule.sex === "不限" || rule.sex === patient?.sex) &&
            (!rule?.marriage ||
              rule.marriage === "不限" ||
              rule.marriage === patient?.marriage)))
      );
    })
    .map((name) => {
      const rule = rules.find((row) => row.item === name);
      const preset = defaultOnlineExtras.find((row) => row.name === name);
      const price = Number(
        rule?.price ?? (groupItems ? 80 : (preset?.price ?? 80)),
      );
      const configured = (state.records.orderingRules || []).find(
        (row) => row.item === name,
      );
      return {
        name,
        price: Number.isFinite(price) ? Math.max(0, price) : 80,
        detail: String(
          configured?.meaning ||
            configured?.detail ||
            preset?.detail ||
            "医院维护项目；检查意义请咨询体检中心",
        ),
      };
    });
}

export interface BookingContext {
  patientId?: string;
  company?: string;
  kind?: "individual" | "group";
  time?: string;
  checkQuestionnaire?: boolean;
}
export interface GroupBookingSchedule {
  id: string;
  company: string;
  enabled: boolean;
  scheduled: boolean;
  startDate: string;
  endDate: string;
  dailyCapacity: number;
  reservedCapacity: number;
  allowedTimes: string;
  allowRelatives?: boolean;
}
export const normalizeBookingTime = (value: string) =>
  value.replace(/[–—]/g, "-").replace(/\s/g, "");
export function getBookingNow(state: DemoState) {
  const configured = String(state.config.bookingClock || "");
  const parsed = configured
    ? new Date(
        /Z$|[+-]\d\d:\d\d$/.test(configured) ? configured : `${configured}Z`,
      )
    : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}
export function bookingDateOffset(state: DemoState, days = 0) {
  const value = getBookingNow(state);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function getGroupBookingSchedules(
  state: DemoState,
): GroupBookingSchedule[] {
  const defaults = [
    ...new Set(
      state.patients.map((p) => p.company).filter((c) => c && c !== "个检"),
    ),
  ].map((company) => ({
    id:
      company === "星辰科技"
        ? "xingchen-2026"
        : `group-${encodeURIComponent(company)}`,
    company,
    enabled: true,
    scheduled: false,
    startDate: "",
    endDate: "",
    dailyCapacity: Number(state.config.dailyCapacity ?? 80),
    reservedCapacity: 0,
    allowedTimes: "",
    allowRelatives: true,
  }));
  const configured = (state.records.groupBookingSchedules ||
    []) as GroupBookingSchedule[];
  return [
    ...defaults.map(
      (row) => configured.find((saved) => saved.company === row.company) || row,
    ),
    ...configured.filter(
      (row) => !defaults.some((base) => base.company === row.company),
    ),
  ];
}
export function groupAppointmentCompany(
  state: DemoState,
  appointment: Appointment,
) {
  if (appointment.groupCompany) return String(appointment.groupCompany);
  if (
    appointment.bookingKind === "group" ||
    appointment.groupOrderId ||
    appointment.orderType === "团检" ||
    appointment.groupBudget > 0 ||
    /团检/.test(appointment.source || "")
  )
    return (
      state.patients.find((p) => p.id === appointment.patientId)?.company || ""
    );
  return "";
}
export function getBookingSlots(state: DemoState) {
  const configured = String(state.config.timeSlots || "");
  const matches = [
    ...configured.matchAll(
      /(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})\s*[:：]\s*(\d+)/g,
    ),
  ];
  return matches.length
    ? matches.map((m) => ({ time: `${m[1]}-${m[2]}`, capacity: Number(m[3]) }))
    : ["08:00-08:30", "08:30-09:00", "09:00-09:30", "09:30-10:00"].map(
        (time) => ({
          time,
          capacity: Number(state.config.dailyCapacity ?? 80),
        }),
      );
}
export function hasCompletedQuestionnaire(
  state: DemoState,
  patientId?: string,
) {
  return (
    !!patientId &&
    (state.records.bookingQuestionnaires || []).some(
      (row) => row.patientId === patientId && row.status === "completed",
    )
  );
}
export const QUESTIONNAIRE_OPTIONS = [
  "日常久坐，运动较少",
  "经常熬夜或作息不规律",
  "希望了解血糖情况",
  "关注甲状腺健康",
  "关注骨骼健康",
  "以上均无",
];
export function recommendedBookingItems(answers: string[]) {
  return [
    { word: "甲状腺", item: "甲状腺彩超" },
    { word: "血糖", item: "糖化血红蛋白" },
    { word: "骨骼", item: "骨密度检查" },
  ]
    .filter((rule) => answers.some((a) => a.includes(rule.word)))
    .map((rule) => rule.item);
}
function finiteCapacity(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}
const validClock = (value: unknown) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
const applies = (schedule: GroupBookingSchedule, date: string) =>
  schedule.enabled !== false &&
  (!schedule.scheduled ||
    (!!schedule.startDate &&
      !!schedule.endDate &&
      date >= schedule.startDate &&
      date <= schedule.endDate));

/** Frontend policy with an explicit UTC demo clock. Production quota allocation requires server transactions. */
export function getBookingAvailability(
  state: DemoState,
  date: string,
  ignoreAppointmentId?: string,
  context: BookingContext = {},
) {
  const rawCapacity = finiteCapacity(state.config.dailyCapacity ?? 80, 80);
  const capacity =
    state.config.redCapacity === undefined
      ? rawCapacity
      : Math.min(
          rawCapacity,
          finiteCapacity(state.config.redCapacity, rawCapacity),
        );
  const booked = state.appointments.filter(
    (a) =>
      a.date === date &&
      a.status !== "cancelled" &&
      a.id !== ignoreAppointmentId,
  );
  const usage = state.records.bookingUsage;
  const ignored = state.appointments.find(
    (a) =>
      a.id === ignoreAppointmentId &&
      a.date === date &&
      a.status !== "cancelled",
  );
  const countUsed = (company?: string, time?: string) =>
    usage
      ? Math.max(
          0,
          usage
            .filter(
              (r) =>
                r.date === date &&
                (company === undefined || r.groupCompany === company) &&
                (time === undefined || r.time === normalizeBookingTime(time)),
            )
            .reduce((n, r) => n + r.used, 0) -
            (ignored &&
            (company === undefined ||
              groupAppointmentCompany(state, ignored) === company) &&
            (time === undefined ||
              normalizeBookingTime(ignored.time) === normalizeBookingTime(time))
              ? 1
              : 0),
        )
      : booked.filter(
          (a) =>
            (company === undefined ||
              groupAppointmentCompany(state, a) === company) &&
            (time === undefined ||
              normalizeBookingTime(a.time) === normalizeBookingTime(time)),
        ).length;
  const used = countUsed();
  const now = getBookingNow(state);
  const today = now.toISOString().slice(0, 10);
  const parsed = new Date(`${date}T12:00:00Z`);
  const schedules = getGroupBookingSchedules(state);
  const schedule = schedules.find((s) => s.company === context.company);
  const groupUsed = context.company ? countUsed(context.company) : 0;
  const groupRemaining = schedule
    ? Math.max(0, finiteCapacity(schedule.dailyCapacity, capacity) - groupUsed)
    : capacity;
  const groupReleaseAt = validClock(state.config.groupReleaseHour)
    ? new Date(`${date}T${state.config.groupReleaseHour}:00Z`)
    : null;
  const released = !!groupReleaseAt && now >= groupReleaseAt;
  const reservedForGroups = released
    ? 0
    : schedules
        .filter((s) => applies(s, date))
        .reduce(
          (sum, s) =>
            sum +
            Math.max(
              0,
              Math.min(
                finiteCapacity(s.reservedCapacity, 0),
                finiteCapacity(s.dailyCapacity, capacity),
              ) - countUsed(s.company),
            ),
          0,
        );
  const remaining = Math.max(
    0,
    capacity - used - (context.kind === "individual" ? reservedForGroups : 0),
  );
  const slot = context.time
    ? getBookingSlots(state).find(
        (s) => s.time === normalizeBookingTime(context.time!),
      )
    : undefined;
  const slotUsed = context.time ? countUsed(undefined, context.time) : 0;
  const slotRemaining = slot
    ? Math.max(0, slot.capacity - slotUsed)
    : undefined;
  const blockedPatient =
    context.patientId &&
    ((state.records.bookingBlacklist || []).some(
      (row) =>
        row.patientId === context.patientId &&
        ["已启用", "启用", "生效", "active", "黑名单"].includes(row.status) &&
        (!row.startDate || row.startDate <= today) &&
        (!row.endDate || row.endDate >= today),
    ) ||
      state.patients.some(
        (p) => p.id === context.patientId && p.blacklisted === true,
      ));
  let error = "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    error = "请选择有效的预约日期";
  else if (date < today) error = "不可预约过去的日期";
  else if (blockedPatient)
    error = "该演示体检人已被限制预约，请联系服务中心核实";
  else if (
    state.config.weekendAllowed !== true &&
    [0, 6].includes(parsed.getUTCDay())
  )
    error = "周末不开放预约，请选择工作日";
  else if (
    context.kind === "group" &&
    (!schedule || schedule.enabled === false)
  )
    error = "该单位当前未开放预约";
  else if (context.kind === "group" && schedule && !applies(schedule, date))
    error = `该单位仅可预约 ${schedule.startDate || "未配置"} 至 ${schedule.endDate || "未配置"}`;
  else if (
    validClock(state.config.releaseHour) &&
    date === bookingDateOffset(state, 1) &&
    now.toISOString().slice(11, 16) < String(state.config.releaseHour)
  )
    error = `次日号源将在今日 ${state.config.releaseHour}（UTC 演示时钟）开放`;
  else if (used >= capacity)
    error = `该日期预约已满（全院每日 ${capacity} 人），请选择其他日期`;
  else if (context.kind === "group" && groupRemaining <= 0)
    error = `该单位当日预约已满（${schedule?.dailyCapacity} 人）`;
  else if (context.kind === "individual" && remaining <= 0)
    error = `剩余号源为团检保留，将在预约当天 ${state.config.groupReleaseHour || "配置的释放时刻"} 释放为个检号源`;
  else if (context.time && state.config.timeSlots && !slot)
    error = "该时段未开放预约";
  else if (slot && slotUsed >= slot.capacity)
    error = `该时段预约已满（${slot.capacity} 人）`;
  else if (
    context.kind === "group" &&
    context.time &&
    schedule?.allowedTimes &&
    !schedule.allowedTimes
      .split(/[;；,，\n]/)
      .map(normalizeBookingTime)
      .includes(normalizeBookingTime(context.time))
  )
    error = "该时段不在单位可预约时段内";
  else if (
    context.patientId &&
    context.checkQuestionnaire !== false &&
    state.config.questionnaireEnabled !== false &&
    state.config.questionnaireSkippable === false &&
    !hasCompletedQuestionnaire(state, context.patientId)
  )
    error = "预约前须完成检前问卷，当前配置不允许跳过";
  const warning =
    state.config.yellowCapacity !== undefined &&
    used >= Number(state.config.yellowCapacity)
      ? "当日预约已达到黄线预警"
      : "";
  return {
    allowed: !error,
    error,
    warning,
    used,
    capacity,
    remaining,
    groupRemaining,
    groupUsed,
    reservedForGroups,
    released,
    slotRemaining,
  };
}
export function getBookingDates(state: DemoState, days = 14) {
  return Array.from({ length: days }, (_, i) =>
    bookingDateOffset(state, i),
  ).filter(
    (date) =>
      state.config.weekendAllowed === true ||
      ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()),
  );
}
