import { useRef, useState } from "react";
import { useDemo } from "../store";
import { Modal } from "../ui";
const consentTypes = [
  "弃拍确认",
  "弃检签字",
  "知情书签字",
  "检查结束签字",
  "职业病签字",
];
export function RegistrationConsents({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { state, act } = useDemo();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(consentTypes[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [mark, setMark] = useState("DEMO · 演示留样 A");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const order = state.appointments.find((a) => a.id === appointmentId);
  if (!order) return null;
  const records = (state.records.registrationConsents || []).filter(
    (r) => r.appointmentId === appointmentId,
  );
  const disabled = order.locked || order.status === "cancelled";
  const save = () => {
    if (busy.current) return;
    if (disabled) return setError("已锁定或取消的订单不能新增确认");
    if (!confirmed) return setError("请确认仅为合成签署演练");
    if (records.some((r) => r.kind === kind))
      return setError("本类型已有确认留样，请查看原记录");
    busy.current = true;
    const id = "CONSENT-" + appointmentId + "-" + kind;
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "registrationConsents",
        record: {
          id,
          appointmentId,
          patientId: order.patientId,
          kind,
          mark,
          at: new Date().toISOString(),
          actor: state.config.role,
          status: "已确认",
          synthetic: true,
        },
      },
    });
    if (kind === "弃拍确认")
      act({
        type: "UPDATE_APPOINTMENT",
        payload: {
          id: appointmentId,
          photoDeclined: true,
          photoDeclineSignatureId: id,
        },
      });
    setOpen(false);
  };
  return (
    <section
      className="panel"
      style={{ padding: 16, marginTop: 18 }}
      aria-label="登记确认与多类型签署"
    >
      <h3>登记确认与多类型签署</h3>
      <p className="muted">
        只用固定 DEMO
        留样。无真实签字板、法律签章或生物信息采集；签署不会代替检查、弃检办理或推进审核。
      </p>
      <button
        className="btn"
        disabled={disabled}
        onClick={() => {
          busy.current = false;
          setConfirmed(false);
          setError("");
          setOpen(true);
        }}
      >
        新建演示签署
      </button>
      {order.photoDeclined && <p>本订单已登记弃拍，原确认仍可回看。</p>}
      {records.map((r) => (
        <details key={r.id}>
          <summary>
            {r.kind} · {r.at}
          </summary>
          <p>
            {r.mark} · {r.actor} · 合成留样
          </p>
        </details>
      ))}
      {open && (
        <Modal title="演示签署确认" onClose={() => setOpen(false)}>
          <label>
            签署类型
            <select
              aria-label="签署类型"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setConfirmed(false);
                setError("");
              }}
            >
              {consentTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            合成留样
            <select
              aria-label="合成留样"
              value={mark}
              onChange={(e) => setMark(e.target.value)}
            >
              <option>DEMO · 演示留样 A</option>
              <option>DEMO · 演示留样 B</option>
            </select>
          </label>
          <div className="notice">
            {kind === "弃拍确认"
              ? "确认本合成客户本次放弃拍照，保存原因类型与演示签字记录。"
              : "仅记录本类型的人工确认留样，不据此生成或改变临床检查结果。"}
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我确认这是合成签署演练，不输入真实签名
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button className="btn" onClick={() => setOpen(false)}>
              取消签署
            </button>
            <button className="btn btn-primary" onClick={save}>
              确认保存演示留样
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function PastHistoryNotice({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { state, act } = useDemo();
  const busy = useRef(false);
  const order = state.appointments.find((a) => a.id === appointmentId);
  const patient = state.patients.find((p) => p.id === order?.patientId);
  const history = patient?.pastMedicalHistory;
  if (!order || !history) return null;
  const read = (state.records.medicalHistoryReads || []).find(
    (r) => r.appointmentId === appointmentId && r.history === history,
  );
  return (
    <section className="notice" aria-label="分检既往史提醒">
      <strong>请先核对自定义既往史</strong>
      <p>{history}</p>
      <p>来源：合成登记资料；供演示医生人工核对，不自动推导医学结论。</p>
      <button
        className="btn"
        disabled={Boolean(read)}
        onClick={() => {
          if (busy.current || read) return;
          busy.current = true;
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "medicalHistoryReads",
              record: {
                id: "HISTORY-" + appointmentId,
                appointmentId,
                patientId: order.patientId,
                history,
                actor: state.config.role,
                at: new Date().toISOString(),
              },
            },
          });
        }}
      >
        {read ? "已阅读本版既往史" : "确认已阅读既往史"}
      </button>
    </section>
  );
}
