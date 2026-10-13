import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Volume2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import { useDemo } from "../store";
import type { DemoState } from "../model";
import { Badge, Empty, Modal, PageTitle } from "../ui";
const areas: Record<string, string> = {
  采血区: "血常规",
  超声区: "腹部彩超",
  心电图区: "心电图",
  一般检查区: "一般检查",
};
export function deriveQueueDefinitions(state: DemoState) {
  const configured = state.records.guideDepartments || [];
  const definitions = Object.entries(areas).map(([name, item]) => {
    const mapped = configured.find((d) =>
      String(d.items)
        .split(/[、,，\n]/)
        .map((x) => x.trim())
        .includes(item),
    );
    return {
      id: name,
      name,
      department: mapped?.name || name,
      code: mapped?.code || name,
      items: mapped
        ? String(mapped.items)
            .split(/[、,，\n]/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [item],
      zone: mapped?.zone || name,
      minutes: Number(mapped?.minutes) || 5,
      enabled: !mapped || mapped.status !== "已停用",
      sex: mapped?.sex || "不限",
      type: "常规",
    };
  });
  configured
    .filter((d) => !definitions.some((q) => q.code === d.code))
    .forEach((d) =>
      definitions.push({
        id: d.code || d.id,
        name: `${d.name}队列`,
        department: d.name,
        code: d.code || d.id,
        items: String(d.items)
          .split(/[、,，\n]/)
          .map((x) => x.trim())
          .filter(Boolean),
        zone: d.zone,
        minutes: Number(d.minutes) || 5,
        enabled: d.status !== "已停用",
        sex: d.sex || "不限",
        type: "常规",
      }),
    );
  for (const configured of state.records.queueDefinitions || []) {
    const mapped = state.records.guideDepartments?.find(
      (d) =>
        d.code === configured.departmentCode ||
        d.name === configured.department,
    );
    const q = {
      ...configured,
      department: mapped?.name || configured.department,
      zone: mapped?.zone || configured.zone,
      enabled: configured.enabled !== false && mapped?.status !== "已停用",
      items: configured.items || [],
      sex: mapped?.sex || "不限",
      type: configured.type === "VIP" ? "VIP" : "常规",
    };
    const index = definitions.findIndex((d) => d.id === q.id);
    if (index >= 0) definitions[index] = { ...definitions[index], ...q };
    else definitions.push(q as (typeof definitions)[number]);
  }
  return definitions;
}
function ScrollList({
  label,
  auto,
  children,
}: {
  label: string;
  auto: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      const box = ref.current;
      if (!box || box.scrollHeight <= box.clientHeight) return;
      box.scrollTop =
        box.scrollTop + 1 >= box.scrollHeight - box.clientHeight
          ? 0
          : box.scrollTop + 1;
    }, 60);
    return () => window.clearInterval(timer);
  }, [auto]);
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{
        maxHeight: 340,
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      {children}
    </div>
  );
}
export function hasGuideQueueAccess(state: DemoState, queueId: string) {
  const active = state.config.guideActiveUserId;
  if (!active)
    return ["admin", "reception", "doctor"].includes(state.config.role);
  const user = state.records.guideUsers?.find((r) => r.id === active);
  const session = state.records.guideSessions?.find(
    (r) => r.userId === active && r.status === "online",
  );
  return !!user?.enabled && !!session && user.queueIds?.includes(queueId);
}
function GuideUsers() {
  const { state, act } = useDemo();
  const queues = deriveQueueDefinitions(state);
  const blank = () => ({
    id: `GUIDE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    role: "医生",
    enabled: true,
    queueIds: [] as string[],
  });
  const [draft, setDraft] = useState(blank);
  const [message, setMessage] = useState("");
  const users = state.records.guideUsers || [];
  const sessions = state.records.guideSessions || [];
  const active = users.find((u) => u.id === state.config.guideActiveUserId);
  const online = users.filter(
    (u) =>
      u.enabled &&
      u.role === "医生" &&
      sessions.some((s) => s.userId === u.id && s.status === "online"),
  );
  const save = () => {
    if (state.config.role !== "admin") {
      setMessage("只有管理员演示角色可以维护导检用户。");
      return;
    }
    if (!draft.name.trim() || !draft.queueIds.length) {
      setMessage("请填写用户名称并至少分配一个队列。");
      return;
    }
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "guideUsers",
        record: { ...draft, name: draft.name.trim() },
      },
    });
    if (!draft.enabled)
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "guideSessions",
          record: {
            id: `SESSION-${draft.id}`,
            userId: draft.id,
            status: "offline",
            at: new Date().toISOString(),
          },
        },
      });
    setMessage("导检用户已保存；队列授权与停用立即影响当前本地会话。");
  };
  const login = (user: any) => {
    if (!user.enabled) return;
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "guideSessions",
        record: {
          id: `SESSION-${user.id}`,
          userId: user.id,
          status: "online",
          at: new Date().toISOString(),
        },
      },
    });
    act({ type: "UPDATE_CONFIG", payload: { guideActiveUserId: user.id } });
    setMessage(`已切换至 ${user.name} 的本地导检会话。`);
  };
  return (
    <section className="panel">
      <h2>导检用户与模拟会话</h2>
      <p>
        当前导检会话：{active?.name || "管理员演示会话"} · 本地在线医生：
        <strong data-testid="online-guide-doctors">{online.length}</strong> 人
      </p>
      <p className="muted">
        独立的本地用户模拟，不创建真实账号或凭据。管理员配置区可维护用户；所选导检会话仅能操作被授权的队列。
      </p>
      <details>
        <summary>维护导检用户</summary>
        <button
          className="btn"
          onClick={() => {
            setDraft(blank());
            setMessage("");
          }}
        >
          新建导检用户
        </button>
        <div className="form-grid">
          <label>
            导检用户名称
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            导检用户角色
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            >
              <option>医生</option>
              <option>调度员</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>授权操作队列</legend>
          {queues.map((q) => (
            <label className="check-line" key={q.id}>
              <input
                type="checkbox"
                aria-label={`授权${q.name}`}
                checked={draft.queueIds.includes(q.id)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    queueIds: e.target.checked
                      ? [...draft.queueIds, q.id]
                      : draft.queueIds.filter((id) => id !== q.id),
                  })
                }
              />
              {q.name}
            </label>
          ))}
        </fieldset>
        <label className="check-line">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          启用导检用户
        </label>
        <button className="btn" onClick={save}>
          保存导检用户
        </button>
      </details>
      <table className="ops-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>角色 / 授权</th>
            <th>会话</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                {u.name} · {u.enabled ? "已启用" : "已停用"}
              </td>
              <td>
                {u.role} ·{" "}
                {u.queueIds
                  .map(
                    (id: string) => queues.find((q) => q.id === id)?.name || id,
                  )
                  .join("、")}
              </td>
              <td>
                {u.enabled &&
                sessions.some((s) => s.userId === u.id && s.status === "online")
                  ? "本地在线"
                  : "离线"}
              </td>
              <td>
                <button
                  className="btn"
                  onClick={() => setDraft({ ...blank(), ...u })}
                >
                  编辑用户 {u.name}
                </button>
                <button
                  className="btn"
                  disabled={!u.enabled}
                  onClick={() => login(u)}
                >
                  模拟登录 {u.name}
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    act({
                      type: "UPSERT_RECORD",
                      payload: {
                        collection: "guideSessions",
                        record: {
                          id: `SESSION-${u.id}`,
                          userId: u.id,
                          status: "offline",
                          at: new Date().toISOString(),
                        },
                      },
                    })
                  }
                >
                  退出会话 {u.name}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn"
        onClick={() =>
          act({ type: "UPDATE_CONFIG", payload: { guideActiveUserId: "" } })
        }
      >
        切回管理员演示会话
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function GuideClock() {
  const { state, act } = useDemo();
  const queues = deriveQueueDefinitions(state);
  const [id, setId] = useState(queues[0]?.id || "");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("17:00");
  const [enabled, setEnabled] = useState(true);
  const [clock, setClock] = useState(
    (state.config.guideClock || new Date().toISOString()).slice(0, 16),
  );
  const [message, setMessage] = useState("");
  const lastRun = useRef("");
  const schedules = state.records.guideSchedules || [];
  const save = () => {
    if (!hasGuideQueueAccess(state, id)) {
      setMessage("当前导检用户无权配置此队列定时计划。");
      return;
    }
    if (
      !/^\d{2}:\d{2}$/.test(from) ||
      !/^\d{2}:\d{2}$/.test(to) ||
      from === to ||
      !id
    ) {
      setMessage("请选择队列及不同的有效开关时间。");
      return;
    }
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "guideSchedules",
        record: {
          id: `SCHEDULE-${id}`,
          queueId: id,
          openAt: from,
          closeAt: to,
          enabled,
        },
      },
    });
    setMessage("已保存每日导检开关计划，推进演示时钟时自动计算执行。");
  };
  const advance = () => {
    if (
      schedules.some((s) => s.enabled && !hasGuideQueueAccess(state, s.queueId))
    ) {
      setMessage("当前导检用户无权执行全部启用的队列计划。");
      return;
    }
    const iso = `${clock}:00Z`;
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(clock) ||
      !Number.isFinite(Date.parse(iso))
    ) {
      setMessage("请设置有效的 UTC 演示时间。");
      return;
    }
    const key = JSON.stringify([
      clock,
      schedules.map((s) => [s.queueId, s.openAt, s.closeAt, s.enabled]),
    ]);
    if (lastRun.current === key || state.config.guideScheduleRunKey === key) {
      setMessage("相同演示时间与计划已经执行，不重复写入。");
      return;
    }
    lastRun.current = key;
    const time = clock.slice(11);
    const open = { ...(state.config.queueOpen || {}) };
    const closing: string[] = [];
    schedules
      .filter((s) => s.enabled)
      .forEach((s) => {
        const value =
          s.openAt < s.closeAt
            ? time >= s.openAt && time < s.closeAt
            : time >= s.openAt || time < s.closeAt;
        open[s.queueId] = value;
        if (!value) closing.push(s.queueId);
      });
    act({
      type: "UPDATE_CONFIG",
      payload: { guideClock: iso, guideScheduleRunKey: key, queueOpen: open },
    });
    (state.records.queueTickets || [])
      .filter((t) => closing.includes(t.department) && t.status === "calling")
      .forEach((t) =>
        act({
          type: "UPSERT_RECORD",
          payload: {
            collection: "queueTickets",
            record: { ...t, status: "waiting", suspendedAt: iso },
          },
        }),
      );
    setMessage(
      `已按 ${clock.replace("T", " ")} UTC 执行每日计划；开启时段含起点、不含终点，跨午夜时段也适用。`,
    );
  };
  return (
    <section className="panel">
      <details>
        <summary>定时队列开关 · 演示时钟</summary>
        <p>仅显式推进时钟时执行，无后台定时器或物理设备控制。</p>
        <div className="form-grid">
          <label>
            定时计划队列
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                const s = schedules.find((s) => s.queueId === e.target.value);
                setFrom(s?.openAt || "08:00");
                setTo(s?.closeAt || "17:00");
                setEnabled(s?.enabled !== false);
              }}
            >
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            每日开启时间
            <input
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            每日关闭时间
            <input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            导检演示时钟（UTC）
            <input
              type="datetime-local"
              value={clock}
              onChange={(e) => setClock(e.target.value)}
            />
          </label>
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          启用每日队列计划
        </label>
        <button className="btn" onClick={save}>
          保存队列定时计划
        </button>
        <button className="btn btn-primary" onClick={advance}>
          推进导检演示时钟并执行
        </button>
        {message && <p role="status">{message}</p>}
        <ul>
          {schedules.map((s) => (
            <li key={s.id}>
              {queues.find((q) => q.id === s.queueId)?.name}：{s.openAt}–
              {s.closeAt} · {s.enabled ? "启用" : "停用"}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
function QueuePatientPreferences() {
  const { state, act } = useDemo();
  const [id, setId] = useState(state.patients[0]?.id || "");
  const existing = state.records.queuePatientPreferences?.find(
    (p) => p.id === id,
  );
  const [number, setNumber] = useState(existing?.ultrasoundNumber || "");
  const [pronunciation, setPronunciation] = useState(
    existing?.pronunciation || "",
  );
  const [message, setMessage] = useState("");
  const save = () => {
    if (number && !/^[A-Z0-9-]{1,20}$/i.test(number)) {
      setMessage("固定超声号限 1–20 位字母、数字及连字符。");
      return;
    }
    if (
      (state.records.queuePatientPreferences || []).some(
        (p) =>
          p.id !== id && number && p.ultrasoundNumber === number.toUpperCase(),
      )
    ) {
      setMessage("该固定超声号已被其他客户使用。");
      return;
    }
    if (pronunciation.length > 80) {
      setMessage("模拟读音不能超过 80 字。");
      return;
    }
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "queuePatientPreferences",
        record: {
          id,
          patientId: id,
          ultrasoundNumber: number.toUpperCase(),
          pronunciation: pronunciation.trim(),
        },
      },
    });
    setMessage(
      "客户固定超声号和模拟读音已保存，重新呼叫时应用读音；重排不会改变固定号。",
    );
  };
  return (
    <section className="panel">
      <details>
        <summary>固定超声号与姓名多音字</summary>
        <div className="form-grid">
          <label>
            呼叫信息客户
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                const p = state.records.queuePatientPreferences?.find(
                  (p) => p.id === e.target.value,
                );
                setNumber(p?.ultrasoundNumber || "");
                setPronunciation(p?.pronunciation || "");
              }}
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            固定超声号
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="US-0001"
            />
          </label>
          <label>
            姓名模拟呼叫读音
            <input
              value={pronunciation}
              onChange={(e) => setPronunciation(e.target.value)}
              placeholder="例如：shan4 ...，仅文本模拟"
            />
          </label>
        </div>
        <button className="btn" onClick={save}>
          保存固定号与读音
        </button>
        {message && <p role="status">{message}</p>}
        <p className="muted">
          不调用音响或语音
          SDK；固定号在超声队列姓名后显示，并与中间字遮蔽同时生效。
        </p>
      </details>
    </section>
  );
}
function FocusedQueueProgress() {
  const { state, act } = useDemo();
  const queues = deriveQueueDefinitions(state);
  const focused = state.config.queueFocusIds || [];
  return (
    <section className="panel">
      <h2>重点科室进度</h2>
      <div className="actions" style={{ flexWrap: "wrap" }}>
        {queues.map((q) => (
          <label key={q.id} className="check-line">
            <input
              type="checkbox"
              aria-label={`关注科室${q.name}`}
              checked={focused.includes(q.id)}
              onChange={(e) =>
                act({
                  type: "UPDATE_CONFIG",
                  payload: {
                    queueFocusIds: e.target.checked
                      ? [...focused, q.id]
                      : focused.filter((id: string) => id !== q.id),
                  },
                })
              }
            />
            {q.name}
          </label>
        ))}
      </div>
      <table className="ops-table" aria-label="重点科室进度统计">
        <thead>
          <tr>
            <th>科室</th>
            <th>候检 / 呼叫</th>
            <th>过号 / 暂停</th>
            <th>完成 / 总记录</th>
            <th>完成进度</th>
          </tr>
        </thead>
        <tbody>
          {queues
            .filter((q) => focused.includes(q.id))
            .map((q) => {
              const rows = (state.records.queueTickets || []).filter(
                (t) =>
                  t.department === q.id &&
                  ["waiting", "calling", "missed", "paused", "done"].includes(
                    t.status,
                  ),
              );
              const done = rows.filter((t) => t.status === "done").length;
              return (
                <tr key={q.id}>
                  <td>{q.department}</td>
                  <td>
                    {
                      rows.filter((t) =>
                        ["waiting", "calling"].includes(t.status),
                      ).length
                    }
                  </td>
                  <td>
                    {
                      rows.filter((t) =>
                        ["missed", "paused"].includes(t.status),
                      ).length
                    }
                  </td>
                  <td>
                    {done} / {rows.length}
                  </td>
                  <td>
                    {rows.length ? Math.round((done / rows.length) * 100) : 0}%
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <small>
        按当前保留的实际队列记录统计；清空记录不纳入分母，不冒充临床疗效或优化预测。
      </small>
    </section>
  );
}

export default function Queue({ screen = false }: { screen?: boolean }) {
  const { state, act } = useDemo();
  const [dept, setDept] = useState("采血区");
  const [skip, setSkip] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [notice, setNotice] = useState("");
  const [editingQueue, setEditingQueue] = useState<any>(null);
  const [queueError, setQueueError] = useState("");
  const [doctorDraft, setDoctorDraft] = useState({
    name: "演示医生",
    title: "健康管理师（合成）",
    intro: "负责演示体检引导与检查信息说明。",
    avatar: "",
    ...(state.config.queueDoctor || {}),
  });
  const [selectedQueues, setSelectedQueues] = useState<string[]>([]);
  const [clearMode, setClearMode] = useState<"all" | "missed" | null>(null);
  const [query, setQuery] = useState("");
  const [queueState, setQueueState] = useState("全部");
  const [waitingMin, setWaitingMin] = useState("");
  const [waitingMax, setWaitingMax] = useState("");
  const [passedMin, setPassedMin] = useState("");
  const [passedMax, setPassedMax] = useState("");
  const [completedMin, setCompletedMin] = useState("");
  const [completedMax, setCompletedMax] = useState("");
  const [queueType, setQueueType] = useState("全部类型");
  const [bottleneckDraft, setBottleneckDraft] = useState(
    String(state.config.queueBottleneckMinutes || 30),
  );
  const [pauseId, setPauseId] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [slipId, setSlipId] = useState("");
  const [resumeInput, setResumeInput] = useState("");
  const [resumeError, setResumeError] = useState("");
  const resumeBusy = useRef(false);
  const pauseBusy = useRef(false);
  const resumedTokens = useRef(new Set<string>());
  const [roomId, setRoomId] = useState("");
  const queues = deriveQueueDefinitions(state);
  const definition = queues.find((q) => q.id === dept) || queues[0];
  const eligible = state.appointments.filter((a) =>
    ["checked", "in_exam"].includes(a.status),
  );
  useEffect(() => {
    if (state.records.queueTickets !== undefined) return;
    const initial = deriveQueueDefinitions(state).flatMap((q) =>
      eligible
        .filter((a) => q.items.some((item) => a.items.includes(item)))
        .map((a, i) => ({
          id: `${q.id}-${a.id}`,
          department: q.id,
          appointmentId: a.id,
          status: "waiting",
          position: i,
          waitMinutes: q.minutes + i * 3,
          createdAt: new Date().toISOString(),
        })),
    );
    (initial.length ? initial : [{ id: "INIT", status: "init" }]).forEach(
      (record) =>
        act({
          type: "UPSERT_RECORD",
          payload: { collection: "queueTickets", record },
        }),
    );
  }, []);
  const isOpen = (id: string) => {
    const q = queues.find((q) => q.id === id);
    const zone = state.records.guideZones?.find((z) => z.name === q?.zone);
    return (
      !!q?.enabled &&
      zone?.status !== "已停用" &&
      state.config.queueOpen?.[id] !== false
    );
  };
  const permitted = hasGuideQueueAccess(state, dept);
  const open = isOpen(dept) && permitted;
  const allTickets = state.records.queueTickets || [];
  const tickets = allTickets.filter((t) => t.department === dept);
  const list = tickets
    .filter((t) => ["waiting", "calling"].includes(t.status))
    .sort((a, b) => a.position - b.position);
  const current = list.find((t) => t.status === "calling");
  const missed = tickets.filter((t) => t.status === "missed");
  const done = tickets.filter((t) => t.status === "done");
  const mappedRooms = (state.records.guideRooms || []).filter(
    (r) =>
      r.department === definition.department ||
      r.queue === definition.code ||
      r.queue === dept,
  );
  const rooms = mappedRooms.length
    ? mappedRooms.filter(
        (r) =>
          r.status !== "已停用" &&
          state.records.guideZones?.find((z) => z.name === r.zone)?.status !==
            "已停用",
      )
    : [
        {
          id: "DEFAULT",
          name: `${definition.name} 02 诊室`,
          zone: definition.zone,
          capacity: 1,
        },
      ];
  const chosenRoom = rooms.find((r) => r.id === roomId) || rooms[0];
  const activeRoom = rooms.find((r) => r.id === current?.roomId) || chosenRoom;
  const zone = state.records.guideZones?.find(
    (z) => z.name === (activeRoom?.zone || definition.zone),
  );
  const patients = (ticket: any) => {
    const a = state.appointments.find((a) => a.id === ticket?.appointmentId);
    return state.patients.find((p) => p.id === a?.patientId);
  };
  const displayName = (name: string) =>
    state.config.maskQueueNames && name.length > 1
      ? name[0] + "*" + name.slice(2)
      : name;
  const queueDisplayName = (ticket: any) => {
    const p = patients(ticket);
    const q = queues.find((q) => q.id === ticket?.department);
    const pref = state.records.queuePatientPreferences?.find(
      (r) => r.id === p?.id,
    );
    const fixed =
      q?.items.some((item) => /超声|彩超/.test(item)) && pref?.ultrasoundNumber;
    return (
      displayName(p?.name || "演示客户") + (fixed ? ` · 超声号 ${fixed}` : "")
    );
  };
  const save = (record: any) =>
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "queueTickets", record },
    });
  const call = (ticket: any) => {
    if (!open || !chosenRoom) {
      setNotice("队列已关闭或没有可用诊室，无法呼叫。");
      return;
    }
    const appointment = state.appointments.find(
      (a) => a.id === ticket.appointmentId,
    );
    const assignedRoom = roomId
      ? chosenRoom
      : rooms.find((r) => r.id === ticket.roomId) ||
        rooms.find((r) => r.zone === appointment?.preferredQueueArea) ||
        chosenRoom;
    if (current && current.id !== ticket.id)
      save({ ...current, status: "waiting" });
    save({
      ...ticket,
      status: "calling",
      roomId: assignedRoom.id,
      roomName: assignedRoom.name,
      zone: assignedRoom.zone,
      calledAt: new Date().toLocaleTimeString("zh-CN"),
      callCount: (ticket.callCount || 0) + 1,
      spokenText: `请 ${state.records.queuePatientPreferences?.find((p) => p.id === appointment?.patientId)?.pronunciation || patients(ticket)?.name || "演示客户"} 前往 ${assignedRoom.name}`,
      guideUserId: state.config.guideActiveUserId || "admin",
    });
    setNotice(
      `呼叫已分配至 ${assignedRoom.name}；前端大屏同步，语音与微信推送未接入。`,
    );
  };
  const move = (index: number, offset: number) => {
    const other = list[index + offset];
    if (!other || !open) return;
    save({ ...list[index], position: other.position });
    save({ ...other, position: list[index].position });
  };
  const candidates = eligible.filter(
    (a) =>
      definition.items.some((item) => a.items.includes(item)) &&
      (definition.sex === "不限" ||
        state.patients.find((p) => p.id === a.patientId)?.sex ===
          definition.sex) &&
      !tickets.some(
        (t) =>
          t.appointmentId === a.id && !["done", "cleared"].includes(t.status),
      ),
  );
  const batchOpen = (value: boolean) => {
    if (selectedQueues.some((id) => !hasGuideQueueAccess(state, id))) {
      setNotice("当前导检会话没有全部所选队列的操作权限。");
      return;
    }
    const changes = { ...(state.config.queueOpen || {}) };
    selectedQueues.forEach((id) => {
      changes[id] = value;
    });
    act({ type: "UPDATE_CONFIG", payload: { queueOpen: changes } });
    if (!value)
      allTickets
        .filter(
          (t) =>
            selectedQueues.includes(t.department) && t.status === "calling",
        )
        .forEach((t) =>
          save({
            ...t,
            status: "waiting",
            suspendedAt: new Date().toISOString(),
          }),
        );
    setNotice(
      `${selectedQueues.length} 个队列已${value ? "开启" : "关闭"}；关闭队列停止呼叫和入队，大屏同步显示状态。`,
    );
  };
  const clear = () => {
    if (selectedQueues.some((id) => !hasGuideQueueAccess(state, id))) {
      setNotice("当前导检会话无权清空所选队列。");
      setClearMode(null);
      return;
    }
    const affected = allTickets.filter(
      (t) =>
        selectedQueues.includes(t.department) &&
        (clearMode === "missed"
          ? t.status === "missed"
          : ["waiting", "calling", "missed", "done", "paused"].includes(
              t.status,
            )),
    );
    affected.forEach((t) =>
      save({
        ...t,
        previousStatus: t.status,
        status: "cleared",
        clearedAt: new Date().toISOString(),
        clearMode,
        clearActor: state.config.role,
      }),
    );
    setNotice(
      `已清空 ${affected.length} 条${clearMode === "missed" ? "过号（过检）" : "队列"}记录；历史与审计保留，未修改体检结果。`,
    );
    setClearMode(null);
  };
  const saveQueueDefinition = () => {
    if (
      state.config.guideActiveUserId &&
      state.records.guideUsers?.find(
        (u) => u.id === state.config.guideActiveUserId,
      )?.role !== "调度员"
    ) {
      setQueueError("当前导检用户不能维护队列配置。");
      return;
    }
    if (editingQueue.id && !hasGuideQueueAccess(state, editingQueue.id)) {
      setQueueError("当前导检用户无权维护此队列。");
      return;
    }
    if (
      !editingQueue.name?.trim() ||
      !editingQueue.department?.trim() ||
      !editingQueue.zone?.trim() ||
      !editingQueue.items?.length ||
      Number(editingQueue.minutes) < 1
    ) {
      setQueueError(
        "请填写队列、科室、区域、至少一个检查项目与有效服务分钟数。",
      );
      return;
    }
    if (
      queues.some(
        (q) => q.id !== editingQueue.id && q.name === editingQueue.name.trim(),
      )
    ) {
      setQueueError("队列名称已存在。");
      return;
    }
    const record = {
      ...editingQueue,
      name: editingQueue.name.trim(),
      id: editingQueue.id || `Q-${Date.now().toString(36)}`,
      code:
        editingQueue.code || editingQueue.id || `Q-${Date.now().toString(36)}`,
    };
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "queueDefinitions", record },
    });
    setDept(record.id);
    setEditingQueue(null);
    setQueueError("");
    setNotice("队列配置已生效：检查项目匹配、名称、区域和等待估算均同步。");
  };
  const day = new Date().toISOString().slice(0, 10);
  const arrived = state.appointments.filter(
    (a) =>
      (a.checkedAt?.slice(0, 10) || a.date) === day &&
      ["checked", "in_exam", "review", "approved", "printed"].includes(
        a.status,
      ),
  );
  const todayComplete = arrived.filter((a) =>
    ["review", "approved", "printed"].includes(a.status),
  );
  const pendingCount = (id: string) =>
    allTickets.filter(
      (t) => t.department === id && ["waiting", "calling"].includes(t.status),
    ).length;
  const passedCount = (id: string) =>
    allTickets.filter((t) => t.department === id && t.status === "missed")
      .length;
  const completedCount = (id: string) =>
    allTickets.filter((t) => t.department === id && t.status === "done").length;
  const validBound = (value: string) =>
    value === "" || (Number.isInteger(Number(value)) && Number(value) >= 0);
  const validRange = [
    [waitingMin, waitingMax],
    [passedMin, passedMax],
    [completedMin, completedMax],
  ].every(
    ([min, max]) =>
      validBound(min) &&
      validBound(max) &&
      (min === "" || max === "" || Number(min) <= Number(max)),
  );
  const inRange = (value: number, min: string, max: string) =>
    (min === "" || value >= Number(min)) &&
    (max === "" || value <= Number(max));
  const bottleneckMinutes = Number(state.config.queueBottleneckMinutes) || 30;
  const visibleQueues = queues.filter(
    (q) =>
      validRange &&
      (!query || `${q.name} ${q.department}`.includes(query)) &&
      (queueState === "全部" || (queueState === "已开启") === isOpen(q.id)) &&
      (queueType === "全部类型" || q.type === queueType) &&
      inRange(pendingCount(q.id), waitingMin, waitingMax) &&
      inRange(passedCount(q.id), passedMin, passedMax) &&
      inRange(completedCount(q.id), completedMin, completedMax),
  );
  const slips = state.records.queueResumeSlips || [];
  const slip = slips.find((s) => s.id === slipId);
  const pause = () => {
    if (pauseBusy.current) return;
    const ticket = allTickets.find((t) => t.id === pauseId);
    if (
      !ticket ||
      !["waiting", "calling"].includes(ticket.status) ||
      !isOpen(ticket.department) ||
      !hasGuideQueueAccess(state, ticket.department) ||
      !pauseReason.trim()
    )
      return;
    pauseBusy.current = true;
    let token = `DEMO-RESUME-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    while (slips.some((s) => s.id === token)) token += "X";
    const at = new Date().toISOString();
    save({
      ...ticket,
      status: "paused",
      pauseReason: pauseReason.trim(),
      pausedAt: at,
      resumeToken: token,
    });
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "queueResumeSlips",
        record: {
          id: token,
          token,
          ticketId: ticket.id,
          appointmentId: ticket.appointmentId,
          department: ticket.department,
          reason: pauseReason.trim(),
          issuedAt: at,
          actor: state.config.role,
          status: "未恢复",
        },
      },
    });
    setPauseId("");
    setPauseReason("");
    setSlipId(token);
    setNotice("已暂停当前检查并生成唯一演示凭条，原队列位置与操作留痕已保存。");
  };
  const resume = () => {
    if (resumeBusy.current) return;
    const record = slips.find((s) => s.token === resumeInput.trim());
    if (!record) {
      setResumeError("未找到该演示凭条编号。");
      return;
    }
    if (record.status !== "未恢复" || resumedTokens.current.has(record.token)) {
      setResumeError("此凭条已经恢复，不能重复使用。");
      return;
    }
    const ticket = allTickets.find((t) => t.id === record.ticketId);
    const appointment = state.appointments.find(
      (a) => a.id === record.appointmentId,
    );
    if (
      !ticket ||
      ticket.status !== "paused" ||
      ticket.resumeToken !== record.token
    ) {
      setResumeError("原检查已变更，当前凭条不能用于恢复。");
      return;
    }
    if (!hasGuideQueueAccess(state, record.department)) {
      setResumeError("当前导检用户无权恢复原科室队列。");
      return;
    }
    if (!isOpen(record.department)) {
      setResumeError("原科室队列已关闭，请先开启该队列再恢复。");
      return;
    }
    if (
      !appointment ||
      appointment.locked ||
      !["checked", "in_exam"].includes(appointment.status)
    ) {
      setResumeError("原订单已锁定或不在检查阶段，不能恢复排队。");
      return;
    }
    resumeBusy.current = true;
    resumedTokens.current.add(record.token);
    try {
      const at = new Date().toISOString();
      const position =
        Math.max(
          -1,
          ...allTickets
            .filter(
              (t) =>
                t.department === record.department &&
                ["waiting", "calling"].includes(t.status),
            )
            .map((t) => t.position),
        ) + 1;
      save({
        ...ticket,
        status: "waiting",
        position,
        resumedAt: at,
        lastResumeToken: record.token,
        resumeToken: undefined,
      });
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "queueResumeSlips",
          record: {
            ...record,
            status: "已恢复",
            usedAt: at,
            usedBy: state.config.role,
          },
        },
      });
      setDept(record.department);
      setRoomId("");
      setResumeInput("");
      setResumeError("");
      setNotice("凭条已核销，检查恢复到原科室队列末尾；不能再次使用同一凭条。");
    } finally {
      resumeBusy.current = false;
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="SMART GUIDE / 智能导检"
        title={screen ? "候检区信息大屏" : "智能导检与队列调度"}
        description="科室映射、诊室分配、批量启停与滚动队列；语音、微信和真实屏幕控制未接入。"
        actions={
          <a className="btn" href={screen ? "#/queue" : "#/queue?screen=1"}>
            {screen ? "退出大屏" : "候检大屏"}
          </a>
        }
      />
      {!screen && (
        <>
          <GuideUsers />
          <GuideClock />
          <QueuePatientPreferences />
          <FocusedQueueProgress />
        </>
      )}
      {!screen && (
        <section className="panel">
          <h2>当日到检与队列概览</h2>
          <div className="form-grid">
            <div>
              当日登记：{arrived.length} 人（男{" "}
              {
                arrived.filter(
                  (a) =>
                    state.patients.find((p) => p.id === a.patientId)?.sex ===
                    "男",
                ).length
              }{" "}
              / 女{" "}
              {
                arrived.filter(
                  (a) =>
                    state.patients.find((p) => p.id === a.patientId)?.sex ===
                    "女",
                ).length
              }
              ）
            </div>
            <div>
              当日检查完成：{todayComplete.length} 人 · 已开队列：
              {queues.filter((q) => isOpen(q.id)).length}
            </div>
          </div>
          <small>
            无登记时间的初始合成订单按体检日期统计；检查完成指已进入审核及其后续阶段。
          </small>
        </section>
      )}
      {!screen && (
        <section className="panel">
          <h2>队列批量调度</h2>
          <div className="form-grid">
            <label>
              队列 / 科室查询
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              队列类型筛选
              <select
                value={queueType}
                onChange={(e) => setQueueType(e.target.value)}
              >
                <option>全部类型</option>
                <option>常规</option>
                <option>VIP</option>
              </select>
            </label>
            <label>
              队列状态
              <select
                value={queueState}
                onChange={(e) => setQueueState(e.target.value)}
              >
                <option>全部</option>
                <option>已开启</option>
                <option>已关闭</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              候检人数下限
              <input
                type="number"
                min="0"
                value={waitingMin}
                onChange={(e) => setWaitingMin(e.target.value)}
                placeholder="不限"
              />
            </label>
            <label>
              候检人数上限
              <input
                type="number"
                min="0"
                value={waitingMax}
                onChange={(e) => setWaitingMax(e.target.value)}
                placeholder="不限"
              />
            </label>
            <label>
              过检人数下限（演示按过号）
              <input
                type="number"
                min="0"
                value={passedMin}
                onChange={(e) => setPassedMin(e.target.value)}
                placeholder="不限"
              />
            </label>
            <label>
              过检人数上限（演示按过号）
              <input
                type="number"
                min="0"
                value={passedMax}
                onChange={(e) => setPassedMax(e.target.value)}
                placeholder="不限"
              />
            </label>
            <label>
              已检人数下限
              <input
                type="number"
                min="0"
                value={completedMin}
                onChange={(e) => setCompletedMin(e.target.value)}
                placeholder="不限"
              />
            </label>
            <label>
              已检人数上限
              <input
                type="number"
                min="0"
                value={completedMax}
                onChange={(e) => setCompletedMax(e.target.value)}
                placeholder="不限"
              />
            </label>
            <label>
              瓶颈负荷阈值（分钟）
              <input
                type="number"
                min="1"
                max="1440"
                value={bottleneckDraft}
                onChange={(e) => setBottleneckDraft(e.target.value)}
              />
            </label>
            <div>
              <button
                className="btn"
                onClick={() => {
                  const value = Number(bottleneckDraft);
                  if (!Number.isInteger(value) || value < 1 || value > 1440) {
                    setNotice("瓶颈阈值需为 1–1440 整数分钟。");
                    return;
                  }
                  act({
                    type: "UPDATE_CONFIG",
                    payload: { queueBottleneckMinutes: value },
                  });
                  setNotice("瓶颈标识已按实际候检人数与配置服务时长重新计算。");
                }}
              >
                应用瓶颈阈值
              </button>
            </div>
          </div>
          {!validRange && (
            <div className="callout alert" role="alert">
              候检、过检及已检人数须为非负整数，且每组下限不能大于上限。
            </div>
          )}
          <p className="muted">
            演示负荷 = 候检 / 呼叫人数 × 单人配置分钟数；达到{" "}
            {bottleneckMinutes} 分钟显示瓶颈，不代表智能优化或临床判断。
          </p>
          <div className="table-wrap">
            <table aria-label="队列筛选结果">
              <thead>
                <tr>
                  <th>选择</th>
                  <th>队列 / 科室</th>
                  <th>队列类型</th>
                  <th>区域</th>
                  <th>状态</th>
                  <th>等待 / 过号 / 已检</th>
                  <th>瓶颈与负荷</th>
                </tr>
              </thead>
              <tbody>
                {visibleQueues.map((q) => {
                  const rows = allTickets.filter((t) => t.department === q.id);
                  return (
                    <tr key={q.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`选择队列${q.name}`}
                          checked={selectedQueues.includes(q.id)}
                          onChange={(e) =>
                            setSelectedQueues(
                              e.target.checked
                                ? [...selectedQueues, q.id]
                                : selectedQueues.filter((id) => id !== q.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        {q.name}
                        <small style={{ display: "block" }}>
                          {q.department} · {q.items.join("、")}
                        </small>
                      </td>
                      <td>{q.type}</td>
                      <td>{q.zone}</td>
                      <td>
                        <Badge tone={isOpen(q.id) ? "green" : "gray"}>
                          {isOpen(q.id) ? "已开启" : "已关闭"}
                        </Badge>
                      </td>
                      <td>
                        {
                          rows.filter((t) =>
                            ["waiting", "calling"].includes(t.status),
                          ).length
                        }{" "}
                        / {rows.filter((t) => t.status === "missed").length} /{" "}
                        {rows.filter((t) => t.status === "done").length}
                      </td>
                      <td>
                        <Badge
                          tone={
                            pendingCount(q.id) * q.minutes >= bottleneckMinutes
                              ? "amber"
                              : "green"
                          }
                        >
                          {pendingCount(q.id) * q.minutes >= bottleneckMinutes
                            ? "瓶颈队列"
                            : "负荷正常"}
                        </Badge>
                        <small style={{ display: "block" }}>
                          {pendingCount(q.id)} 人 × {q.minutes} 分钟 ={" "}
                          {pendingCount(q.id) * q.minutes} 分钟
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: 15, flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() => setSelectedQueues(visibleQueues.map((q) => q.id))}
            >
              选择当前查询队列
            </button>
            <button
              className="btn"
              onClick={() => {
                setQueueError("");
                setEditingQueue({
                  name: "",
                  department: "",
                  zone: "",
                  items: [],
                  minutes: 5,
                  type: "常规",
                  enabled: true,
                  sex: "不限",
                });
              }}
            >
              新建业务队列
            </button>
            <button
              className="btn"
              onClick={() => {
                setQueueError("");
                setEditingQueue({ ...definition });
              }}
            >
              编辑当前队列
            </button>
            <button
              className="btn"
              disabled={!selectedQueues.length}
              onClick={() => batchOpen(true)}
            >
              批量开启
            </button>
            <button
              className="btn"
              disabled={!selectedQueues.length}
              onClick={() => batchOpen(false)}
            >
              批量关闭
            </button>
            <button
              className="btn"
              disabled={!selectedQueues.length}
              onClick={() => setClearMode("all")}
            >
              清空全部客户
            </button>
            <button
              className="btn"
              disabled={!selectedQueues.length}
              onClick={() => setClearMode("missed")}
            >
              清空过检客户
            </button>
          </div>
          <p className="muted">
            这里“过检”按队列过号 /
            暂离处理，已完成检查另列。清空保留可追溯历史。
          </p>
        </section>
      )}
      <div className="queue-layout">
        <div>
          <div className="tabs">
            {queues.map((q) => (
              <button
                key={q.id}
                className={dept === q.id ? "active" : ""}
                onClick={() => {
                  setDept(q.id);
                  setRoomId("");
                  setNotice("");
                }}
              >
                {q.name}
              </button>
            ))}
          </div>
          <section className="call-screen" aria-label="当前呼叫大屏">
            <div className="eyebrow">PLEASE PROCEED TO / 请前往</div>
            <h2>{activeRoom?.name || "暂无可用诊室"}</h2>
            <div className="calling-name">
              {!open
                ? permitted
                  ? "队列已关闭"
                  : "当前导检用户无操作权限"
                : current
                  ? queueDisplayName(current)
                  : "等候呼叫"}
            </div>
            <p>
              {open
                ? current?.appointmentId || "请选择候检客户"
                : "暂停呼叫与入队"}{" "}
              · {current?.calledAt || "当前未呼叫"}
            </p>
            <p>
              {definition.department} ·{" "}
              {zone
                ? `${zone.campus} ${zone.floor} ${zone.name}`
                : activeRoom?.zone || definition.zone}
              {zone?.directions ? ` · ${zone.directions}` : ""}
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                margin: "14px 0",
              }}
            >
              {state.config.queueDoctor?.avatar ? (
                <img
                  src={state.config.queueDoctor.avatar}
                  alt="合成医生头像"
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <svg
                  width="50"
                  height="50"
                  viewBox="0 0 50 50"
                  role="img"
                  aria-label="合成医生抽象头像"
                >
                  <circle cx="25" cy="25" r="25" fill="#d6e6df" />
                  <circle cx="25" cy="18" r="9" fill="#5f927e" />
                  <path d="M9 45Q9 28 25 28Q41 28 41 45" fill="#5f927e" />
                </svg>
              )}
              <div>
                <strong>
                  {state.config.queueDoctor?.name || "演示医生"} ·{" "}
                  {state.config.queueDoctor?.title || "健康管理师（合成）"}
                </strong>
                <small style={{ display: "block" }}>
                  {state.config.queueDoctor?.intro ||
                    "负责演示体检引导与检查信息说明。"}
                </small>
              </div>
            </div>
            <div className="call-info">
              <span>
                <span className="live-dot" />
                候检 {list.length} 人
              </span>
              <span>预计等待 {list.length * definition.minutes} 分钟</span>
              <span>{open ? "已开启" : "已关闭"} · 模拟</span>
            </div>
          </section>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>{definition.name}候检队列</h2>
              {!screen && (
                <div className="actions">
                  <button
                    className="btn"
                    disabled={!open || !candidates.length}
                    onClick={() => {
                      setCandidate(candidates[0]?.id || "");
                      setAdding(true);
                    }}
                  >
                    <Plus size={15} />
                    手动入队
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!open || !list.length || !chosenRoom}
                    onClick={() =>
                      call(list.find((t) => t.status !== "calling") || list[0])
                    }
                  >
                    <Volume2 size={15} />
                    呼叫下一位
                  </button>
                </div>
              )}
            </div>
            <ScrollList
              label="等待客户滚动列表"
              auto={screen && state.config.queueAutoScroll !== false}
            >
              {list.map((t, i) => (
                <div className="queue-row" key={t.id}>
                  <span className="queue-no">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{queueDisplayName(t)}</strong>
                    <small>{t.appointmentId}</small>
                  </div>
                  <Badge tone={t.status === "calling" ? "green" : "gray"}>
                    {t.status === "calling" ? "正在呼叫" : "候检中"}
                  </Badge>
                  <span className="spacer" />
                  {!screen && (
                    <>
                      <button
                        className="icon-btn"
                        aria-label={"上移" + patients(t)?.name}
                        disabled={!open || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={"下移" + patients(t)?.name}
                        disabled={!open || i === list.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="text-btn"
                        disabled={!open || !chosenRoom}
                        onClick={() => call(t)}
                      >
                        呼叫 / 重呼
                      </button>
                      <button
                        className="text-btn"
                        disabled={!open}
                        onClick={() => {
                          setSkip(t.id);
                          setReason("");
                        }}
                      >
                        过号
                      </button>
                      <button
                        className="text-btn"
                        disabled={!open}
                        onClick={() => {
                          pauseBusy.current = false;
                          setPauseId(t.id);
                          setPauseReason("");
                        }}
                      >
                        暂停并生成凭条
                      </button>
                      <button
                        className="text-btn"
                        disabled={!open}
                        onClick={() =>
                          save({
                            ...t,
                            status: "done",
                            completedAt: new Date().toISOString(),
                          })
                        }
                      >
                        完成出队
                      </button>
                    </>
                  )}
                </div>
              ))}
            </ScrollList>
            {!list.length && <Empty text="当前科室队列已清空" />}
          </section>
          {!screen && (
            <section className="panel">
              <h3>中断检查凭条恢复</h3>
              <p className="muted">
                仅模拟扫描：将演示二维码中的凭条编号粘贴到下方，恢复至原科室队列末尾。真实扫码器、纸张打印与终端未接入。
              </p>
              <label className="field">
                扫描模拟 / 输入凭条编号
                <input
                  value={resumeInput}
                  onChange={(e) => setResumeInput(e.target.value)}
                  placeholder="DEMO-RESUME-…"
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={!resumeInput.trim()}
                onClick={resume}
              >
                核验凭条并恢复原队列
              </button>
              {resumeError && (
                <div className="callout alert" role="alert">
                  {resumeError}
                </div>
              )}
              <h4>当前科室暂停记录</h4>
              {allTickets
                .filter((t) => t.department === dept && t.status === "paused")
                .map((t) => (
                  <div className="queue-row" key={t.id}>
                    <div>
                      <strong>{queueDisplayName(t)}</strong>
                      <small>{t.pauseReason}</small>
                    </div>
                    <button
                      className="btn"
                      onClick={() => setSlipId(t.resumeToken)}
                    >
                      查看暂停凭条
                    </button>
                  </div>
                ))}
            </section>
          )}
          <section className="panel">
            <h3>已检客户 · {done.length} 人</h3>
            <ScrollList
              label="已检客户滚动列表"
              auto={screen && state.config.queueAutoScroll !== false}
            >
              {done.map((t) => (
                <div className="queue-row" key={t.id}>
                  <strong>{queueDisplayName(t)}</strong>
                  <small>{t.appointmentId}</small>
                  <Badge>已完成</Badge>
                </div>
              ))}
            </ScrollList>
            {!done.length && <p className="muted">暂无已检客户</p>}
          </section>
        </div>
        <aside>
          {!screen && (
            <section className="panel">
              <h3>大屏医生资料（合成）</h3>
              <label className="field">
                演示医生姓名
                <input
                  value={doctorDraft.name}
                  onChange={(e) =>
                    setDoctorDraft({ ...doctorDraft, name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                演示医生职称
                <input
                  value={doctorDraft.title}
                  onChange={(e) =>
                    setDoctorDraft({ ...doctorDraft, title: e.target.value })
                  }
                />
              </label>
              <label className="field">
                演示医生简介
                <textarea
                  value={doctorDraft.intro}
                  onChange={(e) =>
                    setDoctorDraft({ ...doctorDraft, intro: e.target.value })
                  }
                />
              </label>
              <label className="field">
                上传合成医生头像
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      !["image/png", "image/jpeg", "image/webp"].includes(
                        file.type,
                      ) ||
                      file.size > 204800
                    ) {
                      setNotice(
                        "头像仅支持 200KB 内的 PNG/JPEG/WebP 合成图片。",
                      );
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setDoctorDraft((d: typeof doctorDraft) => ({
                        ...d,
                        avatar: String(reader.result),
                      }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {doctorDraft.avatar && (
                <>
                  <img
                    alt="合成头像草稿预览"
                    src={doctorDraft.avatar}
                    style={{
                      width: 64,
                      height: 64,
                      objectFit: "cover",
                      borderRadius: "50%",
                    }}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      setDoctorDraft({ ...doctorDraft, avatar: "" })
                    }
                  >
                    移除头像草稿
                  </button>
                </>
              )}
              <button
                className="btn"
                disabled={!doctorDraft.name.trim() || !doctorDraft.intro.trim()}
                onClick={() => {
                  act({
                    type: "UPDATE_CONFIG",
                    payload: { queueDoctor: doctorDraft },
                  });
                  setNotice("合成医生资料已同步至前端大屏。");
                }}
              >
                保存并同步大屏医生资料
              </button>
              <p className="muted">
                仅使用合成头像。未设置头像时显示抽象插图；本地保存，不代表真实医生身份。
              </p>
            </section>
          )}
          <section className="panel">
            <h3>诊室与区域映射</h3>
            {!screen && (
              <label className="field">
                呼叫诊室
                <select
                  value={chosenRoom?.id || ""}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  {!rooms.length && <option value="">暂无可用诊室</option>}
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.zone}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              {definition.department} → {definition.zone} →{" "}
              {activeRoom?.name || "暂无可用诊室"}
            </p>
            <p className="muted">
              读取门户与导检配置中的科室项目、区域与诊室，停用科室或区域将阻止呼叫。未接入真实定位与设备。
            </p>
            <a className="link-btn" href="#/controls">
              维护导检配置
            </a>
          </section>
          <section className="panel">
            <h3>{screen ? "大屏展示" : "调度与隐私配置"}</h3>
            {!screen && (
              <p aria-label="本次模拟呼叫读音">
                模拟读音：{current?.spokenText || "尚未呼叫"}
              </p>
            )}
            {!screen && (
              <>
                <label className="field">
                  排序模式
                  <select
                    value={state.config.queueRule}
                    onChange={(e) => {
                      act({
                        type: "UPDATE_CONFIG",
                        payload: { queueRule: e.target.value },
                      });
                      [...list]
                        .sort((a, b) =>
                          e.target.value === "最短等待优先"
                            ? a.waitMinutes - b.waitMinutes
                            : String(a.appointmentId).localeCompare(
                                String(b.appointmentId),
                              ),
                        )
                        .forEach((t, i) => save({ ...t, position: i }));
                      setNotice("当前科室队列已按演示规则重排。");
                    }}
                  >
                    <option>空腹项目优先</option>
                    <option>最短等待优先</option>
                    <option>预约时间优先</option>
                  </select>
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={!!state.config.maskQueueNames}
                    onChange={(e) =>
                      act({
                        type: "UPDATE_CONFIG",
                        payload: { maskQueueNames: e.target.checked },
                      })
                    }
                  />
                  隐藏姓名中间字（大屏同步）
                </label>
              </>
            )}
            <label className="check-line">
              <input
                type="checkbox"
                checked={state.config.queueAutoScroll !== false}
                onChange={(e) =>
                  act({
                    type: "UPDATE_CONFIG",
                    payload: { queueAutoScroll: e.target.checked },
                  })
                }
              />
              大屏列表自动滚动
            </label>
            <h4 style={{ marginTop: 20 }}>过号队列 · {missed.length} 人</h4>
            <ScrollList
              label="过检客户滚动列表"
              auto={screen && state.config.queueAutoScroll !== false}
            >
              {missed.map((t) => (
                <div className="queue-row" key={t.id}>
                  <div>
                    <strong>{queueDisplayName(t)}</strong>
                    <small>{t.reason}</small>
                  </div>
                  {!screen && (
                    <button
                      className="text-btn"
                      disabled={!open}
                      onClick={() =>
                        save({
                          ...t,
                          status: "waiting",
                          position:
                            Math.max(0, ...list.map((t) => t.position)) + 1,
                        })
                      }
                    >
                      召回入队
                    </button>
                  )}
                </div>
              ))}
            </ScrollList>
            {!missed.length && <p className="muted">暂无过号记录</p>}
          </section>
        </aside>
      </div>
      {pauseId && (
        <Modal title="暂停检查与凭条" onClose={() => setPauseId("")}>
          <p>
            暂停后从候检列表移出，凭唯一演示二维码恢复到原科室。不会删除结果或完成检查。
          </p>
          <label className="field">
            中断检查原因
            <input
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setPauseId("")}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={!pauseReason.trim()}
              onClick={pause}
            >
              确认暂停并生成凭条
            </button>
          </div>
        </Modal>
      )}
      {slip && (
        <Modal title="中断检查演示凭条" onClose={() => setSlipId("")}>
          <Badge tone="amber">合成凭条 · 浏览器打印，无设备回传</Badge>
          <h3>
            {slip.department} · {slip.appointmentId}
          </h3>
          <QRCodeSVG
            value={slip.token}
            size={180}
            title="中断检查唯一演示凭条二维码"
          />
          <label className="field">
            演示凭条编号
            <input readOnly value={slip.token} />
          </label>
          <p>
            状态：{slip.status} · 原因：{slip.reason}
          </p>
          <p>凭条使用一次后即失效；保留发出及恢复审计记录。</p>
          <p>
            打印按钮打开浏览器打印对话框；取消或打印都不核销凭条，系统无法确认是否真正出纸。
          </p>
          <button className="btn btn-primary" onClick={() => window.print()}>
            浏览器打印凭条
          </button>
          <button className="btn" onClick={() => setSlipId("")}>
            关闭凭条预览
          </button>
        </Modal>
      )}
      {slip &&
        createPortal(
          <div
            className="queue-slip-print-sheet"
            data-testid="queue-slip-print-sheet"
          >
            <style>{`
        .queue-slip-print-sheet { display: none; }
        @media print {
          body > :not(.queue-slip-print-sheet) { display: none !important; }
          body > .queue-slip-print-sheet { display: block !important; color: #111; background: white; font: 14px sans-serif; }
          .queue-slip-print-sheet article { padding: 12mm; max-width: 140mm; margin: 0 auto; break-inside: avoid; }
          .queue-slip-print-sheet svg { display: block; margin: 14px 0; }
          .queue-slip-print-sheet code { overflow-wrap: anywhere; }
        }
      `}</style>
            <article>
              <h1>红创体检管理 · 合成中断检查凭条</h1>
              <p>原科室队列：{slip.department}</p>
              <p>体检号：{slip.appointmentId}</p>
              <p>中断原因：{slip.reason}</p>
              <QRCodeSVG
                value={slip.token}
                size={180}
                title="打印专用凭条二维码"
              />
              <p>
                <code>{slip.token}</code>
              </p>
              <p>凭条状态：{slip.status}</p>
              <p>扫描或输入编号后恢复原队列；核销一次即失效。</p>
              <small>
                仅为演示凭条，不是医疗凭证。浏览器打印无真实打印机回传。
              </small>
            </article>
          </div>,
          document.body,
        )}
      {editingQueue && (
        <Modal title="业务队列配置" onClose={() => setEditingQueue(null)}>
          <label className="field">
            配置队列类型
            <select
              value={editingQueue.type || "常规"}
              onChange={(e) =>
                setEditingQueue({ ...editingQueue, type: e.target.value })
              }
            >
              <option>常规</option>
              <option>VIP</option>
            </select>
          </label>
          <label className="field">
            队列名称
            <input
              value={editingQueue.name}
              onChange={(e) =>
                setEditingQueue({ ...editingQueue, name: e.target.value })
              }
            />
          </label>
          <label className="field">
            所属科室
            <input
              list="configured-departments"
              value={editingQueue.department}
              onChange={(e) => {
                const department = state.records.guideDepartments?.find(
                  (d) => d.name === e.target.value,
                );
                setEditingQueue({
                  ...editingQueue,
                  department: e.target.value,
                  ...(department
                    ? { departmentCode: department.code, zone: department.zone }
                    : {}),
                });
              }}
            />
            <datalist id="configured-departments">
              {state.records.guideDepartments?.map((d) => (
                <option key={d.id} value={d.name} />
              ))}
            </datalist>
          </label>
          <label className="field">
            所属区域
            <input
              value={editingQueue.zone}
              onChange={(e) =>
                setEditingQueue({ ...editingQueue, zone: e.target.value })
              }
            />
          </label>
          <label className="field">
            平均服务分钟
            <input
              type="number"
              min="1"
              value={editingQueue.minutes}
              onChange={(e) =>
                setEditingQueue({
                  ...editingQueue,
                  minutes: Number(e.target.value),
                })
              }
            />
          </label>
          <fieldset>
            <legend>可入队检查项目</legend>
            {[...new Set(state.packages.flatMap((p) => p.items))].map(
              (item) => (
                <label className="check-line" key={item}>
                  <input
                    type="checkbox"
                    checked={editingQueue.items.includes(item)}
                    onChange={(e) =>
                      setEditingQueue({
                        ...editingQueue,
                        items: e.target.checked
                          ? [...editingQueue.items, item]
                          : editingQueue.items.filter(
                              (x: string) => x !== item,
                            ),
                      })
                    }
                  />
                  {item}
                </label>
              ),
            )}
          </fieldset>
          <label className="check-line">
            <input
              type="checkbox"
              checked={editingQueue.enabled}
              onChange={(e) =>
                setEditingQueue({ ...editingQueue, enabled: e.target.checked })
              }
            />
            允许开启该队列
          </label>
          {queueError && (
            <div className="callout alert" role="alert">
              {queueError}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditingQueue(null)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveQueueDefinition}>
              保存并应用队列配置
            </button>
          </div>
        </Modal>
      )}
      {clearMode && (
        <Modal title="确认清空演示队列" onClose={() => setClearMode(null)}>
          <p>
            将清空所选 {selectedQueues.length} 个队列的
            {clearMode === "all"
              ? "全部客户（候检、呼叫、暂停、过号和已检列表）"
              : "过号 / 暂离客户"}
            ，不影响体检结果。原状态保存在审计和清空历史中。
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setClearMode(null)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={clear}>
              确认清空
            </button>
          </div>
        </Modal>
      )}
      {skip && (
        <Modal title="登记过号原因" onClose={() => setSkip("")}>
          <label className="field">
            过号 / 暂离原因
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setSkip("")}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={!reason.trim() || !open}
              onClick={() => {
                const t = tickets.find((t) => t.id === skip);
                save({ ...t, status: "missed", reason });
                setSkip("");
              }}
            >
              确认过号
            </button>
          </div>
        </Modal>
      )}
      {adding && (
        <Modal title="手动加入科室队列" onClose={() => setAdding(false)}>
          <label className="field">
            选择已到检客户
            <select
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            >
              {candidates.map((a) => (
                <option value={a.id} key={a.id}>
                  {state.patients.find((p) => p.id === a.patientId)?.name} ·{" "}
                  {a.id}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setAdding(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={
                !candidate ||
                !open ||
                !candidates.some((a) => a.id === candidate)
              }
              onClick={() => {
                save({
                  id: `${dept}-${candidate}`,
                  department: dept,
                  appointmentId: candidate,
                  status: "waiting",
                  position: Math.max(0, ...list.map((t) => t.position)) + 1,
                  waitMinutes: definition.minutes,
                });
                setAdding(false);
              }}
            >
              确认入队
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
