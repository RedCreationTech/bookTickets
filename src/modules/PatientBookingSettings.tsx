import { useState } from "react";
import { useDemo } from "../store";
import { getOrderRules } from "../orderingRules";
import { getPackageType } from "../bookingDisplay";

export default function PatientBookingSettings() {
  const { state, act } = useDemo();
  const [kind, setKind] = useState<"package" | "item">("package");
  const [resourceId, setResourceId] = useState(state.packages[0]?.id || "");
  const [daily, setDaily] = useState(""),
    [slot, setSlot] = useState(""),
    [time, setTime] = useState(""),
    [date, setDate] = useState("");
  const [notice, setNotice] = useState("");
  const [packId, setPackId] = useState(state.packages[0]?.id || "");
  const pack = state.packages.find((p) => p.id === packId);
  const [original, setOriginal] = useState(
    String(pack?.originalPrice ?? pack?.price ?? 0),
  );
  const [execution, setExecution] = useState(String(pack?.price ?? 0));
  const [packageType, setPackageType] = useState(
    pack ? getPackageType(pack) : "固定套餐",
  );
  const rules = getOrderRules(state);
  const [item, setItem] = useState(rules[0]?.item || "");
  const [itemOriginal, setItemOriginal] = useState(""),
    [itemExecution, setItemExecution] = useState("");
  const valid = (value: string) =>
    value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const saveLimit = () => {
    if (
      !resourceId ||
      [daily, slot].some(
        (v) => v !== "" && (!valid(v) || !Number.isInteger(Number(v))),
      ) ||
      (time && !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(time))
    ) {
      setNotice("请填写有效资源、非负整数名额及08:00-08:30格式时段。");
      return;
    }
    const id = `resource-${kind}-${encodeURIComponent(resourceId)}-${date || "all"}-${time || "all"}`;
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "bookingResourceLimits",
        record: {
          id,
          kind,
          resourceId,
          dailyCapacity: daily === "" ? null : Number(daily),
          slotCapacity: slot === "" ? null : Number(slot),
          time,
          date,
          enabled: true,
        },
      },
    });
    setNotice("套餐/项目名额已保存，H5、自助机及医护入口使用同一限额规则。");
  };
  return (
    <section className="panel" aria-label="患者预约配置联动">
      <h3>套餐与项目名额</h3>
      <p className="muted">
        空白为不限，0为禁约；每位有效订单对同一资源只占一份。取消订单释放额度。本地演示，不提供跨浏览器原子号源。
      </p>
      <div className="form-grid">
        <label>
          限额资源类型
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as typeof kind;
              setKind(next);
              setResourceId(
                next === "package"
                  ? state.packages[0]?.id || ""
                  : rules[0]?.item || "",
              );
            }}
          >
            <option value="package">套餐</option>
            <option value="item">单项目</option>
          </select>
        </label>
        <label>
          限额资源
          <select
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
          >
            {(kind === "package"
              ? state.packages.map((p) => ({ id: p.id, name: p.name }))
              : rules.map((r) => ({ id: r.item, name: r.item }))
            ).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          资源每日名额
          <input
            type="number"
            min="0"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
          />
        </label>
        <label>
          资源时段名额
          <input
            type="number"
            min="0"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
          />
        </label>
        <label>
          仅指定日期（空白全部）
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          仅指定时段（空白每段）
          <input
            placeholder="08:00-08:30"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
      <button className="btn btn-primary" onClick={saveLimit}>
        保存资源名额
      </button>
      {(state.records.bookingResourceLimits || []).map((r) => (
        <div className="panel" key={r.id}>
          <b>
            {r.kind === "package"
              ? state.packages.find((p) => p.id === r.resourceId)?.name
              : r.resourceId}
          </b>{" "}
          · {r.date || "全部日期"} · {r.time || "每个时段"} · 每日{" "}
          {r.dailyCapacity ?? "不限"} / 每段 {r.slotCapacity ?? "不限"}{" "}
          <button
            className="btn"
            onClick={() => {
              setKind(r.kind);
              setResourceId(r.resourceId);
              setDaily(r.dailyCapacity == null ? "" : String(r.dailyCapacity));
              setSlot(r.slotCapacity == null ? "" : String(r.slotCapacity));
              setTime(r.time || "");
              setDate(r.date || "");
            }}
          >
            编辑限额
          </button>
          <button
            className="btn"
            onClick={() =>
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "bookingResourceLimits",
                  record: { ...r, enabled: r.enabled === false },
                },
              })
            }
          >
            {r.enabled === false ? "启用限额" : "停用限额"}
          </button>
        </div>
      ))}
      <h3>套餐类型与独立价格</h3>
      <p className="muted">
        执行价是实际开单基础价，原价只用于展示。显示模式不改变已生成订单金额。
      </p>
      <div className="form-grid">
        <label>
          维护套餐
          <select
            value={packId}
            onChange={(e) => {
              const p = state.packages.find(
                (row) => row.id === e.target.value,
              )!;
              setPackId(p.id);
              setOriginal(String(p.originalPrice ?? p.price));
              setExecution(String(p.price));
              setPackageType(getPackageType(p));
            }}
          >
            {state.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          套餐类型
          <select
            value={packageType}
            onChange={(e) =>
              setPackageType(e.target.value as typeof packageType)
            }
          >
            <option>固定套餐</option>
            <option>筛查套餐</option>
          </select>
        </label>
        <label>
          套餐原价
          <input
            type="number"
            min="0"
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
          />
        </label>
        <label>
          套餐执行价
          <input
            type="number"
            min="0"
            value={execution}
            onChange={(e) => setExecution(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn btn-primary"
        onClick={() => {
          if (!pack || !valid(original) || !valid(execution)) {
            setNotice("套餐价格须为非负有效数值。");
            return;
          }
          act({
            type: "UPSERT_PACKAGE",
            payload: {
              ...pack,
              originalPrice: Number(original),
              price: Number(execution),
              packageType,
            },
          });
          setNotice("套餐类型和价格已保存。");
        }}
      >
        保存套餐类型及价格
      </button>
      <div className="form-grid">
        <label>
          维护单项目
          <select
            value={item}
            onChange={(e) => {
              const r = rules.find((row) => row.item === e.target.value)!;
              const saved = (state.records.orderingRules || []).find(
                (row) => row.item === r.item,
              );
              setItem(r.item);
              setItemOriginal(String(saved?.originalPrice ?? r.price ?? 0));
              setItemExecution(String(r.price ?? 0));
            }}
          >
            {rules.map((r) => (
              <option key={r.item}>{r.item}</option>
            ))}
          </select>
        </label>
        <label>
          项目原价
          <input
            type="number"
            min="0"
            value={itemOriginal}
            onChange={(e) => setItemOriginal(e.target.value)}
          />
        </label>
        <label>
          项目执行价
          <input
            type="number"
            min="0"
            value={itemExecution}
            onChange={(e) => setItemExecution(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn"
        onClick={() => {
          const rule = rules.find((r) => r.item === item);
          if (!rule || !valid(itemOriginal) || !valid(itemExecution)) {
            setNotice("项目价格须为非负有效数值。");
            return;
          }
          if (!state.records.orderingRules)
            for (const existing of rules) {
              act({
                type: "UPSERT_RECORD",
                payload: { collection: "orderingRules", record: existing },
              });
            }
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "orderingRules",
              record: {
                ...rule,
                id: rule.id || `ITEM-${encodeURIComponent(item)}`,
                originalPrice: Number(itemOriginal),
                price: Number(itemExecution),
              },
            },
          });
          setNotice("单项目独立价格已保存。");
        }}
      >
        保存项目价格
      </button>
      <label>
        患者价格显示模式
        <select
          value={state.config.priceMode || "执行价"}
          onChange={(e) =>
            act({
              type: "UPDATE_CONFIG",
              payload: {
                priceMode: e.target.value,
                showPrices: e.target.value !== "不显示",
              },
            })
          }
        >
          <option>原价</option>
          <option>执行价</option>
          <option>不显示</option>
        </select>
      </label>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
