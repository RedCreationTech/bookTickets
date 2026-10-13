import { useState, useRef } from "react";
import { useDemo, today, exportCsv } from "../store";
import type { DemoState, Appointment } from "../model";
import { Empty } from "../ui";
export const groupOrders = (s: DemoState) => s.records.groupOrders || [];
export function applicableGroup(
  s: DemoState,
  patientId: string,
  date = today(),
) {
  const p = s.patients.find((p) => p.id === patientId);
  const group = groupOrders(s).find(
    (g) =>
      g.company === p?.company &&
      g.status === "生效" &&
      (!g.startDate || g.startDate <= date) &&
      (!g.endDate || g.endDate >= date) &&
      (!g.members?.length || g.members.includes(patientId)),
  );
  if (!group) return undefined;
  const subgroup = (s.records.groupPersonnelGroups || []).find(
    (g) => g.groupOrderId === group.id && g.members?.includes(patientId),
  );
  return subgroup
    ? {
        ...group,
        personnelGroupId: subgroup.id,
        personnelGroupName: subgroup.name,
        packages: [subgroup.packageId],
        packageChooseCount: 1,
        optionalItems: subgroup.optionalItems || group.optionalItems,
        choose: subgroup.choose ?? group.choose,
      }
    : group;
}
export function groupForBooking(
  s: DemoState,
  patientId: string,
  date: string,
  context: {
    relative?: boolean;
    sponsorPatientId?: string;
    company?: string;
  } = {},
) {
  if (!context.relative) return applicableGroup(s, patientId, date);
  if (
    !s.patients.some((p) => p.id === patientId) ||
    !context.sponsorPatientId ||
    context.sponsorPatientId === patientId
  )
    return undefined;
  const group = applicableGroup(s, context.sponsorPatientId, date);
  if (!group || (context.company && group.company !== context.company))
    return undefined;
  return {
    ...group,
    packages: group.relativePackages?.length
      ? group.relativePackages
      : group.packages,
    relativeBooking: true,
    sponsorPatientId: context.sponsorPatientId,
  };
}
export function groupDiscountPercent(group: any, relative = false) {
  const value = Number(
    relative
      ? (group?.relativeDiscount ?? group?.discount ?? 100)
      : (group?.discount ?? 100),
  );
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
}
export function splitGroupAmount(
  group: any,
  rows: { item: string; amount: number }[],
) {
  if (!group)
    return {
      unit: 0,
      personal: Math.round(rows.reduce((n, r) => n + r.amount, 0) * 100) / 100,
    };
  const units = rows
    .filter((r) => group.personalItems?.includes(r.item) !== true)
    .reduce((n, r) => n + r.amount, 0);
  const unit =
    group.mode === "无限额"
      ? units
      : Math.min(units, Number(group.budget) || 0);
  return {
    unit: Math.round(unit * 100) / 100,
    personal:
      Math.round((rows.reduce((n, r) => n + r.amount, 0) - unit) * 100) / 100,
  };
}
export function GroupContractWorkbench() {
  const { state, act } = useDemo();
  const [id, setId] = useState("");
  const [name, setName] = useState("2026年度团检");
  const [company, setCompany] = useState("星辰科技");
  const [mode, setMode] = useState("限额自选");
  const [budget, setBudget] = useState(899);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("2027-12-31");
  const [packages, setPackages] = useState(["PK02"]);
  const [members, setMembers] = useState<string[]>([]);
  const [personal, setPersonal] = useState("肺功能");
  const [extras, setExtras] = useState("骨密度、颈动脉彩超");
  const [choose, setChoose] = useState(1);
  const [packageChooseCount, setPackageChooseCount] = useState(1);
  const [discount, setDiscount] = useState(100);
  const [relativeDiscount, setRelativeDiscount] = useState(100);
  const [relativePayment, setRelativePayment] = useState("self");
  const [relativePackages, setRelativePackages] = useState<string[]>([]);
  const [money, setMoney] = useState(1000);
  const [message, setMessage] = useState("");
  const [subgroupName, setSubgroupName] = useState("一线员工");
  const [subgroupPackage, setSubgroupPackage] = useState("PK02");
  const [subgroupMembers, setSubgroupMembers] = useState<string[]>([]);
  const guard = useRef(false);
  const groups = groupOrders(state);
  const selected = groups.find((g) => g.id === id);
  const account = (state.records.groupAccounts || []).find(
    (a) => a.id === "GA-" + id,
  ) || { id: "GA-" + id, balance: 0, ledger: [], settledIds: [] };
  const orders = state.appointments.filter(
    (a) => a.groupOrderId === id && a.status !== "cancelled",
  );
  const upsert = (collection: string, record: any) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  const load = (g: any) => {
    setId(g.id);
    setName(g.name);
    setCompany(g.company);
    setMode(g.mode);
    setBudget(g.budget);
    setPackages(g.packages || []);
    setMembers(g.members || []);
    setPersonal((g.personalItems || []).join("、"));
    setExtras((g.optionalItems || []).join("、"));
    setChoose(g.choose || 0);
    setPackageChooseCount(g.packageChooseCount || 1);
    setDiscount(g.discount ?? 100);
    setRelativeDiscount(g.relativeDiscount ?? g.discount ?? 100);
    setRelativePayment(g.relativePayment || "self");
    setRelativePackages(g.relativePackages || []);
    setStartDate(g.startDate);
    setEndDate(g.endDate);
    setMessage("");
  };
  const settlement = (a: Appointment) =>
    a.groupSplit ||
    splitGroupAmount(
      selected,
      a.pricing ||
        a.items.map((i) => ({ item: i, amount: a.amount / a.items.length })),
    );
  return (
    <div>
      <div className="notice">
        单位订单、预算和预付款全部是本地演示账本，不发生真实资金流转。普通CRM合同不会自动成为团检订单。
      </div>
      <div className="actions">
        {groups.map((g) => (
          <button className="btn" key={g.id} onClick={() => load(g)}>
            {g.company} · {g.name} ({g.status})
          </button>
        ))}
        <button
          className="btn"
          onClick={() => {
            setId("");
            setName("新团检订单");
            setMembers([]);
            setMessage("");
          }}
        >
          新建单位订单
        </button>
      </div>
      <div className="form-grid">
        <label>
          单位订单名称
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          单位名称
          <select
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setMembers([]);
            }}
          >
            {[...new Set(state.patients.map((p) => p.company))]
              .filter((x) => x !== "个检")
              .map((x) => (
                <option key={x}>{x}</option>
              ))}
          </select>
        </label>
        <label>
          预算模式
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option>固定套餐</option>
            <option>限额自选</option>
            <option>无限额</option>
          </select>
        </label>
        <label>
          单位承担上限
          <input
            type="number"
            min="0"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>
        <label>
          起始日期
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          截止日期
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label>
          个人承担项目（顿号分隔）
          <input
            value={personal}
            onChange={(e) => setPersonal(e.target.value)}
          />
        </label>
        <label>
          单位自选加项包
          <input value={extras} onChange={(e) => setExtras(e.target.value)} />
        </label>
        <label>
          自选包必须选M项
          <input
            type="number"
            min="0"
            value={choose}
            onChange={(e) => setChoose(Number(e.target.value))}
          />
        </label>
      </div>
      <label>
        允许套餐必须选M套
        <input
          type="number"
          min="1"
          max={packages.length || 1}
          value={packageChooseCount}
          onChange={(e) => setPackageChooseCount(Number(e.target.value))}
        />
      </label>
      <h3>允许套餐</h3>
      {state.packages.map((p) => (
        <label className="check-line" key={p.id}>
          <input
            type="checkbox"
            checked={packages.includes(p.id)}
            onChange={(e) =>
              setPackages(
                e.target.checked
                  ? [...packages, p.id]
                  : packages.filter((x) => x !== p.id),
              )
            }
          />
          {p.name}
        </label>
      ))}
      <h3>单位折扣与亲属预约承担方式</h3>
      <p className="muted">
        折扣以百分比保存；不参与折扣项目仍按原价。亲属须关联有效单位员工，真实身份与支付均未验证。
      </p>
      <div className="form-grid">
        <label>
          单位执行折扣（%）
          <input
            type="number"
            min="0"
            max="100"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
        </label>
        <label>
          亲属执行折扣（%）
          <input
            type="number"
            min="0"
            max="100"
            value={relativeDiscount}
            onChange={(e) => setRelativeDiscount(Number(e.target.value))}
          />
        </label>
        <label>
          亲属付款策略
          <select
            value={relativePayment}
            onChange={(e) => setRelativePayment(e.target.value)}
          >
            <option value="self">享单位折扣后全额自费</option>
            <option value="unit">单位按预算承担，超额及个人项目自费</option>
          </select>
        </label>
      </div>
      <h4>亲属专属套餐（未选沿用单位套餐）</h4>
      {state.packages.map((pack) => (
        <label key={pack.id} className="check-line">
          <input
            type="checkbox"
            aria-label={`亲属专属套餐：${pack.name}`}
            checked={relativePackages.includes(pack.id)}
            onChange={(e) =>
              setRelativePackages(
                e.target.checked
                  ? [...relativePackages, pack.id]
                  : relativePackages.filter((id) => id !== pack.id),
              )
            }
          />
          {pack.name}
        </label>
      ))}
      <h3>单位名单（未选表示全员）</h3>
      {state.patients
        .filter((p) => p.company === company)
        .map((p) => (
          <label className="check-line" key={p.id}>
            <input
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
            {p.name} · {p.sex}
          </label>
        ))}
      <button
        className="btn btn-primary"
        onClick={() => {
          if (
            !name.trim() ||
            !packages.length ||
            budget < 0 ||
            startDate > endDate
          )
            return setMessage("请核对名称、套餐、非负预算和日期");
          if (
            !Number.isInteger(packageChooseCount) ||
            packageChooseCount < 1 ||
            packageChooseCount > packages.length ||
            (mode === "固定套餐" && packageChooseCount !== 1)
          )
            return setMessage("套餐N选M数量须在允许范围内，固定套餐只能选1套");
          if (
            ![discount, relativeDiscount].every(
              (value) => Number.isFinite(value) && value >= 0 && value <= 100,
            )
          )
            return setMessage("单位和亲属折扣须在 0 至 100 之间");
          if (
            relativePackages.length &&
            relativePackages.length < packageChooseCount
          )
            return setMessage("亲属专属套餐数量不足以满足必选套数");
          const optionalItems = extras
            .split(/[、,]/)
            .map((x) => x.trim())
            .filter(Boolean);
          if (choose < 0 || choose > optionalItems.length)
            return setMessage("N选M数量超出自选包范围");
          const key = id || "GO-" + Date.now();
          upsert("groupOrders", {
            ...selected,
            id: key,
            name,
            company,
            mode,
            budget,
            startDate,
            endDate,
            packages,
            packageChooseCount,
            discount,
            relativeDiscount,
            relativePayment,
            relativePackages,
            members,
            personalItems: personal.split(/[、,]/).filter(Boolean),
            optionalItems,
            choose,
            status: "生效",
          });
          setId(key);
          setMessage(
            "单位订单已生效，开单按单位自动带入套餐/自选包和预算分摊。",
          );
        }}
      >
        保存生效单位订单
      </button>
      {selected && (
        <button
          className="btn"
          onClick={() =>
            upsert("groupOrders", {
              ...selected,
              status: selected.status === "生效" ? "停用" : "生效",
            })
          }
        >
          {selected.status === "生效" ? "停用订单" : "启用订单"}
        </button>
      )}
      {selected && (
        <>
          <h3>单位人员分组与专属套餐</h3>
          <div className="form-grid">
            <label>
              人员分组名称
              <input
                value={subgroupName}
                onChange={(e) => setSubgroupName(e.target.value)}
              />
            </label>
            <label>
              分组套餐
              <select
                value={subgroupPackage}
                onChange={(e) => setSubgroupPackage(e.target.value)}
              >
                {state.packages
                  .filter((p) => selected.packages.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {state.patients
            .filter((p) => p.company === selected.company)
            .map((p) => (
              <label className="check-line" key={p.id}>
                <input
                  type="checkbox"
                  checked={subgroupMembers.includes(p.id)}
                  onChange={(e) =>
                    setSubgroupMembers(
                      e.target.checked
                        ? [...subgroupMembers, p.id]
                        : subgroupMembers.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.name}加入分组
              </label>
            ))}
          <button
            className="btn"
            onClick={() => {
              if (
                !subgroupName.trim() ||
                !subgroupMembers.length ||
                !selected.packages.includes(subgroupPackage)
              )
                return setMessage("请填写分组、成员和有效单位套餐");
              if (
                (state.records.groupPersonnelGroups || []).some(
                  (g) =>
                    g.groupOrderId === id &&
                    g.name !== subgroupName &&
                    g.members.some((p: string) => subgroupMembers.includes(p)),
                )
              )
                return setMessage("所选成员已属于其他组，请先移除或编辑原组");
              upsert("groupPersonnelGroups", {
                id: "GPG-" + id + "-" + subgroupName,
                groupOrderId: id,
                name: subgroupName,
                packageId: subgroupPackage,
                members: subgroupMembers,
              });
              setMessage("人员分组已保存，开单会自动带出该组套餐");
            }}
          >
            保存人员分组
          </button>
          {(state.records.groupPersonnelGroups || [])
            .filter((g) => g.groupOrderId === id)
            .map((g) => (
              <p key={g.id}>
                {g.name} ·{" "}
                {state.packages.find((p) => p.id === g.packageId)?.name} ·{" "}
                {g.members.length}人
                <button
                  className="text-btn"
                  onClick={() => {
                    setSubgroupName(g.name);
                    setSubgroupPackage(g.packageId);
                    setSubgroupMembers(g.members);
                  }}
                >
                  编辑分组
                </button>
                <button
                  className="text-btn"
                  onClick={() =>
                    act({
                      type: "DELETE_RECORD",
                      payload: { collection: "groupPersonnelGroups", id: g.id },
                    })
                  }
                >
                  移除分组
                </button>
              </p>
            ))}
          <h3>预付款账本 · 余额 ¥{Number(account.balance).toFixed(2)}</h3>
          <label>
            本地入账金额
            <input
              type="number"
              min="0.01"
              value={money}
              onChange={(e) => setMoney(Number(e.target.value))}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (guard.current) return;
              if (!Number.isFinite(money) || money <= 0)
                return setMessage("入账金额须大于0");
              guard.current = true;
              upsert("groupAccounts", {
                ...account,
                balance: Math.round((account.balance + money) * 100) / 100,
                ledger: [
                  ...account.ledger,
                  {
                    id: "L-" + Date.now(),
                    type: "预付款入账",
                    amount: money,
                    at: new Date().toISOString(),
                  },
                ],
              });
              setMessage("本地预付款已记账");
              queueMicrotask(() => {
                guard.current = false;
              });
            }}
          >
            模拟预付款入账
          </button>
          <h3>单位/个人分摊明细</h3>
          <table>
            <thead>
              <tr>
                <th>客户 / 订单</th>
                <th>分组 / 套餐 / 项目</th>
                <th>单位</th>
                <th>个人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((a) => {
                const charge = settlement(a);
                return (
                  <tr key={a.id}>
                    <td>
                      {state.patients.find((p) => p.id === a.patientId)?.name}
                      <small>{a.id}</small>
                    </td>
                    <td>
                      <strong>{a.groupPersonnelName || "未分组"}</strong>
                      {a.items.join("、")}
                      <small>弃检：{(a.waived || []).join("、") || "无"}</small>
                    </td>
                    <td>¥{charge.unit.toFixed(2)}</td>
                    <td>¥{charge.personal.toFixed(2)}</td>
                    <td>
                      <button
                        className="btn"
                        disabled={account.settledIds.includes(a.id)}
                        onClick={() => {
                          if (account.settledIds.includes(a.id)) return;
                          if (account.balance < charge.unit)
                            return setMessage("预付款余额不足，不能透支结算");
                          upsert("groupAccounts", {
                            ...account,
                            balance:
                              Math.round(
                                (account.balance - charge.unit) * 100,
                              ) / 100,
                            settledIds: [...account.settledIds, a.id],
                            ledger: [
                              ...account.ledger,
                              {
                                id: "SET-" + a.id,
                                type: "单位体检结算",
                                amount: -charge.unit,
                                appointmentId: a.id,
                                at: new Date().toISOString(),
                              },
                            ],
                          });
                          setMessage("单位承担已扣减，本地交易已关联订单。");
                        }}
                      >
                        {account.settledIds.includes(a.id)
                          ? "已结算"
                          : "预付款扣减"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!orders.length && (
            <Empty text="请在预约开单中使用此单位的合成客户建单" />
          )}
          <button
            className="btn"
            onClick={() =>
              exportCsv(
                "团检单位结算明细.csv",
                orders.map((a) => ({
                  体检号: a.id,
                  客户: state.patients.find((p) => p.id === a.patientId)?.name,
                  套餐: state.packages.find((p) => p.id === a.packageId)?.name,
                  分组: a.groupPersonnelName || "未分组",
                  项目: a.items.join("、"),
                  单位承担: settlement(a).unit,
                  个人承担: settlement(a).personal,
                  弃检: (a.waived || []).join("、"),
                })),
              )
            }
          >
            导出团检项目及分组结算
          </button>
          <ul>
            {account.ledger.map((l: any) => (
              <li key={l.id}>
                {l.at} · {l.type} ¥{l.amount.toFixed(2)} {l.appointmentId || ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function InvoiceLedger() {
  const { state, act } = useDemo();
  const [ids, setIds] = useState<string[]>([]);
  const [seller, setSeller] = useState("演示业务员甲");
  const [split, setSplit] = useState(100);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const invoices = state.records.invoiceLedger || [];
  const eligible = state.appointments.filter(
    (a) => !["booked", "cancelled"].includes(a.status) && !a.refunded,
  );
  const total =
    Math.round(
      eligible
        .filter((a) => ids.includes(a.id))
        .reduce((n, a) => n + a.amount, 0) * 100,
    ) / 100;
  const used = (id: string) =>
    invoices.some((r) => r.status === "有效" && r.appointmentIds.includes(id));
  return (
    <section className="panel">
      <h2>本地发票台账与业务员关联</h2>
      <p>
        模拟发票仅为本地演示记录，无税务效力。合并/拆分均保留原订单关联，不允许重复有效开票。
      </p>
      <div className="form-grid">
        <label>
          开票业务员
          <input value={seller} onChange={(e) => setSeller(e.target.value)} />
        </label>
        <label>
          拆分第一张比例%
          <input
            type="number"
            min="1"
            max="100"
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
          />
        </label>
      </div>
      {eligible.map((a) => (
        <label className="check-line" key={a.id}>
          <input
            type="checkbox"
            disabled={used(a.id)}
            checked={ids.includes(a.id)}
            onChange={(e) =>
              setIds(
                e.target.checked
                  ? [...ids, a.id]
                  : ids.filter((i) => i !== a.id),
              )
            }
          />
          {a.id} · ¥{a.amount}
          {used(a.id) ? " · 已有有效开票" : ""}
        </label>
      ))}
      <strong>选中 ¥{total.toFixed(2)}</strong>
      <button
        className="btn"
        disabled={!ids.length}
        onClick={() => {
          if (busy.current) return;
          if (
            !seller.trim() ||
            !Number.isFinite(split) ||
            split < 1 ||
            split > 100
          )
            return setMessage("请填写业务员并将拆分比例设为1–100");
          if (ids.some(used)) return setMessage("部分订单已有效开票，需先作废");
          busy.current = true;
          const first = Math.round(total * split) / 100;
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "invoiceLedger",
              record: {
                id: "INV-DEMO-" + crypto.randomUUID(),
                appointmentIds: ids,
                seller,
                amount: total,
                parts:
                  split === 100
                    ? [total]
                    : [first, Math.round((total - first) * 100) / 100],
                status: "有效",
                createdAt: new Date().toISOString(),
              },
            },
          });
          setIds([]);
          setMessage("模拟开票台账已保存并关联业务员/原交易");
          queueMicrotask(() => {
            busy.current = false;
          });
        }}
      >
        确认模拟合并/拆分开票
      </button>
      <table>
        <thead>
          <tr>
            <th>模拟编号 / 订单</th>
            <th>金额 / 拆分</th>
            <th>业务员</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((r) => (
            <tr key={r.id}>
              <td>
                {r.id}
                <small>{r.appointmentIds.join("、")}</small>
              </td>
              <td>
                ¥{r.amount.toFixed(2)}
                <small>
                  {r.parts.map((n: number) => n.toFixed(2)).join(" + ")}
                </small>
              </td>
              <td>{r.seller}</td>
              <td>{r.status}</td>
              <td>
                <button
                  className="text-btn"
                  disabled={r.status === "已作废"}
                  onClick={() =>
                    act({
                      type: "UPSERT_RECORD",
                      payload: {
                        collection: "invoiceLedger",
                        record: {
                          ...r,
                          status: "已作废",
                          voidedAt: new Date().toISOString(),
                        },
                      },
                    })
                  }
                >
                  模拟作废
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn"
        onClick={() =>
          exportCsv(
            "模拟发票交易台账.csv",
            invoices.map((r) => ({
              编号: r.id,
              订单: r.appointmentIds.join("、"),
              金额: r.amount,
              业务员: r.seller,
              状态: r.status,
            })),
          )
        }
      >
        导出关联台账
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
