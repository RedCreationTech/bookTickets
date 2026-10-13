import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  Printer,
  ScanLine,
} from "lucide-react";
import { useDemo, today } from "../store";
import type { Appointment, DemoState } from "../model";
import { Badge, Empty, Modal, PageTitle } from "../ui";
import { Banner, Metrics } from "./Operations";
import "./operations.css";
const stamp = () => new Date().toISOString();
const columns = [
  { key: "id", label: "体检号" },
  { key: "name", label: "姓名" },
  { key: "company", label: "单位" },
  { key: "date", label: "体检日期" },
  { key: "campus", label: "院区" },
];
const kinds = ["导检单", "项目单", "检验条码"];
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function Avatar({ label }: { label: string }) {
  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${label}抽象合成示意`}
        style={{
          width: 100,
          height: 100,
          background: "#e9f2ed",
          borderRadius: 12,
        }}
      >
        <circle cx="50" cy="32" r="17" fill="#8bae9b" />
        <path d="M18 85Q20 55 50 55Q80 55 82 85Z" fill="#bad0c1" />
        <text x="50" y="95" textAnchor="middle" fontSize="7" fill="#678671">
          SYNTHETIC · DEMO
        </text>
      </svg>
      <figcaption>{label} · 非真实照片</figcaption>
    </figure>
  );
}
function Alert({ text, error = false }: { text: string; error?: boolean }) {
  return text ? (
    <div
      className={`callout ${error ? "alert" : ""}`}
      role={error ? "alert" : "status"}
    >
      {text}
    </div>
  ) : null;
}
export function PrintDesk() {
  const { state, act } = useDemo();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [company, setCompany] = useState("全部单位");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState(kinds);
  const [photoMode, setPhotoMode] = useState(
    state.config.printPhotoMode || "both",
  );
  const [targets, setTargets] = useState(
    state.config.printTargets || {
      a4: "DEMO-A4-01",
      barcode: "DEMO-BARCODE-01",
    },
  );
  const [fields, setFields] = useState<
    { key: string; label: string; visible: boolean }[]
  >(state.config.printColumns || columns.map((c) => ({ ...c, visible: true })));
  const [previewId, setPreviewId] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const tasks = state.records.printTasks || [];
  const name = (a?: Appointment) =>
    state.patients.find((p) => p.id === a?.patientId)?.name || "演示客户";
  const orderCompany = (a?: Appointment) =>
    state.patients.find((p) => p.id === a?.patientId)?.company || "未指定单位";
  const orders = state.appointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      (company === "全部单位" || orderCompany(a) === company) &&
      (!query || `${a.id} ${name(a)} ${orderCompany(a)}`.includes(query)),
  );
  const visibleTasks = tasks.filter((t) => {
    const a = state.appointments.find((a) => a.id === t.appointmentId);
    return (
      (status === "全部" || t.status === status) &&
      (company === "全部单位" || orderCompany(a) === company) &&
      (!query || `${t.appointmentId} ${name(a)} ${t.kind}`.includes(query))
    );
  });
  const preview = tasks.find((t) => t.id === previewId);
  const appointment = state.appointments.find(
    (a) => a.id === preview?.appointmentId,
  );
  const getCell = (a: Appointment, key: string) =>
    key === "name"
      ? name(a)
      : key === "company"
        ? orderCompany(a)
        : String(a[key] || "");
  const settingsValid = () =>
    /^DEMO-[A-Z0-9_-]+$/i.test(targets.a4) &&
    /^DEMO-[A-Z0-9_-]+$/i.test(targets.barcode) &&
    fields.some((f) => f.visible);
  const saveSettings = () => {
    if (!settingsValid()) {
      setError("请使用 DEMO- 开头的模拟打印目标，并至少显示一个表头。");
      return;
    }
    act({
      type: "UPDATE_CONFIG",
      payload: {
        printTargets: targets,
        printPhotoMode: photoMode,
        printColumns: fields,
      },
    });
    setError("");
    setNotice("打印目标与版式已本地保存；未连接操作系统打印机。");
  };
  const create = () => {
    if (!selectedOrders.length || !selectedKinds.length) {
      setError("请至少选择一个订单和一种打印任务。");
      return;
    }
    let count = 0;
    for (const appointmentId of selectedOrders) {
      if (
        !state.appointments.some(
          (a) => a.id === appointmentId && a.status !== "cancelled",
        )
      )
        continue;
      for (const kind of selectedKinds) {
        const id = `PRINT-${appointmentId}-${kind}`;
        if (tasks.some((t) => t.id === id)) continue;
        act({
          type: "UPSERT_RECORD",
          payload: {
            collection: "printTasks",
            record: {
              id,
              appointmentId,
              kind,
              status: "待模拟打印",
              createdAt: stamp(),
              source: "批量任务",
            },
          },
        });
        count++;
      }
    }
    setError("");
    setNotice(
      count
        ? `已生成 ${count} 个打印任务；已有同订单同类型任务不会重复创建。`
        : "所选订单已有对应打印任务，本次未重复生成。",
    );
  };
  const execute = (ids: string[], retry = false) => {
    if (busy.current) return;
    if (!settingsValid()) {
      setError("请先填写有效的 DEMO 打印目标并保留至少一个表头。");
      return;
    }
    busy.current = true;
    let count = 0;
    try {
      ids.forEach((id, index) => {
        const task = tasks.find((t) => t.id === id);
        if (!task || !["待模拟打印", "模拟失败"].includes(task.status)) return;
        const a = state.appointments.find((a) => a.id === task.appointmentId);
        if (!a || a.status === "cancelled") return;
        const failed = !retry && simulateFailure && index === 0;
        const target = task.kind.includes("条码")
          ? targets.barcode
          : targets.a4;
        const attempt = {
          at: stamp(),
          actor: state.config.role,
          target,
          status: failed ? "模拟失败" : "已模拟打印",
        };
        act({
          type: "UPSERT_RECORD",
          payload: {
            collection: "printTasks",
            record: {
              ...task,
              status: attempt.status,
              attempts: [...(task.attempts || []), attempt],
              target,
              photoMode,
              columns: fields.filter((f) => f.visible),
              snapshot: {
                appointmentId: a.id,
                patientName: name(a),
                items: [...a.items],
                date: a.date,
              },
              printedAt: failed ? undefined : attempt.at,
              simulated: true,
            },
          },
        });
        count++;
      });
      setError("");
      setSelectedTasks([]);
      setNotice(
        count
          ? `已处理 ${count} 个本地打印任务；没有产生真实纸张或打印机作业。`
          : "没有可处理的待打印任务，已完成任务不会重复执行。",
      );
    } finally {
      busy.current = false;
    }
  };
  const move = (index: number, offset: number) => {
    const next = [...fields];
    if (!next[index + offset]) return;
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setFields(next);
  };
  return (
    <div className="ops-page">
      <PageTitle
        eyebrow="EXECUTION / PRINT"
        title="打印任务工作台"
        description="批量任务、版式预览与模拟执行留痕"
      />
      <Banner>
        开单自动生成的是本地打印任务。二维码承载演示订单/项目标识；没有驱动
        A4、条码打印机或真实 SDK。
      </Banner>
      <Metrics
        items={[
          { label: "全部打印任务", value: tasks.length },
          {
            label: "待模拟打印",
            value: tasks.filter((t) => t.status === "待模拟打印").length,
          },
          {
            label: "已模拟完成",
            value: tasks.filter((t) => t.status === "已模拟打印").length,
          },
          {
            label: "失败可重试",
            value: tasks.filter((t) => t.status === "模拟失败").length,
          },
        ]}
      />
      <Alert text={error} error />
      <Alert text={notice} />
      <details className="panel">
        <summary>打印目标与版式设置</summary>
        <div className="form-grid">
          <label>
            A4 模拟打印目标
            <input
              value={targets.a4}
              onChange={(e) => setTargets({ ...targets, a4: e.target.value })}
            />
          </label>
          <label>
            条码模拟打印目标
            <input
              value={targets.barcode}
              onChange={(e) =>
                setTargets({ ...targets, barcode: e.target.value })
              }
            />
          </label>
          <label>
            导检单照片显示
            <select
              value={photoMode}
              onChange={(e) => setPhotoMode(e.target.value)}
            >
              <option value="both">证件照与现场照</option>
              <option value="id">仅证件照</option>
              <option value="onsite">仅现场照</option>
              <option value="none">不显示照片</option>
            </select>
          </label>
        </div>
        <h3>订单表头顺序与显隐</h3>
        {fields.map((field, i) => (
          <div className="queue-row" key={field.key}>
            <label className="check-line">
              <input
                type="checkbox"
                checked={field.visible}
                onChange={(e) =>
                  setFields(
                    fields.map((f) =>
                      f.key === field.key
                        ? { ...f, visible: e.target.checked }
                        : f,
                    ),
                  )
                }
              />
              显示{field.label}
            </label>
            <button
              className="icon-btn"
              aria-label={`上移${field.label}表头`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              className="icon-btn"
              aria-label={`下移${field.label}表头`}
              disabled={i === fields.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={15} />
            </button>
          </div>
        ))}
        <button className="btn btn-primary" onClick={saveSettings}>
          保存打印版式与目标
        </button>
      </details>
      <section className="panel">
        <h2>按单位批量生成打印任务</h2>
        <div className="form-grid">
          <label>
            订单 / 任务查询
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="体检号、姓名、任务类型"
            />
          </label>
          <label>
            单位筛选
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option>全部单位</option>
              {[...new Set(state.patients.map((p) => p.company))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions" style={{ marginBottom: 15 }}>
          {kinds.map((kind) => (
            <label className="check-line" key={kind}>
              <input
                type="checkbox"
                checked={selectedKinds.includes(kind)}
                onChange={(e) =>
                  setSelectedKinds(
                    e.target.checked
                      ? [...selectedKinds, kind]
                      : selectedKinds.filter((k) => k !== kind),
                  )
                }
              />
              生成{kind}
            </label>
          ))}
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="批量打印订单">
            <thead>
              <tr>
                <th>选择</th>
                {fields
                  .filter((f) => f.visible)
                  .map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择打印订单${a.id}`}
                      checked={selectedOrders.includes(a.id)}
                      onChange={(e) =>
                        setSelectedOrders(
                          e.target.checked
                            ? [...selectedOrders, a.id]
                            : selectedOrders.filter((id) => id !== a.id),
                        )
                      }
                    />
                  </td>
                  {fields
                    .filter((f) => f.visible)
                    .map((f) => (
                      <td key={f.key}>{getCell(a, f.key)}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button
            className="btn"
            onClick={() => setSelectedOrders(orders.map((a) => a.id))}
          >
            选择当前筛选订单
          </button>
          <button className="btn btn-primary" onClick={create}>
            批量生成打印任务
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>任务队列</h2>
          <label>
            打印任务状态
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>全部</option>
              <option>待模拟打印</option>
              <option>模拟失败</option>
              <option>已模拟打印</option>
            </select>
          </label>
        </div>
        <div className="actions" style={{ marginBottom: 15 }}>
          <button
            className="btn"
            onClick={() =>
              setSelectedTasks(
                visibleTasks
                  .filter((t) => ["待模拟打印", "模拟失败"].includes(t.status))
                  .map((t) => t.id),
              )
            }
          >
            选择当前待处理任务
          </button>
          <button
            className="btn btn-primary"
            disabled={!selectedTasks.length}
            onClick={() => execute(selectedTasks)}
          >
            <Printer size={14} />
            执行选中模拟打印
          </button>
          <label className="check-line">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            />
            模拟首个任务失败
          </label>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>选择</th>
                <th>任务 / 订单</th>
                <th>状态 / 目标</th>
                <th>次数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择任务${task.id}`}
                      disabled={task.status === "已模拟打印"}
                      checked={selectedTasks.includes(task.id)}
                      onChange={(e) =>
                        setSelectedTasks(
                          e.target.checked
                            ? [...selectedTasks, task.id]
                            : selectedTasks.filter((id) => id !== task.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    {task.kind}
                    <small style={{ display: "block" }}>
                      {task.appointmentId}
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={task.status === "模拟失败" ? "amber" : "green"}
                    >
                      {task.status}
                    </Badge>
                    <small>{task.target || "待分配"}</small>
                  </td>
                  <td>{task.attempts?.length || 0}</td>
                  <td>
                    <button
                      className="btn"
                      onClick={() => setPreviewId(task.id)}
                    >
                      预览任务
                    </button>
                    {task.status === "模拟失败" && (
                      <button
                        className="btn"
                        onClick={() => execute([task.id], true)}
                      >
                        重试模拟打印
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleTasks.length && <Empty text="当前没有匹配的打印任务" />}
      </section>
      {preview && appointment && (
        <Modal title="打印任务预览" onClose={() => setPreviewId("")} wide>
          <Badge tone="amber">演示文档 · 非真实体检凭证</Badge>
          <h2>
            {preview.kind} · {name(appointment)}
          </h2>
          <p>
            {preview.appointmentId} · {appointment.date} · {appointment.campus}
          </p>
          <p>
            模拟目标：
            {preview.kind.includes("条码") ? targets.barcode : targets.a4}
          </p>
          {preview.kind === "导检单" && (
            <>
              <div style={{ display: "flex", gap: 24 }}>
                {["both", "id"].includes(photoMode) && (
                  <Avatar label="证件照" />
                )}
                {["both", "onsite"].includes(photoMode) && (
                  <Avatar label="现场照" />
                )}
              </div>
              <table className="ops-table" aria-label="导检单预览表头">
                <thead>
                  <tr>
                    {fields
                      .filter((f) => f.visible)
                      .map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {fields
                      .filter((f) => f.visible)
                      .map((f) => (
                        <td key={f.key}>{getCell(appointment, f.key)}</td>
                      ))}
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {preview.kind.includes("条码") ? (
            <figure style={{ textAlign: "center" }}>
              <QRCodeSVG
                value={`DEMO-PRINT:${preview.kind}:${appointment.id}`}
                size={160}
                title="检验条码演示二维码"
              />
              <figcaption>
                演示二维码 · {preview.kind} · {appointment.id}
              </figcaption>
            </figure>
          ) : (
            <ul>
              {appointment.items.map((item) => (
                <li key={item}>
                  {item} · {appointment.results[item] ? "已有结果" : "待检查"}
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => setPreviewId("")}>
              关闭预览
            </button>
            <button
              className="btn btn-primary"
              disabled={preview.status === "已模拟打印"}
              onClick={() => {
                execute([preview.id]);
                setPreviewId("");
              }}
            >
              确认模拟打印此任务
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type Deferred = {
  dueDate: string;
  items: string[];
  status: string;
  scheduledAt: string;
  arrivedAt?: string;
  processedAt?: string;
};
export function getDeferredCandidates(
  state: DemoState,
  date: string,
  days: number,
) {
  if (!validDate(date)) return [];
  return state.appointments
    .filter((a) => a.deferredExam && validDate(a.deferredExam.dueDate))
    .map((a) => {
      const deferred = a.deferredExam as Deferred;
      const remaining = a.items.filter(
        (item) =>
          !String(a.results[item] || "").trim() &&
          !(a.waived || []).includes(item),
      );
      const delta = Math.round(
        (Date.parse(deferred.dueDate) - Date.parse(date)) / 86400000,
      );
      const blocked =
        a.locked ||
        !["checked", "in_exam"].includes(a.status) ||
        deferred.status !== "待改日检" ||
        !!deferred.arrivedAt ||
        !remaining.length;
      return {
        appointment: a,
        deferred,
        remaining,
        delta,
        blocked,
        category: delta < 0 ? "已过期" : delta <= days ? "临期" : "未临期",
      };
    });
}
export function ExpiryDesk() {
  const { state, act } = useDemo();
  const [date, setDate] = useState(
    state.config.deferredSimulationDate || today(),
  );
  const [days, setDays] = useState(
    String(state.config.deferredReminderDays ?? 3),
  );
  const [id, setId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const windowValid =
    days.trim() !== "" &&
    Number.isInteger(Number(days)) &&
    Number(days) >= 0 &&
    Number(days) <= 30;
  const rows = getDeferredCandidates(
    state,
    date,
    windowValid ? Number(days) : 3,
  );
  const upcoming = rows.filter((r) => r.category === "临期" && !r.blocked);
  const overdue = rows.filter((r) => r.category === "已过期");
  const chosen = overdue.filter(
    (r) => selected.includes(r.appointment.id) && !r.blocked,
  );
  const eligible = state.appointments.filter(
    (a) =>
      !a.locked &&
      ["checked", "in_exam"].includes(a.status) &&
      a.items.some((item) => !String(a.results[item] || "").trim()),
  );
  const patient = (a: Appointment) =>
    state.patients.find((p) => p.id === a.patientId)?.name || "演示客户";
  const saveWindow = () => {
    if (!windowValid || !validDate(date)) {
      setError("提醒窗口需为 0–30 整数天，模拟日期必须有效。");
      return;
    }
    act({
      type: "UPDATE_CONFIG",
      payload: {
        deferredReminderDays: Number(days),
        deferredSimulationDate: date,
      },
    });
    setError("");
    setNotice(
      "临期规则与模拟日期已保存；只有点击执行才会处理，不运行后台定时任务。",
    );
  };
  const schedule = () => {
    const a = eligible.find((a) => a.id === id);
    if (!a || !validDate(dueDate)) {
      setError("请选择未锁定且仍有未检项目的订单，并填写有效的改日检日期。");
      return;
    }
    const existing = a.deferredExam as Deferred | undefined;
    if (existing?.status === "待改日检" && existing.dueDate === dueDate) {
      setNotice("此订单已有相同改日检安排，未重复登记。");
      return;
    }
    act({
      type: "UPDATE_APPOINTMENT",
      payload: {
        id,
        deferredExam: {
          dueDate,
          items: a.items.filter(
            (item) => !String(a.results[item] || "").trim(),
          ),
          status: "待改日检",
          scheduledAt: stamp(),
        },
      },
    });
    setNotice(
      "改日检已登记；已有检查结果保持不变。仅此类明确登记的订单参与到期演示。",
    );
    setError("");
    setId("");
    setDueDate("");
  };
  const remind = () => {
    if (!windowValid || !validDate(date)) {
      setError("请先设置有效的提醒窗口和模拟日期。");
      return;
    }
    let count = 0;
    upcoming.forEach((row) => {
      const notificationId = `DEFER-REMIND-${row.appointment.id}-${row.deferred.dueDate}`;
      if (
        state.records.controlNotifications?.some((n) => n.id === notificationId)
      )
        return;
      const a = row.appointment;
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "controlNotifications",
          record: {
            id: notificationId,
            appointmentId: a.id,
            patientId: a.patientId,
            patientName: patient(a),
            template: "改日检临期提醒",
            channel: "短信（本地模拟）",
            content: `【演示】${patient(a)}，改日检日期 ${row.deferred.dueDate}，待检项目：${row.remaining.join("、")}。`,
            status: "模拟送达",
            abnormalItems: [],
            attempts: [
              { at: stamp(), actor: state.config.role, status: "模拟送达" },
            ],
            simulatedDate: date,
          },
        },
      });
      count++;
    });
    setError("");
    setNotice(
      `已生成 ${count} 条本地提醒；同一订单同一到期日仅生成一次，未发送短信。`,
    );
  };
  const execute = () => {
    if (busy.current) return;
    if (state.config.role !== "admin") {
      setError("到期批处理仅限管理员演示角色。");
      setConfirming(false);
      return;
    }
    if (!validDate(date)) {
      setError("模拟日期无效，请重新预览。");
      return;
    }
    busy.current = true;
    let count = 0;
    try {
      chosen.forEach((row) => {
        const a = row.appointment;
        const recordId = `DEFER-EXPIRE-${a.id}-${row.deferred.dueDate}`;
        if (state.records.deferredExecutions?.some((r) => r.id === recordId))
          return;
        act({
          type: "UPDATE_APPOINTMENT",
          payload: {
            id: a.id,
            items: a.items.filter((item) => !row.remaining.includes(item)),
            waived: [...new Set([...(a.waived || []), ...row.remaining])],
            status: "review",
            reviewStage: 0,
            deferredExam: {
              ...row.deferred,
              status: "已处理",
              processedAt: stamp(),
            },
            expirySimulationDate: date,
          },
        });
        act({
          type: "UPSERT_RECORD",
          payload: {
            collection: "deferredExecutions",
            record: {
              id: recordId,
              appointmentId: a.id,
              dueDate: row.deferred.dueDate,
              simulationDate: date,
              waivedItems: row.remaining,
              retainedResultItems: Object.keys(a.results),
              status: "已模拟弃检并送审",
              actor: state.config.role,
              at: stamp(),
              synthetic: true,
            },
          },
        });
        count++;
      });
      setNotice(
        `已处理 ${count} 个过期未到检订单：仅未检项目记为弃检，已有结果保留，订单转入待审核。`,
      );
      setSelected([]);
      setConfirming(false);
      setError("");
    } finally {
      busy.current = false;
    }
  };
  const arrive = (a: Appointment) => {
    const deferred = a.deferredExam as Deferred;
    if (a.locked || deferred.status !== "待改日检") return;
    act({
      type: "UPDATE_APPOINTMENT",
      payload: {
        id: a.id,
        deferredExam: { ...deferred, status: "已到检", arrivedAt: stamp() },
      },
    });
    setNotice("已记录改日检到场，本订单退出临期提醒和到期弃检候选。");
  };
  return (
    <div className="ops-page">
      <PageTitle
        eyebrow="EXECUTION / FOLLOW-UP DATE"
        title="改日检到期处理"
        description="模拟日期预览、临期提醒与显式确认后的到期弃检"
      />
      <Banner>
        这是手动触发的本地批处理，不是后台自动任务。仅处理明确登记改日检且未到场、未锁定、仍处于检查阶段的合成订单；已有结果不会被覆盖。
      </Banner>
      <Alert text={error} error />
      <Alert text={notice} />
      <section className="panel">
        <h2>提醒窗口与模拟日期</h2>
        <div className="form-grid">
          <label>
            提前提醒天数
            <input
              type="number"
              min="0"
              max="30"
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setSelected([]);
              }}
            />
          </label>
          <label>
            到期处理模拟日期
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSelected([]);
              }}
            />
          </label>
        </div>
        <button className="btn" onClick={saveWindow}>
          保存窗口与模拟日期
        </button>
      </section>
      <section className="panel">
        <h2>登记改日检</h2>
        <div className="form-grid">
          <label>
            改日检订单
            <select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">请选择未锁定的检查中订单</option>
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {patient(a)} · {a.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            改日检到期日期
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>
        <button className="btn btn-primary" onClick={schedule}>
          保存改日检安排
        </button>
      </section>
      <Metrics
        items={[
          { label: "登记改日检", value: rows.length },
          { label: "临期可提醒", value: upcoming.length },
          {
            label: "过期可处理",
            value: overdue.filter((r) => !r.blocked).length,
          },
          {
            label: "已执行批处理",
            value: (state.records.deferredExecutions || []).length,
          },
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>临期订单预览</h2>
          <button className="btn" disabled={!upcoming.length} onClick={remind}>
            生成临期模拟短信提醒
          </button>
        </div>
        {upcoming.map((row) => (
          <div className="callout" key={row.appointment.id}>
            <div>
              <strong>
                {patient(row.appointment)} · {row.deferred.dueDate}（{row.delta}{" "}
                天后）
              </strong>
              <p>待检：{row.remaining.join("、")}</p>
              <button className="btn" onClick={() => arrive(row.appointment)}>
                确认改日检已到场
              </button>
            </div>
          </div>
        ))}
        {!upcoming.length && <Empty text="当前窗口没有可提醒的临期订单" />}
      </section>
      <section className="panel">
        <h2>过期订单预览</h2>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>选择</th>
                <th>订单 / 到期日</th>
                <th>将弃检的未检项目</th>
                <th>可执行状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((row) => (
                <tr key={row.appointment.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择到期订单${row.appointment.id}`}
                      disabled={row.blocked}
                      checked={selected.includes(row.appointment.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, row.appointment.id]
                            : selected.filter(
                                (id) => id !== row.appointment.id,
                              ),
                        )
                      }
                    />
                  </td>
                  <td>
                    {patient(row.appointment)}
                    <small style={{ display: "block" }}>
                      {row.appointment.id} · {row.deferred.dueDate}
                    </small>
                  </td>
                  <td>{row.remaining.join("、") || "无未检项目"}</td>
                  <td>
                    <Badge tone={row.blocked ? "gray" : "amber"}>
                      {row.blocked
                        ? "已处理 / 已到场 / 锁定或非检查阶段"
                        : "可模拟弃检送审"}
                    </Badge>
                  </td>
                  <td>
                    {!row.blocked && (
                      <button
                        className="btn"
                        onClick={() => arrive(row.appointment)}
                      >
                        确认改日检已到场
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button
            className="btn"
            onClick={() =>
              setSelected(
                overdue.filter((r) => !r.blocked).map((r) => r.appointment.id),
              )
            }
          >
            选择可处理过期订单
          </button>
          <button
            className="btn btn-primary"
            disabled={!chosen.length}
            onClick={() => setConfirming(true)}
          >
            预览到期弃检并送审
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>到期执行记录</h2>
        {(state.records.deferredExecutions || []).map((record) => (
          <div className="callout" key={record.id}>
            <div>
              <strong>
                {record.appointmentId} · {record.status}
              </strong>
              <p>
                弃检：{record.waivedItems.join("、")}
                <br />
                保留结果：{record.retainedResultItems.join("、") || "无"}
                <br />
                模拟日期 {record.simulationDate} · 操作人 {record.actor}
              </p>
            </div>
          </div>
        ))}
      </section>
      {confirming && (
        <Modal
          title="确认到期弃检并转审核"
          onClose={() => setConfirming(false)}
        >
          <Banner>
            将修改下列本地订单：未检项目进入弃检记录，订单状态转为待审核。已有结果保持原样。
          </Banner>
          {chosen.map((row) => (
            <p key={row.appointment.id}>
              {patient(row.appointment)} · {row.appointment.id}
              <br />
              弃检：{row.remaining.join("、")}
            </p>
          ))}
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirming(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={!chosen.length}
              onClick={execute}
            >
              <ClipboardCheck size={14} />
              确认执行本地到期处理
            </button>
          </div>
        </Modal>
      )}
      <GynecologySpecimens />
    </div>
  );
}
export function GynecologySpecimens() {
  const { state, act } = useDemo();
  const [preview, setPreview] = useState("");
  const [notice, setNotice] = useState("");
  const orders = state.appointments.filter((a) =>
    a.items.some((item) => /妇科|宫颈|TCT|HPV|病理/i.test(item)),
  );
  const specimen = (id: string) =>
    state.records.reportSpecimens?.find(
      (s) =>
        s.appointmentId === id &&
        /妇科|宫颈|TCT|HPV|病理/i.test(s.specimenType || s.type || ""),
    );
  const sample = (a: Appointment) => {
    if (
      a.locked ||
      !["checked", "in_exam"].includes(a.status) ||
      specimen(a.id)?.status === "已采集"
    )
      return;
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "reportSpecimens",
        record: {
          id: `SPEC-${a.id}-妇科病理`,
          appointmentId: a.id,
          patientId: a.patientId,
          type: "妇科病理",
          specimenType: "妇科病理",
          status: "已采集",
          barcode: `DEMO-PATHOLOGY:${a.id}`,
          operator: state.config.role,
          at: stamp(),
        },
      },
    });
    setNotice("妇科病理标本已记录为模拟采集，病理条码可预览；不表示真实采样。");
  };
  return (
    <section className="panel">
      <h2>妇科待采提示与病理条码</h2>
      <Banner>
        按订单妇科 / 宫颈 / TCT / HPV /
        病理项目显示待采提示；记录与分检工作站共享 reportSpecimens 集合。
      </Banner>
      <Alert text={notice} />
      {orders.map((a) => {
        const record = specimen(a.id);
        return (
          <div className="callout" key={a.id}>
            <div>
              <strong>
                {state.patients.find((p) => p.id === a.patientId)?.name} ·{" "}
                {a.id}
              </strong>
              <p>
                <Badge tone={record?.status === "已采集" ? "green" : "amber"}>
                  {record?.status === "已采集"
                    ? "已模拟采集"
                    : "待采标本 · 请确认勿漏采"}
                </Badge>
              </p>
              <div className="actions">
                <button
                  className="btn"
                  disabled={
                    a.locked ||
                    !["checked", "in_exam"].includes(a.status) ||
                    record?.status === "已采集"
                  }
                  onClick={() => sample(a)}
                >
                  确认妇科模拟采集
                </button>
                <button className="btn" onClick={() => setPreview(a.id)}>
                  <ScanLine size={14} />
                  预览病理条码
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {!orders.length && <Empty text="当前没有包含妇科或病理项目的演示订单" />}
      {preview && (
        <Modal title="病理标本条码预览" onClose={() => setPreview("")}>
          <QRCodeSVG
            value={`DEMO-PATHOLOGY:${preview}`}
            size={180}
            title="妇科病理标本演示二维码"
          />
          <p>
            {preview} · 妇科病理 · {specimen(preview)?.status || "待采集"}
          </p>
          <p>仅供本地预览，不触发真实打印、采样或检验申请。</p>
          <button className="btn" onClick={() => setPreview("")}>
            关闭预览
          </button>
        </Modal>
      )}
    </section>
  );
}
