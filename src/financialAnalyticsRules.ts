import type { DemoState } from "./model";
import { analyticsDay, buildOrderAnalytics, moneyCents } from "./analyticsData";
import { invoiceDueDate } from "./modules/InvoiceReminder";
export interface FinancialTransaction {
  id: string;
  transactionId: string;
  date: string;
  at: string;
  appointmentId: string;
  name: string;
  company: string;
  kind: string;
  seller: string;
  type: string;
  direction: string;
  channel: string;
  item: string;
  amountCents: number;
  source: string;
  cash: boolean;
}
/** Project/direction rows reconcile to immutable transaction gross amounts, never to today's paid balance. */
export function inspectOrderLedger(state: DemoState) {
  const parsed: {
    record: Record<string, any>;
    lines: { item: string; charge: number; refund: number }[];
  }[] = [];
  const issues: { id: string; name: string; reason: string }[] = [];
  const records = state.records.orderTransactions || [];
  const seen = new Set<string>();
  for (const record of records) {
    const id = typeof record.id === "string" ? record.id : "";
    if (seen.has(id)) continue;
    seen.add(id);
    const name =
      state.patients.find((p) => p.id === record.patientId)?.name ||
      record.appointmentId ||
      "未知订单";
    const fail = (reason: string) =>
      issues.push({ id: id || "缺交易编号", name, reason });
    if (
      !id ||
      !record.appointmentId ||
      !analyticsDay(record.at) ||
      !Number.isFinite(Date.parse(String(record.at)))
    ) {
      fail("逐笔交易缺少编号、订单或有效时间，未按余额补造");
      continue;
    }
    const duplicates = records.filter((r) => r.id === id);
    if (duplicates.some((r) => JSON.stringify(r) !== JSON.stringify(record))) {
      fail("相同交易编号存在冲突，未选择任一金额");
      continue;
    }
    if (!Array.isArray(record.lines) || !record.lines.length) {
      fail("逐笔交易缺项目收退明细");
      continue;
    }
    const lines: { item: string; charge: number; refund: number }[] = [];
    let invalid = false;
    for (const line of record.lines) {
      const charge = moneyCents(line.charge),
        refund = moneyCents(line.refund);
      if (
        typeof line.item !== "string" ||
        !line.item.trim() ||
        charge === null ||
        refund === null
      ) {
        invalid = true;
        break;
      }
      const existing = lines.find((r) => r.item === line.item);
      if (existing) {
        existing.charge += charge;
        existing.refund += refund;
      } else lines.push({ item: line.item, charge, refund });
    }
    const charge = lines.reduce((n, r) => n + r.charge, 0),
      refund = lines.reduce((n, r) => n + r.refund, 0);
    const net =
      typeof record.net === "number" && Number.isFinite(record.net)
        ? Math.round(record.net * 100)
        : null;
    if (
      invalid ||
      charge !== moneyCents(record.grossCharge) ||
      refund !== moneyCents(record.grossRefund) ||
      net !== charge - refund ||
      charge + refund === 0
    ) {
      fail("逐笔交易项目与收/退/净额不一致，已隔离待核对");
      continue;
    }
    parsed.push({ record, lines });
  }
  return { parsed, issues };
}
function legacyPayments(state: DemoState, appointmentId: string) {
  const seen = new Set<string>();
  return state.audit.filter((e) => {
    if (
      e.action !== "PAYMENT" ||
      !(e.entity === appointmentId || e.after?.id === appointmentId) ||
      !e.id ||
      seen.has(e.id)
    )
      return false;
    seen.add(e.id);
    return true;
  });
}
function verifiedOpeningPayment(
  state: DemoState,
  a: Record<string, any>,
  firstAt: string,
) {
  const values = Object.values(a.paymentOpeningAllocations || {}).map(
    moneyCents,
  );
  if (!values.length || values.some((v) => v === null)) return null;
  const opening = values.reduce<number>((n, v) => n + (v || 0), 0);
  if (!opening) return null;
  const prior = legacyPayments(state, a.id).filter(
    (e) =>
      Number.isFinite(Date.parse(e.time || e.at)) &&
      Date.parse(e.time || e.at) < Date.parse(firstAt),
  );
  if (prior.length !== 1) return null;
  const e = prior[0],
    amount = moneyCents(e.after?.paidAmount ?? e.after?.amount);
  return amount === opening ? { entry: e, amount } : null;
}
/** useDemo has already scoped archives; never reach outside its supplied patient/order metadata. */
function financialOrders(state: DemoState) {
  const patientIds = new Set(state.patients.map((p) => p.id));
  const currentIds = new Set(state.appointments.map((a) => a.id));
  const seen = new Set<string>();
  const archived = (state.records.cancelledAppointmentArchive || []).flatMap(
    (row) => {
      const a = row.appointment;
      if (
        !a?.id ||
        currentIds.has(a.id) ||
        seen.has(a.id) ||
        !patientIds.has(a.patientId) ||
        !Array.isArray(a.items) ||
        !a.results
      )
        return [];
      seen.add(a.id);
      return [{ ...a, financeArchived: true }];
    },
  );
  return buildOrderAnalytics({
    ...state,
    appointments: [...state.appointments, ...archived],
  });
}
export function buildFinancialTransactions(
  state: DemoState,
): FinancialTransaction[] {
  const orders = financialOrders(state),
    rows: FinancialTransaction[] = [];
  const ledger = inspectOrderLedger(state);
  for (const r of orders) {
    const a = r.appointment;
    const base = {
      appointmentId: a.id,
      name: r.name,
      company: r.company,
      kind: r.kind,
      seller: r.seller,
    };
    const records = (state.records.orderTransactions || []).filter(
      (t) => t.appointmentId === a.id,
    );
    if (records.length) {
      for (const { record: t, lines } of ledger.parsed.filter(
        (t) => t.record.appointmentId === a.id,
      )) {
        const cash =
          t.cash !== false && t.channel !== "会员卡" && t.mode !== "card";
        const allocation = t.mode === "group_account_allocation";
        for (const line of lines) {
          for (const direction of ["charge", "refund"] as const) {
            const amount = line[direction];
            if (!amount) continue;
            rows.push({
              ...base,
              id: `TX-${t.id}-${direction}-${encodeURIComponent(line.item)}`,
              transactionId: t.id,
              date: analyticsDay(t.at),
              at: t.at,
              channel: t.channel || "未记录渠道",
              item: line.item,
              type: allocation
                ? "预收款结算分配"
                : cash
                  ? direction === "charge"
                    ? "订单收款"
                    : "订单退款"
                  : t.mode === "card" || t.channel === "会员卡"
                    ? "会员卡抵扣"
                    : "非现金结算分配",
              direction: allocation
                ? "结算分配"
                : direction === "charge"
                  ? "收款"
                  : "退款",
              amountCents: direction === "charge" ? amount : -amount,
              source: `orderTransactions逐笔项目快照${a.financeArchived ? " · 取消归档订单" : ""}`,
              cash,
            });
          }
        }
      }
      const times = records
        .map((t) => t.at)
        .filter((t) => analyticsDay(t))
        .sort();
      const opening = times.length
        ? verifiedOpeningPayment(state, a, times[0])
        : null;
      if (opening) {
        const at = opening.entry.time || opening.entry.at;
        rows.push({
          ...base,
          id: `OPENING-${opening.entry.id}`,
          transactionId: opening.entry.id,
          date: analyticsDay(at),
          at,
          channel: opening.entry.after?.paymentMethod || "未记录渠道",
          item: "旧收款未分项目（期初已核对）",
          type: "订单收款",
          direction: "收款",
          amountCents: opening.amount,
          source: "账本启用前唯一PAYMENT快照，与期初分配一致",
          cash: true,
        });
      }
      // Any ledger presence suppresses mutable balance/refund snapshots, including malformed records.
      continue;
    }
    const payments = legacyPayments(state, a.id),
      paid = moneyCents(a.paidAmount),
      paidDate = analyticsDay(a.paidAt);
    if (paid !== null && paidDate) {
      rows.push({
        ...base,
        id: `PAY-${a.id}`,
        transactionId: `PAY-${a.id}`,
        date: paidDate,
        at: a.paidAt,
        channel: a.paymentMethod || "未记录渠道",
        item: "旧订单总额（项目未知）",
        type: "订单收款",
        direction: "收款",
        amountCents: paid,
        source: "旧订单实收快照（无逐笔账本）",
        cash: true,
      });
    } else if (payments.length === 1) {
      const e = payments[0],
        value = moneyCents(e.after?.paidAmount ?? e.after?.amount),
        at = e.at || e.time;
      const date = analyticsDay(at);
      if (value !== null && date)
        rows.push({
          ...base,
          id: `PAY-${a.id}`,
          transactionId: e.id,
          date,
          at,
          channel: e.after?.paymentMethod || "未记录渠道",
          item: "旧订单总额（项目未知）",
          type: "订单收款",
          direction: "收款",
          amountCents: value,
          source: "唯一收款审计金额快照",
          cash: true,
        });
    }
    const refund = moneyCents(a.refundAmount),
      refundDate = analyticsDay(a.refundedAt);
    if (refund !== null && refund > 0 && refundDate)
      rows.push({
        ...base,
        id: `REFUND-${a.id}`,
        transactionId: `REFUND-${a.id}`,
        date: refundDate,
        at: a.refundedAt,
        channel: a.refundMethod || a.paymentMethod || "未记录渠道",
        item: "旧订单退款（项目未知）",
        type: "订单退款",
        direction: "退款",
        amountCents: -refund,
        source: "旧退款金额/时间快照（无逐笔账本）",
        cash: true,
      });
  }
  for (const account of state.records.groupAccounts || []) {
    const group = (state.records.groupOrders || []).find(
      (g) => account.id === `GA-${g.id}` || account.groupOrderId === g.id,
    );
    const seen = new Set<string>();
    for (const entry of account.ledger || []) {
      if (!entry.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const date = analyticsDay(entry.at),
        amount = moneyCents(Math.abs(entry.amount));
      if (!date || amount === null) continue;
      const order = orders.find((o) => o.id === entry.appointmentId),
        isCash = entry.type === "预付款入账";
      if (!isCash && entry.type !== "单位体检结算") continue;
      if (
        !isCash &&
        (!order ||
          (state.records.orderTransactions || []).some(
            (t) =>
              t.mode === "group_account_allocation" &&
              t.appointmentId === entry.appointmentId &&
              (!t.accountId || t.accountId === account.id) &&
              (t.id === entry.transactionId ||
                t.accountLedgerId === entry.id ||
                t.id === entry.id),
          ))
      )
        continue;
      rows.push({
        id: `GROUP-${account.id}-${entry.id}`,
        transactionId: entry.id,
        date,
        at: entry.at,
        appointmentId: entry.appointmentId || "",
        name: order?.name || "单位账户",
        company: group?.company || order?.company || "未登记单位",
        kind: "团检",
        seller:
          group?.seller ||
          group?.salesperson ||
          order?.seller ||
          "未记录业务员",
        type: isCash ? "单位预收款" : "预收款结算分配",
        direction: isCash ? "收款" : "结算分配",
        channel: entry.channel || "单位账户",
        item: isCash ? "单位预付款（未分配）" : "单位预付款分配",
        amountCents: amount,
        source: "单位账户逐笔台账",
        cash: isCash,
      });
    }
  }
  return rows.sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );
}
export function financialUnknowns(state: DemoState) {
  const ledger = inspectOrderLedger(state);
  const gaps = [...ledger.issues];
  for (const r of financialOrders(state)) {
    const a = r.appointment,
      transactions = (state.records.orderTransactions || []).filter(
        (t) => t.appointmentId === a.id,
      );
    if (transactions.length) {
      const opening = Object.values(
        a.paymentOpeningAllocations || {},
      ).reduce<number>((n, v) => n + (moneyCents(v) || 0), 0);
      const first = transactions
        .map((t) => t.at)
        .filter((t) => analyticsDay(t))
        .sort()[0];
      if (opening > 0 && (!first || !verifiedOpeningPayment(state, a, first)))
        gaps.push({
          id: a.id,
          name: r.name,
          reason: "有期初已收余额但缺可核对历史交易日期/金额，未计入日期收入",
        });
      continue;
    }
    if (Number(a.refundAmount) > 0 && !analyticsDay(a.refundedAt))
      gaps.push({
        id: a.id,
        name: r.name,
        reason: "退款日期未知，未分配交易日",
      });
    else if (
      !r.cancelled &&
      a.status !== "booked" &&
      (moneyCents(a.paidAmount) === null || !analyticsDay(a.paidAt)) &&
      !legacyPayments(state, a.id).length
    )
      gaps.push({
        id: a.id,
        name: r.name,
        reason: "实收金额/日期未知，未按状态推定收入",
      });
  }
  return gaps;
}
export const agingBucket = (days: number) =>
  days <= 30
    ? "0–30天"
    : days <= 60
      ? "31–60天"
      : days <= 90
        ? "61–90天"
        : days <= 180
          ? "91–180天"
          : "181天以上";
export function buildInvoiceAging(state: DemoState, asOf: string) {
  if (!analyticsDay(asOf)) return [];
  return (state.records.invoiceLedger || []).map((invoice) => {
    const orders = state.appointments.filter((a) =>
      (invoice.appointmentIds || []).includes(a.id),
    );
    const company =
      invoice.company ||
      orders
        .map(
          (a) =>
            a.groupCompany ||
            state.patients.find((p) => p.id === a.patientId)?.company,
        )
        .filter(Boolean)
        .filter((v, i, x) => x.indexOf(v) === i)
        .join("、") ||
      "未登记单位";
    const terms = (state.records.invoiceCompanyTerms || []).find(
      (t) => t.company === company,
    );
    const issued = analyticsDay(invoice.createdAt);
    const term = invoice.paymentTermDays ?? terms?.days;
    const due =
      analyticsDay(invoice.paymentDueDate) ||
      (term === undefined ? "" : invoiceDueDate(issued, Number(term)) || "");
    const validDue = !!issued && !!due && due >= issued;
    const amount = moneyCents(invoice.amount);
    const receipts = (state.records.invoiceReceipts || []).filter(
      (r) =>
        r.invoiceId === invoice.id &&
        ["已登记", "已完成", "有效"].includes(r.status) &&
        analyticsDay(r.date || r.createdAt) &&
        analyticsDay(r.date || r.createdAt) <= asOf,
    );
    const seen = new Set<string>();
    let collected = 0;
    let invalidReceipt = false;
    for (const receipt of receipts) {
      if (!receipt.id || seen.has(receipt.id)) {
        invalidReceipt = true;
        continue;
      }
      seen.add(receipt.id);
      const value = moneyCents(receipt.amount);
      if (value === null) {
        invalidReceipt = true;
        continue;
      }
      collected += value;
    }
    const outstanding =
      amount === null || invalidReceipt
        ? null
        : Math.max(0, amount - collected);
    const future = !!issued && issued > asOf;
    const valid = invoice.status === "有效" && !future;
    const age =
      issued && !future
        ? Math.floor((Date.parse(asOf) - Date.parse(issued)) / 86400000)
        : null;
    const overdueDays = validDue
      ? Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(due)) / 86400000))
      : null;
    return {
      id: invoice.id,
      company,
      seller: invoice.seller || "未记录业务员",
      issued,
      due: validDue ? due : "",
      termSource: invoice.paymentDueDate
        ? "发票指定到期日"
        : invoice.paymentTermDays !== undefined
          ? "发票账期"
          : terms
            ? "单位默认账期"
            : "未配置账期",
      amountCents: amount,
      collectedCents: collected,
      outstandingCents: outstanding,
      age,
      overdueDays,
      bucket: age === null ? "日期未知" : agingBucket(age),
      overdueBucket:
        overdueDays === null
          ? "到期日未知"
          : due > asOf
            ? "未到期"
            : agingBucket(overdueDays),
      status: invoice.status,
      eligible: valid,
      warning: future
        ? "尚未开票（相对演示日期）"
        : !issued
          ? "开票日期未知"
          : amount === null
            ? "发票金额未知"
            : invalidReceipt
              ? "回款记录无有效唯一编号或金额"
              : amount !== null && collected > amount
                ? "回款超过票面，请核对"
                : "",
    };
  });
}
export function buildReviewWorkloads(state: DemoState) {
  return buildOrderAnalytics(state).flatMap((r) => {
    const entries = Array.isArray(r.appointment.stageMetadata)
      ? r.appointment.stageMetadata
      : [];
    const seen = new Set<string>();
    return entries
      .filter(
        (e: any) =>
          ["主检", "总检", "初审"].includes(e.stage) &&
          ["已完成", "已通过"].includes(e.status) &&
          e.doctor &&
          analyticsDay(e.completedAt),
      )
      .flatMap((e: any) => {
        const key = `${r.id}:${e.stage}:${e.completedAt}:${e.doctor}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            id: key,
            appointmentId: r.id,
            name: r.name,
            company: r.company,
            doctor: e.doctor,
            stage: e.stage,
            date: analyticsDay(e.completedAt),
            startedAt: e.startedAt || "",
            completedAt: e.completedAt,
            source: "审核节点完成元数据",
          },
        ];
      });
  });
}
