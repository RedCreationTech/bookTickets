import { useState } from "react";
import { useDemo, today } from "../store";
import type { DemoState } from "../model";
import { downloadCsv } from "./Operations";
export function crmOrderProgress(
  state: DemoState,
  year: string,
  owner = "",
  customerId = "",
) {
  return (state.records.crmOrderLinks || []).flatMap((link) => {
    const order = state.appointments.find((a) => a.id === link.appointmentId);
    const contract = (state.records.crmContracts || []).find(
      (c) => c.id === link.contractId && c.customerId === link.customerId,
    );
    if (
      !order ||
      !contract ||
      !order.date.startsWith(year + "-") ||
      (owner && contract.owner !== owner) ||
      (customerId && link.customerId !== customerId)
    )
      return [];
    const patient = state.patients.find((p) => p.id === order.patientId);
    const required = order.items.filter(
      (i) => !(order.waived || []).includes(i),
    );
    const completed = required.filter((i) =>
      String(order.results[i] || "").trim(),
    ).length;
    return [
      {
        ...link,
        id: order.id,
        date: order.date,
        customer:
          (state.records.crmCustomers || []).find(
            (c) => c.id === link.customerId,
          )?.name || "客户未登记",
        contract: contract.name,
        owner: contract.owner,
        patient: patient?.name || "患者未登记",
        status: order.status,
        finished: ["approved", "printed"].includes(order.status),
        cancelled: order.status === "cancelled",
        completed,
        required: required.length,
        waived: (order.waived || []).length,
        items: order.items.map((i: string) => ({
          item: i,
          status: (order.waived || []).includes(i)
            ? "已弃检"
            : String(order.results[i] || "").trim()
              ? "已完成"
              : "未完成",
          value: order.results[i] || "未记录",
        })),
      },
    ];
  });
}
export function CrmProgress() {
  const { state, act } = useDemo();
  const customers = state.records.crmCustomers || [];
  const contracts = state.records.crmContracts || [];
  const [customer, setCustomer] = useState("");
  const [contract, setContract] = useState("");
  const [appointment, setAppointment] = useState("");
  const [year, setYear] = useState(today().slice(0, 4));
  const [owner, setOwner] = useState("");
  const [notice, setNotice] = useState("");
  const rows = crmOrderProgress(state, year, owner, customer);
  const live = rows.filter((r) => !r.cancelled);
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>CRM 年度体检完成看板</h2>
      <p>
        以合同 ID、客户 ID 和体检订单 ID
        显式关联；完成定义为总检批准/已打印，不用合同金额冒充体检进度。
      </p>
      <div className="actions">
        <input
          aria-label="CRM体检年度"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <select
          aria-label="CRM体检业务员"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">全部业务员</option>
          {[
            ...new Set<string>(contracts.map((c) => c.owner).filter(Boolean)),
          ].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          aria-label="CRM体检客户"
          value={customer}
          onChange={(e) => {
            setCustomer(e.target.value);
            setContract("");
          }}
        >
          <option value="">全部客户</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => setOwner(state.config.crmUser || "陈晓")}
        >
          仅看本人订单
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadCsv("红创CRM订单进度", rows, [
              { key: "id", label: "订单ID" },
              { key: "customer", label: "CRM客户" },
              { key: "patient", label: "体检人" },
              { key: "owner", label: "业务员" },
              { key: "status", label: "状态" },
              { key: "completed", label: "已检项目" },
              { key: "required", label: "应检项目" },
            ])
          }
        >
          导出实际体检进度
        </button>
      </div>
      <p data-testid="crm-real-completion">
        有效订单 {live.length}；已完成 {live.filter((r) => r.finished).length}
        ；未完 {live.filter((r) => !r.finished).length}；已取消{" "}
        {rows.filter((r) => r.cancelled).length}；完成率{" "}
        {live.length
          ? Math.round(
              (live.filter((r) => r.finished).length / live.length) * 100,
            )
          : 0}
        %
      </p>
      <details>
        <summary>关联客户合同与体检订单</summary>
        <select
          aria-label="CRM关联合同"
          value={contract}
          onChange={(e) => setContract(e.target.value)}
        >
          <option value="">请选择</option>
          {contracts
            .filter(
              (c) => c.customerId && (!customer || c.customerId === customer),
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          aria-label="CRM关联体检订单"
          value={appointment}
          onChange={(e) => setAppointment(e.target.value)}
        >
          <option value="">请选择</option>
          {state.appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} · {state.patients.find((p) => p.id === a.patientId)?.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            const c = contracts.find((c) => c.id === contract);
            const a = state.appointments.find((a) => a.id === appointment);
            if (!c || !a || !customers.some((x) => x.id === c.customerId))
              return setNotice("请选择存在的客户合同和体检订单");
            const old = (state.records.crmOrderLinks || []).find(
              (l) => l.appointmentId === a.id,
            );
            if (old && old.contractId !== c.id)
              return setNotice("订单已关联其他合同，不能重复归属");
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "crmOrderLinks",
                record: {
                  id: "CRM-LINK-" + a.id,
                  appointmentId: a.id,
                  patientId: a.patientId,
                  contractId: c.id,
                  customerId: c.customerId,
                },
              },
            });
            setNotice("订单已关联，年度完成看板同步更新");
          }}
        >
          保存CRM订单关联
        </button>
      </details>
      {rows.map((r) => (
        <details key={r.id}>
          <summary>
            {r.customer} · {r.patient} · {r.id} · {r.completed}/{r.required} 项
            · {r.status}
          </summary>
          <p>
            {r.contract} / {r.owner} / {r.date} / 弃检 {r.waived} 项
          </p>
          <table aria-label={`CRM订单项目 ${r.id}`}>
            <tbody>
              {r.items.map(
                (i: { item: string; status: string; value: string }) => (
                  <tr key={i.item}>
                    <td>{i.item}</td>
                    <td>{i.status}</td>
                    <td>{i.value}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </details>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
