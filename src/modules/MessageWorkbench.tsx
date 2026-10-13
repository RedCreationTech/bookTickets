import { useRef, useState } from "react";
import { useDemo } from "../store";

function Conversation({
  patientId,
  staff = false,
}: {
  patientId: string;
  staff?: boolean;
}) {
  const { state, act } = useDemo();
  const [draft, setDraft] = useState(""),
    [phase, setPhase] = useState("检前"),
    [notice, setNotice] = useState("");
  const sent = useRef(false);
  const patient = state.patients.find((p) => p.id === patientId);
  const rows = (state.records.patientMessages || [])
    .filter((row) => row.patientId === patientId)
    .sort(
      (a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt)) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const submit = () => {
    if (sent.current || !patient || !draft.trim()) return;
    if (draft.trim().length > 1000) {
      setNotice("留言最多1000字。");
      return;
    }
    sent.current = true;
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "patientMessages",
        record: {
          id: `MSG-${crypto.randomUUID()}`,
          patientId,
          author: staff ? "staff" : "patient",
          authorName: staff ? "体检中心演示服务员" : patient.name,
          phase,
          body: draft.trim(),
          createdAt: new Date().toISOString(),
        },
      },
    });
    if (!staff)
      act({
        type: "ADD_TASK",
        payload: {
          title: `H5 留言：${draft.trim()}`,
          patientId,
          status: "待处理",
        },
      });
    setDraft("");
    setNotice(
      staff
        ? "回复已保存在共享会话，患者端可查看。"
        : "留言已保存在共享会话，等待体检中心回复。",
    );
  };
  return (
    <section aria-label={staff ? "服务台共享会话" : "患者共享会话"}>
      <p className="muted">
        本浏览器合成留言会话。不要输入真实身份或健康敏感资料；不发送短信/微信。
      </p>
      {rows.length ? (
        rows.map((row) => (
          <article
            className="panel"
            key={row.id}
            style={{
              margin: "10px 0",
              padding: 14,
              background: row.author === "staff" ? "#edf8f5" : undefined,
            }}
          >
            <b>
              {row.author === "staff" ? "体检中心回复" : "患者留言"} ·{" "}
              {row.phase}
            </b>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {row.body}
            </p>
            <small>
              {row.authorName} ·{" "}
              {String(row.createdAt).replace("T", " ").slice(0, 19)}
            </small>
          </article>
        ))
      ) : (
        <p>暂无留言。发送后可在本会话查看工作人员回复。</p>
      )}
      <label>
        留言阶段
        <select value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option>检前</option>
          <option>检中</option>
        </select>
      </label>
      <label>
        {staff ? "回复内容" : "留言内容"}
        <textarea
          value={draft}
          rows={4}
          maxLength={1000}
          onChange={(e) => {
            sent.current = false;
            setDraft(e.target.value);
          }}
          placeholder="请填写合成演示内容"
        />
      </label>
      <div className="actions">
        <button
          className="btn btn-primary"
          disabled={!patient || !draft.trim()}
          onClick={submit}
        >
          {staff ? "发送回复" : "提交留言"}
        </button>
        <button
          className="btn"
          onClick={() => {
            setDraft("");
            sent.current = false;
            setNotice("草稿已取消，没有发送。");
          }}
        >
          取消草稿
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function PatientConversation({ patientId }: { patientId: string }) {
  return <Conversation key={patientId} patientId={patientId} />;
}
export default function MessageWorkbench() {
  const { state } = useDemo();
  const [selected, setSelected] = useState(state.patients[0]?.id || "");
  const patientId = state.patients.some((p) => p.id === selected)
    ? selected
    : state.patients[0]?.id || "";
  return (
    <section className="panel">
      <h3>患者留言与中心回复</h3>
      <label>
        会话体检人
        <select value={patientId} onChange={(e) => setSelected(e.target.value)}>
          {state.patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ·{" "}
              {
                (state.records.patientMessages || []).filter(
                  (r) => r.patientId === p.id,
                ).length
              }{" "}
              条
            </option>
          ))}
        </select>
      </label>
      <Conversation key={patientId} patientId={patientId} staff />
    </section>
  );
}
