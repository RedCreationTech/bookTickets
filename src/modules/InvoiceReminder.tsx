import { useEffect, useRef, useState } from "react";
import { BellRing, CalendarClock } from "lucide-react";
import { useDemo, today } from "../store";
import type { DemoState } from "../model";
export function invoiceDueDate(issued: string, days: number): string | null {
  const date = String(issued || "").slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(days) ||
    days < 0 ||
    days > 3650
  )
    return null;
  const parsed = new Date(date + "T00:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
export function getInvoiceReminderRows(state: DemoState, demoDate: string) {
  return (state.records.invoiceLedger || []).map((invoice) => {
    const issued = invoiceDueDate(invoice.createdAt, 0);
    const due =
      invoice.paymentDueDate ||
      (invoice.paymentTermDays === undefined
        ? null
        : invoiceDueDate(invoice.createdAt, Number(invoice.paymentTermDays)));
    const validDue =
      typeof due === "string" &&
      invoiceDueDate(due, 0) === due &&
      !!issued &&
      due >= issued;
    const amount =
      typeof invoice.amount === "number" &&
      Number.isFinite(invoice.amount) &&
      invoice.amount >= 0
        ? invoice.amount
        : null;
    const receipts = (state.records.invoiceReceipts || []).filter(
      (t) =>
        t.invoiceId === invoice.id &&
        ["已登记", "已完成", "有效"].includes(t.status) &&
        typeof t.amount === "number" &&
        Number.isFinite(t.amount) &&
        t.amount > 0 &&
        invoiceDueDate(t.date || t.createdAt, 0) &&
        String(t.date || t.createdAt).slice(0, 10) <= demoDate,
    );
    const collected =
      Math.round(receipts.reduce((n, t) => n + t.amount, 0) * 100) / 100;
    const outstanding =
      amount === null
        ? null
        : Math.max(0, Math.round((amount - collected) * 100) / 100);
    const dueNow =
      invoice.status === "有效" &&
      validDue &&
      due <= demoDate &&
      outstanding !== null &&
      outstanding > 0;
    const reminderId = JSON.stringify([
      invoice.id,
      due,
      demoDate,
      invoice.seller,
    ]);
    return {
      ...invoice,
      issued,
      due: validDue ? due : null,
      collected,
      outstanding,
      receiptIds: receipts.map((t) => t.id),
      dueNow,
      reminderId,
      acknowledged: (state.records.invoiceReminders || []).some(
        (r) => r.id === reminderId && r.status === "已查看",
      ),
    };
  });
}
export function InvoiceReminder() {
  const { state, act } = useDemo();
  const invoices = state.records.invoiceLedger || [];
  const demoDate = state.config.invoiceDemoDate || today();
  const [seller, setSeller] = useState(
    state.config.invoiceReminderSeller || invoices[0]?.seller || "",
  );
  const [selectedId, setSelectedId] = useState("");
  const [days, setDays] = useState(30);
  const [override, setOverride] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const receiptSubmitted = useRef(false);
  const [open, setOpen] = useState(false);
  const current = invoices.find((r) => r.id === selectedId) || invoices[0];
  const rows = getInvoiceReminderRows(state, demoDate);
  const pending = rows.filter(
    (r) => r.seller === seller && r.dueNow && !r.acknowledged,
  );
  const pendingKey = pending.map((r) => r.reminderId).join("|");
  useEffect(() => {
    setOpen(!!pendingKey);
  }, [pendingKey, seller]);
  const ack = () => {
    pending.forEach((r) =>
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "invoiceReminders",
          record: {
            id: r.reminderId,
            invoiceId: r.id,
            seller,
            date: demoDate,
            dueDate: r.due,
            status: "已查看",
            amount: r.outstanding,
            viewedAt: new Date().toISOString(),
          },
        },
      }),
    );
    setOpen(false);
    setNotice("已记录当前业务员本次演示日期的查看状态；未发送外部消息。");
  };
  return (
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>
        <CalendarClock size={21} /> 红创 · 发票回款到期提醒
      </h2>
      <p className="notice">
        关联现有本地发票台账与按发票 ID 登记的本地回款。按 UTC
        开票日期设置账期；切换演示时间后只在当前页面提示选定业务员。无短信、真实催收或后台调度；完整回款或作废发票不提醒。
      </p>
      <div className="actions">
        <label>
          当前演示业务员
          <select
            aria-label="回款提醒业务员"
            value={seller}
            onChange={(e) => {
              setSeller(e.target.value);
              act({
                type: "UPDATE_CONFIG",
                payload: { invoiceReminderSeller: e.target.value },
              });
            }}
          >
            <option value="">请选择</option>
            {[
              ...new Set<string>(invoices.map((r) => r.seller).filter(Boolean)),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          演示日期
          <input
            type="date"
            aria-label="发票提醒演示日期"
            value={demoDate}
            onChange={(e) => {
              if (invoiceDueDate(e.target.value, 0))
                act({
                  type: "UPDATE_CONFIG",
                  payload: { invoiceDemoDate: e.target.value },
                });
            }}
          />
        </label>
        <button
          className="btn"
          onClick={() => {
            setOpen(!!pending.length);
            setNotice(
              pending.length
                ? `当前业务员有 ${pending.length} 项未查看提醒。`
                : "当前业务员没有未查看的到期发票。",
            );
          }}
        >
          <BellRing size={15} /> 检查到期提醒
        </button>
      </div>
      {!invoices.length ? (
        <p role="status">
          尚无发票。请先在本地发票台账创建关联订单的模拟发票。
        </p>
      ) : (
        <>
          <div className="actions">
            <label>
              关联发票
              <select
                aria-label="设置账期的发票"
                value={current?.id || ""}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setPaymentAmount("");
                  receiptSubmitted.current = false;
                  const r = invoices.find((r) => r.id === e.target.value);
                  setDays(r?.paymentTermDays ?? 30);
                  setOverride(r?.paymentDueDate || "");
                }}
              >
                {invoices.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} · {r.seller} · {r.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              开票后回款天数
              <input
                aria-label="开票后回款天数"
                type="number"
                min={0}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
            <label>
              指定回款日（可选）
              <input
                aria-label="指定发票回款日"
                type="date"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={() => {
                const issued = invoiceDueDate(current.createdAt, 0);
                const due = override || invoiceDueDate(current.createdAt, days);
                if (
                  current.status !== "有效" ||
                  !issued ||
                  !due ||
                  invoiceDueDate(due, 0) !== due ||
                  due < issued ||
                  !Number.isInteger(days) ||
                  days < 0 ||
                  days > 3650
                ) {
                  setNotice(
                    "请使用有效发票、有效开票日期及 0–3650 整数账期；指定回款日不得早于开票日。",
                  );
                  return;
                }
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "invoiceLedger",
                    record: {
                      ...current,
                      paymentTermDays: days,
                      paymentDueDate: due,
                      paymentDueBasis: override ? "指定日期" : "开票日期加账期",
                      paymentDueUpdatedAt: new Date().toISOString(),
                    },
                  },
                });
                setNotice(
                  `发票 ${current.id} 回款日已标记为 ${due}，提醒对象：${current.seller}。`,
                );
              }}
            >
              保存发票回款时间
            </button>
          </div>
          <p>
            本次预览：开票 {current?.createdAt?.slice(0, 10) || "未登记"} → 回款{" "}
            {override || invoiceDueDate(current?.createdAt, days) || "无效日期"}
            ；已有台账回款日 {current?.paymentDueDate || "未登记"}。
          </p>
          <div className="actions">
            <label>
              本次本地回款金额
              <input
                aria-label="本次发票回款金额"
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => {
                  setPaymentAmount(e.target.value);
                  receiptSubmitted.current = false;
                }}
              />
            </label>
            <button
              className="btn"
              onClick={() => {
                if (receiptSubmitted.current) return;
                const amount = Number(paymentAmount);
                const row = rows.find((r) => r.id === current.id);
                if (
                  current.status !== "有效" ||
                  !row ||
                  row.outstanding === null ||
                  !Number.isFinite(amount) ||
                  amount <= 0 ||
                  Math.round(amount * 100) / 100 !== amount ||
                  amount > row.outstanding
                ) {
                  setNotice(
                    "回款须为大于零的两位小数金额，且不能超过该发票待回款。",
                  );
                  return;
                }
                if (!row.issued || demoDate < row.issued) {
                  setNotice("回款演示日期不得早于开票日期。");
                  return;
                }
                receiptSubmitted.current = true;
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "invoiceReceipts",
                    record: {
                      id: "RECEIPT-" + crypto.randomUUID(),
                      invoiceId: current.id,
                      amount,
                      status: "已登记",
                      date: demoDate,
                      createdAt: new Date().toISOString(),
                    },
                  },
                });
                setPaymentAmount("");
                setNotice(
                  `已登记 ${current.id} 本地回款 ¥${amount.toFixed(2)}，无真实资金流转。`,
                );
              }}
            >
              登记关联发票回款（模拟）
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table aria-label="发票回款到期台账">
              <thead>
                <tr>
                  {[
                    "发票 / 关联订单",
                    "业务员",
                    "开票日期",
                    "回款日",
                    "发票金额",
                    "本地已回款",
                    "待回款",
                    "提醒状态",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.id}
                      <small>{(r.appointmentIds || []).join("、")}</small>
                    </td>
                    <td>{r.seller || "未登记"}</td>
                    <td>{r.issued || "未登记"}</td>
                    <td>{r.due || "未登记"}</td>
                    <td>
                      {typeof r.amount === "number"
                        ? `¥${r.amount.toFixed(2)}`
                        : "未登记"}
                    </td>
                    <td>¥{r.collected.toFixed(2)}</td>
                    <td>
                      {r.outstanding === null
                        ? "未登记"
                        : `¥${r.outstanding.toFixed(2)}`}
                    </td>
                    <td>
                      {r.status !== "有效"
                        ? "发票非有效"
                        : r.outstanding === 0
                          ? "已回款"
                          : r.acknowledged
                            ? "本日已查看"
                            : r.dueNow
                              ? "已到期"
                              : r.due
                                ? "未到期"
                                : "未标记回款日"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {open && pending.length > 0 && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="业务员到期回款提醒"
          >
            <div className="ops-modal-head">
              <h2>{seller} · 到期回款提醒</h2>
            </div>
            <div style={{ padding: 24 }}>
              <p>演示日期 {demoDate}，仅显示当前业务员尚未查看的到期发票。</p>
              {pending.map((r) => (
                <p key={r.id}>
                  {r.id} · 回款日 {r.due} · 待回款 ¥{r.outstanding!.toFixed(2)}
                </p>
              ))}
            </div>
            <div className="ops-modal-actions">
              <button className="btn" onClick={() => setOpen(false)}>
                稍后查看
              </button>
              <button className="btn btn-primary" onClick={ack}>
                确认已查看
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
export default InvoiceReminder;
