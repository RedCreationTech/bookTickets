import { useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import {
  Bell,
  Fingerprint,
  PenLine,
  ShieldCheck,
  Smartphone,
  KeyRound,
  RotateCcw,
  Send,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { useDemo } from "../store";
import type { Appointment } from "../model";
import { analyzeDemoResults } from "../rules";
import { PageTitle, Badge, Empty, Modal } from "../ui";
import { Banner, Metrics, RecordWorkspace } from "./Operations";
import type { WorkspaceSpec } from "./Operations";
import "./operations.css";

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const dateTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", { hour12: false });
const columns = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 320px),1fr))",
  gap: 20,
};
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`callout ${error ? "alert" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
function AppointmentSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { state } = useDemo();
  return (
    <label className="field">
      体检订单
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {state.appointments.map((a) => (
          <option key={a.id} value={a.id}>
            {state.patients.find((p) => p.id === a.patientId)?.name} · {a.id}
          </option>
        ))}
      </select>
    </label>
  );
}
const templates = {
  report: {
    label: "报告完成 / 领取通知",
    text: "【清和演示】{姓名}，您的体检报告已完成，请通过演示报告中心查看。体检号：{体检号}。",
  },
  appointment: {
    label: "预约 / 体检前一天提醒",
    text: "【清和演示】{姓名}，您的体检预约为 {日期} {时段}，地点：{院区}。请查看体检前注意事项。",
  },
  abnormal: {
    label: "异常项目复核通知",
    text: "【清和演示】{姓名}，本次演示检查有待复核项目：{异常项目}。请联系演示健康管理师。此消息不构成诊疗建议。",
  },
  recheck: {
    label: "复查项目时间提醒",
    text: "【清和演示】{姓名}，请按已确认的复查安排查看项目及时间。体检号：{体检号}。",
  },
};
type TemplateKey = keyof typeof templates;
type Delivery = {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  template: string;
  channel: string;
  content: string;
  status: string;
  attempts: { at: string; actor: string; status: string }[];
  abnormalItems: string[];
};
function abnormalItems(a: Appointment) {
  const analysis = analyzeDemoResults(a.results);
  return Object.keys(a.results).filter(
    (key) =>
      (key === "空腹血糖" && analysis.alerts.some((x) => x.includes("血糖"))) ||
      (key === "血脂四项" && analysis.alerts.some((x) => x.includes("血脂"))) ||
      (key === "一般检查" && analysis.alerts.some((x) => x.includes("血压"))) ||
      /异常|偏高|偏低|阳性/.test(a.results[key]),
  );
}
function Notifications() {
  const { state, act } = useDemo();
  const [template, setTemplate] = useState<TemplateKey>("appointment");
  const [body, setBody] = useState(templates.appointment.text);
  const [channel, setChannel] = useState("短信（本地模拟）");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const logs = (state.records.controlNotifications || []) as Delivery[];
  const targets = state.appointments.filter((a) => selected.includes(a.id));
  const eligible = state.appointments.filter(
    (a) =>
      a.status !== "cancelled" &&
      (template !== "report" || ["approved", "printed"].includes(a.status)) &&
      (template !== "abnormal" || abnormalItems(a).length),
  );
  const items = [...new Set(targets.flatMap(abnormalItems))];
  const content = (a: Appointment) =>
    body
      .replaceAll(
        "{姓名}",
        state.patients.find((p) => p.id === a.patientId)?.name || "演示客户",
      )
      .replaceAll("{体检号}", a.id)
      .replaceAll("{日期}", a.date)
      .replaceAll("{时段}", a.time)
      .replaceAll("{院区}", a.campus)
      .replaceAll(
        "{异常项目}",
        abnormalItems(a)
          .filter((x) => selectedItems.includes(x))
          .join("、"),
      );
  const validate = () => {
    if (!targets.length) return "请至少选择一位通知对象。";
    if (!body.trim()) return "请填写通知正文。";
    if (body.length > 500) return "通知正文不能超过 500 字。";
    if (
      /\{(?!姓名\}|体检号\}|日期\}|时段\}|院区\}|异常项目\})[^}]+\}/.test(body)
    )
      return "正文包含未知占位符，请使用已支持的字段。";
    if (
      template === "abnormal" &&
      targets.some(
        (a) => !abnormalItems(a).some((x) => selectedItems.includes(x)),
      )
    )
      return "每位异常通知对象都需至少选择一个关联异常项目。";
    if (targets.some((a) => !eligible.some((x) => x.id === a.id)))
      return "所选订单状态已变化，请重新选择通知对象。";
    return "";
  };
  const showPreview = () => {
    const issue = validate();
    setError(issue);
    if (!issue) setPreview(true);
  };
  const send = () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      setPreview(false);
      return;
    }
    targets.forEach((a, index) => {
      const status = simulateFailure && index === 0 ? "模拟失败" : "模拟送达";
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "controlNotifications",
          record: {
            id: uid("NT"),
            appointmentId: a.id,
            patientId: a.patientId,
            patientName: state.patients.find((p) => p.id === a.patientId)?.name,
            template: templates[template].label,
            channel,
            content: content(a),
            status,
            abnormalItems:
              template === "abnormal"
                ? abnormalItems(a).filter((x) => selectedItems.includes(x))
                : [],
            attempts: [
              {
                at: new Date().toISOString(),
                actor: state.config.role,
                status,
              },
            ],
          },
        },
      });
    });
    setNotice(
      `已生成 ${targets.length} 条本地通知记录；未发送短信、电话或站内消息。`,
    );
    setPreview(false);
    setSelected([]);
    setSelectedItems([]);
  };
  const retry = (row: Delivery) => {
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "controlNotifications",
        record: {
          ...row,
          status: "模拟送达",
          attempts: [
            ...row.attempts,
            {
              at: new Date().toISOString(),
              actor: state.config.role,
              status: "模拟送达",
            },
          ],
        },
      },
    });
    setNotice(`${row.patientName} 的通知已完成本地重试；未对外发送。`);
  };
  return (
    <>
      <Metrics
        items={[
          { label: "本地通知", value: logs.length, icon: Bell },
          {
            label: "模拟送达",
            value: logs.filter((x) => x.status === "模拟送达").length,
          },
          {
            label: "可重试",
            value: logs.filter((x) => x.status === "模拟失败").length,
          },
          { label: "真实发送", value: 0, note: "未连接短信、电话或微信网关" },
        ]}
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice error>{error}</Notice>}
      <div style={columns}>
        <section className="panel">
          <h2>编写通知</h2>
          <label className="field">
            通知模板
            <select
              value={template}
              onChange={(e) => {
                const key = e.target.value as TemplateKey;
                setTemplate(key);
                setBody(templates[key].text);
                setSelected([]);
                setSelectedItems([]);
                setError("");
              }}
            >
              {Object.entries(templates).map(([key, t]) => (
                <option key={key} value={key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            通知渠道
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option>短信（本地模拟）</option>
              <option>电话（本地模拟）</option>
              <option>站内消息（本地模拟）</option>
            </select>
          </label>
          <label className="field">
            通知正文
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <small>
            支持字段：姓名、体检号、日期、时段、院区、异常项目（用花括号包裹）。
            {body.length} / 500 字
          </small>
          <label className="check-line" style={{ margin: "18px 0" }}>
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            />
            模拟首位接收失败，用于验证重试
          </label>
          <button className="btn btn-primary" onClick={showPreview}>
            <Eye size={15} />
            预览通知
          </button>
        </section>
        <section className="panel">
          <h2>选择通知对象</h2>
          <p>
            {template === "report"
              ? "仅显示已审核 / 已打印的订单。"
              : template === "abnormal"
                ? "从共享分检结果提取演示异常，可选择关联项目。规则未经临床验证。"
                : "从共享预约订单选择接收人。"}
          </p>
          {eligible.length ? (
            eligible.map((a) => (
              <label
                key={a.id}
                className="check-line"
                style={{ padding: "10px 0", borderBottom: "1px solid #edf1ed" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, a.id]
                        : selected.filter((id) => id !== a.id),
                    );
                    if (e.target.checked)
                      setSelectedItems([
                        ...new Set([...selectedItems, ...abnormalItems(a)]),
                      ]);
                  }}
                />
                <span>
                  {state.patients.find((p) => p.id === a.patientId)?.name}
                  <small style={{ display: "block", color: "#87958d" }}>
                    {a.id} · {a.date} {a.time}
                  </small>
                </span>
              </label>
            ))
          ) : (
            <Empty text="暂无符合通知条件的订单" />
          )}
          {template === "abnormal" && (
            <div style={{ marginTop: 18 }}>
              <h3>关联异常项目</h3>
              {items.map((item) => (
                <label className="check-line" key={item}>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item)}
                    onChange={(e) =>
                      setSelectedItems(
                        e.target.checked
                          ? [...selectedItems, item]
                          : selectedItems.filter((x) => x !== item),
                      )
                    }
                  />
                  {item}
                </label>
              ))}
              <a className="link-btn" href="#/exam">
                查看共享分检结果
              </a>
              <p>通知仅为前端流程演示，不执行自动临床判断或真实外呼。</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>发送日志与多次通知</h2>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>对象 / 订单</th>
                <th>模板 / 渠道</th>
                <th>通知情况</th>
                <th>操作人 / 操作时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.patientName}
                    <small style={{ display: "block" }}>
                      {row.appointmentId}
                    </small>
                  </td>
                  <td>
                    {row.template}
                    <small style={{ display: "block" }}>{row.channel}</small>
                  </td>
                  <td>
                    <Badge tone={row.status === "模拟失败" ? "amber" : "green"}>
                      {row.status}
                    </Badge>
                    <details>
                      <summary>{row.attempts.length} 次记录 / 查看内容</summary>
                      <p>{row.content}</p>
                      {row.attempts.map((a, i) => (
                        <p key={i}>
                          {i + 1}. {dateTime(a.at)} · {a.actor} · {a.status}
                        </p>
                      ))}
                    </details>
                  </td>
                  <td>
                    {row.attempts.at(-1)?.actor}
                    <small style={{ display: "block" }}>
                      {dateTime(row.attempts.at(-1)?.at || "")}
                    </small>
                  </td>
                  <td>
                    {row.status === "模拟失败" ? (
                      <button className="btn" onClick={() => retry(row)}>
                        <RotateCcw size={13} />
                        重试模拟通知
                      </button>
                    ) : (
                      <span>已记录</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!logs.length && <Empty text="还没有本地通知记录" />}
      </section>
      {preview && (
        <Modal
          title="通知预览 · 确认本地模拟"
          onClose={() => setPreview(false)}
        >
          <Banner>此操作仅创建本浏览器日志，不联系任何人。</Banner>
          {targets.map((a) => (
            <article key={a.id} className="callout">
              <div>
                <strong>
                  {state.patients.find((p) => p.id === a.patientId)?.name} ·{" "}
                  {channel}
                </strong>
                <p>{content(a)}</p>
              </div>
            </article>
          ))}
          <div className="modal-actions">
            <button className="btn" onClick={() => setPreview(false)}>
              返回修改
            </button>
            <button className="btn btn-primary" onClick={send}>
              <Send size={14} />
              确认模拟发送
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AbstractAvatar({ onsite = false }: { onsite?: boolean }) {
  return (
    <svg
      viewBox="0 0 240 200"
      role="img"
      aria-label={`${onsite ? "现场照" : "证件照"}：抽象合成人像示意，非真实照片`}
      style={{
        width: "100%",
        maxWidth: 280,
        borderRadius: 16,
        background: onsite ? "#edf1f8" : "#ecf5ef",
      }}
    >
      <rect
        x="20"
        y="20"
        width="200"
        height="160"
        rx="18"
        fill="none"
        stroke={onsite ? "#a3b8cf" : "#92bba5"}
        strokeDasharray="6 6"
      />
      <circle
        cx={onsite ? "123" : "120"}
        cy="78"
        r="32"
        fill={onsite ? "#8ba8c8" : "#75a38c"}
      />
      <path
        d="M64 158 Q66 112 120 112 Q174 112 176 158 Z"
        fill={onsite ? "#c1d0e2" : "#b5d4bf"}
      />
      <text x="120" y="184" textAnchor="middle" fontSize="10" fill="#577768">
        SYNTHETIC · DEMO
      </text>
    </svg>
  );
}
function IdentityQuality() {
  const { state, act } = useDemo();
  const [id, setId] = useState(state.appointments[0]?.id || "");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const a = state.appointments.find((x) => x.id === id);
  const records = (state.records.controlIdentity || []).filter(
    (r) => r.appointmentId === id,
  );
  const save = (outcome: string) => {
    if (!confirmed) {
      setError("请确认已人工核对两幅合成示意图。这里没有自动人脸识别。");
      return;
    }
    if (outcome === "不一致，待复核" && !note.trim()) {
      setError("请填写不一致的复核说明。");
      return;
    }
    const record = {
      id: uid("ID"),
      appointmentId: id,
      outcome,
      note: note.trim(),
      actor: state.config.role,
      at: new Date().toISOString(),
      synthetic: true,
    };
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "controlIdentity", record },
    });
    act({
      type: "UPDATE_APPOINTMENT",
      payload: {
        id,
        identityVerification: {
          outcome,
          at: record.at,
          actor: record.actor,
          note: record.note,
          synthetic: true,
        },
      },
    });
    setNotice(`已保存人工核验：${outcome}。结果仅适用于合成演示。`);
    setError("");
    setConfirmed(false);
    setNote("");
  };
  return (
    <>
      <section className="panel">
        <h2>双图人工核验</h2>
        <p>
          登记、采血和分检使用同一演示订单核验记录。不访问摄像头，不采集照片或生物识别信息。
        </p>
        <AppointmentSelect
          value={id}
          onChange={(value) => {
            setId(value);
            setConfirmed(false);
            setNote("");
            setError("");
            setNotice("");
          }}
        />
        {a && (
          <>
            <div style={columns}>
              <figure style={{ margin: 0, textAlign: "center" }}>
                <AbstractAvatar />
                <figcaption>证件照 · 抽象合成示意</figcaption>
              </figure>
              <figure style={{ margin: 0, textAlign: "center" }}>
                <AbstractAvatar onsite />
                <figcaption>现场照 · 抽象合成示意</figcaption>
              </figure>
            </div>
            <p>
              当前核验：
              <Badge
                tone={
                  a.identityVerification?.outcome?.includes("不一致")
                    ? "amber"
                    : "green"
                }
              >
                {a.identityVerification?.outcome || "未核验"}
              </Badge>
            </p>
            <label className="field">
              核验 / 复核说明
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="仅填写合成演示说明"
              />
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我已人工核对这两幅合成示意图
            </label>
            <div className="actions" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={() => save("一致")}>
                确认一致
              </button>
              <button className="btn" onClick={() => save("不一致，待复核")}>
                标记不一致
              </button>
            </div>
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
      </section>
      <section className="panel">
        <h2>核验历史</h2>
        {records.map((r) => (
          <div key={r.id} className="callout">
            <div>
              <strong>{r.outcome}</strong>
              <p>
                {r.note || "人工确认合成示意"} · {r.actor} · {dateTime(r.at)}
              </p>
            </div>
          </div>
        ))}
        {!records.length && <Empty text="该订单尚无人工核验记录" />}
      </section>
    </>
  );
}

type Point = [number, number];
type SignatureRecord = {
  id: string;
  appointmentId: string;
  patientName: string;
  operation: string;
  note: string;
  typed: string;
  strokes: Point[][];
  at: string;
  actor: string;
  synthetic: boolean;
};
function SignatureVisual({
  record,
}: {
  record: Pick<SignatureRecord, "typed" | "strokes">;
}) {
  return (
    <svg
      viewBox="0 0 600 180"
      role="img"
      aria-label="演示签名预览，无签字法律效力"
      style={{ width: "100%", background: "#f6f8f5", borderRadius: 12 }}
    >
      <text x="580" y="165" textAnchor="end" fill="#a5b5a8" fontSize="12">
        DEMO · 无法律效力
      </text>
      {record.typed ? (
        <text x="40" y="105" fill="#277c68" fontSize="46" fontFamily="cursive">
          {record.typed}
        </text>
      ) : (
        record.strokes.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="#277c68"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))
      )}
    </svg>
  );
}
function Signatures() {
  const { state, act } = useDemo();
  const [id, setId] = useState(state.appointments[0]?.id || "");
  const [operation, setOperation] = useState("弃检确认");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("typed");
  const [typed, setTyped] = useState("");
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const drawing = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SignatureRecord | null>(null);
  const records = (state.records.controlSignatures || []) as SignatureRecord[];
  const visible = records.filter((r) =>
    [r.patientName, r.appointmentId, r.operation].some((x) =>
      x.includes(query.trim()),
    ),
  );
  const point = (e: PointerEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(
        Math.max(
          0,
          Math.min(600, ((e.clientX - box.left) / (box.width || 600)) * 600),
        ),
      ),
      Math.round(
        Math.max(
          0,
          Math.min(180, ((e.clientY - box.top) / (box.height || 180)) * 180),
        ),
      ),
    ];
  };
  const save = () => {
    if (!note.trim()) {
      setError("请填写本次操作说明（例如弃检项目或领取方式）。");
      return;
    }
    if (
      mode === "typed"
        ? typed.trim() !== "演示签名"
        : !strokes.some((s) => s.length >= 2)
    ) {
      setError("请输入固定文字“演示签名”，或绘制至少一条完整演示笔画。");
      return;
    }
    if (!confirmed) {
      setError("请勾选本次操作的演示确认。");
      return;
    }
    const a = state.appointments.find((a) => a.id === id);
    if (!a) {
      setError("请先选择有效体检订单。");
      return;
    }
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "controlSignatures",
        record: {
          id: uid("SIGN"),
          appointmentId: id,
          patientName:
            state.patients.find((p) => p.id === a.patientId)?.name ||
            "演示客户",
          operation,
          note: note.trim(),
          typed: mode === "typed" ? "演示签名" : "",
          strokes: mode === "draw" ? strokes : [],
          actor: state.config.role,
          at: new Date().toISOString(),
          synthetic: true,
        },
      },
    });
    setNotice(
      `${operation}的演示签名已归档。仅本地保存，不更改订单、不具备法律效力。`,
    );
    setError("");
    setTyped("");
    setStrokes([]);
    setNote("");
    setConfirmed(false);
  };
  return (
    <>
      <div style={columns}>
        <section className="panel">
          <h2>关键节点签名留样</h2>
          <p>
            仅可使用固定演示文字或随意笔画。请勿输入真实签名。浏览器数据可被清理，不提供永久存档保证。
          </p>
          <AppointmentSelect
            value={id}
            onChange={(value) => {
              setId(value);
              setConfirmed(false);
            }}
          />
          <label className="field">
            确认操作
            <select
              value={operation}
              onChange={(e) => {
                setOperation(e.target.value);
                setConfirmed(false);
              }}
            >
              <option>弃检确认</option>
              <option>替检核验确认</option>
              <option>特殊报告领取</option>
              <option>导检单回收</option>
            </select>
          </label>
          <label className="field">
            本次操作说明
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label className="field">
            签名方式
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="typed">固定演示文字</option>
              <option value="draw">指针绘制笔画</option>
            </select>
          </label>
          {mode === "typed" ? (
            <label className="field">
              演示签名文字
              <input
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setConfirmed(false);
                }}
                placeholder="只能输入：演示签名"
                autoComplete="off"
              />
            </label>
          ) : (
            <>
              <svg
                viewBox="0 0 600 180"
                role="img"
                aria-label="演示签名绘制区域"
                style={{
                  width: "100%",
                  touchAction: "none",
                  background: "#f5f8f3",
                  border: "1px dashed #98b9a7",
                  borderRadius: 10,
                }}
                onPointerDown={(e) => {
                  const start = point(e);
                  drawing.current = true;
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setConfirmed(false);
                  setStrokes((s) => [...s, [start]]);
                }}
                onPointerMove={(e) => {
                  if (drawing.current) {
                    const p = point(e);
                    setStrokes((s) =>
                      s.length
                        ? [...s.slice(0, -1), [...s[s.length - 1], p]]
                        : s,
                    );
                  }
                }}
                onPointerUp={() => {
                  drawing.current = false;
                }}
                onPointerCancel={() => {
                  drawing.current = false;
                }}
              >
                {strokes.map((s, i) => (
                  <polyline
                    key={i}
                    points={s.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke="#277c68"
                    strokeWidth="3"
                  />
                ))}
                <text x="20" y="160" fontSize="12" fill="#839b8a">
                  绘制任意演示笔画 · 请勿使用真实签名
                </text>
              </svg>
              <button
                className="btn"
                onClick={() => {
                  setStrokes([]);
                  setConfirmed(false);
                }}
              >
                清空笔画
              </button>
            </>
          )}
          <label className="check-line" style={{ margin: "18px 0" }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            确认本次“{operation}”仅为演示留样，无法律效力
          </label>
          <button className="btn btn-primary" onClick={save}>
            <PenLine size={14} />
            归档演示签名
          </button>
          {error && <Notice error>{error}</Notice>}
          {notice && <Notice>{notice}</Notice>}
        </section>
        <section className="panel">
          <h2>签名档案查询</h2>
          <label className="field">
            查询签名档案
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="姓名、体检号或操作"
            />
          </label>
          {visible.map((r) => (
            <article className="callout" key={r.id}>
              <div style={{ flex: 1 }}>
                <strong>
                  {r.patientName} · {r.operation}
                </strong>
                <p>
                  {r.appointmentId}
                  <br />
                  {dateTime(r.at)} · {r.actor}
                </p>
                <button className="btn" onClick={() => setSelected(r)}>
                  <Eye size={14} />
                  查看签名档案
                </button>
              </div>
            </article>
          ))}
          {!visible.length && <Empty text="暂无匹配的演示签名" />}
        </section>
      </div>
      {selected && (
        <Modal title="演示签名档案" onClose={() => setSelected(null)}>
          <Badge tone="amber">仅本地样本 · 无法律效力</Badge>
          <h3>
            {selected.patientName} · {selected.operation}
          </h3>
          <p>
            {selected.appointmentId} · {dateTime(selected.at)} ·{" "}
            {selected.actor}
          </p>
          <p>{selected.note}</p>
          <SignatureVisual record={selected} />
        </Modal>
      )}
    </>
  );
}

function RejectionQuality() {
  const { state } = useDemo();
  const [doctor, setDoctor] = useState("全部医生");
  const rejections = state.audit
    .filter((a) => a.action === "REJECT")
    .map((a) => ({
      ...a,
      doctor:
        a.before?.doctor ||
        state.appointments.find((x) => x.id === a.entity)?.doctor ||
        "未指定医生",
      reason:
        a.after?.rejectReason ||
        a.message.split("：").slice(1).join("：") ||
        "未填写原因",
      stage: a.before?.reviewStage ? "主检 / 总检" : "分检",
    }));
  const visible = rejections.filter(
    (r) => doctor === "全部医生" || r.doctor === doctor,
  );
  const grouped = Object.entries(
    visible.reduce<Record<string, number>>((map, row) => {
      const key = `${row.doctor}｜${row.stage}｜${row.reason}`;
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {}),
  );
  return (
    <>
      <Metrics
        items={[
          { label: "审核驳回事件", value: rejections.length },
          {
            label: "涉及医生",
            value: new Set(rejections.map((r) => r.doctor)).size,
          },
          {
            label: "涉及订单",
            value: new Set(rejections.map((r) => r.entity)).size,
          },
          { label: "当前筛选事件", value: visible.length },
        ]}
      />
      <Banner>
        仅统计本浏览器实际 REJECT
        审计事件，不生成虚构驳回数据。“原因占比”以当前筛选驳回事件为分母，不代表医生临床错误概率；审计最多保留
        1,000 条。
      </Banner>
      <section className="panel" style={{ marginTop: 20 }}>
        <h2>医生与驳回原因分布</h2>
        <label className="field">
          筛选责任医生
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option>全部医生</option>
            {[...new Set(rejections.map((r) => r.doctor))].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>原记录医生</th>
                <th>环节</th>
                <th>驳回原因</th>
                <th>次数</th>
                <th>原因占比</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([key, count]) => {
                const [name, stage, reason] = key.split("｜");
                return (
                  <tr key={key}>
                    <td>{name}</td>
                    <td>{stage}</td>
                    <td>{reason}</td>
                    <td>{count}</td>
                    <td>{((count / visible.length) * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <Empty text="暂无实际审核驳回事件" />}
      </section>
      <section className="panel">
        <h2>可追溯事件明细</h2>
        {visible.map((r) => (
          <div className="callout" key={r.id}>
            <div>
              <strong>
                {r.entity} · {r.doctor} · {r.reason}
              </strong>
              <p>
                审核操作人：{r.actor} · {dateTime(r.time)}
              </p>
            </div>
          </div>
        ))}
        <a className="link-btn" href="#/review">
          前往总检审核
        </a>
      </section>
    </>
  );
}

const portalSpecs: WorkspaceSpec[] = [
  {
    key: "portalBanners",
    label: "海报与新闻",
    description: "患者端展示标题、摘要、发布时间、顺序与内部目标。",
    fields: [
      { key: "name", label: "展示标题", required: true },
      {
        key: "kind",
        label: "内容类型",
        type: "select",
        options: ["海报", "新闻"],
        required: true,
      },
      { key: "summary", label: "摘要", type: "textarea", required: true },
      { key: "date", label: "发布日期", type: "date", required: true },
      { key: "order", label: "展示顺序", type: "number", required: true },
      {
        key: "target",
        label: "内部目标",
        type: "select",
        options: ["预约体检", "报告查询", "健康科普"],
        required: true,
      },
    ],
    seeds: [
      {
        id: "BANNER-DEMO",
        name: "安心体检，从预约开始",
        kind: "海报",
        summary: "合成演示内容，展示预约入口。",
        date: "2026-10-13",
        order: 1,
        target: "预约体检",
        status: "已启用",
      },
    ],
  },
  {
    key: "portalMenus",
    label: "小程序菜单",
    description: "编辑菜单名称、图标主题、导航入口与显示顺序。",
    fields: [
      { key: "name", label: "菜单名称", required: true },
      {
        key: "icon",
        label: "图标主题",
        type: "select",
        options: ["日历", "报告", "健康", "客服"],
        required: true,
      },
      {
        key: "target",
        label: "目标页面",
        type: "select",
        options: ["预约体检", "报告查询", "服务中心", "常见问题"],
        required: true,
      },
      { key: "order", label: "显示顺序", type: "number", required: true },
    ],
    seeds: [
      {
        id: "MENU-DEMO",
        name: "预约体检",
        icon: "日历",
        target: "预约体检",
        order: 1,
        status: "已启用",
      },
    ],
  },
  {
    key: "portalFaq",
    label: "常见问题",
    description: "按服务主题维护问答及排序，内容仅存本地。",
    fields: [
      { key: "name", label: "问题", required: true },
      {
        key: "category",
        label: "问题分类",
        type: "select",
        options: ["预约", "检查", "报告", "费用"],
        required: true,
      },
      { key: "answer", label: "回答", type: "textarea", required: true },
      { key: "order", label: "显示顺序", type: "number", required: true },
    ],
    seeds: [
      {
        id: "FAQ-DEMO",
        name: "如何查看演示报告？",
        category: "报告",
        answer: "进入报告查询，选择已审核的演示订单查看。",
        order: 1,
        status: "已启用",
      },
    ],
  },
  {
    key: "portalServices",
    label: "服务信息",
    description: "维护服务范围、开放时间、地点和演示费用。",
    fields: [
      { key: "name", label: "服务名称", required: true },
      { key: "scope", label: "服务范围", type: "textarea", required: true },
      { key: "hours", label: "开放时间", required: true },
      { key: "location", label: "服务地点", required: true },
      { key: "price", label: "演示费用（元）", type: "number", required: true },
    ],
    seeds: [
      {
        id: "SERVICE-DEMO",
        name: "体检报告解读",
        scope: "合成报告演示讲解，不提供诊疗服务。",
        hours: "工作日 09:00–17:00",
        location: "演示健康管理区",
        price: 0,
        status: "已启用",
      },
    ],
  },
  {
    key: "guideDepartments",
    label: "导检科室",
    description: "维护检查项目、平均服务时长、性别适用性与所属区域。",
    fields: [
      { key: "name", label: "科室名称", required: true },
      { key: "code", label: "科室编码", required: true },
      { key: "zone", label: "所属区域", required: true },
      { key: "items", label: "检查项目", required: true },
      {
        key: "minutes",
        label: "平均服务分钟",
        type: "number",
        min: 1,
        required: true,
      },
      {
        key: "sex",
        label: "适用性别",
        type: "select",
        options: ["不限", "男", "女"],
        required: true,
      },
    ],
    seeds: [
      {
        id: "DEP-DEMO",
        name: "检验科",
        code: "LAB-DEMO",
        zone: "一层采血区",
        items: "血常规、肝功能",
        minutes: 5,
        sex: "不限",
        status: "已启用",
      },
    ],
  },
  {
    key: "guideZones",
    label: "检查区域",
    description: "独立维护院区、楼层、区域位置与无障碍指引。",
    fields: [
      { key: "name", label: "区域名称", required: true },
      {
        key: "campus",
        label: "所属院区",
        type: "select",
        options: ["中心院区", "东院区"],
        required: true,
      },
      { key: "floor", label: "楼层", required: true },
      {
        key: "directions",
        label: "位置 / 无障碍指引",
        type: "textarea",
        required: true,
      },
    ],
    seeds: [
      {
        id: "ZONE-DEMO",
        name: "一层采血区",
        campus: "中心院区",
        floor: "1F",
        directions: "合成平面位置：前台左侧，设无障碍通道。",
        status: "已启用",
      },
    ],
  },
  {
    key: "guideRooms",
    label: "诊室",
    description: "将诊室关联到科室、区域、队列，维护接诊容量。",
    fields: [
      { key: "name", label: "诊室名称", required: true },
      { key: "department", label: "所属科室", required: true },
      { key: "zone", label: "所属区域", required: true },
      { key: "queue", label: "队列编码", required: true },
      {
        key: "capacity",
        label: "同时接诊人数",
        type: "number",
        min: 1,
        required: true,
      },
    ],
    seeds: [
      {
        id: "ROOM-DEMO",
        name: "采血 01 室",
        department: "检验科",
        zone: "一层采血区",
        queue: "Q-LAB-DEMO",
        capacity: 1,
        status: "已启用",
      },
    ],
  },
  {
    key: "portalTeams",
    label: "设备与团队",
    description: "维护公开介绍，全部人员与设备名称为合成样例。",
    fields: [
      { key: "name", label: "名称", required: true },
      {
        key: "kind",
        label: "介绍类型",
        type: "select",
        options: ["检查设备", "医生团队"],
        required: true,
      },
      { key: "department", label: "所属科室", required: true },
      { key: "summary", label: "介绍内容", type: "textarea", required: true },
    ],
    seeds: [
      {
        id: "TEAM-DEMO",
        name: "演示健康管理团队",
        kind: "医生团队",
        department: "健康管理科",
        summary: "用于前端展示的虚构团队。",
        status: "已启用",
      },
    ],
  },
  {
    key: "portalLinks",
    label: "友情链接",
    description: "仅维护链接文本记录，不自动打开或验证外部网站。",
    fields: [
      { key: "name", label: "链接名称", required: true },
      { key: "url", label: "链接地址", required: true },
      {
        key: "description",
        label: "链接说明",
        type: "textarea",
        required: true,
      },
      { key: "order", label: "显示顺序", type: "number", required: true },
    ],
    seeds: [
      {
        id: "LINK-DEMO",
        name: "演示服务帮助",
        url: "https://example.invalid/help",
        description: "不可访问的保留演示域名。",
        order: 1,
        status: "已停用",
      },
    ],
  },
];
function PortalConfiguration() {
  const { state, act } = useDemo();
  const [tab, setTab] = useState("hospital");
  const [draft, setDraft] = useState({
    name: "清和健康体检中心（演示）",
    intro: "提供预约、体检、报告与健康管理的一体化合成演示。",
    address: "演示城市 · 合成健康路 1 号（非真实地址）",
    hotline: "DEMO-0000",
    hours: "周一至周六 08:00–17:00",
    ...(state.config.portalHospital || {}),
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = () => {
    if (Object.values(draft).some((v) => !String(v).trim())) {
      setError("请完整填写医院信息。");
      return;
    }
    if (!/^DEMO-[\d-]{4,16}$/.test(draft.hotline)) {
      setError("演示热线必须使用 DEMO- 加数字的格式，不能填写真实电话号码。");
      return;
    }
    act({ type: "UPDATE_CONFIG", payload: { portalHospital: draft } });
    setError("");
    setNotice("医院信息已保存到本地配置；未发布到真实小程序。");
  };
  const spec = portalSpecs.find((s) => s.key === tab);
  return (
    <>
      <Banner>
        配置只保存在本浏览器，预览仅代表当前模块内容；未连接或发布微信小程序，导检配置未对接真实设备。
      </Banner>
      <div className="ops-tabbar" role="tablist" aria-label="门户与导检配置">
        <button
          role="tab"
          aria-selected={tab === "hospital"}
          className={tab === "hospital" ? "active" : ""}
          onClick={() => setTab("hospital")}
        >
          医院信息
        </button>
        {portalSpecs.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={tab === s.key}
            className={tab === s.key ? "active" : ""}
            onClick={() => setTab(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {tab === "hospital" ? (
        <div style={columns}>
          <section className="panel">
            <h2>医院基本资料</h2>
            {[
              ["name", "中心名称"],
              ["intro", "中心介绍"],
              ["address", "演示地址"],
              ["hotline", "演示热线"],
              ["hours", "服务时间"],
            ].map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                {key === "intro" ? (
                  <textarea
                    value={draft[key as keyof typeof draft]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    value={draft[key as keyof typeof draft]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
            <button className="btn btn-primary" onClick={save}>
              保存医院演示配置
            </button>
            {error && <Notice error>{error}</Notice>}
            {notice && <Notice>{notice}</Notice>}
          </section>
          <section className="panel">
            <Badge>患者端草稿预览</Badge>
            <h2 style={{ marginTop: 20 }}>{draft.name}</h2>
            <p>{draft.intro}</p>
            <div className="callout">
              <div>
                <strong>{draft.address}</strong>
                <p>
                  服务时间：{draft.hours}
                  <br />
                  演示热线：{draft.hotline}
                </p>
              </div>
            </div>
            <p>预览随编辑更新，保存后才能保留。热线为不可拨打的演示标识。</p>
            <a className="link-btn" href="#/patient">
              打开患者端演示
            </a>
          </section>
        </div>
      ) : (
        spec && <RecordWorkspace key={spec.key} spec={spec} />
      )}
    </>
  );
}

function PasswordDemo() {
  const { state, act } = useDemo();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const strong =
    next.length >= 12 &&
    /[a-z]/.test(next) &&
    /[A-Z]/.test(next) &&
    /\d/.test(next) &&
    /[^A-Za-z\d]/.test(next);
  const save = () => {
    setNotice("");
    if (current !== "DEMO-OLD") {
      setError("当前模拟口令应为固定值 DEMO-OLD。");
      return;
    }
    if (!next.startsWith("DEMO-") || !strong) {
      setError(
        "新模拟口令必须以 DEMO- 开头，至少 12 位，含大小写字母、数字和符号。",
      );
      return;
    }
    if (next !== repeat) {
      setError("两次输入的新模拟口令不一致。");
      return;
    }
    act({
      type: "UPDATE_CONFIG",
      payload: {
        passwordDemoChanged: true,
        passwordDemoStrength: "强（演示规则）",
        passwordDemoChangedAt: new Date().toISOString(),
      },
    });
    act({
      type: "ADD_AUDIT",
      payload: {
        message:
          "完成本地密码修改演练：校验通过，输入值已清空；未保存或修改任何真实凭据。",
      },
    });
    setCurrent("");
    setNext("");
    setRepeat("");
    setError("");
    setNotice(
      "演练通过，全部输入已清空。仅保存完成标志与强度，不保存口令，也不改变登录权限。",
    );
  };
  return (
    <div style={columns}>
      <section className="panel">
        <h2>密码修改演练</h2>
        <p>
          只输入 DEMO 测试字符串，切勿输入真实密码。当前模拟口令固定为
          DEMO-OLD，每次演练都使用此值。
        </p>
        <label className="field">
          当前模拟口令
          <input
            type="password"
            autoComplete="off"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="field">
          新模拟口令
          <input
            type="password"
            autoComplete="off"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <small>DEMO- 开头；至少 12 位；大小写字母、数字、符号均必需。</small>
        <p>
          校验强度：
          <Badge tone={strong ? "green" : "amber"}>
            {!next ? "尚未输入" : strong ? "强" : "未达标"}
          </Badge>
        </p>
        <label className="field">
          再次输入新模拟口令
          <input
            type="password"
            autoComplete="off"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" onClick={save}>
          <KeyRound size={14} />
          完成密码修改演练
        </button>
        {error && <Notice error>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
      </section>
      <section className="panel">
        <ShieldCheck size={36} color="#277c68" />
        <h2>凭据安全边界</h2>
        <p>
          未接入身份认证系统，不执行真实密码修改或网络请求。输入仅在当前表单内存中校验，通过后立即清空。
        </p>
        <p>
          本地记录：
          {state.config.passwordDemoChanged ? "已完成演练" : "尚未完成演练"}
        </p>
        {state.config.passwordDemoChanged && (
          <p>
            {state.config.passwordDemoStrength} ·{" "}
            {dateTime(state.config.passwordDemoChangedAt)}
          </p>
        )}
        <Banner>
          本模块不承担真实密码策略、安全存储、会话管理或账号认证职责。
        </Banner>
      </section>
    </div>
  );
}

const tabs = [
  { id: "notifications", label: "通知工作台", icon: Bell },
  { id: "identity", label: "替检核验", icon: Fingerprint },
  { id: "signatures", label: "签名档案", icon: PenLine },
  { id: "rejections", label: "驳回质控", icon: ShieldCheck },
  { id: "portal", label: "门户与导检配置", icon: Smartphone },
  { id: "password", label: "密码演练", icon: KeyRound },
];
export default function ControlCenter({ section }: { section?: string }) {
  const [tab, setTab] = useState(
    tabs.some((t) => t.id === section) ? section! : "notifications",
  );
  return (
    <div className="ops-page">
      <PageTitle
        eyebrow="QUALITY & SERVICE CONTROL"
        title="服务与质控中心"
        description="通知留痕 · 人工核验 · 签名样本 · 本地配置"
        actions={
          <Badge>
            <CheckCircle2 size={12} /> 合成数据演示
          </Badge>
        }
      />
      <Banner>
        所有操作均为本地前端演示：不真实发送消息、不采集生物信息、不生成有效签名、不修改真实认证信息。
      </Banner>
      <div className="ops-tabbar" role="tablist" aria-label="服务与质控中心">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            <t.icon
              size={14}
              style={{ verticalAlign: "middle", marginRight: 6 }}
            />
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "notifications" && <Notifications />}
        {tab === "identity" && <IdentityQuality />}
        {tab === "signatures" && <Signatures />}
        {tab === "rejections" && <RejectionQuality />}
        {tab === "portal" && <PortalConfiguration />}
        {tab === "password" && <PasswordDemo />}
      </div>
    </div>
  );
}
