import { useMemo, useState } from "react";
import { Download, ReceiptText } from "lucide-react";
import { useDemo } from "../store";
import type { DemoState } from "../model";
import { downloadCsv } from "./Operations";
type Amount = number | null;
const money = (value: unknown): Amount =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100) / 100
    : null;
const sum = (rows: Amount[]): Amount =>
  rows.some((v) => v === null)
    ? null
    : Math.round(rows.reduce<number>((n, v) => n + (v || 0), 0) * 100) / 100;
const show = (value: Amount) =>
  value === null ? "未登记" : `¥${value.toFixed(2)}`;
export function buildSettlementRows(state: DemoState) {
  return state.appointments.map((order) => {
    const patient = state.patients.find((p) => p.id === order.patientId);
    const contract = (state.records.groupOrders || []).find(
      (g) => g.id === order.groupOrderId,
    );
    const personnel =
      (state.records.groupPersonnelGroups || []).find(
        (g) => g.id === order.groupPersonnelId,
      ) ||
      (state.records.groupPersonnelGroups || []).find(
        (g) =>
          g.groupOrderId === order.groupOrderId &&
          g.members?.includes(order.patientId),
      );
    const selectedPackageIds = [
      ...new Set<string>(
        [order.packageId, ...(order.packageIds || [])].filter(Boolean),
      ),
    ];
    const selectedPackages = selectedPackageIds.map((id) =>
      state.packages.find((p) => p.id === id),
    );
    const packageCatalogComplete =
      selectedPackages.length > 0 && selectedPackages.every(Boolean);
    const packageItems = new Set(
      selectedPackages.flatMap((p) => p?.items || []),
    );
    const subgroupPack = state.packages.find(
      (p) => p.id === personnel?.packageId,
    );
    const total = money(order.amount);
    const unit =
      money(order.groupSplit?.unit) ?? (order.groupOrderId ? null : 0);
    const personal =
      money(order.groupSplit?.personal) ?? (order.groupOrderId ? null : total);
    const pricing: { item: string; amount: number }[] = Array.isArray(
      order.pricing,
    )
      ? order.pricing
      : [];
    const validPrices =
      pricing.length > 0 &&
      pricing.every((r) => money(r.amount) !== null) &&
      sum(pricing.map((r) => money(r.amount))) === total;
    const eligible = pricing.filter(
      (r) => !contract?.personalItems?.includes(r.item),
    );
    const eligibleTotal = sum(eligible.map((r) => money(r.amount))) || 0;
    let cumulative = 0;
    const allocatable =
      validPrices &&
      unit !== null &&
      personal !== null &&
      sum([unit, personal]) === total &&
      unit <= eligibleTotal;
    const lines = [
      ...new Set([
        ...order.items,
        ...pricing.map((r) => r.item),
        ...(order.waived || []),
      ]),
    ].map((item) => {
      const price = pricing.find((r) => r.item === item);
      const amount = money(price?.amount);
      let unitAmount: Amount = null;
      if (allocatable && amount !== null) {
        if (contract?.personalItems?.includes(item) || eligibleTotal === 0)
          unitAmount = 0;
        else {
          const before = Math.round((cumulative / eligibleTotal) * unit! * 100);
          cumulative += amount;
          unitAmount =
            (Math.round((cumulative / eligibleTotal) * unit! * 100) - before) /
            100;
        }
      }
      return {
        item,
        amount,
        unit: unitAmount,
        personal:
          amount !== null && unitAmount !== null
            ? Math.round((amount - unitAmount) * 100) / 100
            : null,
        packageItem: packageCatalogComplete ? packageItems.has(item) : null,
        subgroupPackageItem: subgroupPack
          ? subgroupPack.items.includes(item)
          : null,
        waived: (order.waived || []).includes(item),
      };
    });
    const account = (state.records.groupAccounts || []).find(
      (a) => a.id === "GA-" + order.groupOrderId,
    );
    const unitPaid =
      money(order.unitPaidAmount) ??
      (unit === 0
        ? 0
        : account?.settledIds?.includes(order.id)
          ? unit
          : order.status === "booked"
            ? 0
            : null);
    const personalPaid =
      money(order.personalPaidAmount) ??
      (personal === 0
        ? 0
        : order.paidAt
          ? personal
          : order.status === "booked"
            ? 0
            : null);
    const paid = money(order.paidAmount) ?? sum([unitPaid, personalPaid]);
    const refund = order.refunded
      ? money(order.refundAmount)
      : order.refundRequested
        ? money(order.refundRequestedAmount)
        : 0;
    const due =
      order.status === "cancelled"
        ? 0
        : total !== null && paid !== null
          ? Math.max(0, Math.round((total - paid) * 100) / 100)
          : null;
    const pendingRefund = order.refunded
      ? 0
      : order.refundRequested
        ? money(order.refundRequestedAmount)
        : order.status === "cancelled"
          ? paid
          : 0;
    return {
      id: order.id,
      patientId: order.patientId,
      name: patient?.name || "未登记",
      company: contract?.company || patient?.company || "未登记",
      date: order.date,
      groupId: personnel?.id || order.groupPersonnelId || "",
      groupName: personnel?.name || order.groupPersonnelName || "未登记人员组",
      groupMembers: personnel?.members?.length ?? null,
      packageName:
        selectedPackages.map((p) => p?.name || "未登记套餐").join("、") ||
        "未登记",
      total,
      unit,
      personal,
      paid,
      due,
      pendingRefund,
      refund,
      packageAmount:
        !pricing.length || !packageCatalogComplete
          ? null
          : sum(lines.filter((l) => l.packageItem).map((l) => l.amount)),
      subgroupPackageAmount:
        !pricing.length || !subgroupPack
          ? null
          : sum(
              lines.filter((l) => l.subgroupPackageItem).map((l) => l.amount),
            ),
      extraUnitAmount:
        !pricing.length || !packageCatalogComplete
          ? null
          : sum(
              lines.filter((l) => l.packageItem === false).map((l) => l.unit),
            ),
      waivedAmount: sum(lines.filter((l) => l.waived).map((l) => l.amount)),
      selfPayAmount: !pricing.length ? null : sum(lines.map((l) => l.personal)),
      lines,
      allocation: allocatable
        ? "按订单承担比例分摊（个人指定项目先剔除）"
        : "项目承担未登记或金额不一致",
      status: order.status,
    };
  });
}
export function settlementSubtotals(
  rows: ReturnType<typeof buildSettlementRows>,
) {
  const keys = [
    ...new Set(
      rows.map((r) => JSON.stringify([r.company, r.groupId, r.groupName])),
    ),
  ];
  return keys.map((key) => {
    const group = rows.filter(
      (r) => JSON.stringify([r.company, r.groupId, r.groupName]) === key,
    );
    return {
      company: group[0].company,
      groupName: group[0].groupName,
      count: group.length,
      people: new Set(group.map((r) => r.patientId)).size,
      registeredMembers: group[0].groupMembers,
      total: sum(group.map((r) => r.total)),
      unit: sum(group.map((r) => r.unit)),
      personal: sum(group.map((r) => r.personal)),
      due: sum(group.map((r) => r.due)),
      pendingRefund: sum(group.map((r) => r.pendingRefund)),
      packageAmount: sum(group.map((r) => r.packageAmount)),
      subgroupPackageAmount: sum(group.map((r) => r.subgroupPackageAmount)),
      extraUnitAmount: sum(group.map((r) => r.extraUnitAmount)),
      waivedAmount: sum(group.map((r) => r.waivedAmount)),
      selfPayAmount: sum(group.map((r) => r.selfPayAmount)),
    };
  });
}
export const settlementCsvRows = (
  rows: ReturnType<typeof buildSettlementRows>,
) =>
  settlementSubtotals(rows).map((r) => ({
    单位: r.company,
    人员组: r.groupName,
    订单数: r.count,
    本次人数: r.people,
    登记组人数: r.registeredMembers ?? "未登记",
    订单总额: r.total ?? "未登记",
    单位承担: r.unit ?? "未登记",
    个人承担: r.personal ?? "未登记",
    待缴: r.due ?? "未登记",
    待退: r.pendingRefund ?? "未登记",
    套餐金额: r.packageAmount ?? "未登记",
    组内套餐金额: r.subgroupPackageAmount ?? "未登记",
    单位外加项: r.extraUnitAmount ?? "未登记",
    弃检金额: r.waivedAmount ?? "未登记",
    自费项目金额: r.selfPayAmount ?? "未登记",
  }));
export function SettlementDetails() {
  const { state } = useDemo();
  const [company, setCompany] = useState("");
  const [group, setGroup] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const all = useMemo(() => buildSettlementRows(state), [state]);
  const rows = all.filter(
    (r) =>
      (!company || r.company === company) &&
      (!group || r.groupId === group) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to),
  );
  const subtotals = settlementSubtotals(rows);
  return (
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <div className="actions">
        <h2>
          <ReceiptText size={20} /> 红创 · 订单结算明细
        </h2>
        <button
          className="btn"
          onClick={() =>
            downloadCsv(
              "红创-分组结算小计",
              settlementCsvRows(rows),
              [
                "单位",
                "人员组",
                "订单数",
                "本次人数",
                "登记组人数",
                "订单总额",
                "单位承担",
                "个人承担",
                "待缴",
                "待退",
                "套餐金额",
                "组内套餐金额",
                "单位外加项",
                "弃检金额",
                "自费项目金额",
              ].map((key) => ({ key, label: key })),
            )
          }
        >
          <Download size={15} /> 导出分组小计 CSV
        </button>
      </div>
      <p className="notice">
        本地模拟财务。承担金额不等于实收；仅凭收款时间、已登记收款金额及单位结算记录计算待缴。缺失数据标记未登记。项目承担按订单单位份额比例分摊，分币尾差归末项；套餐分类采用当前套餐清单。弃检金额仅展示，不自动退款。
      </p>
      <div className="actions">
        <label>
          结算单位
          <select
            aria-label="结算单位"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setGroup("");
            }}
          >
            <option value="">全部单位</option>
            {[...new Set(all.map((r) => r.company))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          结算人员组
          <select
            aria-label="结算人员组"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">全部人员组</option>
            {[
              ...new Map(
                all
                  .filter(
                    (r) => r.groupId && (!company || r.company === company),
                  )
                  .map((r) => [r.groupId, r]),
              ).values(),
            ].map((r) => (
              <option key={r.groupId} value={r.groupId}>
                {r.groupName}
              </option>
            ))}
          </select>
        </label>
        <label>
          开始日期
          <input
            aria-label="结算开始日期"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            aria-label="结算结束日期"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table aria-label="分组结算小计">
          <thead>
            <tr>
              {[
                "单位 / 人员组",
                "订单 / 本次人数 / 登记组人数",
                "订单总额",
                "单位承担",
                "个人承担",
                "待缴",
                "待退",
                "套餐金额",
                "组内套餐金额",
                "单位外加项",
                "弃检金额",
                "自费项目",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subtotals.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.company} / {r.groupName}
                </td>
                <td>
                  {r.count} / {r.people} / {r.registeredMembers ?? "未登记"}
                </td>
                {[
                  r.total,
                  r.unit,
                  r.personal,
                  r.due,
                  r.pendingRefund,
                  r.packageAmount,
                  r.subgroupPackageAmount,
                  r.extraUnitAmount,
                  r.waivedAmount,
                  r.selfPayAmount,
                ].map((v, j) => (
                  <td key={j}>{show(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p role="status">当前条件没有订单。</p>}
      {rows.map((r) => (
        <details
          key={r.id}
          style={{ padding: "12px 0", borderBottom: "1px solid #e4e9e8" }}
        >
          <summary>
            {r.name} · {r.id} · {r.date} · 订单 {show(r.total)} / 单位{" "}
            {show(r.unit)} / 个人 {show(r.personal)} / 待缴 {show(r.due)} / 待退{" "}
            {show(r.pendingRefund)}
          </summary>
          <p>
            {r.packageName} · {r.allocation} · 已收 {show(r.paid)} · 退款登记{" "}
            {show(r.refund)}
          </p>
          <table aria-label={`订单项目明细 ${r.id}`}>
            <thead>
              <tr>
                {[
                  "项目",
                  "来源",
                  "金额",
                  "单位承担",
                  "个人承担 / 自费",
                  "弃检",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.item}>
                  <td>{l.item}</td>
                  <td>
                    {l.packageItem === null
                      ? "未登记"
                      : l.packageItem
                        ? "套餐内"
                        : "套餐外加项"}
                  </td>
                  <td>{show(l.amount)}</td>
                  <td>{show(l.unit)}</td>
                  <td>{show(l.personal)}</td>
                  <td>{l.waived ? "已弃检" : "否"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </section>
  );
}
export default SettlementDetails;
