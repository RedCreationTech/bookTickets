import type { Action, Appointment, DemoState } from "./model";
import { quoteOrder, getOrderingIssues, getOrderRules } from "./orderingRules";
import {
  getBookingAvailability,
  groupAppointmentCompany,
} from "./bookingRules";
import { validateCampusItems } from "./groupImportRules";
import {
  appointmentFingerprint,
  orderingActor,
  pricingCatalogSignature,
} from "./batchOrderingRules";
export const PAYMENT_CHANNELS = ["现金", "银联", "微信", "支付宝"];
export const DEMO_CARD_CODE = "246810";
export type PaymentMode =
  "full_charge" | "full_refund" | "items" | "offset" | "refund_recharge";
type Row = Record<string, any>;
const list = (s: DemoState, key: string): Row[] => s.records[key] || [];
const money = (n: number) => Math.round(n * 100) / 100;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function canProcessFinance(s: DemoState) {
  const role = list(s, "roles").find((r) => r.id === s.config.customRoleId);
  return s.config.customRoleId
    ? !!role &&
        role.permissions?.includes("订单处理") &&
        role.permissions?.includes("财务查询")
    : ["admin", "finance", "reception"].includes(s.config.role);
}
function scoped(s: DemoState, a: Appointment) {
  const role = list(s, "roles").find((r) => r.id === s.config.customRoleId);
  return (
    !s.config.customRoleId ||
    (!!role &&
      (!role.allowedPatientIds?.length ||
        role.allowedPatientIds.includes(a.patientId)) &&
      (!role.allowedCampus || role.allowedCampus === a.campus) &&
      (!role.examTypes?.length ||
        role.examTypes.includes(
          a.orderType ||
            (s.patients.find((p) => p.id === a.patientId)?.company === "个检"
              ? "个检"
              : "团检"),
        )))
  );
}
function append(s: DemoState, collection: string, record: Row) {
  return {
    ...s,
    records: {
      ...s.records,
      [collection]: [
        record,
        ...list(s, collection).filter((r) => r.id !== record.id),
      ],
    },
  };
}
function audit(
  s: DemoState,
  id: string,
  action: string,
  entity: string,
  message: string,
  before: unknown,
  after: unknown,
  more: Row = {},
): DemoState {
  return {
    ...s,
    audit: [
      {
        id,
        time: new Date().toISOString(),
        actor: orderingActor(s),
        action,
        entity,
        message,
        before: before ? copy(before) : null,
        after: after ? copy(after) : null,
        ...more,
      },
      ...s.audit,
    ].slice(0, 1000),
  };
}
export function orderPricingLines(
  s: DemoState,
  a: Appointment,
): {
  item: string;
  amount: number;
  price: number;
  percent: number;
  nonDiscount: boolean;
}[] {
  if (
    Array.isArray(a.pricing) &&
    a.pricing.length &&
    a.pricing.every(
      (r: Row) =>
        typeof r.item === "string" &&
        Number.isFinite(r.amount) &&
        r.amount >= 0,
    )
  )
    return a.pricing.map((r: Row) => ({
      item: String(r.item),
      amount: Number(r.amount),
      price: Number(r.price ?? r.amount),
      percent: Number(r.percent ?? 100),
      nonDiscount: !!r.nonDiscount,
    }));
  const packageIds = a.packageIds?.length ? a.packageIds : [a.packageId],
    base = quoteOrder(s, packageIds, a.appliedDiscount ?? 100);
  const all = [...new Set([...a.items, ...(a.waived || [])])],
    extras = all.filter((item) => !base.items.includes(item)),
    excluded = base.items.filter((item) => !all.includes(item));
  const quote = quoteOrder(
    s,
    packageIds,
    a.appliedDiscount ?? 100,
    {},
    extras,
    excluded,
  );
  if (!quote.rows.length) return [];
  // The only available legacy evidence is the saved order total. Allocate cents deterministically and label this in the UI.
  const total = Math.round(a.amount * 100),
    weights = quote.rows.map((r) => r.amount),
    sum = weights.reduce((n, v) => n + v, 0);
  const cents = weights.map((value) =>
    Math.floor(total * (sum ? value / sum : 1 / weights.length)),
  );
  for (
    let remaining = total - cents.reduce((n, v) => n + v, 0), i = 0;
    remaining > 0;
    remaining--, i++
  )
    cents[i % cents.length]++;
  return quote.rows.map((r, i) => ({ ...r, amount: cents[i] / 100 }));
}
export function orderPaidAllocations(
  s: DemoState,
  a: Appointment,
): Record<string, number> {
  if (a.paymentAllocations && typeof a.paymentAllocations === "object")
    return { ...a.paymentAllocations };
  const lines = orderPricingLines(s, a),
    paid =
      a.paidAmount !== undefined
        ? Math.max(0, Number(a.paidAmount))
        : [
              "paid",
              "checked",
              "in_exam",
              "review",
              "approved",
              "printed",
            ].includes(a.status)
          ? a.amount
          : 0;
  let left = Math.round(paid * 100);
  const result: Record<string, number> = {};
  for (const line of lines) {
    const cents = Math.min(left, Math.round(line.amount * 100));
    result[line.item] = cents / 100;
    left -= cents;
  }
  return result;
}
export interface PaymentDraft {
  id?: string;
  appointmentId: string;
  mode: PaymentMode;
  channel: string;
  chargeItems: string[];
  refundItems: string[];
  extraItems?: string[];
  reason: string;
}
export function previewOrderPayment(s: DemoState, draft: PaymentDraft) {
  const a = s.appointments.find((row) => row.id === draft.appointmentId),
    errors: string[] = [];
  if (!a)
    return {
      errors: ["订单不存在"],
      lines: [] as Row[],
      grossCharge: 0,
      grossRefund: 0,
      net: 0,
      amount: 0,
      paidAfter: 0,
      allocations: {} as Record<string, number>,
      pricing: [] as Row[],
      items: [] as string[],
    };
  if (!canProcessFinance(s) || !scoped(s, a))
    errors.push("当前角色没有该订单财务操作权限");
  if (a.status === "cancelled")
    errors.push("已取消订单请在退款专门审核流程处理，本演示不改写取消单");
  if (!PAYMENT_CHANNELS.includes(draft.channel))
    errors.push("请选择现金、银联、微信或支付宝模拟渠道");
  if (!draft.reason?.trim()) errors.push("请填写本次模拟收退费说明");
  let pricing = orderPricingLines(s, a),
    items = [...a.items];
  const extras = [...new Set(draft.extraItems || [])].filter(
    (item) => !items.includes(item),
  );
  if (extras.length) {
    if (
      a.locked ||
      !["booked", "paid"].includes(a.status) ||
      Object.values(a.results).some((v) => String(v).trim())
    )
      errors.push("已锁定或已检查订单不得借收费追加项目");
    if (s.config.allowAdd === false) errors.push("当前配置禁止追加项目");
    const known = new Set([
      ...s.packages.flatMap((p) => p.items),
      ...getOrderRules(s).map((r) => r.item),
    ]);
    if (extras.some((item) => !known.has(item))) errors.push("追加项目不存在");
    items = [...new Set([...items, ...extras])];
    const ids = a.packageIds?.length ? a.packageIds : [a.packageId],
      base = quoteOrder(s, ids, a.appliedDiscount ?? 100);
    const q = quoteOrder(
      s,
      ids,
      a.appliedDiscount ?? 100,
      Object.fromEntries(pricing.map((r) => [r.item, r.percent])),
      items.filter((item) => !base.items.includes(item)),
      base.items.filter((item) => !items.includes(item)),
    );
    pricing = [...pricing, ...q.rows.filter((r) => extras.includes(r.item))];
    errors.push(
      ...getOrderingIssues(s, a.patientId, items, ids),
      ...validateCampusItems(s, items, a.campus),
    );
    const company = groupAppointmentCompany(s, a),
      availability = getBookingAvailability(s, a.date, a.id, {
        patientId: a.patientId,
        company: company || undefined,
        kind: company ? "group" : "individual",
        time: a.time,
        packageIds: ids,
        items,
        checkQuestionnaire: false,
      });
    if (!availability.allowed) errors.push(availability.error);
  }
  const allocations = orderPaidAllocations(s, a),
    old = { ...allocations },
    allItems = pricing.map((r) => r.item);
  if (
    draft.chargeItems.some((item) => !allItems.includes(item)) ||
    draft.refundItems.some((item) => !allItems.includes(item))
  )
    errors.push("收费或退费项目不属于当前订单");
  const charges =
    draft.mode === "full_refund"
      ? []
      : draft.mode === "full_charge" || draft.mode === "refund_recharge"
        ? allItems
        : [...new Set([...draft.chargeItems, ...extras])];
  const refunds =
    draft.mode === "full_charge"
      ? []
      : draft.mode === "full_refund" || draft.mode === "refund_recharge"
        ? allItems
        : [...new Set(draft.refundItems)];
  if (
    ![
      "full_charge",
      "full_refund",
      "items",
      "offset",
      "refund_recharge",
    ].includes(draft.mode)
  )
    errors.push("未知收退费模式");
  const lines = pricing
    .map((r) => {
      const paid = money(old[r.item] || 0),
        refund = refunds.includes(r.item) ? paid : 0;
      const charge = charges.includes(r.item)
        ? money(Math.max(0, r.amount - paid + refund))
        : 0;
      allocations[r.item] = money(paid - refund + charge);
      return {
        item: r.item,
        price: r.amount,
        paidBefore: paid,
        charge,
        refund,
        paidAfter: allocations[r.item],
      };
    })
    .filter((row) => row.charge || row.refund);
  const grossCharge = money(lines.reduce((n, r) => n + r.charge, 0)),
    grossRefund = money(lines.reduce((n, r) => n + r.refund, 0)),
    amount = money(pricing.reduce((n, r) => n + r.amount, 0)),
    paidAfter = money(
      Object.values(allocations).reduce((n, v) => n + Number(v), 0),
    );
  if (!lines.length) errors.push("所选项目没有可收或可退余额，不能重复记账");
  if (
    grossRefund > 0 &&
    (Number(a.unitPaidAmount || 0) > 0 ||
      Number(actualOrderCollections(s, a).unitPaid || 0) > 0)
  )
    errors.push(
      "订单含已分配单位预付款，请先走单位原路冲销核对；本演示禁止直接转现金退款",
    );
  if (draft.mode === "offset" && (!grossCharge || !grossRefund))
    errors.push("收退相抵须同时包含真实待收项目和已收待退项目");
  if (
    ![grossCharge, grossRefund, amount, paidAfter].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    paidAfter > amount + 0.001
  )
    errors.push("账单金额无效或超过订单应收");
  return {
    errors: [...new Set(errors)],
    lines,
    grossCharge,
    grossRefund,
    net: money(grossCharge - grossRefund),
    amount,
    paidAfter,
    allocations,
    pricing,
    items,
  };
}
function paymentOrder(
  a: Appointment,
  preview: ReturnType<typeof previewOrderPayment>,
  at: string,
) {
  const groupSplit = a.groupSplit
    ? {
        unit: Math.min(Number(a.groupSplit.unit || 0), preview.amount),
        personal: money(
          preview.amount -
            Math.min(Number(a.groupSplit.unit || 0), preview.amount),
        ),
      }
    : undefined;
  return {
    ...a,
    items: preview.items,
    pricing: preview.pricing,
    amount: preview.amount,
    selfPay: groupSplit ? groupSplit.personal : preview.amount,
    ...(groupSplit ? { groupSplit } : {}),
    paymentOpeningAllocations:
      a.paymentOpeningAllocations ||
      (a.paymentAllocations ? undefined : undefined),
    paymentAllocations: preview.allocations,
    paidAmount: preview.paidAfter,
    amountDue: money(preview.amount - preview.paidAfter),
    status:
      a.status === "booked" && preview.paidAfter >= preview.amount
        ? "paid"
        : a.status === "paid" && preview.paidAfter < preview.amount
          ? "booked"
          : a.status,
    paidAt: preview.paidAfter >= preview.amount ? a.paidAt || at : a.paidAt,
    lastPaymentAt: at,
  } as Appointment;
}
export function synchronizePackageCardLifecycle(s: DemoState): DemoState {
  let changed = false;
  const cards = list(s, "cards").map((card) => {
    if (
      card.type !== "套餐卡" ||
      !card.appointmentId ||
      card.status === "已失效"
    )
      return card;
    const a = s.appointments.find((a) => a.id === card.appointmentId);
    if (
      a &&
      ["review", "approved", "printed"].includes(a.status) &&
      a.items.length > 0 &&
      a.items.every((item) => String(a.results[item] || "").trim())
    ) {
      changed = true;
      return {
        ...card,
        status: "已失效",
        expiredAt: new Date().toISOString(),
        expiredReason: "关联订单检查完成",
        balance: 0,
      };
    }
    return card;
  });
  return changed ? { ...s, records: { ...s.records, cards } } : s;
}
export type GroupSettlementMode =
  | "contract"
  | "order_details"
  | "checked_orders"
  | "checked_items"
  | "exclude_waived"
  | "exclude_unchecked";
export function previewGroupSettlement(
  s: DemoState,
  groupOrderId: string,
  mode: GroupSettlementMode,
  contractAmount = 0,
  campus: string = s.config.campus || "中心院区",
) {
  const group = list(s, "groupOrders").find((g) => g.id === groupOrderId),
    errors: string[] = [];
  if (!group) errors.push("单位订单不存在");
  if (
    ![
      "contract",
      "order_details",
      "checked_orders",
      "checked_items",
      "exclude_waived",
      "exclude_unchecked",
    ].includes(mode)
  )
    errors.push("未知单位结算口径");
  const orders = s.appointments.filter(
    (a) =>
      a.groupOrderId === groupOrderId &&
      (campus === "all" || a.campus === campus) &&
      a.status !== "cancelled" &&
      scoped(s, a),
  );
  const lines = orders.flatMap((a) =>
    orderPricingLines(s, a).map((row) => {
      const checked = !!String(a.results[row.item] || "").trim(),
        waived = a.waived?.includes(row.item),
        orderChecked =
          ["checked", "in_exam", "review", "approved", "printed"].includes(
            a.status,
          ) || !!a.checkedAt;
      let included =
        !a.outsideGroupPersonalPay &&
        (mode !== "checked_orders" || orderChecked);
      if (mode === "checked_items" || mode === "exclude_unchecked")
        included &&= checked;
      if (mode === "exclude_waived") included &&= !waived;
      if (group?.personalItems?.includes(row.item)) included = false;
      return {
        appointmentId: a.id,
        patientId: a.patientId,
        item: row.item,
        amount: row.amount,
        checked,
        waived: !!waived,
        included,
        reason: included
          ? "计入单位结算"
          : group?.personalItems?.includes(row.item)
            ? "个人自费项目"
            : waived
              ? "已弃检不计费"
              : !orderChecked
                ? "订单未到检"
                : !checked
                  ? "项目未检/无回传"
                  : "不满足口径",
      };
    }),
  );
  const perOrder = orders
    .map((a) => ({
      appointmentId: a.id,
      amount: money(
        lines
          .filter((l) => l.appointmentId === a.id && l.included)
          .reduce((n, l) => n + l.amount, 0),
      ),
    }))
    .map((row) => ({
      ...row,
      amount:
        group?.mode === "无限额"
          ? row.amount
          : Math.min(
              row.amount,
              Number.isFinite(Number(group?.budget))
                ? Number(group?.budget)
                : row.amount,
            ),
    }));
  if (
    mode === "contract" &&
    (!Number.isFinite(contractAmount) || contractAmount < 0)
  )
    errors.push("请输入非负合同金额");
  if (!canProcessFinance(s)) errors.push("无单位结算权限");
  return {
    errors,
    lines,
    amount:
      mode === "contract"
        ? money(contractAmount)
        : money(perOrder.reduce((n, r) => n + r.amount, 0)),
    perOrder,
    signature: JSON.stringify({ group, orders, mode, contractAmount, campus }),
  };
}
/** Evidence-backed current receipts. Clinical/payment labels never stand in for money. */
export function actualOrderCollections(s: DemoState, a: Appointment) {
  const number = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? money(v) : null;
  const records = list(s, "orderTransactions").filter(
    (t) => t.appointmentId === a.id,
  );
  const seen = new Set<string>(),
    transactions: Row[] = [];
  for (const tx of records) {
    if (seen.has(tx.id)) continue;
    seen.add(tx.id);
    if (
      !tx.id ||
      !Number.isFinite(tx.net) ||
      !Array.isArray(tx.lines) ||
      records.some(
        (other) =>
          other.id === tx.id && JSON.stringify(other) !== JSON.stringify(tx),
      )
    )
      return {
        paid: null,
        unitPaid: null,
        personalPaid: null,
        source: "交易冲突或无效",
      };
    if (
      tx.lines.some(
        (r: Row) =>
          typeof r.item !== "string" ||
          !r.item ||
          number(r.charge) === null ||
          number(r.refund) === null,
      )
    )
      return {
        paid: null,
        unitPaid: null,
        personalPaid: null,
        source: "交易项目金额无效",
      };
    const charge = tx.lines.reduce(
        (n: number, r: Row) => n + Number(r.charge || 0),
        0,
      ),
      refund = tx.lines.reduce(
        (n: number, r: Row) => n + Number(r.refund || 0),
        0,
      );
    if (
      number(charge) === null ||
      number(refund) === null ||
      money(charge) !== tx.grossCharge ||
      money(refund) !== tx.grossRefund ||
      money(charge - refund) !== tx.net
    )
      return {
        paid: null,
        unitPaid: null,
        personalPaid: null,
        source: "交易明细与净额不一致",
      };
    transactions.push(tx);
  }
  const accounts = list(s, "groupAccounts").filter(
    (r) => r.id === `GA-${a.groupOrderId}`,
  );
  const legacyLedger = accounts
    .flatMap((r) => r.ledger || [])
    .filter(
      (r: Row) =>
        typeof r.id === "string" &&
        !!r.id &&
        r.appointmentId === a.id &&
        r.type === "单位体检结算" &&
        Number.isFinite(r.amount) &&
        r.amount < 0 &&
        !transactions.some((t) => t.id === r.id || t.accountLedgerId === r.id),
    );
  const legacyUnit = money(
    [...new Map(legacyLedger.map((r: Row) => [r.id, r])).values()].reduce(
      (n: number, r: any) => n - r.amount,
      0,
    ),
  );
  const opening = Object.values(a.paymentOpeningAllocations || {});
  if (transactions.length) {
    if (opening.some((v) => number(v) === null))
      return {
        paid: null,
        unitPaid: null,
        personalPaid: null,
        source: "期初分摊无效",
      };
    const paid = money(
      opening.reduce<number>((n, v) => n + Number(v), 0) +
        transactions.reduce((n, t) => n + t.net, 0) +
        legacyUnit,
    );
    const unitRows = transactions.filter(
      (t) => t.payer === "unit" || t.mode === "group_account_allocation",
    );
    const unitPaid = money(
      (number(a.paymentOpeningUnitPaidAmount) || 0) +
        unitRows.reduce((n, t) => n + t.net, 0) +
        legacyUnit,
    );
    return {
      paid: paid < 0 ? null : paid,
      unitPaid,
      personalPaid: paid < unitPaid ? null : money(paid - unitPaid),
      source: "逐笔订单收退账本＋有凭据期初/单位结算",
    };
  }
  const unitPaid =
    number(a.unitPaidAmount) ??
    (legacyUnit ||
      (Number(a.groupSplit?.unit || 0) === 0 || a.status === "booked"
        ? 0
        : null));
  const explicitTotal = number(a.paidAmount);
  const allocationValues = Object.values(a.paymentAllocations || {});
  const allocated =
    allocationValues.length && allocationValues.every((v) => number(v) !== null)
      ? money(allocationValues.reduce<number>((n, v) => n + Number(v), 0))
      : null;
  const personalPaid =
    number(a.personalPaidAmount) ??
    (Number(a.groupSplit?.personal ?? a.amount) === 0 || a.status === "booked"
      ? 0
      : null);
  const paid =
    allocated ??
    (legacyUnit && personalPaid !== null
      ? money(legacyUnit + personalPaid)
      : explicitTotal) ??
    (unitPaid !== null && personalPaid !== null
      ? money(unitPaid + personalPaid)
      : null);
  return {
    paid,
    unitPaid,
    personalPaid:
      personalPaid ??
      (paid !== null && unitPaid !== null
        ? money(Math.max(0, paid - unitPaid))
        : null),
    source:
      allocated !== null
        ? "已保存项目实收分摊"
        : explicitTotal !== null
          ? "已登记实际收款金额"
          : "明确个人/单位收款凭据",
  };
}
export function previewGroupAccountSettlement(
  s: DemoState,
  appointmentId: string,
) {
  const a = s.appointments.find((a) => a.id === appointmentId),
    errors: string[] = [];
  if (!a)
    return {
      errors: ["订单不存在"],
      amount: 0,
      signature: "",
      account: undefined,
      order: undefined,
      paidBefore: 0,
      unitPaidBefore: 0,
    };
  const group = list(s, "groupOrders").find((g) => g.id === a.groupOrderId),
    account = list(s, "groupAccounts").find(
      (g) => g.id === `GA-${a.groupOrderId}`,
    ),
    collections = actualOrderCollections(s, a);
  if (!canProcessFinance(s) || !scoped(s, a))
    errors.push("当前角色无此订单单位结算权限");
  if (!group || group.status !== "生效" || !account)
    errors.push("有效单位订单或预付款账户不存在");
  if (a.status === "cancelled" || a.outsideGroupPersonalPay)
    errors.push("取消订单或全个人承担订单不能扣单位预付款");
  if (
    group &&
    (group.company !== s.patients.find((p) => p.id === a.patientId)?.company ||
      (group.members?.length && !group.members.includes(a.patientId)))
  )
    errors.push("客户不属于此单位订单");
  const unit = Number(a.groupSplit?.unit),
    personal = Number(a.groupSplit?.personal),
    paid = collections.paid,
    unitPaid = collections.unitPaid;
  if (
    !Number.isFinite(unit) ||
    !Number.isFinite(personal) ||
    unit < 0 ||
    personal < 0 ||
    money(unit + personal) !== a.amount
  )
    errors.push("订单单位个人承担金额缺失或不一致");
  if (paid === null || unitPaid === null)
    errors.push("实际收款依据缺失或冲突，请先核对账本");
  const amount = money(Math.max(0, unit - (unitPaid || 0)));
  if (!amount || account?.settledIds?.includes(a.id))
    errors.push("该订单单位份额已结算或为零，不可重复扣款");
  if (!Number.isFinite(account?.balance) || account!.balance < amount)
    errors.push("预付款余额不足，不能透支结算");
  if (paid !== null && paid + amount > a.amount)
    errors.push("单位扣款将超过订单剩余应收，请核对个人与单位实收");
  return {
    errors: [...new Set(errors)],
    amount,
    account,
    order: a,
    paidBefore: paid || 0,
    unitPaidBefore: unitPaid || 0,
    signature: JSON.stringify({
      a,
      account,
      group,
      amount,
      actor: orderingActor(s),
    }),
  };
}

export function previewGroupAccountReversal(
  s: DemoState,
  appointmentId: string,
  originalAllocationId?: string,
) {
  const a = s.appointments.find((a) => a.id === appointmentId),
    errors: string[] = [];
  const txs = list(s, "orderTransactions");
  const original = txs.find(
    (t) =>
      t.appointmentId === appointmentId &&
      t.mode === "group_account_allocation" &&
      (!originalAllocationId || t.id === originalAllocationId) &&
      !txs.some(
        (r) =>
          r.originalAllocationId === t.id &&
          r.mode === "group_account_reversal",
      ),
  );
  const account =
    original &&
    list(s, "groupAccounts").find((r) => r.id === original.accountId);
  if (!a || !original || !account)
    return {
      errors: ["未找到可冲销的原单位分配流水或原账户"],
      amount: 0,
      signature: "",
      order: a,
      original,
      account,
    };
  if (!canProcessFinance(s) || !scoped(s, a))
    errors.push("当前角色无此订单单位冲销权限");
  const current = actualOrderCollections(s, a),
    amount = Number(original.net);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    original.grossCharge !== amount ||
    original.grossRefund !== 0 ||
    !Array.isArray(original.lines) ||
    money(
      original.lines.reduce((n: number, r: Row) => n + Number(r.charge), 0),
    ) !== amount
  )
    errors.push("原分配金额或项目快照无效");
  if (!Number.isFinite(account.balance) || account.balance < 0)
    errors.push("原单位账户余额无效，不能冲销");
  if (
    current.paid === null ||
    current.unitPaid === null ||
    current.paid < amount ||
    current.unitPaid < amount
  )
    errors.push("当前实际单位收款不足原分配额，不能重复或超额冲销");
  if (
    !account.settledIds?.includes(a.id) ||
    !account.ledger?.some(
      (r: Row) => r.transactionId === original.id || r.id === original.id,
    )
  )
    errors.push("原账户结算关联缺失，请核对原始流水");
  const allocations = orderPaidAllocations(s, a);
  if (
    original.lines.some(
      (r: Row) =>
        !Number.isFinite(r.charge) ||
        r.charge < 0 ||
        Number(allocations[r.item] || 0) < r.charge,
    )
  )
    errors.push("项目实收余额不足，不能覆盖其他收退费记录");
  return {
    errors: [...new Set(errors)],
    amount,
    order: a,
    original,
    account,
    signature: JSON.stringify({
      a,
      account,
      original,
      amount,
      actor: orderingActor(s),
    }),
  };
}

export function reduceOrderFinanceAction(
  source: DemoState,
  action: Action,
): DemoState | undefined {
  const types = [
    "ORDER_PAYMENT_APPLY",
    "GROUP_ACCOUNT_SETTLE",
    "GROUP_ACCOUNT_REVERSE",
    "CARD_BATCH_ISSUE",
    "CARD_SEND_CODE",
    "CARD_REDEEM",
    "GROUP_SETTLEMENT_CONFIRM",
    "SYNC_PACKAGE_CARDS",
  ];
  if (!types.includes(action.type)) return undefined;
  let s = synchronizePackageCardLifecycle(source);
  const p = action.payload || {},
    at = new Date().toISOString();
  if (action.type === "SYNC_PACKAGE_CARDS") return s;
  if (!p.id || typeof p.id !== "string" || !canProcessFinance(s)) return s;
  if (action.type === "GROUP_ACCOUNT_REVERSE") {
    if (
      list(s, "orderTransactions").some((t) => t.id === p.id) ||
      !p.reason?.trim()
    )
      return s;
    const preview = previewGroupAccountReversal(
      s,
      p.appointmentId,
      p.originalAllocationId,
    );
    if (preview.errors.length || preview.signature !== p.expected) return s;
    const a = preview.order!,
      original = preview.original!,
      account = preview.account!,
      amount = preview.amount,
      current = actualOrderCollections(s, a);
    const allocations = orderPaidAllocations(s, a);
    const lines = original.lines.map((row: Row) => {
      const before = Number(allocations[row.item] || 0);
      allocations[row.item] = money(before - row.charge);
      return {
        item: row.item,
        charge: 0,
        refund: row.charge,
        paidBefore: before,
        paidAfter: allocations[row.item],
      };
    });
    const paidAmount = money(current.paid! - amount),
      unitPaidAmount = money(current.unitPaid! - amount);
    const after = {
      ...a,
      unitPaidAmount,
      paidAmount,
      personalPaidAmount: money(paidAmount - unitPaidAmount),
      amountDue: money(a.amount - paidAmount),
      paymentAllocations: allocations,
      lastPaymentAt: at,
      unitReversedAt: at,
      paymentStatusNote: "单位预付款已原路冲销；个人已付款保留，临床状态不倒退",
    } as Appointment;
    const transaction = {
      id: p.id,
      originalAllocationId: original.id,
      appointmentId: a.id,
      patientId: a.patientId,
      groupOrderId: a.groupOrderId,
      accountId: account.id,
      accountLedgerId: p.id,
      payer: "unit",
      cash: false,
      channel: "单位预付款",
      mode: "group_account_reversal",
      lines,
      grossCharge: 0,
      grossRefund: amount,
      net: -amount,
      at,
      actor: orderingActor(s),
      reason: p.reason,
      simulated: true,
    };
    const accountAfter = {
      ...account,
      balance: money(account.balance + amount),
      settledIds: (account.settledIds || []).filter((v: string) => v !== a.id),
      ledger: [
        ...(account.ledger || []),
        {
          id: p.id,
          transactionId: p.id,
          originalAllocationId: original.id,
          type: "单位结算冲销",
          amount,
          appointmentId: a.id,
          at,
          reason: p.reason,
        },
      ],
    };
    s = append(
      append(s, "groupAccounts", accountAfter),
      "orderTransactions",
      transaction,
    );
    s = {
      ...s,
      appointments: s.appointments.map((row) =>
        row.id === a.id ? after : row,
      ),
    };
    return audit(
      s,
      `GROUP-REVERSE-${p.id}`,
      action.type,
      a.id,
      "单位结算原路冲销，保留个人收款与临床进度",
      { appointment: a, account },
      { appointment: after, account: accountAfter },
      { transaction },
    );
  }
  if (action.type === "GROUP_ACCOUNT_SETTLE") {
    if (list(s, "orderTransactions").some((t) => t.id === p.id)) return s;
    const preview = previewGroupAccountSettlement(s, p.appointmentId);
    if (preview.errors.length || p.expected !== preview.signature) return s;
    const a = preview.order!,
      account = preview.account!,
      amount = preview.amount;
    const allocations = orderPaidAllocations(s, {
      ...a,
      paidAmount: preview.paidBefore,
    });
    let left = Math.round(amount * 100);
    const lines = orderPricingLines(s, a)
      .map((row) => {
        const before = Number(allocations[row.item] || 0),
          charge = Math.min(
            left,
            Math.round(Math.max(0, row.amount - before) * 100),
          );
        left -= charge;
        allocations[row.item] = money(before + charge / 100);
        return {
          item: row.item,
          charge: charge / 100,
          refund: 0,
          paidBefore: before,
          paidAfter: allocations[row.item],
        };
      })
      .filter((row) => row.charge > 0);
    if (left !== 0) return s;
    const paidAfter = money(preview.paidBefore + amount),
      unitPaidAmount = money(preview.unitPaidBefore + amount);
    const after = {
      ...a,
      unitPaidAmount,
      personalPaidAmount: money(Math.max(0, paidAfter - unitPaidAmount)),
      paidAmount: paidAfter,
      amountDue: money(a.amount - paidAfter),
      paymentAllocations: allocations,
      paymentOpeningAllocations:
        a.paymentOpeningAllocations ||
        orderPaidAllocations(s, { ...a, paidAmount: preview.paidBefore }),
      paymentOpeningUnitPaidAmount:
        a.paymentOpeningUnitPaidAmount ?? preview.unitPaidBefore,
      unitPaidAt: at,
      paymentStatusNote:
        paidAfter >= a.amount
          ? "个人及单位已登记全额实收"
          : "单位份额已结算，剩余款项待收",
      lastPaymentAt: at,
      status:
        a.status === "booked" && paidAfter >= a.amount ? "paid" : a.status,
    } as Appointment;
    const ledger = {
      id: p.id,
      transactionId: p.id,
      type: "单位体检结算",
      amount: -amount,
      appointmentId: a.id,
      at,
    };
    const accountAfter = {
      ...account,
      balance: money(account.balance - amount),
      settledIds: [...new Set([...(account.settledIds || []), a.id])],
      ledger: [...(account.ledger || []), ledger],
    };
    const transaction = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      groupOrderId: a.groupOrderId,
      accountId: account.id,
      accountLedgerId: p.id,
      payer: "unit",
      channel: "单位预付款",
      mode: "group_account_allocation",
      cash: false,
      lines,
      grossCharge: amount,
      grossRefund: 0,
      net: amount,
      at,
      actor: orderingActor(s),
      reason: "按订单未付单位份额扣减预付款",
      simulated: true,
    };
    s = append(
      append(s, "groupAccounts", accountAfter),
      "orderTransactions",
      transaction,
    );
    s = {
      ...s,
      appointments: s.appointments.map((row) =>
        row.id === a.id ? after : row,
      ),
    };
    return audit(
      s,
      `GROUP-PAY-${p.id}`,
      action.type,
      a.id,
      "单位预付款与订单实收原子结算",
      { appointment: a, account },
      { appointment: after, account: accountAfter },
      { transaction },
    );
  }
  if (action.type === "ORDER_PAYMENT_APPLY") {
    if (list(s, "orderTransactions").some((r) => r.id === p.id)) return s;
    const a = s.appointments.find((a) => a.id === p.appointmentId);
    if (
      !a ||
      p.expected !== appointmentFingerprint(a) ||
      p.catalogSignature !== pricingCatalogSignature(s)
    )
      return s;
    const preview = previewOrderPayment(s, p);
    if (preview.errors.length || p.previewSignature !== JSON.stringify(preview))
      return s;
    const after = paymentOrder(a, preview, at);
    after.paymentOpeningAllocations =
      a.paymentOpeningAllocations || orderPaidAllocations(s, a);
    const transaction = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      channel: p.channel,
      payer: "personal",
      mode: p.mode,
      lines: preview.lines,
      grossCharge: preview.grossCharge,
      grossRefund: preview.grossRefund,
      net: preview.net,
      at,
      actor: orderingActor(s),
      reason: p.reason,
      simulated: true,
    };
    s = append(s, "orderTransactions", transaction);
    s = {
      ...s,
      appointments: s.appointments.map((row) =>
        row.id === a.id ? after : row,
      ),
    };
    return audit(
      s,
      `PAY-${p.id}`,
      action.type,
      a.id,
      "模拟按项目收退费",
      a,
      after,
      { transaction },
    );
  }
  if (action.type === "CARD_BATCH_ISSUE") {
    if (
      list(s, "cardBatches").some((r) => r.id === p.id) ||
      !Number.isInteger(p.count) ||
      p.count < 1 ||
      p.count > 100 ||
      !["储值卡", "套餐卡"].includes(p.type) ||
      !Number.isFinite(p.balance) ||
      p.balance < 0
    )
      return s;
    const pack = s.packages.find((r) => r.id === p.packageId);
    if (p.type === "套餐卡" && !pack) return s;
    const cards = Array.from({ length: p.count }, (_, i) => ({
      id: `CARD-${p.id}-${String(i + 1).padStart(3, "0")}`,
      name: `红创${p.type}`,
      type: p.type,
      balance: p.type === "套餐卡" ? pack!.price : money(p.balance),
      packageId: p.type === "套餐卡" ? p.packageId : "",
      status: "可用",
      createdAt: at,
      simulated: true,
    }));
    if (cards.some((card) => list(s, "cards").some((r) => r.id === card.id)))
      return s;
    s = {
      ...s,
      records: { ...s.records, cards: [...cards, ...list(s, "cards")] },
    };
    s = append(s, "cardBatches", {
      id: p.id,
      count: p.count,
      type: p.type,
      cardIds: cards.map((c) => c.id),
      at,
    });
    return audit(
      s,
      `CARDS-${p.id}`,
      action.type,
      p.id,
      "批量创建合成会员卡",
      null,
      cards,
    );
  }
  if (action.type === "CARD_SEND_CODE") {
    const a = s.appointments.find((r) => r.id === p.appointmentId),
      card = list(s, "cards").find((r) => r.id === p.cardId);
    if (
      !a ||
      !card ||
      !scoped(s, a) ||
      ["已失效", "已冻结"].includes(card.status) ||
      a.status === "cancelled" ||
      !Number.isFinite(p.amount) ||
      p.amount <= 0 ||
      money(p.amount) !== p.amount ||
      p.amount > card.balance ||
      list(s, "cardChallenges").some((r) => r.id === p.id)
    )
      return s;
    const paid = Object.values(orderPaidAllocations(s, a)).reduce(
      (n, v) => n + v,
      0,
    );
    if (
      p.amount > a.amount - paid + 0.001 ||
      (card.type === "套餐卡" &&
        (card.packageId !== a.packageId ||
          (card.appointmentId && card.appointmentId !== a.id)))
    )
      return s;
    const challenge = {
      id: p.id,
      appointmentId: a.id,
      patientId: a.patientId,
      cardId: card.id,
      amount: money(p.amount),
      expected: appointmentFingerprint(a),
      cardBalance: card.balance,
      status: "pending",
      attempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
      at,
      actor: orderingActor(s),
    };
    s = append(s, "cardChallenges", challenge);
    return audit(
      s,
      `SMS-${p.id}`,
      action.type,
      a.id,
      "生成本地演示短信验证码（未发送短信）",
      null,
      { ...challenge },
    );
  }
  if (action.type === "CARD_REDEEM") {
    const c = list(s, "cardChallenges").find((r) => r.id === p.id),
      a = s.appointments.find((r) => r.id === c?.appointmentId),
      card = list(s, "cards").find((r) => r.id === c?.cardId);
    if (
      !c ||
      !a ||
      !card ||
      c.status !== "pending" ||
      c.expiresAt < at ||
      !scoped(s, a) ||
      c.actor !== orderingActor(s) ||
      c.expected !== appointmentFingerprint(a) ||
      card.balance !== c.cardBalance ||
      ["已失效", "已冻结"].includes(card.status)
    )
      return s;
    if (p.code !== DEMO_CARD_CODE) {
      return append(s, "cardChallenges", {
        ...c,
        attempts: c.attempts + 1,
        status: c.attempts + 1 >= 3 ? "locked" : "pending",
      });
    }
    const pricing = orderPricingLines(s, a),
      allocations = orderPaidAllocations(s, a);
    let remaining = Math.round(c.amount * 100);
    const lines = pricing
      .map((r) => {
        const before = allocations[r.item] || 0,
          charge = Math.min(
            remaining,
            Math.round(Math.max(0, r.amount - before) * 100),
          );
        remaining -= charge;
        allocations[r.item] = money(before + charge / 100);
        return {
          item: r.item,
          paidBefore: before,
          charge: charge / 100,
          refund: 0,
          paidAfter: allocations[r.item],
        };
      })
      .filter((r) => r.charge > 0);
    if (remaining > 0) return s;
    const paidAfter = money(
        Object.values(allocations).reduce((n, v) => n + v, 0),
      ),
      after = {
        ...a,
        paymentOpeningAllocations:
          a.paymentOpeningAllocations || orderPaidAllocations(s, a),
        paymentAllocations: allocations,
        paidAmount: paidAfter,
        amountDue: money(a.amount - paidAfter),
        status:
          a.status === "booked" && paidAfter >= a.amount ? "paid" : a.status,
        paidAt: paidAfter >= a.amount ? a.paidAt || at : a.paidAt,
        memberCardId: card.id,
      } as Appointment;
    const cardAfter = {
      ...card,
      balance: money(card.balance - c.amount),
      status: card.type === "套餐卡" ? "已绑定" : card.status,
      appointmentId: card.type === "套餐卡" ? a.id : card.appointmentId,
    };
    s = append(s, "cards", cardAfter);
    s = append(s, "cardChallenges", {
      ...c,
      status: "consumed",
      consumedAt: at,
    });
    const transaction = {
      id: `CARD-PAY-${c.id}`,
      appointmentId: a.id,
      patientId: a.patientId,
      cardId: card.id,
      amount: c.amount,
      channel: "会员卡",
      mode: "card",
      lines,
      grossCharge: c.amount,
      grossRefund: 0,
      net: c.amount,
      at,
      actor: orderingActor(s),
      balanceBefore: card.balance,
      balanceAfter: cardAfter.balance,
      simulated: true,
    };
    s = append(s, "cardTransactions", transaction);
    s = append(s, "orderTransactions", transaction);
    s = {
      ...s,
      appointments: s.appointments.map((r) => (r.id === a.id ? after : r)),
    };
    return audit(
      s,
      `CARD-USE-${c.id}`,
      action.type,
      a.id,
      "验证码通过，会员卡与订单原子抵扣",
      { appointment: a, card },
      { appointment: after, card: cardAfter },
      { transaction },
    );
  }
  if (action.type === "GROUP_SETTLEMENT_CONFIRM") {
    if (list(s, "groupSettlementSnapshots").some((r) => r.id === p.id))
      return s;
    const preview = previewGroupSettlement(
      s,
      p.groupOrderId,
      p.mode,
      p.contractAmount,
      p.campus,
    );
    if (preview.errors.length || preview.signature !== p.expected) return s;
    const row = {
      id: p.id,
      groupOrderId: p.groupOrderId,
      mode: p.mode,
      campus: p.campus || s.config.campus || "中心院区",
      amount: preview.amount,
      lines: preview.lines,
      perOrder: preview.perOrder,
      status: "待模拟结算",
      at,
      actor: orderingActor(s),
    };
    s = append(s, "groupSettlementSnapshots", row);
    return audit(
      s,
      `GROUP-SETTLE-${p.id}`,
      action.type,
      p.groupOrderId,
      "生成单位多口径结算快照",
      null,
      row,
    );
  }
  return s;
}
