import { useState } from "react";
import { useDemo, exportCsv } from "../store";
import {
  executeReport,
  newReport,
  reportCsv,
  reportDatasets,
  validateReport,
} from "../reportBuilderRules";
import type { ReportDefinition, ReportCondition } from "../reportBuilderRules";
export function ReportBuilder() {
  const { state, act } = useDemo();
  const [draft, setDraft] = useState<ReportDefinition>(newReport);
  const [executed, setExecuted] = useState<ReportDefinition | null>(null);
  const [notice, setNotice] = useState("");
  const schema = reportDatasets[draft.dataset];
  const saved = state.records.customAnalyticsReports || [];
  const result = executed ? executeReport(state, executed) : null;
  const set = (patch: Partial<ReportDefinition>) =>
    setDraft({ ...draft, ...patch });
  const toggle = (key: "fields" | "sumFields", value: string) =>
    set({
      [key]: draft[key].includes(value)
        ? draft[key].filter((x) => x !== value)
        : [...draft[key], value],
    });
  const condition = (i: number, patch: Partial<ReportCondition>) =>
    set({
      conditions: draft.conditions.map((c, j) =>
        i === j ? { ...c, ...patch } : c,
      ),
    });
  const run = () => {
    const error = validateReport(draft);
    if (error) {
      setNotice(error);
      return;
    }
    setExecuted(structuredClone(draft));
    setNotice("已按当前本地数据执行；修改数据后展示与导出同步重算。");
  };
  return (
    <section className="ops-page">
      <h2>可保存的自定义报表</h2>
      <p className="notice">
        选择安全数据字段与 AND
        筛选条件，支持字段顺序、分组、数量与数值求和。价格与未知口径继承数据源；交易源仅现金类本地记录。无需脚本表达式，数据与分组汇总使用同一过滤结果导出。
      </p>
      <div className="actions">
        <label>
          已保存报表
          <select
            value={draft.id}
            onChange={(e) => {
              const record = saved.find((r) => r.id === e.target.value);
              if (record) {
                const d = structuredClone(record.definition);
                setDraft(d);
                setExecuted(d);
                setNotice("已加载保存配置，并重新执行当前数据。");
              }
            }}
          >
            <option value="">新报表</option>
            {saved.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          onClick={() => {
            setDraft(newReport());
            setExecuted(null);
            setNotice("新报表草稿");
          }}
        >
          添加报表
        </button>
      </div>
      <div className="form-grid">
        <label>
          自定义报表名称
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label>
          报表数据源
          <select
            value={draft.dataset}
            onChange={(e) => {
              const dataset = e.target.value;
              set({
                dataset,
                fields: reportDatasets[dataset].fields
                  .slice(0, 5)
                  .map((f) => f.key),
                conditions: [],
                sumFields: [],
                groupBy: "",
              });
            }}
          >
            {Object.entries(reportDatasets).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          分组字段
          <select
            value={draft.groupBy}
            onChange={(e) => set({ groupBy: e.target.value })}
          >
            <option value="">不分组</option>
            {schema.fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>展示字段（勾选顺序即列顺序）</legend>
        <div className="actions">
          {schema.fields.map((f) => (
            <label key={f.key}>
              <input
                type="checkbox"
                checked={draft.fields.includes(f.key)}
                onChange={() => toggle("fields", f.key)}
              />
              {f.label}
            </label>
          ))}
        </div>
        {draft.fields.map((key, i) => (
          <span key={key} style={{ display: "inline-block", margin: 6 }}>
            {i + 1}. {schema.fields.find((f) => f.key === key)?.label}
            <button
              className="btn"
              aria-label={`前移${schema.fields.find((f) => f.key === key)?.label}`}
              disabled={!i}
              onClick={() => {
                const fields = [...draft.fields];
                [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
                set({ fields });
              }}
            >
              ↑
            </button>
          </span>
        ))}
      </fieldset>
      <fieldset>
        <legend>汇总配置</legend>
        <p>始终显示筛选记录数，未知数值不按 0 计为完整金额。</p>
        {schema.fields
          .filter((f) => f.numeric)
          .map((f) => (
            <label key={f.key} style={{ display: "inline-block", margin: 10 }}>
              <input
                type="checkbox"
                checked={draft.sumFields.includes(f.key)}
                onChange={() => toggle("sumFields", f.key)}
              />
              汇总 {f.label}
            </label>
          ))}
      </fieldset>
      <fieldset>
        <legend>组合筛选条件（全部满足）</legend>
        {draft.conditions.map((c, i) => (
          <div className="actions" key={i}>
            <label>
              条件{i + 1}字段
              <select
                value={c.field}
                onChange={(e) => condition(i, { field: e.target.value })}
              >
                {schema.fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              条件{i + 1}运算
              <select
                value={c.operator}
                onChange={(e) =>
                  condition(i, {
                    operator: e.target.value as ReportCondition["operator"],
                  })
                }
              >
                {["等于", "包含", "不等于", "大于等于", "小于等于"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              条件{i + 1}值
              <input
                value={c.value}
                onChange={(e) => condition(i, { value: e.target.value })}
              />
            </label>
            <button
              className="btn"
              onClick={() =>
                set({ conditions: draft.conditions.filter((_, j) => i !== j) })
              }
            >
              移除条件{i + 1}
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            set({
              conditions: [
                ...draft.conditions,
                { field: schema.fields[0].key, operator: "等于", value: "" },
              ],
            })
          }
        >
          添加筛选条件
        </button>
      </fieldset>
      <div className="actions">
        <button className="btn btn-primary" onClick={run}>
          执行报表
        </button>
        <button
          className="btn"
          onClick={() => {
            const error = validateReport(draft);
            if (error) {
              setNotice(error);
              return;
            }
            const id = draft.id || `REPORT-${crypto.randomUUID()}`;
            const definition = { ...draft, id, name: draft.name.trim() };
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "customAnalyticsReports",
                record: {
                  id,
                  name: definition.name,
                  definition,
                  updatedAt: new Date().toISOString(),
                },
              },
            });
            setDraft(definition);
            setExecuted(definition);
            setNotice("报表配置已保存，可离开后重新加载执行。");
          }}
        >
          保存报表配置
        </button>
        <button
          className="btn"
          disabled={!executed}
          onClick={() =>
            executed &&
            exportCsv(
              `${executed.name}_数据与汇总.csv`,
              reportCsv(state, executed),
            )
          }
        >
          导出数据和汇总
        </button>
      </div>
      <p role="status">{notice}</p>
      {executed && result && (
        <>
          <h3>
            {executed.name} · {result.count} 条
          </h3>
          {result.error ? (
            <p role="alert">{result.error}</p>
          ) : (
            <>
              <div className="ops-table-wrap">
                <table className="ops-table" aria-label="自定义报表执行结果">
                  <thead>
                    <tr>
                      {executed.fields.map((key) => (
                        <th key={key}>
                          {
                            reportDatasets[executed.dataset].fields.find(
                              (f) => f.key === key,
                            )?.label
                          }
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {executed.fields.map((key) => (
                          <td key={key}>{String(row[key] ?? "未知")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ops-table-wrap">
                <table className="ops-table" aria-label="自定义报表汇总">
                  <thead>
                    <tr>
                      <th>分组</th>
                      <th>记录数</th>
                      {executed.sumFields.map((key) => (
                        <th key={key}>
                          {
                            reportDatasets[executed.dataset].fields.find(
                              (f) => f.key === key,
                            )?.label
                          }
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...result.groups,
                      {
                        name: "总计",
                        count: result.count,
                        totals: result.totals,
                      },
                    ].map((g) => (
                      <tr key={g.name}>
                        <td>{g.name}</td>
                        <td>{g.count}</td>
                        {executed.sumFields.map((key) => (
                          <td key={key}>
                            {g.totals[key].known}
                            {g.totals[key].unknown
                              ? ` + ${g.totals[key].unknown}项未知`
                              : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
