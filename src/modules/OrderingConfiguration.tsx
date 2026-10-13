import { useState } from "react";
import type { Action, DemoState } from "../model";
import { getOrderRules } from "../orderingRules";
import {
  groupPackageChoices,
  getGroupOrderBookingRules,
} from "../groupImportRules";
import { Modal } from "../ui";
type Props = { state: DemoState; act: (action: Action) => void };
export function OrderingConfiguration({ state, act }: Props) {
  const rules = getOrderRules(state),
    groups = state.records.groupOrders || [];
  const [item, setItem] = useState(rules[0]?.item || ""),
    [campuses, setCampuses] = useState<string[]>(
      (rules[0] as any)?.campuses || [],
    ),
    [groupId, setGroupId] = useState(groups[0]?.id || ""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [capacity, setCapacity] = useState(20),
    [times, setTimes] = useState("08:00–08:30;08:30–09:00"),
    [enabled, setEnabled] = useState(true),
    [message, setMessage] = useState("");
  const load = (id: string) => {
    setGroupId(id);
    const row = getGroupOrderBookingRules(state, id),
      group = groups.find((g) => g.id === id);
    setStart(row?.startDate || group?.startDate || "");
    setEnd(row?.endDate || group?.endDate || "");
    setCapacity(row?.dailyCapacity ?? 20);
    setTimes(row?.allowedTimes || "08:00–08:30;08:30–09:00");
    setEnabled(row?.enabled !== false);
  };
  return (
    <section className="panel" style={{ padding: 20 }}>
      <h2>红创 · 院区项目与单位订单排期</h2>
      <p>
        项目范围作用于开单过滤和提交校验；同一单位多份订单使用独立 groupOrderId
        排期。
      </p>
      <div className="form-grid">
        <label>
          院区规则项目
          <select
            aria-label="院区规则项目"
            value={item}
            onChange={(e) => {
              setItem(e.target.value);
              setCampuses(
                (rules.find((r) => r.item === e.target.value) as any)
                  ?.campuses || [],
              );
            }}
          >
            {rules.map((r) => (
              <option key={r.id}>{r.item}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>项目允许院区（不选为全部）</legend>
          {["中心院区", "东院区"].map((campus) => (
            <label className="check-line" key={campus}>
              <input
                type="checkbox"
                aria-label={`项目允许${campus}`}
                checked={campuses.includes(campus)}
                onChange={(e) =>
                  setCampuses(
                    e.target.checked
                      ? [...campuses, campus]
                      : campuses.filter((c) => c !== campus),
                  )
                }
              />
              {campus}
            </label>
          ))}
        </fieldset>
      </div>
      <button
        className="btn"
        onClick={() => {
          const row = rules.find((r) => r.item === item);
          if (!row) return;
          rules.forEach((r) =>
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "orderingRules",
                record: r.item === item ? { ...r, campuses } : r,
              },
            }),
          );
          setMessage(`${item}院区范围已保存。`);
        }}
      >
        保存项目院区范围
      </button>
      <h3>按单位订单独立预约设置</h3>
      <div className="form-grid">
        <label>
          预约配置单位订单
          <select
            aria-label="预约配置单位订单"
            value={groupId}
            onChange={(e) => load(e.target.value)}
          >
            <option value="">请选择单位订单</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.company} · {g.name} · {g.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          订单排期起始
          <input
            aria-label="订单排期起始"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          订单排期截止
          <input
            aria-label="订单排期截止"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          订单独立日容量
          <input
            aria-label="订单独立日容量"
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label>
          订单允许时段
          <input
            aria-label="订单允许时段"
            value={times}
            onChange={(e) => setTimes(e.target.value)}
          />
        </label>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        启用此订单预约
      </label>
      <button
        className="btn btn-primary"
        onClick={() => {
          if (
            !groupId ||
            !start ||
            !end ||
            start > end ||
            !Number.isInteger(capacity) ||
            capacity < 1 ||
            !times.trim()
          )
            return setMessage("请选择订单、有效起止日期、正整数日容量和时段。");
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "groupOrderBookingRules",
              record: {
                id: `SCHEDULE-${groupId}`,
                groupOrderId: groupId,
                startDate: start,
                endDate: end,
                dailyCapacity: capacity,
                allowedTimes: times,
                enabled,
              },
            },
          });
          setMessage("已保存当前单位订单独立排期，其他同单位订单保持不变。");
        }}
      >
        保存单位订单预约设置
      </button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>单位订单</th>
              <th>日期</th>
              <th>容量 / 时段</th>
            </tr>
          </thead>
          <tbody>
            {(state.records.groupOrderBookingRules || []).map((r) => (
              <tr key={r.id}>
                <td>{r.groupOrderId}</td>
                <td>
                  {r.startDate} 至 {r.endDate}
                </td>
                <td>
                  {r.dailyCapacity} / {r.allowedTimes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function GroupPackageBrowser({
  state,
  patientId,
  campus,
  groupOrderId,
  onSelect,
}: {
  state: DemoState;
  patientId: string;
  campus: string;
  groupOrderId: string;
  onSelect?: (id: string, personalPay: boolean) => void;
}) {
  const [all, setAll] = useState(false),
    [detail, setDetail] = useState("");
  const choices = groupPackageChoices(
      state,
      patientId,
      campus,
      groupOrderId,
      all,
    ),
    selected = choices.find((p) => p.id === detail);
  return (
    <section aria-label="单位优先与全部套餐">
      <label className="check-line">
        <input
          aria-label="查看全部套餐"
          type="checkbox"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        查看全部套餐（默认单位专属优先）
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>套餐</th>
              <th>费用归属</th>
              <th>适用结果</th>
              <th>选择</th>
            </tr>
          </thead>
          <tbody>
            {choices.map((p) => (
              <tr key={p.id}>
                <td>
                  <button className="text-btn" onClick={() => setDetail(p.id)}>
                    {p.name}
                  </button>{" "}
                  ¥{p.price}
                </td>
                <td>
                  {p.unitCovered
                    ? "单位约定范围，按合同分摊"
                    : "单位外个人自费"}
                </td>
                <td>{p.errors.join("；") || "当前客户与院区可用"}</td>
                <td>
                  <button
                    className="btn"
                    aria-label={`选择浏览套餐${p.id}`}
                    disabled={!p.available || !onSelect}
                    onClick={() => onSelect?.(p.id, p.personalPay)}
                  >
                    选择此套餐
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <Modal title="套餐项目与费用说明" onClose={() => setDetail("")}>
          <h3>{selected.name}</h3>
          <ul>
            {selected.items.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{selected.errors.join("；") || "按所选单位合同规则结算"}</p>
        </Modal>
      )}
    </section>
  );
}
