import { useState } from "react";
import { useDemo, exportCsv } from "../store";
import { buildOrderAnalytics, uniqueStrings } from "../analyticsData";
import {
  abnormalityFacts,
  abnormalitySummary,
  defaultQualityFilter,
  majorPositiveFacts,
  qualityFilterError,
  qualityOrders,
  qualityTimingRows,
  rejectionQualityRows,
} from "../qualityAnalyticsRules";
import type { QualityFilter } from "../qualityAnalyticsRules";
import { DynamicBars, DynamicPie } from "./AnalyticsCharts";
export function QualityAnalytics() {
  const { state, act } = useDemo();
  const [f, setF] = useState<QualityFilter>(defaultQualityFilter);
  const [tab, setTab] = useState("结果与到检");
  const [type, setType] = useState("个检");
  const [stage, setStage] = useState("主检");
  const [hours, setHours] = useState(24);
  const [doctor, setDoctor] = useState("");
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState("");
  const [notice, setNotice] = useState("");
  const [completion, setCompletion] = useState("");
  const all = buildOrderAnalytics(state);
  const orders = qualityOrders(state, f);
  const facts = abnormalityFacts(state, f);
  const abnormal = facts.filter((r) => r.outcome === true);
  const summary = abnormalitySummary(state, f);
  const critical = abnormal.filter((r) => r.critical);
  const majors = majorPositiveFacts(state, f);
  const timing = qualityTimingRows(state, f);
  const rejections = rejectionQualityRows(state, f);
  const set = (key: keyof QualityFilter, value: string) =>
    setF({ ...f, [key]: value });
  const exportData = () => {
    if (tab === "异常与危急值")
      exportCsv(
        "异常检出同口径名单.csv",
        abnormal.map((r) => ({
          订单: r.appointmentId,
          姓名: r.name,
          单位: r.company,
          年龄: r.age ?? "未知",
          日期: r.date,
          异常: r.abnormality,
          项目: r.item,
          结果: r.value,
          危急演示: r.critical ? "是" : "否",
          口径: "仅实际可判读结果，演示阈值非诊断",
        })),
      );
    else if (tab === "节点时效")
      exportCsv(
        "节点时效.csv",
        timing.map((r) => ({
          订单: r.appointmentId,
          姓名: r.name,
          类型: r.type,
          阶段: r.stage,
          开始: r.start || "未知",
          结束: r.end || "未知",
          小时: r.hours ?? "未知",
          阈值: r.limit ?? "未配置",
          超时: r.slow ? "是" : "否",
          依据: r.source,
        })),
      );
    else if (tab === "驳回质控")
      exportCsv(
        "驳回质控.csv",
        rejections.map((r) => ({
          医生: r.doctor,
          阶段: r.stage,
          原因: r.reason,
          驳回记录: r.events,
          去重退回样本: r.rejected,
          可核对工作样本: r.total ?? "未知",
          样本占比: r.rate === null ? "未知" : r.rate,
          口径: "有限本地样本率，非临床错误概率",
        })),
      );
    else
      exportCsv(
        "单位客户结果进度.csv",
        orders.flatMap((r) =>
          r.items.length
            ? r.items.map((item) => ({
                订单: r.id,
                姓名: r.name,
                单位: r.company,
                日期: r.date,
                到检: r.arrived ? "已到检" : "未到检",
                项目: item,
                结果: r.appointment.results[item] || "未记录",
                完成: r.missingItems.includes(item) ? "未完成" : "已完成",
              }))
            : [
                {
                  订单: r.id,
                  姓名: r.name,
                  单位: r.company,
                  日期: r.date,
                  到检: r.arrived ? "已到检" : "未到检",
                  项目: "无有效项目",
                  结果: "",
                  完成: "不纳入项目完成率",
                },
              ],
        ),
      );
  };
  return (
    <div className="ops-page">
      <h2>质控主任看板</h2>
      <p className="notice">
        实际订单、结果与节点时间驱动。缺结果只标“未记录”，无法判断未检查还是设备漏传。异常为合成阈值演示，缺失/不可判读不算正常；驳回样本占比不代表临床错误概率。
      </p>
      <div className="form-grid">
        <label>
          质控视图
          <select value={tab} onChange={(e) => setTab(e.target.value)}>
            {["结果与到检", "异常与危急值", "节点时效", "驳回质控"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          质控开始日期
          <input
            type="date"
            value={f.from}
            onChange={(e) => set("from", e.target.value)}
          />
        </label>
        <label>
          质控结束日期
          <input
            type="date"
            value={f.to}
            onChange={(e) => set("to", e.target.value)}
          />
        </label>
        <label>
          质控单位
          <select
            value={f.company}
            onChange={(e) => set("company", e.target.value)}
          >
            <option value="">全部</option>
            {uniqueStrings(all.map((r) => r.company)).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          客户姓名或体检号
          <input
            value={f.patient}
            onChange={(e) => set("patient", e.target.value)}
          />
        </label>
        <label>
          最小年龄
          <input
            type="number"
            min="0"
            value={f.ageMin}
            onChange={(e) => set("ageMin", e.target.value)}
          />
        </label>
        <label>
          最大年龄
          <input
            type="number"
            min="0"
            value={f.ageMax}
            onChange={(e) => set("ageMax", e.target.value)}
          />
        </label>
        <label>
          到检筛选
          <select
            value={f.arrival}
            onChange={(e) => set("arrival", e.target.value)}
          >
            <option value="">全部</option>
            <option>已到检</option>
            <option>未到检</option>
          </select>
        </label>
        <button className="btn" onClick={exportData}>
          导出当前质控数据
        </button>
      </div>
      {qualityFilterError(f) && <p role="alert">{qualityFilterError(f)}</p>}
      {tab === "结果与到检" && (
        <>
          <DynamicPie
            label="实际到检分布"
            rows={[
              { name: "已到检", count: orders.filter((r) => r.arrived).length },
              {
                name: "未到检",
                count: orders.filter((r) => !r.arrived).length,
              },
            ]}
          />
          <p>
            当前 {orders.length} 人次；实际结果{" "}
            {orders.reduce((n, r) => n + r.completedCount, 0)} /{" "}
            {orders.reduce((n, r) => n + r.itemCount, 0)} 项
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="结果进度客户清单">
              <thead>
                <tr>
                  <th>客户 / 单位</th>
                  <th>日期 / 到检</th>
                  <th>项目完成数</th>
                  <th>未记录项目</th>
                  <th>全部项目与结果</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name} / {r.id}
                      <small>{r.company}</small>
                    </td>
                    <td>
                      {r.date} / {r.arrived ? "已到检" : "未到检"}
                    </td>
                    <td>
                      {r.completedCount} / {r.itemCount}
                    </td>
                    <td>{r.missingItems.join("、") || "无缺项"}</td>
                    <td>
                      {r.items.map((item) => (
                        <p key={item}>
                          {item}：{r.appointment.results[item] || "未记录"}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>单位项目进度汇总</h3>
          {uniqueStrings(orders.map((r) => r.company)).map((company) => {
            const rs = orders.filter((r) => r.company === company);
            return (
              <p key={company}>
                {company}：到检 {rs.filter((r) => r.arrived).length}/{rs.length}
                ；项目结果 {rs.reduce((n, r) => n + r.completedCount, 0)}/
                {rs.reduce((n, r) => n + r.itemCount, 0)}
              </p>
            );
          })}
        </>
      )}
      {tab === "异常与危急值" && (
        <>
          <label>
            异常名称
            <select
              value={f.abnormality}
              onChange={(e) => set("abnormality", e.target.value)}
            >
              <option value="">全部</option>
              {uniqueStrings(
                abnormalityFacts(state, { ...f, abnormality: "" }).map(
                  (r) => r.abnormality,
                ),
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <p>
            演示规则：血糖 &gt;6.1；血压
            ≥140/90；血脂明确异常文本。危急阈值读取现有配置，重大阳性读取医生显式小结级别。
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="异常检出率">
              <thead>
                <tr>
                  <th>异常</th>
                  <th>检出</th>
                  <th>可判读分母</th>
                  <th>未开/缺失/不可判读</th>
                  <th>检出率</th>
                  <th>危急</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.numerator}</td>
                    <td>{r.denominator}</td>
                    <td>{r.unknown}</td>
                    <td>
                      {r.rate === null
                        ? "无可判读分母"
                        : `${(100 * r.rate).toFixed(1)}%`}
                    </td>
                    <td>{r.critical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DynamicBars
            label="异常日期检出分布"
            rows={uniqueStrings(abnormal.map((r) => r.date)).map((date) => ({
              name: date,
              count: abnormal.filter((r) => r.date === date).length,
            }))}
          />
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="异常客户名单">
              <thead>
                <tr>
                  <th>客户 / 单位</th>
                  <th>日期 / 年龄</th>
                  <th>异常 / 结果</th>
                  <th>危急</th>
                </tr>
              </thead>
              <tbody>
                {abnormal.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name} / {r.company}
                    </td>
                    <td>
                      {r.date} / {r.age ?? "未知"}
                    </td>
                    <td>
                      {r.abnormality} / {r.value}
                    </td>
                    <td>{r.critical ? "演示危急值" : "一般演示异常"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            危急项目 {critical.length}；去重危急客户{" "}
            {new Set(critical.map((r) => r.patientId)).size}；显式重大阳性小结{" "}
            {majors.length}
          </p>
          {majors.map((r) => (
            <p key={r.id}>
              {r.name} · {r.level}：{r.text}
            </p>
          ))}
        </>
      )}
      {tab === "节点时效" && (
        <>
          <p>
            无实际开始/结束时间显示未知；旧送审代理时间不计算节点耗时。阈值按体检类型分别配置。
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="实际阶段时效">
              <thead>
                <tr>
                  <th>客户 / 类型</th>
                  <th>阶段与六个时间点</th>
                  <th>开始 / 结束</th>
                  <th>耗时 / 阈值（小时）</th>
                  <th>提示</th>
                </tr>
              </thead>
              <tbody>
                {timing.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name} / {r.type}
                    </td>
                    <td>
                      {r.stage}
                      <details>
                        <summary>查看时间点</summary>
                        {r.milestones.map(([name, time]) => (
                          <p key={name}>
                            {name}：{time || "未知"}
                          </p>
                        ))}
                      </details>
                    </td>
                    <td>
                      {r.start || "未知"}
                      <br />
                      {r.end || "未知"}
                    </td>
                    <td>
                      {r.hours === null ? "未知" : r.hours.toFixed(1)} /{" "}
                      {r.limit ?? "未配置"}
                    </td>
                    <td>
                      {r.slow ? "超时，请核查" : "—"}
                      <small>{r.source}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label>
            周期体检类型
            <input value={type} onChange={(e) => setType(e.target.value)} />
          </label>
          <label>
            周期环节
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option>体检至回传</option>
              <option>主检</option>
              <option>总检</option>
            </select>
          </label>
          <label>
            周期小时阈值
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (!type.trim() || !Number.isFinite(hours) || hours <= 0) {
                setNotice("请填写类型和大于零的小时数。");
                return;
              }
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "qualityStageThresholds",
                  record: {
                    id: `TIMING-${encodeURIComponent(type.trim())}-${stage}`,
                    type: type.trim(),
                    stage,
                    hours,
                  },
                },
              });
              setNotice("类型周期阈值已保存并用于超时计算。");
            }}
          >
            保存类型周期
          </button>
        </>
      )}
      {tab === "驳回质控" && (
        <>
          <p>
            责任人仅取被驳回前的项目医生元数据或已完成主检节点；没有证据的记录保留未知，不把驳回操作人当作责任医生。此视图日期按驳回/结果完成日筛选；分母按分检/主检分开，为仍可核对的去重项目/主检样本，审计已截断历史不等于全院历史。
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table" aria-label="医生驳回原因与样本率">
              <thead>
                <tr>
                  <th>责任医生 / 阶段</th>
                  <th>原因</th>
                  <th>记录 / 去重退回样本</th>
                  <th>可核对样本</th>
                  <th>样本占比</th>
                </tr>
              </thead>
              <tbody>
                {rejections.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.doctor} / {r.stage}
                    </td>
                    <td>{r.reason}</td>
                    <td>
                      {r.events} / {r.rejected}
                    </td>
                    <td>{r.total ?? "未知"}</td>
                    <td>
                      {r.rate === null
                        ? "未知"
                        : `${(r.rate * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>针对性整改</h3>
          <label>
            整改责任人
            <input value={doctor} onChange={(e) => setDoctor(e.target.value)} />
          </label>
          <label>
            整改问题或原因
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            整改计划
            <textarea value={plan} onChange={(e) => setPlan(e.target.value)} />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (!doctor.trim() || !reason.trim() || !plan.trim()) {
                setNotice("责任人、原因、整改计划均必填。");
                return;
              }
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "qualityImprovements",
                  record: {
                    id: `QI-${crypto.randomUUID()}`,
                    doctor: doctor.trim(),
                    reason: reason.trim(),
                    plan: plan.trim(),
                    status: "待整改",
                    at: new Date().toISOString(),
                  },
                },
              });
              setPlan("");
              setNotice("整改计划已保存。");
            }}
          >
            保存整改计划
          </button>
          <label>
            整改完成说明
            <input
              value={completion}
              onChange={(e) => setCompletion(e.target.value)}
            />
          </label>
          {(state.records.qualityImprovements || []).map((r) => (
            <article className="panel" key={r.id}>
              <strong>
                {r.doctor} · {r.status}
              </strong>
              <p>
                {r.reason}：{r.plan}
              </p>
              <p>{r.completion}</p>
              {r.status !== "已完成" && (
                <button
                  className="btn"
                  onClick={() => {
                    if (!completion.trim()) {
                      setNotice("完成整改前请填写完成说明。");
                      return;
                    }
                    act({
                      type: "UPSERT_RECORD",
                      payload: {
                        collection: "qualityImprovements",
                        record: {
                          ...r,
                          status: "已完成",
                          completion: completion.trim(),
                          completedAt: new Date().toISOString(),
                        },
                      },
                    });
                  }}
                >
                  确认完成此整改
                </button>
              )}
            </article>
          ))}
        </>
      )}
      <p role="status">{notice}</p>
    </div>
  );
}
