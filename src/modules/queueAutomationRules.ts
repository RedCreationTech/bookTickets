import type { Action, Appointment, DemoState } from "../model";
import { getOrderRules } from "../orderingRules";

const areas: Record<string, string> = {
  采血区: "血常规",
  超声区: "腹部彩超",
  心电图区: "心电图",
  一般检查区: "一般检查",
};
export function deriveQueueDefinitions(state: DemoState) {
  const configured = state.records.guideDepartments || [];
  const definitions = Object.entries(areas).map(([name, item]) => {
    const mapped = configured.find((d) =>
      String(d.items)
        .split(/[、,，\n]/)
        .map((x) => x.trim())
        .includes(item),
    );
    return {
      id: name,
      name,
      department: mapped?.name || name,
      code: mapped?.code || name,
      items: mapped
        ? String(mapped.items)
            .split(/[、,，\n]/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [item],
      zone: mapped?.zone || name,
      minutes: Number(mapped?.minutes) || 5,
      enabled: !mapped || mapped.status !== "已停用",
      sex: mapped?.sex || "不限",
      type: "常规",
    };
  });
  configured
    .filter((d) => !definitions.some((q) => q.code === d.code))
    .forEach((d) =>
      definitions.push({
        id: d.code || d.id,
        name: `${d.name}队列`,
        department: d.name,
        code: d.code || d.id,
        items: String(d.items)
          .split(/[、,，\n]/)
          .map((x) => x.trim())
          .filter(Boolean),
        zone: d.zone,
        minutes: Number(d.minutes) || 5,
        enabled: d.status !== "已停用",
        sex: d.sex || "不限",
        type: "常规",
      }),
    );
  for (const configured of state.records.queueDefinitions || []) {
    const mapped = state.records.guideDepartments?.find(
      (d) =>
        d.code === configured.departmentCode ||
        d.name === configured.department,
    );
    const q = {
      ...configured,
      department: mapped?.name || configured.department,
      zone: mapped?.zone || configured.zone,
      enabled: configured.enabled !== false && mapped?.status !== "已停用",
      items: configured.items || [],
      sex: configured.sex || mapped?.sex || "不限",
      type: configured.type === "VIP" ? "VIP" : "常规",
    };
    const index = definitions.findIndex((d) => d.id === q.id);
    if (index >= 0) definitions[index] = { ...definitions[index], ...q };
    else definitions.push(q as (typeof definitions)[number]);
  }
  return definitions;
}

export function hasGuideQueueAccess(state: DemoState, queueId: string) {
  const active = state.config.guideActiveUserId;
  if (!active)
    return ["admin", "reception", "doctor"].includes(state.config.role);
  const user = state.records.guideUsers?.find((r) => r.id === active);
  const session = state.records.guideSessions?.find(
    (r) => r.userId === active && r.status === "online",
  );
  return !!user?.enabled && !!session && user.queueIds?.includes(queueId);
}

type Row = Record<string, any>;
const arrivedStatuses = ["checked", "in_exam"];
const activeTicketStatuses = ["waiting", "calling", "missed", "paused"];
const listValues = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String)
    : String(value || "")
        .split(/[、,，\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
export function queueBusinessDay(state: DemoState): string {
  return String(
    state.config.queueBusinessDate ||
      state.config.guideClock ||
      state.config.notificationClock ||
      state.appointments[0]?.date ||
      "1970-01-01",
  ).slice(0, 10);
}
export function ticketBusinessDay(state: DemoState, ticket: Row): string {
  return String(
    ticket.businessDate ||
      ticket.createdAt ||
      state.appointments.find((a) => a.id === ticket.appointmentId)
        ?.checkedAt ||
      state.appointments.find((a) => a.id === ticket.appointmentId)?.date ||
      "",
  ).slice(0, 10);
}
export function queueDayCounts(
  state: DemoState,
  queueId: string,
  day = queueBusinessDay(state),
) {
  const rows = (state.records.queueTickets || []).filter(
    (t) => t.department === queueId && ticketBusinessDay(state, t) === day,
  );
  return {
    waiting: rows.filter((t) => ["waiting", "calling"].includes(t.status))
      .length,
    missed: rows.filter((t) => t.status === "missed").length,
    completed: rows.filter((t) => t.status === "done").length,
  };
}
export function queueCustomerType(state: DemoState, patientId: string): string {
  const p = state.patients.find((p) => p.id === patientId);
  const type = (state.records.customerTypes || []).find(
    (t) => t.id === p?.customerType,
  );
  return p?.vip === true ||
    /vip/i.test(`${p?.customerType || ""} ${type?.name || ""}`) ||
    /贵宾/.test(String(type?.name || p?.customerType || ""))
    ? "VIP 客户"
    : "普通客户";
}
export function searchQueueCustomers(state: DemoState, query: string) {
  const term = query.trim().toLocaleLowerCase();
  return state.appointments.filter((a) => {
    const p = state.patients.find((p) => p.id === a.patientId);
    if (!p) return false;
    return (
      !term ||
      [
        p.name,
        a.id,
        p.id,
        p.certificate,
        p.identityNo,
        p.idNumber,
        p.documentNo,
        p.demoId,
      ].some((x) =>
        String(x || "")
          .toLocaleLowerCase()
          .includes(term),
      )
    );
  });
}
export function customerQueueSummary(state: DemoState, appointmentId: string) {
  const appointment = state.appointments.find((a) => a.id === appointmentId);
  if (!appointment) return null;
  const patient = state.patients.find((p) => p.id === appointment.patientId);
  const definitions = deriveQueueDefinitions(state);
  const tickets = (state.records.queueTickets || [])
    .filter((t) => t.appointmentId === appointmentId && t.status !== "init")
    .map((t) => ({
      ...t,
      queueName:
        definitions.find((q) => q.id === t.department)?.name || t.department,
      businessDate: ticketBusinessDay(state, t),
    }));
  // Include eligible queues with no ticket, so an unqueued pending item is never hidden.
  const missing = definitions
    .filter(
      (q) =>
        q.items.some((item: string) => appointment.items.includes(item)) &&
        !tickets.some((t) => t.department === q.id),
    )
    .map((q) => ({
      id: `UNQUEUED-${q.id}-${appointmentId}`,
      department: q.id,
      queueName: q.name,
      appointmentId,
      status: q.items
        .filter((item: string) => appointment.items.includes(item))
        .every((item: string) => !!appointment.results[item]?.trim())
        ? "done"
        : "not_queued",
      businessDate: appointment.date,
    }));
  const rows = [...tickets, ...missing];
  return {
    appointment,
    patient,
    identity:
      patient?.certificate ||
      patient?.identityNo ||
      patient?.idNumber ||
      patient?.documentNo ||
      patient?.demoId ||
      "未登记 DEMO 证件",
    checkedAt: appointment.checkedAt || "未登记体检开始时间",
    customerType: queueCustomerType(state, appointment.patientId),
    pending: rows.filter(
      (t) => !["done", "cleared", "cancelled"].includes(t.status),
    ),
    completed: rows.filter((t) => t.status === "done"),
    historical: rows.filter((t) => ["cleared", "cancelled"].includes(t.status)),
  };
}
export function isQueueOpen(state: DemoState, queueId: string) {
  const q = deriveQueueDefinitions(state).find((q) => q.id === queueId);
  return (
    !!q?.enabled &&
    state.config.queueOpen?.[queueId] !== false &&
    state.records.guideZones?.find((z) => z.name === q.zone)?.status !==
      "已停用"
  );
}
export function availableQueueRooms(state: DemoState, queueId: string): Row[] {
  const q = deriveQueueDefinitions(state).find((q) => q.id === queueId);
  if (!q) return [];
  const mapped = (state.records.guideRooms || []).filter(
    (r) =>
      r.department === q.department ||
      r.queue === q.code ||
      r.queue === queueId,
  );
  if (!mapped.length)
    return [
      { id: "DEFAULT", name: `${q.name} 02 诊室`, zone: q.zone, capacity: 1 },
    ];
  return mapped
    .filter(
      (r) =>
        r.status !== "已停用" &&
        state.records.guideZones?.find((z) => z.name === r.zone)?.status !==
          "已停用",
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
export interface QueueCandidate {
  queueId: string;
  name: string;
  zone: string;
  items: string[];
  waitMinutes: number;
  serviceMinutes: number;
  travelMinutes: number;
  bottleneck: boolean;
  score: number;
  explanation: string;
  ticketId?: string;
}
export function recommendNextStation(state: DemoState, appointmentId: string) {
  const a = state.appointments.find((a) => a.id === appointmentId);
  const p = state.patients.find((p) => p.id === a?.patientId);
  const excluded: { queueId: string; name: string; reason: string }[] = [];
  const candidates: QueueCandidate[] = [];
  if (!a || !p || !arrivedStatuses.includes(a.status) || a.locked)
    return {
      recommendation: null,
      candidates,
      excluded,
      reason: "订单未到检、已结束、取消或锁定，暂无可执行下一站。",
    };
  const day = String(a.checkedAt || a.date).slice(0, 10);
  for (const q of deriveQueueDefinitions(state)) {
    const config =
      (state.records.queueDefinitions || []).find((r) => r.id === q.id) || {};
    const items = q.items.filter(
      (item: string) => a.items.includes(item) && !a.results[item]?.trim(),
    );
    const zone = state.records.guideZones?.find((z) => z.name === q.zone);
    const sex = config.sex || q.sex;
    const rules = getOrderRules(state).filter(
      (r) => items.includes(r.item) && r.ruleEnabled !== false,
    );
    const dependencies = [
      ...new Set([
        ...listValues(config.dependencies),
        ...rules.flatMap((r) => listValues(r.requires)),
      ]),
    ];
    let reason = !items.length
      ? "无待检项目"
      : !isQueueOpen(state, q.id)
        ? "队列/区域已停用"
        : sex !== "不限" && sex !== p.sex
          ? "性别不适用"
          : rules.some(
                (r) =>
                  r.enabled === false ||
                  (r.sex && r.sex !== "不限" && r.sex !== p.sex),
              )
            ? "项目停用或性别不适用"
            : zone?.campus && zone.campus !== a.campus
              ? "不在到检院区"
              : dependencies.some((item) => !a.results[item]?.trim())
                ? `须先完成 ${dependencies.filter((item) => !a.results[item]?.trim()).join("、")}`
                : "";
    const rooms = availableQueueRooms(state, q.id);
    if (!reason && !rooms.length) reason = "没有启用诊室";
    const own = (state.records.queueTickets || []).find(
      (t) =>
        t.department === q.id &&
        t.appointmentId === a.id &&
        activeTicketStatuses.includes(t.status),
    );
    if (!reason && own && ["paused", "missed"].includes(own.status))
      reason =
        own.status === "paused"
          ? "检查已暂停，须核验凭条恢复"
          : "已过号，须召回";
    if (reason) {
      excluded.push({ queueId: q.id, name: q.name, reason });
      continue;
    }
    const pool = (state.records.queueTickets || []).filter(
      (t) =>
        t.department === q.id &&
        ["waiting", "calling"].includes(t.status) &&
        ticketBusinessDay(state, t) === day &&
        t.appointmentId !== a.id &&
        (own
          ? Number(t.position) < Number(own.position) || t.status === "calling"
          : true),
    );
    const capacity = rooms.reduce(
      (sum, r) => sum + Math.max(1, Number(r.capacity) || 1),
      0,
    );
    const serviceMinutes = Math.max(1, Number(q.minutes) || 5);
    const waitMinutes =
      own?.status === "calling"
        ? 0
        : Math.ceil(pool.length / Math.max(1, capacity)) * serviceMinutes;
    const travelMinutes =
      a.preferredQueueArea && a.preferredQueueArea !== q.zone
        ? Math.max(0, Number(state.config.queueTransferMinutes ?? 5))
        : 0;
    const bottleneck =
      config.bottleneck === true ||
      waitMinutes >= Number(state.config.queueBottleneckMinutes || 30);
    const bonus = bottleneck ? Math.min(10, serviceMinutes) : 0;
    const score = waitMinutes + serviceMinutes + travelMinutes - bonus;
    candidates.push({
      queueId: q.id,
      name: q.name,
      zone: q.zone,
      items,
      waitMinutes,
      serviceMinutes,
      travelMinutes,
      bottleneck,
      score,
      ticketId: own?.id,
      explanation: `前方 ${pool.length} 人 ÷ ${capacity} 服务位，向上取整 × ${serviceMinutes} 分钟 = 等待 ${waitMinutes} 分钟；服务 ${serviceMinutes} + 跨区域 ${travelMinutes} − 瓶颈优先 ${bonus} = 评分 ${score}。${dependencies.length ? `依赖 ${dependencies.join("、")} 已完成。` : "无前置依赖。"}`,
    });
  }
  candidates.sort(
    (x, y) =>
      x.score - y.score ||
      x.waitMinutes - y.waitMinutes ||
      x.queueId.localeCompare(y.queueId),
  );
  return {
    recommendation: candidates[0] || null,
    candidates,
    excluded,
    reason: candidates.length
      ? "按等待、服务、区域转移及瓶颈优先分数升序推荐；相同分数按队列编号稳定排序。仅为可解释演示估算。"
      : "没有满足项目、性别、依赖、区域和开关条件的可执行队列。",
  };
}
export function previewRoomDispatch(
  state: DemoState,
  queueId: string,
  ticketId?: string,
  selectedRoomId?: string,
) {
  const fail = (error: string) => ({
    error,
    ticket: null as Row | null,
    room: null as Row | null,
  });
  if (!hasGuideQueueAccess(state, queueId) || !isQueueOpen(state, queueId))
    return fail("无队列权限或队列已关闭。");
  const rooms = availableQueueRooms(state, queueId);
  const configuredMode = state.config.queueRoomModes?.[queueId];
  const mode = configuredMode || "single";
  const active = (state.records.queueTickets || []).filter(
    (t) =>
      t.department === queueId &&
      ticketBusinessDay(state, t) === queueBusinessDay(state),
  );
  const allowed = active.filter((t) => {
    const a = state.appointments.find((a) => a.id === t.appointmentId);
    return (
      a &&
      arrivedStatuses.includes(a.status) &&
      !a.locked &&
      ["waiting", "calling"].includes(t.status)
    );
  });
  let room =
    mode === "multi"
      ? undefined
      : rooms.find(
          (r) =>
            r.id ===
            (selectedRoomId || state.config.queueSingleRooms?.[queueId]),
        ) || rooms[0];
  const ticket = ticketId
    ? allowed.find((t) => t.id === ticketId)
    : allowed
        .filter(
          (t) =>
            t.status === "waiting" &&
            (mode === "multi" || !t.roomId || t.roomId === room?.id),
        )
        .sort(
          (a, b) =>
            Number(a.position) - Number(b.position) ||
            String(a.id).localeCompare(String(b.id)),
        )[0];
  if (!ticket)
    return fail(
      "当前没有可派发候检客户；锁定、历史日期和已取消订单不会被叫号。",
    );
  const appointment = state.appointments.find(
    (a) => a.id === ticket.appointmentId,
  );
  // Legacy explicit manual room selection remains supported; selecting a work mode opts into strict single-room ownership.
  if (!configuredMode)
    room = selectedRoomId
      ? rooms.find((r) => r.id === selectedRoomId)
      : rooms.find((r) => r.id === ticket.roomId) ||
        rooms.find((r) => r.zone === appointment?.preferredQueueArea) ||
        room;
  if (
    configuredMode === "single" &&
    ticket.roomId &&
    ticket.roomId !== room?.id
  )
    return fail("单诊室模式只能呼叫本房间或未分配客户。");
  // A recall keeps its original room, and never takes a second slot.
  if (ticket.status === "calling" && configuredMode)
    room = rooms.find((r) => r.id === ticket.roomId);
  if (mode === "multi" && ticket.status !== "calling")
    room = [...rooms]
      .sort((a, b) => {
        const load = (r: Row) =>
          active.filter(
            (t) =>
              t.status === "calling" && t.roomId === r.id && t.id !== ticket.id,
          ).length / Math.max(1, Number(r.capacity) || 1);
        return load(a) - load(b) || String(a.id).localeCompare(String(b.id));
      })
      .find(
        (r) =>
          active.filter(
            (t) =>
              t.status === "calling" && t.roomId === r.id && t.id !== ticket.id,
          ).length < Math.max(1, Number(r.capacity) || 1),
      );
  if (!room)
    return fail("没有空闲启用诊室，请完成当前检查或重新分配停用诊室。");
  if (configuredMode === "single" && ticket.roomId && ticket.roomId !== room.id)
    return fail("单诊室模式只能呼叫本房间或未分配客户。");
  if (
    active.filter(
      (t) =>
        t.status === "calling" && t.roomId === room.id && t.id !== ticket.id,
    ).length >= Math.max(1, Number(room.capacity) || 1)
  )
    return fail("当前诊室已满，请先完成或过号处理。");
  return { error: "", ticket, room };
}

export const defaultBusinessAutomationRules = {
  appointment: true,
  checkin: true,
  report: true,
  preExam: true,
  recheck: true,
  followupDue: true,
  abnormalSms: false,
  autoFollowup: false,
  risks: ["A类", "B类", "C类", "D类"],
  followupDelayDays: 1,
  precautions:
    "请携带演示导检信息，按体检中心已告知的空腹及检查准备要求到检；具体要求请咨询工作人员。",
};
export function businessAutomationRules(state: DemoState) {
  return {
    ...defaultBusinessAutomationRules,
    ...(state.config.businessAutomationRules || {}),
  };
}
const validDay = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const dayPlus = (s: string, days: number) =>
  new Date(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
const operationTime = (s: DemoState, p: Row = {}) =>
  p.at ||
  s.config.businessAutomationClock ||
  s.config.notificationClock ||
  s.audit[0]?.time ||
  `${queueBusinessDay(s)}T08:00:00Z`;
const automationRoles = [
  "admin",
  "reception",
  "manager",
  "reviewer",
  "support",
];
export const canManageBusinessAutomation = (state: DemoState) =>
  automationRoles.includes(state.config.role);
function recordState(s: DemoState, collection: string, record: Row): DemoState {
  const rows = s.records[collection] || [];
  return {
    ...s,
    records: {
      ...s.records,
      [collection]: rows.some((r) => r.id === record.id)
        ? rows.map((r) => (r.id === record.id ? { ...r, ...record } : r))
        : [record, ...rows],
    },
  };
}
function trace(s: DemoState, action: Action, at: string, message: string) {
  return {
    ...s,
    audit: [
      {
        id: `AUTOAUDIT-${action.type}-${s.audit.length}-${at}`,
        action: action.type,
        entity: action.payload?.id || action.payload?.queueId || "automation",
        actor: s.config.operatorName || s.config.role,
        time: at,
        message,
      },
      ...s.audit,
    ].slice(0, 1000),
  };
}
export function riskPriority(state: DemoState, row: Row) {
  const severity: Record<string, number> = {
    A类: 0,
    B类: 1,
    C类: 2,
    D类: 3,
    低风险: 3,
  };
  const alertRisk = (state.records.alerts || [])
    .filter((a) => a.appointmentId === row.id)
    .map((a) => a.risk)
    .sort((a, b) => (severity[a] ?? 4) - (severity[b] ?? 4))[0];
  const risk =
    row.risk ||
    alertRisk ||
    state.patients.find((p) => p.id === row.patientId)?.risk ||
    "D类";
  return (
    ({ A类: 0, B类: 1, C类: 2, D类: 3, 低风险: 3 } as Record<string, number>)[
      risk
    ] ?? 4
  );
}
export function sortByRisk<T extends Row>(state: DemoState, rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        riskPriority(state, a.row) - riskPriority(state, b.row) ||
        a.index - b.index,
    )
    .map((x) => x.row);
}
const isPatientLocked = (s: DemoState, patientId: string) =>
  (s.records.followupLocks || []).some(
    (l) => l.patientId === patientId && l.status === "locked",
  );
function noticeRow(
  state: DemoState,
  a: Appointment | undefined,
  eventKey: string,
  kind: string,
  content: string,
  at: string,
  extra: Row = {},
) {
  const patientId = extra.patientId || a?.patientId;
  const patient = state.patients.find((p) => p.id === patientId);
  return {
    id: `BUSINESS-${eventKey}`,
    eventKey,
    kind,
    title: kind,
    template: kind,
    content,
    at,
    appointmentId: a?.id || "",
    patientId,
    patientName: patient?.name || "未关联合成客户",
    recipient: extra.recipient || patient?.name || "健康管理师",
    recipientRole: extra.recipientRole || "patient",
    channel:
      extra.recipientRole === "manager"
        ? "站内消息（本地）"
        : "短信（本地模拟）",
    sourceId: extra.sourceId || a?.id || eventKey,
    status: "未读",
    deliveryStatus: "模拟送达",
    deliveryHistory: [
      { status: "待模拟发送", at },
      { status: "模拟送达", at },
    ],
    synthetic: true,
    ...extra,
  };
}
function addNotice(state: DemoState, row: Row): DemoState {
  if ((state.records.businessNotifications || []).some((r) => r.id === row.id))
    return state;
  let next = recordState(state, "businessNotifications", row);
  next = recordState(next, "stationNotifications", row);
  if (row.channel.startsWith("短信"))
    next = recordState(next, "controlNotifications", {
      ...row,
      status: "模拟送达",
      abnormalItems: row.items || [],
      attempts: [{ at: row.at, actor: "本地业务事件", status: "模拟送达" }],
    });
  return next;
}
export function previewBusinessClock(state: DemoState, clock: string): Row[] {
  if (!Number.isFinite(Date.parse(clock))) return [];
  const date = clock.slice(0, 10);
  if (!validDay(date)) return [];
  const rules = businessAutomationRules(state);
  const rows: Row[] = [];
  const existing = new Set(
    (state.records.businessNotifications || []).map((r) => r.id),
  );
  if (rules.preExam)
    for (const a of state.appointments.filter(
      (a) =>
        ["booked", "paid"].includes(a.status) &&
        !a.locked &&
        validDay(a.date) &&
        a.date === dayPlus(date, 1),
    )) {
      rows.push(
        noticeRow(
          state,
          a,
          `PREEXAM-${a.id}-${a.date}-${a.time}`,
          "检前一天提醒",
          `${a.id}：体检时间 ${a.date} ${a.time}，${a.campus}。体检注意事项：${rules.precautions}`,
          clock,
          { scheduledDate: date },
        ),
      );
    }
  if (rules.recheck)
    for (const plan of (state.records.recheckPlans || []).filter(
      (r) => r.status === "已计划" && r.date === date,
    )) {
      const a = state.appointments.find((a) => a.id === plan.appointmentId);
      if (!a || a.status === "cancelled") continue;
      rows.push(
        noticeRow(
          state,
          a,
          `RECHECK-${plan.id}-${plan.revision}`,
          "复查项目时间提醒",
          `${a.id}：请于 ${plan.date} ${plan.time || "待确认时段"} 前往 ${a.campus} 完成复查项目：${plan.items.join("、")}。`,
          clock,
          {
            sourceId: plan.id,
            planId: plan.id,
            planRevision: plan.revision,
            items: plan.items,
            scheduledDate: plan.date,
          },
        ),
      );
    }
  if (rules.followupDue)
    for (const task of state.tasks.filter(
      (t) =>
        ["待处理", "进行中"].includes(t.status) &&
        !t.locked &&
        validDay(t.nextVisitDate || t.date) &&
        (t.nextVisitDate || t.date) <= date,
    )) {
      const a = state.appointments.find((a) => a.id === task.appointmentId);
      if (
        task.appointmentId &&
        (!a || a.status === "cancelled" || a.patientId !== task.patientId)
      )
        continue;
      if (
        !state.patients.some((p) => p.id === task.patientId) ||
        isPatientLocked(state, task.patientId)
      )
        continue;
      const due = task.nextVisitDate || task.date;
      rows.push(
        noticeRow(
          state,
          a,
          `FOLLOWUP-${task.id}-${due}`,
          "随访到期提醒",
          `${task.title}：下次回访日期 ${due}，责任人 ${task.owner || "未分配"}。`,
          clock,
          {
            sourceId: task.id,
            taskId: task.id,
            patientId: task.patientId,
            recipient: task.owner || "健康管理师",
            recipientRole: "manager",
            scheduledDate: due,
          },
        ),
      );
    }
  return rows.filter((row) => !existing.has(row.id));
}
function invalidatePlannedNotices(state: DemoState): DemoState {
  let next = state;
  const notices = state.records.businessNotifications || [];
  for (const row of notices) {
    if (["已撤销", "已处理"].includes(row.status)) continue;
    const a = state.appointments.find((a) => a.id === row.appointmentId);
    const plan = (state.records.recheckPlans || []).find(
      (p) => p.id === row.planId,
    );
    const task = state.tasks.find((t) => t.id === row.taskId);
    const withdrawn =
      (row.appointmentId && (!a || a.status === "cancelled")) ||
      (row.kind === "领取报告提示" &&
        a &&
        !["approved", "printed"].includes(a.status)) ||
      (row.planId &&
        (!plan ||
          plan.status !== "已计划" ||
          plan.revision !== row.planRevision)) ||
      (row.taskId &&
        (!task ||
          ["已取消", "已完成"].includes(task.status) ||
          (task.nextVisitDate || task.date) !== row.scheduledDate)) ||
      (row.kind === "检前一天提醒" &&
        a &&
        (a.date !== dayPlus(row.scheduledDate, 1) ||
          !["booked", "paid"].includes(a.status)));
    if (withdrawn)
      for (const collection of [
        "businessNotifications",
        "stationNotifications",
        "controlNotifications",
      ]) {
        const existing = (next.records[collection] || []).find(
          (r) => r.id === row.id,
        );
        if (existing)
          next = recordState(next, collection, {
            ...existing,
            status: "已撤销",
            withdrawReason: "关联订单、日期或计划已变更；保留模拟发送历史",
          });
      }
  }
  return next;
}
export function augmentBusinessEvents(
  previous: DemoState,
  next: DemoState,
  action: Action,
): DemoState {
  if (previous === next || ["SYNC", "RESET"].includes(action.type)) return next;
  let result = next;
  const rules = businessAutomationRules(next);
  const at = operationTime(next, action.payload);
  for (const a of next.appointments) {
    const before = previous.appointments.find((x) => x.id === a.id);
    if (
      a.status === "cancelled" ||
      !next.patients.some((p) => p.id === a.patientId)
    )
      continue;
    if (
      !before &&
      rules.appointment &&
      action.type !== "RESTORE_CANCELLED_APPOINTMENT"
    )
      result = addNotice(
        result,
        noticeRow(
          next,
          a,
          `BOOKED-${a.id}`,
          "预约成功提醒",
          `${a.id} 预约成功：${a.date} ${a.time}，${a.campus}。`,
          at,
        ),
      );
    if (
      before &&
      before.status !== "checked" &&
      a.status === "checked" &&
      rules.checkin
    )
      result = addNotice(
        result,
        noticeRow(
          next,
          a,
          `CHECKIN-${a.id}`,
          "体检到检提示",
          `${a.id} 已完成到检登记。请查看电子导检的待检项目及下一站估算。`,
          at,
        ),
      );
    if (
      before &&
      !["review", "approved", "printed"].includes(before.status) &&
      a.status === "review" &&
      rules.checkin
    )
      result = addNotice(
        result,
        noticeRow(
          next,
          a,
          `EXAM-${a.id}`,
          "体检完成提示",
          `${a.id} 检查已提交，报告等待审核，审核通过后另行提示。`,
          at,
        ),
      );
    if (
      before &&
      !["approved", "printed"].includes(before.status) &&
      ["approved", "printed"].includes(a.status) &&
      rules.report
    )
      result = addNotice(
        result,
        noticeRow(
          next,
          a,
          `REPORT-${a.id}`,
          "领取报告提示",
          `${a.id} 报告已审核，可在患者端查看或按体检中心领取安排办理。`,
          at,
        ),
      );
  }
  // Only newly created alerts or explicitly deferred, locked events may trigger automation.
  for (const alert of next.records.alerts || []) {
    const isNew = !(previous.records.alerts || []).some(
      (r) => r.id === alert.id,
    );
    const deferred = (next.records.automationDeferred || []).some(
      (r) => r.id === alert.id && r.status === "等待解锁",
    );
    if (!isNew && !deferred) continue;
    if (["已取消", "已处理", "已关闭"].includes(alert.status)) continue;
    const a = next.appointments.find((a) => a.id === alert.appointmentId);
    if (
      !a ||
      a.status === "cancelled" ||
      !next.patients.some((p) => p.id === alert.patientId) ||
      alert.patientId !== a.patientId ||
      !rules.risks.includes(alert.risk || "A类")
    )
      continue;
    if (rules.abnormalSms && !a.locked)
      result = addNotice(
        result,
        noticeRow(
          next,
          a,
          `ABNORMAL-${alert.id}`,
          "异常项目自动提醒",
          `${a.id} 新增合成异常：${alert.title}（${alert.risk || "A类"}），请联系演示工作人员复核。`,
          at,
          { sourceId: alert.id, items: [alert.title] },
        ),
      );
    if (
      rules.autoFollowup &&
      !result.tasks.some(
        (t) =>
          t.sourceAlertId === alert.id || (t.alertIds || []).includes(alert.id),
      )
    ) {
      if (a.locked || isPatientLocked(next, alert.patientId)) {
        result = recordState(result, "automationDeferred", {
          id: alert.id,
          status: "等待解锁",
          appointmentId: a.id,
          patientId: a.patientId,
          sourceId: alert.id,
          reason: "订单或客户随访锁定",
        });
        continue;
      }
      const day = String(at).slice(0, 10);
      const due = dayPlus(
        validDay(day) ? day : a.date,
        Number(rules.followupDelayDays),
      );
      const task = {
        id: `AUTO-FOLLOWUP-${alert.id}`,
        title: `异常自动随访：${alert.title}`,
        patientId: alert.patientId,
        appointmentId: a.id,
        sourceAlertId: alert.id,
        alertIds: [alert.id],
        source: "异常自动规则",
        risk: alert.risk || "A类",
        status: "待处理",
        owner: "健康管理师",
        date: due,
        nextVisitDate: due,
        createdAt: at,
        history: [{ date: day, text: `由异常 ${alert.id} 按自动规则创建` }],
      };
      result = { ...result, tasks: [...result.tasks, task] };
      result = recordState(result, "alerts", {
        ...alert,
        followupTaskId: task.id,
      });
      if (deferred)
        result = recordState(result, "automationDeferred", {
          id: alert.id,
          status: "已生成",
          taskId: task.id,
        });
    }
  }
  result = invalidatePlannedNotices(result);
  // Stable risk order is shared by orders and tasks; reads need no mutation.
  return result;
}
export function reduceQueueAutomationAction(
  state: DemoState,
  action: Action,
): DemoState | undefined {
  const p = action.payload || {};
  const at = operationTime(state, p);
  if (action.type === "QUEUE_RECOMMENDED_ENQUEUE") {
    const a = state.appointments.find((a) => a.id === p.appointmentId);
    const rec = recommendNextStation(state, p.appointmentId);
    const target = p.bottleneck
      ? rec.candidates
          .filter((q) => q.bottleneck)
          .sort(
            (a, b) =>
              b.waitMinutes - a.waitMinutes ||
              a.queueId.localeCompare(b.queueId),
          )[0]
      : rec.recommendation;
    if (
      !a ||
      !target ||
      !hasGuideQueueAccess(state, target.queueId) ||
      target.ticketId ||
      !validDay(String(a.checkedAt || a.date).slice(0, 10))
    )
      return state;
    const tickets = state.records.queueTickets || [];
    // One order/queue ticket, including completed records: never overwrite history.
    if (
      tickets.some(
        (t) => t.department === target.queueId && t.appointmentId === a.id,
      )
    )
      return state;
    const record = {
      id: `${target.queueId}-${a.id}`,
      department: target.queueId,
      appointmentId: a.id,
      status: "waiting",
      position:
        Math.max(
          -1,
          ...tickets
            .filter((t) => t.department === target.queueId)
            .map((t) => Number(t.position) || 0),
        ) + 1,
      waitMinutes: target.waitMinutes,
      businessDate: String(a.checkedAt || a.date).slice(0, 10),
      createdAt: at,
      prearranged: !!p.bottleneck,
      recommendationExplanation: target.explanation,
    };
    return trace(
      recordState(state, "queueTickets", record),
      action,
      at,
      p.bottleneck ? "瓶颈队列预排已创建唯一票据" : "推荐第一站已入队",
    );
  }
  if (action.type === "QUEUE_SET_ROOM_MODE") {
    if (
      !hasGuideQueueAccess(state, p.queueId) ||
      !["single", "multi"].includes(p.mode)
    )
      return state;
    const rooms = availableQueueRooms(state, p.queueId);
    if (p.mode === "single" && !rooms.some((r) => r.id === p.roomId))
      return state;
    return trace(
      {
        ...state,
        config: {
          ...state.config,
          queueRoomModes: {
            ...state.config.queueRoomModes,
            [p.queueId]: p.mode,
          },
          queueSingleRooms: {
            ...state.config.queueSingleRooms,
            [p.queueId]: p.roomId || rooms[0]?.id,
          },
        },
      },
      action,
      at,
      `队列切换${p.mode === "multi" ? "多诊室共享池" : "单诊室"}`,
    );
  }
  if (action.type === "QUEUE_DISPATCH") {
    const result = previewRoomDispatch(state, p.queueId, p.ticketId, p.roomId);
    if (result.error || !result.ticket || !result.room) return state;
    const t = result.ticket,
      r = result.room;
    // requestId prevents duplicate UI submissions while explicit recall uses a new requestId.
    if (p.requestId && t.lastDispatchRequestId === p.requestId) return state;
    const a = state.appointments.find((a) => a.id === t.appointmentId);
    const patient = state.patients.find((p) => p.id === a?.patientId);
    const pref = state.records.queuePatientPreferences?.find(
      (r) => r.id === patient?.id,
    );
    return trace(
      recordState(state, "queueTickets", {
        ...t,
        status: "calling",
        roomId: r.id,
        roomName: r.name,
        zone: r.zone,
        calledAt: at,
        callCount: (t.callCount || 0) + 1,
        lastDispatchRequestId: p.requestId,
        spokenText: `请 ${pref?.pronunciation || patient?.name || "演示客户"} 前往 ${r.name}`,
        guideUserId: state.config.guideActiveUserId || "admin",
      }),
      action,
      at,
      `共享队列派发 ${t.appointmentId} 至 ${r.name}`,
    );
  }
  if (action.type === "QUEUE_REBALANCE_CLOSED_ROOMS") {
    if (!hasGuideQueueAccess(state, p.queueId)) return state;
    const roomIds = availableQueueRooms(state, p.queueId).map((r) => r.id);
    let next = state;
    for (const t of state.records.queueTickets || [])
      if (
        t.department === p.queueId &&
        ["waiting", "calling"].includes(t.status) &&
        t.roomId &&
        !roomIds.includes(t.roomId)
      )
        next = recordState(next, "queueTickets", {
          ...t,
          previousRoomId: t.roomId,
          roomId: "",
          roomName: "",
          status: "waiting",
          reassignedAt: at,
        });
    return next === state
      ? state
      : trace(next, action, at, "停用诊室票据已回到共享候检池，可重新负载分配");
  }
  if (!action.type.startsWith("AUTOMATION_")) return undefined;
  if (!canManageBusinessAutomation(state)) return state;
  if (action.type === "AUTOMATION_CONFIGURE") {
    const rules = { ...businessAutomationRules(state), ...p.rules };
    if (
      !Array.isArray(rules.risks) ||
      rules.risks.some(
        (r: string) => !["A类", "B类", "C类", "D类", "低风险"].includes(r),
      ) ||
      !Number.isInteger(Number(rules.followupDelayDays)) ||
      Number(rules.followupDelayDays) < 0 ||
      Number(rules.followupDelayDays) > 365 ||
      !String(rules.precautions || "").trim() ||
      String(rules.precautions).length > 500
    )
      return state;
    return trace(
      { ...state, config: { ...state.config, businessAutomationRules: rules } },
      action,
      at,
      "业务事件通知与自动随访规则已保存，仅对新事件生效",
    );
  }
  if (action.type === "AUTOMATION_SCAN") {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(
        p.clock || "",
      ) ||
      !Number.isFinite(Date.parse(p.clock)) ||
      !validDay(p.clock.slice(0, 10))
    )
      return state;
    let next: DemoState = {
      ...state,
      config: { ...state.config, businessAutomationClock: p.clock },
    };
    const rows = previewBusinessClock(next, p.clock);
    for (const row of rows) next = addNotice(next, row);
    return trace(
      next,
      action,
      p.clock,
      `显式扫描演示时钟，新增 ${rows.length} 条本地通知`,
    );
  }
  if (action.type === "AUTOMATION_PLAN_RECHECK") {
    const a = state.appointments.find((a) => a.id === p.appointmentId);
    const items = [...new Set(listValues(p.items))];
    const old = (state.records.recheckPlans || []).find((r) => r.id === p.id);
    if (
      !p.id ||
      !a ||
      a.status === "cancelled" ||
      isPatientLocked(state, a.patientId) ||
      !validDay(p.date) ||
      !items.length ||
      items.some((item) => !a.items.includes(item)) ||
      (old && old.appointmentId !== a.id) ||
      (p.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))
    )
      return state;
    if (
      old?.status === "已计划" &&
      old.date === p.date &&
      old.time === (p.time || "") &&
      JSON.stringify(old.items) === JSON.stringify(items)
    )
      return state;
    const plan = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      date: p.date,
      time: p.time || "",
      items,
      status: "已计划",
      revision: (old?.revision || 0) + 1,
      at,
    };
    return trace(
      recordState(state, "recheckPlans", plan),
      action,
      at,
      "保存项目与日期关联的本地复查计划",
    );
  }
  if (action.type === "AUTOMATION_CANCEL_RECHECK") {
    const plan = (state.records.recheckPlans || []).find((r) => r.id === p.id);
    if (
      !plan ||
      plan.status !== "已计划" ||
      isPatientLocked(state, plan.patientId)
    )
      return state;
    return trace(
      recordState(state, "recheckPlans", {
        ...plan,
        status: "已取消",
        cancelledAt: at,
      }),
      action,
      at,
      "复查计划取消，不再触发原定日期通知",
    );
  }
  if (action.type === "AUTOMATION_SET_FOLLOWUP_DATE") {
    const task = state.tasks.find((t) => t.id === p.id);
    if (
      !task ||
      task.locked ||
      !["待处理", "进行中"].includes(task.status) ||
      isPatientLocked(state, task.patientId) ||
      !validDay(p.date)
    )
      return state;
    if (task.nextVisitDate === p.date) return state;
    return trace(
      {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === p.id
            ? {
                ...t,
                nextVisitDate: p.date,
                date: p.date,
                history: [
                  ...(t.history || []),
                  { date: at.slice(0, 10), text: `下次回访改为 ${p.date}` },
                ],
              }
            : t,
        ),
      },
      action,
      at,
      "已保存下次回访日期",
    );
  }
  if (action.type === "AUTOMATION_MARK_NOTICE") {
    const row = (state.records.businessNotifications || []).find(
      (r) => r.id === p.id,
    );
    if (
      !row ||
      !["已读", "已处理"].includes(p.status) ||
      ["已撤销", "已处理"].includes(row.status) ||
      row.status === p.status ||
      (p.status === "已处理" && !String(p.note || "").trim())
    )
      return state;
    let next = state;
    for (const collection of ["businessNotifications", "stationNotifications"])
      if ((state.records[collection] || []).some((r) => r.id === row.id))
        next = recordState(next, collection, {
          ...row,
          status: p.status,
          note: p.note || row.note,
          handledAt: at,
          handledBy: state.config.operatorName || state.config.role,
        });
    return trace(next, action, at, `通知${p.status}：${row.title}`);
  }
  return state;
}
