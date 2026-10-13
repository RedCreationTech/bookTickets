import { orderPaidAllocations, orderPricingLines } from "./orderFinanceRules";
import { itemAvailableAtCampus } from "./groupImportRules";
import type { DemoState, Appointment, Action } from "./model";
import {
  getOrderRules,
  getOrderingIssues,
  resolveDependencies,
} from "./orderingRules";
export interface ClinicalItemRule {
  id: string;
  item: string;
  reportItems?: string[];
  department: string;
  kind: "number" | "text";
  min?: number;
  max?: number;
  abnormalMin?: number;
  abnormalMax?: number;
  criticalMin?: number;
  criticalMax?: number;
  keywords?: string;
  allowedWords?: string;
  enabled?: boolean;
  sampleType?: string;
  barcodeTemplate?: string;
  [key: string]: any;
}
export function clinicalRules(state: DemoState): ClinicalItemRule[] {
  const names = [
    ...new Set([
      ...state.packages.flatMap((p) => p.items),
      ...getOrderRules(state).map((r) => r.item),
      ...(state.records.clinicalItemRules || []).map((r) => r.item),
    ]),
  ];
  return names.map(
    (item) =>
      ({
        id: `CL-${item}`,
        item,
        department: "全科检查",
        kind: item === "空腹血糖" ? "number" : "text",
        ...(item === "空腹血糖"
          ? {
              min: 0,
              max: 50,
              abnormalMin: 3.9,
              abnormalMax: 6.1,
              criticalMax: state.config.criticalGlucose ?? 7.8,
            }
          : {}),
        keywords: "偏高、异常、阳性",
        sampleType: /妇科/.test(item)
          ? "妇科"
          : /粪/.test(item)
            ? "粪便"
            : /尿/.test(item)
              ? "尿液"
              : /碳|呼气/.test(item)
                ? "碳呼吸"
                : /血|肝|肾|生化/.test(item)
                  ? "采血"
                  : "无标本",
        barcodeTemplate: "DEMO-{体检号}-{标本}-{序号}",
        ...(state.records.clinicalItemRules || []).find((r) => r.item === item),
      }) as ClinicalItemRule,
  );
}
export function clinicalItems(state: DemoState, a: Appointment) {
  return [
    ...new Set(
      a.items.flatMap((item) =>
        clinicalRules(state)
          .find((r) => r.item === item)
          ?.reportItems?.filter(Boolean).length
          ? clinicalRules(state).find((r) => r.item === item)!.reportItems!
          : [item],
      ),
    ),
  ];
}
export function aggregateClinicalResults(
  state: DemoState,
  a: Appointment,
  results: Record<string, string>,
) {
  const out = { ...results };
  for (const item of a.items) {
    const children = clinicalRules(state).find(
      (r) => r.item === item,
    )?.reportItems;
    if (children?.length)
      out[item] = children.every((c) => results[c]?.trim())
        ? children.map((c) => `${c}：${results[c]}`).join("；")
        : "";
  }
  return out;
}
export function validateClinicalResults(
  state: DemoState,
  items: string[],
  results: Record<string, string>,
) {
  const errors: string[] = [];
  for (const item of items) {
    const value = results[item];
    if (!value?.trim()) continue;
    const r = clinicalRules(state).find((r) => r.item === item);
    if (!r || r.enabled === false) continue;
    if (r.kind === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) errors.push(`${item}必须为数值型结果`);
      else if ((r.min != null && n < r.min) || (r.max != null && n > r.max))
        errors.push(
          `${item}超出录入纠错范围 ${r.min ?? "不限"}—${r.max ?? "不限"}，请复核后更正`,
        );
    } else if (
      r.allowedWords?.trim() &&
      !r.allowedWords
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .includes(value.trim())
    )
      errors.push(`${item}不在描述结果字典中，请更正或维护字典`);
  }
  return errors;
}
export function clinicalAbnormalities(
  state: DemoState,
  results: Record<string, string>,
) {
  return Object.entries(results).flatMap(([item, value]) => {
    const r = clinicalRules(state).find((r) => r.item === item);
    if (!r || r.enabled === false || !value?.trim()) return [];
    const n = Number(value);
    const critical =
      r.kind === "number" &&
      Number.isFinite(n) &&
      ((r.criticalMin != null && n <= r.criticalMin) ||
        (r.criticalMax != null && n >= r.criticalMax));
    const abnormal =
      critical ||
      (r.kind === "number" &&
        Number.isFinite(n) &&
        ((r.abnormalMin != null && n < r.abnormalMin) ||
          (r.abnormalMax != null && n > r.abnormalMax))) ||
      !!r.keywords
        ?.split(/[、,，\n]/)
        .filter(Boolean)
        .some((w) => value.includes(w));
    return abnormal
      ? [
          {
            item,
            value,
            critical,
            risk: critical ? "A类" : "B类",
            reason: critical
              ? "触发已启用的危急阈值（演示）"
              : "触发结果异常规则（演示）",
          },
        ]
      : [];
  });
}
export function localHistoricalOrders(state: DemoState, a: Appointment) {
  return state.appointments
    .filter(
      (x) =>
        x.patientId === a.patientId &&
        x.id !== a.id &&
        x.date < a.date &&
        x.status !== "cancelled" &&
        Object.values(x.results || {}).some(Boolean),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function reviewNodes(state: DemoState, appointment?: Appointment) {
  if (appointment?.reviewNodes?.length)
    return appointment.reviewNodes as string[];
  return state.config.initialReviewEnabled === false ||
    (state.config.initialReviewEnabled === undefined &&
      state.config.reviewStages === 2)
    ? ["主检", "总检"]
    : ["初审", "主检", "总检"];
}
export function clinicalActor(state: DemoState) {
  return state.config.currentUserName || state.config.role || "演示人员";
}
function recordClinical(
  state: DemoState,
  a: Appointment,
  patch: Partial<Appointment>,
  action: Action,
  message: string,
) {
  const next = {
    ...state,
    appointments: state.appointments.map((x) =>
      x.id === a.id ? { ...x, ...patch } : x,
    ),
    audit: [
      {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        actor: clinicalActor(state),
        action: action.type,
        entity: { appointmentId: a.id, patientId: a.patientId },
        message,
        before: a,
        after: { ...a, ...patch },
      },
      ...state.audit,
    ],
  };
  return next;
}
export function reduceClinicalAction(
  state: DemoState,
  action: Action,
): DemoState | undefined {
  if (
    ![
      "IN_EXAM_ADD_REQUEST",
      "IN_EXAM_ADD_PAY",
      "IN_EXAM_ADD_CANCEL",
      "UNDO_REVIEW_STAGE",
      "REJECT_TO_MAIN",
    ].includes(action.type)
  )
    return undefined;
  const p = action.payload || {},
    a = state.appointments.find((x) => x.id === p.id);
  if (!a) return state;
  const scopedRole = (state.records.roles || []).find(
    (r) => r.id === state.config.customRoleId,
  );
  if (
    scopedRole &&
    ((scopedRole.allowedPatientIds?.length &&
      !scopedRole.allowedPatientIds.includes(a.patientId)) ||
      (scopedRole.allowedCampus && scopedRole.allowedCampus !== a.campus))
  )
    return state;
  if (action.type === "UNDO_REVIEW_STAGE") {
    if (
      !(state.config.reviewUndoRoles || ["admin", "reviewer"]).includes(
        state.config.role,
      ) ||
      !(a.reviewStage > 0) ||
      !["review", "approved"].includes(a.status) ||
      p.expectedStage !== a.reviewStage ||
      !p.reason?.trim()
    )
      return state;
    const history = a.reviewHistory || [],
      last = history.at(-1);
    if (last && last.stage !== a.reviewStage - 1) return state;
    return recordClinical(
      state,
      a,
      {
        reviewStage: a.reviewStage - 1,
        status: "review",
        locked: false,
        reviewHistory: history.slice(0, -1),
        reviewUndoHistory: [
          ...(a.reviewUndoHistory || []),
          {
            stage: a.reviewStage - 1,
            reason: p.reason,
            at: new Date().toISOString(),
            actor: clinicalActor(state),
          },
        ],
      },
      action,
      "撤销本级审核，保留撤销历史",
    );
  }
  if (action.type === "REJECT_TO_MAIN") {
    if (
      !["admin", "reviewer"].includes(state.config.role) ||
      a.status !== "review" ||
      reviewNodes(state, a)[a.reviewStage || 0] !== "总检" ||
      !p.reason?.trim()
    )
      return state;
    return recordClinical(
      state,
      a,
      {
        reviewStage: reviewNodes(state, a).indexOf("主检"),
        locked: false,
        rejectReason: p.reason,
        reviewHistory: (a.reviewHistory || []).filter(
          (r: any) => r.stage < reviewNodes(state, a).indexOf("主检"),
        ),
      },
      action,
      "总检退回主检",
    );
  }
  if (a.locked || !["checked", "in_exam"].includes(a.status)) return state;
  const charges = a.examAdditions || [];
  if (action.type === "IN_EXAM_ADD_REQUEST") {
    if (
      !p.requestId ||
      charges.some((r: any) => r.id === p.requestId) ||
      !Array.isArray(p.items) ||
      !p.items.length
    )
      return state;
    const dependency = resolveDependencies(state, [...a.items, ...p.items]);
    if (dependency.errors.length) return state;
    const items = [
      ...new Set<string>([...p.items, ...dependency.added]),
    ].filter(
      (item) =>
        !a.items.includes(item) &&
        !charges.some(
          (r: any) => r.status === "待付款" && r.items.includes(item),
        ),
    );
    if (
      !items.length ||
      items.some(
        (item) =>
          !getOrderRules(state).some(
            (r) => r.item === item && r.enabled !== false,
          ) || !itemAvailableAtCampus(state, item, a.campus),
      ) ||
      getOrderingIssues(state, a.patientId, [...a.items, ...items]).length
    )
      return state;
    const pricing = items.map((item) => ({
      item,
      amount: getOrderRules(state).find((r) => r.item === item)?.price ?? 80,
    }));
    if (pricing.some((r) => !Number.isFinite(r.amount) || r.amount < 0))
      return state;
    return recordClinical(
      state,
      a,
      {
        examAdditions: [
          ...charges,
          {
            id: p.requestId,
            items,
            pricing,
            amount: pricing.reduce((n, r) => n + r.amount, 0),
            status: "待付款",
            at: new Date().toISOString(),
          },
        ],
      },
      action,
      "登记检中加项差额，未付款不进入检查项",
    );
  }
  const charge = charges.find(
    (r: any) => r.id === p.chargeId && r.status === "待付款",
  );
  if (!charge) return state;
  if (action.type === "IN_EXAM_ADD_CANCEL")
    return recordClinical(
      state,
      a,
      {
        examAdditions: charges.map((r: any) =>
          r.id === charge.id ? { ...r, status: "已取消" } : r,
        ),
      },
      action,
      "取消未支付加项",
    );
  if (
    charge.items.some(
      (item: string) => !itemAvailableAtCampus(state, item, a.campus),
    ) ||
    getOrderingIssues(state, a.patientId, [...a.items, ...charge.items]).length
  )
    return state;
  const opening = orderPaidAllocations(state, a);
  const allocations = {
    ...opening,
    ...Object.fromEntries(charge.pricing.map((r: any) => [r.item, r.amount])),
  };
  const paymentAt = new Date().toISOString();
  const next = recordClinical(
    state,
    a,
    {
      paymentOpeningAllocations: a.paymentOpeningAllocations || opening,
      paymentAllocations: allocations,
      amountDue: Math.max(
        0,
        a.amount +
          charge.amount -
          Object.values(allocations).reduce(
            (sum: number, n: any) => sum + Number(n),
            0,
          ),
      ),
      paidAmount: (a.paidAmount ?? a.amount) + charge.amount,
      items: [...new Set([...a.items, ...charge.items])],
      amount: Math.round((a.amount + charge.amount) * 100) / 100,
      pricing: [...orderPricingLines(state, a), ...charge.pricing],
      examAdditions: charges.map((r: any) =>
        r.id === charge.id
          ? { ...r, status: "已支付", paidAt: new Date().toISOString() }
          : r,
      ),
    },
    action,
    "模拟支付检中加项差额并开放新增检查",
  );
  return {
    ...next,
    records: {
      ...next.records,
      orderTransactions: [
        ...(next.records.orderTransactions || []),
        {
          id: `PAY-${charge.id}`,
          appointmentId: a.id,
          patientId: a.patientId,
          channel: p.channel || "演示现金",
          mode: "items",
          lines: charge.pricing.map((r: any) => ({
            item: r.item,
            charge: r.amount,
            refund: 0,
          })),
          grossCharge: charge.amount,
          grossRefund: 0,
          net: charge.amount,
          at: paymentAt,
          actor: clinicalActor(state),
          reason: "检中加项差额支付",
          simulated: true,
        },
      ],
      paymentTransactions: [
        ...(next.records.paymentTransactions || []),
        {
          id: `PAY-${charge.id}`,
          appointmentId: a.id,
          patientId: a.patientId,
          amount: charge.amount,
          channel: p.channel || "演示现金",
          status: "模拟已支付",
          at: new Date().toISOString(),
        },
      ],
    },
  };
}

export function reviewDoctorEligible(
  state: DemoState,
  a: Appointment,
  doctor: string,
) {
  const rules = state.records.reviewDoctorLevels || [];
  if (!rules.length) return true;
  const rule = rules.find((r) => r.name === doctor && r.enabled !== false);
  const difficulty = Number(a.reviewDifficulty || 1);
  return (
    !!rule &&
    Number(rule.minDifficulty) <= difficulty &&
    Number(rule.maxDifficulty) >= difficulty
  );
}
export function clinicalExample(state: DemoState, item: string) {
  const r = clinicalRules(state).find((r) => r.item === item);
  if (r?.kind === "number") {
    if (
      item === "空腹血糖" &&
      !validateClinicalResults(state, [item], { [item]: "5.8" }).length &&
      !clinicalAbnormalities(state, { [item]: "5.8" }).length
    )
      return "5.8";
    const low = r.abnormalMin ?? r.min ?? 0,
      high = r.abnormalMax ?? r.max ?? low;
    return String(Math.round(((low + high) / 2) * 1000) / 1000);
  }
  return (
    r?.allowedWords
      ?.split(/[、,，\n]/)
      .map((s) => s.trim())
      .find(Boolean) || (item === "一般检查" ? "128/82" : "正常")
  );
}
