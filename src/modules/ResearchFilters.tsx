import { useRef, useState } from "react";
import { ArrowDownToLine, Filter, Plus, Trash2 } from "lucide-react";
import { useDemo } from "../store";
import { downloadCsv } from "./Operations";
import type { FieldSpec, Row } from "./Operations";

export type ResearchMetric =
  "systolic" | "diastolic" | "totalCholesterol" | "fastingGlucose" | "bmi";
export type ResearchOperator = ">=" | ">" | "<=" | "<" | "=";
export type ResearchLogic = "AND" | "OR";
export type ResearchStatus = "matched" | "excluded" | "unknown";
export interface ResearchCriterion {
  id: string;
  metric: ResearchMetric;
  operator: ResearchOperator;
  threshold: number | string;
}
export type ResearchHealth = Record<string, unknown>;
export type ResearchHealthGetter = (
  patient: Row,
) => ResearchHealth | null | undefined;
export const RESEARCH_METRICS: Record<
  ResearchMetric,
  { label: string; unit: string }
> = {
  systolic: { label: "收缩压", unit: "mmHg" },
  diastolic: { label: "舒张压", unit: "mmHg" },
  totalCholesterol: { label: "总胆固醇", unit: "mmol/L" },
  fastingGlucose: { label: "空腹血糖", unit: "mmol/L" },
  bmi: { label: "体重指数 BMI", unit: "kg/m²" },
};
const labels: Record<ResearchStatus, string> = {
  matched: "符合研究条件",
  excluded: "不符合研究条件",
  unknown: "未知（数据不足）",
};
const numeric = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
export function evaluateResearchCriterion(
  health: ResearchHealth | null | undefined,
  criterion: ResearchCriterion,
) {
  const value = numeric(health?.[criterion.metric]);
  const threshold = numeric(criterion.threshold);
  const metric = RESEARCH_METRICS[criterion.metric];
  let status: ResearchStatus = "unknown";
  if (metric && value !== null && threshold !== null) {
    const comparisons: Record<ResearchOperator, boolean> = {
      ">=": value >= threshold,
      ">": value > threshold,
      "<=": value <= threshold,
      "<": value < threshold,
      "=": value === threshold,
    };
    if (typeof comparisons[criterion.operator] === "boolean")
      status = comparisons[criterion.operator] ? "matched" : "excluded";
  }
  return {
    criterion,
    value,
    threshold,
    status,
    missing: value === null,
    rule: `${metric?.label ?? criterion.metric} ${criterion.operator} ${threshold ?? "未设置"} ${metric?.unit ?? ""}`.trim(),
  };
}
/** Kleene three-valued logic: missing observations never become abnormal findings. */
export function evaluateResearchCriteria(
  health: ResearchHealth | null | undefined,
  criteria: ResearchCriterion[],
  logic: ResearchLogic = "AND",
) {
  const details = criteria.map((c) => evaluateResearchCriterion(health, c));
  const matchedCount = details.filter((d) => d.status === "matched").length;
  const unknownCount = details.filter((d) => d.status === "unknown").length;
  const excludedCount = details.length - matchedCount - unknownCount;
  let status: ResearchStatus = "unknown";
  if (details.length) {
    status =
      logic === "OR"
        ? matchedCount > 0
          ? "matched"
          : unknownCount > 0
            ? "unknown"
            : "excluded"
        : excludedCount > 0
          ? "excluded"
          : unknownCount > 0
            ? "unknown"
            : "matched";
  }
  return { status, matchedCount, unknownCount, excludedCount, details };
}
const storedHealth: ResearchHealthGetter = (patient) => patient.health ?? {};
export function buildResearchResults(
  patients: Row[],
  criteria: ResearchCriterion[],
  logic: ResearchLogic = "AND",
  getHealth: ResearchHealthGetter = storedHealth,
) {
  return patients.map((patient) => {
    const health = getHealth(patient) ?? {};
    const evaluation = evaluateResearchCriteria(health, criteria, logic);
    const values = Object.fromEntries(
      Object.entries(RESEARCH_METRICS).map(([key, metric]) => {
        const value = numeric(health[key]);
        return [
          key,
          value === null ? "未知 / 未记录" : `${value} ${metric.unit}`,
        ];
      }),
    );
    return {
      patientId: String(patient.id ?? ""),
      name: String(patient.name ?? "未命名"),
      company: String(patient.company ?? "未记录"),
      ...evaluation,
      ...values,
      statusLabel: labels[evaluation.status],
      logic,
      ruleDescription: evaluation.details
        .map((d) => d.rule)
        .join(logic === "AND" ? " 且 " : " 或 "),
      detailText: evaluation.details
        .map((d) => `${d.rule}；实测 ${d.value ?? "未知"}；${labels[d.status]}`)
        .join(" | "),
      disclaimer:
        "红创合成演示数据；自定义教育/科研筛选规则，非临床诊断、非医疗建议",
    };
  });
}
export const RESEARCH_EXPORT_FIELDS: FieldSpec[] = [
  { key: "patientId", label: "演示客户编号" },
  { key: "name", label: "演示客户姓名" },
  { key: "company", label: "单位" },
  ...Object.entries(RESEARCH_METRICS).map(([key, value]) => ({
    key,
    label: `${value.label}（${value.unit}）`,
  })),
  { key: "statusLabel", label: "研究筛选结果" },
  { key: "matchedCount", label: "符合条件数" },
  { key: "unknownCount", label: "未知条件数" },
  { key: "logic", label: "条件逻辑" },
  { key: "ruleDescription", label: "自定义筛选规则" },
  { key: "detailText", label: "逐项判断明细" },
  { key: "disclaimer", label: "演示声明" },
];

export function ResearchFilters({
  getHealth = storedHealth,
}: {
  getHealth?: ResearchHealthGetter;
}) {
  const { state } = useDemo();
  const nextId = useRef(3);
  const [logic, setLogic] = useState<ResearchLogic>("AND");
  const [criteria, setCriteria] = useState<ResearchCriterion[]>([
    { id: "1", metric: "totalCholesterol", operator: ">=", threshold: 5.2 },
    { id: "2", metric: "systolic", operator: ">=", threshold: 140 },
  ]);
  const [view, setView] = useState<"all" | ResearchStatus>("matched");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const valid =
    criteria.length > 0 && criteria.every((c) => numeric(c.threshold) !== null);
  const results = buildResearchResults(
    state.patients,
    criteria,
    logic,
    getHealth,
  );
  const rows = valid
    ? results.filter((r) => view === "all" || r.status === view)
    : [];
  const count = (status: ResearchStatus) =>
    valid ? results.filter((r) => r.status === status).length : 0;
  const update = (id: string, change: Partial<ResearchCriterion>) => {
    setCriteria((old) =>
      old.map((c) => (c.id === id ? { ...c, ...change } : c)),
    );
    setNotice("");
  };
  return (
    <section
      className="panel ops-panel"
      aria-label="红创科研多指标筛选"
      style={{ marginTop: 20 }}
    >
      <div className="ops-panel-title">
        <div>
          <h2>
            <Filter size={19} aria-hidden="true" /> 科研多指标筛选
          </h2>
          <p>T0401 · 红创研究队列演示 · 多条件实时组合与明细导出</p>
        </div>
        <button
          className="btn"
          disabled={!valid || rows.length === 0}
          onClick={() => {
            downloadCsv("红创科研筛选_合成演示", rows, RESEARCH_EXPORT_FIELDS);
            setNotice(
              `已生成当前表格的 ${rows.length} 行 CSV（包含筛选规则及未知值标记）。`,
            );
          }}
        >
          <ArrowDownToLine size={16} /> 导出当前结果（{rows.length}）
        </button>
      </div>
      <div className="ops-feedback" style={{ marginBottom: 16 }}>
        仅使用合成演示数据。以下数值是可编辑的教育/科研入组选例，不代表临床异常阈值，不用于诊断或医疗建议。缺失、空白或无效指标一律标记“未知”，不会自动判断为异常。
      </div>
      <div
        className="actions"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}
      >
        <label className="field">
          条件组合
          <select
            aria-label="科研条件组合"
            value={logic}
            onChange={(e) => {
              setLogic(e.target.value as ResearchLogic);
              setNotice("");
            }}
          >
            <option value="AND">AND · 全部条件符合</option>
            <option value="OR">OR · 任一条件符合</option>
          </select>
        </label>
        <button
          className="btn"
          onClick={() => {
            setCriteria((old) => [
              ...old,
              {
                id: String(nextId.current++),
                metric: "bmi",
                operator: ">=",
                threshold: "",
              },
            ]);
            setNotice("");
          }}
        >
          <Plus size={16} /> 添加指标条件
        </button>
      </div>
      {criteria.map((criterion, index) => (
        <div
          key={criterion.id}
          style={{
            display: "flex",
            alignItems: "end",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <label className="field" style={{ flex: "1 1 180px" }}>
            指标 {index + 1}
            <select
              aria-label={`指标 ${index + 1}`}
              value={criterion.metric}
              onChange={(e) =>
                update(criterion.id, {
                  metric: e.target.value as ResearchMetric,
                })
              }
            >
              {Object.entries(RESEARCH_METRICS).map(([key, metric]) => (
                <option value={key} key={key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "0 1 110px" }}>
            比较符
            <select
              aria-label={`比较符 ${index + 1}`}
              value={criterion.operator}
              onChange={(e) =>
                update(criterion.id, {
                  operator: e.target.value as ResearchOperator,
                })
              }
            >
              {[">=", ">", "<=", "<", "="].map((op) => (
                <option value={op} key={op}>
                  {op}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 160px" }}>
            研究阈值（{RESEARCH_METRICS[criterion.metric].unit}）
            <input
              aria-label={`研究阈值 ${index + 1}`}
              type="number"
              step="any"
              value={criterion.threshold}
              onChange={(e) =>
                update(criterion.id, { threshold: e.target.value })
              }
              aria-invalid={numeric(criterion.threshold) === null}
            />
          </label>
          <button
            className="btn"
            aria-label={`删除条件 ${index + 1}`}
            onClick={() => {
              setCriteria((old) => old.filter((c) => c.id !== criterion.id));
              setNotice("");
            }}
          >
            <Trash2 size={16} /> 删除
          </button>
        </div>
      ))}
      {!valid && (
        <p role="alert">
          请添加至少一个指标，并为每个条件填写有效数值；未完成的规则不会生成结果或导出。
        </p>
      )}
      <p>
        AND：任一条件不符合即排除；OR：任一条件符合即可入选。其余包含未知值的情况保留为未知。
      </p>
      <div role="status" aria-live="polite" style={{ margin: "16px 0" }}>
        共 {state.patients.length} 人 · 符合 {count("matched")} 人 · 不符合{" "}
        {count("excluded")} 人 · 判断未知 {count("unknown")} 人 · 含未知条件{" "}
        {valid ? results.filter((r) => r.unknownCount > 0).length : 0} 人
      </div>
      <label className="field" style={{ maxWidth: 260, marginBottom: 16 }}>
        结果范围（表格与 CSV 一致）
        <select
          aria-label="科研结果范围"
          value={view}
          onChange={(e) => {
            setView(e.target.value as typeof view);
            setNotice("");
          }}
        >
          <option value="matched">仅符合研究条件</option>
          <option value="unknown">仅判断未知</option>
          <option value="excluded">仅不符合研究条件</option>
          <option value="all">全部评估对象</option>
        </select>
      </label>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>客户 / 编号</th>
              <th>单位</th>
              <th>研究筛选结果</th>
              <th>符合 / 总条件</th>
              <th>未知条件数</th>
              <th>实测值与判断</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.patientId}>
                <td>
                  {row.name}
                  <br />
                  <small>{row.patientId}</small>
                </td>
                <td>{row.company}</td>
                <td>{row.statusLabel}</td>
                <td>
                  {row.matchedCount} / {criteria.length}
                </td>
                <td>{row.unknownCount}</td>
                <td>
                  <button
                    className="btn"
                    aria-expanded={expanded === row.patientId}
                    onClick={() =>
                      setExpanded(
                        expanded === row.patientId ? null : row.patientId,
                      )
                    }
                  >
                    {expanded === row.patientId ? "收起明细" : "查看明细"}
                  </button>
                  {expanded === row.patientId && (
                    <div style={{ marginTop: 10 }}>
                      {row.details.map((d) => (
                        <p key={d.criterion.id}>
                          {d.rule}：实测{" "}
                          {d.value === null
                            ? "未知 / 未记录"
                            : `${d.value} ${RESEARCH_METRICS[d.criterion.metric].unit}`}{" "}
                          · {labels[d.status]}
                        </p>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p style={{ padding: 20 }}>
            当前没有可展示的结果。可调整条件或结果范围；缺失数据请通过档案维护补充。
          </p>
        )}
      </div>
      {notice && (
        <p role="status" className="ops-feedback">
          {notice}
        </p>
      )}
    </section>
  );
}
export default ResearchFilters;
