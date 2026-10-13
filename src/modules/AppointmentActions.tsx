import { useRef, useState } from "react";
import { useDemo } from "../store";
import type { Appointment } from "../model";
import { Badge } from "../ui";
export function AppointmentActions({
  appointment,
}: {
  appointment: Appointment;
}) {
  const { state, act } = useDemo(),
    a = appointment,
    p = state.patients.find((p) => p.id === a.patientId);
  const [message, setMessage] = useState(
      "请按预约日期到院，以上为合成演示提醒。",
    ),
    [done, setDone] = useState("");
  const busy = useRef(false);
  if (!p) return null;
  return (
    <section className="panel">
      <h3>当前预约人员操作</h3>
      <p>
        {p.name} · {a.id} · <Badge>{a.source || "未记录来源"}</Badge>{" "}
        {p.blacklisted && <Badge tone="red">预约黑名单</Badge>}
      </p>
      <div className="actions">
        <button
          className="btn"
          onClick={() =>
            act({
              type: "UPSERT_PATIENT",
              payload: { ...p, blacklisted: !p.blacklisted },
            })
          }
        >
          {p.blacklisted ? "解除预约黑名单" : "设置预约黑名单"}
        </button>
        <button
          className="btn"
          onClick={() =>
            document
              .getElementById("appointment-audit-" + a.id)
              ?.scrollIntoView({ block: "nearest" })
          }
        >
          查看本单预约日志
        </button>
      </div>
      <label>
        本地短信演练内容
        <textarea
          aria-label="本单通知内容"
          value={message}
          onChange={(e) => {
            busy.current = false;
            setMessage(e.target.value);
          }}
        />
      </label>
      <button
        className="btn"
        disabled={!message.trim()}
        onClick={() => {
          if (busy.current) return;
          busy.current = true;
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "messages",
              record: {
                id: "APPT-SMS-" + a.id + "-" + Date.now(),
                appointmentId: a.id,
                patientId: p.id,
                type: "预约短信",
                title: "预约提醒",
                content: message,
                body: message,
                status: "本地模拟已发送",
                channel: "短信模拟",
                at: new Date().toISOString(),
              },
            },
          });
          setDone("仅本地记录已保存，未发送真实短信");
        }}
      >
        为当前预约模拟发送通知
      </button>
      {done && <p role="status">{done}</p>}
      <AppointmentAudit appointment={a} />
    </section>
  );
}
export function AppointmentAudit({
  appointment: a,
}: {
  appointment: Appointment;
}) {
  const { state } = useDemo();
  const rows = state.audit
    .filter(
      (r) =>
        r.entity === a.id ||
        (r.entity as any)?.appointmentId === a.id ||
        r.before?.id === a.id ||
        r.after?.id === a.id,
    )
    .slice()
    .reverse();
  return (
    <details id={"appointment-audit-" + a.id}>
      <summary>本单预约全程日志 · {a.id}</summary>
      <p>
        来源：{a.source || "未记录"}；建立：{a.createdAt || "历史种子未记时间"}
        ；预约：{a.date} {a.time}
      </p>
      <p>
        问卷：
        {a.questionnaireAnswers
          ? JSON.stringify(a.questionnaireAnswers)
          : "此订单未存问卷回答"}
        ；检前史：{JSON.stringify(a.preExamHistory || "未记录")}
      </p>
      <p>
        系统推荐：
        {(a.recommendedItems || a.recommendations || []).join?.("、") ||
          "未保存推荐快照"}
        ；最终选择：{a.items.join("、")}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间 / 动作</th>
              <th>方式 / 日期变更</th>
              <th>原选择 → 新选择</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.time}
                  <small>
                    {r.action} · {r.message}
                  </small>
                </td>
                <td>
                  {r.after?.source || r.before?.source || a.source}
                  <small>
                    {r.before?.date || "—"} → {r.after?.date || "—"}
                  </small>
                </td>
                <td>
                  {r.before?.items?.join("、") || "—"} →{" "}
                  {r.after?.items?.join("、") || "—"}
                  {r.after?.questionnaireAnswers && (
                    <p>
                      问卷快照：{JSON.stringify(r.after.questionnaireAnswers)}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
