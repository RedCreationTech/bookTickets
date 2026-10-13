import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDemo, today, exportCsv, download } from "../store";
import type { Action, Appointment, DemoState } from "../model";
import { Badge, Empty, Modal } from "../ui";
import { analyzeDemoResults } from "../rules";

/** All values and workflow scores here are synthetic; no clinical decision service is called. */
export const REVIEW_ORDER_TYPES = [
  "普通",
  "团检",
  "入职",
  "公务员",
  "职业病",
  "VIP",
] as const;
export const REVIEW_DOCTORS = ["周医生", "余医生", "陈医生（演示）"];
export const SPECIMEN_TYPES = [
  "静脉血",
  "尿液",
  "粪便",
  "妇科标本",
  "病理组织",
  "其他合成标本",
];
const SPECIAL_TYPES = ["入职", "公务员", "职业病"];
const SETTINGS_ID = "REVIEW-SETTINGS";
const DAY = 86400000;
const weightLabels = {
  age: "年龄",
  items: "项目数量",
  abnormal: "异常数量",
  major: "重大阳性",
  customer: "客户类型",
};
export type ReviewWeights = Record<keyof typeof weightLabels, number>;
export interface ReviewSettings {
  weights: ReviewWeights;
  deadlines: Record<string, number>;
}
export interface ReviewSchedule {
  id: string;
  doctor: string;
  date: string;
  stage: string;
  capacity: number;
  status: string;
}
type SavedRow = Record<string, any>;
const defaults: ReviewWeights = {
  age: 20,
  items: 20,
  abnormal: 20,
  major: 20,
  customer: 20,
};
const rows = (state: DemoState, key: string): SavedRow[] =>
  state.records[key] || [];
const save = (
  act: (action: Action) => void,
  collection: string,
  record: SavedRow,
) => act({ type: "UPSERT_RECORD", payload: { collection, record } });
const update = (act: (action: Action) => void, id: string, patch: SavedRow) =>
  act({ type: "UPDATE_APPOINTMENT", payload: { id, ...patch } });
const nameFor = (state: DemoState, id: string) =>
  state.patients.find(
    (p) => p.id === state.appointments.find((a) => a.id === id)?.patientId,
  )?.name || id;
const currentStamp = () => new Date().toISOString().slice(0, 16);
const dateValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z"));
const timeValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + ":00Z"));
const active = (record: SavedRow) => record.status !== "cancelled";

export function getReviewOrderType(a: Appointment): string {
  return (
    a.orderType ||
    (a.packageId === "PK04"
      ? "入职"
      : /团检/.test(a.source || "")
        ? "团检"
        : "普通")
  );
}
export function getReviewSettings(state: DemoState): ReviewSettings {
  const record = rows(state, "reviewSettings").find(
    (r) => r.id === SETTINGS_ID,
  );
  return {
    weights: { ...defaults, ...record?.weights },
    deadlines: Object.fromEntries(
      REVIEW_ORDER_TYPES.map((type) => [
        type,
        record?.deadlines?.[type] ?? state.config.reportDeadline ?? 7,
      ]),
    ),
  };
}
export function reportDeadlineDays(state: DemoState, a: Appointment): number {
  return (
    getReviewSettings(state).deadlines[getReviewOrderType(a)] ??
    Number(state.config.reportDeadline || 7)
  );
}
export function reportAgeDays(
  a: Appointment,
  now: number | Date = Date.now(),
): number {
  const time = new Date(now).toISOString().slice(0, 10);
  const start = String(a.checkedAt || a.date).slice(0, 10);
  if (!dateValue(start)) return 0;
  return Math.max(
    0,
    Math.floor(
      (Date.parse(time + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
        DAY,
    ),
  );
}
export function isReportOverdue(
  state: DemoState,
  a: Appointment,
  now: number | Date = Date.now(),
): boolean {
  return (
    !["approved", "printed", "cancelled"].includes(a.status) &&
    reportAgeDays(a, now) > reportDeadlineDays(state, a)
  );
}
export function isCriticalReviewAppointment(
  state: DemoState,
  a: Appointment,
): boolean {
  return Boolean(
    a.manualMajorPositive ||
    a.criticalFlag ||
    rows(state, "alerts").some(
      (r) =>
        r.appointmentId === a.id &&
        !["已处理", "已撤销", "cancelled"].includes(r.status),
    ) ||
    (a.results["空腹血糖"]?.trim() &&
      Number(a.results["空腹血糖"]) >= Number(state.config.criticalGlucose)),
  );
}
export function sortReviewAppointments(
  state: DemoState,
  appointments: Appointment[],
  now: number | Date = Date.now(),
): Appointment[] {
  return [...appointments].sort(
    (a, b) =>
      Number(isCriticalReviewAppointment(state, b)) -
        Number(isCriticalReviewAppointment(state, a)) ||
      Number(isReportOverdue(state, b, now)) -
        Number(isReportOverdue(state, a, now)) ||
      reportAgeDays(b, now) - reportAgeDays(a, now) ||
      a.id.localeCompare(b.id),
  );
}
export function reviewDifficulty(state: DemoState, a: Appointment): number {
  const patient = state.patients.find((p) => p.id === a.patientId);
  const w = getReviewSettings(state).weights;
  const values: ReviewWeights = {
    age: Math.min(1, Math.max(0, Number(patient?.age || 0)) / 100),
    items: Math.min(1, a.items.length / 20),
    abnormal: Math.min(1, analyzeDemoResults(a.results).alerts.length / 5),
    major: isCriticalReviewAppointment(state, a) ? 1 : 0,
    customer: ["VIP", ...SPECIAL_TYPES].includes(getReviewOrderType(a)) ? 1 : 0,
  };
  return Math.round(
    Object.entries(w).reduce(
      (sum, [key, weight]) => sum + values[key as keyof ReviewWeights] * weight,
      0,
    ),
  );
}
export function reviewWorkload(state: DemoState, schedule: ReviewSchedule) {
  const assigned = state.appointments.filter(
    (a) =>
      a.status === "review" &&
      a.doctor === schedule.doctor &&
      String(a.reviewWorkDate || a.date) === schedule.date &&
      (schedule.stage === "全部环节" ||
        ["初审", "主检", "总检"][a.reviewStage || 0] === schedule.stage),
  );
  const units = assigned.reduce(
    (sum, a) => sum + 1 + reviewDifficulty(state, a) / 100,
    0,
  );
  return {
    count: assigned.length,
    units: Math.round(units * 100) / 100,
    index: Math.round((units / Math.max(1, schedule.capacity)) * 100),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
function DialogActions({
  onClose,
  label,
  disabled = false,
  onSave,
}: {
  onClose: () => void;
  label: string;
  disabled?: boolean;
  onSave: () => void;
}) {
  return (
    <div className="modal-actions">
      <button className="btn" onClick={onClose}>
        取消
      </button>
      <button className="btn btn-primary" disabled={disabled} onClick={onSave}>
        {label}
      </button>
    </div>
  );
}
function ReviewConfiguration({ onClose }: { onClose: () => void }) {
  const { state, act } = useDemo();
  const initial = getReviewSettings(state);
  const [weights, setWeights] = useState(initial.weights);
  const [deadlines, setDeadlines] = useState(initial.deadlines);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  return (
    <Modal title="审核权重与分类时限" onClose={onClose} wide>
      <p>
        五个维度权重总和须为
        100%；指数仅解释本地演示分配，不用于医疗或真实绩效评价。
      </p>
      <div className="form-grid">
        {Object.entries(weightLabels).map(([key, label]) => (
          <Field key={key} label={`${label}权重（%）`}>
            <input
              aria-label={`${label}权重`}
              type="number"
              min="0"
              max="100"
              value={weights[key as keyof ReviewWeights]}
              onChange={(e) =>
                setWeights({ ...weights, [key]: Number(e.target.value) })
              }
            />
          </Field>
        ))}
      </div>
      <p>当前权重合计：{Object.values(weights).reduce((n, v) => n + v, 0)}%</p>
      <h3>按订单类型配置报告时限</h3>
      <p>从到检日开始计算，无到检时间时用预约日；满 N 天后的下一天标为超期。</p>
      <div className="form-grid">
        {REVIEW_ORDER_TYPES.map((type) => (
          <Field key={type} label={`${type}订单时限（天）`}>
            <input
              aria-label={`${type}订单时限`}
              type="number"
              min="1"
              max="365"
              value={deadlines[type]}
              onChange={(e) =>
                setDeadlines({ ...deadlines, [type]: Number(e.target.value) })
              }
            />
          </Field>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DialogActions
        onClose={onClose}
        label="保存审核配置"
        onSave={() => {
          if (submitted.current) return;
          if (
            Object.values(weights).some(
              (v) => !Number.isFinite(v) || v < 0 || v > 100,
            ) ||
            Math.abs(Object.values(weights).reduce((n, v) => n + v, 0) - 100) >
              0.001
          )
            return setError("各维度权重须为 0–100，且合计为 100%。");
          if (
            Object.values(deadlines).some(
              (v) => !Number.isInteger(v) || v < 1 || v > 365,
            )
          )
            return setError("各订单时限须为 1–365 的整数天数。");
          submitted.current = true;
          if (
            JSON.stringify(initial) !==
              JSON.stringify({ weights, deadlines }) ||
            !rows(state, "reviewSettings").length
          )
            save(act, "reviewSettings", {
              id: SETTINGS_ID,
              weights,
              deadlines,
            });
          onClose();
        }}
      />
    </Modal>
  );
}
function ScheduleEditor({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const { state, act } = useDemo();
  const [day, setDay] = useState(date),
    [doctor, setDoctor] = useState(REVIEW_DOCTORS[0]),
    [stage, setStage] = useState("全部环节"),
    [capacity, setCapacity] = useState(10),
    [error, setError] = useState("");
  const submitted = useRef(false);
  return (
    <Modal title="按日期安排审核医生" onClose={onClose}>
      <div className="form-grid">
        <Field label="排班日期">
          <input
            aria-label="排班日期"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <Field label="排班医生">
          <select
            aria-label="排班医生"
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
          >
            {REVIEW_DOCTORS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="审核环节">
          <select
            aria-label="排班审核环节"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {["全部环节", "初审", "主检", "总检"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="日容量（加权工作量）">
          <input
            aria-label="审核日容量"
            type="number"
            min="1"
            max="200"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </Field>
      </div>
      <p>
        同一医生同日一条排班，重新保存将更新该排班。未完成任务仍保留在订单中。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DialogActions
        onClose={onClose}
        label="保存医生排班"
        onSave={() => {
          if (submitted.current) return;
          if (
            !dateValue(day) ||
            !Number.isInteger(capacity) ||
            capacity < 1 ||
            capacity > 200
          )
            return setError("请选择有效日期，日容量须为 1–200 的整数。");
          const id = `SCHEDULE-${day}-${doctor}`,
            record = {
              id,
              date: day,
              doctor,
              stage,
              capacity,
              status: "scheduled",
            };
          const existing = rows(state, "reviewSchedules").find(
            (r) => r.id === id,
          );
          submitted.current = true;
          if (
            !existing ||
            Object.entries(record).some(([k, v]) => existing[k] !== v)
          )
            save(act, "reviewSchedules", record);
          onClose();
        }}
      />
    </Modal>
  );
}
function PositiveEditor({
  appointment,
  onClose,
  removing = false,
}: {
  appointment: Appointment;
  onClose: () => void;
  removing?: boolean;
}) {
  const { state, act } = useDemo();
  const [reason, setReason] = useState(
    removing ? "" : appointment.manualMajorPositiveReason || "",
  );
  const submitted = useRef(false);
  return (
    <Modal
      title={removing ? "撤销人工重大阳性标记" : "人工标记重大阳性"}
      onClose={onClose}
    >
      <p>
        {nameFor(state, appointment.id)} · {appointment.id}
        。仅合成业务演示，不发送外部通知。
      </p>
      <Field label={removing ? "撤销原因（必填）" : "标记原因（必填）"}>
        <textarea
          aria-label="重大阳性原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="仅输入合成说明"
        />
      </Field>
      <DialogActions
        onClose={onClose}
        label={removing ? "确认撤销标记" : "确认重大阳性标记"}
        disabled={!reason.trim()}
        onSave={() => {
          if (
            submitted.current ||
            !reason.trim() ||
            appointment.status === "cancelled"
          )
            return;
          submitted.current = true;
          const id = `MANUAL-POSITIVE-${appointment.id}`,
            time = new Date().toISOString();
          if (
            !removing &&
            appointment.manualMajorPositive &&
            appointment.manualMajorPositiveReason === reason.trim()
          ) {
            onClose();
            return;
          }
          update(act, appointment.id, {
            manualMajorPositive: !removing,
            manualMajorPositiveReason: removing ? "" : reason.trim(),
            manualMajorPositiveAt: time,
          });
          save(act, "reviewPositiveMarks", {
            id,
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            reason: reason.trim(),
            actor: state.config.role,
            at: time,
            status: removing ? "cancelled" : "active",
          });
          const existingAlert = rows(state, "alerts").find((r) => r.id === id);
          save(act, "alerts", {
            ...existingAlert,
            id,
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            title: "人工重大阳性（合成）",
            value: reason.trim(),
            risk: "A类",
            status: removing ? "已撤销" : "待处理",
            source: "总检人工标记",
            markedAt: time,
          });
          onClose();
        }}
      />
    </Modal>
  );
}
function RecheckEditor({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const { act } = useDemo();
  const [type, setType] = useState(getReviewOrderType(appointment));
  const [selected, setSelected] = useState<string[]>(
    appointment.recheckItems || [],
  );
  const [reason, setReason] = useState(appointment.recheckReason || "");
  const submitted = useRef(false);
  return (
    <Modal title="订单类型与特殊复查项目" onClose={onClose}>
      <Field label="体检订单类型">
        <select
          aria-label="体检订单类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setSelected([]);
          }}
        >
          {REVIEW_ORDER_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <p>
        入职、公务员、职业病订单支持人工标记复查项目。取消勾选并保存可撤销复查，原始结果保持可追溯。
      </p>
      {SPECIAL_TYPES.includes(type) && (
        <div className="item-grid">
          {appointment.items.map((item) => (
            <label key={item} className="check-line">
              <input
                type="checkbox"
                checked={selected.includes(item)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...new Set([...selected, item])]
                      : selected.filter((v) => v !== item),
                  )
                }
              />
              复查 {item}
            </label>
          ))}
        </div>
      )}
      <Field label="复查说明">
        <textarea
          aria-label="复查说明"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <DialogActions
        onClose={onClose}
        label="保存订单复查设置"
        disabled={selected.length > 0 && !reason.trim()}
        onSave={() => {
          if (
            submitted.current ||
            appointment.status === "cancelled" ||
            (selected.length > 0 && !reason.trim())
          )
            return;
          submitted.current = true;
          const recheckItems = SPECIAL_TYPES.includes(type) ? selected : [];
          if (
            type !== getReviewOrderType(appointment) ||
            JSON.stringify(recheckItems) !==
              JSON.stringify(appointment.recheckItems || []) ||
            reason.trim() !== (appointment.recheckReason || "")
          ) {
            update(act, appointment.id, {
              orderType: type,
              recheckItems,
              recheckReason: reason.trim(),
            });
            save(act, "reviewRechecks", {
              id: `RECHECK-${appointment.id}`,
              appointmentId: appointment.id,
              orderType: type,
              items: recheckItems,
              reason: reason.trim(),
              status: recheckItems.length ? "active" : "cancelled",
            });
          }
          onClose();
        }}
      />
    </Modal>
  );
}
function SuggestionEditor({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const { act } = useDemo();
  const [suggestions, setSuggestions] = useState<string[]>(
    Array.isArray(appointment.reviewSuggestions)
      ? appointment.reviewSuggestions
      : [],
  );
  const [draft, setDraft] = useState("");
  const submitted = useRef(false);
  const move = (i: number, offset: number) => {
    const copy = [...suggestions];
    [copy[i], copy[i + offset]] = [copy[i + offset], copy[i]];
    setSuggestions(copy);
  };
  return (
    <Modal title="人工编排报告建议" onClose={onClose} wide>
      <p>
        输入合成建议，再通过上移、下移排列。保存后写入当前报告结论；取消不会改变报告。
      </p>
      <Field label="新增合成建议">
        <input
          aria-label="新增合成建议"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </Field>
      <button
        className="btn"
        disabled={!draft.trim() || suggestions.includes(draft.trim())}
        onClick={() => {
          setSuggestions([...suggestions, draft.trim()]);
          setDraft("");
        }}
      >
        加入建议列表
      </button>
      <ol>
        {suggestions.map((item, i) => (
          <li key={item} style={{ margin: "12px 0" }}>
            <span>{item}</span>{" "}
            <button
              className="text-btn"
              aria-label={`上移建议${i + 1}`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              上移
            </button>
            <button
              className="text-btn"
              aria-label={`下移建议${i + 1}`}
              disabled={i === suggestions.length - 1}
              onClick={() => move(i, 1)}
            >
              下移
            </button>
            <button
              className="text-btn danger"
              aria-label={`移除建议${i + 1}`}
              onClick={() =>
                setSuggestions(suggestions.filter((_, n) => n !== i))
              }
            >
              移除
            </button>
          </li>
        ))}
      </ol>
      <DialogActions
        onClose={onClose}
        label="保存建议顺序与结论"
        disabled={!suggestions.length}
        onSave={() => {
          if (submitted.current || !suggestions.length) return;
          submitted.current = true;
          const conclusion = `【合成建议，非诊疗依据】\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
          if (
            JSON.stringify(appointment.reviewSuggestions || []) !==
              JSON.stringify(suggestions) ||
            appointment.conclusion !== conclusion
          )
            update(act, appointment.id, {
              reviewSuggestions: suggestions,
              conclusion,
            });
          onClose();
        }}
      />
    </Modal>
  );
}

export function ReviewTools({ appointmentId }: { appointmentId?: string }) {
  const { state, act } = useDemo();
  const [selected, setSelected] = useState(appointmentId || "");
  const [date, setDate] = useState(today());
  const [doctorQuery, setDoctorQuery] = useState("");
  const [mode, setMode] = useState("");
  const [message, setMessage] = useState("");
  const list = sortReviewAppointments(
    state,
    state.appointments.filter((a) => a.status === "review"),
  );
  const appointment =
    state.appointments.find((a) => a.id === (appointmentId || selected)) ||
    (!appointmentId ? list[0] : undefined);
  const schedules = rows(state, "reviewSchedules").filter(
    (s) => s.date === date && s.doctor.includes(doctorQuery),
  );
  const canEdit = appointment?.status === "review";
  return (
    <section
      className="panel"
      style={{ marginTop: 20, padding: 20 }}
      aria-label="审核排班与专用操作"
    >
      <div className="panel-heading">
        <h2>审核排班与质控操作</h2>
        <button className="btn" onClick={() => setMode("config")}>
          配置权重与分类时限
        </button>
      </div>
      <p>
        按日期排班、实时繁忙指数及人工标记共用本浏览器订单。工作量 = Σ（1 +
        合成难度 / 100），繁忙指数 = 工作量 / 日容量；不代表临床能力。
      </p>
      <div className="toolbar">
        <Field label="查看排班日期">
          <input
            aria-label="查看排班日期"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setMessage("");
            }}
          />
        </Field>
        <Field label="查询排班医生">
          <input
            aria-label="查询排班医生"
            value={doctorQuery}
            onChange={(e) => setDoctorQuery(e.target.value)}
          />
        </Field>
        <button className="btn" onClick={() => setMode("schedule")}>
          安排医生排班
        </button>
      </div>
      {!appointmentId && (
        <Field label="审核操作订单">
          <select
            aria-label="审核操作订单"
            value={appointment?.id || ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setMode("");
              setMessage("");
            }}
          >
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {isCriticalReviewAppointment(state, a) ? "危急置顶 · " : ""}
                {nameFor(state, a.id)} · {a.id}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>医生 / 环节</th>
              <th>日期 / 状态</th>
              <th>日容量</th>
              <th>待审订单</th>
              <th>加权工作量 / 繁忙指数</th>
              <th>当前订单分配</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((row) => {
              const s = row as ReviewSchedule,
                workload = reviewWorkload(state, s);
              const already =
                appointment?.doctor === s.doctor &&
                appointment.reviewWorkDate === s.date;
              const stageMatches =
                s.stage === "全部环节" ||
                s.stage ===
                  ["初审", "主检", "总检"][appointment?.reviewStage || 0];
              return (
                <tr key={s.id}>
                  <td>
                    {s.doctor}
                    <small>{s.stage}</small>
                  </td>
                  <td>
                    {s.date}
                    <Badge tone={s.status === "scheduled" ? "green" : "gray"}>
                      {s.status === "scheduled" ? "已排班" : "已撤班"}
                    </Badge>
                  </td>
                  <td>{s.capacity}</td>
                  <td>{workload.count}</td>
                  <td>
                    {workload.units} / <strong>{workload.index}%</strong>
                    {workload.index >= 100 && <Badge tone="red">超负荷</Badge>}
                  </td>
                  <td>
                    <button
                      className="text-btn"
                      aria-label={`分配给${s.doctor}`}
                      disabled={
                        !canEdit ||
                        s.status !== "scheduled" ||
                        !stageMatches ||
                        already
                      }
                      onClick={() => {
                        if (
                          !appointment ||
                          already ||
                          s.status !== "scheduled" ||
                          !stageMatches
                        )
                          return;
                        update(act, appointment.id, {
                          doctor: s.doctor,
                          reviewWorkDate: s.date,
                          reviewAssignedAt: new Date().toISOString(),
                        });
                        save(act, "reviewAssignments", {
                          id: `ASSIGN-${appointment.id}`,
                          appointmentId: appointment.id,
                          doctor: s.doctor,
                          date: s.date,
                          stage: s.stage,
                          difficulty: reviewDifficulty(state, appointment),
                          status: "assigned",
                        });
                        setMessage(
                          `已将 ${appointment.id} 分配给 ${s.doctor}，排班日期 ${s.date}。`,
                        );
                      }}
                    >
                      {already ? "已分配" : "分配当前订单"}
                    </button>
                    <button
                      className="text-btn danger"
                      disabled={s.status !== "scheduled" || workload.count > 0}
                      onClick={() => {
                        if (s.status === "scheduled" && workload.count === 0)
                          save(act, "reviewSchedules", {
                            ...s,
                            status: "cancelled",
                          });
                      }}
                    >
                      撤销空闲排班
                    </button>
                    {workload.count > 0 && (
                      <small>先转派待审订单后可撤班</small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!schedules.length && <Empty text="此日期暂无匹配排班，请先安排医生" />}
      </div>
      {message && <p role="status">{message}</p>}
      {appointment && (
        <div className="callout" style={{ display: "block" }}>
          <h3>
            {nameFor(state, appointment.id)} · {getReviewOrderType(appointment)}
            订单
          </h3>
          <p>
            {appointment.id} · 当前责任医生：{appointment.doctor || "未分配"} ·
            合成难度 {reviewDifficulty(state, appointment)} / 100 · 时限{" "}
            {reportDeadlineDays(state, appointment)} 天 · 已过{" "}
            {reportAgeDays(appointment)} 天
          </p>
          {isCriticalReviewAppointment(state, appointment) && (
            <Badge tone="red">危急客户 · 优先置顶</Badge>
          )}{" "}
          {isReportOverdue(state, appointment) && (
            <Badge tone="red">报告已超期</Badge>
          )}{" "}
          {appointment.manualMajorPositive && (
            <p>人工重大阳性：{appointment.manualMajorPositiveReason}</p>
          )}
          {!!appointment.recheckItems?.length && (
            <p>
              待复查项目：{appointment.recheckItems.join("、")} ·{" "}
              {appointment.recheckReason}
            </p>
          )}
          {!!appointment.reviewSuggestions?.length && (
            <ol aria-label="已保存报告建议">
              {appointment.reviewSuggestions.map((s: string, i: number) => (
                <li key={`${s}-${i}`}>{s}</li>
              ))}
            </ol>
          )}
          <div className="actions">
            <button
              className="btn"
              disabled={!canEdit}
              onClick={() => setMode("positive")}
            >
              {appointment.manualMajorPositive
                ? "编辑重大阳性标记"
                : "人工标记重大阳性"}
            </button>
            {appointment.manualMajorPositive && (
              <button
                className="btn danger"
                disabled={!canEdit}
                onClick={() => setMode("removePositive")}
              >
                撤销重大阳性标记
              </button>
            )}
            <button
              className="btn"
              disabled={!canEdit}
              onClick={() => setMode("suggestions")}
            >
              编排报告建议
            </button>
            <button
              className="btn"
              disabled={!canEdit}
              onClick={() => setMode("recheck")}
            >
              订单类型与复查项目
            </button>
          </div>
        </div>
      )}
      {appointment && (
        <ReviewTextTools
          key={"review-control-1-" + appointment.id}
          appointment={appointment}
        />
      )}
      <p className="notice">
        仅合成数据与本地持久化。排班不接人事系统；人工重大阳性只生成本地待办，不发送短信或临床告警；复查不创建真实医嘱。
      </p>
      {mode === "config" && <ReviewConfiguration onClose={() => setMode("")} />}
      {mode === "schedule" && (
        <ScheduleEditor date={date} onClose={() => setMode("")} />
      )}
      {canEdit && appointment && mode === "positive" && (
        <PositiveEditor
          key={"review-control-2-" + appointment.id}
          appointment={appointment}
          onClose={() => setMode("")}
        />
      )}
      {canEdit && appointment && mode === "removePositive" && (
        <PositiveEditor
          key={"review-control-3-" + appointment.id}
          appointment={appointment}
          removing
          onClose={() => setMode("")}
        />
      )}
      {canEdit && appointment && mode === "recheck" && (
        <RecheckEditor
          key={"review-control-4-" + appointment.id}
          appointment={appointment}
          onClose={() => setMode("")}
        />
      )}
      {canEdit && appointment && mode === "suggestions" && (
        <SuggestionEditor
          key={"review-control-5-" + appointment.id}
          appointment={appointment}
          onClose={() => setMode("")}
        />
      )}
    </section>
  );
}

export type ReportOperationKind = "interpretation" | "guide" | "specimen";
const operationCollections: Record<ReportOperationKind, string> = {
  interpretation: "reportInterpretations",
  guide: "guideRecoveries",
  specimen: "reportSpecimens",
};
const operationLabels: Record<ReportOperationKind, string> = {
  interpretation: "报告解读",
  guide: "导检单回收",
  specimen: "标本采集",
};
export interface ReportOperationRow extends SavedRow {
  kind: ReportOperationKind;
  collection: string;
  label: string;
}
export function reportOperationRows(state: DemoState): ReportOperationRow[] {
  return (
    Object.entries(operationCollections) as [ReportOperationKind, string][]
  ).flatMap(([kind, collection]) =>
    rows(state, collection).map((r) => ({
      ...r,
      performedAt:
        (kind === "specimen" ? r.at || r.performedAt : r.performedAt || r.at) ||
        "",
      specimenType: r.specimenType || r.type || "",
      kind,
      collection,
      label: operationLabels[kind],
    })),
  );
}
export function queryReportOperations(
  state: DemoState,
  filters: {
    from?: string;
    to?: string;
    operator?: string;
    specimenType?: string;
    query?: string;
    includeCancelled?: boolean;
  } = {},
) {
  return reportOperationRows(state)
    .filter((r) => {
      const day = String(r.performedAt || "").slice(0, 10);
      return (
        (filters.includeCancelled || active(r)) &&
        (!filters.from || day >= filters.from) &&
        (!filters.to || day <= filters.to) &&
        (!filters.operator || r.operator === filters.operator) &&
        (!filters.specimenType ||
          r.kind !== "specimen" ||
          r.specimenType === filters.specimenType) &&
        (!filters.query ||
          `${r.appointmentId} ${nameFor(state, r.appointmentId)} ${r.operator} ${r.note || ""}`.includes(
            filters.query,
          ))
      );
    })
    .sort(
      (a, b) =>
        String(b.performedAt).localeCompare(String(a.performedAt)) ||
        String(a.id).localeCompare(String(b.id)),
    );
}
/** A receipt does not imply that examination items have been completed. */
export function unfinishedGuideItems(appointment: Appointment): string[] {
  const waived = Array.isArray(appointment.waived) ? appointment.waived : [];
  return [...new Set(appointment.items)].filter(
    (item) =>
      !waived.includes(item) && !String(appointment.results[item] ?? "").trim(),
  );
}
const guideEligible = (appointment: Appointment) =>
  ["checked", "in_exam", "review", "approved", "printed"].includes(
    appointment.status,
  );
export function resolveGuideRecoveryCode(
  state: DemoState,
  input: string,
): { appointment?: Appointment; error?: string } {
  const code = input.trim();
  if (!code) return { error: "请输入合成预约 ID 或体检号。" };
  const matches = state.appointments.filter((appointment) => {
    const identifiers = [
      appointment.id,
      appointment.examNo,
      appointment.examNumber,
    ].filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    );
    return identifiers.some((id) => code === id || code === `GUIDE-${id}`);
  });
  if (!matches.length)
    return { error: "未找到此导检单条码，请核对合成预约 ID 或体检号。" };
  if (matches.length > 1)
    return { error: "此体检号匹配多个订单，请使用唯一预约 ID 或手动选择。" };
  const appointment = matches[0];
  if (!guideEligible(appointment))
    return {
      error:
        appointment.status === "cancelled"
          ? "此订单已取消，不能回收导检单。"
          : "此订单尚未到检，请先完成到检登记。",
    };
  if (
    appointment.guideRecovered ||
    rows(state, "guideRecoveries").some(
      (record) => record.appointmentId === appointment.id && active(record),
    )
  )
    return {
      error: "此订单的导检单已回收，不能重复回收；如需更正，请使用登记明细。",
    };
  return { appointment };
}
function GuidePendingNotice({
  appointment,
  label = "未完成检查项目提示",
}: {
  appointment: Appointment;
  label?: string;
}) {
  const pending = unfinishedGuideItems(appointment);
  return (
    <div
      className={`callout${pending.length ? " alert" : ""}`}
      aria-label={label}
      style={{ display: "block" }}
    >
      <strong>
        {pending.length
          ? `尚有 ${pending.length} 个未完成检查项目`
          : "当前订单无未完成检查项目"}
      </strong>
      {!!pending.length && (
        <ul>
          {pending.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <p>
        导检单回收仅登记纸单流转，不会自动完成检查或更改检查结果；已弃检项目不计入待检查清单。
      </p>
    </div>
  );
}
function ReportOperationEditor({
  appointment,
  kind,
  record,
  cancelling,
  recoveryMode,
  recoveryCode,
  onClose,
}: {
  appointment: Appointment;
  kind: ReportOperationKind;
  record?: SavedRow;
  cancelling?: boolean;
  recoveryMode?: "manual" | "barcode";
  recoveryCode?: string;
  onClose: () => void;
}) {
  const { state, act } = useDemo();
  const [operator, setOperator] = useState(
    record?.operator ||
      (kind === "interpretation" ? REVIEW_DOCTORS[0] : "演示操作员"),
  );
  const [time, setTime] = useState(
    (record?.performedAt || record?.at)?.slice(0, 16) || currentStamp(),
  );
  const [specimenType, setSpecimenType] = useState(
    record?.specimenType || record?.type || SPECIMEN_TYPES[0],
  );
  const [note, setNote] = useState(cancelling ? "" : record?.note || "");
  const [recoveryAction, setRecoveryAction] = useState<
    "receive_only" | "receive_and_confirm"
  >(
    record?.recoveryAction === "receive_and_confirm"
      ? "receive_and_confirm"
      : "receive_only",
  );
  const [itemConfirmations, setItemConfirmations] = useState<
    Record<string, string>
  >(() =>
    record && active(record)
      ? Object.fromEntries(
          (record.itemConfirmations || []).map((entry: SavedRow) => [
            entry.item,
            entry.disposition,
          ]),
        )
      : {},
  );
  const guideItems = [...new Set(appointment.items)];
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const label = operationLabels[kind];
  return (
    <Modal
      title={`${cancelling ? "撤销" : record && active(record) ? "更正" : "登记"}${label}`}
      onClose={onClose}
    >
      <p>
        {nameFor(state, appointment.id)} · {appointment.id} · 合成记录
      </p>
      {kind === "guide" && !cancelling && (
        <>
          <p>
            回收方式：
            {(recoveryMode || record?.recoveryMode) === "barcode"
              ? "模拟条码输入"
              : "手动选择订单"}
          </p>
          <GuidePendingNotice
            appointment={appointment}
            label="回收确认未完成项目"
          />
          <Field label="导检单回收业务动作">
            <select
              aria-label="导检单回收业务动作"
              value={recoveryAction}
              onChange={(event) => {
                setRecoveryAction(
                  event.target.value as "receive_only" | "receive_and_confirm",
                );
                setError("");
              }}
            >
              <option value="receive_only">仅回收导检单</option>
              <option value="receive_and_confirm">回收导检单并确认项目</option>
            </select>
          </Field>
          {recoveryAction === "receive_and_confirm" && (
            <section aria-label="回收项目人工确认">
              <p>
                请逐项确认已做或未做。无分检结果的项目不能确认已做，应选“未做 /
                待分检”；确认单只留存人工核对快照，不会生成结果、推进检查或解除锁定。
              </p>
              <table>
                <thead>
                  <tr>
                    <th>检查项目</th>
                    <th>现有分检记录</th>
                    <th>逐项人工确认</th>
                  </tr>
                </thead>
                <tbody>
                  {guideItems.map((item) => {
                    const hasResult = Boolean(
                      String(appointment.results[item] ?? "").trim(),
                    );
                    return (
                      <tr key={item}>
                        <td>{item}</td>
                        <td>
                          {hasResult ? "已有分检结果" : "未回传结果"}
                          {appointment.waived?.includes(item)
                            ? " · 已弃检"
                            : ""}
                        </td>
                        <td>
                          <select
                            aria-label={`确认回收项目 ${item}`}
                            value={itemConfirmations[item] || ""}
                            onChange={(event) => {
                              setItemConfirmations({
                                ...itemConfirmations,
                                [item]: event.target.value,
                              });
                              setError("");
                            }}
                          >
                            <option value="">请选择确认情况</option>
                            <option value="done" disabled={!hasResult}>
                              已做（已有分检结果）
                            </option>
                            <option value="not_done">未做 / 待分检</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p>
                已确认{" "}
                {
                  guideItems.filter((item) =>
                    ["done", "not_done"].includes(itemConfirmations[item]),
                  ).length
                }{" "}
                / {guideItems.length}{" "}
                项。未完成检查可明确登记为未做，无需伪造完成状态。
              </p>
            </section>
          )}
        </>
      )}
      {!cancelling && (
        <div className="form-grid">
          <Field label={kind === "interpretation" ? "解读医生" : "登记操作人"}>
            <input
              aria-label="业务登记操作人"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            />
          </Field>
          <Field label="业务发生时间（UTC）">
            <input
              aria-label="业务发生时间"
              type="datetime-local"
              max={currentStamp()}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
          {kind === "specimen" && (
            <Field label="标本类型">
              <select
                aria-label="登记标本类型"
                disabled={Boolean(record)}
                value={specimenType}
                onChange={(e) => setSpecimenType(e.target.value)}
              >
                {SPECIMEN_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}
      <Field label={cancelling ? "撤销原因（必填）" : "登记说明（合成）"}>
        <textarea
          aria-label="业务登记说明"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DialogActions
        onClose={onClose}
        label={cancelling ? "确认撤销业务登记" : "保存业务登记"}
        disabled={cancelling ? !note.trim() : !operator.trim() || !time}
        onSave={() => {
          if (submitted.current) return;
          if (cancelling && (!record || !note.trim())) return;
          if (
            !cancelling &&
            (!operator.trim() ||
              !timeValue(time) ||
              Date.parse(time + ":00Z") > Date.now() ||
              time.slice(0, 10) < appointment.date)
          )
            return setError(
              "请填写操作人和有效时间；时间不能晚于当前时间或早于体检日期。",
            );
          if (
            appointment.status === "cancelled" ||
            (kind === "interpretation" &&
              !["approved", "printed"].includes(appointment.status)) ||
            (kind === "guide" && !cancelling && !guideEligible(appointment))
          )
            return setError("此订单当前状态不允许登记此业务。");
          if (
            kind === "guide" &&
            !cancelling &&
            recoveryAction === "receive_and_confirm"
          ) {
            const pending = guideItems.filter(
              (item) => !["done", "not_done"].includes(itemConfirmations[item]),
            );
            if (pending.length)
              return setError(
                `还有 ${pending.length} 个项目未人工确认，请逐项选择已做或未做：${pending.join("、")}。`,
              );
            const unsupported = guideItems.filter(
              (item) =>
                itemConfirmations[item] === "done" &&
                !String(appointment.results[item] ?? "").trim(),
            );
            if (unsupported.length)
              return setError(
                `以下项目没有分检结果，不能确认已做：${unsupported.join("、")}。请选未做 / 待分检，由分检工作站登记真实完成情况。`,
              );
          }
          const id =
            record?.id ||
            `${kind === "specimen" ? "SPEC" : kind.toUpperCase()}-${appointment.id}${kind === "specimen" ? `-${specimenType}` : ""}`;
          const existing = rows(state, operationCollections[kind]).find(
            (r) =>
              r.id === id ||
              (kind === "guide" && r.appointmentId === appointment.id) ||
              (kind === "specimen" &&
                r.appointmentId === appointment.id &&
                (r.specimenType || r.type) === specimenType),
          );
          if (
            !record &&
            ((existing && active(existing)) ||
              (kind === "guide" && appointment.guideRecovered))
          )
            return setError(
              "该订单的此项业务已登记，请查询后更正，不能重复计数。",
            );
          const next = {
            id: kind === "guide" ? existing?.id || id : id,
            ...(kind === "guide"
              ? {
                  recoveryMode:
                    recoveryMode || record?.recoveryMode || "manual",
                  recoveryCode: recoveryCode ?? record?.recoveryCode ?? "",
                  recoveryAction: cancelling
                    ? record?.recoveryAction || "receive_only"
                    : recoveryAction,
                  itemConfirmations: cancelling
                    ? record?.itemConfirmations || []
                    : recoveryAction === "receive_and_confirm"
                      ? guideItems.map((item) => ({
                          item,
                          disposition: itemConfirmations[item],
                          hasResult: Boolean(
                            String(appointment.results[item] ?? "").trim(),
                          ),
                          result: appointment.results[item] || "",
                          waived: Boolean(appointment.waived?.includes(item)),
                        }))
                      : [],
                  unfinishedItems: cancelling
                    ? record?.unfinishedItems || []
                    : unfinishedGuideItems(appointment),
                }
              : {}),
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            operator: operator.trim(),
            performedAt: time + ":00Z",
            specimenType: kind === "specimen" ? specimenType : "",
            type: kind === "specimen" ? specimenType : "",
            at: time + ":00Z",
            note: cancelling ? record?.note || "" : note.trim(),
            status: cancelling ? "cancelled" : "active",
            cancelledAt: cancelling ? new Date().toISOString() : "",
            cancelReason: cancelling ? note.trim() : "",
          };
          submitted.current = true;
          if (
            !existing ||
            Object.entries(next).some(
              ([k, v]) => JSON.stringify(existing[k]) !== JSON.stringify(v),
            )
          ) {
            save(act, operationCollections[kind], next);
            if (kind === "interpretation")
              update(act, appointment.id, {
                interpretedBy: cancelling ? "" : next.operator,
                interpretedAt: cancelling ? "" : next.performedAt,
                interpretationRecordId: id,
              });
            if (kind === "guide")
              update(act, appointment.id, {
                guideRecovered: !cancelling,
                guideRecoveredBy: cancelling ? "" : next.operator,
                guideRecoveredAt: cancelling ? "" : next.performedAt,
              });
            if (kind === "specimen") {
              const otherActive = rows(state, "reportSpecimens").some(
                (r) =>
                  r.appointmentId === appointment.id &&
                  r.id !== id &&
                  active(r),
              );
              update(act, appointment.id, {
                sampled: !cancelling || otherActive,
              });
            }
          }
          onClose();
        }}
      />
    </Modal>
  );
}

export function ReportOperations({
  appointmentId,
  statisticsOnly = false,
}: {
  appointmentId?: string;
  statisticsOnly?: boolean;
}) {
  const { state } = useDemo();
  const [selected, setSelected] = useState(appointmentId || "");
  const [dialog, setDialog] = useState<{
    kind: ReportOperationKind;
    id: string;
    record?: SavedRow;
    cancelling?: boolean;
    recoveryMode?: "manual" | "barcode";
    recoveryCode?: string;
  } | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<"manual" | "barcode">(
    "manual",
  );
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(today());
  const [operator, setOperator] = useState("");
  const [specimenType, setSpecimenType] = useState("");
  const [query, setQuery] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const eligible = state.appointments.filter((a) =>
    ["checked", "in_exam", "review", "approved", "printed"].includes(a.status),
  );
  const appointment =
    state.appointments.find((a) => a.id === (appointmentId || selected)) ||
    (!appointmentId ? eligible[0] : undefined);
  const allRows = reportOperationRows(state);
  const specimenOptions = [
    ...new Set([
      ...SPECIMEN_TYPES,
      ...allRows
        .filter((r) => r.kind === "specimen")
        .map((r) => String(r.specimenType))
        .filter(Boolean),
    ]),
  ];
  const list = queryReportOperations(state, {
    from,
    to,
    operator,
    specimenType,
    query,
    includeCancelled,
  }).filter((r) => !appointmentId || r.appointmentId === appointmentId);
  const live = list.filter(active);
  const people = [...new Set(allRows.map((r) => String(r.operator)))].sort();
  const groups = [...new Set(live.map((r) => String(r.operator)))].map(
    (person) => ({
      operator: person,
      interpretations: live.filter(
        (r) => r.operator === person && r.kind === "interpretation",
      ).length,
      guides: live.filter((r) => r.operator === person && r.kind === "guide")
        .length,
      specimens: live.filter(
        (r) => r.operator === person && r.kind === "specimen",
      ).length,
    }),
  );
  const editorAppointment = dialog
    ? state.appointments.find((a) => a.id === dialog.id)
    : undefined;
  const openRegister = (kind: ReportOperationKind) => {
    if (!appointment) return;
    const existing =
      kind === "specimen"
        ? undefined
        : rows(state, operationCollections[kind]).find(
            (r) => r.appointmentId === appointment.id,
          );
    setRecoveryError("");
    setDialog({
      kind,
      id: appointment.id,
      record: existing,
      ...(kind === "guide"
        ? {
            recoveryMode:
              existing && active(existing)
                ? existing.recoveryMode || "manual"
                : "manual",
            recoveryCode:
              existing && active(existing) ? existing.recoveryCode || "" : "",
          }
        : {}),
    });
  };
  const scanGuide = () => {
    const result = resolveGuideRecoveryCode(state, recoveryCode);
    if (result.error || !result.appointment) {
      setRecoveryError(result.error || "无法识别此导检单。");
      return;
    }
    if (appointmentId && result.appointment.id !== appointmentId) {
      setRecoveryError("条码对应其他订单，请先切换当前订单后回收。");
      return;
    }
    setRecoveryError("");
    if (!appointmentId) setSelected(result.appointment.id);
    setDialog({
      kind: "guide",
      id: result.appointment.id,
      recoveryMode: "barcode",
      recoveryCode: recoveryCode.trim(),
    });
  };
  return (
    <section
      className="panel"
      style={{ marginTop: 20, padding: 20 }}
      aria-label="报告解读回收及标本工作量"
    >
      <div className="panel-heading">
        <h2>
          {statisticsOnly
            ? "报告解读、回收与标本专项工作量"
            : "报告业务登记与专项统计"}
        </h2>
        <button
          className="btn"
          disabled={!list.length}
          onClick={() =>
            exportCsv(
              "报告业务工作量.csv",
              list.map((r) => ({
                业务: r.label,
                体检号: r.appointmentId,
                姓名: nameFor(state, r.appointmentId),
                操作人: r.operator,
                发生时间UTC: r.performedAt,
                标本类型: r.specimenType || "",
                回收方式:
                  r.kind === "guide"
                    ? r.recoveryMode === "barcode"
                      ? "模拟条码输入"
                      : "手动选择订单"
                    : "",
                回收时未完成项目:
                  r.kind === "guide"
                    ? (r.unfinishedItems || []).join("、")
                    : "",
                回收业务动作:
                  r.kind === "guide"
                    ? r.recoveryAction === "receive_and_confirm"
                      ? "回收导检单并确认项目"
                      : "仅回收导检单"
                    : "",
                项目确认快照:
                  r.kind === "guide"
                    ? JSON.stringify(r.itemConfirmations || [])
                    : "",
                状态: active(r) ? "有效" : "已撤销",
                说明: r.note || "",
                撤销原因: !active(r) ? r.cancelReason || "" : "",
              })),
            )
          }
        >
          导出专项登记明细
        </button>
      </div>
      <p>
        只统计有效登记：每份报告一次解读、每单一次回收、每单每种标本一次采集；更正不增加数量，撤销保留轨迹并从工作量扣除。
      </p>
      {!statisticsOnly && (
        <div className="callout" style={{ display: "block" }}>
          <div className="toolbar">
            {!appointmentId && (
              <Field label="业务登记订单">
                <select
                  aria-label="业务登记订单"
                  value={appointment?.id || ""}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setDialog(null);
                  }}
                >
                  {eligible.map((a) => (
                    <option value={a.id} key={a.id}>
                      {nameFor(state, a.id)} · {a.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <span>
              {appointment
                ? `${nameFor(state, appointment.id)} · ${appointment.id}`
                : "暂无已到检业务订单"}
            </span>
          </div>
          <div className="actions">
            <button
              className="btn"
              disabled={
                !appointment ||
                !["approved", "printed"].includes(appointment.status)
              }
              onClick={() => openRegister("interpretation")}
            >
              登记 / 更正报告解读
            </button>
            {recoveryMode === "manual" && (
              <button
                className="btn"
                disabled={
                  !appointment || !eligible.some((a) => a.id === appointment.id)
                }
                onClick={() => openRegister("guide")}
              >
                登记 / 更正导检单回收
              </button>
            )}
            <button
              className="btn"
              disabled={
                !appointment || !eligible.some((a) => a.id === appointment.id)
              }
              onClick={() => openRegister("specimen")}
            >
              登记合成标本采集
            </button>
          </div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <Field label="导检单回收方式">
              <select
                aria-label="导检单回收方式"
                value={recoveryMode}
                onChange={(event) => {
                  setRecoveryMode(event.target.value as "manual" | "barcode");
                  setRecoveryError("");
                  setRecoveryCode("");
                  setDialog(null);
                }}
              >
                <option value="manual">手动选择订单</option>
                <option value="barcode">模拟条码输入</option>
              </select>
            </Field>
            {recoveryMode === "barcode" && (
              <>
                <Field label="合成导检单条码">
                  <input
                    aria-label="合成导检单条码"
                    value={recoveryCode}
                    onChange={(event) => {
                      setRecoveryCode(event.target.value);
                      setRecoveryError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        scanGuide();
                      }
                    }}
                    placeholder="输入合成预约 ID / 体检号"
                  />
                </Field>
                <button className="btn" onClick={scanGuide}>
                  识别导检单并登记回收
                </button>
              </>
            )}
          </div>
          {recoveryMode === "barcode" && (
            <p>
              红创模拟回收：输入完整预约 ID、已登记体检号或
              GUIDE-体检号。这里只模拟条码文字匹配，未连接扫码枪或回收机。
            </p>
          )}
          {recoveryError && (
            <p className="error" role="alert">
              {recoveryError}
            </p>
          )}
          {recoveryMode === "manual" && appointment && (
            <GuidePendingNotice appointment={appointment} />
          )}
          <small>
            报告解读要求报告已审核；回收和标本登记要求已到检。旧版“已采样”未记载类型，不推定为任何标本。
          </small>
        </div>
      )}
      <div className="form-grid">
        <Field label="专项统计起始日期">
          <input
            aria-label="专项统计起始日期"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="专项统计截止日期">
          <input
            aria-label="专项统计截止日期"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="专项统计操作人">
          <select
            aria-label="专项统计操作人"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          >
            <option value="">全部操作人</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="统计标本类型">
          <select
            aria-label="统计标本类型"
            value={specimenType}
            onChange={(e) => setSpecimenType(e.target.value)}
          >
            <option value="">全部标本类型</option>
            {specimenOptions.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="查询专项登记">
          <input
            aria-label="查询专项登记"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="体检号 / 姓名 / 操作人 / 说明"
          />
        </Field>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={includeCancelled}
          onChange={(e) => setIncludeCancelled(e.target.checked)}
        />
        查询包含已撤销记录
      </label>
      <p>标本类型仅筛选采集统计；日期、操作人和搜索条件同时筛选三类业务。</p>
      {from > to && (
        <p className="error" role="alert">
          起始日期不能晚于截止日期。
        </p>
      )}
      <div className="detail-grid">
        <div>
          有效报告解读
          <strong data-testid="interpretation-count">
            {live.filter((r) => r.kind === "interpretation").length}
          </strong>
        </div>
        <div>
          有效导检单回收
          <strong data-testid="guide-count">
            {live.filter((r) => r.kind === "guide").length}
          </strong>
        </div>
        <div>
          所选标本采集
          <strong data-testid="specimen-count">
            {live.filter((r) => r.kind === "specimen").length}
          </strong>
        </div>
      </div>
      <h3>按操作人汇总</h3>
      <table>
        <thead>
          <tr>
            <th>操作人</th>
            <th>报告解读</th>
            <th>导检单回收</th>
            <th>标本采集</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.operator}>
              <td>{g.operator}</td>
              <td>{g.interpretations}</td>
              <td>{g.guides}</td>
              <td>{g.specimens}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>可追溯业务明细</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>业务 / 标本</th>
              <th>客户 / 体检号</th>
              <th>操作人 / 发生时间 UTC</th>
              <th>状态 / 说明</th>
              {!statisticsOnly && <th>登记管理</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td>
                  {r.label}
                  <small>{r.specimenType}</small>
                </td>
                <td>
                  {nameFor(state, r.appointmentId)}
                  <small>{r.appointmentId}</small>
                </td>
                <td>
                  {r.operator}
                  <small>
                    {String(r.performedAt || "")
                      .replace("T", " ")
                      .replace("Z", "")}
                  </small>
                </td>
                <td>
                  <Badge tone={active(r) ? "green" : "gray"}>
                    {active(r) ? "有效" : "已撤销"}
                  </Badge>
                  <small>
                    {r.note}
                    {r.kind === "guide" && (
                      <span>
                        {" "}
                        · 业务动作：
                        {r.recoveryAction === "receive_and_confirm"
                          ? "回收导检单并确认项目"
                          : "仅回收导检单"}
                        {r.recoveryAction === "receive_and_confirm" &&
                          ` · 项目确认：${(r.itemConfirmations || []).map((entry: SavedRow) => `${entry.item}（${entry.disposition === "done" ? "已做" : "未做 / 待分检"}）`).join("、")}`}
                      </span>
                    )}
                    {r.kind === "guide" && (
                      <span>
                        {" "}
                        ·{" "}
                        {r.recoveryMode === "barcode"
                          ? "模拟条码回收"
                          : "手动回收"}{" "}
                        · 回收时未完成项目：
                        {Array.isArray(r.unfinishedItems)
                          ? r.unfinishedItems.join("、") || "无"
                          : "旧记录未保存"}
                      </span>
                    )}
                    {!active(r) && r.cancelReason
                      ? `；撤销原因：${r.cancelReason}`
                      : ""}
                  </small>
                </td>
                {!statisticsOnly && (
                  <td>
                    <button
                      className="text-btn"
                      aria-label={`更正${r.label}${r.appointmentId}${r.specimenType || ""}`}
                      onClick={() =>
                        setDialog({
                          kind: r.kind,
                          id: r.appointmentId,
                          record: r,
                        })
                      }
                    >
                      {active(r) ? "更正" : "重新登记"}
                    </button>
                    <button
                      className="text-btn danger"
                      aria-label={`撤销${r.label}${r.appointmentId}${r.specimenType || ""}`}
                      disabled={!active(r)}
                      onClick={() =>
                        setDialog({
                          kind: r.kind,
                          id: r.appointmentId,
                          record: r,
                          cancelling: true,
                        })
                      }
                    >
                      撤销登记
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty text="当前条件无业务登记" />}
      </div>
      {!statisticsOnly && (
        <ReportTemplateTools
          key={appointment?.id || "empty"}
          appointment={appointment}
        />
      )}
      <p className="notice">
        时间以 UTC
        保存并查询。全部为本地合成登记，不代表真实报告解读服务、检验采集、扫码或纸张硬件回收；无外部接口连接。
      </p>
      {dialog && editorAppointment && (
        <ReportOperationEditor
          key={`${dialog.kind}-${dialog.id}-${dialog.record?.id || "new"}-${dialog.cancelling}`}
          appointment={editorAppointment}
          kind={dialog.kind}
          record={dialog.record}
          cancelling={dialog.cancelling}
          recoveryMode={dialog.recoveryMode}
          recoveryCode={dialog.recoveryCode}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

export interface ReviewTerm {
  id: string;
  phrase: string;
  code: string;
  grade: string;
  severity: number;
  advice: string;
  status: string;
}
export interface ReviewTextMatch {
  segment: string;
  term: ReviewTerm;
}
export function matchReviewText(
  state: DemoState,
  text: string,
): { matched: ReviewTextMatch[]; unmatched: string[] } {
  const terms = (rows(state, "reviewTerms") as ReviewTerm[])
    .filter((r) => r.status === "active" && r.phrase?.trim())
    .sort(
      (a, b) => b.phrase.length - a.phrase.length || a.id.localeCompare(b.id),
    );
  const segments = [
    ...new Set(
      text
        .split(/[，,。.;；！!？?\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const matched: ReviewTextMatch[] = [],
    unmatched: string[] = [];
  segments.forEach((segment) => {
    const term = terms.find((t) => segment.includes(t.phrase));
    if (term) matched.push({ segment, term });
    else unmatched.push(segment);
  });
  return {
    matched: matched.sort(
      (a, b) =>
        b.term.severity - a.term.severity || a.term.id.localeCompare(b.term.id),
    ),
    unmatched,
  };
}
function TermEditor({
  term,
  onClose,
}: {
  term?: ReviewTerm;
  onClose: () => void;
}) {
  const { state, act } = useDemo();
  const [phrase, setPhrase] = useState(term?.phrase || ""),
    [code, setCode] = useState(term?.code || "DEMO-001"),
    [grade, setGrade] = useState(term?.grade || "演示一般异常"),
    [severity, setSeverity] = useState(term?.severity || 1),
    [advice, setAdvice] = useState(term?.advice || "请由演示医生复核合成记录"),
    [error, setError] = useState("");
  const submitted = useRef(false);
  return (
    <Modal title="维护合成异常与编码词条" onClose={onClose} wide>
      <p>
        仅演示 ICD10 编码字段的配置与文字匹配机制。DEMO 编码并非 ICD
        标准；不内置或验证医学编码、诊断及建议。
      </p>
      <div className="form-grid">
        <Field label="匹配词条">
          <input
            aria-label="匹配词条"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            disabled={Boolean(term)}
          />
        </Field>
        <Field label="合成 ICD10 映射编码">
          <input
            aria-label="合成编码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label="自定义异常级别">
          <input
            aria-label="自定义异常级别"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
        </Field>
        <Field label="严重度（1–5）">
          <input
            aria-label="词条严重度"
            type="number"
            min="1"
            max="5"
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="合成建议">
        <textarea
          aria-label="词条合成建议"
          value={advice}
          onChange={(e) => setAdvice(e.target.value)}
        />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <DialogActions
        onClose={onClose}
        label="保存异常词条"
        onSave={() => {
          if (submitted.current) return;
          if (
            ![phrase, code, grade, advice].every((s) => s.trim()) ||
            !Number.isInteger(severity) ||
            severity < 1 ||
            severity > 5
          )
            return setError(
              "词条、编码、级别和建议必填，严重度须为 1–5 整数。",
            );
          if (/[，,。.;；！!？?\n]/.test(phrase))
            return setError("单个匹配词条不能包含拆分标点，请逐个维护。");
          const id = term?.id || `TERM-${encodeURIComponent(phrase.trim())}`,
            existing = rows(state, "reviewTerms").find((r) => r.id === id);
          const next = {
            id,
            phrase: phrase.trim(),
            code: code.trim(),
            grade: grade.trim(),
            severity,
            advice: advice.trim(),
            status: "active",
          };
          submitted.current = true;
          if (
            !existing ||
            Object.entries(next).some(([k, v]) => existing[k] !== v)
          )
            save(act, "reviewTerms", next);
          onClose();
        }}
      />
    </Modal>
  );
}
export function ReviewTextTools({ appointment }: { appointment: Appointment }) {
  const { state, act } = useDemo();
  const [text, setText] = useState(appointment.reviewNarrative || "");
  const [termEditor, setTermEditor] = useState<ReviewTerm | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<
    Record<string, { grade: string; severity: number }>
  >(() =>
    Object.fromEntries(
      (appointment.reviewFindings || []).map((finding: SavedRow) => [
        finding.id,
        { grade: finding.grade, severity: finding.severity },
      ]),
    ),
  );
  const [message, setMessage] = useState("");
  const matches = matchReviewText(state, text);
  const findings = matches.matched
    .map((m) => ({ ...m.term, ...overrides[m.term.id], segment: m.segment }))
    .sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
  const terms = (rows(state, "reviewTerms") as ReviewTerm[]).filter((t) =>
    `${t.phrase} ${t.code} ${t.grade}`.includes(query),
  );
  const valid = findings.every(
    (f) =>
      f.grade.trim() &&
      Number.isInteger(f.severity) &&
      f.severity >= 1 &&
      f.severity <= 5,
  );
  return (
    <details style={{ marginTop: 16 }}>
      <summary>
        <strong>合成异常词条、编码匹配与分级回访</strong>
      </summary>
      <p>
        按标点拆分待核对文本，用当前已维护词条匹配；未匹配项明确提示。所有分级均为人工配置，不属于医学判断。
      </p>
      <div className="toolbar">
        <Field label="查询异常词条或编码">
          <input
            aria-label="查询异常词条或编码"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <button className="btn" onClick={() => setTermEditor("new")}>
          维护新异常词条
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>词条</th>
            <th>合成编码</th>
            <th>级别 / 严重度</th>
            <th>维护</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.id}>
              <td>{t.phrase}</td>
              <td>{t.code}</td>
              <td>
                {t.grade} / {t.severity}
              </td>
              <td>
                <button className="text-btn" onClick={() => setTermEditor(t)}>
                  修改词条
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Field label="待核对异常文本">
        <textarea
          aria-label="待核对异常文本"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessage("");
          }}
          placeholder="仅录入合成文本，可使用逗号、分号、句号分段"
        />
      </Field>
      {!!matches.unmatched.length && (
        <div className="callout alert">
          <div>
            <strong>未匹配片段，请人工复核</strong>
            <ul aria-label="未匹配异常片段">
              {matches.unmatched.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <table aria-label="严重度排序的异常">
        <thead>
          <tr>
            <th>异常片段 / 编码</th>
            <th>人工级别</th>
            <th>严重度</th>
            <th>对应合成建议</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr key={`${f.id}-${f.segment}`}>
              <td>
                {f.segment}
                <small>{f.code}</small>
              </td>
              <td>
                <input
                  aria-label={`异常${i + 1}级别`}
                  value={f.grade}
                  onChange={(e) =>
                    setOverrides({
                      ...overrides,
                      [f.id]: { grade: e.target.value, severity: f.severity },
                    })
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`异常${i + 1}严重度`}
                  type="number"
                  min="1"
                  max="5"
                  value={f.severity}
                  onChange={(e) =>
                    setOverrides({
                      ...overrides,
                      [f.id]: {
                        grade: f.grade,
                        severity: Number(e.target.value),
                      },
                    })
                  }
                />
              </td>
              <td>{f.advice}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        保存后异常和建议按严重度降序排列；同订单同词条只建一条待回访记录。也可在“编排报告建议”中手动调整。
      </p>
      <button
        className="btn btn-primary"
        disabled={!text.trim() || !valid || appointment.status !== "review"}
        onClick={() => {
          if (!text.trim() || !valid || appointment.status !== "review") return;
          const suggestions = [...new Set(findings.map((f) => f.advice))];
          const patch = {
            reviewNarrative: text.trim(),
            reviewFindings: findings,
            reviewUnmatchedSegments: matches.unmatched,
            ...(suggestions.length
              ? {
                  reviewSuggestions: suggestions,
                  conclusion: `【合成建议，非诊疗依据】\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
                }
              : {}),
          };
          if (
            Object.entries(patch).some(
              ([key, value]) =>
                JSON.stringify(appointment[key]) !== JSON.stringify(value),
            )
          )
            update(act, appointment.id, patch);
          const unique = [...new Map(findings.map((f) => [f.id, f])).values()];
          unique.forEach((f) => {
            const id = `REVIEW-FOLLOWUP-${appointment.id}-${f.id}`,
              existing = state.tasks.find((t) => t.id === id);
            const next = {
              id,
              patientId: appointment.patientId,
              appointmentId: appointment.id,
              title: `合成异常复核：${f.phrase}`,
              risk: f.grade,
              severity: f.severity,
              owner: appointment.doctor || "演示健康管理师",
              source: "审核人工分级",
              date: today(),
            };
            if (!existing) act({ type: "ADD_TASK", payload: next });
            else if (
              ["risk", "severity", "title", "owner"].some(
                (key) => existing[key] !== next[key as keyof typeof next],
              )
            )
              act({ type: "UPDATE_TASK", payload: next });
          });
          setMessage(
            `已保存 ${findings.length} 个匹配片段、${matches.unmatched.length} 个待复核片段；关联 ${unique.length} 条去重回访任务。`,
          );
        }}
      >
        保存分级并按严重度生成建议
      </button>
      {message && <p role="status">{message}</p>}
      {termEditor && (
        <TermEditor
          term={termEditor === "new" ? undefined : termEditor}
          onClose={() => setTermEditor(null)}
        />
      )}
    </details>
  );
}

export const REPORT_TEMPLATE_SECTIONS = [
  "customer",
  "results",
  "conclusion",
  "suggestions",
  "interpretation",
] as const;
export interface ReportTemplate {
  version: 1;
  id: string;
  name: string;
  heading: string;
  footer: string;
  sections: (typeof REPORT_TEMPLATE_SECTIONS)[number][];
}
export const DEFAULT_REPORT_TEMPLATE: ReportTemplate = {
  version: 1,
  id: "default",
  name: "标准合成报告",
  heading: "红创 · 合成健康报告",
  footer: "合成演示数据，不作为诊疗依据。",
  sections: [...REPORT_TEMPLATE_SECTIONS],
};
export function parseReportTemplate(text: string): ReportTemplate {
  if (text.length > 65536) throw new Error("模板最大 64 KB。");
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("模板必须是有效 JSON。");
  }
  if (
    !parsed ||
    Array.isArray(parsed) ||
    typeof parsed !== "object" ||
    Object.keys(parsed).some(
      (k) =>
        !["version", "id", "name", "heading", "footer", "sections"].includes(k),
    )
  )
    throw new Error(
      "模板仅允许 version、id、name、heading、footer、sections 字段，不执行脚本或 HTML。",
    );
  if (
    parsed.version !== 1 ||
    typeof parsed.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(parsed.id) ||
    parsed.id === "default"
  )
    throw new Error(
      "模板版本须为 1，ID 为 1–80 位字母、数字、下划线或连字符，不能使用 default。",
    );
  if (
    !["name", "heading", "footer"].every(
      (k) =>
        typeof parsed[k] === "string" &&
        parsed[k].trim().length > 0 &&
        parsed[k].length <= 2000,
    )
  )
    throw new Error("模板名称、标题和页脚须为非空文本，且不超过 2000 字。");
  if (
    !Array.isArray(parsed.sections) ||
    !parsed.sections.length ||
    parsed.sections.some((s: any) => !REPORT_TEMPLATE_SECTIONS.includes(s)) ||
    new Set(parsed.sections).size !== parsed.sections.length
  )
    throw new Error("模板章节须从允许列表选择且不能重复。");
  return {
    version: 1,
    id: parsed.id,
    name: parsed.name.trim(),
    heading: parsed.heading.trim(),
    footer: parsed.footer.trim(),
    sections: parsed.sections,
  };
}
export function getReportTemplate(
  state: DemoState,
  appointment: Appointment,
): ReportTemplate {
  const stored = rows(state, "reportTemplates").find(
    (r) => r.id === appointment.reportTemplateId,
  );
  if (!stored) return DEFAULT_REPORT_TEMPLATE;
  try {
    const { version, id, name, heading, footer, sections } = stored;
    return parseReportTemplate(
      JSON.stringify({ version, id, name, heading, footer, sections }),
    );
  } catch {
    return DEFAULT_REPORT_TEMPLATE;
  }
}
export function reportTemplateText(
  state: DemoState,
  appointment: Appointment,
  template = getReportTemplate(state, appointment),
): string {
  const sections: Record<string, string> = {
    customer: `姓名：${nameFor(state, appointment.id)}\n体检号：${appointment.id}\n日期：${appointment.date}`,
    results: appointment.items
      .map((i) => `${i}：${appointment.results[i] || "未回传"}`)
      .join("\n"),
    conclusion: `综合结论：${appointment.conclusion || "尚未填写"}`,
    suggestions: `有序建议：\n${(appointment.reviewSuggestions || []).map((s: string, i: number) => `${i + 1}. ${s}`).join("\n") || "尚未编排"}`,
    interpretation: `报告解读：${appointment.interpretedBy || "未登记"} ${appointment.interpretedAt || ""}`,
  };
  return [
    template.heading,
    "【合成演示报告，不用于医疗诊断】",
    ...template.sections.map((s) => sections[s]),
    template.footer,
  ].join("\n\n");
}
function ReportTemplateEditor({
  template,
  appointment,
  onClose,
}: {
  template?: ReportTemplate;
  appointment?: Appointment;
  onClose: () => void;
}) {
  const { state, act } = useDemo();
  const [text, setText] = useState(
    JSON.stringify(
      template || {
        ...DEFAULT_REPORT_TEMPLATE,
        id: "demo-custom",
        name: "自定义合成报告",
      },
      null,
      2,
    ),
  );
  const [preview, setPreview] = useState<ReportTemplate | null>(null),
    [error, setError] = useState("");
  const submitted = useRef(false),
    fileRead = useRef(0);
  const parse = (): ReportTemplate | null => {
    try {
      const data = parseReportTemplate(text);
      setPreview(data);
      setError("");
      return data;
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
      return null;
    }
  };
  return (
    <Modal title="安全 JSON 报告模板导入与修改" onClose={onClose} wide>
      <p>
        仅支持本地 JSON 配置模板，不支持 Word、宏、脚本或 HTML。相同 ID
        保存会更新现有模板，所有使用该 ID 的订单立即采用新版本。
      </p>
      <Field label="上传报告模板 JSON">
        <input
          aria-label="上传报告模板 JSON"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 65536) {
              setError("模板最大 64 KB。");
              return;
            }
            const token = ++fileRead.current,
              reader = new FileReader();
            reader.onload = () => {
              if (token !== fileRead.current) return;
              setText(String(reader.result || ""));
              setPreview(null);
              setError("");
            };
            reader.onerror = () => {
              if (token === fileRead.current)
                setError("无法读取模板文件，请重新选择。");
            };
            reader.readAsText(file);
          }}
        />
      </Field>
      <Field label="报告模板 JSON 内容">
        <textarea
          aria-label="报告模板 JSON 内容"
          rows={10}
          value={text}
          onChange={(e) => {
            fileRead.current++;
            setText(e.target.value);
            setPreview(null);
          }}
        />
      </Field>
      <button className="btn" onClick={parse}>
        校验并预览模板
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <article className="report-paper" aria-label="导入模板预览">
          <h3>{preview.name}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {appointment
              ? reportTemplateText(state, appointment, preview)
              : `${preview.heading}\n${preview.sections.join(" → ")}\n${preview.footer}`}
          </p>
        </article>
      )}
      <DialogActions
        onClose={onClose}
        label="保存报告模板"
        onSave={() => {
          if (submitted.current) return;
          const next = parse();
          if (!next) return;
          submitted.current = true;
          const old = rows(state, "reportTemplates").find(
            (r) => r.id === next.id,
          );
          if (
            !old ||
            Object.entries(next).some(
              ([key, value]) =>
                JSON.stringify(old[key]) !== JSON.stringify(value),
            )
          )
            save(act, "reportTemplates", next);
          onClose();
        }}
      />
    </Modal>
  );
}
export function ReportTemplateTools({
  appointment,
}: {
  appointment?: Appointment;
}) {
  const { state, act } = useDemo();
  const [selected, setSelected] = useState(
      appointment?.reportTemplateId || "default",
    ),
    [editor, setEditor] = useState(false);
  const templates = [
    DEFAULT_REPORT_TEMPLATE,
    ...(rows(state, "reportTemplates") as ReportTemplate[]),
  ];
  const template =
    templates.find((t) => t.id === selected) || DEFAULT_REPORT_TEMPLATE;
  const safeTemplate =
    template.id === "default"
      ? DEFAULT_REPORT_TEMPLATE
      : getReportTemplate(state, {
          ...appointment,
          reportTemplateId: template.id,
        } as Appointment);
  return (
    <details style={{ marginTop: 18 }}>
      <summary>
        <strong>报告模板导入、下载与实际预览</strong>
      </summary>
      <div className="toolbar">
        <Field label="预览报告模板">
          <select
            aria-label="预览报告模板"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn" onClick={() => setEditor(true)}>
          导入 / 修改 JSON 模板
        </button>
        <button
          className="btn"
          onClick={() =>
            download(
              `${safeTemplate.id === "default" ? "demo-template" : safeTemplate.id}.json`,
              JSON.stringify(
                safeTemplate.id === "default"
                  ? { ...safeTemplate, id: "demo-template" }
                  : safeTemplate,
                null,
                2,
              ),
              "application/json",
            )
          }
        >
          下载报告模板
        </button>
        <button
          className="btn btn-primary"
          disabled={
            !appointment || appointment.reportTemplateId === safeTemplate.id
          }
          onClick={() => {
            if (appointment && appointment.reportTemplateId !== safeTemplate.id)
              update(act, appointment.id, {
                reportTemplateId: safeTemplate.id,
              });
          }}
        >
          应用模板到当前订单
        </button>
      </div>
      {appointment && (
        <article className="report-paper" aria-label="报告模板实际预览">
          <h3>{safeTemplate.name}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {reportTemplateText(state, appointment, safeTemplate)}
          </p>
        </article>
      )}
      {editor && (
        <ReportTemplateEditor
          template={safeTemplate.id === "default" ? undefined : safeTemplate}
          appointment={appointment}
          onClose={() => setEditor(false)}
        />
      )}
    </details>
  );
}
