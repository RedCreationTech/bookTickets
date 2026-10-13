import type { Action, Appointment, DemoState } from "./model";
import {
  validateCampusItems,
  validateGroupOrderBooking,
} from "./groupImportRules";
import {
  getOrderRules,
  getOrderingIssues,
  getPackageOptionalBundles,
  packageAvailableAtCampus,
  quoteOrder,
  resolveDependencies,
} from "./orderingRules";
import {
  getBookingAvailability,
  groupAppointmentCompany,
} from "./bookingRules";

// Pure guarded local transitions. model imports here are type-only; no React/store dependency.
export type Row = Record<string, any>;
export type BatchOrderOperation = "add" | "remove" | "replace" | "swap";
export interface BatchOrderDraft {
  operation: BatchOrderOperation;
  appointmentIds: string[];
  items: string[];
  packageId?: string;
  removeItems?: string[];
  reason: string;
}
export interface BatchOrderRow {
  appointmentId: string;
  patient: string;
  eligible: boolean;
  errors: string[];
  beforeAmount: number;
  afterAmount: number;
  beforeItems: string[];
  afterItems: string[];
  added: string[];
  removed: string[];
  patch?: Row;
  unchanged: boolean;
}
export interface BatchOrderPlan extends BatchOrderDraft {
  id: string;
  expected: Record<string, string>;
  catalogSignature: string;
}
export interface DiscountRequest {
  id: string;
  appointmentId: string;
  patientId: string;
  percent: number;
  reason: string;
  expected: string;
  catalogSignature: string;
  quote: ReturnType<typeof quoteOrder>;
  status:
    "pending" | "approved" | "rejected" | "consumed" | "withdrawn" | "stale";
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  consumedAt?: string;
}
export const list = (state: DemoState, key: string): Row[] =>
  state.records[key] || [];
const allowedStates = ["admin", "reception", "finance"];
export const labelFor: Record<BatchOrderOperation, string> = {
  add: "批量增加项目",
  remove: "批量删减项目",
  replace: "批量更换套餐",
  swap: "团检套餐内换项",
};
const operationIds = new Set([
  "BATCH_ORDER_APPLY",
  "DISCOUNT_REQUEST",
  "DISCOUNT_DECIDE",
  "DISCOUNT_CONSUME",
  "DISCOUNT_WITHDRAW",
  "DISCOUNT_CODE_UNLOCK",
  "DISCOUNT_CODE_APPLY",
]);
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const roleFor = (state: DemoState) =>
  list(state, "roles").find((role) => role.id === state.config.customRoleId);
export const orderingActor = (state: DemoState) =>
  String(state.config.customRoleId || state.config.role || "unknown");
const orderType = (state: DemoState, a: Appointment) =>
  a.orderType ||
  (state.patients.find((p) => p.id === a.patientId)?.company === "个检"
    ? "个检"
    : "团检");
function inScope(state: DemoState, a: Appointment): boolean {
  const role = roleFor(state);
  return (
    !state.config.customRoleId ||
    (!!role &&
      (!role.allowedPatientIds?.length ||
        role.allowedPatientIds.includes(a.patientId)) &&
      (!role.allowedCampus || role.allowedCampus === a.campus) &&
      (!role.examTypes?.length || role.examTypes.includes(orderType(state, a))))
  );
}
export function canEditOrders(state: DemoState): boolean {
  const role = roleFor(state);
  return state.config.customRoleId
    ? !!role &&
        (role.permissions || []).some((p: string) =>
          ["维护预约", "订单处理"].includes(p),
        )
    : allowedStates.includes(state.config.role);
}
export function canApproveDiscount(state: DemoState): boolean {
  const role = roleFor(state);
  return state.config.customRoleId
    ? !!role &&
        ["订单处理", "系统配置"].every((permission) =>
          role.permissions?.includes(permission),
        )
    : ["admin", "finance"].includes(state.config.role);
}
export function appointmentFingerprint(appointment: Appointment): string {
  return JSON.stringify(appointment);
}
export function pricingCatalogSignature(state: DemoState): string {
  return JSON.stringify({
    packages: state.packages,
    orderingRules: getOrderRules(state),
    packageRules: list(state, "packageRules"),
    groupOrders: list(state, "groupOrders"),
    groupPersonnelGroups: list(state, "groupPersonnelGroups"),
    bookingResourceLimits: list(state, "bookingResourceLimits"),
    groupOrderBookingRules: list(state, "groupOrderBookingRules"),
  });
}
export function orderEditPolicy(state: DemoState, a?: Appointment): string[] {
  if (!a) return ["预约单不存在或已移除"];
  if (!inScope(state, a)) return ["当前角色无此订单的数据权限"];
  const errors: string[] = [];
  if (!canEditOrders(state)) errors.push("当前角色没有订单编辑权限");
  if (a.locked) errors.push("订单已锁定，批量操作不会解锁");
  if (a.status !== "booked")
    errors.push(
      a.status === "paid"
        ? "已付款，须走费用调整流程；本批次跳过"
        : ["checked", "in_exam", "review", "approved", "printed"].includes(
              a.status,
            )
          ? "已经到检或进入检查/报告流程，本批次跳过"
          : "订单已取消，本批次跳过",
    );
  if (a.paidAt || a.paymentMethod || Number(a.paidAmount || 0) > 0)
    errors.push("存在已收款凭据，禁止直接改动应收金额");
  if (
    Object.values(a.results || {}).some((value) =>
      String(value ?? "").trim(),
    ) ||
    a.checkedAt ||
    (a.reviewStage || 0) > 0
  )
    errors.push("已有检查记录或审核进度，禁止覆盖项目和计费");
  return errors;
}
function groupForOrder(state: DemoState, a: Appointment): Row | undefined {
  const patient = state.patients.find((p) => p.id === a.patientId);
  const group = list(state, "groupOrders").find(
    (g) =>
      (a.groupOrderId
        ? g.id === a.groupOrderId
        : g.company === patient?.company) &&
      g.status === "生效" &&
      (!g.startDate || g.startDate <= a.date) &&
      (!g.endDate || g.endDate >= a.date) &&
      (!g.members?.length || g.members.includes(a.patientId)),
  );
  if (!group) return undefined;
  const subgroup = list(state, "groupPersonnelGroups").find(
    (g) => g.groupOrderId === group.id && g.members?.includes(a.patientId),
  );
  return subgroup
    ? {
        ...group,
        packages: [subgroup.packageId],
        packageChooseCount: 1,
        optionalItems: subgroup.optionalItems || group.optionalItems,
        choose: subgroup.choose ?? group.choose,
      }
    : group;
}
export function discountFloorPercent(
  state: DemoState,
  a?: Appointment,
): number {
  const role = roleFor(state),
    value = Number(role?.minDiscount ?? state.config.discountMin ?? 0.8) * 100;
  const group = a && groupForOrder(state, a),
    agreement = Number(group?.discount ?? 100);
  return Math.min(
    Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 80,
    Number.isFinite(agreement) ? Math.min(100, Math.max(0, agreement)) : 100,
  );
}
function contractSplit(
  group: Row | undefined,
  pricing: { item: string; amount: number }[],
) {
  const total = pricing.reduce((n, p) => n + p.amount, 0);
  const unitItems = group
    ? pricing
        .filter((row) => !group.personalItems?.includes(row.item))
        .reduce((n, row) => n + row.amount, 0)
    : 0;
  const unit = !group
    ? 0
    : group.mode === "无限额"
      ? unitItems
      : Math.min(unitItems, Math.max(0, Number(group.budget) || 0));
  return {
    unit: Math.round(unit * 100) / 100,
    personal: Math.round((total - unit) * 100) / 100,
  };
}
export function prepareOrder(
  state: DemoState,
  a: Appointment,
  draft?: Pick<
    BatchOrderDraft,
    "operation" | "items" | "packageId" | "removeItems"
  >,
  percentOverride?: number,
) {
  const errors = orderEditPolicy(state, a);
  const group = groupForOrder(state, a);
  const packageIds =
    draft?.operation === "replace"
      ? [String(draft.packageId || "")]
      : [
          ...new Set<string>(
            a.packageIds?.length ? a.packageIds : [a.packageId],
          ),
        ];
  if (!state.patients.some((p) => p.id === a.patientId))
    errors.push("体检人档案不存在");
  if (
    packageIds.some(
      (id) =>
        !id || !state.packages.some((p) => p.id === id && p.enabled !== false),
    )
  )
    errors.push("所选套餐不存在或已停用");
  if (packageIds.some((id) => !packageAvailableAtCampus(state, id, a.campus)))
    errors.push("所选套餐不适用当前院区");
  if ((a.groupOrderId || Number(a.groupSplit?.unit || 0) > 0) && !group)
    errors.push("团检约定缺失或已失效，不能自动调整单位分摊");
  const base = quoteOrder(state, packageIds, 100);
  let items = draft?.operation === "replace" ? base.items : [...a.items];
  const knownItems = new Set([
    ...state.packages.flatMap((p) => p.items),
    ...getOrderRules(state).map((r) => r.item),
  ]);
  if (
    draft &&
    draft.operation !== "replace" &&
    (!draft.items.length || draft.items.some((item) => !knownItems.has(item)))
  )
    errors.push("请选择有效的批量项目");
  if (draft?.operation === "add")
    items = [...new Set([...items, ...draft.items])];
  if (draft?.operation === "remove")
    items = items.filter((item) => !draft.items.includes(item));
  if (draft?.operation === "swap") {
    if (
      !draft.removeItems?.length ||
      draft.removeItems.some((item) => !a.items.includes(item))
    )
      errors.push("请选择当前套餐内需要换出的项目");
    if (
      getOrderRules(state).some(
        (rule) =>
          rule.required &&
          rule.enabled !== false &&
          draft.removeItems?.includes(rule.item),
      )
    )
      errors.push("必检项目不能换出");
    items = [
      ...new Set([
        ...items.filter((item) => !draft.removeItems?.includes(item)),
        ...draft.items,
      ]),
    ];
  }
  if (draft && draft.operation !== "remove") {
    const dependencies = resolveDependencies(state, items);
    errors.push(...dependencies.errors);
    items = dependencies.items;
  }
  if (!items.length) errors.push("订单至少须保留一个有效项目");
  if (
    draft?.operation === "swap" &&
    draft.removeItems?.some((item) => items.includes(item))
  )
    errors.push("换出项目仍被依赖规则要求，无法完成本次换项");
  errors.push(...validateCampusItems(state, items, a.campus));
  if (a.groupOrderId)
    errors.push(
      ...validateGroupOrderBooking(state, a.groupOrderId, {
        patientId: a.patientId,
        date: a.date,
        time: a.time,
        ignoreAppointmentId: a.id,
        packageIds,
        items,
      }),
    );
  if (
    draft &&
    state.config.allowAdd === false &&
    items.some((item) => !a.items.includes(item))
  )
    errors.push("当前配置禁止增加项目");
  if (
    draft &&
    state.config.allowRemove === false &&
    a.items.some((item) => !items.includes(item))
  )
    errors.push("当前配置禁止减少项目");
  const extras = items.filter((item) => !base.items.includes(item));
  const excluded = base.items.filter((item) => !items.includes(item));
  const percent =
    percentOverride ?? Number(a.appliedDiscount ?? group?.discount ?? 100);
  const lineDiscounts: Record<string, number> =
    percentOverride === undefined
      ? Object.fromEntries(
          (a.pricing || [])
            .filter((row: Row) => items.includes(row.item))
            .map((row: Row) => [row.item, Number(row.percent ?? percent)]),
        )
      : {};
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    errors.push("折扣须为 0–100 的有效数值");
  const quote = quoteOrder(
    state,
    packageIds,
    percent,
    lineDiscounts,
    extras,
    excluded,
  );
  if (
    !Number.isFinite(quote.amount) ||
    quote.amount < 0 ||
    quote.rows.some(
      (row) =>
        !Number.isFinite(row.price) ||
        row.price < 0 ||
        !Number.isFinite(row.amount) ||
        row.amount < 0 ||
        !Number.isFinite(row.percent),
    )
  )
    errors.push("项目报价包含无效金额或折扣，请先维护价格规则");
  errors.push(
    ...getOrderingIssues(state, a.patientId, quote.items, packageIds, {
      company: state.patients.find((p) => p.id === a.patientId)?.company,
    }),
  );
  for (const bundle of getPackageOptionalBundles(state, packageIds))
    if (
      quote.items.filter((item) => bundle.items.includes(item)).length !==
      bundle.choose
    )
      errors.push(`${bundle.name}自选包须保留 ${bundle.choose} 项`);
  if (group && !a.outsideGroupPersonalPay) {
    if (packageIds.some((id) => !group.packages?.includes(id)))
      errors.push("套餐不在该团检订单允许范围内");
    if (
      group.packageChooseCount &&
      packageIds.length !== group.packageChooseCount
    )
      errors.push(`团检约定须选择 ${group.packageChooseCount} 套套餐`);
    if (group.mode === "固定套餐" && packageIds.length !== 1)
      errors.push("固定套餐团检仅支持一套套餐");
    if (
      Number(group.choose) > 0 &&
      quote.items.filter((item) => group.optionalItems?.includes(item))
        .length !== Number(group.choose)
    )
      errors.push(`团检自选包须保留 ${group.choose} 项`);
  }
  const company = groupAppointmentCompany(state, a);
  const availability = getBookingAvailability(state, a.date, a.id, {
    patientId: a.patientId,
    company: company || undefined,
    kind: company ? "group" : "individual",
    time: a.time,
    checkQuestionnaire: false,
    packageIds,
    items: quote.items,
  });
  if (!availability.allowed) errors.push(`预约规则：${availability.error}`);
  if (
    draft &&
    quote.rows.some(
      (row) => !row.nonDiscount && row.percent < discountFloorPercent(state, a),
    )
  )
    errors.push("调整后的项目折扣超出当前角色权限，请先走折扣审批");
  const patch = {
    packageId: packageIds[0],
    packageIds,
    items: quote.items,
    amount: quote.amount,
    pricing: quote.rows,
    appliedDiscount: percent,
    selfPay:
      group || a.groupSplit
        ? a.outsideGroupPersonalPay
          ? quote.amount
          : contractSplit(group, quote.rows).personal
        : quote.amount,
    ...(group || a.groupSplit
      ? {
          groupSplit: a.outsideGroupPersonalPay
            ? { unit: 0, personal: quote.amount }
            : contractSplit(group, quote.rows),
        }
      : {}),
  };
  return { errors: [...new Set(errors)], quote, patch };
}
export function previewBatchOrders(
  state: DemoState,
  draft: BatchOrderDraft,
): BatchOrderRow[] {
  return [...new Set(draft.appointmentIds)].map((id) => {
    const a = state.appointments.find((row) => row.id === id);
    const empty = {
      appointmentId: id,
      patient: "不可用订单",
      eligible: false,
      errors: orderEditPolicy(state, a),
      beforeAmount: 0,
      afterAmount: 0,
      beforeItems: [],
      afterItems: [],
      added: [],
      removed: [],
      unchanged: false,
    };
    if (!a || !inScope(state, a)) return empty;
    const prepared = prepareOrder(state, a, draft),
      patch = prepared.patch;
    const unchanged =
      a.packageId === patch.packageId &&
      JSON.stringify(a.items) === JSON.stringify(patch.items) &&
      a.amount === patch.amount;
    return {
      appointmentId: id,
      patient:
        state.patients.find((p) => p.id === a.patientId)?.name || a.patientId,
      eligible: !prepared.errors.length,
      errors: prepared.errors,
      beforeAmount: a.amount,
      afterAmount: patch.amount,
      beforeItems: a.items,
      afterItems: patch.items,
      added: patch.items.filter((item: string) => !a.items.includes(item)),
      removed: a.items.filter((item) => !patch.items.includes(item)),
      patch,
      unchanged,
    };
  });
}
export function createBatchOrderPlan(
  state: DemoState,
  draft: BatchOrderDraft,
  id = uid("BATCH"),
): BatchOrderPlan {
  return {
    ...draft,
    id,
    appointmentIds: [...new Set(draft.appointmentIds)],
    items: [...new Set(draft.items)],
    expected: Object.fromEntries(
      draft.appointmentIds.map((id) => [
        id,
        state.appointments.find((a) => a.id === id)
          ? appointmentFingerprint(state.appointments.find((a) => a.id === id)!)
          : "missing",
      ]),
    ),
    catalogSignature: pricingCatalogSignature(state),
  };
}
function auditEntry(
  state: DemoState,
  id: string,
  action: string,
  entity: string,
  message: string,
  before: unknown,
  after: unknown,
  extra: Row = {},
) {
  return {
    id,
    time: new Date().toISOString(),
    actor: orderingActor(state),
    action,
    entity,
    message,
    before: before ? clone(before) : null,
    after: after ? clone(after) : null,
    ...extra,
  };
}
function writeRecord(
  state: DemoState,
  key: string,
  row: Row,
  event: Row,
): DemoState {
  return {
    ...state,
    records: {
      ...state.records,
      [key]: [row, ...list(state, key).filter((r) => r.id !== row.id)],
    },
    audit: [event, ...state.audit].slice(0, 1000),
  };
}
function invalidatedApproval(
  state: DemoState,
  request: DiscountRequest,
  reason: string,
): DemoState {
  const next = {
    ...request,
    status: "stale",
    decisionReason: reason,
    invalidatedAt: new Date().toISOString(),
  };
  return writeRecord(
    state,
    "discountApprovals",
    next,
    auditEntry(
      state,
      `DISCOUNT-STALE-${request.id}`,
      "DISCOUNT_INVALIDATED",
      request.appointmentId,
      `折扣授权失效：${reason}`,
      request,
      next,
      { requestId: request.id, outcome: "stale" },
    ),
  );
}
export function discountRequestErrors(
  state: DemoState,
  appointmentId: string,
  percent: number,
  reason: string,
): string[] {
  const a = state.appointments.find((row) => row.id === appointmentId);
  if (!a) return ["请先保存并选择一个未付款预约单"];
  const errors = prepareOrder(state, a, undefined, percent).errors;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    errors.push("申请折扣须为 0–100");
  if (percent >= discountFloorPercent(state, a))
    errors.push("申请折扣未超权限；本入口仅处理超权限审批");
  if (!reason.trim()) errors.push("请填写超权限折扣申请原因");
  if (
    list(state, "discountApprovals").some(
      (row) =>
        row.appointmentId === appointmentId &&
        ["pending", "approved"].includes(row.status),
    )
  )
    errors.push("该订单已有待审核或待消费申请，请先处理或撤回原申请");
  return [...new Set(errors)];
}

/** Pure, atomic local guard. Unsupported actions return undefined; rejected/replayed actions return the unchanged state. */
export function reduceBatchOrderingAction(
  state: DemoState,
  action: Action,
): DemoState | undefined {
  if (!operationIds.has(action.type)) return undefined;
  const p = action.payload || {},
    now = new Date().toISOString();
  if (!p.id || typeof p.id !== "string" || p.id.length > 180) return state;
  if (action.type === "BATCH_ORDER_APPLY") {
    const plan = p as BatchOrderPlan;
    if (
      list(state, "orderBatches").some((row) => row.id === p.id) ||
      !["add", "remove", "replace", "swap"].includes(plan.operation) ||
      !Array.isArray(plan.appointmentIds) ||
      !plan.appointmentIds.length ||
      plan.appointmentIds.length > 200 ||
      !Array.isArray(plan.items) ||
      !plan.reason?.trim() ||
      !plan.expected ||
      !canEditOrders(state)
    )
      return state;
    const preview = previewBatchOrders(state, plan),
      catalogStale = plan.catalogSignature !== pricingCatalogSignature(state);
    let working = state;
    const results = preview.map((initialRow) => {
      const row = previewBatchOrders(working, {
        ...plan,
        appointmentIds: [initialRow.appointmentId],
      })[0];
      const a = state.appointments.find(
        (entry) => entry.id === row.appointmentId,
      );
      const errors = [
        ...row.errors,
        ...(catalogStale
          ? ["预览后项目价格或套餐规则发生变化，请重新预览"]
          : []),
        ...(a && plan.expected[a.id] !== appointmentFingerprint(a)
          ? ["订单在预览后已变化，请重新预览"]
          : []),
      ];
      const result = {
        ...row,
        status: errors.length
          ? "failed"
          : row.unchanged
            ? "unchanged"
            : "success",
        errors,
        before: a && inScope(state, a) ? clone(a) : null,
        after:
          !errors.length && !row.unchanged && a
            ? { ...a, ...row.patch, lastBatchId: plan.id }
            : a && inScope(state, a)
              ? clone(a)
              : null,
      };
      if (result.status === "success" && result.after)
        working = {
          ...working,
          appointments: working.appointments.map((order) =>
            order.id === result.appointmentId ? result.after! : order,
          ),
        };
      return result;
    });
    const nextOrders = state.appointments.map(
      (a) =>
        results.find((r) => r.appointmentId === a.id && r.status === "success")
          ?.after || a,
    );
    const batch = {
      id: plan.id,
      operation: plan.operation,
      reason: plan.reason.trim(),
      appointmentIds: plan.appointmentIds,
      items: plan.items,
      removeItems: plan.removeItems || [],
      packageId: plan.packageId || "",
      actor: orderingActor(state),
      at: now,
      results,
      success: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      unchanged: results.filter((r) => r.status === "unchanged").length,
    };
    const events = results.map((row) =>
      auditEntry(
        state,
        `${plan.id}-${row.appointmentId}`,
        "BATCH_ORDER_ITEM",
        row.appointmentId,
        `${labelFor[plan.operation]}：${row.status === "success" ? "成功" : row.status === "unchanged" ? "无变化" : row.errors.join("；")}`,
        row.before,
        row.after,
        {
          batchId: plan.id,
          operation: plan.operation,
          outcome: row.status,
          reason: plan.reason,
          errors: row.errors,
        },
      ),
    );
    return {
      ...state,
      appointments: nextOrders,
      records: {
        ...state.records,
        orderBatches: [batch, ...list(state, "orderBatches")],
      },
      audit: [...events, ...state.audit].slice(0, 1000),
    };
  }
  if (action.type === "DISCOUNT_CODE_UNLOCK") {
    const a = state.appointments.find((row) => row.id === p.appointmentId),
      profile = DEMO_DISCOUNT_CODES.find((row) => row.code === p.code);
    if (
      !a ||
      !profile ||
      orderEditPolicy(state, a).length ||
      p.expected !== appointmentFingerprint(a) ||
      list(state, "discountCodeAuthorizations").some((r) => r.id === p.id)
    )
      return state;
    const auth = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      actor: orderingActor(state),
      minPercent: profile.minPercent,
      expected: p.expected,
      catalogSignature: pricingCatalogSignature(state),
      status: "active",
      createdAt: now,
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    };
    return writeRecord(
      state,
      "discountCodeAuthorizations",
      auth,
      auditEntry(
        state,
        `CODE-${p.id}`,
        action.type,
        a.id,
        `激活本订单演示折扣权限，下限 ${profile.minPercent}%`,
        null,
        auth,
      ),
    );
  }
  if (action.type === "DISCOUNT_CODE_APPLY") {
    const auth = list(state, "discountCodeAuthorizations").find(
        (r) => r.id === p.id,
      ),
      a = state.appointments.find((row) => row.id === auth?.appointmentId);
    if (
      !auth ||
      !a ||
      auth.status !== "active" ||
      auth.actor !== orderingActor(state) ||
      p.appointmentId !== a.id ||
      auth.expected !== appointmentFingerprint(a) ||
      auth.catalogSignature !== pricingCatalogSignature(state) ||
      auth.expiresAt < now ||
      typeof p.percent !== "number" ||
      p.percent < auth.minPercent ||
      p.percent > 100
    )
      return state;
    const prepared = prepareOrder(state, a, undefined, p.percent);
    if (prepared.errors.length) return state;
    const order = {
      ...a,
      amount: prepared.quote.amount,
      selfPay: prepared.patch.selfPay,
      pricing: prepared.quote.rows,
      appliedDiscount: p.percent,
      lastDiscountCodeId: auth.id,
      ...(prepared.patch.groupSplit
        ? { groupSplit: prepared.patch.groupSplit }
        : {}),
    };
    const next = {
      ...auth,
      status: "consumed",
      consumedAt: now,
      percent: p.percent,
    };
    const saved = writeRecord(
      state,
      "discountCodeAuthorizations",
      next,
      auditEntry(
        state,
        `CODE-APPLY-${p.id}`,
        action.type,
        a.id,
        "一次性应用演示折扣口令权限",
        a,
        order,
      ),
    );
    return {
      ...saved,
      appointments: state.appointments.map((row) =>
        row.id === a.id ? order : row,
      ),
    };
  }
  if (action.type === "DISCOUNT_REQUEST") {
    if (
      list(state, "discountApprovals").some((r) => r.id === p.id) ||
      typeof p.appointmentId !== "string" ||
      typeof p.percent !== "number" ||
      typeof p.reason !== "string"
    )
      return state;
    const a = state.appointments.find((row) => row.id === p.appointmentId);
    if (
      !a ||
      p.expected !== appointmentFingerprint(a) ||
      p.catalogSignature !== pricingCatalogSignature(state) ||
      discountRequestErrors(state, a.id, p.percent, p.reason).length
    )
      return state;
    const quote = prepareOrder(state, a, undefined, p.percent).quote;
    const request: DiscountRequest = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      percent: p.percent,
      reason: p.reason.trim(),
      expected: p.expected,
      catalogSignature: p.catalogSignature,
      quote,
      status: "pending",
      requestedBy: orderingActor(state),
      requestedAt: now,
    };
    return writeRecord(
      state,
      "discountApprovals",
      request,
      auditEntry(
        state,
        `REQUEST-${p.id}`,
        action.type,
        a.id,
        `申请超权限折扣 ${p.percent}%`,
        null,
        request,
        { requestId: p.id, outcome: "pending" },
      ),
    );
  }
  const request = list(state, "discountApprovals").find(
    (r) => r.id === p.id,
  ) as DiscountRequest | undefined;
  if (!request) return state;
  const a = state.appointments.find((row) => row.id === request.appointmentId);
  if (!a || !inScope(state, a)) return state;
  if (action.type === "DISCOUNT_WITHDRAW") {
    if (
      !["pending", "approved"].includes(request.status) ||
      orderingActor(state) !== request.requestedBy ||
      typeof p.reason !== "string" ||
      !p.reason.trim()
    )
      return state;
    const next = {
      ...request,
      status: "withdrawn",
      decisionReason: p.reason.trim(),
      withdrawnAt: now,
    };
    return writeRecord(
      state,
      "discountApprovals",
      next,
      auditEntry(
        state,
        `WITHDRAW-${p.id}`,
        action.type,
        a.id,
        "撤回折扣申请",
        request,
        next,
        { requestId: p.id, outcome: "withdrawn" },
      ),
    );
  }
  if (action.type === "DISCOUNT_DECIDE") {
    if (
      request.status !== "pending" ||
      !canApproveDiscount(state) ||
      orderingActor(state) === request.requestedBy ||
      !["approved", "rejected"].includes(p.decision) ||
      typeof p.reason !== "string" ||
      !p.reason.trim()
    )
      return state;
    if (
      p.decision === "approved" &&
      (request.expected !== appointmentFingerprint(a) ||
        request.catalogSignature !== pricingCatalogSignature(state) ||
        orderEditPolicy(state, a).length)
    )
      return invalidatedApproval(
        state,
        request,
        "订单状态或报价范围已改变，需重新申请",
      );
    const next = {
      ...request,
      status: p.decision,
      decidedBy: orderingActor(state),
      decidedAt: now,
      decisionReason: p.reason.trim(),
    };
    return writeRecord(
      state,
      "discountApprovals",
      next,
      auditEntry(
        state,
        `DECISION-${p.id}`,
        action.type,
        a.id,
        `${p.decision === "approved" ? "批准" : "驳回"}折扣申请：${p.reason.trim()}`,
        request,
        next,
        { requestId: p.id, outcome: p.decision },
      ),
    );
  }
  if (action.type === "DISCOUNT_CONSUME") {
    if (
      request.status !== "approved" ||
      p.appointmentId !== request.appointmentId ||
      !canEditOrders(state) ||
      (orderingActor(state) !== request.requestedBy &&
        !canApproveDiscount(state))
    )
      return state;
    const prepared = prepareOrder(state, a, undefined, request.percent);
    if (
      request.expected !== appointmentFingerprint(a) ||
      request.catalogSignature !== pricingCatalogSignature(state) ||
      prepared.errors.length ||
      JSON.stringify(request.quote) !== JSON.stringify(prepared.quote)
    )
      return invalidatedApproval(
        state,
        request,
        "订单或规则已变化；旧授权不能用于新的金额或项目",
      );
    const order = {
      ...a,
      amount: prepared.quote.amount,
      selfPay: prepared.patch.selfPay,
      pricing: prepared.quote.rows,
      appliedDiscount: request.percent,
      lastDiscountApprovalId: request.id,
      ...(prepared.patch.groupSplit
        ? { groupSplit: prepared.patch.groupSplit }
        : {}),
    };
    const next = {
      ...request,
      status: "consumed",
      consumedAt: now,
      consumedBy: orderingActor(state),
    };
    const withRecord = writeRecord(
      state,
      "discountApprovals",
      next,
      auditEntry(
        state,
        `CONSUME-${p.id}`,
        action.type,
        a.id,
        `一次性应用已批准折扣 ${request.percent}%`,
        a,
        order,
        { requestId: p.id, outcome: "consumed", approval: clone(request) },
      ),
    );
    return {
      ...withRecord,
      appointments: state.appointments.map((row) =>
        row.id === a.id ? order : row,
      ),
    };
  }
  return state;
}

export const DEMO_DISCOUNT_CODES = [
  { code: "DEMO-DISCOUNT-85", minPercent: 85 },
  { code: "DEMO-DISCOUNT-60", minPercent: 60 },
];
