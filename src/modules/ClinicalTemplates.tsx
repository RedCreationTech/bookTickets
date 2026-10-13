import { useState } from "react";
import type { DemoState, Appointment } from "../model";

export function renderClinicalTemplate(
  template: string,
  fields: Record<string, string>,
) {
  const unknown = [...template.matchAll(/\{([^{}]+)\}/g)]
    .map((m) => m[1])
    .filter((key) => !(key in fields));
  if (unknown.length)
    return {
      text: "",
      error: `未支持的模板字段：${[...new Set(unknown)].join("、")}`,
    };
  return {
    text: template.replace(/\{([^{}]+)\}/g, (_, key) => fields[key]),
    error: "",
  };
}
export function getClinicalTemplates(
  state: DemoState,
  kind: "summary" | "reject",
) {
  const category = kind === "summary" ? "三级小结模板" : "驳回意见";
  const defaults =
    kind === "summary"
      ? [
          {
            id: "CT-normal",
            name: "一般 · 所见核对",
            level: "一般",
            description:
              "{姓名}，体检号{体检号}：已核对{项目}检查所见，请结合完整报告复核（合成演示）。",
          },
          {
            id: "CT-watch",
            name: "关注 · 补充记录",
            level: "关注",
            description:
              "{姓名}的{项目}需补充相关记录；当前{日期}检查结果仅供演示。",
          },
          {
            id: "CT-important",
            name: "重要 · 人工复核",
            level: "重要",
            description:
              "{姓名}，{体检号}：请对{项目}进行人工复核并记录处理结果，模板不作医学判断。",
          },
        ]
      : [
          {
            id: "CT-reject",
            name: "补充结果与小结",
            level: "",
            description:
              "请补充{姓名}（{体检号}）的{项目}检查记录与小结，复核后重新提交。",
          },
        ];
  return [
    ...defaults,
    ...(state.records.examDictionaries || [])
      .filter(
        (r) =>
          (r.category === category ||
            (kind === "reject" && r.category === "驳回意见模板")) &&
          r.status !== "已停用",
      )
      .map((r) => ({ ...r, level: r.level || "一般" })),
  ];
}
export function ClinicalTemplatePicker({
  state,
  appointment,
  kind,
  onApply,
  disabled = false,
}: {
  state: DemoState;
  appointment: Appointment;
  kind: "summary" | "reject";
  onApply: (text: string, level: string) => void;
  disabled?: boolean;
}) {
  const [chosen, setChosen] = useState("");
  const [level, setLevel] = useState("全部等级");
  const [message, setMessage] = useState("");
  const templates = getClinicalTemplates(state, kind).filter(
    (t) => kind === "reject" || level === "全部等级" || t.level === level,
  );
  const selected = templates.find((t) => t.id === chosen);
  const patient = state.patients.find((p) => p.id === appointment.patientId);
  const preview = selected
    ? renderClinicalTemplate(String(selected.description || ""), {
        姓名: patient?.name || "未登记",
        体检号: appointment.id,
        日期: appointment.date,
        项目: appointment.items.join("、"),
        科室: appointment.department || "全科检查",
      })
    : { text: "", error: "" };
  return (
    <fieldset className="clinical-template-picker">
      <legend>
        {kind === "summary" ? "选用三级分检小结模板" : "选用驳回意见模板"}
      </legend>
      <div className="form-grid">
        {kind === "summary" && (
          <label>
            模板小结等级
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setChosen("");
                setMessage("");
              }}
            >
              <option>全部等级</option>
              {[
                ...new Set(
                  getClinicalTemplates(state, kind).map((t) => t.level),
                ),
              ].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {kind === "summary" ? "分检小结模板" : "驳回意见模板"}
          <select
            value={chosen}
            onChange={(e) => {
              setChosen(e.target.value);
              setMessage("");
            }}
          >
            <option value="">请选择模板</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {preview.text && (
        <p style={{ whiteSpace: "pre-wrap" }} aria-label="临床模板预览">
          {preview.text}
        </p>
      )}
      {preview.error && <p role="alert">{preview.error}</p>}
      <button
        className="btn"
        disabled={disabled || !preview.text || !!preview.error}
        onClick={() => {
          onApply(preview.text, selected?.level || "一般");
          setMessage("模板文本已填入当前编辑区，请复核后保存业务记录。");
        }}
      >
        应用所选模板
      </button>
      {message && <p role="status">{message}</p>}
      <p className="muted">
        读取“系统配置→体检项目与模板”。支持姓名、体检号、日期、项目、科室变量；模板只辅助记录，不自动确认检查或审核。
      </p>
    </fieldset>
  );
}
