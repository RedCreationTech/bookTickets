import type { Action, Appointment, DemoState } from "./model";
import { reviewNodes } from "./clinicalRules";
import {
  quoteOrder,
  getOrderingIssues,
  getOrderRules,
  packageAvailableAtCampus,
} from "./orderingRules";
import { getBookingAvailability } from "./bookingRules";
import { validateCampusItems } from "./groupImportRules";
import {
  appointmentFingerprint,
  canEditOrders,
  orderingActor,
  pricingCatalogSignature,
} from "./batchOrderingRules";
export const ORDER_SOURCES = ["预约", "团检备单", "个检登记", "第三方预约"];
export const ORDER_FLOW_STATES = [
  "订单创建",
  "预约中",
  "预约完成",
  "取消预约",
  "订单到检",
  "订单弃检",
  "检查中",
  "检查完成",
  "检查被驳回",
  "初审中",
  "初审完成",
  "驳回至初审",
  "主检中",
  "主检完成",
  "驳回至主检",
  "总检中",
  "总检完成",
  "驳回至总检",
  "终审中",
  "终审完成",
  "驳回至终审",
  "订单结束",
];
export const ITEM_STATES = [
  "未执行",
  "检查中",
  "已完成",
  "已登记",
  "已收到报告",
  "弃检",
  "已改期",
  "已确认未完成",
];
type Row = Record<string, any>;
const list = (s: DemoState, key: string): Row[] => s.records[key] || [];
export function orderInScope(s: DemoState, a: Appointment) {
  const r = list(s, "roles").find((r) => r.id === s.config.customRoleId);
  return (
    !s.config.customRoleId ||
    (!!r &&
      (!r.allowedPatientIds?.length ||
        r.allowedPatientIds.includes(a.patientId)) &&
      (!r.allowedCampus || r.allowedCampus === a.campus) &&
      (!r.examTypes?.length ||
        r.examTypes.includes(
          a.orderType ||
            (s.patients.find((p) => p.id === a.patientId)?.company === "个检"
              ? "个检"
              : "团检"),
        )))
  );
}
export function orderSourceClass(a: Appointment) {
  if (ORDER_SOURCES.includes(a.sourceClass)) return a.sourceClass as string;
  if (/第三方/.test(a.source || "")) return "第三方预约";
  if (a.groupOrderId || /团检|备单/.test(a.source || "")) return "团检备单";
  if (/预约|患者|自助/.test(a.source || "")) return "预约";
  return "个检登记";
}
export function orderItemRows(s: DemoState, a: Appointment) {
  return [...new Set([...a.items, ...(a.waived || [])])].map((item: string) => {
    const ev = list(s, "orderItemEvents").filter(
        (e) => e.appointmentId === a.id && e.item === item,
      ),
      latest = ev[0];
    const hasResult = !!String(a.results[item] || "").trim();
    const waived = (a.waived || []).includes(item);
    const state = waived
      ? "弃检"
      : hasResult
        ? ev.some((e) => e.operation === "report_received")
          ? "已收到报告"
          : "已完成"
        : latest?.operation === "start"
          ? "检查中"
          : latest?.operation === "register"
            ? "已登记"
            : latest?.operation === "reschedule"
              ? "已改期"
              : latest?.operation === "confirm"
                ? "已确认未完成"
                : latest?.operation === "report_received"
                  ? "已收到报告"
                  : "未执行";
    return {
      appointmentId: a.id,
      item,
      state,
      hasResult,
      waived,
      unfinished: !waived && !hasResult,
      unreturned:
        !waived &&
        !hasResult &&
        !ev.some((e) => e.operation === "report_received"),
      at: latest?.at || "",
      rescheduleDate: ev.find((e) => e.operation === "reschedule")?.date || "",
      confirmation:
        ev.find((e) => e.operation === "confirm")?.confirmation || "",
      reference:
        ev.find((e) => e.operation === "report_received")?.reference || "",
      events: ev,
    };
  });
}
export function orderFlowEvents(s: DemoState, a: Appointment) {
  const events: Row[] = [];
  const push = (
    label: string,
    at: string | undefined,
    source: string,
    id: string,
  ) => {
    if (!events.some((e) => e.id === id))
      events.push({ id, label, at: at || "", source, appointmentId: a.id });
  };
  const audits = s.audit.filter(
    (e) => e.entity === a.id || e.entity?.appointmentId === a.id,
  );
  for (const e of audits) {
    const after = e.after || {},
      before = e.before || {};
    if (
      e.action === "CREATE_APPOINTMENT" ||
      e.action === "ORDER_THIRD_PARTY_IMPORT"
    ) {
      push("订单创建", e.time, "创建审计", `${e.id}-create`);
      push("预约中", e.time, "本地预约请求", `${e.id}-request`);
      push("预约完成", e.time, "创建成功审计", `${e.id}-book`);
    }
    if (e.action === "REVIEW") {
      const history = after.reviewHistory || [];
      const last = history[history.length - 1];
      if (last?.node && last.status === "已通过")
        push(
          `${last.node}完成`,
          last.completedAt || e.time,
          "不可变审核通过审计",
          `${e.id}-pass`,
        );
    }
    if (e.action === "REJECT_TO_MAIN")
      push("驳回至主检", e.time, "总检驳回审计", `${e.id}-return`);
    if (e.action === "UNDO_REVIEW_STAGE") {
      const target = reviewNodes(s, after as Appointment)[
        after.reviewStage || 0
      ];
      if (target)
        push(`驳回至${target}`, e.time, "撤回阶段审计", `${e.id}-undo`);
    }
    if (before.status !== after.status) {
      const labels: Row = {
        cancelled: "取消预约",
        checked: "订单到检",
        in_exam: e.action === "REJECT" ? "检查被驳回" : "检查中",
        review: e.action === "SAVE_RESULTS" ? "检查完成" : null,
      };
      if (labels[after.status])
        push(labels[after.status], e.time, "状态变更审计", e.id);
    }
    if (after.waived?.length > (before.waived?.length || 0))
      push("订单弃检", e.time, "弃检审计", `${e.id}-waive`);
  }
  if (!events.some((e) => e.label === "订单创建") && a.createdAt)
    push("订单创建", a.createdAt, "保存的创建时间", "created");
  if (
    !events.some((e) => e.label === "预约完成") &&
    a.date &&
    a.status !== "cancelled"
  )
    push(
      "预约完成",
      a.createdAt,
      "当前有效预约快照（未知时间不补造）",
      "booked",
    );
  if (a.checkedAt) push("订单到检", a.checkedAt, "保存的到检时间", "checked");
  if (a.submittedAt)
    push("检查完成", a.submittedAt, "分检提交时间", "submitted");
  if (a.closedAt) push("订单结束", a.closedAt, "人工确认结束记录", "closed");
  for (const [node, at] of Object.entries(a.stageStartedAt || {}))
    push(`${node}中`, String(at), "审核节点开始记录", `start-${node}-${at}`);
  for (const [index, h] of (a.reviewHistory || []).entries())
    if (h.node && h.status === "已通过")
      push(
        `${h.node}完成`,
        h.completedAt,
        "审核通过记录",
        `pass-${index}-${h.node}`,
      );
  for (const e of list(s, "orderFlowEvents").filter(
    (e) => e.appointmentId === a.id,
  ))
    push(e.label, e.at, "业务动作记录", e.id);
  for (const e of list(s, "orderItemEvents").filter(
    (e) => e.appointmentId === a.id && e.operation === "start",
  ))
    push("检查中", e.at, `${e.item}开始记录`, e.id);
  return events
    .filter((e) => ORDER_FLOW_STATES.includes(e.label))
    .sort(
      (x, y) =>
        String(y.at).localeCompare(String(x.at)) || x.id.localeCompare(y.id),
    );
}
export interface OrderSearchFilters {
  query?: string;
  match?: "fuzzy" | "exact";
  source?: string;
  campus?: string;
  dateField?: "appointment" | "created" | "checked";
  start?: string;
  end?: string;
  flow?: string;
  itemState?: string;
  missingOnly?: boolean;
  identity?: string;
}
export function queryOrders(s: DemoState, f: OrderSearchFilters = {}) {
  const campus = f.campus ?? s.config.campus ?? "中心院区",
    q = (f.query || "").trim().toLocaleUpperCase();
  return s.appointments.filter((a) => {
    if (!orderInScope(s, a) || (campus !== "all" && a.campus !== campus))
      return false;
    const p = s.patients.find((p) => p.id === a.patientId),
      keys = [
        a.id,
        a.examNo,
        a.examinationNo,
        p?.name,
        p?.certificate,
        `DEMO-${a.patientId}`,
        p?.company,
        p?.initials,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLocaleUpperCase());
    if (
      q &&
      !keys.some((key) => (f.match === "exact" ? key === q : key.includes(q)))
    )
      return false;
    if (f.identity && !keys.includes(f.identity.trim().toLocaleUpperCase()))
      return false;
    if (f.source && f.source !== "all" && orderSourceClass(a) !== f.source)
      return false;
    const date = String(
      f.dateField === "created"
        ? a.createdAt || ""
        : f.dateField === "checked"
          ? a.checkedAt || ""
          : a.date,
    ).slice(0, 10);
    if ((f.start || f.end) && !date) return false;
    if ((f.start && date < f.start) || (f.end && date > f.end)) return false;
    if (
      f.flow &&
      f.flow !== "all" &&
      !orderFlowEvents(s, a).some((e) => e.label === f.flow)
    )
      return false;
    const items = orderItemRows(s, a);
    if (f.missingOnly && !items.some((i) => i.unfinished || i.unreturned))
      return false;
    if (
      f.itemState &&
      f.itemState !== "all" &&
      !items.some((i) =>
        f.itemState === "未检" ? i.unfinished : i.state === f.itemState,
      )
    )
      return false;
    return true;
  });
}
export function canUnlockOrder(s: DemoState, a?: Appointment) {
  if (a && !orderInScope(s, a)) return false;
  const allowed = s.config.orderUnlockRoles || ["admin"];
  const key = s.config.customRoleId || s.config.role;
  return (
    allowed.includes(key) &&
    (!s.config.customRoleId ||
      list(s, "roles").some(
        (r) => r.id === key && r.permissions?.includes("订单处理"),
      ))
  );
}
const canClinical = (s: DemoState) =>
  s.config.customRoleId
    ? list(s, "roles").some(
        (r) =>
          r.id === s.config.customRoleId && r.permissions?.includes("订单处理"),
      )
    : ["admin", "doctor", "reviewer", "reception"].includes(s.config.role);
const canReview = (s: DemoState) =>
  s.config.customRoleId
    ? list(s, "roles").some(
        (r) =>
          r.id === s.config.customRoleId && r.permissions?.includes("总检审核"),
      )
    : ["admin", "reviewer"].includes(s.config.role);
export function itemOperationErrors(
  s: DemoState,
  a: Appointment | undefined,
  p: Row,
) {
  const errors: string[] = [];
  if (!a) return ["订单不存在"];
  if (!orderInScope(s, a) || !canClinical(s))
    errors.push("当前角色无此订单项目操作权限");
  if (a.locked) errors.push("订单锁定，请由有权人员解禁");
  if (!["checked", "in_exam"].includes(a.status))
    errors.push("仅已到检且未提交审核订单可操作项目");
  if (!a.items.includes(p.item) || a.waived?.includes(p.item))
    errors.push("请选择有效未弃检项目");
  if (
    ![
      "start",
      "register",
      "report_received",
      "confirm",
      "reschedule",
      "waive",
    ].includes(p.operation)
  )
    errors.push("未知项目动作");
  if (!p.reason?.trim()) errors.push("请填写项目操作原因");
  const result = !!String(a.results[p.item] || "").trim(),
    latest = orderItemRows(s, a).find((r) => r.item === p.item);
  if (result && p.operation !== "report_received")
    errors.push("已有结果项目不能改为未检、改期或弃检");
  if (p.operation === "report_received" && !p.reference?.trim())
    errors.push("收到报告须填写合成报告编号；登记不会制造检查结果");
  if (
    p.operation === "confirm" &&
    !["未完成", "待回传"].includes(p.confirmation)
  )
    errors.push("请选择人工确认结论：未完成或待回传");
  if (
    p.operation === "reschedule" &&
    (!validDate(p.date) || p.date < new Date().toISOString().slice(0, 10))
  )
    errors.push("项目改期须为有效的今日或未来日期");
  if (
    p.operation === "waive" &&
    (s.config.allowRemove === false ||
      getOrderRules(s).some((r) => r.item === p.item && r.required))
  )
    errors.push("禁止弃检必检项目或配置不允许弃检");
  if (
    latest?.events[0]?.operation === p.operation &&
    p.operation !== "reschedule"
  )
    errors.push("此项目动作已登记，不能重复执行");
  return errors;
}
function validDate(d: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(d || "") &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d
  );
}
function record(
  s: DemoState,
  id: string,
  action: string,
  a: Appointment,
  after: Appointment,
  message: string,
  collection?: string,
  row?: Row,
): DemoState {
  return {
    ...s,
    appointments: s.appointments.map((v) => (v.id === a.id ? after : v)),
    records: collection
      ? { ...s.records, [collection]: [row!, ...list(s, collection)] }
      : s.records,
    audit: [
      {
        id: `AUD-${id}`,
        time: new Date().toISOString(),
        actor: orderingActor(s),
        action,
        entity: a.id,
        message,
        before: JSON.parse(JSON.stringify(a)),
        after: JSON.parse(JSON.stringify(after)),
      },
      ...s.audit,
    ].slice(0, 1000),
  };
}
export interface ThirdPartyDraft {
  id: string;
  externalId: string;
  patientId: string;
  packageId: string;
  date: string;
  time: string;
  campus: string;
}
export function previewThirdPartyOrder(s: DemoState, p: ThirdPartyDraft) {
  const pack = s.packages.find((k) => k.id === p.packageId),
    patient = s.patients.find((k) => k.id === p.patientId),
    quote = quoteOrder(s, [p.packageId], 100),
    errors: string[] = [];
  if (!canEditOrders(s)) errors.push("无开单权限");
  if (!/^DEMO-[A-Z0-9_-]{3,50}$/i.test(p.externalId || ""))
    errors.push("第三方编号必须为 DEMO- 合成编号");
  if (s.appointments.some((a) => a.thirdPartyExternalId === p.externalId))
    errors.push("第三方编号已导入，不可重复");
  if (!patient || !pack || pack.enabled === false)
    errors.push("请选择已有合成客户和启用套餐");
  if (!["中心院区", "东院区"].includes(p.campus))
    errors.push("请选择已配置院区");
  if (patient && patient.company !== "个检")
    errors.push("本入口仅演示个人第三方预约，团检请使用绑定单位订单的导入");
  if (pack && !packageAvailableAtCampus(s, pack.id, p.campus))
    errors.push("套餐不属于所选院区");
  errors.push(
    ...getOrderingIssues(s, p.patientId, quote.items, [p.packageId]),
    ...validateCampusItems(s, quote.items, p.campus),
  );
  const availability = getBookingAvailability(s, p.date, undefined, {
    patientId: p.patientId,
    kind: "individual",
    time: p.time,
    packageIds: [p.packageId],
    items: quote.items,
    checkQuestionnaire: false,
  });
  if (!availability.allowed) errors.push(availability.error);
  const order: Appointment = {
    id: p.id,
    patientId: p.patientId,
    packageId: p.packageId,
    packageIds: [p.packageId],
    date: p.date,
    time: p.time,
    campus: p.campus,
    status: "booked",
    amount: quote.amount,
    items: quote.items,
    pricing: quote.rows,
    results: {},
    conclusion: "",
    source: "第三方预约（合成导入）",
    sourceClass: "第三方预约",
    thirdPartyExternalId: p.externalId,
    createdAt: new Date().toISOString(),
    orderType: "个检",
  };
  if (!orderInScope(s, order)) errors.push("订单超出当前角色数据范围");
  return {
    errors: [...new Set(errors)],
    order,
    signature: JSON.stringify([
      {
        id: p.id,
        externalId: p.externalId,
        patientId: p.patientId,
        packageId: p.packageId,
        date: p.date,
        time: p.time,
        campus: p.campus,
      },
      quote,
      pricingCatalogSignature(s),
    ]),
  };
}
export function reduceOrderProgressAction(
  s: DemoState,
  action: Action,
): DemoState | undefined {
  if (
    ![
      "ORDER_ITEM_ACTION",
      "ORDER_UNLOCK",
      "ORDER_UNLOCK_CONFIGURE",
      "ORDER_REVIEW_CONFIGURE",
      "ORDER_REVIEW_START",
      "ORDER_REVIEW_RETURN",
      "ORDER_CLOSE",
      "ORDER_THIRD_PARTY_IMPORT",
    ].includes(action.type)
  )
    return undefined;
  const p = action.payload || {},
    a = s.appointments.find((a) => a.id === p.appointmentId),
    at = new Date().toISOString();
  if (!p.id || s.audit.some((e) => e.id === `AUD-${p.id}`)) return s;
  if (action.type === "ORDER_UNLOCK_CONFIGURE") {
    if (
      s.config.role !== "admin" ||
      s.config.customRoleId ||
      !Array.isArray(p.roles) ||
      !p.roles.includes("admin")
    )
      return s;
    const known = [
      "admin",
      "reception",
      "doctor",
      "reviewer",
      "finance",
      ...list(s, "roles").map((r) => r.id),
    ];
    if (p.roles.some((r: string) => !known.includes(r))) return s;
    return {
      ...s,
      config: { ...s.config, orderUnlockRoles: [...new Set(p.roles)] },
      audit: [
        {
          id: `AUD-${p.id}`,
          time: at,
          actor: orderingActor(s),
          action: action.type,
          entity: "orderUnlockRoles",
          message: "维护订单解禁权限",
          before: s.config.orderUnlockRoles || ["admin"],
          after: p.roles,
        },
        ...s.audit,
      ],
    };
  }
  if (action.type === "ORDER_THIRD_PARTY_IMPORT") {
    const preview = previewThirdPartyOrder(s, p);
    if (
      preview.errors.length ||
      preview.signature !== p.expected ||
      s.appointments.some((a) => a.id === p.id)
    )
      return s;
    const order = preview.order;
    return {
      ...s,
      appointments: [order, ...s.appointments],
      audit: [
        {
          id: `AUD-${p.id}`,
          time: at,
          actor: orderingActor(s),
          action: action.type,
          entity: order.id,
          message: `导入合成第三方预约 ${p.externalId}`,
          before: null,
          after: order,
        },
        ...s.audit,
      ],
    };
  }
  if (!a || !orderInScope(s, a) || p.expected !== appointmentFingerprint(a))
    return s;
  if (action.type === "ORDER_UNLOCK") {
    if (!a.locked || !canUnlockOrder(s, a) || !p.reason?.trim()) return s;
    return record(
      s,
      p.id,
      action.type,
      a,
      { ...a, locked: false, unlockedAt: at, unlockReason: p.reason },
      `有权角色解禁：${p.reason}`,
    );
  }
  if (action.type === "ORDER_ITEM_ACTION") {
    if (itemOperationErrors(s, a, p).length) return s;
    const event = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      item: p.item,
      operation: p.operation,
      date: p.operation === "reschedule" ? p.date : undefined,
      confirmation: p.confirmation,
      reference: p.reference,
      reason: p.reason,
      at,
      actor: orderingActor(s),
    };
    const after = {
      ...a,
      status: p.operation === "start" ? "in_exam" : a.status,
    } as Appointment;
    if (p.operation === "waive") {
      after.items = a.items.filter((i) => i !== p.item);
      after.waived = [...new Set([...(a.waived || []), p.item])];
      if (!after.items.length) return s;
    }
    return record(
      s,
      p.id,
      action.type,
      a,
      after,
      `${p.item}：${p.operation}；${p.reason}`,
      "orderItemEvents",
      event,
    );
  }
  if (a.locked) return s;
  if (action.type === "ORDER_REVIEW_CONFIGURE") {
    if (
      !canEditOrders(s) ||
      !["booked", "paid"].includes(a.status) ||
      Object.values(a.results).some(Boolean)
    )
      return s;
    return record(
      s,
      p.id,
      action.type,
      a,
      { ...a, reviewNodes: ["初审", "主检", "总检", "终审"] },
      "为本订单启用四阶段审核",
    );
  }
  if (!canReview(s) || !p.reason?.trim()) return s;
  const nodes: string[] = reviewNodes(s, a),
    index = a.reviewStage || 0;
  if (action.type === "ORDER_REVIEW_START") {
    if (
      a.status !== "review" ||
      !nodes[index] ||
      a.stageStartedAt?.[nodes[index]]
    )
      return s;
    return record(
      s,
      p.id,
      action.type,
      a,
      { ...a, stageStartedAt: { ...a.stageStartedAt, [nodes[index]]: at } },
      `开始${nodes[index]}`,
      "orderFlowEvents",
      {
        id: p.id,
        appointmentId: a.id,
        label: `${nodes[index]}中`,
        at,
        actor: orderingActor(s),
        reason: p.reason,
      },
    );
  }
  if (action.type === "ORDER_REVIEW_RETURN") {
    const target = nodes.indexOf(p.target);
    if (
      !["review", "approved"].includes(a.status) ||
      target < 0 ||
      target > Math.min(index, nodes.length - 1) ||
      !a.items.every((i) => String(a.results[i] || "").trim())
    )
      return s;
    return record(
      s,
      p.id,
      action.type,
      a,
      {
        ...a,
        status: "review",
        reviewStage: target,
        stageStartedAt: Object.fromEntries(
          Object.entries(a.stageStartedAt || {}).filter(
            ([node]) => nodes.indexOf(node) < target,
          ),
        ),
        reviewReturnReason: p.reason,
      },
      `驳回至${p.target}：${p.reason}`,
      "orderFlowEvents",
      {
        id: p.id,
        appointmentId: a.id,
        label: `驳回至${p.target}`,
        at,
        actor: orderingActor(s),
        reason: p.reason,
      },
    );
  }
  if (action.type === "ORDER_CLOSE") {
    if (
      !["approved", "printed"].includes(a.status) ||
      a.closedAt ||
      !a.items.every((i) => String(a.results[i] || "").trim())
    )
      return s;
    return record(
      s,
      p.id,
      action.type,
      a,
      { ...a, closedAt: at, closeReason: p.reason },
      "确认订单结束",
      "orderFlowEvents",
      {
        id: p.id,
        appointmentId: a.id,
        label: "订单结束",
        at,
        actor: orderingActor(s),
        reason: p.reason,
      },
    );
  }
  return s;
}
