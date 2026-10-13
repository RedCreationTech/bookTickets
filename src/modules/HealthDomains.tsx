import { useRef, useState } from "react";
import { useDemo, today } from "../store";
import type { Row } from "./Operations";
import { wouldCreateCycle } from "./AdminDomains";
const uid = (prefix: string) => prefix + "-" + crypto.randomUUID();
export function LocalMessages({
  patientId,
  sentOnly = false,
}: {
  patientId?: string;
  sentOnly?: boolean;
}) {
  const { state, act } = useDemo();
  const [selected, setSelected] = useState(
    patientId || state.patients[0]?.id || "",
  );
  const current = patientId || selected;
  const person = state.patients.find((p) => p.id === current);
  const [channel, setChannel] = useState("短信");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("健康服务通知（合成）");
  const [preview, setPreview] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const submitted = useRef(false);
  const rows = (state.records.localMessages || []).filter(
    (m) =>
      m.patientId === current &&
      m.channel === channel &&
      (!sentOnly || (m.status === "已模拟发送" && m.simulated === true)),
  );
  const save = (record: Row) =>
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "localMessages", record },
    });
  const draft = () => ({
    id: uid("MESSAGE"),
    patientId: current,
    recipientName: person?.name,
    destination:
      channel === "邮件"
        ? `${current.toLowerCase()}@demo.invalid`
        : person?.phone,
    channel,
    title: title.trim(),
    body: body.trim(),
    createdAt: new Date().toISOString(),
    status: "草稿",
  });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>{sentOnly ? "已模拟发送日志" : "当前客户消息工作台"}</h2>
      <p>
        只有明确确认后的本地模拟发送会进入已发记录；不外发短信或邮件。示例地址使用
        demo.invalid。
      </p>
      <div className="actions">
        <select
          aria-label="消息渠道"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option>短信</option>
          <option>邮件</option>
        </select>
        {!patientId && (
          <select
            aria-label="消息接收客户"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {state.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!sentOnly && (
        <>
          <label>
            主题
            <input
              aria-label="本地消息主题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            正文
            <textarea
              aria-label="本地消息正文"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                if (!body.trim() || !title.trim() || !person)
                  return setNotice("对象、主题、正文不能为空");
                save(draft());
                setNotice("已保存草稿，未模拟发送");
              }}
            >
              保存消息草稿
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!body.trim() || !title.trim() || !person)
                  return setNotice("对象、主题、正文不能为空");
                submitted.current = false;
                setPreview(draft());
              }}
            >
              预览本地发送
            </button>
          </div>
        </>
      )}
      <table aria-label="本地消息日志">
        <thead>
          <tr>
            <th>接收对象 / 渠道</th>
            <th>主题 / 正文</th>
            <th>时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>
                {m.recipientName} / {m.channel}
                <small>{m.destination}</small>
              </td>
              <td>
                {m.title}
                <small>{m.body}</small>
              </td>
              <td>{m.sentAt || m.createdAt}</td>
              <td>{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-label="确认本地消息"
          >
            <div style={{ padding: 24 }}>
              <h3>
                {preview.channel} · {preview.recipientName}
              </h3>
              <p>{preview.destination}</p>
              <b>{preview.title}</b>
              <p>{preview.body}</p>
              <button className="btn" onClick={() => setPreview(null)}>
                取消发送
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (submitted.current) return;
                  submitted.current = true;
                  const sentAt = new Date().toISOString();
                  save({
                    ...preview,
                    status: "已模拟发送",
                    simulated: true,
                    sentAt,
                    result: "本地回执已生成，无外部投递",
                  });
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "controlNotifications",
                      record: {
                        id: "LOCAL-" + preview.id,
                        patientId: preview.patientId,
                        title: preview.title,
                        body: preview.body,
                        channel: preview.channel,
                        status: "本地模拟已记录",
                        createdAt: sentAt,
                        sourceMessageId: preview.id,
                      },
                    },
                  });
                  setPreview(null);
                  setNotice("已模拟发送，结果已保存到本地通知与发送日志。");
                }}
              >
                确认模拟发送
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
export function FamilyRelations({
  patientId,
  onOpenPatient,
}: {
  patientId?: string;
  onOpenPatient?: (id: string) => void;
}) {
  const { state, act } = useDemo();
  const families = state.records.families || [];
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>(
    patientId ? [patientId] : [],
  );
  const [notice, setNotice] = useState("");
  const visible = families.filter(
    (f) => !patientId || (f.memberIds || []).includes(patientId),
  );
  const save = (record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection: "families", record } });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>家庭账户成员关系</h2>
      <p>
        关联已有合成患者 ID；移除家庭关系不删除个人档案，不建立真实共享授权。
      </p>
      <input
        aria-label="家庭账户名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="actions">
        {state.patients.map((p) => (
          <label key={p.id}>
            <input
              aria-label={`家庭成员 ${p.id}`}
              type="checkbox"
              checked={members.includes(p.id)}
              onChange={(e) =>
                setMembers(
                  e.target.checked
                    ? [...members, p.id]
                    : members.filter((x) => x !== p.id),
                )
              }
            />
            {p.name}
          </label>
        ))}
      </div>
      <button
        className="btn"
        onClick={() => {
          if (!name.trim() || members.length < 2)
            return setNotice("家庭名称及至少两名成员为必填");
          const old = families.find((f) => f.name === name.trim());
          save({
            id: old?.id || uid("FAMILY"),
            name: name.trim(),
            memberIds: [...new Set(members)],
            patientIds: [...new Set(members)],
            status: "已启用",
          });
          setNotice("家庭成员关系已保存");
        }}
      >
        保存家庭成员关系
      </button>
      {visible.map((f) => (
        <div key={f.id}>
          <h3>{f.name}</h3>
          {(f.memberIds || []).map((pid: string) => (
            <div className="actions" key={pid}>
              <span>
                {state.patients.find((p) => p.id === pid)?.name || "不可见成员"}
              </span>
              {onOpenPatient && state.patients.some((p) => p.id === pid) && (
                <button className="btn" onClick={() => onOpenPatient(pid)}>
                  查看成员档案 {pid}
                </button>
              )}
              <button
                className="btn"
                onClick={() =>
                  save({
                    ...f,
                    memberIds: f.memberIds.filter((x: string) => x !== pid),
                    patientIds: f.memberIds.filter((x: string) => x !== pid),
                  })
                }
              >
                移除家庭成员 {pid}
              </button>
            </div>
          ))}
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function CompanyHierarchy() {
  const { state, act } = useDemo();
  const units = state.records.companyUnits || [];
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>单位与子单位 ID 层级</h2>
      <div className="actions">
        <select
          aria-label="维护单位"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const r = units.find((u) => u.id === e.target.value);
            setName(r?.name || "");
            setParentId(r?.parentId || "");
          }}
        >
          <option value="">新建单位</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          aria-label="层级单位名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label="上级单位ID"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">无上级</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            const nodeId = selected || uid("UNIT");
            if (!name.trim() || wouldCreateCycle(units, nodeId, parentId))
              return setNotice("名称不能为空，且上级不能为自身或子孙");
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "companyUnits",
                record: {
                  ...units.find((u) => u.id === nodeId),
                  id: nodeId,
                  name: name.trim(),
                  parentId,
                  status: "已启用",
                },
              },
            });
            setSelected(nodeId);
            setNotice("层级已保存，关联使用稳定 ID");
          }}
        >
          保存单位层级
        </button>
      </div>
      <table aria-label="单位层级关系">
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <td>
                {u.name}
                <small>{u.id}</small>
              </td>
              <td>
                上级：
                {units.find((p) => p.id === u.parentId)?.name || "无 / 未登记"}
              </td>
              <td>
                子单位：
                {units
                  .filter((p) => p.parentId === u.id)
                  .map((p) => p.name)
                  .join("、") || "无"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function DoctorTeamRelations() {
  const { state, act } = useDemo();
  const staff = state.records.staff || [];
  const teams = state.records.doctorTeams || [];
  const [account, setAccount] = useState(
    state.config.demoAccountId || "admin-demo",
  );
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [activity, setActivity] = useState("");
  const [capacity, setCapacity] = useState(10);
  const [notice, setNotice] = useState("");
  const mine = teams.filter((t) => t.createdById === account);
  const team = mine.find((t) => t.id === selected);
  const save = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>我的医生团队及活动</h2>
      <label>
        演示账户
        <select
          aria-label="团队创建账户"
          value={account}
          onChange={(e) => {
            setAccount(e.target.value);
            setSelected("");
            setMembers([]);
            act({
              type: "UPDATE_CONFIG",
              payload: { demoAccountId: e.target.value },
            });
          }}
        >
          <option value="admin-demo">演示管理员</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.id}
            </option>
          ))}
        </select>
      </label>
      <input
        aria-label="团队关系名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="actions">
        {staff
          .filter((s) => s.status === "已通过")
          .map((s) => (
            <label key={s.id}>
              <input
                aria-label={`团队成员 ${s.id}`}
                type="checkbox"
                checked={members.includes(s.id)}
                onChange={(e) =>
                  setMembers(
                    e.target.checked
                      ? [...members, s.id]
                      : members.filter((m) => m !== s.id),
                  )
                }
              />
              {s.name}
            </label>
          ))}
      </div>
      <button
        className="btn"
        onClick={() => {
          if (!name.trim() || !members.length)
            return setNotice("团队名称与已审核成员为必填");
          const old = mine.find((t) => t.id === selected);
          const r = {
            ...old,
            id: old?.id || uid("TEAM"),
            name: name.trim(),
            createdById: account,
            memberIds: [...new Set(members)],
            status: "已通过",
          };
          save("doctorTeams", r);
          setSelected(r.id);
          setNotice("本账户团队已保存");
        }}
      >
        保存我的团队
      </button>
      <select
        aria-label="我的团队选择"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          const r = mine.find((t) => t.id === e.target.value);
          setName(r?.name || "");
          setMembers(r?.memberIds || []);
        }}
      >
        <option value="">新团队</option>
        {mine.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {mine.map((t) => (
        <div key={t.id}>
          <h3>{t.name}</h3>
          {(t.memberIds || []).map((mid: string) => (
            <span key={mid}>
              {staff.find((s) => s.id === mid)?.name || mid}
              <button
                className="btn"
                onClick={() =>
                  save("doctorTeams", {
                    ...t,
                    memberIds: t.memberIds.filter((m: string) => m !== mid),
                  })
                }
              >
                移除团队成员 {mid}
              </button>
            </span>
          ))}
        </div>
      ))}
      {team && (
        <>
          <h3>{team.name} 的活动</h3>
          <input
            aria-label="团队活动名称"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          />
          <input
            aria-label="团队活动名额"
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <button
            className="btn"
            onClick={() => {
              if (
                !activity.trim() ||
                !Number.isInteger(capacity) ||
                capacity <= 0
              )
                return setNotice("活动名称及正整数名额为必填");
              save("communityActivities", {
                id: uid("ACT"),
                name: activity.trim(),
                teamId: team.id,
                team: team.name,
                capacity,
                points: 0,
                date: today(),
                status: "已启用",
              });
              setActivity("");
            }}
          >
            创建团队活动
          </button>
          {(state.records.communityActivities || [])
            .filter((a) => a.teamId === team.id)
            .map((a) => (
              <p key={a.id}>
                {team.name} · {a.name} · {a.capacity} 人 · {a.status}
                <button
                  className="btn"
                  onClick={() =>
                    save("communityActivities", {
                      ...a,
                      status: a.status === "已启用" ? "已结束" : "已启用",
                    })
                  }
                >
                  切换活动状态
                </button>
              </p>
            ))}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export const outcomeMetrics = {
  systolic: "收缩压",
  fastingGlucose: "空腹血糖",
  bmi: "体重指数",
};
export function outcomeDate(start: string, days: number) {
  const d = new Date(start + "T00:00:00Z");
  if (!Number.isFinite(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function OutcomeTimeline() {
  const { state, act } = useDemo();
  const [patientId, setPatientId] = useState(state.patients[0]?.id || "");
  const plans = (state.records.healthPlans || []).filter(
    (p) => p.patientId === patientId,
  );
  const [planId, setPlanId] = useState("");
  const plan = plans.find((p) => p.id === planId) || plans[0];
  const [node, setNode] = useState(30);
  const [metric, setMetric] = useState("systolic");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState("");
  const [recordNode, setRecordNode] = useState(0);
  const [notice, setNotice] = useState("");
  const demoDate = state.config.healthOutcomeDate || today();
  const observations = (state.records.healthOutcomeObservations || []).filter(
    (r) => r.patientId === patientId && r.planId === plan?.id,
  );
  const baseline = observations.find(
    (r) => r.nodeDays === 0 && r.metricKey === metric,
  );
  const followup = observations.find(
    (r) => r.nodeDays === node && r.metricKey === metric,
  );
  const due = plan ? outcomeDate(plan.date, node) : "";
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>计划节点与合成指标变化</h2>
      <p>
        数值差仅描述录入资料，不判断临床疗效；缺值保留未记录，任务完成不等于指标改善。
      </p>
      <div className="actions">
        <select
          aria-label="效果观察客户"
          value={patientId}
          onChange={(e) => {
            setPatientId(e.target.value);
            setPlanId("");
          }}
        >
          {state.patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="效果观察计划"
          value={plan?.id || ""}
          onChange={(e) => setPlanId(e.target.value)}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          aria-label="效果观察演示日期"
          type="date"
          value={demoDate}
          onChange={(e) =>
            act({
              type: "UPDATE_CONFIG",
              payload: { healthOutcomeDate: e.target.value },
            })
          }
        />
        <select
          aria-label="干预效果节点"
          value={node}
          onChange={(e) => setNode(Number(e.target.value))}
        >
          {[30, 60, 90, 365].map((d) => (
            <option key={d} value={d}>
              {d === 365 ? "1 年" : `${d} 天`}
            </option>
          ))}
        </select>
        <select
          aria-label="干预效果指标"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          {Object.entries(outcomeMetrics).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {plan ? (
        <>
          <p>
            {plan.name} · {plan.description} · 开始 {plan.date} · 当前节点 {due}{" "}
            · {due > demoDate ? "尚未到达节点" : "已到观察节点"}
          </p>
          <p data-testid="outcome-values">
            基线：{baseline?.value ?? "未记录"}；节点：
            {followup?.value ?? "未记录"}；数值变化：
            {baseline && followup
              ? (followup.value - baseline.value).toFixed(2)
              : "缺少前后数据"}
            ；目标：{followup?.target ?? "未登记"}
          </p>
          <table aria-label="节点计划任务明细">
            <tbody>
              {state.tasks
                .filter(
                  (t) =>
                    t.planId === plan.id &&
                    (t.date === due ||
                      t.period === (node === 365 ? "1 年" : `${node} 天`)),
                )
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.date}</td>
                    <td>{t.status}</td>
                    <td>{t.note || "未记录"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="actions">
            <select
              aria-label="录入观察节点"
              value={recordNode}
              onChange={(e) => setRecordNode(Number(e.target.value))}
            >
              {[0, 30, 60, 90, 365].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "基线" : `${n} 天`}
                </option>
              ))}
            </select>
            <input
              aria-label="合成观察值"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <input
              aria-label="合成观察目标"
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <button
              className="btn"
              onClick={() => {
                const date = outcomeDate(plan.date, recordNode);
                if (
                  !value.trim() ||
                  !Number.isFinite(Number(value)) ||
                  !date ||
                  date > demoDate ||
                  (target && !Number.isFinite(Number(target)))
                )
                  return setNotice(
                    "请填写有限观察值，且不能把未到节点登记为已测量",
                  );
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "healthOutcomeObservations",
                    record: {
                      id: `OBS-${plan.id}-${recordNode}-${metric}`,
                      patientId,
                      planId: plan.id,
                      nodeDays: recordNode,
                      metricKey: metric,
                      value: Number(value),
                      target: target ? Number(target) : null,
                      date,
                    },
                  },
                });
                setNotice("合成指标节点已保存");
              }}
            >
              保存节点观察
            </button>
          </div>
        </>
      ) : (
        <p>该客户没有已关联 ID 的计划，请先应用计划模板。</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export const assessmentMetricLabels: Record<string, string> = {
  systolic: "收缩压",
  diastolic: "舒张压",
  totalCholesterol: "总胆固醇",
  fastingGlucose: "空腹血糖",
  bmi: "体重指数",
};
export function AssessmentPackages({
  assessmentType,
  onSelect,
}: {
  assessmentType: string;
  onSelect: (row: Row | null) => void;
}) {
  const { state, act } = useDemo();
  const packages = (state.records.clinicalConfig || []).filter(
    (p) =>
      p.category === "评估报告套餐" &&
      p.status === "已启用" &&
      (!p.assessmentType ||
        p.assessmentType === assessmentType ||
        p.assessmentType === "通用") &&
      Array.isArray(p.metricKeys),
  );
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [metrics, setMetrics] = useState<string[]>(["systolic", "diastolic"]);
  const [sections, setSections] = useState<string[]>([
    "采集指标",
    "问卷答案",
    "演示结果",
  ]);
  const [notice, setNotice] = useState("");
  return (
    <section className="ops-inline-box" style={{ marginBottom: 16 }}>
      <h3>评估指标套餐</h3>
      <select
        aria-label="套用评估指标套餐"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          onSelect(packages.find((p) => p.id === e.target.value) || null);
        }}
      >
        <option value="">默认指标与章节</option>
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <details>
        <summary>维护当前评估类型的指标套餐</summary>
        <input
          aria-label="评估指标套餐名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="actions">
          {Object.entries(assessmentMetricLabels).map(([key, label]) => (
            <label key={key}>
              <input
                aria-label={`套餐指标 ${key}`}
                type="checkbox"
                checked={metrics.includes(key)}
                onChange={(e) =>
                  setMetrics(
                    e.target.checked
                      ? [...metrics, key]
                      : metrics.filter((k) => k !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="actions">
          {["采集指标", "问卷答案", "演示结果"].map((key) => (
            <label key={key}>
              <input
                aria-label={`套餐章节 ${key}`}
                type="checkbox"
                checked={sections.includes(key)}
                onChange={(e) =>
                  setSections(
                    e.target.checked
                      ? [...sections, key]
                      : sections.filter((k) => k !== key),
                  )
                }
              />
              {key}
            </label>
          ))}
        </div>
        <button
          className="btn"
          onClick={() => {
            if (!name.trim() || !metrics.length || !sections.length)
              return setNotice("名称、至少一项指标及章节为必填");
            const old = packages.find((p) => p.name === name.trim());
            const row = {
              id: old?.id || uid("ASSESS-PACK"),
              name: name.trim(),
              category: "评估报告套餐",
              assessmentType,
              status: "已启用",
              metricKeys: metrics,
              sections,
              version: Number(old?.version || 0) + 1,
            };
            act({
              type: "UPSERT_RECORD",
              payload: { collection: "clinicalConfig", record: row },
            });
            setSelected(row.id);
            onSelect(row);
            setNotice("指标套餐已保存并应用到当前采集及报告结构");
          }}
        >
          保存并应用指标套餐
        </button>
      </details>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
