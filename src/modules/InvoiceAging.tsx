import { useState } from "react";
import { useDemo, exportCsv as exportObjects, today } from "../store";
import { buildInvoiceAging } from "../financialAnalyticsRules";
import { uniqueStrings } from "../analyticsData";
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
export function InvoiceAging() {
  const { state, act } = useDemo();
  const [date, setDate] = useState(state.config.invoiceDemoDate || today());
  const [company, setCompany] = useState("");
  const [basis, setBasis] = useState("开票账龄");
  const [termsCompany, setTermsCompany] = useState("");
  const [days, setDays] = useState(30);
  const [notice, setNotice] = useState("");
  const all = buildInvoiceAging(state, date);
  const rows = all.filter((r) => !company || r.company === company);
  const active = rows.filter((r) => r.eligible);
  const buckets = uniqueStrings([
    "未到期",
    "0–30天",
    "31–60天",
    "61–90天",
    "91–180天",
    "181天以上",
    "日期未知",
    "到期日未知",
  ]);
  const summary = buckets.map((name) => {
    const entries = active.filter(
      (r) => (basis === "开票账龄" ? r.bucket : r.overdueBucket) === name,
    );
    return {
      name,
      count: entries.length,
      known: entries.reduce((n, r) => n + (r.outstandingCents || 0), 0),
      unknown: entries.filter((r) => r.outstandingCents === null).length,
    };
  });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>真实本地发票账龄</h2>
      <p className="notice">
        以有效发票实际开票日期、账期和逐笔本地回款为依据。0–30 / 31–60 / 61–90 /
        91–180 / 181
        天以上包含边界；作废与未来发票排除。未录入的历史回款不会自动推断，请先核对回款台账。本地票面未收不等同财务应收确认。
      </p>
      <div className="form-grid">
        <label>
          账龄演示日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          账龄单位
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">全部单位</option>
            {uniqueStrings(all.map((r) => r.company)).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          账龄口径
          <select value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option>开票账龄</option>
            <option>逾期天数</option>
          </select>
        </label>
        <button
          className="btn"
          onClick={() =>
            exportCsv("发票账龄同口径.csv", [
              [
                "发票",
                "单位",
                "业务员",
                "开票日期",
                "到期日期",
                "口径",
                "天数",
                "分档",
                "未收金额",
                "状态",
                "排除/提示",
              ],
              ...rows.map((r) => [
                r.id,
                r.company,
                r.seller,
                r.issued || "未知",
                r.due || "未知",
                basis,
                basis === "开票账龄"
                  ? (r.age ?? "未知")
                  : (r.overdueDays ?? "未知"),
                basis === "开票账龄" ? r.bucket : r.overdueBucket,
                r.outstandingCents === null ? "未知" : r.outstandingCents / 100,
                r.status,
                r.eligible ? r.warning : "不纳入合计",
              ]),
            ])
          }
        >
          导出账龄
        </button>
      </div>
      <div className="metrics">
        {summary
          .filter((r) => r.count)
          .map((r) => (
            <div className="metric" key={r.name}>
              <span>{r.name}</span>
              <strong>
                {money(r.known)}
                {r.unknown ? ` + ${r.unknown} 笔未知` : ""}
              </strong>
              <small>{r.count} 张有效发票</small>
            </div>
          ))}
      </div>
      <div className="ops-table-wrap">
        <table className="ops-table" aria-label="发票账龄明细">
          <thead>
            <tr>
              <th>发票 / 单位</th>
              <th>开票 / 到期</th>
              <th>票面 / 已回款 / 未收</th>
              <th>账龄 / 逾期</th>
              <th>状态与依据</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.id}
                  <small>
                    {r.company} · {r.seller}
                  </small>
                </td>
                <td>
                  {r.issued || "未知"} / {r.due || "未知"}
                </td>
                <td>
                  {money(r.amountCents)} / {money(r.collectedCents)} /{" "}
                  {money(r.outstandingCents)}
                </td>
                <td>
                  {r.age ?? "未知"}天 · {r.bucket}
                  <br />
                  {r.overdueBucket}
                </td>
                <td>
                  {r.status} · {r.eligible ? "纳入" : "排除"}
                  <br />
                  {r.termSource}
                  <br />
                  {r.warning}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>尚无本地发票，请先在单位发票台账开具模拟发票。</p>}
      <details>
        <summary>单位默认账期（发票明确账期优先）</summary>
        <label>
          账期单位
          <input
            value={termsCompany}
            onChange={(e) => setTermsCompany(e.target.value)}
          />
        </label>
        <label>
          账期天数
          <input
            type="number"
            min="0"
            max="3650"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <button
          className="btn"
          onClick={() => {
            if (
              !termsCompany.trim() ||
              !Number.isInteger(days) ||
              days < 0 ||
              days > 3650
            ) {
              setNotice("请填写单位和 0–3650 的整数账期。");
              return;
            }
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "invoiceCompanyTerms",
                record: {
                  id: `TERM-${encodeURIComponent(termsCompany.trim())}`,
                  company: termsCompany.trim(),
                  days,
                },
              },
            });
            setNotice("单位账期已保存；发票未指定到期日/账期时立即采用。");
          }}
        >
          保存单位账期
        </button>
        <p role="status">{notice}</p>
        {(state.records.invoiceCompanyTerms || []).map((r) => (
          <p key={r.id}>
            {r.company}：{r.days} 天
          </p>
        ))}
      </details>
    </section>
  );
}
export default InvoiceAging;
