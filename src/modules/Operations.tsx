import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Filter,
  History,
  Layers3,
  MessageSquare,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useDemo } from "../store";
import "./operations.css";

export type Row = Record<string, any>;
export type FieldSpec = {
  key: string;
  label: string;
  type?: "number" | "date" | "textarea" | "select" | "email";
  options?: string[];
  required?: boolean;
  min?: number;
  placeholder?: string;
};
export type WorkspaceSpec = {
  key: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  seeds: Row[];
  statuses?: string[];
  transitions?: Record<string, string[]>;
  kind?: string;
  clauses?: string;
};
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix = "R") =>
  `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const standard = ["草稿", "待审核", "已通过", "已停用"];
const f = (
  key: string,
  label: string,
  type: FieldSpec["type"] = "text" as any,
  options?: string[],
  required = true,
): FieldSpec => ({ key, label, type, options, required });
const seed = (id: string, name: string, extra: Row = {}) => ({
  id,
  name,
  status: "已启用",
  owner: "陈晓 · 健康管理师",
  date: "2026-10-13",
  ...extra,
});
export function downloadCsv(name: string, rows: Row[], fields: FieldSpec[]) {
  const cell = (value: any) => {
    let s = String(value ?? "");
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const text =
    "\uFEFF" +
    [
      fields.map((x) => cell(x.label)).join(","),
      ...rows.map((r) => fields.map((x) => cell(r[x.key])).join(",")),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}_${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useCollection(spec: WorkspaceSpec) {
  const demo = useDemo() as any;
  const { state, act } = demo;
  useEffect(() => {
    if (!state.records?.[spec.key])
      for (const record of spec.seeds)
        act({
          type: "UPSERT_RECORD",
          payload: { collection: spec.key, record },
        });
  }, [spec.key]);
  return {
    rows: (state.records?.[spec.key] ?? spec.seeds) as Row[],
    state,
    act,
  };
}
export function Tag({ value }: { value: any }) {
  const v = String(value ?? "未设置");
  return (
    <span
      className={`ops-tag ${/通过|完成|启用|发布|已签收|已结算|已回复|已解决|在售|已入库/.test(v) ? "good" : /拒绝|驳回|取消|异常|紧急|高|失败/.test(v) ? "bad" : /待|处理中|服务中|中/.test(v) ? "warn" : ""}`}
    >
      {v}
    </span>
  );
}
export function Metrics({
  items,
}: {
  items: { label: string; value: any; note?: string; icon?: any }[];
}) {
  return (
    <div className="ops-metrics">
      {items.map((m, i) => {
        const Icon =
          m.icon || [ClipboardList, Clock3, CheckCircle2, Activity][i % 4];
        return (
          <div className="ops-metric" key={m.label}>
            <span className="ops-metric-icon">
              <Icon size={20} />
            </span>
            <div>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <small>{m.note || "当前演示工作区"}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="ops-notice">
      <ShieldCheck size={15} />
      <span>{children}</span>
    </div>
  );
}
export function FormFields({
  fields,
  draft,
  setDraft,
}: {
  fields: FieldSpec[];
  draft: Row;
  setDraft: (x: Row) => void;
}) {
  return (
    <>
      {fields.map((field) => (
        <label
          className={`ops-field ${field.type === "textarea" ? "ops-span2" : ""}`}
          key={field.key}
        >
          <span>
            {field.label}
            {field.required && <b> *</b>}
          </span>
          {field.type === "select" ? (
            <select
              required={field.required}
              value={draft[field.key] ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, [field.key]: e.target.value })
              }
            >
              <option value="">请选择</option>
              {field.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : field.type === "textarea" ? (
            <textarea
              rows={4}
              required={field.required}
              placeholder={field.placeholder || `填写${field.label}`}
              value={draft[field.key] ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, [field.key]: e.target.value })
              }
            />
          ) : (
            <input
              required={field.required}
              type={field.type || "text"}
              min={field.type === "number" ? (field.min ?? 0) : undefined}
              step={field.type === "number" ? "any" : undefined}
              placeholder={field.placeholder || `填写${field.label}`}
              value={draft[field.key] ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [field.key]:
                    field.type === "number"
                      ? e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </label>
      ))}
    </>
  );
}
const cleanDate = () => new Date().toLocaleString("zh-CN", { hour12: false });
export function RecordWorkspace({
  spec,
  compact = false,
}: {
  spec: WorkspaceSpec;
  compact?: boolean;
}) {
  const { rows, act } = useCollection(spec);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部状态");
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<Row | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [adjust, setAdjust] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tracking, setTracking] = useState("");
  const [mine, setMine] = useState(false);
  useEffect(() => {
    setQuery("");
    setFilter("全部状态");
    setSelected([]);
    setDetail(null);
    setEditor(null);
    setNotice("");
    setError("");
    setMine(false);
  }, [spec.key]);
  const visible = rows.filter(
    (r) =>
      (!mine || String(r.owner).includes("当前")) &&
      (filter === "全部状态" || r.status === filter) &&
      (!query || JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),
  );
  const record = rows.find((r) => r.id === detail);
  const statuses = spec.statuses || ["已启用", "已停用"];
  const persist = (r: Row, message: string) => {
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: spec.key,
        record: {
          ...r,
          updatedAt: cleanDate(),
          history: [
            ...(r.history || []),
            { at: cleanDate(), text: message, by: "当前管理员" },
          ],
        },
      },
    });
    act({
      type: "ADD_AUDIT",
      payload: {
        message: `${spec.label} · ${r.name || r.title || r.id} · ${message}`,
      },
    });
    setNotice(message);
    setError("");
  };
  const create = () =>
    setEditor(
      Object.fromEntries([
        ["id", uid()],
        ["status", statuses[0]],
        ["date", today()],
        ...spec.fields
          .filter((x) => x.type === "number")
          .map((x) => [x.key, 0]),
      ]),
    );
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    const missing = spec.fields.find(
      (x) =>
        x.required &&
        (editor[x.key] === undefined || String(editor[x.key]).trim() === ""),
    );
    if (missing) {
      setError(`请填写${missing.label}`);
      return;
    }
    if (
      spec.fields.some(
        (x) =>
          x.type === "number" &&
          (!Number.isFinite(Number(editor[x.key])) ||
            Number(editor[x.key]) < (x.min ?? 0)),
      )
    ) {
      setError("数值必须有效且不能小于允许范围。");
      return;
    }
    persist(
      editor,
      rows.some((r) => r.id === editor.id) ? "资料已更新" : "已新建记录",
    );
    setEditor(null);
  };
  const transition = (r: Row, status: string) => {
    if (/拒绝|驳回|取消|退回|关闭|退款/.test(status) && !note.trim()) {
      setError("请先填写处理说明，确保全过程可追溯。");
      return;
    }
    if (
      spec.key === "shopOrders" &&
      status === "已发货" &&
      !r.tracking?.trim()
    ) {
      setError("发货前请保存模拟物流单号。");
      return;
    }
    persist(
      {
        ...r,
        status,
        ...(spec.key === "consultations" && status === "已领取"
          ? { owner: "当前医生（演示）" }
          : {}),
      },
      `状态变更：${r.status} → ${status}${note.trim() ? `；${note.trim()}` : ""}`,
    );
    setNote("");
  };
  const addNote = () => {
    if (!record) return;
    if (!note.trim()) {
      setError("请填写处理记录。");
      return;
    }
    persist(
      record,
      `${spec.kind === "messages" ? "模拟回复（未对外发送）" : "处理记录"}：${note.trim()}`,
    );
    setNote("");
  };
  const parseImport = () => {
    const lines = importText.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setError("需要表头和至少一行数据，请使用导出 CSV 的列顺序。");
      return;
    }
    const parse = (s: string) =>
      s
        .match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)
        ?.filter((x) => x !== "")
        .map((x) =>
          x.replace(/,$/, "").replace(/^"|"$/g, "").replaceAll('""', '"'),
        ) || [];
    const headers = parse(lines[0]).map((x) => x.replace(/^\uFEFF/, ""));
    const mapped = headers.map(
      (h) => spec.fields.find((f) => f.label === h || f.key === h)?.key,
    );
    if (!mapped.includes(spec.fields[0].key)) {
      setError(`首行需包含「${spec.fields[0].label}」列。`);
      return;
    }
    const candidates = lines.slice(1).map((line, i) => {
      const vals = parse(line);
      const r: Row = { id: uid("IMP") + i, status: statuses[0] };
      mapped.forEach((key, j) => {
        if (key)
          r[key] =
            spec.fields.find((f) => f.key === key)?.type === "number"
              ? Number(vals[j])
              : vals[j];
      });
      return r;
    });
    if (
      candidates.some((r) =>
        spec.fields.some(
          (f) =>
            f.required &&
            (r[f.key] === undefined ||
              r[f.key] === "" ||
              (f.type === "number" &&
                (!Number.isFinite(r[f.key]) || r[f.key] < (f.min ?? 0)))),
        ),
      )
    ) {
      setError("导入已中止：存在缺失必填字段或非法数值，请修正后重新导入。");
      return;
    }
    candidates.forEach((r) => persist(r, "CSV 导入记录（演示）"));
    setNotice(`成功导入 ${candidates.length} 条记录`);
    setImporting(false);
    setImportText("");
  };
  return (
    <div className="ops-workspace">
      {!compact && (
        <Metrics
          items={[
            { label: "全部记录", value: rows.length },
            {
              label: "需要处理",
              value: rows.filter((r) => /待|草稿|受理/.test(r.status)).length,
            },
            {
              label: "已完成 / 已启用",
              value: rows.filter((r) =>
                /完成|通过|启用|在售|发布|解决|结算/.test(r.status),
              ).length,
            },
            {
              label: "本次筛选",
              value: visible.length,
              note: spec.clauses ? `需求 ${spec.clauses}` : "支持导出筛选结果",
            },
          ]}
        />
      )}
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>{spec.label}</h2>
            <p>{spec.description}</p>
          </div>
          <button className="btn btn-primary" onClick={create}>
            <Plus size={16} />
            新建{spec.label.replace(/管理|列表|信息|设置/g, "")}
          </button>
        </div>
        <div className="ops-toolbar">
          <label className="ops-search">
            <Search size={16} />
            <input
              aria-label={`搜索${spec.label}`}
              placeholder="搜索名称、编号、负责人…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="状态筛选"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>全部状态</option>
            {[...new Set([...statuses, ...rows.map((x) => x.status)])].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
          {spec.key === "consultations" && (
            <button
              className={`btn ${mine ? "btn-primary" : ""}`}
              onClick={() => setMine(!mine)}
            >
              {mine ? "查看全部咨询" : "我的抢单"}
            </button>
          )}
          <span className="ops-toolbar-spacer" />
          <button
            className="btn"
            onClick={() => {
              setImporting(true);
              setError("");
            }}
          >
            <Upload size={15} />
            导入
          </button>
          <button
            className="btn"
            onClick={() => {
              downloadCsv(spec.label, visible, [
                ...spec.fields,
                f("status", "状态"),
              ]);
              setNotice(`已导出 ${visible.length} 条筛选记录`);
            }}
          >
            <ArrowDownToLine size={15} />
            导出
          </button>
        </div>
        {notice && (
          <div className="ops-feedback" role="status">
            <CheckCircle2 size={15} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="关闭提示">
              <X size={14} />
            </button>
          </div>
        )}
        {selected.length > 0 && (
          <div className="ops-selection">
            <span>已选择 {selected.length} 项</span>
            <button
              onClick={() => {
                let changed = 0;
                rows
                  .filter((r) => selected.includes(r.id))
                  .forEach((r) => {
                    const next =
                      spec.transitions?.[r.status]?.find(
                        (s) => !/取消|拒绝|驳回|终止/.test(s),
                      ) ||
                      (!spec.transitions && statuses.includes("已启用")
                        ? "已启用"
                        : null);
                    if (next) {
                      persist(
                        { ...r, status: next },
                        `批量流转：${r.status} → ${next}`,
                      );
                      changed++;
                    }
                  });
                setNotice(`已推进 ${changed} 条记录，其余记录当前无可用操作`);
                setSelected([]);
              }}
            >
              批量推进
            </button>
            <button onClick={() => setSelected([])}>取消选择</button>
          </div>
        )}
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="全选当前页"
                    type="checkbox"
                    checked={
                      visible.length > 0 &&
                      visible.every((r) => selected.includes(r.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? visible.map((r) => r.id) : [],
                      )
                    }
                  />
                </th>
                {spec.fields.slice(0, 5).map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      aria-label={`选择${r.name || r.title || r.id}`}
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, r.id]
                            : selected.filter((x) => x !== r.id),
                        )
                      }
                    />
                  </td>
                  {spec.fields.slice(0, 5).map((field, i) => (
                    <td key={field.key}>
                      {i === 0 ? (
                        <button
                          className="ops-record-link"
                          onClick={() => {
                            setDetail(r.id);
                            setError("");
                            setNote("");
                            setConfirmDelete(false);
                            setTracking(r.tracking || "");
                          }}
                        >
                          <span
                            className={`ops-avatar ${spec.kind === "products" ? "purple" : ""}`}
                          >
                            {spec.kind === "products" ? (
                              <Package size={17} />
                            ) : (
                              String(r[field.key] || "档").slice(0, 1)
                            )}
                          </span>
                          <span>
                            <b>{r[field.key] || "未命名"}</b>
                            <small>{r.id}</small>
                          </span>
                        </button>
                      ) : field.type === "number" ? (
                        <span className="ops-number">
                          {Number(r[field.key] ?? 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="ops-cell-text">
                          {String(r[field.key] ?? "—")}
                        </span>
                      )}
                    </td>
                  ))}
                  <td>
                    <Tag value={r.status} />
                  </td>
                  <td>
                    <button
                      className="ops-text-btn"
                      onClick={() => {
                        setDetail(r.id);
                        setError("");
                        setNote("");
                        setConfirmDelete(false);
                        setTracking(r.tracking || "");
                      }}
                    >
                      详情
                    </button>
                    <button
                      className="ops-text-btn"
                      onClick={() => {
                        setEditor({ ...r });
                        setError("");
                      }}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="ops-empty">
              <Search size={34} />
              <h3>没有找到匹配记录</h3>
              <p>尝试调整搜索条件，或创建第一条记录。</p>
              <button
                className="btn"
                onClick={() => {
                  setFilter("全部状态");
                  setQuery("");
                }}
              >
                清除筛选
              </button>
            </div>
          )}
        </div>
        <div className="ops-table-footer">
          共 {visible.length} 条记录
          <span>数据保存在当前浏览器 · 仅限合成演示数据</span>
        </div>
      </section>
      {editor && (
        <div
          className="ops-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditor(null);
          }}
        >
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="编辑记录"
          >
            <div className="ops-modal-head">
              <div>
                <h2>
                  {rows.some((r) => r.id === editor.id) ? "编辑" : "新建"} ·{" "}
                  {spec.label}
                </h2>
                <p>完善信息后保存，所有变更均记录操作日志</p>
              </div>
              <button
                className="ops-icon-btn"
                onClick={() => setEditor(null)}
                aria-label="关闭编辑"
              >
                <X />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="ops-form-grid">
                <FormFields
                  fields={spec.fields}
                  draft={editor}
                  setDraft={setEditor}
                />
              </div>
              {error && (
                <p className="ops-error" role="alert">
                  {error}
                </p>
              )}
              <div className="ops-modal-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setEditor(null)}
                >
                  取消
                </button>
                <button className="btn btn-primary" type="submit">
                  <Check size={16} />
                  保存记录
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {record && (
        <div
          className="ops-overlay ops-drawer-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <aside
            className="ops-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="记录详情"
          >
            <div className="ops-modal-head">
              <div>
                <small>
                  {spec.label} / {record.id}
                </small>
                <h2>{record.name || record.title || record.id}</h2>
              </div>
              <button
                className="ops-icon-btn"
                onClick={() => setDetail(null)}
                aria-label="关闭详情"
              >
                <X />
              </button>
            </div>
            <div className="ops-drawer-body">
              <div className="ops-detail-state">
                <Tag value={record.status} />
                <span>更新于 {record.updatedAt || record.date || today()}</span>
              </div>
              <div className="ops-detail-grid">
                {spec.fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.type === "textarea" ? "ops-span2" : ""}
                  >
                    <label>{field.label}</label>
                    <p>{String(record[field.key] ?? "—")}</p>
                  </div>
                ))}
              </div>
              {spec.kind === "products" && (
                <section className="ops-inline-box">
                  <h3>
                    <Package size={17} />
                    库存调整
                  </h3>
                  <p>
                    当前可用库存：<strong>{record.stock || 0}</strong>{" "}
                    件。库存不能调整为负数。
                  </p>
                  <div className="ops-inline-controls">
                    <input
                      type="number"
                      aria-label="库存变动数量"
                      value={adjust}
                      onChange={(e) => setAdjust(Number(e.target.value))}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        if (
                          !Number.isInteger(adjust) ||
                          Number(record.stock) + adjust < 0
                        ) {
                          setError("库存调整必须为整数，且调整后不能小于零。");
                          return;
                        }
                        persist(
                          { ...record, stock: Number(record.stock) + adjust },
                          `库存调整 ${adjust > 0 ? "+" : ""}${adjust} 件`,
                        );
                      }}
                    >
                      确认调整
                    </button>
                  </div>
                </section>
              )}
              {spec.key === "shopOrders" && (
                <section className="ops-inline-box">
                  <h3>
                    <Package size={17} />
                    物流信息（模拟）
                  </h3>
                  <p>保存运单标识后可推进发货状态，不会调用物流接口。</p>
                  <div className="ops-inline-controls">
                    <input
                      aria-label="模拟物流单号"
                      placeholder="例如 DEMO-SF-1001"
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        if (!tracking.trim()) {
                          setError("请填写模拟物流单号。");
                          return;
                        }
                        persist(
                          { ...record, tracking: tracking.trim() },
                          "更新本地模拟物流信息",
                        );
                      }}
                    >
                      保存物流信息
                    </button>
                  </div>
                </section>
              )}
              {spec.kind === "permissions" && (
                <section className="ops-inline-box">
                  <h3>
                    <ShieldCheck size={17} />
                    权限矩阵（界面配置演示）
                  </h3>
                  <p>保存角色勾选项；实际接口鉴权仍需服务端实现。</p>
                  <div className="ops-permissions">
                    {[
                      "查看客户",
                      "维护档案",
                      "维护预约",
                      "录入结果",
                      "审核报告",
                      "订单处理",
                      "财务查询",
                      "系统配置",
                      "导出数据",
                    ].map((p) => (
                      <label key={p}>
                        <input
                          type="checkbox"
                          checked={(record.permissions || []).includes(p)}
                          onChange={(e) =>
                            persist(
                              {
                                ...record,
                                permissions: e.target.checked
                                  ? [...(record.permissions || []), p]
                                  : (record.permissions || []).filter(
                                      (x: string) => x !== p,
                                    ),
                              },
                              `调整界面权限：${p}`,
                            )
                          }
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </section>
              )}
              {spec.kind === "devices" && (
                <section className="ops-inline-box">
                  <h3>
                    <Activity size={17} />
                    连接模拟器
                  </h3>
                  <p>未连接真实设备或医院网络，测试仅生成本地回执。</p>
                  <button
                    className="btn"
                    onClick={() =>
                      persist(
                        { ...record, lastTest: "模拟响应 200 / 84 ms" },
                        "模拟连接检查成功；无实际网络请求",
                      )
                    }
                  >
                    运行模拟连接测试
                  </button>
                  {record.lastTest && <p>{record.lastTest}</p>}
                </section>
              )}
              <section className="ops-inline-box">
                <h3>
                  <MessageSquare size={17} />
                  {spec.kind === "messages" ? "模拟回复" : "处理工作台"}
                </h3>
                <textarea
                  aria-label="处理说明"
                  placeholder={
                    spec.kind === "messages"
                      ? "填写回复内容，仅保存在本地演示记录…"
                      : "填写处理说明；驳回、取消等操作必须说明原因…"
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                {error && (
                  <p className="ops-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="ops-action-wrap">
                  <button className="btn" onClick={addNote}>
                    保存{spec.kind === "messages" ? "模拟回复" : "处理记录"}
                  </button>
                  {(
                    spec.transitions?.[record.status] ||
                    (!spec.transitions
                      ? statuses.filter((s) => s !== record.status)
                      : [])
                  ).map((s, i) => (
                    <button
                      className={`btn ${i === 0 ? "btn-primary" : ""}`}
                      key={s}
                      onClick={() => transition(record, s)}
                    >
                      {s}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="ops-history">
                <h3>
                  <History size={17} />
                  流转记录
                </h3>
                {[
                  ...(record.history || [
                    {
                      at: record.date || today(),
                      text: "已创建演示记录",
                      by: record.owner || "系统",
                    },
                  ]),
                ]
                  .reverse()
                  .map((h, i) => (
                    <div className="ops-history-item" key={i}>
                      <span />
                      <div>
                        <b>{h.text}</b>
                        <small>
                          {h.at} · {h.by || "管理员"}
                        </small>
                      </div>
                    </div>
                  ))}
              </section>
              <div className="ops-danger-zone">
                {confirmDelete ? (
                  <>
                    <p>确认删除这条本地演示记录？此操作不会影响真实系统。</p>
                    <button
                      className="btn"
                      onClick={() => {
                        act({
                          type: "DELETE_RECORD",
                          payload: { collection: spec.key, id: record.id },
                        });
                        act({
                          type: "ADD_AUDIT",
                          payload: {
                            message: `删除 ${spec.label} ${record.id}`,
                          },
                        });
                        setDetail(null);
                        setConfirmDelete(false);
                        setNotice("记录已删除");
                      }}
                    >
                      确认删除
                    </button>
                    <button
                      className="btn"
                      onClick={() => setConfirmDelete(false)}
                    >
                      保留
                    </button>
                  </>
                ) : (
                  <button
                    className="ops-text-btn ops-danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} />
                    删除记录
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
      {importing && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="导入 CSV"
          >
            <div className="ops-modal-head">
              <div>
                <h2>导入{spec.label}</h2>
                <p>粘贴 CSV 数据，保存前将校验必填项和数值</p>
              </div>
              <button
                className="ops-icon-btn"
                aria-label="关闭导入"
                onClick={() => setImporting(false)}
              >
                <X />
              </button>
            </div>
            <Banner>请勿输入真实个人信息。本功能仅用于合成数据演示。</Banner>
            <div className="ops-import">
              <button
                className="btn"
                onClick={() =>
                  downloadCsv(`${spec.label}导入模板`, [], spec.fields)
                }
              >
                下载空白模板
              </button>
              <textarea
                rows={8}
                aria-label="CSV 导入内容"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={spec.fields.map((x) => x.label).join(",")}
              />
              {error && <p className="ops-error">{error}</p>}
            </div>
            <div className="ops-modal-actions">
              <button className="btn" onClick={() => setImporting(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={parseImport}>
                校验并导入
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
const commonFields = [
  f("name", "名称"),
  f("category", "分类"),
  f("owner", "负责人"),
  f("date", "生效日期", "date"),
  f("description", "说明", "textarea", undefined, false),
];
function config(
  key: string,
  label: string,
  names: string[],
  clauses: string,
  fields = commonFields,
  kind?: string,
): WorkspaceSpec {
  return {
    key,
    label,
    description: `统一维护${label.replace(/管理|列表/g, "")}，支持新增、校验、筛选、批量提交与变更追溯。`,
    fields,
    clauses,
    kind,
    statuses: ["已启用", "已停用"],
    seeds: names.map((n, i) => {
      const defaults: Row = {
        name: n,
        owner: "陈晓",
        date: "2026-10-13",
        description: `${n}的合成示例配置，可编辑维护。`,
        code: `${key.toUpperCase().slice(0, 4)}-${i + 1}`,
        value: String(i + 1),
        baseFee: 8,
        freeAbove: 99,
        minPeople: 10,
        discount: 9,
        points: 20,
        sort: (i + 1) * 10,
        amount: 3000,
        minAge: 18,
        maxAge: 60,
        budget: 899,
        selectCount: 3,
        carrier: "演示物流",
        region: "青岛市",
        address: "演示院区服务大厅",
        parent: "青禾健康体检中心",
        company: "星辰科技",
        customer: "林知远（演示）",
        product: "轻量运动水杯",
        endpoint: "DEMO_LOCAL_ONLY",
        version: "1.0.0",
        path: "/health",
      };
      const values = Object.fromEntries(
        fields.map((field) => [
          field.key,
          defaults[field.key] ??
            (field.type === "select"
              ? field.options?.[i % (field.options.length || 1)]
              : field.type === "number"
                ? 0
                : `${field.label}示例`),
        ]),
      );
      return seed(`${key.toUpperCase().slice(0, 3)}-${1001 + i}`, n, values);
    }),
  };
}
const orderFields = [
  f("name", "订单项目"),
  f("customer", "客户"),
  f("owner", "服务人员"),
  f("amount", "金额 / 元", "number"),
  f("date", "预约日期", "date"),
  f("description", "服务说明", "textarea"),
];
const serviceSpecs: WorkspaceSpec[] = [
  {
    key: "serviceOrders",
    label: "服务订单",
    description: "从预约受理到服务完成，将每一次服务连接成可追溯的闭环。",
    clauses: "2.2.4.29–32 / 87",
    kind: "orders",
    fields: orderFields,
    statuses: ["待处理", "待服务", "服务中", "已完成", "已取消"],
    transitions: {
      待处理: ["待服务", "已取消"],
      待服务: ["服务中", "已取消"],
      服务中: ["已完成", "已取消"],
      已完成: [],
      已取消: [],
    },
    seeds: [
      seed("SV-2026101301", "体检报告解读", {
        customer: "林悦（演示）",
        owner: "王医生",
        amount: 59,
        date: "2026-10-13",
        status: "待处理",
        description: "标准健康报告解读，30 分钟线上预约。",
      }),
      seed("SV-2026101302", "企业健康咨询", {
        customer: "青禾科技（演示）",
        owner: "周医生",
        amount: 299,
        status: "待服务",
        description: "面向企业行政的健康服务流程介绍。",
      }),
      seed("SV-2026101303", "营养知识讲堂", {
        customer: "赵明（演示）",
        owner: "刘营养师",
        amount: 89,
        status: "服务中",
        description: "生活方式教育服务，不替代医学诊疗。",
      }),
      seed("SV-2026101201", "检后随访服务", {
        customer: "苏然（演示）",
        owner: "王医生",
        amount: 0,
        status: "已完成",
        description: "体检流程满意度回访。",
      }),
    ],
  },
  {
    key: "serviceCatalog",
    label: "服务项目审核",
    description: "编辑服务范围与价格，提交审核后才可进入可用服务列表。",
    clauses: "2.2.4.27–28 / 103 / 108",
    fields: [
      f("name", "服务名称"),
      f("category", "服务类型", "select", [
        "报告解读",
        "健康教育",
        "检后随访",
        "企业服务",
      ]),
      f("owner", "服务人员"),
      f("price", "价格 / 元", "number"),
      f("duration", "时长 / 分钟", "number"),
      f("description", "服务说明", "textarea"),
    ],
    statuses: standard,
    transitions: {
      草稿: ["待审核"],
      待审核: ["已通过", "已驳回"],
      已驳回: ["待审核"],
      已通过: ["已停用"],
      已停用: ["待审核"],
    },
    seeds: [
      seed("SER-101", "体检报告解读", {
        category: "报告解读",
        price: 59,
        duration: 30,
        status: "已通过",
        description: "模拟服务，无真实诊疗。",
      }),
      seed("SER-102", "职场健康小课堂", {
        category: "健康教育",
        price: 199,
        duration: 60,
        status: "待审核",
        description: "仅进行健康常识教育，需审核后展示。",
      }),
    ],
  },
  {
    key: "consultations",
    label: "快速咨询抢单",
    description: "咨询受理、领取、处理与取消均保留流转记录。",
    clauses: "2.2.4.33–35",
    kind: "messages",
    fields: [
      f("name", "咨询主题"),
      f("customer", "客户"),
      f("owner", "受理人员"),
      f("date", "提交日期", "date"),
      f("description", "问题描述", "textarea"),
    ],
    statuses: ["待领取", "已领取", "已完成", "已取消"],
    transitions: {
      待领取: ["已领取", "已取消"],
      已领取: ["已完成", "已取消"],
      已完成: [],
      已取消: [],
    },
    seeds: [
      seed("Q-801", "如何查看今年的体检报告？", {
        customer: "林悦（演示）",
        owner: "未分配",
        status: "待领取",
        description: "希望了解电子报告查看流程。",
      }),
      seed("Q-802", "咨询线下服务时间", {
        customer: "苏然（演示）",
        owner: "陈晓",
        status: "已领取",
        description: "需要确认工作日服务时间。",
      }),
    ],
  },
  {
    key: "doctorTeams",
    label: "医生团队",
    description: "维护成员、专长及团队审核流程，支持查看通过与驳回记录。",
    clauses: "2.2.4.36–37 / 68–70 / 86",
    fields: [
      f("name", "团队名称"),
      f("category", "专业方向"),
      f("owner", "负责人"),
      f("members", "团队成员"),
      f("description", "团队介绍", "textarea"),
    ],
    statuses: ["待审核", "已通过", "已驳回", "已停用"],
    transitions: {
      待审核: ["已通过", "已驳回"],
      已通过: ["已停用"],
      已驳回: ["待审核"],
      已停用: ["待审核"],
    },
    seeds: [
      seed("TEAM-101", "青禾健康管理团队", {
        category: "健康管理",
        owner: "王医生",
        members: "王医生、刘营养师、陈晓",
        status: "已通过",
        description: "面向企业人群的教育与随访团队。",
      }),
      seed("TEAM-102", "全周期健康服务组", {
        category: "全科健康服务",
        owner: "周医生",
        members: "周医生、孙护士",
        status: "待审核",
        description: "待补充服务资质资料（演示）。",
      }),
    ],
  },
];
const commerceSpecs: WorkspaceSpec[] = [
  {
    key: "products",
    label: "商品与库存",
    description: "查看商品、管理库存和货架，价格与库存变更即时保留日志。",
    clauses: "2.2.4.52–55 / 67 / 112",
    kind: "products",
    fields: [
      f("name", "商品名称"),
      f("category", "商品分类", "select", [
        "健康用品",
        "健康课程",
        "体检服务",
        "运动用品",
      ]),
      f("price", "售价 / 元", "number"),
      f("stock", "库存 / 件", "number"),
      f("sku", "商品编号"),
      f("image", "图片资源地址", "text" as any, undefined, false),
      f("description", "商品介绍与属性", "textarea"),
    ],
    statuses: ["草稿", "在售", "已下架", "预约中"],
    transitions: {
      草稿: ["在售", "预约中"],
      在售: ["已下架"],
      已下架: ["在售"],
      预约中: ["在售", "已下架"],
    },
    seeds: [
      seed("P-1001", "轻量运动水杯", {
        category: "运动用品",
        price: 69,
        stock: 126,
        sku: "QH-CUP-001",
        status: "在售",
        description: "500ml / 雾绿色 / 合成展示商品。",
      }),
      seed("P-1002", "睡眠知识入门课", {
        category: "健康课程",
        price: 39,
        stock: 999,
        sku: "QH-COURSE-002",
        status: "在售",
        description: "4 课时健康知识教育。",
      }),
      seed("P-1003", "年度基础体检服务", {
        category: "体检服务",
        price: 599,
        stock: 48,
        sku: "QH-EXAM-001",
        status: "预约中",
        description: "预约型商品，需与院区日历匹配。",
      }),
    ],
  },
  {
    key: "shopOrders",
    label: "商城订单",
    description:
      "订单受理、模拟发货、收货及售后全流程。演示不会触发实际物流或付款。",
    clauses: "2.2.4.57–61 / 89",
    kind: "orders",
    fields: [
      f("name", "订单商品"),
      f("customer", "客户"),
      f("amount", "应付金额 / 元", "number"),
      f("quantity", "数量", "number"),
      f("date", "下单日期", "date"),
      f("tracking", "物流单号", "text" as any, undefined, false),
      f("description", "订单备注", "textarea", undefined, false),
    ],
    statuses: [
      "待付款",
      "待发货",
      "已发货",
      "已签收",
      "退款申请",
      "已退款",
      "已取消",
    ],
    transitions: {
      待付款: ["待发货", "已取消"],
      待发货: ["已发货", "退款申请"],
      已发货: ["已签收", "退款申请"],
      已签收: ["退款申请"],
      退款申请: ["已退款", "已签收"],
      已退款: [],
      已取消: [],
    },
    seeds: [
      seed("SO-10201", "轻量运动水杯", {
        customer: "林悦（演示）",
        amount: 69,
        quantity: 1,
        status: "待发货",
        description: "所有支付均为状态模拟。",
      }),
      seed("SO-10202", "睡眠知识入门课", {
        customer: "苏然（演示）",
        amount: 39,
        quantity: 1,
        status: "已签收",
        tracking: "数字商品",
        description: "订单完成演示。",
      }),
      seed("SO-10203", "轻量运动水杯", {
        customer: "赵明（演示）",
        amount: 69,
        quantity: 1,
        status: "退款申请",
        description: "申请原因：购买重复（合成数据）。",
      }),
    ],
  },
  {
    ...config(
      "settlements",
      "财务结算",
      ["商城周结账单", "专业服务结算", "体检报告结算", "平台交易汇总"],
      "2.2.4.60 / 87–91",
      [
        f("name", "账单名称"),
        f("category", "业务类型", "select", [
          "商城",
          "专业服务",
          "报告",
          "平台",
          "账户充值",
        ]),
        f("amount", "金额 / 元", "number"),
        f("date", "账单日期", "date"),
        f("owner", "经办人"),
        f("description", "核对说明", "textarea"),
      ],
    ),
    statuses: ["待核对", "已核对", "已结算"],
    transitions: { 待核对: ["已核对"], 已核对: ["已结算"], 已结算: [] },
    seeds: [
      seed("FIN-1001", "商城周结账单", {
        category: "商城",
        amount: 1280,
        status: "待核对",
        description: "演示账本；不发生资金流转。",
      }),
      seed("FIN-1002", "专业服务结算", {
        category: "专业服务",
        amount: 980,
        status: "已核对",
        description: "费用计算仅供界面验证。",
      }),
      seed("FIN-1003", "演示账户充值", {
        category: "账户充值",
        amount: 200,
        status: "已结算",
        description: "模拟余额 200 元，无真实充值。",
      }),
    ],
  },
  config(
    "shipping",
    "物流与运费",
    ["青岛市内标准配送", "全国标准配送"],
    "2.2.4.62–63",
    [
      f("name", "运费模板"),
      f("carrier", "物流公司"),
      f("region", "适用地区"),
      f("baseFee", "首重 / 元", "number"),
      f("freeAbove", "包邮门槛 / 元", "number"),
      f("description", "计费规则", "textarea"),
    ],
  ),
  config(
    "stores",
    "店铺与消费码",
    ["青禾健康官方店", "城阳院区服务店"],
    "2.2.4.64–66",
    [
      f("name", "店铺名称"),
      f("owner", "管理员"),
      f("code", "消费码前缀"),
      f("address", "服务地址"),
      f("description", "店铺简介", "textarea"),
    ],
  ),
  config(
    "groupBuy",
    "团购与预约规则",
    ["企业团购 10 人成团", "健康课程预约名额"],
    "2.2.4.55–56",
    [
      f("name", "规则名称"),
      f("product", "关联商品"),
      f("minPeople", "最低人数", "number"),
      f("discount", "折扣 / 折", "number"),
      f("date", "截止日期", "date"),
      f("description", "规则说明", "textarea"),
    ],
  ),
  {
    key: "productReviews",
    label: "商品评价",
    description: "查看评价，保存模拟回复与审核记录。",
    clauses: "2.2.4.58",
    kind: "messages",
    fields: [
      f("name", "评价主题"),
      f("customer", "评价客户"),
      f("product", "关联商品"),
      f("rating", "评分 / 5", "number"),
      f("description", "评价内容", "textarea"),
    ],
    statuses: ["待回复", "已回复", "已隐藏"],
    seeds: [
      seed("REV-101", "包装整洁，使用方便", {
        customer: "林悦（演示）",
        product: "轻量运动水杯",
        rating: 5,
        status: "待回复",
        description: "示例评价，用于展示运营回复流程。",
      }),
    ],
  },
];
const contentSpecs: WorkspaceSpec[] = [
  {
    key: "articles",
    label: "健康内容",
    description: "维护文章、视频与动态，先审核再发布，全部为本地发布模拟。",
    clauses: "2.2.4.77–82",
    fields: [
      f("name", "内容标题"),
      f("category", "内容类型", "select", [
        "健康文章",
        "健康视频",
        "社区动态",
        "平台公告",
      ]),
      f("owner", "作者"),
      f("date", "发布日期", "date"),
      f("media", "视频 / 封面资源", "text" as any, undefined, false),
      f("description", "正文内容", "textarea"),
    ],
    statuses: ["草稿", "待审核", "已发布", "已驳回", "已下线"],
    transitions: {
      草稿: ["待审核"],
      待审核: ["已发布", "已驳回"],
      已驳回: ["待审核"],
      已发布: ["已下线"],
      已下线: ["待审核"],
    },
    seeds: [
      seed("ART-1001", "从读懂体检报告开始，关注自己的健康", {
        category: "健康文章",
        owner: "健康教育编辑组",
        status: "已发布",
        description:
          "本页面内容为健康教育演示。体检数据的解释应结合完整病史，由合格医护人员进行。",
      }),
      seed("ART-1002", "把日常活动融入工作日", {
        category: "健康视频",
        owner: "健康教育编辑组",
        status: "待审核",
        media: "待上传媒体资源",
        description: "视频栏目示例，未提供可播放的实际媒体文件。",
      }),
      seed("ART-1003", "青禾十月健康主题活动报名", {
        category: "社区动态",
        owner: "活动运营组",
        status: "草稿",
        description: "虚构活动，不会对外发布。",
      }),
    ],
  },
  {
    key: "messages",
    label: "咨询与消息",
    description: "统一查看咨询、评价、短信与邮件记录，回复仅保存在演示会话。",
    clauses: "2.2.4.71–76",
    kind: "messages",
    fields: [
      f("name", "会话主题"),
      f("channel", "渠道", "select", ["站内咨询", "评价回复", "短信", "邮件"]),
      f("customer", "客户"),
      f("owner", "处理人员"),
      f("description", "消息内容", "textarea"),
    ],
    statuses: ["待回复", "已回复", "已归档"],
    transitions: { 待回复: ["已回复"], 已回复: ["已归档"], 已归档: ["待回复"] },
    seeds: [
      seed("MSG-1001", "电子报告在哪里查看？", {
        channel: "站内咨询",
        customer: "林悦（演示）",
        owner: "客服小青",
        status: "待回复",
        description: "想了解体检报告的查看入口。",
      }),
      seed("MSG-1002", "体检预约提醒（模拟）", {
        channel: "短信",
        customer: "赵明（演示）",
        owner: "系统",
        status: "已归档",
        description: "预约提醒草稿，未发送到真实号码。",
      }),
      seed("MSG-1003", "团检服务反馈", {
        channel: "邮件",
        customer: "青禾科技（演示）",
        owner: "客服小青",
        status: "已回复",
        description: "所有邮件仅在本地演示，不对外传送。",
      }),
    ],
  },
  config(
    "community",
    "健康广场与活动",
    ["每日健康知识打卡", "企业秋日步行活动"],
    "2.2.4.83–86",
    [
      f("name", "活动名称"),
      f("category", "活动类型", "select", [
        "健康梦想任务",
        "健康梦想商品",
        "健康梦想活动",
        "健康广场活动",
        "健康豆规则",
      ]),
      f("owner", "负责团队"),
      f("points", "健康豆奖励", "number"),
      f("date", "活动日期", "date"),
      f("description", "活动说明", "textarea"),
    ],
  ),
  config(
    "friends",
    "好友与服务关系",
    ["林悦（演示）—陈晓", "赵明（演示）—王医生"],
    "2.2.4.74",
    [
      f("name", "关系名称"),
      f("customer", "客户"),
      f("owner", "服务人员"),
      f("category", "关系类型", "select", ["健康顾问", "关注好友", "家庭服务"]),
      f("description", "关系备注", "textarea"),
    ],
  ),
  config(
    "contentCategories",
    "内容与通知分类",
    ["健康科普", "体检通知", "服务提醒"],
    "2.2.4.79 / 139",
    [
      f("name", "分类名称"),
      f("code", "分类编码"),
      f("sort", "排序", "number"),
      f("owner", "负责人"),
      f("description", "分类说明", "textarea"),
    ],
  ),
];
const ticket = (
  key: string,
  label: string,
  kind: string,
  clauses: string,
): WorkspaceSpec => ({
  key,
  label,
  kind: "messages",
  clauses,
  description: "按责任人推进受理、处理中、解决与关闭，处理结果保留完整日志。",
  fields: [
    f("name", "工单主题"),
    f("customer", "客户"),
    f("priority", "优先级", "select", ["一般", "重要", "紧急"]),
    f("owner", "受理人员"),
    f("date", "受理日期", "date"),
    f("category", "来源", "select", [
      "体检服务",
      "商城订单",
      "专业服务",
      "平台咨询",
    ]),
    f("description", "问题与处理说明", "textarea"),
  ],
  statuses: ["待受理", "处理中", "已解决", "已关闭"],
  transitions: {
    待受理: ["处理中"],
    处理中: ["已解决"],
    已解决: ["已关闭", "处理中"],
    已关闭: ["处理中"],
  },
  seeds: [
    seed(
      `${key}-1001`,
      kind === "工单"
        ? "报告查询入口咨询"
        : kind === "投诉"
          ? "预约等待时间反馈"
          : "订单售后协调",
      {
        customer: "林悦（演示）",
        priority: "重要",
        owner: "客服小青",
        category: "体检服务",
        status: "待受理",
        description: `这是合成${kind}，请记录处理过程后提交解决。`,
      },
    ),
    seed(
      `${key}-1002`,
      kind === "工单"
        ? "团检发票开具流程"
        : kind === "投诉"
          ? "现场引导体验反馈"
          : "服务时间协调",
      {
        customer: "青禾科技（演示）",
        priority: "一般",
        owner: "客服小叶",
        category: "专业服务",
        status: "处理中",
        description: "演示处理记录，尚未联系真实客户。",
      },
    ),
  ],
});
const supportSpecs = [
  ticket("tickets", "客户工单", "工单", "2.2.4.121–122"),
  ticket("complaints", "投诉处理", "投诉", "2.2.4.123–124"),
  ticket("serviceDisputes", "服务订单纠纷", "纠纷", "2.2.4.125"),
  ticket("shopDisputes", "商城订单纠纷", "纠纷", "2.2.4.126"),
];
const settingsSpecs: WorkspaceSpec[] = [
  config(
    "organizations",
    "机构与企业",
    ["青禾健康体检中心", "城阳服务分中心", "青禾科技（演示）"],
    "2.2.4.92–93 / 116",
    [
      f("name", "机构名称"),
      f("category", "机构类型", "select", [
        "医疗机构",
        "子院区",
        "团体单位",
        "企业",
      ]),
      f("parent", "上级机构"),
      f("owner", "管理员"),
      f("description", "机构说明", "textarea"),
    ],
  ),
  {
    ...config(
      "staff",
      "人员与资质",
      ["王医生", "陈晓", "客服小青"],
      "2.2.4.94–95 / 97–103",
      [
        f("name", "姓名"),
        f("category", "人员类型", "select", [
          "专业医生",
          "健康管理师",
          "客服人员",
          "黑名单",
        ]),
        f("role", "角色"),
        f("department", "科室 / 分组"),
        f("qualification", "资质 / 原因说明", "textarea"),
      ],
    ),
    statuses: ["待审核", "已通过", "已驳回", "已停用"],
    transitions: {
      待审核: ["已通过", "已驳回"],
      已通过: ["已停用"],
      已驳回: ["待审核"],
      已停用: ["待审核"],
    },
    seeds: [
      seed("U-1001", "王医生", {
        category: "专业医生",
        role: "主检医生",
        department: "健康管理科",
        qualification: "演示资质文件，未进行真实资质核验。",
        status: "已通过",
      }),
      seed("U-1002", "陈晓", {
        category: "健康管理师",
        role: "健康管理师",
        department: "检后服务组",
        qualification: "合成资料",
        status: "待审核",
      }),
      seed("U-1003", "客服小青", {
        category: "客服人员",
        role: "客服",
        department: "客户服务组",
        qualification: "合成资料",
        status: "已通过",
      }),
    ],
  },
  config(
    "roles",
    "角色与权限",
    ["健康管理师", "主检医生", "客服运营", "机构管理员"],
    "2.2.4.96 / 129",
    [
      f("name", "角色名称"),
      f("code", "角色编码"),
      f("scope", "数据范围", "select", [
        "本人客户",
        "所在科室",
        "所在机构",
        "演示全局",
      ]),
      f("owner", "维护人员"),
      f("description", "角色说明", "textarea"),
    ],
    "permissions",
  ),
  config(
    "dictionaries",
    "系统与标准字典",
    [
      "民族 · 汉族",
      "职业 · 技术人员",
      "婚姻 · 未婚",
      "教育 · 本科",
      "企业 · 科技行业",
      "客户 · 在职职工",
      "短信 · 预约提醒",
    ],
    "2.2.4.106 / 111 / 130–137",
    [
      f("name", "字典名称"),
      f("category", "字典分类", "select", [
        "系统分类",
        "标准分类",
        "民族",
        "企业",
        "职业",
        "婚姻状况",
        "教育程度",
        "客户类型",
        "短信字典",
      ]),
      f("code", "字典编码"),
      f("value", "字典值"),
      f("sort", "排序", "number"),
      f("description", "说明", "textarea"),
    ],
  ),
  config(
    "clinicalConfig",
    "健康业务配置",
    [
      "成人健康评估套餐",
      "标准健康评估模板",
      "健康教育干预单元",
      "流感疫苗资料",
      "健康管理科",
      "常见疾病示例",
      "药品厂家示例",
    ],
    "2.2.4.104–110 / 115 / 117",
    [
      f("name", "配置名称"),
      f("category", "配置分类", "select", [
        "评估报告套餐",
        "评估报告模板",
        "干预计划细项",
        "服务项目",
        "疫苗",
        "科室",
        "药品厂家",
        "药品类别",
        "常患疾病",
      ]),
      f("code", "编码"),
      f("owner", "维护人员"),
      f("description", "配置内容", "textarea"),
    ],
  ),
  config(
    "devices",
    "设备与接口",
    [
      "体检结果接口 · 模拟",
      "文件接口 · 待澄清",
      "血压设备 · 演示",
      "报告打印终端 · 演示",
    ],
    "2.2.4.113–114",
    [
      f("name", "设备 / 接口"),
      f("category", "类型", "select", [
        "体检接口",
        "文件接口",
        "物联设备",
        "库存设备",
        "字典接口",
      ]),
      f("endpoint", "接口标识"),
      f("owner", "负责人"),
      f("description", "配置说明", "textarea"),
    ],
    "devices",
  ),
  config(
    "uiResources",
    "菜单与页面元素",
    ["健康管理菜单", "体检报告审核按钮", "客户列表扩展字段", "待办消息提示"],
    "2.2.4.127–128 / 140",
    [
      f("name", "资源名称"),
      f("category", "资源类型", "select", [
        "菜单",
        "按钮",
        "页面字段",
        "通知提示",
      ]),
      f("code", "权限标识"),
      f("path", "页面路径"),
      f("description", "资源与可见规则", "textarea"),
    ],
  ),
  config(
    "systemInfo",
    "系统信息与帮助",
    ["系统基本信息", "版本 1.0.0 更新说明", "设备接入帮助"],
    "2.2.4.118–120 / 138",
    [
      f("name", "标题"),
      f("category", "类型", "select", ["基本信息", "更新日志", "系统帮助"]),
      f("version", "版本"),
      f("date", "更新日期", "date"),
      f("description", "内容", "textarea"),
    ],
  ),
];

const crmSpecs: WorkspaceSpec[] = [
  {
    key: "crmCustomers",
    label: "CRM 客户",
    description: "认领审批、客户指派、满意度及履约进度统一记录。",
    clauses: "2.2.2.39",
    fields: [
      f("name", "客户名称"),
      f("owner", "客户负责人"),
      f("satisfaction", "满意度 / 5", "number"),
      f("completionDays", "体检完成周期 / 天", "number"),
      f("orderCount", "签署订单数", "number"),
      f("visited", "拜访状态", "select", ["未拜访", "已拜访"]),
      f("project", "立项状态", "select", ["未立项", "已立项"]),
      f("description", "客户备注", "textarea"),
    ],
    statuses: ["未认领", "认领待审", "已认领", "已指派", "已归档"],
    transitions: {
      未认领: ["认领待审", "已指派"],
      认领待审: ["已认领", "未认领"],
      已认领: ["已指派", "已归档"],
      已指派: ["已归档"],
      已归档: ["未认领"],
    },
    seeds: [
      seed("CRM-1001", "星辰科技", {
        owner: "未分配",
        satisfaction: 4.8,
        completionDays: 7,
        orderCount: 2,
        visited: "已拜访",
        project: "已立项",
        description: "年度企业体检续约客户（合成）。",
        status: "未认领",
      }),
      seed("CRM-1002", "远帆制造", {
        owner: "陈晓",
        satisfaction: 4.5,
        completionDays: 10,
        orderCount: 1,
        visited: "已拜访",
        project: "已立项",
        description: "客户负责人可在编辑中指派，不会发送通知。",
        status: "已认领",
      }),
    ],
  },
  {
    key: "crmContracts",
    label: "合同与回款",
    description:
      "维护合成合同、计划回款与实际回款，不签署真实合同或进行资金转移。",
    clauses: "2.2.2.39",
    fields: [
      f("name", "合同名称"),
      f("customer", "客户名称"),
      f("owner", "业务负责人"),
      f("amount", "合同金额 / 元", "number"),
      f("received", "实际回款 / 元", "number"),
      f("date", "签署日期", "date"),
      f("dueDate", "计划回款日期", "date"),
      f("description", "合同与审批说明", "textarea"),
    ],
    statuses: ["草稿", "待审批", "已通过", "已驳回", "履约中", "已完成"],
    transitions: {
      草稿: ["待审批"],
      待审批: ["已通过", "已驳回"],
      已驳回: ["草稿"],
      已通过: ["履约中"],
      履约中: ["已完成"],
      已完成: [],
    },
    seeds: [
      seed("CON-1001", "星辰科技年度体检服务", {
        customer: "星辰科技",
        owner: "陈晓",
        amount: 89900,
        received: 45000,
        date: "2026-09-16",
        dueDate: "2026-10-30",
        description: "合成合同，不具备法律效力。",
        status: "履约中",
      }),
      seed("CON-1002", "远帆制造入职体检服务", {
        customer: "远帆制造",
        owner: "周医生",
        amount: 19900,
        received: 5000,
        date: "2026-08-19",
        dueDate: "2026-09-30",
        description: "逾期余额示例，非实际应收账款。",
        status: "已通过",
      }),
      seed("CON-1003", "云海设计年度体检续约", {
        customer: "云海设计",
        owner: "陈晓",
        amount: 44950,
        received: 0,
        date: "2026-10-10",
        dueDate: "2026-11-01",
        description: "审批流程示例。",
        status: "待审批",
      }),
    ],
  },
  {
    ...config(
      "crmActivities",
      "拜访与业务计划",
      ["星辰科技服务回访", "远帆制造回款计划"],
      "2.2.2.39",
      [
        f("name", "业务主题"),
        f("customer", "关联客户"),
        f("category", "业务类型", "select", [
          "拜访",
          "立项",
          "计划回款",
          "实际回款",
        ]),
        f("owner", "业务负责人"),
        f("amount", "金额 / 元", "number"),
        f("date", "业务日期", "date"),
        f("description", "执行记录", "textarea"),
      ],
    ),
    statuses: ["计划中", "已完成", "已取消"],
    transitions: {
      计划中: ["已完成", "已取消"],
      已完成: [],
      已取消: ["计划中"],
    },
    seeds: [
      seed("VIS-1001", "星辰科技服务回访", {
        customer: "星辰科技",
        category: "拜访",
        owner: "陈晓",
        amount: 0,
        date: "2026-10-13",
        status: "计划中",
        description: "拜访计划，未实际联系任何第三方。",
      }),
      seed("VIS-1002", "远帆制造已收款登记", {
        customer: "远帆制造",
        category: "实际回款",
        owner: "周医生",
        amount: 5000,
        date: "2026-09-20",
        status: "已完成",
        description: "历史合成账款记录。",
      }),
    ],
  },
];
serviceSpecs.push(...crmSpecs);
settingsSpecs.unshift({
  key: "bookingRules",
  label: "预约规则",
  description: "配置预约容量、问卷、开放日期与价格展示。",
  fields: [],
  seeds: [],
  clauses: "2.2.1.8",
});
settingsSpecs.push(
  config(
    "packageRules",
    "套餐适用与团检规则",
    ["都市精英 · 成人套餐", "星辰科技 · 团体自选规则"],
    "2.2.2.43–44",
    [
      f("name", "套餐 / 规则名称"),
      f("company", "适用单位"),
      f("sex", "适用性别", "select", ["不限", "男", "女"]),
      f("minAge", "最小年龄", "number"),
      f("maxAge", "最大年龄", "number"),
      f("mode", "订单模式", "select", [
        "固定套餐",
        "固定金额",
        "套餐多选一",
        "项目 N 选 M",
        "个性化自选",
      ]),
      f("budget", "预算上限 / 元", "number"),
      f("selectCount", "自选项数量", "number"),
      f("online", "线上预约", "select", ["开启", "关闭"]),
      f("description", "套餐明细与自选包规则", "textarea"),
    ],
  ),
);
settingsSpecs.push(
  config(
    "examDictionaries",
    "体检项目与模板",
    [
      "血常规开单与报告项目",
      "开单项目互斥规则",
      "三级小结模板",
      "异常词条",
      "医学指导词条",
      "检验条码设置",
      "驳回意见模板",
    ],
    "2.2.2.41",
    [
      f("name", "资源名称"),
      f("category", "资源类型", "select", [
        "开单报告项目",
        "检验检查条码",
        "互斥依赖规则",
        "三级小结模板",
        "异常词条",
        "医学指导词条",
        "科室",
        "短信模板",
        "驳回意见",
      ]),
      f("code", "项目 / 模板编码"),
      f("related", "关联项目编码"),
      f("description", "配置内容", "textarea"),
    ],
  ),
);
function CrmSummary() {
  const { state } = useDemo() as any;
  const contracts = state.records.crmContracts || crmSpecs[1].seeds;
  const activities = state.records.crmActivities || crmSpecs[2].seeds;
  const total = contracts.reduce(
      (n: number, r: Row) => n + Number(r.amount || 0),
      0,
    ),
    received = contracts.reduce(
      (n: number, r: Row) => n + Number(r.received || 0),
      0,
    );
  const overdue = contracts.filter(
    (r: Row) => r.dueDate < today() && Number(r.amount) > Number(r.received),
  );
  const monthly = Array.from({ length: 12 }, (_, i) =>
    activities
      .filter(
        (r: Row) =>
          r.category === "实际回款" &&
          r.date?.slice(5, 7) === String(i + 1).padStart(2, "0"),
      )
      .reduce((n: number, r: Row) => n + Number(r.amount || 0), 0),
  );
  const max = Math.max(1, ...monthly);
  return (
    <section className="panel ops-panel ops-crm">
      <div className="ops-panel-title">
        <div>
          <h2>个人业务看板</h2>
          <p>本地合成合同与业务记录实时汇总</p>
        </div>
        <Tag value={`${overdue.length} 笔逾期账款`} />
      </div>
      <div className="ops-crm-summary">
        <div>
          <span>年度订单金额</span>
          <strong>¥{total.toLocaleString()}</strong>
        </div>
        <div>
          <span>已登记回款</span>
          <strong>¥{received.toLocaleString()}</strong>
        </div>
        <div>
          <span>合同完成率</span>
          <strong>
            {contracts.length
              ? Math.round(
                  (contracts.filter((r: Row) => r.status === "已完成").length /
                    contracts.length) *
                    100,
                )
              : 0}
            %
          </strong>
        </div>
        <div>
          <span>已完成拜访</span>
          <strong>
            {
              activities.filter(
                (r: Row) => r.category === "拜访" && r.status === "已完成",
              ).length
            }{" "}
            次
          </strong>
        </div>
      </div>
      <div className="ops-month-chart" aria-label="每月实际回款柱状图">
        {monthly.map((v, i) => (
          <div key={i}>
            <small>{v ? "¥" + v.toLocaleString() : ""}</small>
            <span style={{ height: `${Math.max(3, (v / max) * 65)}px` }} />
            <b>{i + 1} 月</b>
          </div>
        ))}
      </div>
      {overdue.length > 0 && (
        <div className="ops-notice">
          逾期提醒：
          {overdue
            .map(
              (r: Row) =>
                `${r.customer} · 待回款 ¥${(Number(r.amount) - Number(r.received)).toLocaleString()}`,
            )
            .join("；")}
        </div>
      )}
    </section>
  );
}
function BookingConfig() {
  const { state, act } = useDemo() as any;
  const [draft, setDraft] = useState<Row>({
    dailyCapacity: 80,
    yellowCapacity: 60,
    redCapacity: 80,
    weekendAllowed: false,
    releaseHour: "18:00",
    groupReleaseHour: "16:00",
    timeSlots: "08:00–08:30: 20; 08:30–09:00: 20; 09:00–09:30: 20",
    questionnaireEnabled: true,
    questionnaireSkippable: true,
    recommendationEnabled: false,
    defaultSelected: true,
    allowRemove: true,
    showPrices: true,
    priceMode: "执行价",
    ...state.config,
  });
  const [notice, setNotice] = useState("");
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d;
  }).filter((d) => draft.weekendAllowed || ![0, 6].includes(d.getDay()));
  const toggles = [
    ["weekendAllowed", "允许周末预约"],
    ["questionnaireEnabled", "启用检前问卷"],
    ["questionnaireSkippable", "允许跳过问卷"],
    ["recommendationEnabled", "展示问卷推荐流程"],
    ["defaultSelected", "套餐项目默认选中"],
    ["allowRemove", "允许取消套餐项目"],
    ["showPrices", "显示项目价格"],
  ];
  return (
    <section className="panel ops-panel">
      <div className="ops-panel-title">
        <div>
          <h2>预约容量与展示规则</h2>
          <p>修改保存在共享配置；预览展示规则效果，未连接真实号源系统。</p>
        </div>
        <Settings2 size={21} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            Number(draft.yellowCapacity) > Number(draft.redCapacity) ||
            Number(draft.redCapacity) > Number(draft.dailyCapacity)
          ) {
            setNotice("保存失败：黄线 ≤ 红线 ≤ 每日容量，请检查设置。");
            return;
          }
          act({ type: "UPDATE_CONFIG", payload: draft });
          setNotice("预约规则已保存，容量、删项与价格开关已写入共享配置。");
        }}
      >
        <div className="ops-form-grid">
          <FormFields
            fields={[
              f("dailyCapacity", "每日预约总容量", "number"),
              f("yellowCapacity", "黄线预警人数", "number"),
              f("redCapacity", "红线限制人数", "number"),
              f("releaseHour", "次日号源开放时间"),
              f("groupReleaseHour", "团检号源释放时间"),
              f("priceMode", "价格展示模式", "select", [
                "原价",
                "执行价",
                "不显示",
              ]),
              f("timeSlots", "时段与放号量", "textarea"),
            ]}
            draft={draft}
            setDraft={setDraft}
          />
          <div className="ops-permissions ops-span2">
            {toggles.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={!!draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="ops-booking-preview">
          <h3>未来两周开放日期预览</h3>
          <div>
            {dates.map((d) => (
              <span key={d.toISOString()}>
                {d.getMonth() + 1}/{d.getDate()}{" "}
                <small>
                  {["日", "一", "二", "三", "四", "五", "六"][d.getDay()]}
                </small>
              </span>
            ))}
          </div>
          <p>
            周末开关影响此预览；排期时段、放号时刻及套餐特定配额需接入后端执行。
          </p>
        </div>
        {notice && (
          <div className="ops-feedback" role="status">
            {notice}
          </div>
        )}
        <div className="ops-modal-actions">
          <button className="btn btn-primary" type="submit">
            <Check size={15} />
            保存预约规则
          </button>
        </div>
      </form>
    </section>
  );
}

const sectionMeta: Record<
  string,
  {
    title: string;
    en: string;
    subtitle: string;
    icon: any;
    specs: WorkspaceSpec[];
  }
> = {
  services: {
    title: "专业服务",
    en: "PROFESSIONAL SERVICES",
    subtitle: "让专业服务有序流转，让每一份健康关怀及时抵达。",
    icon: Users,
    specs: serviceSpecs,
  },
  commerce: {
    title: "健康商城",
    en: "HEALTH COMMERCE",
    subtitle: "商品、订单、售后与结算，一站协同的运营工作台。",
    icon: ShoppingBag,
    specs: commerceSpecs,
  },
  content: {
    title: "内容与互动",
    en: "CONTENT & COMMUNITY",
    subtitle: "传播可信的健康知识，建立更有温度的服务连接。",
    icon: MessageSquare,
    specs: contentSpecs,
  },
  support: {
    title: "客户服务",
    en: "CUSTOMER CARE",
    subtitle: "及时响应，透明协作，每一个反馈都有着落。",
    icon: ClipboardList,
    specs: supportSpecs,
  },
  settings: {
    title: "系统管理",
    en: "SYSTEM ADMINISTRATION",
    subtitle: "规范组织、权限与数据字典，构建可靠的业务基础。",
    icon: Settings2,
    specs: settingsSpecs,
  },
};
export default function Operations({
  section = "services",
}: {
  section: string;
}) {
  const route = section.replace(/^\//, "").split("/")[0];
  const meta = sectionMeta[route] || sectionMeta.services;
  const [tab, setTab] = useState(meta.specs[0].key);
  const { state } = useDemo() as any;
  useEffect(() => {
    setTab(meta.specs[0].key);
    setShowAudit(false);
  }, [route]);
  const spec = meta.specs.find((x) => x.key === tab) || meta.specs[0];
  const [showAudit, setShowAudit] = useState(false);
  const Icon = meta.icon;
  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">{meta.en}</span>
          <h1>
            {meta.title}
            <span className="ops-title-dot" />
          </h1>
          <p>{meta.subtitle}</p>
        </div>
        <div className="ops-heading-icon">
          <Icon size={28} />
        </div>
      </div>
      <Banner>
        {route === "commerce"
          ? "合成交易演示 · 不发起真实支付、充值、退款或物流。"
          : route === "settings"
            ? "前端配置演示 · 权限选项不构成服务端授权，设备接口尚未接入。"
            : "合成数据演示 · 不向真实客户发送消息，不提供实际医疗服务。"}
      </Banner>
      <div className="ops-tabbar">
        {meta.specs.map((s) => (
          <button
            key={s.key}
            className={spec.key === s.key ? "active" : ""}
            onClick={() => {
              setTab(s.key);
              setShowAudit(false);
            }}
          >
            {s.label}
            {s.key === "tickets" && <span>2</span>}
          </button>
        ))}
        {route === "settings" && (
          <button
            className={showAudit ? "active" : ""}
            onClick={() => setShowAudit(!showAudit)}
          >
            操作审计
          </button>
        )}
      </div>
      {showAudit ? (
        <section className="panel ops-panel">
          <div className="ops-panel-title">
            <div>
              <h2>操作审计</h2>
              <p>当前浏览器内的业务操作留痕</p>
            </div>
            <History size={22} />
          </div>
          <div className="ops-audit-list">
            {(state.audit || [])
              .slice()
              .reverse()
              .map((a: Row, i: number) => (
                <div className="ops-history-item" key={a.id || i}>
                  <span />
                  <div>
                    <b>{a.message || a.action || String(a)}</b>
                    <small>
                      {a.time || a.at || a.date} · {a.user || "当前操作员"}
                    </small>
                  </div>
                </div>
              ))}
            {!state.audit?.length && (
              <p>尚无操作记录，完成业务操作后会显示在此。</p>
            )}
          </div>
        </section>
      ) : spec.key === "bookingRules" ? (
        <BookingConfig />
      ) : (
        <>
          {spec.key.startsWith("crm") && <CrmSummary />}
          <RecordWorkspace key={spec.key} spec={spec} />
        </>
      )}
    </div>
  );
}
