import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Volume2 } from "lucide-react";
import { useDemo } from "../store";
import { Badge, Empty, Modal, PageTitle } from "../ui";
const areas: Record<string, string> = {
  采血区: "血常规",
  超声区: "腹部彩超",
  心电图区: "心电图",
  一般检查区: "一般检查",
};
export default function Queue({ screen = false }: { screen?: boolean }) {
  const { state, act } = useDemo();
  const [dept, setDept] = useState("采血区");
  const [skip, setSkip] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [notice, setNotice] = useState("");
  const eligible = state.appointments.filter((a) =>
    ["checked", "in_exam"].includes(a.status),
  );
  useEffect(() => {
    if (state.records.queueTickets === undefined) {
      Object.entries(areas).forEach(([department, item]) =>
        eligible
          .filter((a) => a.items.includes(item))
          .forEach((a, i) =>
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "queueTickets",
                record: {
                  id: `${department}-${a.id}`,
                  department,
                  appointmentId: a.id,
                  status: "waiting",
                  position: i,
                  waitMinutes: 5 + i * 3,
                  createdAt: new Date().toISOString(),
                },
              },
            }),
          ),
      );
      if (!eligible.length)
        act({
          type: "UPSERT_RECORD",
          payload: {
            collection: "queueTickets",
            record: { id: "INIT", status: "init" },
          },
        });
    }
  }, []);
  const tickets = (state.records.queueTickets || []).filter(
    (t) => t.department === dept,
  );
  const list = tickets
    .filter((t) => ["waiting", "calling"].includes(t.status))
    .sort((a, b) => a.position - b.position);
  const current = list.find((t) => t.status === "calling");
  const missed = tickets.filter((t) => t.status === "missed");
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
    if (current && current.id !== ticket.id)
      save({ ...current, status: "waiting" });
    save({
      ...ticket,
      status: "calling",
      calledAt: new Date().toLocaleTimeString("zh-CN"),
      callCount: (ticket.callCount || 0) + 1,
    });
    setNotice("呼叫记录已更新；现场语音与微信推送为模拟。");
  };
  const move = (index: number, offset: number) => {
    const other = list[index + offset];
    if (!other) return;
    save({ ...list[index], position: other.position });
    save({ ...other, position: list[index].position });
  };
  const candidates = eligible.filter(
    (a) =>
      a.items.includes(areas[dept]) &&
      !tickets.some((t) => t.appointmentId === a.id && t.status !== "done"),
  );
  return (
    <>
      <PageTitle
        eyebrow="SMART GUIDE / 智能导检"
        title={screen ? "候检区信息大屏" : "智能导检与队列调度"}
        description="各科室独立候检、手动排序、重呼、过号召回与完成出队。语音和微信通知均为模拟。"
        actions={
          <a className="btn" href={screen ? "#/queue" : "#/queue?screen=1"}>
            {screen ? "退出大屏" : "候检大屏"}
          </a>
        }
      />
      <div className="queue-layout">
        <div>
          <div className="tabs">
            {Object.keys(areas).map((d) => (
              <button
                key={d}
                className={dept === d ? "active" : ""}
                onClick={() => {
                  setDept(d);
                  setNotice("");
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <section className="call-screen">
            <div className="eyebrow">PLEASE PROCEED TO / 请前往</div>
            <h2>{dept} · 02 诊室</h2>
            <div className="calling-name">
              {current
                ? displayName(patients(current)?.name || "演示客户")
                : "等候呼叫"}
            </div>
            <p>
              {current?.appointmentId || "请选择候检客户"} ·{" "}
              {current?.calledAt || "当前未呼叫"}
            </p>
            <div className="call-info">
              <span>
                <span className="live-dot" />
                候检 {list.length} 人
              </span>
              <span>预计等待 {list.length * 5} 分钟</span>
              <span>独立队列 · 模拟</span>
            </div>
          </section>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>{dept}候检队列</h2>
              <div className="actions">
                <button
                  className="btn"
                  disabled={!candidates.length}
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
                  disabled={!list.length}
                  onClick={() =>
                    call(list.find((t) => t.status !== "calling") || list[0])
                  }
                >
                  <Volume2 size={15} />
                  呼叫下一位
                </button>
              </div>
            </div>
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
                <button
                  className="icon-btn"
                  aria-label={"上移" + patients(t)?.name}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={"下移" + patients(t)?.name}
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button className="text-btn" onClick={() => call(t)}>
                  呼叫 / 重呼
                </button>
                <button
                  className="text-btn"
                  onClick={() => {
                    setSkip(t.id);
                    setReason("");
                  }}
                >
                  过号
                </button>
                <button
                  className="text-btn"
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
              </div>
            ))}
            {!list.length && <Empty text="当前科室队列已清空" />}
          </section>
        </div>
        <aside>
          <section className="panel">
            <h3>检查路径建议</h3>
            <div className="path-steps">
              {[
                "01 采血区 · 需空腹",
                "02 腹部超声 · 需空腹",
                "03 营养早餐区",
                "04 心电图 · 二楼",
                "05 一般检查 · 二楼",
              ].map((x, i) => (
                <div className={i === 0 ? "active" : ""} key={x}>
                  <i />
                  {x}
                </div>
              ))}
            </div>
            <p className="muted">
              路线为固定规则示例，未接入真实定位与医院地图。
            </p>
          </section>
          <section className="panel">
            <h3>调度与隐私配置</h3>
            <label className="field">
              排序模式
              <select
                value={state.config.queueRule}
                onChange={(e) => {
                  act({
                    type: "UPDATE_CONFIG",
                    payload: { queueRule: e.target.value },
                  });
                  const ordered = [...list].sort((a, b) =>
                    e.target.value === "最短等待优先"
                      ? a.waitMinutes - b.waitMinutes
                      : String(a.appointmentId).localeCompare(
                          String(b.appointmentId),
                        ),
                  );
                  ordered.forEach((t, i) => save({ ...t, position: i }));
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
            <h4 style={{ marginTop: 20 }}>过号队列 · {missed.length} 人</h4>
            {missed.map((t) => (
              <div className="queue-row" key={t.id}>
                <div>
                  <strong>
                    {displayName(patients(t)?.name || "演示客户")}
                  </strong>
                  <small>{t.reason}</small>
                </div>
                <button
                  className="text-btn"
                  onClick={() =>
                    save({
                      ...t,
                      status: "waiting",
                      position: Math.max(0, ...list.map((t) => t.position)) + 1,
                    })
                  }
                >
                  召回入队
                </button>
              </div>
            ))}
            {!missed.length && <p className="muted">暂无过号记录</p>}
          </section>
        </aside>
      </div>
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
              disabled={!reason.trim()}
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
              disabled={!candidate}
              onClick={() => {
                save({
                  id: `${dept}-${candidate}`,
                  department: dept,
                  appointmentId: candidate,
                  status: "waiting",
                  position: Math.max(0, ...list.map((t) => t.position)) + 1,
                  waitMinutes: 5,
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
