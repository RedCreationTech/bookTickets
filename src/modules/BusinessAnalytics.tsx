import { useState } from "react";
import { useDemo, exportCsv as exportObjects } from "../store";
import {
  analyticsDay,
  buildOrderAnalytics,
  uniqueStrings,
} from "../analyticsData";
import {
  buildFinancialTransactions,
  buildReviewWorkloads,
  financialUnknowns,
} from "../financialAnalyticsRules";
import { DynamicBars } from "./AnalyticsCharts";
const exportCsv = (name: string, matrix: unknown[][]) => {
  const [headers, ...values] = matrix;
  exportObjects(
    name,
    values.map((row) =>
      Object.fromEntries(headers.map((key, i) => [String(key), row[i]])),
    ),
  );
};
const money = (v: number | null) =>
  v === null ? "未知" : `¥${(v / 100).toFixed(2)}`;
export function BusinessAnalytics() {
  const { state } = useDemo();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [company, setCompany] = useState("");
  const [seller, setSeller] = useState("");
  const [creator, setCreator] = useState("");
  const [kind, setKind] = useState("");
  const [channel, setChannel] = useState("");
  const [transactionItem, setTransactionItem] = useState("");
  const [mode, setMode] = useState("开单与销售");
  const [price, setPrice] = useState("执行价");
  const all = buildOrderAnalytics(state);
  const valid = !from || !to || from <= to;
  const within = (date: string) =>
    valid &&
    (!from || date >= from) &&
    (!to || date <= to) &&
    ((!from && !to) || !!date);
  const matches = (r: any) => !company || r.company === company;
  const rows = all.filter(
    (r) =>
      within(mode === "单位体检进度" ? r.date : r.createdDate) &&
      matches(r) &&
      (!seller || r.seller === seller) &&
      (!creator || r.creator === creator) &&
      (!kind || r.kind === kind) &&
      !r.cancelled,
  );
  const allTransactions = buildFinancialTransactions(state);
  const transactionRows = allTransactions.filter(
    (r) =>
      within(r.date) &&
      (!channel || r.channel === channel) &&
      (!transactionItem || r.item === transactionItem) &&
      matches(r) &&
      (!seller || r.seller === seller) &&
      (!kind || r.kind === kind),
  );
  const reviews = buildReviewWorkloads(state).filter(
    (r) => within(r.date) && matches(r),
  );
  const groups = uniqueStrings(
    rows.map((r) => `${r.creator} / ${r.seller} / ${r.kind}`),
  ).map((name) => {
    const entries = rows.filter(
      (r) => `${r.creator} / ${r.seller} / ${r.kind}` === name,
    );
    return {
      name,
      count: entries.length,
      people: new Set(entries.map((r) => r.patientId)).size,
    };
  });
  const companies = uniqueStrings(rows.map((r) => r.company)).map((name) => {
    const entries = rows.filter((r) => r.company === name);
    const amounts = entries.map((r) =>
      price === "原价" ? r.originalCents : r.executionCents,
    );
    return {
      name,
      orders: entries.length,
      people: new Set(entries.map((r) => r.patientId)).size,
      arrived: entries.filter((r) => r.arrived).length,
      completed: entries.filter((r) => r.completed).length,
      items: entries.reduce((n, r) => n + r.itemCount, 0),
      done: entries.reduce((n, r) => n + r.completedCount, 0),
      amount: amounts.reduce<number>((n, v) => n + (v || 0), 0),
      unknown: amounts.filter((v) => v === null).length,
    };
  });
  const cash = transactionRows.filter((r) => r.cash);
  const filterBasis = mode === "交易与对账" ? allTransactions : all;
  const invoiceRows = (state.records.invoiceLedger || []).filter(
    (i) =>
      kind !== "个检" &&
      i.status === "有效" &&
      within(analyticsDay(i.createdAt)) &&
      (i.appointmentIds || []).some((id: string) =>
        all.some(
          (r) =>
            r.id === id &&
            r.kind === "团检" &&
            matches(r) &&
            (!seller || r.seller === seller),
        ),
      ),
  );
  const exportRows = () => {
    if (mode === "交易与对账")
      exportCsv("实际本地交易.csv", [
        [
          "交易ID",
          "日期",
          "交易时间",
          "原始交易编号",
          "渠道",
          "项目",
          "收退方向",
          "订单",
          "客户",
          "单位",
          "个团检",
          "业务员",
          "交易类型",
          "金额",
          "现金性质",
          "依据",
        ],
        ...transactionRows.map((r) => [
          r.id,
          r.date,
          r.at,
          r.transactionId,
          r.channel,
          r.item,
          r.direction,
          r.appointmentId,
          r.name,
          r.company,
          r.kind,
          r.seller,
          r.type,
          r.amountCents / 100,
          r.cash ? "本地收退款" : "预付款/会员卡内部结算，勿重复收入",
          r.source,
        ]),
      ]);
    else if (mode === "审核医生")
      exportCsv("审核节点工作量.csv", [
        [
          "订单",
          "客户",
          "单位",
          "节点",
          "医生",
          "完成日期",
          "开始",
          "结束",
          "依据",
        ],
        ...reviews.map((r) => [
          r.appointmentId,
          r.name,
          r.company,
          r.stage,
          r.doctor,
          r.date,
          r.startedAt,
          r.completedAt,
          r.source,
        ]),
      ]);
    else
      exportCsv("开单单位进度.csv", [
        [
          "订单",
          "客户",
          "单位",
          "创建人",
          "业务员",
          "个团检",
          "开单日期",
          "日期依据",
          "体检日期",
          "到检",
          "项目完成数",
          "项目总数",
          "缺项",
          "原价",
          "执行价",
        ],
        ...rows.map((r) => [
          r.id,
          r.name,
          r.company,
          r.creator,
          r.seller,
          r.kind,
          r.createdDate,
          r.creationDateSource,
          r.date,
          r.arrived ? "已到" : "未到",
          r.completedCount,
          r.itemCount,
          r.missingItems.join("；"),
          r.originalCents === null ? "未知" : r.originalCents / 100,
          r.executionCents === null ? "未知" : r.executionCents / 100,
        ]),
      ]);
  };
  return (
    <div className="ops-page">
      <h2>业务、交易与单位进度</h2>
      <p className="notice">
        订单数量按实际订单去重；人数按客户 ID
        去重。价格为开单/工作量金额，实收优先取不可变逐笔项目收/退账本及交易日期，存在账本时不把当前已付余额当成新收入。预付款结算分配不再次累计收入。审核量来自节点完成元数据，不把操作事件数当作项目量。
      </p>
      <div className="form-grid">
        <label>
          业务视图
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {["开单与销售", "单位体检进度", "交易与对账", "审核医生"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <label>
          业务开始日期
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          业务结束日期
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(
          [
            [
              "业务单位",
              company,
              setCompany,
              filterBasis.map((r) => r.company),
            ],
            ["业务员筛选", seller, setSeller, filterBasis.map((r) => r.seller)],
            ["创建人筛选", creator, setCreator, all.map((r) => r.creator)],
            ["业务个团检", kind, setKind, ["个检", "团检"]],
          ] as const
        )
          .filter(([label]) =>
            mode === "审核医生"
              ? label === "业务单位"
              : mode === "交易与对账"
                ? label !== "创建人筛选"
                : true,
          )
          .map(([label, value, set, values]) => (
            <label key={label}>
              {label}
              <select value={value} onChange={(e) => set(e.target.value)}>
                <option value="">全部</option>
                {uniqueStrings([...values]).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          ))}
        {mode === "交易与对账" && (
          <>
            <label>
              交易渠道
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">全部</option>
                {uniqueStrings(allTransactions.map((r) => r.channel)).map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              交易检查项目
              <select
                value={transactionItem}
                onChange={(e) => setTransactionItem(e.target.value)}
              >
                <option value="">全部</option>
                {uniqueStrings(allTransactions.map((r) => r.item)).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <button className="btn" onClick={exportRows}>
          导出当前业务口径
        </button>
      </div>
      {!valid && <p role="alert">开始日期不能晚于结束日期。</p>}
      {mode === "开单与销售" && (
        <>
          <DynamicBars label="创建人业务员个团检开单量" rows={groups} />
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="开单业务员工作量">
              <thead>
                <tr>
                  <th>创建人 / 业务员 / 个团检</th>
                  <th>订单数</th>
                  <th>去重人数</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.name}>
                    <td>{g.name}</td>
                    <td>{g.count}</td>
                    <td>{g.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            指定项目开出数量、金额及业务员人员名单，请使用“精细项目统计”中的开单口径与项目/业务员筛选。
          </p>
        </>
      )}
      {mode === "单位体检进度" && (
        <>
          <label>
            单位统计价格口径
            <select value={price} onChange={(e) => setPrice(e.target.value)}>
              <option>执行价</option>
              <option>原价</option>
            </select>
          </label>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="单位结算进度汇总">
              <thead>
                <tr>
                  <th>单位</th>
                  <th>订单 / 人数</th>
                  <th>到检 / 完成人次</th>
                  <th>项目完成</th>
                  <th>{price}工作量金额</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>
                      {r.orders} / {r.people}
                    </td>
                    <td>
                      {r.arrived} / {r.completed}
                    </td>
                    <td>
                      {r.done} / {r.items}
                    </td>
                    <td>
                      {money(r.amount)} {r.unknown ? `+${r.unknown}笔未知` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DynamicBars
            label="单位检查日期分布"
            rows={uniqueStrings(rows.map((r) => r.date)).map((date) => ({
              name: date,
              count: rows.filter((r) => r.date === date).length,
            }))}
          />
        </>
      )}
      {["开单与销售", "单位体检进度"].includes(mode) && (
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="业务人员明细">
            <thead>
              <tr>
                <th>客户 / 订单</th>
                <th>单位 / 个团检</th>
                <th>创建人 / 业务员</th>
                <th>开单 / 检查日期</th>
                <th>到检 / 项目完成</th>
                <th>缺项</th>
                <th>原价 / 执行价</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name} / {r.id}
                  </td>
                  <td>
                    {r.company} / {r.kind}
                  </td>
                  <td>
                    {r.creator} / {r.seller}
                  </td>
                  <td>
                    {r.createdDate} / {r.date}
                    <small>{r.creationDateSource}</small>
                  </td>
                  <td>
                    {r.arrived ? "已到检" : "未到检"} · {r.completedCount}/
                    {r.itemCount}
                  </td>
                  <td>{r.missingItems.join("、") || "无未检项目"}</td>
                  <td>
                    {money(r.originalCents)} / {money(r.executionCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mode === "交易与对账" && (
        <>
          <p>
            本地现金类收退款净额：
            <strong>
              {money(cash.reduce((n, r) => n + r.amountCents, 0))}
            </strong>
            ；个检{" "}
            {money(
              cash
                .filter((r) => r.kind === "个检")
                .reduce((n, r) => n + r.amountCents, 0),
            )}
            ；团检{" "}
            {money(
              cash
                .filter((r) => r.kind === "团检")
                .reduce((n, r) => n + r.amountCents, 0),
            )}
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="实际交易明细">
              <thead>
                <tr>
                  <th>日期 / 交易</th>
                  <th>渠道 / 项目 / 方向</th>
                  <th>单位 / 客户</th>
                  <th>类型</th>
                  <th>金额</th>
                  <th>证据 / 性质</th>
                </tr>
              </thead>
              <tbody>
                {transactionRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.at}
                      <small>{r.transactionId}</small>
                    </td>
                    <td>
                      {r.channel}
                      <small>
                        {r.item} · {r.direction}
                      </small>
                    </td>
                    <td>
                      {r.company} / {r.name}
                    </td>
                    <td>
                      {r.kind} · {r.type}
                    </td>
                    <td>{money(r.amountCents)}</td>
                    <td>
                      {r.source} · {r.cash ? "现金类" : "非现金抵扣/分配"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            每行是一笔交易中的项目与收退方向；收退相抵分别显示正负明细。当前共{" "}
            {new Set(transactionRows.map((r) => r.transactionId)).size}{" "}
            笔原始交易、{transactionRows.length}{" "}
            条项目方向明细。会员卡抵扣和预收款分配不再计现金收入。
          </p>
          <h3>单位现金类收退款汇总</h3>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="单位收入汇总">
              <thead>
                <tr>
                  <th>单位</th>
                  <th>收款</th>
                  <th>退款</th>
                  <th>净额</th>
                  <th>现金类记录数</th>
                </tr>
              </thead>
              <tbody>
                {uniqueStrings(cash.map((r) => r.company)).map((company) => {
                  const rs = cash.filter((r) => r.company === company);
                  return (
                    <tr key={company}>
                      <td>{company}</td>
                      <td>
                        {money(
                          rs
                            .filter((r) => r.amountCents >= 0)
                            .reduce((n, r) => n + r.amountCents, 0),
                        )}
                      </td>
                      <td>
                        {money(
                          -rs
                            .filter((r) => r.amountCents < 0)
                            .reduce((n, r) => n + r.amountCents, 0),
                        )}
                      </td>
                      <td>
                        {money(rs.reduce((n, r) => n + r.amountCents, 0))}
                      </td>
                      <td>{rs.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h3>完成开票的团检交易关联</h3>
          <p>开票仅关联交易，不与收款金额相加；合并发票按票显示一次。</p>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="团检开票交易">
              <thead>
                <tr>
                  <th>发票</th>
                  <th>开票日期</th>
                  <th>关联订单</th>
                  <th>票面金额</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map((i) => (
                  <tr key={i.id}>
                    <td>{i.id}</td>
                    <td>{analyticsDay(i.createdAt)}</td>
                    <td>{i.appointmentIds.join("、")}</td>
                    <td>
                      {money(
                        typeof i.amount === "number"
                          ? Math.round(i.amount * 100)
                          : null,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>
              历史交易证据缺口（{financialUnknowns(state).length}）
            </summary>
            {financialUnknowns(state).map((r) => (
              <p key={r.id}>
                {r.id} {r.name}：{r.reason}
              </p>
            ))}
          </details>
        </>
      )}
      {mode === "审核医生" && (
        <>
          <p>
            仅显示有真实节点名、医生与完成时间的审核记录；未记录历史节点不会从当前医生字段反推。
          </p>
          <DynamicBars
            label="审核节点医生工作量"
            rows={uniqueStrings(
              reviews.map((r) => `${r.doctor} / ${r.stage}`),
            ).map((name) => ({
              name,
              count: reviews.filter((r) => `${r.doctor} / ${r.stage}` === name)
                .length,
            }))}
          />
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="审核医生实际节点">
              <thead>
                <tr>
                  <th>订单 / 客户</th>
                  <th>医生</th>
                  <th>节点</th>
                  <th>完成日期</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.appointmentId} / {r.name}
                    </td>
                    <td>{r.doctor}</td>
                    <td>{r.stage}</td>
                    <td>{r.completedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
