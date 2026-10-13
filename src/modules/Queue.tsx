import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Volume2 } from "lucide-react";
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
  const open = isOpen(dept);
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
    const affected = allTickets.filter(
      (t) =>
        selectedQueues.includes(t.department) &&
        (clearMode === "missed"
          ? t.status === "missed"
          : ["waiting", "calling", "missed", "done"].includes(t.status)),
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
  const visibleQueues = queues.filter(
    (q) =>
      (!query || `${q.name} ${q.department}`.includes(query)) &&
      (queueState === "全部" || (queueState === "已开启") === isOpen(q.id)),
  );
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>选择</th>
                  <th>队列 / 科室</th>
                  <th>区域</th>
                  <th>状态</th>
                  <th>等待 / 过号 / 已检</th>
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
                ? "队列已关闭"
                : current
                  ? displayName(patients(current)?.name || "演示客户")
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
                    <strong>
                      {displayName(patients(t)?.name || "演示客户")}
                    </strong>
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
          <section className="panel">
            <h3>已检客户 · {done.length} 人</h3>
            <ScrollList
              label="已检客户滚动列表"
              auto={screen && state.config.queueAutoScroll !== false}
            >
              {done.map((t) => (
                <div className="queue-row" key={t.id}>
                  <strong>
                    {displayName(patients(t)?.name || "演示客户")}
                  </strong>
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
                    <strong>
                      {displayName(patients(t)?.name || "演示客户")}
                    </strong>
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
      {editingQueue && (
        <Modal title="业务队列配置" onClose={() => setEditingQueue(null)}>
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
              ? "全部客户（候检、呼叫、过号和已检列表）"
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
