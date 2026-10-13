import { getBookingAvailability } from "../bookingRules";
import { AnalyticsHub } from "./AnalyticsHub";
import {
  resolveGroupImportRow,
  validateCampusItems,
  validateGroupOrderBooking,
  type ImportIdentityMode,
} from "../groupImportRules";
import { ReportOperations } from "./ReviewTools";
import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useDemo, today } from "../store";
import { Banner, downloadCsv, Metrics, Tag } from "./Operations";
import type { Row } from "./Operations";
import "./operations.css";
const fmt = (n: number) => String(n).padStart(2, "0");
export const auditKind = (entry: Row): string => {
  const action = String(entry.action || "").toUpperCase(),
    message = String(entry.message || "");
  if (
    action === "CREATE_APPOINTMENT" ||
    /创建预约|新建订单|创建体检订单/.test(message)
  )
    return "开单";
  if (action === "SAVE_RESULTS" || /完成分检|保存分检结果/.test(message))
    return "分检录入";
  if (
    action === "REVIEW" ||
    /初审通过|主检通过|总检通过|报告审核/.test(message)
  )
    return "审核";
  if (action === "PRINT" || /打印并装订报告|报告打印/.test(message))
    return "打印";
  if (
    action === "HANDLE_ALERT" ||
    /异常处置|处置异常|重大异常处理|预警处置/.test(message) ||
    (/alert/i.test(
      `${typeof entry.entity === "object" ? JSON.stringify(entry.entity) : entry.entity || ""} ${message}`,
    ) &&
      entry.after?.status === "已处理" &&
      entry.before?.status !== "已处理")
  )
    return "异常处置";
  if (action === "PAYMENT" || /模拟收款/.test(message)) return "收款";
  return "其他操作";
};
const kinds = [
  "开单",
  "分检录入",
  "审核",
  "打印",
  "异常处置",
  "收款",
  "其他操作",
];
export function Analytics() {
  return <AnalyticsHub audit={<AuditAnalytics />} />;
}
function AuditAnalytics() {
  const { state } = useDemo() as any;
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today());
  const [actor, setActor] = useState("所有操作人");
  const [kind, setKind] = useState("全部类型");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const actors = [
    ...new Set<string>(
      state.audit.map((a: Row) => String(a.actor || a.user || "未记录")),
    ),
  ];
  const records = useMemo(
    () =>
      state.audit
        .map((a: Row) => ({
          ...a,
          kind: auditKind(a),
          operator: String(a.actor || a.user || "未记录"),
          day: String(a.time || a.at || a.date || "").slice(0, 10),
        }))
        .filter(
          (a: Row) =>
            a.day >= from &&
            a.day <= to &&
            (actor === "所有操作人" || a.operator === actor) &&
            (kind === "全部类型" || a.kind === kind) &&
            (!query ||
              `${a.message}${a.entity || ""}${a.action || ""}`.includes(query)),
        ),
    [state.audit, from, to, actor, kind, query],
  );
  const grouped = Object.values(
    records.reduce((groups: Record<string, Row>, a: Row) => {
      if (!groups[a.operator])
        groups[a.operator] = {
          name: a.operator,
          total: 0,
          ...Object.fromEntries(kinds.map((k) => [k, 0])),
        };
      groups[a.operator].total++;
      groups[a.operator][a.kind]++;
      return groups;
    }, {}),
  ) as Row[];
  const days = Object.entries(
    records.reduce((counts: Record<string, number>, a: Row) => {
      counts[a.day] = (counts[a.day] || 0) + 1;
      return counts;
    }, {}),
  ).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...days.map(([, n]) => Number(n)));
  const exportRows = () =>
    downloadCsv(
      "工作量审计明细",
      records.map((r: Row) => ({
        ...r,
        before: JSON.stringify(r.before ?? null),
        after: JSON.stringify(r.after ?? null),
      })),
      [
        { key: "time", label: "操作时间" },
        { key: "operator", label: "操作人" },
        { key: "kind", label: "业务类型" },
        { key: "entity", label: "业务对象" },
        { key: "message", label: "操作说明" },
        { key: "before", label: "变更前" },
        { key: "after", label: "变更后" },
      ],
    );
  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">AUDIT-BASED WORKLOAD ANALYTICS</span>
          <h1>
            工作量统计
            <span className="ops-title-dot" />
          </h1>
          <p>来自真实演示操作日志，按操作人、日期与业务类型汇总。</p>
        </div>
        <div className="ops-heading-icon">
          <BarChart3 size={27} />
        </div>
      </div>
      <Banner>
        统计当前浏览器保留的操作事件，不补造历史数据。一次点击成功产生一次事件；工作量不等于唯一客户数。旧版日志按文字归类。
      </Banner>
      <div className="ops-analytics-filters">
        <label>
          起始日期
          <input
            aria-label="工作量起始日期"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          截止日期
          <input
            aria-label="工作量截止日期"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          操作人
          <select
            aria-label="工作量操作人"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            <option>所有操作人</option>
            {actors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          业务类型
          <select
            aria-label="工作量业务类型"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option>全部类型</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={exportRows}>
          <ArrowDownToLine size={15} />
          导出操作明细
        </button>
      </div>
      {from > to && (
        <p className="ops-error">起始日期不能晚于截止日期，请调整筛选区间。</p>
      )}
      <Metrics
        items={[
          {
            label: "筛选操作事件",
            value: records.length,
            note: `${from} 至 ${to}`,
          },
          {
            label: "开单工作量",
            value: records.filter((r: Row) => r.kind === "开单").length,
          },
          {
            label: "审核 / 打印",
            value: `${records.filter((r: Row) => r.kind === "审核").length} / ${records.filter((r: Row) => r.kind === "打印").length}`,
          },
          {
            label: "异常处置工作量",
            value: records.filter((r: Row) => r.kind === "异常处置").length,
          },
        ]}
      />
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>每日工作量</h2>
            <p>只展示所选时间内有记录的日期</p>
          </div>
          <BarChart3 size={22} />
        </div>
        <div className="ops-audit-bars">
          {days.map(([day, count]) => (
            <div key={day}>
              <span>{day}</span>
              <div>
                <i style={{ width: `${(Number(count) / max) * 100}%` }} />
              </div>
              <b>{String(count)} 次</b>
            </div>
          ))}
          {!days.length && (
            <div className="ops-empty">
              <BarChart3 size={30} />
              <h3>当前筛选没有操作事件</h3>
              <p>完成开单、审核等业务操作后，可在此查看统计。</p>
            </div>
          )}
        </div>
      </section>
      <section className="panel ops-panel ops-analytics-table">
        <div className="ops-panel-title">
          <div>
            <h2>人员工作量明细</h2>
            <p>仅按日志操作人聚合，不据此推定真实绩效。</p>
          </div>
          <button
            className="btn"
            onClick={() =>
              downloadCsv("人员工作量汇总", grouped, [
                { key: "name", label: "操作人" },
                ...kinds.map((k) => ({ key: k, label: k })),
                { key: "total", label: "合计" },
              ])
            }
          >
            导出人员汇总
          </button>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="人员工作量">
            <thead>
              <tr>
                <th>操作人</th>
                {kinds.map((k) => (
                  <th key={k}>{k}</th>
                ))}
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={g.name}>
                  <td>
                    <b>{g.name}</b>
                  </td>
                  {kinds.map((k) => (
                    <td key={k}>{g[k]}</td>
                  ))}
                  <td>
                    <b>{g.total}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel ops-panel ops-analytics-table">
        <div className="ops-panel-title">
          <div>
            <h2>操作事件追溯</h2>
            <p>点击详情查看业务对象以及变更前后快照</p>
          </div>
          <label className="ops-search">
            <Search size={15} />
            <input
              aria-label="搜索工作量事件"
              placeholder="搜索操作说明或业务对象"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="操作事件">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>操作人</th>
                <th>类型</th>
                <th>操作说明</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: Row, i: number) => (
                <tr key={r.id || i}>
                  <td>
                    {String(r.time || r.day)
                      .replace("T", " ")
                      .slice(0, 19)}
                  </td>
                  <td>{r.operator}</td>
                  <td>
                    <Tag value={r.kind} />
                  </td>
                  <td>{r.message}</td>
                  <td>
                    <button
                      className="ops-text-btn"
                      onClick={() => setDetail(r)}
                    >
                      查看变更
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detail && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-label="审计事件详情"
            aria-modal="true"
          >
            <div className="ops-modal-head">
              <div>
                <h2>审计事件详情</h2>
                <p>
                  {detail.operator} · {detail.time}
                </p>
              </div>
              <button className="btn" onClick={() => setDetail(null)}>
                关闭
              </button>
            </div>
            <div className="health-task-detail">
              <p>{detail.message}</p>
              <p>
                业务对象：
                {typeof detail.entity === "object"
                  ? JSON.stringify(detail.entity)
                  : detail.entity || "旧版日志未记录"}
              </p>
              <p>操作代码：{detail.action || "旧版日志未记录"}</p>
              <h3>变更前</h3>
              <pre className="ops-audit-json">
                {JSON.stringify(detail.before ?? "未记录", null, 2)}
              </pre>
              <h3>变更后</h3>
              <pre className="ops-audit-json">
                {JSON.stringify(detail.after ?? "未记录", null, 2)}
              </pre>
            </div>
          </section>
        </div>
      )}
      <details>
        <summary>解读、标本与指引单回收工作量</summary>
        <ReportOperations statisticsOnly />
      </details>
    </div>
  );
}

type CsvRecord = { cells: string[]; line: number };
export function parseCsvText(text: string): {
  rows: CsvRecord[];
  error?: string;
} {
  const rows: CsvRecord[] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    line = 1,
    start = 1;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
      } else if (cell === "") {
        quoted = true;
      } else
        return {
          rows: [],
          error: `第 ${line} 行包含非法引号，请使用标准 CSV 双引号转义。`,
        };
    } else if (c === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      cells.push(cell);
      if (cells.some((v) => v.trim())) rows.push({ cells, line: start });
      cells = [];
      cell = "";
      line++;
      start = line;
    } else {
      cell += c;
      if (c === "\n") line++;
    }
  }
  if (quoted) return { rows: [], error: `第 ${start} 行存在未闭合引号。` };
  cells.push(cell);
  if (cells.some((v) => v.trim())) rows.push({ cells, line: start });
  return { rows };
}
const importColumns = [
  "姓名",
  "证件标识",
  "套餐",
  "分组",
  "日期",
  "时段",
  "院区",
];
export type ValidatedImport = {
  line: number;
  name: string;
  identity: string;
  packageName: string;
  group: string;
  date: string;
  time: string;
  campus: string;
  patientId?: string;
  packageId?: string;
  amount?: number;
  key?: string;
  errors: string[];
  [key: string]: any;
};
export function validateGroupCsv(
  text: string,
  state: Row,
  options: {
    identityMode?: ImportIdentityMode;
    company?: string;
    groupOrderId?: string;
  } = {},
): { rows: ValidatedImport[]; error?: string } {
  const parsed = parseCsvText(text);
  if (parsed.error) return { rows: [], error: parsed.error };
  if (parsed.rows.length < 2)
    return { rows: [], error: "请提供 CSV 表头以及至少一行合成客户数据。" };
  const header = parsed.rows[0].cells.map((s) => s.trim());
  const missing = importColumns.filter((c) => !header.includes(c));
  if (missing.length)
    return { rows: [], error: `缺少列：${missing.join("、")}` };
  if (new Set(header).size !== header.length)
    return { rows: [], error: "存在重复列名，请使用标准模板。" };
  const seen = new Set<string>();
  const groupNames = new Set([
    ...state.patients.map((p: Row) => p.company),
    ...(state.records.healthGroups || []).flatMap((g: Row) => [g.name, g.id]),
    ...(state.records.companyUnits || []).flatMap((g: Row) => [g.name, g.id]),
  ]);
  const rows: ValidatedImport[] = parsed.rows.slice(1).map((raw) => {
    const values = Object.fromEntries(
      header.map((h, i) => [h, (raw.cells[i] || "").trim()]),
    );
    const row: ValidatedImport = {
      line: raw.line,
      name: values["姓名"],
      identity: values["证件标识"],
      packageName: values["套餐"],
      group: values["分组"],
      date: values["日期"],
      time: values["时段"].replace("-", "–"),
      campus: values["院区"],
      errors: [],
    };
    if (raw.cells.length !== header.length) row.errors.push("列数与表头不一致");
    if ((options.identityMode || "demo") === "demo") {
      if (!/^DEMO-[A-Za-z0-9_-]+$/.test(row.identity))
        row.errors.push("证件标识必须使用 DEMO-患者编号，禁止真实证件号");
      if (
        !state.patients.some(
          (p: Row) =>
            `DEMO-${p.id}` === row.identity || p.certificate === row.identity,
        )
      )
        row.errors.push("证件标识未匹配现有演示客户");
    }
    const resolved = resolveGroupImportRow(state as any, row, options);
    const structuralErrors = [...row.errors];
    Object.assign(row, resolved);
    row.errors = [...structuralErrors, ...resolved.errors];
    const patient =
      resolved.newPatient ||
      state.patients.find((p: Row) => p.id === resolved.patientId);
    const pack = state.packages.find((p: Row) => p.id === resolved.packageId);
    if (!pack) row.errors.push("套餐编号或名称不存在");
    if (pack) {
      row.amount = pack.price;
      row.packageName = pack.name;
      if (
        patient &&
        ((pack.sex && pack.sex !== "不限" && pack.sex !== patient.sex) ||
          (pack.minAge && patient.age < pack.minAge) ||
          (pack.maxAge && patient.age > pack.maxAge))
      )
        row.errors.push("套餐不适用于该客户的性别或年龄");
      row.errors.push(
        ...validateCampusItems(state as any, pack.items, row.campus),
      );
    }
    if (
      row.group &&
      !groupNames.has(row.group) &&
      !(state.records.groupPersonnelGroups || []).some(
        (g: Row) => g.id === row.group || g.name === row.group,
      )
    )
      row.errors.push("分组不存在，请使用现有工作单位或健康分组");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      Number.isNaN(Date.parse(row.date)) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date
    )
      row.errors.push("日期格式或值错误，应为 YYYY-MM-DD");
    else {
      if (row.date < today()) row.errors.push("预约日期不能早于今天");
      if (
        state.config.weekendAllowed === false &&
        [0, 6].includes(new Date(`${row.date}T12:00:00`).getDay())
      )
        row.errors.push("当前配置禁止周末预约");
    }
    const match = row.time.match(/^(\d{2}):(\d{2})–(\d{2}):(\d{2})$/);
    if (
      !match ||
      Number(match[1]) > 23 ||
      Number(match[3]) > 23 ||
      Number(match[2]) > 59 ||
      Number(match[4]) > 59 ||
      Number(match[1]) * 60 + Number(match[2]) >=
        Number(match[3]) * 60 + Number(match[4])
    )
      row.errors.push("时段格式或顺序错误，例如 08:00–08:30");
    if (!["中心院区", "东院区"].includes(row.campus))
      row.errors.push("院区不存在");
    row.key = `${row.patientId}|${row.date}|${row.campus}`;
    if (patient) {
      if (seen.has(row.key))
        row.errors.push("同一文件中存在该客户同日同院区重复预约");
      seen.add(row.key);
      if (
        state.appointments.some(
          (a: Row) =>
            a.patientId === row.patientId &&
            a.date === row.date &&
            a.campus === row.campus &&
            a.status !== "cancelled",
        )
      )
        row.errors.push("该客户在此日期和院区已有有效预约");
    }
    return row;
  });
  const counts: Record<string, number> = {};
  rows
    .filter((r) => !r.errors.length)
    .forEach((r) => (counts[r.date] = (counts[r.date] || 0) + 1));
  for (const row of rows) {
    const cap = Number(state.config.dailyCapacity);
    if (
      Number.isFinite(cap) &&
      cap >= 0 &&
      state.appointments.filter(
        (a: Row) => a.date === row.date && a.status !== "cancelled",
      ).length +
        (counts[row.date] || 0) >
        cap
    )
      row.errors.push("批量提交将超过该日预约容量");
  }
  const simulated = {
    ...state,
    patients: [...state.patients],
    appointments: [...state.appointments],
  };
  for (const row of rows) {
    if (row.errors.length) continue;
    if (row.newPatient) simulated.patients.push(row.newPatient);
    const pack = state.packages.find((p: Row) => p.id === row.packageId);
    if (row.groupOrderId)
      row.errors.push(
        ...validateGroupOrderBooking(simulated as any, row.groupOrderId, {
          patientId: row.patientId!,
          date: row.date,
          time: row.time,
          packageIds: [row.packageId!],
          items: pack?.items,
        }),
      );
    else {
      const available = getBookingAvailability(
        simulated as any,
        row.date,
        undefined,
        {
          patientId: row.patientId,
          company: row.company,
          kind: "group",
          time: row.time,
          checkQuestionnaire: false,
          packageIds: [row.packageId!],
          items: pack?.items,
        },
      );
      if (!available.allowed) row.errors.push(available.error);
    }
    if (!row.errors.length)
      simulated.appointments.push({
        ...row,
        id: "IMPORT-PREVIEW-" + row.line,
        items: pack?.items || [],
        status: "booked",
      });
  }
  return { rows };
}
function futureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${fmt(d.getMonth() + 1)}-${fmt(d.getDate())}`;
}
export function GroupImport({
  onClose,
  onComplete,
}: {
  onClose?: () => void;
  onComplete?: (count: number) => void;
}) {
  const { state, act } = useDemo() as any;
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof validateGroupCsv
  > | null>(null);
  const [identityMode, setIdentityMode] = useState<ImportIdentityMode>("demo");
  const [groupOrderId, setGroupOrderId] = useState("");
  const importOptions = {
    identityMode,
    groupOrderId,
    company: (state.records.groupOrders || []).find(
      (g: Row) => g.id === groupOrderId,
    )?.company,
  };
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const submitted = useRef(false);
  const update = (s: string) => {
    setText(s);
    setPreview(null);
    setConfirmed(false);
    setDone(false);
    setMessage("");
    submitted.current = false;
  };
  const errors = preview?.rows.filter((r) => r.errors.length) || [];
  const valid = preview?.rows.filter((r) => !r.errors.length) || [];
  const example = () => {
    const p = state.patients[0],
      pack = state.packages[0];
    return (
      importColumns.join(",") +
      `\n${p.name},DEMO-${p.id},${pack.id},${p.company},${futureDate()},08:00–08:30,中心院区`
    );
  };
  const submit = () => {
    if (submitted.current || !confirmed || !preview || done) return;
    const checked = validateGroupCsv(text, state, importOptions);
    setPreview(checked);
    if (checked.error || checked.rows.some((r) => r.errors.length)) {
      setMessage("提交前复核未通过，未创建任何预约。");
      return;
    }
    submitted.current = true;
    for (const row of checked.rows) {
      if (row.newPatient)
        act({ type: "UPSERT_PATIENT", payload: row.newPatient });
      act({
        type: "CREATE_APPOINTMENT",
        payload: {
          patientId: row.patientId,
          packageId: row.packageId,
          date: row.date,
          time: row.time,
          campus: row.campus,
          amount: row.amount,
          group: row.group,
          identity: row.identity,
          source: "团检 CSV 导入",
          importKey: row.key,
          groupOrderId: row.groupOrderId,
          groupPersonnelId: row.groupPersonnelId,
        },
      });
    }
    act({
      type: "ADD_AUDIT",
      payload: {
        message: `团检 CSV 导入完成：${checked.rows.length} 条预约；已校验演示证件、套餐、分组与重复记录。`,
      },
    });
    setDone(true);
    setMessage(
      `已创建 ${checked.rows.length} 条团检预约，名单已写入共享预约工作台。`,
    );
    onComplete?.(checked.rows.length);
  };
  return (
    <div className="ops-page ops-group-import">
      <Banner>
        仅限合成客户。普通模式使用DEMO标识；合成身份证使用虚构地区999999；特殊团检允许免证件建档。禁止录入真实证件。
      </Banner>
      <div className="form-grid">
        <label>
          合成身份校验模式
          <select
            value={identityMode}
            onChange={(e) => {
              setIdentityMode(e.target.value as ImportIdentityMode);
              setPreview(null);
              setConfirmed(false);
            }}
          >
            <option value="demo">普通DEMO标识</option>
            <option value="synthetic-id">合成身份证结构校验</option>
            <option value="special-empty">特殊团检免证件</option>
          </select>
        </label>
        <label>
          导入单位订单
          <select
            value={groupOrderId}
            onChange={(e) => {
              setGroupOrderId(e.target.value);
              setPreview(null);
              setConfirmed(false);
            }}
          >
            <option value="">按名单自动匹配</option>
            {(state.records.groupOrders || []).map((g: Row) => (
              <option key={g.id} value={g.id}>
                {g.company} · {g.name || g.title || "单位订单"} · {g.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ops-import-steps">
        <span className="active">1 填写 / 选择 CSV</span>
        <i />
        <span className={preview ? "active" : ""}>2 校验与预览</span>
        <i />
        <span className={done ? "active" : ""}>3 确认创建预约</span>
      </div>
      <div className="ops-import-toolbar">
        <button className="btn" onClick={() => update(example())}>
          <FileText size={15} />
          填入合成示例
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadCsv(
              "团检名单导入模板",
              [],
              importColumns.map((c) => ({ key: c, label: c })),
            )
          }
        >
          <ArrowDownToLine size={15} />
          下载空白模板
        </button>
        <label className="btn">
          <Upload size={15} />
          读取 CSV 文件
          <input
            aria-label="读取团检 CSV 文件"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!/\.csv$/i.test(file.name) || file.size > 1024 * 1024) {
                setMessage("请选择 1 MB 以内的 CSV 文件。");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => update(String(reader.result || ""));
              reader.onerror = () => setMessage("CSV 文件读取失败，请重试。");
              reader.readAsText(file, "utf-8");
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <label className="ops-field">
        <span>团检 CSV 内容</span>
        <textarea
          aria-label="团检 CSV 内容"
          rows={7}
          value={text}
          onChange={(e) => update(e.target.value)}
          placeholder={importColumns.join(",")}
        />
      </label>
      <p className="ops-import-help">
        套餐可填编号或完整名称；分组可填现有单位 /
        分组。相同客户同日同院区不得重复预约；取消的旧预约除外。
      </p>
      <button
        className="btn btn-primary"
        onClick={() => {
          setPreview(validateGroupCsv(text, state, importOptions));
          setConfirmed(false);
          setMessage("");
        }}
        disabled={!text.trim() || done}
      >
        <ShieldCheck size={15} />
        校验名单
      </button>
      {preview && (
        <section className="ops-import-preview">
          <div className="ops-panel-title">
            <div>
              <h2>校验结果</h2>
              <p>
                共 {preview.rows.length} 行 · 通过 {valid.length} 行 · 错误{" "}
                {errors.length} 行
              </p>
            </div>
            {errors.length > 0 && (
              <button
                className="btn"
                onClick={() =>
                  downloadCsv(
                    "团检导入错误清单",
                    errors.map((r) => ({
                      line: r.line,
                      name: r.name,
                      identity: r.identity,
                      error: r.errors.join("；"),
                    })),
                    [
                      { key: "line", label: "CSV 行号" },
                      { key: "name", label: "姓名" },
                      { key: "identity", label: "演示证件标识" },
                      { key: "error", label: "错误原因" },
                    ],
                  )
                }
              >
                下载错误行
              </button>
            )}
          </div>
          {preview.error && (
            <p className="ops-error" role="alert">
              {preview.error}
            </p>
          )}
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="团检导入预览">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>姓名 / 证件标识</th>
                  <th>套餐 / 分组</th>
                  <th>预约日期 / 时段</th>
                  <th>校验结果</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.line}</td>
                    <td>
                      <b>{r.name || "缺失姓名"}</b>
                      <small className="ops-block">{r.identity}</small>
                    </td>
                    <td>
                      {r.packageName}
                      <small className="ops-block">{r.group}</small>
                    </td>
                    <td>
                      {r.date}
                      <small className="ops-block">
                        {r.time} · {r.campus}
                      </small>
                    </td>
                    <td>
                      {r.errors.length ? (
                        <ul className="ops-import-errors">
                          {r.errors.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      ) : (
                        <Tag value={done ? "已创建" : "校验通过"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!preview.error && !errors.length && valid.length > 0 && !done && (
            <label className="ops-import-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已确认上述 {valid.length}{" "}
              条合成名单、套餐金额与排期，创建团检预约。
            </label>
          )}
        </section>
      )}
      {message && (
        <div className="ops-feedback" role="status">
          {message}
        </div>
      )}
      <div className="ops-modal-actions">
        {onClose && (
          <button className="btn" onClick={onClose}>
            {done ? "完成" : "取消"}
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={
            !confirmed ||
            done ||
            !!preview?.error ||
            !!errors.length ||
            !valid.length
          }
          onClick={submit}
        >
          <CheckCircle2 size={16} />
          {done ? "已完成导入" : `确认创建 ${valid.length || 0} 条预约`}
        </button>
      </div>
    </div>
  );
}
