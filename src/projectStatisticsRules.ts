import type { Appointment, DemoState } from "./model";
import { reviewNodes } from "./clinicalRules";
import { getOrderRules } from "./orderingRules";
export type ProjectMode = "completed" | "ordered";
export interface ProjectRow {
  id: string;
  appointmentId: string;
  patientId: string;
  name: string;
  company: string;
  item: string;
  doctor: string;
  seller: string;
  creator: string;
  department: string;
  room: string;
  assignmentSource: string;
  orderDate: string;
  orderDateSource: string;
  resultDate: string;
  resultDateSource: string;
  completed: boolean;
  result: string;
  reviewFlow: string;
  originalCents: number | null;
  executionCents: number | null;
  priceSource: string;
  estimated: boolean;
  warning: string;
  exclusion: string;
}
export interface ProjectFilters {
  mode: ProjectMode;
  start: string;
  end: string;
  doctor: string;
  seller: string;
  creator: string;
  department: string;
  room: string;
  item: string;
  reviewFlow: string;
  includeExcluded: boolean;
}
export const defaultProjectFilters: ProjectFilters = {
  mode: "completed",
  start: "",
  end: "",
  doctor: "",
  seller: "",
  creator: "",
  department: "",
  room: "",
  item: "",
  reviewFlow: "",
  includeExcluded: false,
};
const cents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100)
    : null;
const day = (value: unknown) => {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
    ? date
    : "";
};
const unique = (values: unknown[]) => [
  ...new Set(
    values.filter((x): x is string => typeof x === "string" && !!x.trim()),
  ),
];
/** Largest remainder allocation in cents: totals reconcile exactly and ties follow stable project order. */
export function allocateProjectCents(total: number, weights: number[]) {
  if (!weights.length) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((n, w) => n + w, 0);
  const normalized = sum ? safe : safe.map(() => 1);
  const divisor = sum || safe.length;
  const quotas = normalized.map(
    (w) => (Math.max(0, Math.round(total)) * w) / divisor,
  );
  const values = quotas.map(Math.floor);
  const remaining =
    Math.max(0, Math.round(total)) - values.reduce((n, v) => n + v, 0);
  const order = quotas
    .map((v, i) => ({ i, remainder: v - values[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let i = 0; i < remaining; i++) values[order[i % order.length].i]++;
  return values;
}
function catalogPrices(state: DemoState, a: Appointment) {
  const prices: Record<string, number> = {};
  const ids = unique([
    a.packageId,
    ...(Array.isArray(a.packageIds) ? a.packageIds : []),
  ]);
  for (const id of ids) {
    const pack = state.packages.find((p) => p.id === id);
    const price = cents(pack?.price);
    if (!pack || price === null || !pack.items.length) continue;
    const items = unique(pack.items);
    const shares = allocateProjectCents(
      price,
      items.map(() => 1),
    );
    items.forEach((item, i) => {
      prices[item] = Math.max(prices[item] || 0, shares[i]);
    });
  }
  for (const rule of getOrderRules(state)) {
    const price = cents(rule.price);
    if (!(rule.item in prices) && price !== null) prices[rule.item] = price;
  }
  return prices;
}
export function projectReviewFlow(a: Appointment, state?: DemoState) {
  if (a.status === "cancelled") return "已取消";
  if (["approved", "printed"].includes(a.status)) return "审核完成";
  if (a.status !== "review") return "未送审";
  const nodes = state ? reviewNodes(state, a) : ["初审", "主检", "总检"];
  return `${nodes[Math.min(nodes.length - 1, Number(a.reviewStage) || 0)]}待办`;
}
export function buildProjectRows(state: DemoState): ProjectRow[] {
  const rows: ProjectRow[] = [];
  for (const a of state.appointments) {
    const patient = state.patients.find((p) => p.id === a.patientId);
    const snapshots: {
      item: string;
      price?: number;
      amount?: number;
      percent?: number;
    }[] = Array.isArray(a.pricing) ? a.pricing : [];
    const items = unique([
      ...a.items,
      ...(Array.isArray(a.waived) ? a.waived : []),
      ...snapshots.map((p) => p.item),
      ...Object.keys(a.results || {}),
    ]);
    const catalog = catalogPrices(state, a);
    const total = cents(a.amount);
    const pricing = items.map((item) => {
      const matched = snapshots.filter((p) => p.item === item);
      const snap = matched[0];
      const duplicate = matched.length > 1;
      return {
        item,
        duplicate,
        original: duplicate
          ? null
          : (cents(snap?.price) ?? catalog[item] ?? null),
        execution: duplicate ? null : cents(snap?.amount),
        exactOriginal: !duplicate && cents(snap?.price) !== null,
        exactExecution: !duplicate && cents(snap?.amount) !== null,
      };
    });
    const knownExecution = pricing.reduce(
      (sum, p) => sum + (p.execution || 0),
      0,
    );
    const missing = pricing.filter((p) => p.execution === null && !p.duplicate);
    const allocated =
      total !== null &&
      knownExecution <= total &&
      !pricing.some((p) => p.duplicate)
        ? allocateProjectCents(
            total - knownExecution,
            missing.map((p) => p.original ?? 1),
          )
        : [];
    const estimates = new Map(
      missing.map((p, i) => [p.item, allocated[i] ?? null]),
    );
    const snapshotsReconcile =
      !pricing.some((p) => !p.exactExecution) &&
      total !== null &&
      knownExecution !== total;
    for (const price of pricing) {
      const item = price.item;
      const metadata = a.resultMetadata?.[item] || {};
      const mapping = state.records.projectStatMappings?.find(
        (m) => m.item === item,
      );
      const guideDepartments = (state.records.guideDepartments || []).filter(
        (d) =>
          String(d.items || "")
            .split(/[、,，\n]/)
            .map((v) => v.trim())
            .includes(item),
      );
      const department =
        metadata.department ||
        mapping?.department ||
        (guideDepartments.length === 1
          ? guideDepartments[0].name
          : "未映射科室");
      const room = metadata.room || mapping?.room || "未映射诊室";
      const doctor = metadata.doctor || a.doctor || "未登记医生";
      const result = String(a.results[item] ?? "").trim();
      const completed =
        !!result &&
        !["待检查", "待检", "未检查", "待录入", "未录入"].includes(result);
      const resultDate = day(metadata.at) || day(a.submittedAt) || day(a.date);
      const orderDate = day(a.createdAt) || day(a.orderedAt) || day(a.date);
      const exclusion =
        a.status === "cancelled"
          ? "已取消订单"
          : (a.waived || []).includes(item)
            ? "已弃检项目"
            : !a.items.includes(item)
              ? "已移除项目"
              : a.refunded || Number(a.refundAmount) > 0
                ? "退款标记整单排除（无逐项退款归属）"
                : a.refundRequested
                  ? "退款申请待核清"
                  : "";
      const exact = price.exactOriginal && price.exactExecution;
      const execution = price.execution ?? estimates.get(item) ?? null;
      const estimated =
        !price.duplicate &&
        ((!price.exactOriginal && price.original !== null) ||
          (!price.exactExecution && execution !== null));
      const source = price.duplicate
        ? "快照重复，金额未知"
        : exact
          ? "订单项目价格快照"
          : `${price.exactOriginal ? "快照原价" : price.original === null ? "原价未知" : "当前目录原价估算"}；${price.exactExecution ? "快照执行价" : execution === null ? "执行价未知" : "订单余额按权重分摊估算"}`;
      rows.push({
        id: `${a.id}::${item}`,
        appointmentId: a.id,
        patientId: a.patientId,
        name: patient?.name || "未登记客户",
        company: patient?.company || "未登记单位",
        item,
        doctor,
        seller:
          a.salesperson ||
          a.salesPerson ||
          a.seller ||
          state.records.groupOrders?.find((g) => g.id === a.groupOrderId)
            ?.seller ||
          "未记录业务员",
        creator: a.createdBy || a.creator || a.registeredBy || "未记录创建人",
        department,
        room,
        assignmentSource:
          metadata.doctor && metadata.department && metadata.room
            ? "项目结果元数据"
            : `${metadata.doctor ? "项目医生" : "订单医生回退"} / ${metadata.department ? "项目科室" : mapping?.department ? "当前项目映射" : "当前导检配置或未映射"} / ${metadata.room ? "项目诊室" : "当前项目映射或未映射"}`,
        orderDate,
        orderDateSource:
          day(a.createdAt) || day(a.orderedAt)
            ? "开单时间"
            : "缺开单时间，体检日期代理",
        resultDate,
        resultDateSource: day(metadata.at)
          ? "项目结果时间"
          : day(a.submittedAt)
            ? "缺项目时间，送审时间代理"
            : "缺项目时间，体检日期代理",
        completed,
        result,
        reviewFlow: projectReviewFlow(a, state),
        originalCents: price.original,
        executionCents: execution,
        priceSource: source,
        estimated,
        warning: snapshotsReconcile
          ? "项目快照合计与当前订单金额不一致，保留原快照；非实收收入"
          : price.duplicate
            ? "同一项目存在多个价格快照，未选择任一金额"
            : total !== null && knownExecution > total
              ? "已知快照超过订单金额，缺项未估算"
              : "",
        exclusion,
      });
    }
  }
  return rows;
}
export function projectFilterError(filters: ProjectFilters) {
  return (filters.start && !day(filters.start)) ||
    (filters.end && !day(filters.end))
    ? "日期格式无效"
    : filters.start && filters.end && filters.start > filters.end
      ? "开始日期不能晚于结束日期"
      : "";
}
export function filterProjectRows(rows: ProjectRow[], filters: ProjectFilters) {
  if (projectFilterError(filters)) return [];
  return rows.filter((r) => {
    const date = filters.mode === "completed" ? r.resultDate : r.orderDate;
    return (
      (filters.mode !== "completed" || r.completed) &&
      (filters.includeExcluded || !r.exclusion) &&
      (!filters.start || date >= filters.start) &&
      (!filters.end || (!!date && date <= filters.end)) &&
      (!filters.doctor || r.doctor === filters.doctor) &&
      (!filters.seller || r.seller === filters.seller) &&
      (!filters.creator || r.creator === filters.creator) &&
      (!filters.department || r.department === filters.department) &&
      (!filters.room || r.room === filters.room) &&
      (!filters.item || r.item === filters.item) &&
      (!filters.reviewFlow || r.reviewFlow === filters.reviewFlow)
    );
  });
}
export function summarizeProjectRows(rows: ProjectRow[]) {
  const eligible = rows.filter((r) => !r.exclusion);
  const originalUnknown = eligible.filter(
    (r) => r.originalCents === null,
  ).length;
  const executionUnknown = eligible.filter(
    (r) => r.executionCents === null,
  ).length;
  const originalKnownCents = eligible.reduce(
    (n, r) => n + (r.originalCents || 0),
    0,
  );
  const executionKnownCents = eligible.reduce(
    (n, r) => n + (r.executionCents || 0),
    0,
  );
  return {
    listedCount: rows.length,
    count: eligible.length,
    excludedCount: rows.length - eligible.length,
    people: new Set(eligible.map((r) => r.patientId)).size,
    estimatedCount: eligible.filter((r) => r.estimated).length,
    originalKnownCents,
    executionKnownCents,
    originalUnknown,
    executionUnknown,
    originalCents: originalUnknown ? null : originalKnownCents,
    executionCents: executionUnknown ? null : executionKnownCents,
  };
}
export function groupProjectRows(
  rows: ProjectRow[],
  dimension: "doctor" | "department" | "room" | "item",
) {
  const names = [...new Set(rows.map((r) => r[dimension]))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  return names.map((name) => ({
    name,
    ...summarizeProjectRows(rows.filter((r) => r[dimension] === name)),
  }));
}
export function projectCsvRows(rows: ProjectRow[], filters: ProjectFilters) {
  return rows.map((r) => ({
    统计口径: filters.mode === "completed" ? "检查完成" : "开单项目",
    体检号: r.appointmentId,
    客户编号: r.patientId,
    姓名: r.name,
    单位: r.company,
    项目: r.item,
    医生: r.doctor,
    业务员: r.seller,
    创建人: r.creator,
    科室: r.department,
    诊室: r.room,
    归属依据: r.assignmentSource,
    统计日期: filters.mode === "completed" ? r.resultDate : r.orderDate,
    日期依据:
      filters.mode === "completed" ? r.resultDateSource : r.orderDateSource,
    审核流程: r.reviewFlow,
    检查完成: r.completed ? "是" : "否",
    计入有效数量: r.exclusion ? 0 : 1,
    排除原因: r.exclusion,
    项目原价:
      r.originalCents === null ? "未知" : (r.originalCents / 100).toFixed(2),
    项目执行价:
      r.executionCents === null ? "未知" : (r.executionCents / 100).toFixed(2),
    计入统计执行价: r.exclusion
      ? "0.00（排除）"
      : r.executionCents === null
        ? "未知"
        : (r.executionCents / 100).toFixed(2),
    价格来源: r.priceSource,
    数据提示: r.warning,
    金额性质: "项目工作量/开单金额，非实收或完成收入",
  }));
}
