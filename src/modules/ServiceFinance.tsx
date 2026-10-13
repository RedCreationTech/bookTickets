import { useEffect, useRef, useState } from "react";
import { useDemo, today } from "../store";
import type { Row } from "./Operations";
import type { DemoState } from "../model";
import { downloadCsv } from "./Operations";
import { uiElementAllowed } from "./UiResources";
const uid = (p: string) => p + "-" + crypto.randomUUID();
const cents = (n: number) => Math.round(n * 100) / 100;
export function walletBalance(account: Row | undefined) {
  return cents(
    (account?.entries || []).reduce(
      (n: number, e: Row) => n + Number(e.delta),
      0,
    ),
  );
}
export function postWalletEntry(account: Row, entry: Row) {
  if ((account.entries || []).some((e: Row) => e.sourceKey === entry.sourceKey))
    return account;
  if (
    !Number.isFinite(entry.delta) ||
    cents(entry.delta) !== entry.delta ||
    walletBalance(account) + entry.delta < 0
  )
    throw new Error("金额非法或余额不足");
  return { ...account, entries: [...(account.entries || []), entry] };
}
export function ServiceBatch() {
  const { state, act } = useDemo();
  const rows = state.records.serviceCatalog || [];
  const [ids, setIds] = useState<string[]>([]);
  const [field, setField] = useState("owner");
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const allowed = uiElementAllowed(state, "services.batch.update");
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>服务实质字段批量维护</h2>
      <div className="actions">
        {rows.map((r) => (
          <label key={r.id}>
            <input
              aria-label={`批改服务 ${r.id}`}
              type="checkbox"
              checked={ids.includes(r.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, r.id]
                    : ids.filter((id) => id !== r.id),
                )
              }
            />
            {r.name} · {r.owner} · ¥{r.price}
          </label>
        ))}
      </div>
      <select
        aria-label="服务批改字段"
        value={field}
        onChange={(e) => setField(e.target.value)}
      >
        <option value="owner">负责人</option>
        <option value="price">价格</option>
        <option value="category">类别</option>
      </select>
      <input
        aria-label="服务批改值"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {allowed && (
        <button
          className="btn"
          onClick={() => {
            if (!uiElementAllowed(state, "services.batch.update"))
              return setNotice("没有批改权限");
            if (
              !ids.length ||
              !value.trim() ||
              (field === "price" &&
                (!Number.isFinite(Number(value)) ||
                  Number(value) < 0 ||
                  cents(Number(value)) !== Number(value))) ||
              ids.some((id) => !rows.some((r) => r.id === id))
            )
              return setNotice(
                "整批校验失败，选择服务并填写合法值，价格不可负且最多两位小数",
              );
            rows
              .filter((r) => ids.includes(r.id))
              .forEach((r) =>
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "serviceCatalog",
                    record: {
                      ...r,
                      [field]: field === "price" ? Number(value) : value.trim(),
                      history: [
                        ...(r.history || []),
                        {
                          at: new Date().toISOString(),
                          text: `批改 ${field}：${r[field]} → ${value}`,
                        },
                      ],
                    },
                  },
                }),
              );
            setNotice(`已更新 ${ids.length} 项，未选项目保持不变`);
          }}
        >
          确认批改服务字段
        </button>
      )}
      {!allowed && <p>当前角色无服务批改权限。</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function sourceFinanceRows(state: DemoState, month: string) {
  return ["serviceOrders", "shopOrders"].flatMap((collection) =>
    (state.records[collection] || [])
      .filter((o) => !o.exchangeReservation)
      .map((o) => {
        const ledger = (state.records.accountLedgers || []).flatMap((a) =>
          (a.entries || []).filter(
            (e: Row) =>
              e.orderId === o.id &&
              e.collection === collection &&
              String(e.date || e.at || "").startsWith(month),
          ),
        );
        const receipts = cents(
          -ledger
            .filter((e: Row) => e.kind === "订单支付")
            .reduce((n: number, e: Row) => n + e.delta, 0),
        );
        const refunds = cents(
          ledger
            .filter((e: Row) => e.kind === "订单退款")
            .reduce((n: number, e: Row) => n + e.delta, 0),
        );
        return {
          ...o,
          collection,
          receipts,
          refunds,
          net: cents(receipts - refunds),
          transactionIds: ledger.map((e: Row) => e.id),
          reportSource: o.assessmentId || o.appointmentId || null,
        };
      })
      .filter(
        (o) =>
          String(o.date || o.createdAt || "").startsWith(month) ||
          o.transactionIds.length > 0,
      ),
  );
}
export function AccountsFinance() {
  const { state, act } = useDemo();
  const [patientId, setPatientId] = useState(state.patients[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [reportId, setReportId] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [filter, setFilter] = useState("全部");
  const guard = useRef(false);
  const account = (state.records.accountLedgers || []).find(
    (a) => a.patientId === patientId,
  ) || { id: "WALLET-" + patientId, patientId, entries: [] };
  const accountRef = useRef(account);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);
  const createGuard = useRef(false);
  const pendingOrderActions = useRef(new Set<string>());
  useEffect(() => {
    pendingOrderActions.current.clear();
  }, [state.records.serviceOrders, state.records.shopOrders]);
  const services = (state.records.serviceCatalog || []).filter(
    (s) => s.status === "已通过",
  );
  const rows = sourceFinanceRows(state, month);
  const visible = rows.filter(
    (r) =>
      (r.customerId === patientId || r.patientId === patientId) &&
      (filter === "全部" ||
        (filter === "待付款" && r.status === "待付款") ||
        (filter === "退款" && ["退款申请", "已退款"].includes(r.status))),
  );
  const save = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  const transact = (
    delta: number,
    kind: string,
    sourceKey: string,
    extra: Row = {},
  ) => {
    try {
      const latest = accountRef.current;
      const next = postWalletEntry(latest, {
        id: uid("TX"),
        sourceKey,
        delta,
        kind,
        date: today(),
        at: new Date().toISOString(),
        ...extra,
      });
      if (next === latest) {
        setNotice("该交易已记账，不重复处理");
        return false;
      }
      accountRef.current = next;
      save("accountLedgers", next);
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    }
  };
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>本地余额与源订单财务</h2>
      <p>
        余额来自有效本地流水，无真实储值或支付；无交易来源的历史订单显示零笔已登记交易，不将状态文字当作收入。
      </p>
      <div className="actions">
        <select
          aria-label="模拟余额账户"
          value={patientId}
          onChange={(e) => {
            setPatientId(e.target.value);
            setReportId("");
            createGuard.current = false;
            guard.current = false;
          }}
        >
          {state.patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <strong data-testid="wallet-balance">
          余额 ¥{walletBalance(account).toFixed(2)}
        </strong>
        <input
          aria-label="模拟充值金额"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => {
            const n = Number(amount);
            if (!Number.isFinite(n) || n <= 0 || cents(n) !== n)
              return setNotice("充值须为正数且最多两位小数");
            guard.current = false;
            setPreview({ id: uid("TOPUP"), amount: n, patientId });
          }}
        >
          预览模拟充值
        </button>
      </div>
      <table aria-label="余额充值流水">
        <tbody>
          {account.entries.map((e: Row) => (
            <tr key={e.id}>
              <td>{e.date}</td>
              <td>{e.kind}</td>
              <td>{e.delta}</td>
              <td>{e.orderId || e.sourceKey}</td>
              <td>
                {e.kind === "充值" &&
                  !account.entries.some(
                    (r: Row) => r.sourceKey === "reverse:" + e.id,
                  ) && (
                    <button
                      className="btn"
                      onClick={() =>
                        transact(-e.delta, "充值撤销", "reverse:" + e.id, {
                          originalEntryId: e.id,
                        })
                      }
                    >
                      撤销充值 {e.id}
                    </button>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>创建待付款服务订单</h3>
      <div className="actions">
        <select
          aria-label="付费服务项目"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            createGuard.current = false;
          }}
        >
          <option value="">请选择已审核服务</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · ¥{s.price}
            </option>
          ))}
        </select>
        <select
          aria-label="服务关联评估报告"
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
        >
          <option value="">无报告服务来源</option>
          {(state.records.assessments || [])
            .filter((r) => r.patientId === patientId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            if (createGuard.current) return;
            const service = services.find((s) => s.id === serviceId);
            if (
              !service ||
              !Number.isFinite(Number(service.price)) ||
              Number(service.price) < 0
            )
              return setNotice("请选择价格合法的已审核服务");
            if (
              reportId &&
              !(state.records.assessments || []).some(
                (r) => r.id === reportId && r.patientId === patientId,
              )
            )
              return setNotice("报告来源不属于当前账户");
            createGuard.current = true;
            save("serviceOrders", {
              id: uid("SVPAY"),
              name: service.name,
              serviceId,
              customerId: patientId,
              patientId,
              customer: state.patients.find((p) => p.id === patientId)?.name,
              owner: service.owner,
              amount: Number(service.price),
              date: today(),
              status: "待付款",
              assessmentId: reportId || null,
            });
            setNotice("已创建待付款源服务订单");
          }}
        >
          创建待付款服务订单
        </button>
        <button
          className="btn"
          onClick={() => {
            createGuard.current = false;
            setNotice("已开始新的服务订单");
          }}
        >
          开始新的服务订单
        </button>
      </div>
      <div className="actions">
        <input
          aria-label="交易结算月份"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <select
          aria-label="财务订单筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["全部", "待付款", "退款"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            save("platformSettlements", {
              id: "PLATFORM-" + month,
              month,
              gross: cents(rows.reduce((n, r) => n + r.receipts, 0)),
              refunds: cents(rows.reduce((n, r) => n + r.refunds, 0)),
              net: cents(rows.reduce((n, r) => n + r.net, 0)),
              sourceOrders: rows.map((r) => ({
                id: r.id,
                collection: r.collection,
                receipts: r.receipts,
                refunds: r.refunds,
                transactionIds: r.transactionIds,
                reportSource: r.reportSource,
              })),
              createdAt: new Date().toISOString(),
            });
            setNotice("已从实际本地交易生成月度结算快照");
          }}
        >
          生成平台月度结算
        </button>
        <button
          className="btn"
          onClick={() =>
            downloadCsv("源订单交易", visible, [
              { key: "id", label: "源订单" },
              { key: "collection", label: "类型" },
              { key: "amount", label: "应付" },
              { key: "receipts", label: "登记收款" },
              { key: "refunds", label: "登记退款" },
              { key: "net", label: "净额" },
              { key: "reportSource", label: "报告来源" },
            ])
          }
        >
          导出源订单交易
        </button>
      </div>
      <table aria-label="源订单财务清单">
        <thead>
          <tr>
            <th>订单 / 源类型</th>
            <th>状态 / 应付</th>
            <th>实收 / 退款 / 净额</th>
            <th>报告服务来源</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((o) => (
            <tr key={o.collection + o.id}>
              <td>
                {o.name}
                <small>
                  {o.id} / {o.collection}
                </small>
              </td>
              <td>
                {o.status} / ¥{o.amount}
              </td>
              <td>
                {o.receipts} / {o.refunds} / {o.net}
              </td>
              <td>{o.reportSource || "未登记"}</td>
              <td>
                {o.status === "待付款" && (
                  <>
                    <button
                      className="btn"
                      onClick={() => {
                        const operationKey = o.collection + ":" + o.id;
                        if (pendingOrderActions.current.has(operationKey))
                          return;
                        if (
                          transact(
                            -Number(o.amount),
                            "订单支付",
                            `pay:${o.collection}:${o.id}`,
                            { orderId: o.id, collection: o.collection },
                          )
                        ) {
                          pendingOrderActions.current.add(operationKey);
                          save(o.collection, {
                            ...state.records[o.collection].find(
                              (r) => r.id === o.id,
                            ),
                            status:
                              o.collection === "serviceOrders"
                                ? "待处理"
                                : "待发货",
                            paymentStatus: "已支付",
                            paidAt: new Date().toISOString(),
                          });
                          setNotice("本地余额支付完成");
                        }
                      }}
                    >
                      余额支付 {o.id}
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        const operationKey = o.collection + ":" + o.id;
                        if (pendingOrderActions.current.has(operationKey))
                          return;
                        pendingOrderActions.current.add(operationKey);
                        save(o.collection, {
                          ...state.records[o.collection].find(
                            (r) => r.id === o.id,
                          ),
                          status: "已取消",
                        });
                      }}
                    >
                      取消未付订单 {o.id}
                    </button>
                  </>
                )}
                {o.receipts > o.refunds &&
                  !["退款申请", "已退款"].includes(o.status) && (
                    <button
                      className="btn"
                      onClick={() =>
                        save(o.collection, {
                          ...state.records[o.collection].find(
                            (r) => r.id === o.id,
                          ),
                          previousStatus: o.status,
                          status: "退款申请",
                        })
                      }
                    >
                      申请本地退款 {o.id}
                    </button>
                  )}
                {o.status === "退款申请" && (
                  <button
                    className="btn"
                    onClick={() => {
                      const refundable = cents(o.receipts - o.refunds);
                      if (refundable <= 0)
                        return setNotice(
                          "没有本地支付来源，不允许虚构退款余额",
                        );
                      if (
                        transact(
                          refundable,
                          "订单退款",
                          `refund:${o.collection}:${o.id}`,
                          { orderId: o.id, collection: o.collection },
                        )
                      ) {
                        save(o.collection, {
                          ...state.records[o.collection].find(
                            (r) => r.id === o.id,
                          ),
                          status: "已退款",
                        });
                        setNotice("已按原本地支付来源退回余额");
                      }
                    }}
                  >
                    确认原路本地退款 {o.id}
                  </button>
                )}
                <details>
                  <summary>查看源交易</summary>
                  {o.transactionIds.length
                    ? o.transactionIds.join("、")
                    : "未登记本地收付来源"}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(state.records.platformSettlements || [])
        .filter((s) => s.month === month)
        .map((s) => (
          <p key={s.id}>
            结算 {s.month}：收款 {s.gross} − 退款 {s.refunds} = {s.net}
            ；报告结算{" "}
            {(s.sourceOrders || [])
              .filter((o: Row) => o.reportSource)
              .map(
                (o: Row) =>
                  `${o.id} → ${o.reportSource}：${cents(o.receipts - o.refunds)}`,
              )
              .join("；") || "未登记报告服务交易"}
          </p>
        ))}
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-label="确认模拟充值"
          >
            <div style={{ padding: 24 }}>
              <h3>本地模拟充值 ¥{preview.amount}</h3>
              <p>仅增加合成账户流水，无真实资金流转。</p>
              <button
                className="btn"
                onClick={() => {
                  setPreview(null);
                  setNotice("已取消充值，余额不变");
                }}
              >
                取消本次充值
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (guard.current) return;
                  guard.current = true;
                  if (preview.patientId !== patientId)
                    return setNotice("账户已改变，请重新预览");
                  transact(preview.amount, "充值", preview.id);
                  setPreview(null);
                  setNotice("本地模拟充值已登记");
                }}
              >
                确认本地充值
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
