import { useRef, useState } from "react";
import { useDemo } from "../store";
import { Modal } from "../ui";
import {
  businessAutomationRules,
  canManageBusinessAutomation,
  previewBusinessClock,
  sortByRisk,
} from "./queueAutomationRules";

export function FollowupDatePlanner() {
  const { state, act } = useDemo();
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [notice, setNotice] = useState("");
  const tasks = sortByRisk(
    state,
    state.tasks.filter((t) => ["待处理", "进行中"].includes(t.status)),
  );
  const task = tasks.find((t) => t.id === selected);
  const locked =
    !!task?.locked ||
    (state.records.followupLocks || []).some(
      (l) => l.patientId === task?.patientId && l.status === "locked",
    );
  return (
    <section className="panel">
      <h3>下次回访日期与到期提醒</h3>
      <div className="form-grid">
        <label>
          待回访任务
          <select
            aria-label="到期提醒任务"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              const t = tasks.find((t) => t.id === e.target.value);
              setDate(t?.nextVisitDate || t?.date || "");
              setNotice("");
            }}
          >
            <option value="">请选择任务</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.risk} · {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          下次回访日期
          <input
            type="date"
            aria-label="下次回访日期"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn"
        disabled={
          !task || !date || locked || !canManageBusinessAutomation(state)
        }
        onClick={() => {
          act({
            type: "AUTOMATION_SET_FOLLOWUP_DATE",
            payload: { id: selected, date },
          });
          setNotice(
            "已提交下次回访日期；推进下方演示时钟至该日期可生成一次到期提醒。",
          );
        }}
      >
        保存下次回访日期
      </button>
      {locked && (
        <p role="alert">此任务或客户已锁定，请由授权人员解除锁定后更改日期。</p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="muted">
        开放任务按
        A、B、C、D/低风险稳定排序；到期未完成任务会生成一条本地站内提醒，已完成/已取消任务不触发。
      </p>
    </section>
  );
}
export function RiskSortedOrders() {
  const { state } = useDemo();
  const rows = sortByRisk(
    state,
    state.appointments.filter((a) => a.status !== "cancelled"),
  );
  return (
    <section className="panel">
      <h3>按异常等级排序的体检订单</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>体检号</th>
              <th>合成客户</th>
              <th>最高异常等级</th>
              <th>来源异常</th>
              <th>关联随访</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const alerts = (state.records.alerts || []).filter(
                (r) => r.appointmentId === a.id,
              );
              const risk =
                sortByRisk(state, alerts)[0]?.risk ||
                state.patients.find((p) => p.id === a.patientId)?.risk ||
                "未登记";
              return (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>
                    {state.patients.find((p) => p.id === a.patientId)?.name}
                  </td>
                  <td>{risk}</td>
                  <td>
                    {alerts.map((r) => r.title).join("、") || "无异常事件"}
                  </td>
                  <td>
                    {state.tasks.filter((t) => t.appointmentId === a.id).length}{" "}
                    项
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function BusinessAutomationPanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { state, act } = useDemo();
  const [rules, setRules] = useState(() => businessAutomationRules(state));
  const [clock, setClock] = useState(() =>
    String(
      state.config.businessAutomationClock ||
        state.config.notificationClock ||
        new Date().toISOString(),
    ).slice(0, 16),
  );
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<any>(null);
  const planSequence = useRef(0);
  const [handling, setHandling] = useState<any>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("全部");
  const canManage = canManageBusinessAutomation(state);
  const iso = `${clock}:00Z`;
  const candidates = previewBusinessClock(state, iso);
  const rows = state.records.businessNotifications || [];
  const plans = state.records.recheckPlans || [];
  const order = state.appointments.find((a) => a.id === plan?.appointmentId);
  const orderLocked = (state.records.followupLocks || []).some(
    (l) => l.patientId === order?.patientId && l.status === "locked",
  );
  const newPlan = () => {
    let id = `RECHECK-${Date.now().toString(36)}-${++planSequence.current}`;
    while (plans.some((p) => p.id === id)) id += `-${++planSequence.current}`;
    setPlan({
      id,
      appointmentId:
        state.appointments.find((a) => a.status !== "cancelled")?.id || "",
      date: "",
      time: "09:00",
      items: [],
    });
  };
  return (
    <section className="panel" aria-label="业务事件通知与随访自动化">
      <h2>业务事件通知与随访自动化</h2>
      <p className="muted">
        仅合成数据和本地模拟送达。新业务事件即刻生成；检前、复查与随访须显式推进演示时钟，无后台调度、真实短信或医疗建议。
      </p>
      {!canManage && (
        <p role="alert">当前角色只读，无法修改规则、计划和通知状态。</p>
      )}
      <details open={!compact}>
        <summary>自动触发规则与等级范围</summary>
        <div className="form-grid">
          {(
            [
              ["appointment", "预约成功提示"],
              ["checkin", "体检到检/完成提示"],
              ["report", "报告可领取提示"],
              ["preExam", "检前一天短信提醒"],
              ["recheck", "复查项目日期提醒"],
              ["followupDue", "随访到期站内提醒"],
              ["abnormalSms", "新异常自动模拟短信"],
              ["autoFollowup", "新异常自动建立随访任务"],
            ] as const
          ).map(([key, label]) => (
            <label className="check-line" key={key}>
              <input
                type="checkbox"
                checked={!!rules[key]}
                disabled={!canManage}
                onChange={(e) =>
                  setRules({ ...rules, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <fieldset>
          <legend>异常短信及自动随访命中等级</legend>
          {["A类", "B类", "C类", "D类", "低风险"].map((r) => (
            <label className="check-line" key={r}>
              <input
                type="checkbox"
                checked={rules.risks.includes(r)}
                disabled={!canManage}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    risks: e.target.checked
                      ? [...rules.risks, r]
                      : rules.risks.filter((x: string) => x !== r),
                  })
                }
              />
              {r}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label>
            自动随访延后天数
            <input
              type="number"
              min="0"
              max="365"
              value={rules.followupDelayDays}
              onChange={(e) =>
                setRules({
                  ...rules,
                  followupDelayDays: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            体检注意事项
            <textarea
              maxLength={500}
              value={rules.precautions}
              onChange={(e) =>
                setRules({ ...rules, precautions: e.target.value })
              }
            />
          </label>
        </div>
        <button
          className="btn"
          disabled={!canManage}
          onClick={() => {
            if (
              !rules.precautions.trim() ||
              !Number.isInteger(rules.followupDelayDays) ||
              rules.followupDelayDays < 0 ||
              rules.followupDelayDays > 365
            ) {
              setMessage("注意事项必填，随访延后天数须为 0–365 整数。");
              return;
            }
            act({ type: "AUTOMATION_CONFIGURE", payload: { rules } });
            setMessage(
              "自动规则已保存，仅新异常事件触发；相同异常不会重复建任务，锁定对象显示等待解锁。",
            );
          }}
        >
          保存业务事件自动规则
        </button>
      </details>
      <div className="form-grid">
        <label>
          业务提醒演示时钟（UTC）
          <input
            type="datetime-local"
            value={clock}
            onChange={(e) => {
              setClock(e.target.value);
              setPreview(false);
            }}
          />
        </label>
      </div>
      <button
        className="btn"
        disabled={!canManage}
        onClick={() => {
          if (!Number.isFinite(Date.parse(iso))) {
            setMessage("请填写有效日期时间。");
            return;
          }
          setPreview(true);
        }}
      >
        预览检前、复查和随访提醒
      </button>
      <p>
        当前已保存时钟：{state.config.businessAutomationClock || "尚未扫描"}
      </p>
      {message && <p role="status">{message}</p>}
      <h3>具体项目复查计划</h3>
      <button className="btn" disabled={!canManage} onClick={newPlan}>
        建立复查项目时间计划
      </button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>体检号</th>
              <th>复查项目</th>
              <th>日期/时段</th>
              <th>状态/版本</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.appointmentId}</td>
                <td>{p.items.join("、")}</td>
                <td>
                  {p.date} {p.time}
                </td>
                <td>
                  {p.status} · v{p.revision}
                </td>
                <td>
                  <button
                    className="text-btn"
                    disabled={!canManage || p.status !== "已计划"}
                    onClick={() => setPlan({ ...p })}
                  >
                    修改复查计划
                  </button>
                  <button
                    className="text-btn"
                    disabled={!canManage || p.status !== "已计划"}
                    onClick={() => {
                      act({
                        type: "AUTOMATION_CANCEL_RECHECK",
                        payload: { id: p.id },
                      });
                      setMessage("已提交取消复查计划；原日期不再生成提醒。");
                    }}
                  >
                    取消复查计划
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!plans.length && <p>尚未建立项目复查计划。</p>}
      <FollowupDatePlanner />
      <h3>本地事件记录 · {rows.length} 条</h3>
      <label>
        筛选业务提醒类型
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option>全部</option>
          {[...new Set(rows.map((r) => r.kind))].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>对象/来源</th>
              <th>模板/内容</th>
              <th>送达与处理</th>
              <th>动作</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => kind === "全部" || r.kind === kind)
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.patientName}
                    <br />
                    {r.appointmentId || r.taskId}
                    <br />
                    {r.sourceId}
                  </td>
                  <td>
                    {r.kind}
                    <p>{r.content}</p>
                    <small>
                      {r.at} · {r.channel}
                    </small>
                  </td>
                  <td>
                    {r.deliveryStatus} / {r.status}
                    {r.withdrawReason && <p>{r.withdrawReason}</p>}
                    {r.note && <p>{r.note}</p>}
                  </td>
                  <td>
                    <button
                      className="text-btn"
                      disabled={!canManage || r.status !== "未读"}
                      onClick={() =>
                        act({
                          type: "AUTOMATION_MARK_NOTICE",
                          payload: { id: r.id, status: "已读" },
                        })
                      }
                    >
                      标记已读 {r.kind}
                    </button>
                    <button
                      className="text-btn"
                      disabled={
                        !canManage || ["已处理", "已撤销"].includes(r.status)
                      }
                      onClick={() => {
                        setHandling(r);
                        setNote("");
                      }}
                    >
                      登记处理 {r.kind}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p>
          尚无业务事件通知。预约、到检、异常及审核成功后会按规则产生可追溯本地记录。
        </p>
      )}
      {(state.records.automationDeferred || [])
        .filter((r) => r.status === "等待解锁")
        .map((r) => (
          <p role="status" key={r.id}>
            自动随访等待解锁：{r.appointmentId} · {r.sourceId} · {r.reason}
          </p>
        ))}
      {preview && (
        <Modal title="业务时钟提醒预览" onClose={() => setPreview(false)}>
          <p>
            {clock.replace("T", " ")} UTC：新增 {candidates.length}{" "}
            条，已生成事件会被去重。检前匹配下一天；复查只匹配目标日期；随访包含到期未处理任务。
          </p>
          {candidates.map((r) => (
            <article className="callout" key={r.id}>
              <div>
                <strong>
                  {r.kind} · {r.patientName}
                </strong>
                <p>{r.content}</p>
              </div>
            </article>
          ))}
          <div className="modal-actions">
            <button className="btn" onClick={() => setPreview(false)}>
              取消预览
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                act({ type: "AUTOMATION_SCAN", payload: { clock: iso } });
                setPreview(false);
                setMessage(
                  `已推进演示时钟至 ${clock.replace("T", " ")} UTC 并扫描；仅本地记录，重复扫描不重发。`,
                );
              }}
            >
              推进时钟并生成本地提醒
            </button>
          </div>
        </Modal>
      )}
      {plan && (
        <Modal title="复查项目时间计划" onClose={() => setPlan(null)}>
          <div className="form-grid">
            <label>
              复查体检订单
              <select
                value={plan.appointmentId}
                disabled={!!plan.revision}
                onChange={(e) =>
                  setPlan({ ...plan, appointmentId: e.target.value, items: [] })
                }
              >
                {state.appointments
                  .filter((a) => a.status !== "cancelled")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} ·{" "}
                      {state.patients.find((p) => p.id === a.patientId)?.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              复查日期
              <input
                type="date"
                value={plan.date}
                onChange={(e) => setPlan({ ...plan, date: e.target.value })}
              />
            </label>
            <label>
              复查时间
              <input
                type="time"
                value={plan.time}
                onChange={(e) => setPlan({ ...plan, time: e.target.value })}
              />
            </label>
          </div>
          <fieldset>
            <legend>本次复查项目</legend>
            {order?.items.map((item) => (
              <label className="check-line" key={item}>
                <input
                  type="checkbox"
                  checked={plan.items.includes(item)}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      items: e.target.checked
                        ? [...plan.items, item]
                        : plan.items.filter((x: string) => x !== item),
                    })
                  }
                />
                {item}
              </label>
            ))}
          </fieldset>
          {orderLocked && (
            <p role="alert">客户随访已锁定，不能变更复查计划。</p>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => setPlan(null)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={
                !plan.date || !plan.items.length || !order || orderLocked
              }
              onClick={() => {
                act({ type: "AUTOMATION_PLAN_RECHECK", payload: plan });
                setPlan(null);
                setMessage(
                  "复查计划已提交；修改计划会撤销旧版本提醒，到达新日期才生成新提醒。",
                );
              }}
            >
              保存复查项目与日期
            </button>
          </div>
        </Modal>
      )}
      {handling && (
        <Modal title="登记本地提醒处理" onClose={() => setHandling(null)}>
          <p>{handling.content}</p>
          <label>
            处理记录
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="仅输入合成处理记录"
            />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setHandling(null)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={!note.trim()}
              onClick={() => {
                act({
                  type: "AUTOMATION_MARK_NOTICE",
                  payload: { id: handling.id, status: "已处理", note },
                });
                setHandling(null);
              }}
            >
              确认已处理
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
