import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  OrganizationWorkspace,
  DictionaryCategories,
  DeviceInventory,
} from "./AdminDomains";
import { UiResourceSettings, uiElementAllowed } from "./UiResources";
import { LocalMessages, DoctorTeamRelations } from "./HealthDomains";
import { CrmProgress } from "./CrmProgress";
import { ServiceBatch, AccountsFinance } from "./ServiceFinance";
import {
  ProductAttributes,
  ExchangeWorkbench,
  OrderDisputes,
} from "./CommerceAftercare";
import PatientBookingSettings from "./PatientBookingSettings";
import MessageWorkbench from "./MessageWorkbench";

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
  const { state } = useDemo() as any;
  const custom = (state.records.riskLevels || []).find(
    (r: Row) => r.code === v,
  );
  return (
    <span
      style={
        custom
          ? { color: custom.color, background: `${custom.color}18` }
          : undefined
      }
      className={`ops-tag ${/通过|完成|启用|发布|已签收|已结算|已回复|已解决|在售|已入库/.test(v) ? "good" : /拒绝|驳回|取消|异常|紧急|高|失败/.test(v) ? "bad" : /待|处理中|服务中|中/.test(v) ? "warn" : ""}`}
    >
      {custom ? `${v} · ${custom.name}` : v}
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
  const { rows, act, state } = useCollection(spec);
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
    if (["crmContracts", "crmActivities"].includes(spec.key)) {
      const customers = state.records.crmCustomers || crmSpecs[0].seeds;
      const customer = customers.find(
        (c: Row) => c.id === editor.customerId || c.name === editor.customer,
      );
      if (!customer) {
        setError("请先在 CRM 客户中建立对应客户，合同和业务必须关联已有客户。");
        return;
      }
      editor.customerId = customer.id;
      editor.customer = customer.name;
      if (
        spec.key === "crmContracts" &&
        Number(editor.received) > Number(editor.amount)
      ) {
        setError("已回款不能超过合同金额。");
        return;
      }
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
        ...(spec.key === "crmCustomers" && status === "认领待审"
          ? { requestedOwner: state.config.crmUser || "陈晓" }
          : {}),
        ...(spec.key === "crmCustomers" && status === "已认领"
          ? { owner: r.requestedOwner || state.config.crmUser || "陈晓" }
          : {}),
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
            hidden={!uiElementAllowed(state, "operations.export")}
            className="btn"
            onClick={() => {
              if (!uiElementAllowed(state, "operations.export")) {
                setNotice("当前角色无导出权限");
                return;
              }
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
              {spec.kind === "products" && (
                <section className="ops-inline-box">
                  <h3>商品图片与结构化属性</h3>
                  {(record.attributeOptions || []).map((attribute: Row) => (
                    <p key={attribute.key}>
                      <b>{attribute.key}</b>：{attribute.values.join(" / ")}
                    </p>
                  ))}

                  <p>
                    仅保存本地图片；PNG/JPEG/WebP，每张最大 256 KB，最多 3 张。
                  </p>
                  <input
                    type="file"
                    aria-label="上传商品图片"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (
                        !["image/png", "image/jpeg", "image/webp"].includes(
                          file.type,
                        ) ||
                        file.size > 256 * 1024 ||
                        (record.images || []).length >= 3
                      ) {
                        setError(
                          "仅支持 256 KB 内的 PNG/JPEG/WebP，最多 3 张。",
                        );
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () =>
                        persist(
                          {
                            ...record,
                            images: [
                              ...(record.images || []),
                              {
                                id: uid("IMG"),
                                name: file.name,
                                data: reader.result,
                              },
                            ],
                          },
                          "保存本地商品图片",
                        );
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    {(record.images || []).map((img: Row) => (
                      <div key={img.id}>
                        <img
                          src={img.data}
                          alt={img.name}
                          style={{
                            width: 75,
                            height: 75,
                            objectFit: "contain",
                            border: "1px solid #dae6dd",
                          }}
                        />
                        <button
                          className="ops-text-btn"
                          onClick={() =>
                            persist(
                              {
                                ...record,
                                images: record.images.filter(
                                  (i: Row) => i.id !== img.id,
                                ),
                              },
                              "删除商品图片",
                            )
                          }
                        >
                          删除图片
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="ops-form-grid" style={{ padding: "15px 0" }}>
                    {["color", "size"].map((key) => (
                      <label className="ops-field" key={key}>
                        <span>{key === "color" ? "颜色属性" : "规格属性"}</span>
                        <input
                          aria-label={
                            key === "color" ? "商品颜色属性" : "商品规格属性"
                          }
                          defaultValue={record.attributes?.[key] || ""}
                          onBlur={(e) => {
                            if (e.target.value !== record.attributes?.[key])
                              persist(
                                {
                                  ...record,
                                  attributes: {
                                    ...record.attributes,
                                    [key]: e.target.value,
                                  },
                                },
                                "更新结构化商品属性",
                              );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              )}
              {spec.key === "articles" && record.category === "健康视频" && (
                <section className="ops-inline-box">
                  <h3>健康视频播放器</h3>
                  <p>
                    可上传本地 MP4/WebM（最大 1 MB），或在资料编辑中填写 HTTPS
                    媒体地址；不自动播放。
                  </p>
                  <input
                    type="file"
                    aria-label="上传健康视频"
                    accept="video/mp4,video/webm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (
                        !["video/mp4", "video/webm"].includes(file.type) ||
                        file.size > 1024 * 1024
                      ) {
                        setError("仅支持 1 MB 内的 MP4/WebM 视频。");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () =>
                        persist(
                          {
                            ...record,
                            videoData: reader.result,
                            videoName: file.name,
                          },
                          "保存本地健康视频",
                        );
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  {record.videoData ||
                  /^https:\/\//.test(record.media || "") ? (
                    <>
                      <video
                        aria-label="健康视频预览播放器"
                        controls
                        preload="metadata"
                        src={record.videoData || record.media}
                        style={{
                          width: "100%",
                          marginTop: 14,
                          background: "#18382b",
                          borderRadius: 8,
                        }}
                      />
                      <p>{record.videoName || record.media}</p>
                      <button
                        className="btn"
                        onClick={() =>
                          persist(
                            {
                              ...record,
                              videoData: "",
                              videoName: "",
                              media: "",
                            },
                            "删除健康视频媒体",
                          )
                        }
                      >
                        删除视频媒体
                      </button>
                    </>
                  ) : (
                    <p>尚未设置可播放媒体，选择演示文件后可预览。</p>
                  )}
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
        parent: "红创健康体检中心",
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
        customer: "红创科技（演示）",
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
      seed("TEAM-101", "红创健康管理团队", {
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
        sku: "HC-CUP-001",
        status: "在售",
        description: "500ml / 雾绿色 / 合成展示商品。",
      }),
      seed("P-1002", "睡眠知识入门课", {
        category: "健康课程",
        price: 39,
        stock: 999,
        sku: "HC-COURSE-002",
        status: "在售",
        description: "4 课时健康知识教育。",
      }),
      seed("P-1003", "年度基础体检服务", {
        category: "体检服务",
        price: 599,
        stock: 48,
        sku: "HC-EXAM-001",
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
    ["红创健康官方店", "城阳院区服务店"],
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
      seed("ART-1003", "红创十月健康主题活动报名", {
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
        customer: "红创科技（演示）",
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
        customer: "红创科技（演示）",
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
    ["红创健康体检中心", "城阳服务分中心", "红创科技（演示）"],
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
crmSpecs[1].seeds.forEach((c) => {
  const customer = crmSpecs[0].seeds.find((r) => r.name === c.customer);
  if (customer) c.customerId = customer.id;
});
crmSpecs[2].seeds.forEach((a) => {
  const customer = crmSpecs[0].seeds.find((r) => r.name === a.customer);
  if (customer) a.customerId = customer.id;
  if (a.category === "实际回款") a.contractId = "CON-1002";
});
crmSpecs[2].seeds.push({
  id: "PAY-SEED-1001",
  name: "星辰科技首期合成回款",
  customerId: "CRM-1001",
  customer: "星辰科技",
  contractId: "CON-1001",
  category: "实际回款",
  owner: "陈晓",
  amount: 45000,
  date: "2026-09-18",
  status: "已完成",
  description: "与初始合同已回款一致的合成来源记录。",
});
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
      f("level", "小结等级", "select", ["一般", "关注", "重要"]),
      f("code", "项目 / 模板编码"),
      f("related", "关联项目编码"),
      f("description", "配置内容", "textarea"),
    ],
  ),
);
function CrmSummary() {
  const { state, act } = useDemo() as any;
  const customers = useCollection(crmSpecs[0]).rows;
  const allContracts = useCollection(crmSpecs[1]).rows;
  const allActivities = useCollection(crmSpecs[2]).rows;
  const [year, setYear] = useState(today().slice(0, 4));
  const [person, setPerson] = useState("全部业务员");
  const [customerId, setCustomerId] = useState("CRM-1001");
  const [contractName, setContractName] = useState("");
  const [amount, setAmount] = useState(1000);
  const [dueDate, setDueDate] = useState(today());
  const [contractId, setContractId] = useState("CON-1001");
  const [payment, setPayment] = useState(100);
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentType, setPaymentType] = useState("实际回款");
  const [notice, setNotice] = useState("");
  const contracts = allContracts.filter(
    (r) =>
      String(r.date || "").slice(0, 4) === year &&
      (person === "全部业务员" || r.owner === person),
  );
  const activities = allActivities.filter(
    (r) =>
      String(r.date || "").slice(0, 4) === year &&
      (person === "全部业务员" || r.owner === person),
  );
  const owners = [
    ...new Set(
      [...allContracts, ...allActivities, ...customers]
        .map((r) => r.owner)
        .filter(Boolean),
    ),
  ];
  const total = contracts.reduce((n, r) => n + Number(r.amount || 0), 0),
    received = contracts.reduce((n, r) => n + Number(r.received || 0), 0);
  const overdue = contracts.filter(
    (r) => r.dueDate < today() && Number(r.amount) > Number(r.received),
  );
  const monthly = Array.from({ length: 12 }, (_, i) =>
    activities
      .filter(
        (r) =>
          r.category === "实际回款" &&
          r.status === "已完成" &&
          r.date?.slice(5, 7) === String(i + 1).padStart(2, "0"),
      )
      .reduce((n, r) => n + Number(r.amount || 0), 0),
  );
  const max = Math.max(1, ...monthly);
  const customer = customers.find((c) => c.id === customerId) || customers[0];
  const linkedContracts = allContracts.filter(
    (c) =>
      c.customerId === customer?.id ||
      (!c.customerId && c.customer === customer?.name),
  );
  const chosen =
    linkedContracts.find((c) => c.id === contractId) || linkedContracts[0];
  return (
    <section className="panel ops-panel ops-crm">
      <div className="ops-panel-title">
        <div>
          <h2>个人业务看板</h2>
          <p>
            客户和合同以 ID
            关联；年度及业务员过滤同时应用于金额、完成率和月度回款。
          </p>
        </div>
        <Tag value={`${overdue.length} 笔逾期账款`} />
      </div>
      <div className="ops-toolbar">
        <label className="ops-field">
          <span>统计年份</span>
          <input
            aria-label="CRM统计年份"
            type="number"
            value={year}
            min={2000}
            max={2100}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <label className="ops-field">
          <span>业务负责人</span>
          <select
            aria-label="CRM业务负责人"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option>全部业务员</option>
            {owners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          onClick={() => setPerson(state.config.crmUser || "陈晓")}
        >
          仅看我的业绩
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadCsv("CRM年度合同与回款", contracts, [
              f("id", "合同编号"),
              f("customerId", "客户编号"),
              f("name", "合同"),
              f("owner", "负责人"),
              f("amount", "合同金额"),
              f("received", "已回款"),
              f("date", "合同日期"),
            ])
          }
        >
          导出当前业绩
        </button>
      </div>
      <div className="ops-crm-summary">
        <div>
          <span>年度订单金额</span>
          <strong data-testid="crm-year-total">
            ¥{total.toLocaleString()}
          </strong>
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
                  (contracts.filter((r) => r.status === "已完成").length /
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
                (r) => r.category === "拜访" && r.status === "已完成",
              ).length
            }{" "}
            次
          </strong>
        </div>
      </div>
      <div className="ops-month-chart" aria-label="本年度每月实际回款柱状图">
        {monthly.map((v, i) => (
          <div key={i}>
            <small data-testid={`crm-month-${i + 1}`}>
              {v ? "¥" + v.toLocaleString() : ""}
            </small>
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
              (r) =>
                `${r.customer} · 待回款 ¥${(Number(r.amount) - Number(r.received)).toLocaleString()}`,
            )
            .join("；")}
        </div>
      )}
      <details style={{ margin: "0 24px 22px" }}>
        <summary style={{ fontSize: 12, cursor: "pointer" }}>
          客户关联、合同立项与计划 / 实际回款登记
        </summary>
        <div className="ops-form-grid" style={{ padding: "20px 0" }}>
          <label className="ops-field">
            <span>关联客户</span>
            <select
              aria-label="CRM关联客户"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.id}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>新合同名称</span>
            <input
              aria-label="CRM新合同名称"
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
            />
          </label>
          <label className="ops-field">
            <span>合同金额</span>
            <input
              type="number"
              aria-label="CRM新合同金额"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label className="ops-field">
            <span>计划回款日期</span>
            <input
              type="date"
              aria-label="CRM计划回款日期"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (
                !contractName.trim() ||
                !Number.isFinite(amount) ||
                amount <= 0 ||
                !dueDate
              ) {
                setNotice("请填写合同名称、正数金额和回款日期。");
                return;
              }
              const id = uid("CON");
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "crmContracts",
                  record: {
                    id,
                    name: contractName,
                    customerId: customer.id,
                    customer: customer.name,
                    owner: person === "全部业务员" ? "陈晓" : person,
                    amount,
                    received: 0,
                    date: today(),
                    dueDate,
                    status: "待审批",
                    description: "客户 ID 关联的本地合成合同，未经实际签署。",
                  },
                },
              });
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "crmCustomers",
                  record: { ...customer, project: "已立项" },
                },
              });
              setContractName("");
              setContractId(id);
              setNotice("已创建客户关联的待审批合同。");
            }}
          >
            创建关联待审合同
          </button>
          <div />
          <label className="ops-field">
            <span>回款关联合同</span>
            <select
              aria-label="CRM回款关联合同"
              value={chosen?.id || ""}
              onChange={(e) => setContractId(e.target.value)}
            >
              {linkedContracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · 剩余 ¥{Number(c.amount) - Number(c.received)}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>回款类型</span>
            <select
              aria-label="CRM回款类型"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              <option>实际回款</option>
              <option>计划回款</option>
            </select>
          </label>
          <label className="ops-field">
            <span>回款金额</span>
            <input
              type="number"
              aria-label="CRM登记回款金额"
              value={payment}
              onChange={(e) => setPayment(Number(e.target.value))}
            />
          </label>
          <label className="ops-field">
            <span>回款日期</span>
            <input
              type="date"
              aria-label="CRM登记回款日期"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={!chosen}
            onClick={() => {
              if (
                !Number.isFinite(payment) ||
                payment <= 0 ||
                !paymentDate ||
                payment > Number(chosen.amount) - Number(chosen.received)
              ) {
                setNotice("回款金额须为正且不能超过合同剩余应收。");
                return;
              }
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "crmActivities",
                  record: {
                    id: uid("PAY"),
                    name: `${chosen.name} · ${paymentType}`,
                    customerId: customer.id,
                    customer: customer.name,
                    contractId: chosen.id,
                    category: paymentType,
                    owner: chosen.owner,
                    amount: payment,
                    date: paymentDate,
                    status: paymentType === "实际回款" ? "已完成" : "计划中",
                    description: "仅登记合成财务资料，不执行转账。",
                  },
                },
              });
              if (paymentType === "实际回款")
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "crmContracts",
                    record: {
                      ...chosen,
                      received: Number(chosen.received) + payment,
                    },
                  },
                });
              setNotice(
                `${paymentType}已关联到合同 ${chosen.id}，年度看板同步更新。`,
              );
            }}
          >
            登记关联合同回款
          </button>
        </div>
      </details>
      {notice && (
        <div className="ops-feedback" role="status">
          {notice}
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

const rewardTaskSpec: WorkspaceSpec = {
  key: "rewardTasks",
  label: "梦想任务规则",
  description: "配置任务资格与一次性发放的健康豆，业务工作台实际消费这些规则。",
  fields: [
    f("name", "任务名称"),
    f("condition", "完成条件", "select", ["知识学习", "随访完成"]),
    f("points", "奖励健康豆", "number"),
    f("description", "完成要求", "textarea"),
  ],
  statuses: ["已启用", "已停用"],
  seeds: [
    {
      id: "RT001",
      name: "阅读健康知识卡",
      condition: "知识学习",
      points: 20,
      description: "填写本次合成阅读记录，审核后一次性领取。",
      status: "已启用",
    },
    {
      id: "RT002",
      name: "完成一次关联随访",
      condition: "随访完成",
      points: 30,
      description: "该客户存在已完成随访任务时才允许领取。",
      status: "已启用",
    },
  ],
};
const rewardProductSpec: WorkspaceSpec = {
  key: "rewardProducts",
  label: "梦想商品规则",
  description: "健康豆兑换商品与可用库存，库存按未取消兑换记录实时扣减。",
  fields: [
    f("name", "梦想商品"),
    f("pointsCost", "兑换健康豆", "number"),
    f("stock", "可兑换总库存", "number"),
    f("description", "兑换与取消政策", "textarea"),
  ],
  statuses: ["已启用", "已停用"],
  seeds: [
    {
      id: "RP001",
      name: "健康主题帆布袋（合成）",
      pointsCost: 80,
      stock: 12,
      description: "每日每客户限兑一次；未领取前可取消并原额退回健康豆。",
      status: "已启用",
    },
    {
      id: "RP002",
      name: "健康知识手册（合成）",
      pointsCost: 30,
      stock: 30,
      description: "仅本地模拟兑换，不配送实物。",
      status: "已启用",
    },
  ],
};
const activitySpec: WorkspaceSpec = {
  key: "communityActivities",
  label: "健康活动规则",
  description: "报名容量、审核状态与签到奖励即时约束活动报名。",
  fields: [
    f("name", "活动名称"),
    f("team", "组织团队"),
    f("date", "活动日期", "date"),
    f("capacity", "名额上限", "number"),
    f("points", "签到健康豆", "number"),
    f("description", "活动说明", "textarea"),
  ],
  statuses: ["待审核", "已启用", "已驳回", "已结束"],
  transitions: {
    待审核: ["已启用", "已驳回"],
    已驳回: ["待审核"],
    已启用: ["已结束"],
    已结束: [],
  },
  seeds: [
    {
      id: "ACT001",
      name: "十月健康知识交流会",
      team: "健康教育组",
      date: today(),
      capacity: 12,
      points: 15,
      description: "合成活动，可报名、取消及模拟签到；不组织真实活动。",
      status: "已启用",
    },
    {
      id: "ACT002",
      name: "企业健康主题活动",
      team: "企业服务组",
      date: today(),
      capacity: 2,
      points: 25,
      description: "用于演示名额限制与审核流程。",
      status: "待审核",
    },
  ],
};
export function applyLoyaltyChange(
  account: Row,
  delta: number,
  reason: string,
  sourceKey: string,
) {
  if (!Number.isInteger(delta) || !reason.trim() || !sourceKey)
    throw new Error("健康豆变动必须为整数且填写原因。");
  if ((account.ledger || []).some((l: Row) => l.sourceKey === sourceKey))
    return account;
  const balance = Number(account.balance || 0) + delta;
  if (balance < 0) throw new Error("健康豆余额不足，不能形成负余额。");
  return {
    ...account,
    balance,
    ledger: [
      ...(account.ledger || []),
      {
        id: sourceKey,
        sourceKey,
        delta,
        balance,
        reason,
        at: new Date().toISOString(),
      },
    ],
  };
}
function LoyaltyCenter() {
  const { state, act } = useDemo() as any;
  const tasks = useCollection(rewardTaskSpec).rows,
    products = useCollection(rewardProductSpec).rows,
    activities = useCollection(activitySpec).rows;
  const [patientId, setPatientId] = useState(state.patients[0]?.id);
  const [tab, setTab] = useState("work");
  const [evidence, setEvidence] = useState("");
  const [notice, setNotice] = useState("");
  const [delta, setDelta] = useState(10);
  const [reason, setReason] = useState("");
  const [redeem, setRedeem] = useState<Row | null>(null);
  const [code, setCode] = useState("");
  const accounts = state.records.loyaltyAccounts || [];
  const account = accounts.find((a: Row) => a.patientId === patientId) || {
    id: `LOY-${patientId}`,
    patientId,
    balance: 100,
    ledger: [
      {
        id: "opening",
        sourceKey: "opening",
        delta: 100,
        balance: 100,
        reason: "合成开户赠送",
        at: today(),
      },
    ],
    completedTasks: [],
    redemptions: [],
    enrollments: [],
  };
  const save = (next: Row, message: string) => {
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "loyaltyAccounts", record: next },
    });
    setNotice(message);
  };
  const change = (delta: number, why: string, key: string, patch: Row = {}) => {
    try {
      const next = applyLoyaltyChange(account, delta, why, key);
      if (next === account) {
        setNotice("该来源已记账，不重复发放或扣除。");
        return false;
      }
      save({ ...next, ...patch }, why);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    }
  };
  // Anonymous aggregates include hidden customers without exposing their account details.
  const resourceUsed = (kind: string, resourceId: string) =>
    Number(
      (state.records.resourceUsage || []).find(
        (r: Row) => r.kind === kind && r.resourceId === resourceId,
      )?.used || 0,
    );
  return (
    <>
      <div className="ops-toolbar" style={{ padding: "0 0 20px" }}>
        <label className="ops-field">
          <span>健康豆客户账户</span>
          <select
            aria-label="健康豆客户账户"
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setNotice("");
              setRedeem(null);
            }}
          >
            {state.patients.map((p: Row) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginLeft: "auto" }}>
          <Tag value={`${account.balance} 健康豆`} />
        </div>
      </div>
      <div className="health-profile-tabs">
        {[
          ["work", "账户与活动"],
          ["tasks", "梦想任务规则"],
          ["products", "梦想商品规则"],
          ["activities", "活动规则审核"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "work" ? (
        <RecordWorkspace
          spec={
            tab === "tasks"
              ? rewardTaskSpec
              : tab === "products"
                ? rewardProductSpec
                : activitySpec
          }
        />
      ) : (
        <>
          <Metrics
            items={[
              {
                label: "健康豆余额",
                value: account.balance,
                note: "合成积分，无现金价值",
              },
              { label: "已完成梦想任务", value: account.completedTasks.length },
              {
                label: "有效兑换记录",
                value: account.redemptions.filter(
                  (r: Row) => r.status !== "已取消",
                ).length,
              },
              {
                label: "已报名活动",
                value: account.enrollments.filter(
                  (r: Row) => r.status !== "已取消",
                ).length,
              },
            ]}
          />
          {notice && (
            <div className="ops-feedback" role="status">
              {notice}
            </div>
          )}
          <section className="panel ops-panel">
            <div className="ops-panel-title">
              <div>
                <h2>完成梦想任务</h2>
                <p>每个客户每项任务只发放一次；关联随访必须确实完成。</p>
              </div>
            </div>
            <label className="ops-field" style={{ margin: "0 24px 18px" }}>
              <span>任务完成记录</span>
              <input
                aria-label="梦想任务完成记录"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="填写合成任务完成说明"
              />
            </label>
            {tasks
              .filter((t) => t.status === "已启用")
              .map((t) => {
                const completed = account.completedTasks.some(
                  (c: Row) => c.taskId === t.id,
                );
                const eligible =
                  t.condition !== "随访完成" ||
                  state.tasks.some(
                    (x: Row) =>
                      x.patientId === patientId && x.status === "已完成",
                  );
                return (
                  <div className="health-attention-row" key={t.id}>
                    <div>
                      <b>
                        {t.name} · +{t.points} 豆
                      </b>
                      <small>
                        {t.description}
                        {!eligible ? " · 暂无已完成随访，不符合领取条件" : ""}
                      </small>
                    </div>
                    <button
                      className="btn"
                      disabled={completed || !eligible}
                      onClick={() => {
                        if (!evidence.trim()) {
                          setNotice("请填写任务完成记录。");
                          return;
                        }
                        change(
                          Number(t.points),
                          `完成梦想任务：${t.name}`,
                          `task:${t.id}`,
                          {
                            completedTasks: [
                              ...account.completedTasks,
                              {
                                taskId: t.id,
                                evidence,
                                points: t.points,
                                date: today(),
                              },
                            ],
                          },
                        );
                      }}
                    >
                      {completed ? "已领取" : "完成并领取"}
                    </button>
                  </div>
                );
              })}
          </section>
          <section className="panel ops-panel" style={{ marginTop: 22 }}>
            <div className="ops-panel-title">
              <div>
                <h2>梦想商品兑换</h2>
                <p>每日每商品限兑一次；未领取前取消退豆，已核销不能取消。</p>
              </div>
            </div>
            {products
              .filter((p) => p.status === "已启用")
              .map((p) => {
                const used = resourceUsed("reward", p.id);
                const usedToday = account.redemptions.some(
                  (r: Row) => r.productId === p.id && r.date === today(),
                );
                return (
                  <div className="health-attention-row" key={p.id}>
                    <div>
                      <b>{p.name}</b>
                      <small>
                        {p.pointsCost} 健康豆 · 可用库存{" "}
                        {Math.max(0, p.stock - used)}
                      </small>
                    </div>
                    <button
                      className="btn"
                      disabled={usedToday || p.stock <= used}
                      onClick={() =>
                        setRedeem({
                          ...p,
                          redemptionId: `RD-${patientId}-${p.id}-${today()}`,
                        })
                      }
                    >
                      {usedToday ? "今日已兑换" : "兑换商品"}
                    </button>
                  </div>
                );
              })}
            {account.redemptions.map((r: Row) => (
              <div className="health-attention-row" key={r.id}>
                <div>
                  <b>
                    {r.name} · <Tag value={r.status} />
                  </b>
                  <small>
                    消费码 {r.code} · {r.points} 豆
                  </small>
                </div>
                {r.status === "待领取" && (
                  <div className="ops-action-wrap">
                    <input
                      aria-label={`兑换核销码 ${r.id}`}
                      placeholder="输入完整消费码"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      style={{ width: 160, fontSize: 10 }}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        if (code !== r.code) {
                          setNotice("消费码不匹配，未核销。");
                          return;
                        }
                        save(
                          {
                            ...account,
                            redemptions: account.redemptions.map((x: Row) =>
                              x.id === r.id
                                ? {
                                    ...x,
                                    status: "已领取",
                                    redeemedAt: today(),
                                  }
                                : x,
                            ),
                          },
                          "兑换消费码已核销，不能重复领取。",
                        );
                        setCode("");
                      }}
                    >
                      确认核销领取
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        change(
                          r.points,
                          `取消兑换退回：${r.name}`,
                          `refund:${r.id}`,
                          {
                            redemptions: account.redemptions.map((x: Row) =>
                              x.id === r.id ? { ...x, status: "已取消" } : x,
                            ),
                          },
                        )
                      }
                    >
                      取消并退豆
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
          <section className="panel ops-panel" style={{ marginTop: 22 }}>
            <div className="ops-panel-title">
              <div>
                <h2>健康广场活动</h2>
                <p>先报名后签到；报名人数跨合成客户实时统计，取消释放名额。</p>
              </div>
            </div>
            {activities.map((a) => {
              const enrollment = account.enrollments.find(
                (e: Row) => e.activityId === a.id && e.status !== "已取消",
              );
              const count = resourceUsed("activity", a.id);
              return (
                <div className="health-attention-row" key={a.id}>
                  <div>
                    <b>
                      {a.name} · <Tag value={a.status} />
                    </b>
                    <small>
                      {a.date} ·{" "}
                      {state.records.doctorTeams?.find(
                        (t: Row) => t.id === a.teamId,
                      )?.name || a.team}{" "}
                      · 名额 {count}/{a.capacity} · 签到奖励 {a.points} 豆
                    </small>
                  </div>
                  <div className="ops-action-wrap">
                    {!enrollment ? (
                      <button
                        className="btn"
                        disabled={
                          a.status !== "已启用" ||
                          count >= a.capacity ||
                          a.date < today()
                        }
                        onClick={() =>
                          save(
                            {
                              ...account,
                              enrollments: [
                                ...account.enrollments,
                                {
                                  id: uid("EN"),
                                  activityId: a.id,
                                  name: a.name,
                                  status: "已报名",
                                  date: today(),
                                },
                              ],
                            },
                            "报名成功，已占用 1 个活动名额。",
                          )
                        }
                      >
                        {count >= a.capacity ? "名额已满" : "报名活动"}
                      </button>
                    ) : enrollment.status === "已签到" ? (
                      <Tag value="已签到并发放" />
                    ) : (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            change(
                              Number(a.points),
                              `活动签到奖励：${a.name}`,
                              `activity:${a.id}`,
                              {
                                enrollments: account.enrollments.map(
                                  (e: Row) =>
                                    e.id === enrollment.id
                                      ? { ...e, status: "已签到" }
                                      : e,
                                ),
                              },
                            )
                          }
                        >
                          签到并发放
                        </button>
                        <button
                          className="btn"
                          onClick={() =>
                            save(
                              {
                                ...account,
                                enrollments: account.enrollments.map(
                                  (e: Row) =>
                                    e.id === enrollment.id
                                      ? { ...e, status: "已取消" }
                                      : e,
                                ),
                              },
                              "报名已取消，活动名额已释放。",
                            )
                          }
                        >
                          取消报名
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          <section className="panel ops-panel" style={{ marginTop: 22 }}>
            <div className="ops-panel-title">
              <div>
                <h2>健康豆账本</h2>
                <p>逐笔记录来源与变动后余额，拒绝重复来源或负余额。</p>
              </div>
              <button
                className="btn"
                onClick={() =>
                  downloadCsv("健康豆账本", account.ledger, [
                    f("at", "时间"),
                    f("reason", "原因"),
                    f("delta", "变动"),
                    f("balance", "余额"),
                    f("sourceKey", "来源"),
                  ])
                }
              >
                导出账本
              </button>
            </div>
            <div className="ops-toolbar">
              <input
                type="number"
                aria-label="健康豆调整数量"
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
                style={{ width: 100 }}
              />
              <input
                aria-label="健康豆调整原因"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="调整原因，必填"
              />
              <button
                className="btn"
                onClick={() => {
                  if (change(delta, reason, uid("ADJ"))) setReason("");
                }}
              >
                登记合成调整
              </button>
            </div>
            <table className="ops-table" aria-label="健康豆账本">
              <thead>
                <tr>
                  <th>来源说明</th>
                  <th>变动</th>
                  <th>余额</th>
                </tr>
              </thead>
              <tbody>
                {account.ledger
                  .slice()
                  .reverse()
                  .map((l: Row) => (
                    <tr key={l.id}>
                      <td>
                        {l.reason}
                        <small className="ops-block">{l.sourceKey}</small>
                      </td>
                      <td>
                        {l.delta > 0 ? "+" : ""}
                        {l.delta}
                      </td>
                      <td>{l.balance}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {redeem && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-label="确认梦想商品兑换"
            aria-modal="true"
          >
            <div className="ops-modal-head">
              <h2>确认合成兑换</h2>
              <button className="btn" onClick={() => setRedeem(null)}>
                取消
              </button>
            </div>
            <div className="health-task-detail">
              <p>
                {redeem.name} · 需要 {redeem.pointsCost} 豆
              </p>
              <p>
                当前余额 {account.balance} 豆，兑换后{" "}
                {account.balance - redeem.pointsCost}{" "}
                豆。仅生成演示领取码，不配送。
              </p>
              <p>未领取可取消并退回原额健康豆，核销后不可取消。</p>
            </div>
            <div className="ops-modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  const used = resourceUsed("reward", redeem.id);
                  if (used >= redeem.stock) {
                    setNotice("库存不足，未扣健康豆。");
                    setRedeem(null);
                    return;
                  }
                  const next = {
                    id: redeem.redemptionId,
                    productId: redeem.id,
                    name: redeem.name,
                    points: redeem.pointsCost,
                    date: today(),
                    status: "待领取",
                    code: `DEMO-${redeem.redemptionId}`,
                  };
                  if (
                    change(
                      -Number(redeem.pointsCost),
                      `兑换：${redeem.name}`,
                      `redeem:${redeem.redemptionId}`,
                      { redemptions: [...account.redemptions, next] },
                    )
                  )
                    setRedeem(null);
                }}
              >
                确认兑换（模拟）
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function quoteCommerceOrder(
  product: Row,
  quantity: number,
  shipping: Row | null,
  groupRule: Row | null,
  fulfillment: string,
  region: string,
) {
  const errors: string[] = [];
  if (!Number.isInteger(quantity) || quantity < 1)
    errors.push("数量必须为正整数");
  if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0)
    errors.push("商品价格无效");
  if (
    groupRule &&
    (Number(groupRule.discount) <= 0 ||
      Number(groupRule.discount) > 10 ||
      Number(groupRule.minPeople) < 2)
  )
    errors.push("团购折扣须为 0–10 折且成团人数至少为 2");
  if (fulfillment === "配送" && !shipping) errors.push("请选择运费模板");
  if (
    shipping &&
    (["baseFee", "additionalFee", "freeAbove"].some(
      (k) => Number(shipping[k] || 0) < 0,
    ) ||
      Number(shipping.firstWeight ?? 1) <= 0 ||
      Number(shipping.additionalWeight ?? 1) <= 0)
  )
    errors.push("运费费用不能为负且首重/续重单位必须大于零");
  if (
    shipping &&
    fulfillment === "配送" &&
    !["全国", "全部地区", region].some((v) =>
      String(shipping.region || "")
        .split(/[，,]/)
        .map((x: string) => x.trim())
        .includes(v),
    )
  )
    errors.push("所选地区不在运费模板服务范围");
  const round = (n: number) => Math.round(n * 100) / 100;
  const subtotal = round(Number(product.price) * quantity);
  const discounted = round(
    subtotal * (groupRule ? Number(groupRule.discount) / 10 : 1),
  );
  const weight = Number(product.weight || 0.5) * quantity;
  let fee = 0;
  if (fulfillment === "配送" && shipping) {
    if (!(
      Number(shipping.freeAbove) > 0 && discounted >= Number(shipping.freeAbove)
    ))
      fee =
        Number(shipping.baseFee || 0) +
        Math.ceil(
          Math.max(0, weight - Number(shipping.firstWeight || 1)) /
            Number(shipping.additionalWeight || 1),
        ) *
          Number(shipping.additionalFee || 0);
  }
  return {
    subtotal,
    discount: round(subtotal - discounted),
    discounted,
    shipping: round(fee),
    total: round(discounted + fee),
    weight,
    errors,
  };
}
const domainSpec = (key: string, specs: WorkspaceSpec[]) =>
  specs.find((s) => s.key === key)!;
function CommerceSimulator() {
  const { state, act } = useDemo() as any;
  const products = useCollection(domainSpec("products", commerceSpecs)).rows;
  const shippingRows = useCollection(
    domainSpec("shipping", commerceSpecs),
  ).rows;
  const rules = useCollection(domainSpec("groupBuy", commerceSpecs)).rows;
  const stores = useCollection(domainSpec("stores", commerceSpecs)).rows;
  useCollection(domainSpec("shopOrders", commerceSpecs));
  const [productId, setProductId] = useState("P-1001");
  const [patientId, setPatientId] = useState(state.patients[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState("直接购买");
  const [fulfillment, setFulfillment] = useState("配送");
  const [region, setRegion] = useState("青岛市");
  const [shipId, setShipId] = useState(shippingRows[0]?.id || "");
  const [ruleId, setRuleId] = useState(rules[0]?.id || "");
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [reserveDate, setReserveDate] = useState(today());
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(false);
  // Each preview grants exactly one synchronous submission, even in a batched double click.
  const confirmationConsumed = useRef(true);
  const [code, setCode] = useState("");
  const product = products.find((p) => p.id === productId) || products[0];
  const shipping = shippingRows.find((s) => s.id === shipId) || null;
  const rule =
    mode === "参与团购" ? rules.find((r) => r.id === ruleId) || null : null;
  const orders = state.records.shopOrders || [],
    reservations = state.records.commerceReservations || [],
    rounds = state.records.groupBuyRounds || [];
  const store = stores.find((s) => s.id === storeId);
  const quote = quoteCommerceOrder(
    product,
    quantity,
    shipping,
    rule,
    fulfillment,
    region,
  );
  const reserved = Number(
    (state.records.resourceUsage || []).find(
      (r: Row) => r.kind === "commerce" && r.resourceId === product.id,
    )?.used || 0,
  );
  const available = Number(product.stock) - reserved;
  const currentOrders = orders.filter(
    (o: Row) => o.customerId === patientId && o.pricingSnapshot,
  );
  const currentReservations = reservations.filter(
    (o: Row) => o.customerId === patientId,
  );
  const persist = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  const submit = () => {
    if (!uiElementAllowed(state, "commerce.order.create")) {
      setNotice("当前角色无创建交易权限");
      setConfirm(false);
      return;
    }
    if (confirmationConsumed.current) return;
    confirmationConsumed.current = true;
    const errors = [...quote.errors];
    if (!["在售", "预约中"].includes(product.status))
      errors.push("商品当前不可购买");
    if (quantity > available) errors.push("可用库存不足");
    if (mode === "商品预约" && reserveDate < today())
      errors.push("预约日期不能早于今天");
    if (
      mode === "参与团购" &&
      (!rule || rule.status !== "已启用" || rule.date < today())
    )
      errors.push("团购规则未启用或已过有效期");
    if (
      rule &&
      rule.product &&
      rule.product !== product.name &&
      rule.product !== "全部商品"
    )
      errors.push("团购规则不适用于当前商品");
    if (fulfillment === "到店自取" && (!store || store.status !== "已启用"))
      errors.push("请选择启用的服务店铺");
    if (errors.length) {
      setNotice(errors.join("；"));
      setConfirm(false);
      return;
    }
    const id = uid(mode === "商品预约" ? "RSV" : "SIM");
    const open = rule
      ? rounds.find(
          (g: Row) =>
            g.ruleId === rule.id &&
            g.productId === product.id &&
            g.status === "待成团" &&
            g.deadline >= today(),
        )
      : null;
    if (open?.members.some((m: Row) => m.customerId === patientId)) {
      setNotice("该客户已参加当前团，不重复占用名额。");
      setConfirm(false);
      return;
    }
    const row = {
      id,
      name: product.name,
      productId: product.id,
      customerId: patientId,
      customer: state.patients.find((p: Row) => p.id === patientId)?.name,
      quantity,
      amount: quote.total,
      date: today(),
      reservationDate: mode === "商品预约" ? reserveDate : undefined,
      status: mode === "商品预约" ? "已预约" : rule ? "待成团" : "待付款",
      mode,
      fulfillment,
      region,
      storeId,
      pricingSnapshot: {
        ...quote,
        product: {
          id: product.id,
          price: product.price,
          weight: product.weight,
        },
        shipping: shipping ? { ...shipping } : null,
        groupRule: rule ? { ...rule } : null,
      },
      consumptionCode: "",
      history: [
        {
          at: cleanDate(),
          text: "根据当前商品、运费、团购规则计算生成合成交易",
        },
      ],
    };
    if (rule) {
      const group = open || {
        id: uid("GB"),
        ruleId: rule.id,
        productId: product.id,
        required: Number(rule.minPeople),
        deadline: rule.date,
        status: "待成团",
        members: [],
      };
      const next = {
        ...group,
        members: [...group.members, { orderId: id, customerId: patientId }],
      };
      if (next.members.length >= next.required) {
        next.status = "已成团";
        row.status = "待付款";
        group.members.forEach((m: Row) => {
          const old = orders.find((o: Row) => o.id === m.orderId);
          if (old)
            persist("shopOrders", {
              ...old,
              status: "待付款",
              groupId: group.id,
            });
        });
      }
      Object.assign(row, { groupId: group.id });
      persist("groupBuyRounds", next);
    }
    persist(mode === "商品预约" ? "commerceReservations" : "shopOrders", row);
    setConfirm(false);
    setNotice(
      `${mode === "商品预约" ? "已保存预约并占用库存" : "已创建本地订单"}，应付 ¥${quote.total.toFixed(2)}。`,
    );
  };
  return (
    <>
      <Metrics
        items={[
          {
            label: "当前可用库存",
            value: available,
            note: "减去有效预订和订单占用",
          },
          { label: "当前商品单价", value: `¥${product.price}` },
          { label: "预计物流费用", value: `¥${quote.shipping.toFixed(2)}` },
          {
            label: "计算后应付",
            value: `¥${quote.total.toFixed(2)}`,
            note: "仅模拟，价格快照随订单保存",
          },
        ]}
      />
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>商品预约与交易计算</h2>
            <p>
              商品、团购、运费、店铺规则均读取实时配置；下单后保存独立价格快照。
            </p>
          </div>
        </div>
        <div className="ops-form-grid">
          <label className="ops-field">
            <span>交易客户</span>
            <select
              aria-label="交易客户"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {state.patients.map((p: Row) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>交易商品</span>
            <select
              aria-label="交易商品"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>交易方式</span>
            <select
              aria-label="交易方式"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {["直接购买", "商品预约", "参与团购"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>购买数量</span>
            <input
              type="number"
              aria-label="购买数量"
              value={quantity}
              min={1}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label className="ops-field">
            <span>履约方式</span>
            <select
              aria-label="履约方式"
              value={fulfillment}
              onChange={(e) => setFulfillment(e.target.value)}
            >
              <option>配送</option>
              <option>到店自取</option>
              <option>数字服务</option>
            </select>
          </label>
          {fulfillment === "配送" ? (
            <>
              <label className="ops-field">
                <span>收货地区（合成）</span>
                <input
                  aria-label="收货地区"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </label>
              <label className="ops-field">
                <span>运费模板</span>
                <select
                  aria-label="交易运费模板"
                  value={shipId}
                  onChange={(e) => setShipId(e.target.value)}
                >
                  {shippingRows
                    .filter((s) => s.status === "已启用")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            <label className="ops-field">
              <span>核销店铺</span>
              <select
                aria-label="核销店铺"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "参与团购" && (
            <label className="ops-field">
              <span>团购规则</span>
              <select
                aria-label="交易团购规则"
                value={ruleId}
                onChange={(e) => setRuleId(e.target.value)}
              >
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.minPeople} 人 · {r.discount} 折
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "商品预约" && (
            <label className="ops-field">
              <span>商品预约日期</span>
              <input
                aria-label="商品预约日期"
                type="date"
                min={today()}
                value={reserveDate}
                onChange={(e) => setReserveDate(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="ops-inline-box" style={{ margin: "0 24px 20px" }}>
          <p>
            商品 ¥{quote.subtotal.toFixed(2)} − 团购优惠 ¥
            {quote.discount.toFixed(2)} + 运费 ¥{quote.shipping.toFixed(2)} =
            应付 ¥{quote.total.toFixed(2)}
          </p>
          <p>
            包裹重量 {quote.weight} kg。
            {rule
              ? `团购需 ${rule.minPeople} 位不同客户在 ${rule.date} 前加入，未成团不可模拟付款。`
              : ""}
          </p>
          {quote.errors.map((e) => (
            <p className="ops-error" key={e}>
              {e}
            </p>
          ))}
        </div>
        <div className="ops-modal-actions">
          <button
            hidden={!uiElementAllowed(state, "commerce.order.create")}
            className="btn btn-primary"
            onClick={() => {
              if (confirm || !uiElementAllowed(state, "commerce.order.create"))
                return;
              confirmationConsumed.current = false;
              setConfirm(true);
            }}
          >
            预览并确认交易
          </button>
        </div>
        {notice && (
          <div className="ops-feedback" role="status">
            {notice}
          </div>
        )}
      </section>
      <section className="panel ops-panel" style={{ marginTop: 22 }}>
        <div className="ops-panel-title">
          <h2>商品预约与订单履约</h2>
        </div>
        {currentReservations.map((r: Row) => (
          <div className="health-attention-row" key={r.id}>
            <div>
              <b>
                {r.name} · {r.quantity} 件
              </b>
              <small>
                预约 {r.reservationDate} · <Tag value={r.status} />
              </small>
            </div>
            {r.status === "已预约" && (
              <div className="ops-action-wrap">
                <button
                  className="btn"
                  onClick={() => {
                    persist("shopOrders", {
                      ...r,
                      id: `ORD-${r.id}`,
                      status: "待付款",
                      sourceReservationId: r.id,
                    });
                    persist("commerceReservations", {
                      ...r,
                      status: "已转订单",
                    });
                    setNotice("预约已转为待付款订单，库存占用不重复。");
                  }}
                >
                  预约转订单
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    persist("commerceReservations", { ...r, status: "已取消" });
                    setNotice("预约已取消，库存占用已释放。");
                  }}
                >
                  取消商品预约
                </button>
              </div>
            )}
          </div>
        ))}
        {currentOrders.map((o: Row) => (
          <div className="health-attention-row" key={o.id}>
            <div>
              <b>
                {o.name} · ¥{o.amount.toFixed(2)} <Tag value={o.status} />
              </b>
              <small>
                {o.id} · {o.fulfillment}
                {o.consumptionCode ? ` · 消费码 ${o.consumptionCode}` : ""}
              </small>
            </div>
            <div className="ops-action-wrap">
              {o.status === "待付款" && (
                <button
                  className="btn"
                  onClick={() => {
                    persist("shopOrders", {
                      ...o,
                      status: o.fulfillment === "配送" ? "待发货" : "待核销",
                      consumptionCode:
                        o.fulfillment === "配送" ? "" : `DEMO-${o.id}`,
                      paidAt: cleanDate(),
                    });
                    setNotice("已记录模拟付款，未发生真实资金流转。");
                  }}
                >
                  模拟付款
                </button>
              )}
              {["待付款", "待成团"].includes(o.status) && (
                <button
                  className="btn"
                  onClick={() => {
                    persist("shopOrders", { ...o, status: "已取消" });
                    const group = rounds.find((g: Row) => g.id === o.groupId);
                    if (group?.status === "待成团")
                      persist("groupBuyRounds", {
                        ...group,
                        members: group.members.filter(
                          (m: Row) => m.orderId !== o.id,
                        ),
                      });
                    setNotice("本地订单已取消，库存占用已释放。");
                  }}
                >
                  取消订单
                </button>
              )}
              {o.status === "待核销" && (
                <>
                  <input
                    aria-label={`订单消费码 ${o.id}`}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="输入完整演示消费码"
                    style={{ width: 180, fontSize: 10 }}
                  />
                  <button
                    className="btn"
                    onClick={() => {
                      if (code !== o.consumptionCode) {
                        setNotice("消费码不匹配，未核销。");
                        return;
                      }
                      persist("shopOrders", {
                        ...o,
                        status: "已签收",
                        redeemedAt: cleanDate(),
                        redeemedBy: "当前管理员",
                      });
                      setNotice("消费码已核销，此订单不能二次核销。");
                      setCode("");
                    }}
                  >
                    确认消费码核销
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="panel ops-panel" style={{ marginTop: 22 }}>
        <div className="ops-panel-title">
          <h2>团购进度</h2>
          <button
            className="btn"
            onClick={() => {
              rounds
                .filter(
                  (g: Row) => g.status === "待成团" && g.deadline < today(),
                )
                .forEach((g: Row) => {
                  persist("groupBuyRounds", { ...g, status: "已过期" });
                  g.members.forEach((m: Row) => {
                    const o = orders.find((o: Row) => o.id === m.orderId);
                    if (o)
                      persist("shopOrders", {
                        ...o,
                        status: "已取消",
                        cancelReason: "团购超时未成团",
                      });
                  });
                });
              setNotice("已核对团购有效期；过期待成团订单取消并释放库存。");
            }}
          >
            检查过期团购
          </button>
        </div>
        {rounds.map((g: Row) => (
          <div className="health-attention-row" key={g.id}>
            <div>
              <b>
                {products.find((p) => p.id === g.productId)?.name} ·{" "}
                {g.members.length}/{g.required} 人
              </b>
              <small>
                {g.id} · 截止 {g.deadline}
              </small>
            </div>
            <Tag value={g.status} />
          </div>
        ))}
      </section>
      {confirm && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="确认本地商品交易"
          >
            <div className="ops-modal-head">
              <h2>确认本地交易</h2>
              <button
                className="btn"
                onClick={() => {
                  confirmationConsumed.current = true;
                  setConfirm(false);
                }}
              >
                返回修改
              </button>
            </div>
            <div className="health-task-detail">
              <p>
                {state.patients.find((p: Row) => p.id === patientId)?.name} ·{" "}
                {product.name} × {quantity}
              </p>
              <p>
                {mode} / {fulfillment} / 应付 ¥{quote.total.toFixed(2)}
              </p>
              <p>将保存当前规则快照；不发起付款、真实物流或外部沟通。</p>
            </div>
            <div className="ops-modal-actions">
              <button className="btn btn-primary" onClick={submit}>
                确认创建本地交易
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
const configurableMenus = [
  ["/dashboard", "运营概览"],
  ["/appointments", "预约登记"],
  ["/queue", "智能导检"],
  ["/exam", "分检工作站"],
  ["/review", "总检审核"],
  ["/reports", "报告中心"],
  ["/health", "健康管理"],
  ["/enterprise", "企业健康"],
  ["/services", "医生与服务"],
  ["/commerce", "健康商城"],
  ["/content", "内容消息"],
  ["/finance", "财务结算"],
  ["/analytics", "工作量统计"],
  ["/support", "客户服务"],
  ["/quality", "质控追踪"],
  ["/settings", "系统配置"],
  ["/controls", "通知与专项质控"],
  ["/coverage", "需求覆盖"],
];
function StaffPolicyWorkspace() {
  const { state, act } = useDemo() as any;
  const staff = useCollection(domainSpec("staff", settingsSpecs)).rows,
    roles = useCollection(domainSpec("roles", settingsSpecs)).rows;
  const [staffId, setStaffId] = useState("U-1001");
  const [action, setAction] = useState("审核报告");
  const [examType, setExamType] = useState("个检");
  const [discount, setDiscount] = useState(1);
  const [notice, setNotice] = useState("");
  const [patientId, setPatientId] = useState(state.patients[0]?.id);
  const [reason, setReason] = useState("");
  const [end, setEnd] = useState("");
  const [start, setStart] = useState(today());
  const person = staff.find((s) => s.id === staffId) || staff[0];
  const role =
    roles.find((r) => r.id === person?.roleId || r.name === person?.role) ||
    roles[0];
  const entries = state.records.bookingBlacklist || [];
  const permissions = role?.permissions || [];
  const blocked =
    person?.status !== "已通过"
      ? "人员资质未通过"
      : !permissions.includes(action)
        ? "当前角色没有此操作权限"
        : !(role.examTypes || ["个检", "团检"]).includes(examType)
          ? "角色无此体检类型权限"
          : Number(discount) < Number(role.minDiscount ?? 0.8)
            ? "折扣低于该角色允许下限"
            : "";
  const saveRole = (patch: Row) =>
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "roles", record: { ...role, ...patch } },
    });
  return (
    <>
      <section className="panel ops-panel" style={{ marginBottom: 22 }}>
        <div className="ops-panel-title">
          <div>
            <h2>医生角色分配与权限验证</h2>
            <p>角色直接约束下方操作模拟器。服务端鉴权仍需真实系统实现。</p>
          </div>
        </div>
        <div className="ops-form-grid">
          <label className="ops-field">
            <span>医护账号</span>
            <select
              aria-label="配置医护账号"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.status}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>绑定业务角色</span>
            <select
              aria-label="绑定业务角色"
              value={role?.id || ""}
              onChange={(e) => {
                const r = roles.find((r) => r.id === e.target.value);
                if (!r) return;
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "staff",
                    record: { ...person, roleId: r.id, role: r.name },
                  },
                });
                setNotice(`${person.name} 已分配角色 ${r.name}`);
              }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>角色折扣下限（0–1）</span>
            <input
              aria-label="角色折扣下限"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={role?.minDiscount ?? 0.8}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 0 && value <= 1) saveRole({ minDiscount: value });
              }}
            />
          </label>
          <label className="ops-field">
            <span>客户数据范围</span>
            <select
              aria-label="角色客户数据范围"
              value={role?.scope || "本人客户"}
              onChange={(e) => saveRole({ scope: e.target.value })}
            >
              {["本人客户", "所在科室", "所在机构", "演示全局"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="ops-span2">
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
                    checked={permissions.includes(p)}
                    onChange={(e) =>
                      saveRole({
                        permissions: e.target.checked
                          ? [...permissions, p]
                          : permissions.filter((v: string) => v !== p),
                      })
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <div className="ops-action-wrap" style={{ marginTop: 16 }}>
              {["个检", "团检", "职业体检"].map((t) => (
                <label key={t} style={{ fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={(role?.examTypes || ["个检", "团检"]).includes(t)}
                    onChange={(e) =>
                      saveRole({
                        examTypes: e.target.checked
                          ? [...(role?.examTypes || ["个检", "团检"]), t]
                          : (role?.examTypes || ["个检", "团检"]).filter(
                              (v: string) => v !== t,
                            ),
                      })
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          <h3 style={{ fontSize: 13 }}>当前角色可见菜单</h3>
          <div className="ops-permissions">
            {configurableMenus.map(([path, label]) => (
              <label key={path}>
                <input
                  type="checkbox"
                  checked={(
                    role?.menuPaths || configurableMenus.map(([p]) => p)
                  ).includes(path)}
                  onChange={(e) => {
                    const paths =
                      role?.menuPaths || configurableMenus.map(([p]) => p);
                    saveRole({
                      menuPaths: e.target.checked
                        ? [...paths, path]
                        : paths.filter((p: string) => p !== path),
                    });
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <h3 style={{ fontSize: 13, marginTop: 22 }}>
            明确客户与院区可见范围
          </h3>
          <p style={{ fontSize: 11, color: "#809681" }}>
            客户不勾选表示全体；具体客户列表优先于描述性
            scope，不自动推断“本人客户”。
          </p>
          <div className="ops-permissions">
            {state.patients.map((p: Row) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={(role?.allowedPatientIds || []).includes(p.id)}
                  onChange={(e) =>
                    saveRole({
                      allowedPatientIds: e.target.checked
                        ? [...(role?.allowedPatientIds || []), p.id]
                        : (role?.allowedPatientIds || []).filter(
                            (id: string) => id !== p.id,
                          ),
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <label className="ops-field" style={{ marginTop: 18 }}>
            <span>限定可见院区</span>
            <select
              aria-label="角色限定院区"
              value={role?.allowedCampus || ""}
              onChange={(e) => saveRole({ allowedCampus: e.target.value })}
            >
              <option value="">全部院区</option>
              <option>中心院区</option>
              <option>东院区</option>
            </select>
          </label>
          <div className="ops-action-wrap" style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                const paths =
                  role?.menuPaths || configurableMenus.map(([p]) => p);
                if (!paths.length) {
                  setNotice("请至少选择一个可见菜单，再激活角色。");
                  return;
                }
                saveRole({
                  menuPaths: paths,
                  allowedPatientIds: role.allowedPatientIds || [],
                  allowedCampus: role.allowedCampus || "",
                  examTypes: role.examTypes || ["个检", "团检"],
                });
                act({
                  type: "UPDATE_CONFIG",
                  payload: {
                    customRoleId: role.id,
                    discountMin: Number(role.minDiscount ?? 0.8),
                  },
                });
                setNotice(
                  `已激活自定义角色 ${role.name}；退出入口始终保留在顶栏。`,
                );
              }}
            >
              激活此自定义角色
            </button>
            <button
              className="btn"
              onClick={() => {
                act({
                  type: "UPDATE_CONFIG",
                  payload: { customRoleId: "", discountMin: 0.8 },
                });
                setNotice("已退出自定义角色限制。");
              }}
            >
              退出自定义角色
            </button>
          </div>
        </div>
        <div className="ops-inline-box" style={{ margin: "0 24px 22px" }}>
          <h3>配置生效验证</h3>
          <div className="ops-inline-controls" style={{ flexWrap: "wrap" }}>
            <select
              aria-label="模拟权限操作"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {["查看客户", "录入结果", "审核报告", "财务查询", "系统配置"].map(
                (a) => (
                  <option key={a}>{a}</option>
                ),
              )}
            </select>
            <select
              aria-label="模拟体检类型"
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
            >
              {["个检", "团检", "职业体检"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              aria-label="模拟请求折扣"
              type="number"
              step={0.05}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
            <button
              className="btn"
              onClick={() => {
                if (blocked) {
                  setNotice(`已拦截：${blocked}`);
                  return;
                }
                act({
                  type: "ADD_AUDIT",
                  payload: {
                    message: `角色权限模拟通过：${person.name} / ${role.name} / ${action} / ${examType} / 折扣${discount}`,
                  },
                });
                setNotice(`允许模拟执行：${action}；数据范围 ${role.scope}。`);
              }}
            >
              按配置校验并模拟执行
            </button>
          </div>
          <p>
            {blocked
              ? `当前阻断：${blocked}`
              : `当前允许，人员 ${person?.name}，角色 ${role?.name}`}
          </p>
        </div>
      </section>
      <section className="panel ops-panel" style={{ marginBottom: 22 }}>
        <div className="ops-panel-title">
          <div>
            <h2>客户预约黑名单</h2>
            <p>
              与患者小程序、自助机共用
              bookingBlacklist；有期限的记录只在有效期内生效。
            </p>
          </div>
        </div>
        <div className="ops-form-grid">
          <label className="ops-field">
            <span>限制客户</span>
            <select
              aria-label="黑名单客户"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              {state.patients.map((p: Row) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>限制原因 *</span>
            <input
              aria-label="黑名单原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="ops-field">
            <span>开始日期</span>
            <input
              type="date"
              aria-label="黑名单开始日期"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="ops-field">
            <span>结束日期（可空）</span>
            <input
              type="date"
              aria-label="黑名单结束日期"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <div className="ops-modal-actions">
          <button
            className="btn"
            onClick={() => {
              if (!reason.trim() || !start || (end && end < start)) {
                setNotice("请填写原因及有效日期范围。");
                return;
              }
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "bookingBlacklist",
                  record: {
                    id: `BL-${patientId}`,
                    patientId,
                    status: "已启用",
                    reason: reason.trim(),
                    startDate: start,
                    endDate: end,
                    createdBy: "当前管理员",
                    updatedAt: cleanDate(),
                  },
                },
              });
              setNotice("客户预约限制已保存，患者端将读取同一记录。");
              setReason("");
            }}
          >
            保存客户限制
          </button>
        </div>
        {entries.map((r: Row) => (
          <div className="health-attention-row" key={r.id}>
            <div>
              <b>
                {state.patients.find((p: Row) => p.id === r.patientId)?.name ||
                  r.patientId}{" "}
                · <Tag value={r.status} />
              </b>
              <small>
                {r.reason} · {r.startDate || "立即"} 至 {r.endDate || "不限期"}
              </small>
            </div>
            <button
              className="btn"
              disabled={r.status === "已解除"}
              onClick={() => {
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "bookingBlacklist",
                    record: { ...r, status: "已解除", resolvedAt: cleanDate() },
                  },
                });
                setNotice("客户限制已解除，保留原始原因与解除时间。");
              }}
            >
              解除客户限制
            </button>
          </div>
        ))}
      </section>
      {notice && (
        <div className="ops-feedback" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
function OrderSettlement() {
  const { state, act } = useDemo() as any;
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [notice, setNotice] = useState("");
  const orders = (state.records.shopOrders || []).filter((o: Row) =>
    String(o.date || "").startsWith(period),
  );
  const services = (state.records.serviceOrders || []).filter((o: Row) =>
    String(o.date || "").startsWith(period),
  );
  const paid = orders.filter((o: Row) =>
    ["待发货", "已发货", "待核销", "已签收", "退款申请", "已退款"].includes(
      o.status,
    ),
  );
  const refunds = orders.filter((o: Row) => o.status === "已退款");
  const gross = paid.reduce(
      (n: number, o: Row) => n + Number(o.amount || 0),
      0,
    ),
    refund = refunds.reduce(
      (n: number, o: Row) => n + Number(o.amount || 0),
      0,
    );
  const due = orders
    .filter((o: Row) => o.status === "待付款")
    .reduce((n: number, o: Row) => n + Number(o.amount || 0), 0);
  return (
    <section className="panel ops-panel" style={{ marginBottom: 22 }}>
      <div className="ops-panel-title">
        <div>
          <h2>订单来源结算核对</h2>
          <p>
            按月份汇总实际本地订单，退款冲减已收金额；生成不可随规则修改的账单快照。
          </p>
        </div>
        <input
          type="month"
          aria-label="结算月份"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
      </div>
      <Metrics
        items={[
          { label: "商城已收（模拟）", value: `¥${gross.toFixed(2)}` },
          { label: "退款冲减", value: `¥${refund.toFixed(2)}` },
          { label: "商城净额", value: `¥${(gross - refund).toFixed(2)}` },
          { label: "待付款订单", value: `¥${due.toFixed(2)}` },
        ]}
      />
      <div className="ops-modal-actions">
        <button
          className="btn"
          onClick={() =>
            downloadCsv("订单结算明细", orders, [
              f("id", "订单编号"),
              f("customer", "客户"),
              f("date", "日期"),
              f("amount", "金额"),
              f("status", "状态"),
            ])
          }
        >
          导出来源明细
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "settlements",
                record: {
                  id: `SETTLE-${period}`,
                  name: `${period} 月商城订单结算`,
                  category: "商城",
                  amount: gross - refund,
                  gross,
                  refund,
                  unpaid: due,
                  orderIds: orders.map((o: Row) => o.id),
                  sourceSnapshot: JSON.parse(JSON.stringify(orders)),
                  serviceCompletedAmount: services
                    .filter((s: Row) => s.status === "已完成")
                    .reduce(
                      (n: number, s: Row) => n + Number(s.amount || 0),
                      0,
                    ),
                  date: today(),
                  owner: "当前管理员",
                  description: `来源 ${orders.length} 笔商城订单；已收 ${gross}，退款 ${refund}，净额 ${gross - refund}`,
                  status: "待核对",
                },
              },
            });
            setNotice("已从订单生成本月结算快照，可在下方查看并核对。");
          }}
        >
          生成本月结算账单
        </button>
      </div>
      {notice && (
        <div className="ops-feedback" role="status">
          {notice}
        </div>
      )}
    </section>
  );
}

commerceSpecs.push({
  key: "commerceSimulator",
  label: "交易与预约模拟",
  description: "规则驱动交易",
  fields: [],
  seeds: [],
});
const shipment = domainSpec("shipping", commerceSpecs);
shipment.fields.splice(
  4,
  0,
  f("firstWeight", "首重 / kg", "number"),
  f("additionalWeight", "续重单位 / kg", "number"),
  f("additionalFee", "续重费用 / 元", "number"),
);
shipment.seeds.forEach((s, i) =>
  Object.assign(s, {
    region: i ? "全国" : "青岛市",
    firstWeight: 1,
    additionalWeight: 1,
    additionalFee: 3,
    baseFee: i ? 12 : 8,
    freeAbove: 99,
  }),
);
const groupRules = domainSpec("groupBuy", commerceSpecs);
groupRules.seeds.forEach((r, i) =>
  Object.assign(r, {
    product: i ? "全部商品" : "轻量运动水杯",
    minPeople: 2,
    discount: 9,
    date: "2027-12-31",
  }),
);
const productRules = domainSpec("products", commerceSpecs);
productRules.fields.splice(4, 0, f("weight", "单件重量 / kg", "number"));
productRules.seeds.forEach((p) =>
  Object.assign(p, {
    weight: p.category === "健康课程" ? 0 : 0.5,
    attributes: { color: "默认色", size: "标准规格" },
    skuVariants: [],
  }),
);
const roleDefs = domainSpec("roles", settingsSpecs);
roleDefs.seeds.forEach((r) =>
  Object.assign(r, {
    minDiscount: r.name === "机构管理员" ? 0.5 : 0.8,
    examTypes: ["个检", "团检"],
    permissions:
      r.name === "主检医生"
        ? ["查看客户", "录入结果", "审核报告"]
        : r.name === "机构管理员"
          ? [
              "查看客户",
              "维护档案",
              "维护预约",
              "录入结果",
              "审核报告",
              "订单处理",
              "财务查询",
              "系统配置",
              "导出数据",
            ]
          : r.name === "健康管理师"
            ? ["查看客户", "维护档案"]
            : ["查看客户", "订单处理"],
  }),
);
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
    title: "医生与服务",
    en: "MEDICAL SERVICES & CONSULTATION",
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
const completionTabs: Record<string, [string, string][]> = {
  services: [
    ["crmProgress", "客户订单进度"],
    ["serviceBatch", "服务批量维护"],
    ["accountsFinance", "服务财务与余额"],
    ["teamRelations", "我的团队关系"],
  ],
  commerce: [
    ["exchanges", "换货库存处理"],
    ["attributes", "商品属性选项"],
    ["accountsFinance", "商城财务与余额"],
  ],
  content: [["sentMessages", "已发短信邮件"]],
  support: [
    ["orderDisputes", "订单关联介入"],
    ["patientMessages", "检前检中留言"],
  ],
  settings: [
    ["organizationScope", "机构人员归属"],
    ["dictionaryCategories", "字典分类管理"],
    ["deviceInventory", "设备库存台账"],
    ["actualUiResources", "实际页面权限"],
    ["patientBookingSettings", "患者预约规则"],
  ],
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
            className={tab === s.key ? "active" : ""}
            onClick={() => {
              setTab(s.key);
              setShowAudit(false);
            }}
          >
            {s.label}
            {s.key === "tickets" && <span>2</span>}
          </button>
        ))}
        {(completionTabs[route] || []).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key);
              setShowAudit(false);
            }}
          >
            {label}
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
      {!showAudit && tab === "crmProgress" ? (
        <CrmProgress />
      ) : !showAudit && tab === "serviceBatch" ? (
        <ServiceBatch />
      ) : !showAudit && tab === "accountsFinance" ? (
        <AccountsFinance />
      ) : !showAudit && tab === "teamRelations" ? (
        <DoctorTeamRelations />
      ) : !showAudit && tab === "exchanges" ? (
        <ExchangeWorkbench />
      ) : !showAudit && tab === "attributes" ? (
        <ProductAttributes />
      ) : !showAudit && tab === "sentMessages" ? (
        <LocalMessages sentOnly />
      ) : !showAudit && tab === "orderDisputes" ? (
        <OrderDisputes />
      ) : !showAudit && tab === "organizationScope" ? (
        <OrganizationWorkspace />
      ) : !showAudit && tab === "dictionaryCategories" ? (
        <DictionaryCategories />
      ) : !showAudit && tab === "deviceInventory" ? (
        <DeviceInventory />
      ) : !showAudit && tab === "actualUiResources" ? (
        <UiResourceSettings />
      ) : !showAudit && tab === "patientBookingSettings" ? (
        <PatientBookingSettings />
      ) : !showAudit && tab === "patientMessages" ? (
        <MessageWorkbench />
      ) : showAudit ? (
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
      ) : spec.key === "community" ? (
        <LoyaltyCenter />
      ) : spec.key === "commerceSimulator" ? (
        <CommerceSimulator />
      ) : (
        <>
          {spec.key.startsWith("crm") && <CrmSummary />}
          {["staff", "roles"].includes(spec.key) && <StaffPolicyWorkspace />}
          {spec.key === "settlements" && <OrderSettlement />}
          <RecordWorkspace key={spec.key} spec={spec} />
        </>
      )}
    </div>
  );
}
