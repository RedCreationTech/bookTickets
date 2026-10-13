import { useState } from "react";
import { useDemo } from "../store";
import type { Row } from "./Operations";
export const assessmentTemplateFields = [
  "patientName",
  "assessmentType",
  "date",
  "summary",
  "disclaimer",
] as const;
export const defaultAssessmentTemplate: Row = {
  id: "DEFAULT-ASSESSMENT",
  name: "红创默认教育性评估报告",
  category: "评估报告模板",
  status: "已启用",
  assessmentType: "通用",
  version: 1,
  description:
    "红创健康评估流程报告\n客户：{{patientName}}（{{patientId}}）\n评估类型：{{assessmentType}}\n日期：{{date}}\n摘要：{{summary}}\n演示得分：{{score}}\n维度：{{dimensions}}\n采集指标：{{metrics}}\n采集答案：{{answers}}\n说明：{{disclaimer}}",
};
const bodyOf = (template: Row) => String(template.description ?? "");
export function validateAssessmentTemplate(template: Row) {
  const body = bodyOf(template);
  const tokens = [...body.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((m) => m[1]);
  const allowed = [
    "patientName",
    "patientId",
    "assessmentType",
    "date",
    "summary",
    "score",
    "dimensions",
    "answers",
    "metrics",
    "disclaimer",
    "review",
  ];
  const errors: string[] = [];
  if (!String(template.name || "").trim()) errors.push("模板名称为必填。");
  if (!body.trim() || body.length > 10000)
    errors.push("模板正文须为 1–10000 字符。");
  for (const key of assessmentTemplateFields)
    if (!tokens.includes(key)) errors.push(`缺少必填变量 {{${key}}}。`);
  for (const key of [...new Set(tokens)])
    if (!allowed.includes(key)) errors.push(`不支持变量 {{${key}}}。`);
  if (
    body.replace(/{{\s*[^{}]+?\s*}}/g, "").includes("{{") ||
    body.replace(/{{\s*[^{}]+?\s*}}/g, "").includes("}}")
  )
    errors.push("变量括号不完整。");
  return errors;
}
export function templateFitsAssessment(template: Row, assessmentType: string) {
  if (!["已启用", "已通过", "有效"].includes(template.status)) return false;
  if (Array.isArray(template.allowedTypes) && template.allowedTypes.length)
    return (
      template.allowedTypes.includes(assessmentType) ||
      template.allowedTypes.includes("通用")
    );
  return (
    !template.assessmentType ||
    template.assessmentType === "通用" ||
    template.assessmentType === assessmentType
  );
}
export function renderAssessmentTemplate(
  template: Row,
  report: Row,
  patient: Row = {},
) {
  const values: Record<string, string> = {
    patientName: String(patient.name || report.patientName || "未登记"),
    patientId: String(report.patientId || ""),
    assessmentType: String(report.category || ""),
    date: String(report.date || ""),
    summary: String(report.description || "未登记"),
    score:
      report.score?.total === undefined
        ? "未登记"
        : `${report.score.total} / ${report.score.max ?? "未登记"}`,
    dimensions:
      (report.score?.dimensions || [])
        .map((d: Row) => `${d.name}：${d.value} / ${d.max}`)
        .join("；") || "未登记",
    answers:
      Object.entries(report.answers || {})
        .map(([key, value]) => `${key}：${String(value)}`)
        .join("；") || "未登记",
    disclaimer: String(
      report.score?.disclaimer || "合成教育性演示，不是临床结论或诊疗建议。",
    ),
    review: String(report.review || "待专业复核"),
  };
  values.metrics =
    Object.entries(report.metricSnapshot || {})
      .map(([key, value]) => `${key}：${value ?? "未登记"}`)
      .join("；") || "未登记";
  if (report.reportSections?.includes("采集指标") === false)
    values.metrics = "本套餐未包含采集指标章节";
  if (report.reportSections?.includes("问卷答案") === false)
    values.answers = "本套餐未包含问卷答案章节";
  if (report.reportSections?.includes("演示结果") === false) {
    values.score = "本套餐未包含演示结果章节";
    values.dimensions = "本套餐未包含演示结果章节";
  }
  const errors = validateAssessmentTemplate(template);
  if (!templateFitsAssessment(template, String(report.category)))
    errors.push("模板未启用或不适用于当前评估类型。");
  return {
    text: bodyOf(template).replace(
      /{{\s*([^{}]+?)\s*}}/g,
      (_, key: string) => values[key] ?? `未支持变量：${key}`,
    ),
    errors,
  };
}
export function applyAssessmentTemplate(
  report: Row,
  patient: Row,
  template: Row = defaultAssessmentTemplate,
) {
  const rendered = renderAssessmentTemplate(template, report, patient);
  if (rendered.errors.length) throw new Error(rendered.errors.join(" "));
  return {
    ...report,
    patientName: patient.name,
    reportTemplate: {
      id: template.id,
      name: template.name,
      description: bodyOf(template),
      assessmentType: template.assessmentType || "通用",
      version: template.version || 1,
      updatedAt: template.updatedAt || null,
    },
    renderedTemplateText: rendered.text,
    templateAppliedAt: new Date().toISOString(),
  };
}
export function assessmentExportContent(report: Row) {
  return String(report.renderedTemplateText || "");
}
export function AssessmentTemplates({
  report,
  patient,
  assessmentTypes,
  onApply,
}: {
  report: Row;
  patient: Row;
  assessmentTypes: string[];
  onApply: (report: Row) => void;
}) {
  const { state, act } = useDemo();
  const configured = (state.records.clinicalConfig || []).filter(
    (r) => r.category === "评估报告模板",
  );
  const choices = [defaultAssessmentTemplate, ...configured];
  const [selected, setSelected] = useState(
    report.reportTemplate?.id || defaultAssessmentTemplate.id,
  );
  const chosen =
    choices.find((t) => t.id === selected) || defaultAssessmentTemplate;
  const [draft, setDraft] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const rendered = renderAssessmentTemplate(chosen, report, patient);
  return (
    <section
      style={{
        margin: "18px 0",
        textAlign: "left",
        borderTop: "1px solid #dce7e5",
        paddingTop: 16,
      }}
      aria-label="评估报告模板应用"
    >
      <h3>评估报告模板</h3>
      <p>
        必填变量：客户 patientName、评估类型 assessmentType、日期 date、摘要
        summary、演示边界 disclaimer。可选
        patientId、score、dimensions、metrics、answers、review。格式为双花括号；仅安全文本插值，不执行
        HTML 或脚本。
      </p>
      <label className="ops-field">
        选用评估报告模板
        <select
          aria-label="选用评估报告模板"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setDraft(null);
            setNotice("");
          }}
        >
          {choices.map((t) => (
            <option
              key={t.id}
              value={t.id}
              disabled={!templateFitsAssessment(t, report.category)}
            >
              {t.name} · {t.assessmentType || "通用"} · {t.status}
            </option>
          ))}
        </select>
      </label>
      <div className="ops-action-wrap">
        <button
          className="btn"
          onClick={() => {
            setDraft({
              ...chosen,
              id:
                chosen.id === defaultAssessmentTemplate.id
                  ? "ASSESSMENT-TPL-" + crypto.randomUUID()
                  : chosen.id,
              name:
                chosen.id === defaultAssessmentTemplate.id
                  ? "新的合成评估模板"
                  : chosen.name,
            });
            setNotice("");
          }}
        >
          编辑或另存模板
        </button>
        <button
          className="btn btn-primary"
          disabled={rendered.errors.length > 0}
          onClick={() => {
            onApply(applyAssessmentTemplate(report, patient, chosen));
            setNotice("模板已复制到本份报告；保存报告后保留独立快照。");
          }}
        >
          应用所选模板到报告
        </button>
      </div>
      {rendered.errors.length > 0 && (
        <p role="alert">{rendered.errors.join(" ")}</p>
      )}
      {draft && (
        <div className="ops-inline-box">
          <label className="ops-field">
            模板名称
            <input
              aria-label="评估模板名称"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="ops-field">
            适用评估类型
            <select
              aria-label="评估模板适用类型"
              value={draft.assessmentType || "通用"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  assessmentType: e.target.value,
                  allowedTypes: [],
                })
              }
            >
              {["通用", ...assessmentTypes].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            模板正文
            <textarea
              aria-label="评估模板正文"
              rows={8}
              maxLength={10000}
              value={draft.description || ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <div className="ops-action-wrap">
            <button className="btn" onClick={() => setDraft(null)}>
              取消模板编辑
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const errors = validateAssessmentTemplate(draft);
                if (errors.length) {
                  setNotice(errors.join(" "));
                  return;
                }
                const record = {
                  ...draft,
                  id: draft.id || "ASSESSMENT-TPL-" + crypto.randomUUID(),
                  category: "评估报告模板",
                  status: "已启用",
                  version: Number(draft.version || 0) + 1,
                  updatedAt: new Date().toISOString(),
                };
                act({
                  type: "UPSERT_RECORD",
                  payload: { collection: "clinicalConfig", record },
                });
                setSelected(record.id);
                setDraft(null);
                setNotice(
                  "模板已保存到共享健康业务配置。请应用到本份报告；历史报告快照不随模板修改。",
                );
              }}
            >
              保存评估模板配置
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <h4>当前报告模板预览 · {report.reportTemplate?.name || "尚未应用"}</h4>
      <div
        data-testid="assessment-template-preview"
        style={{
          whiteSpace: "pre-wrap",
          padding: 14,
          background: "#f3f8f7",
          borderRadius: 8,
        }}
      >
        {assessmentExportContent(report) || "请选择并应用模板。"}
      </div>
      <button
        className="btn"
        style={{ marginTop: 12 }}
        disabled={!report.renderedTemplateText}
        onClick={() => {
          const text = assessmentExportContent(report);
          const url = URL.createObjectURL(
            new Blob([text], { type: "text/plain;charset=utf-8" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `红创-评估报告-${report.id}.txt`;
          link.click();
          URL.revokeObjectURL(url);
          setNotice(
            "已导出当前预览的同一报告文本，包含模板快照与合成边界说明。",
          );
        }}
      >
        导出当前模板报告 TXT
      </button>
    </section>
  );
}
export default AssessmentTemplates;
