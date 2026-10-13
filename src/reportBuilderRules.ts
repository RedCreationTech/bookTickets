import type { DemoState } from "./model";
import { buildOrderAnalytics } from "./analyticsData";
import { buildProjectRows } from "./projectStatisticsRules";
import {
  buildFinancialTransactions,
  buildReviewWorkloads,
} from "./financialAnalyticsRules";
export interface ReportField {
  key: string;
  label: string;
  numeric?: boolean;
}
export const reportDatasets: Record<
  string,
  { label: string; fields: ReportField[] }
> = {
  orders: {
    label: "实际订单与进度",
    fields: [
      { key: "id", label: "订单编号" },
      { key: "name", label: "姓名" },
      { key: "company", label: "单位" },
      { key: "kind", label: "个团检" },
      { key: "date", label: "体检日期" },
      { key: "creator", label: "创建人" },
      { key: "seller", label: "业务员" },
      { key: "status", label: "状态" },
      { key: "completedCount", label: "完成项目数", numeric: true },
      { key: "itemCount", label: "有效项目数", numeric: true },
      { key: "originalAmount", label: "有效原价金额", numeric: true },
      { key: "executionAmount", label: "有效执行价金额", numeric: true },
    ],
  },
  projects: {
    label: "有效开单项目",
    fields: [
      { key: "appointmentId", label: "订单编号" },
      { key: "name", label: "姓名" },
      { key: "company", label: "单位" },
      { key: "item", label: "项目" },
      { key: "doctor", label: "医生" },
      { key: "department", label: "科室" },
      { key: "room", label: "诊室" },
      { key: "seller", label: "业务员" },
      { key: "orderDate", label: "开单日期" },
      { key: "resultDate", label: "结果日期" },
      { key: "reviewFlow", label: "审核流程" },
      { key: "completed", label: "完成" },
      { key: "quantity", label: "项目数量", numeric: true },
      { key: "originalAmount", label: "原价金额", numeric: true },
      { key: "executionAmount", label: "执行价金额", numeric: true },
      { key: "priceSource", label: "价格依据" },
    ],
  },
  transactions: {
    label: "实际本地现金类交易",
    fields: [
      { key: "id", label: "交易编号" },
      { key: "transactionId", label: "原始交易编号" },
      { key: "date", label: "交易日期" },
      { key: "at", label: "交易时间" },
      { key: "channel", label: "渠道" },
      { key: "item", label: "检查项目" },
      { key: "direction", label: "收退方向" },
      { key: "appointmentId", label: "订单编号" },
      { key: "name", label: "客户" },
      { key: "company", label: "单位" },
      { key: "kind", label: "个团检" },
      { key: "seller", label: "业务员" },
      { key: "type", label: "交易类型" },
      { key: "amount", label: "收退款金额", numeric: true },
      { key: "source", label: "金额依据" },
    ],
  },
  reviews: {
    label: "审核完成节点",
    fields: [
      { key: "appointmentId", label: "订单编号" },
      { key: "name", label: "客户" },
      { key: "company", label: "单位" },
      { key: "doctor", label: "审核医生" },
      { key: "stage", label: "审核节点" },
      { key: "date", label: "完成日期" },
      { key: "completedAt", label: "完成时间" },
      { key: "quantity", label: "节点数量", numeric: true },
    ],
  },
};
export type ReportCondition = {
  field: string;
  operator: "等于" | "包含" | "不等于" | "大于等于" | "小于等于";
  value: string;
};
export interface ReportDefinition {
  id: string;
  name: string;
  dataset: string;
  fields: string[];
  conditions: ReportCondition[];
  groupBy: string;
  sumFields: string[];
}
export const newReport = (): ReportDefinition => ({
  id: "",
  name: "",
  dataset: "orders",
  fields: [
    "id",
    "name",
    "company",
    "kind",
    "date",
    "itemCount",
    "executionAmount",
  ],
  conditions: [],
  groupBy: "company",
  sumFields: ["itemCount", "executionAmount"],
});
export function reportSource(
  state: DemoState,
  dataset: string,
): Record<string, any>[] {
  if (dataset === "orders")
    return buildOrderAnalytics(state)
      .filter((r) => !r.cancelled)
      .map((r) => ({
        ...r,
        originalAmount: r.originalCents === null ? null : r.originalCents / 100,
        executionAmount:
          r.executionCents === null ? null : r.executionCents / 100,
      }));
  if (dataset === "projects")
    return buildProjectRows(state)
      .filter((r) => !r.exclusion)
      .map((r) => ({
        ...r,
        quantity: 1,
        completed: r.completed ? "是" : "否",
        originalAmount: r.originalCents === null ? null : r.originalCents / 100,
        executionAmount:
          r.executionCents === null ? null : r.executionCents / 100,
      }));
  if (dataset === "transactions")
    return buildFinancialTransactions(state)
      .filter((r) => r.cash)
      .map((r) => ({ ...r, amount: r.amountCents / 100 }));
  if (dataset === "reviews")
    return buildReviewWorkloads(state).map((r) => ({ ...r, quantity: 1 }));
  return [];
}
export function validateReport(d: ReportDefinition) {
  const schema = reportDatasets[d.dataset];
  if (!d.name.trim()) return "请填写报表名称";
  if (!schema) return "请选择有效数据源";
  const keys = schema.fields.map((f) => f.key);
  if (
    !d.fields.length ||
    new Set(d.fields).size !== d.fields.length ||
    d.fields.some((k) => !keys.includes(k))
  )
    return "请选择不重复的有效展示字段";
  if (d.groupBy && !keys.includes(d.groupBy)) return "分组字段无效";
  if (
    d.sumFields.some(
      (k) => !schema.fields.some((f) => f.key === k && f.numeric),
    )
  )
    return "仅允许数值字段求和";
  for (const c of d.conditions) {
    if (
      !keys.includes(c.field) ||
      !["等于", "包含", "不等于", "大于等于", "小于等于"].includes(
        c.operator,
      ) ||
      !c.value.trim()
    )
      return "筛选条件必须具有有效字段、运算符和值";
    const field = schema.fields.find((f) => f.key === c.field);
    if (
      field?.numeric &&
      ["大于等于", "小于等于", "等于", "不等于"].includes(c.operator) &&
      !Number.isFinite(Number(c.value))
    )
      return "数值筛选值必须是有限数字";
  }
  return "";
}
export function executeReport(state: DemoState, d: ReportDefinition) {
  const error = validateReport(d);
  if (error)
    return {
      error,
      rows: [] as Record<string, any>[],
      groups: [] as any[],
      totals: {} as Record<string, { known: number; unknown: number }>,
      count: 0,
    };
  const schema = reportDatasets[d.dataset];
  const rows = reportSource(state, d.dataset).filter((row) =>
    d.conditions.every((c) => {
      const actual = row[c.field];
      if (actual === null || actual === undefined) return false;
      const numeric = schema.fields.find((f) => f.key === c.field)?.numeric;
      const a = numeric ? Number(actual) : String(actual),
        b = numeric ? Number(c.value) : c.value;
      switch (c.operator) {
        case "等于":
          return a === b;
        case "不等于":
          return a !== b;
        case "包含":
          return String(actual).includes(c.value);
        case "大于等于":
          return a >= b;
        case "小于等于":
          return a <= b;
      }
    }),
  );
  const sums = (rs: Record<string, any>[]) =>
    Object.fromEntries(
      d.sumFields.map((key) => [
        key,
        {
          known:
            Math.round(
              rs.reduce(
                (n, r) =>
                  n +
                  (typeof r[key] === "number" && Number.isFinite(r[key])
                    ? r[key]
                    : 0),
                0,
              ) * 100,
            ) / 100,
          unknown: rs.filter(
            (r) => typeof r[key] !== "number" || !Number.isFinite(r[key]),
          ).length,
        },
      ]),
    );
  const groups = d.groupBy
    ? [...new Set(rows.map((r) => String(r[d.groupBy] ?? "未知")))].map(
        (name) => {
          const rs = rows.filter(
            (r) => String(r[d.groupBy] ?? "未知") === name,
          );
          return { name, count: rs.length, totals: sums(rs) };
        },
      )
    : [];
  return { error: "", rows, groups, totals: sums(rows), count: rows.length };
}
export function reportCsv(state: DemoState, d: ReportDefinition) {
  const result = executeReport(state, d);
  if (result.error) return [];
  const schema = reportDatasets[d.dataset];
  const output: Record<string, any>[] = result.rows.map((row) => ({
    行类型: "数据",
    分组: d.groupBy ? row[d.groupBy] : "",
    记录数: 1,
    ...Object.fromEntries(
      d.fields.map((key) => [
        schema.fields.find((f) => f.key === key)!.label,
        row[key] ?? "未知",
      ]),
    ),
    ...Object.fromEntries(
      d.sumFields.map((key) => [
        `汇总:${schema.fields.find((f) => f.key === key)!.label}`,
        "",
      ]),
    ),
  }));
  const aggregate = (
    type: string,
    name: string,
    count: number,
    sums: Record<string, { known: number; unknown: number }>,
  ) => ({
    行类型: type,
    分组: name,
    记录数: count,
    ...Object.fromEntries(
      d.fields.map((key) => [
        schema.fields.find((f) => f.key === key)!.label,
        "",
      ]),
    ),
    ...Object.fromEntries(
      d.sumFields.map((key) => {
        const v = sums[key];
        return [
          `汇总:${schema.fields.find((f) => f.key === key)!.label}`,
          v.unknown ? `${v.known}（已知）+ ${v.unknown}项未知` : v.known,
        ];
      }),
    ),
  });
  output.push(
    ...result.groups.map((g) =>
      aggregate("分组汇总", g.name, g.count, g.totals),
    ),
    aggregate("总计", "全部筛选数据", result.count, result.totals),
  );
  return output;
}
