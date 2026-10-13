import { useRef, useState } from "react";
import { useDemo, exportCsv } from "../store";
import { buildOrderAnalytics, uniqueStrings } from "../analyticsData";
import {
  buildGroupReport,
  defaultGroupReportFilter,
  groupConclusionCsv,
  groupPositiveCsv,
  groupReportError,
} from "../groupReportRules";
import type { GroupReportFilter, GroupReport } from "../groupReportRules";
import { DynamicBars, DynamicPie } from "./AnalyticsCharts";
import { PageTitle } from "../ui";
import { Banner } from "./Operations";
export function GroupReportBuilder() {
  const { state, act } = useDemo();
  const all = buildOrderAnalytics(state).filter((r) => r.kind === "团检");
  const [filters, setFilters] = useState<GroupReportFilter>({
    ...defaultGroupReportFilter,
    company: all[0]?.company || "",
  });
  const [title, setTitle] = useState("单位团体健康分析报告（合成演示）");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [sort, setSort] = useState("检出数降序");
  const [topN, setTopN] = useState(10);
  const [snapshotId, setSnapshotId] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const saving = useRef("");
  const exportBusy = useRef(false);
  const snapshots = state.records.groupReportSnapshots || [];
  const live = buildGroupReport(state, filters, selected, sort, topN);
  const snapshot = snapshots.find((s) => s.id === snapshotId);
  const report: GroupReport = snapshot?.report || live;
  const error = groupReportError(filters);
  const edit = (key: keyof GroupReportFilter, value: string) => {
    setFilters({ ...filters, [key]: value });
    setSelected(null);
    setSnapshotId("");
    setNotice("");
  };
  const fingerprint = JSON.stringify({ title: title.trim(), report: live });
  const save = () => {
    if (!Number.isInteger(topN) || topN < 1 || topN > 20) {
      setNotice("男女前N数量必须是1–20的整数。");
      return;
    }
    if (error || !title.trim() || !live.population.length) {
      setNotice(
        error ||
          (!title.trim()
            ? "请填写报告标题"
            : "当前条件没有完成体检人群，不能保存空报告。"),
      );
      return;
    }
    if (saving.current === fingerprint) {
      setNotice("此人群与配置已经归档，未重复生成。");
      return;
    }
    saving.current = fingerprint;
    const id = `GROUP-REPORT-${crypto.randomUUID()}`;
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "groupReportSnapshots",
        record: {
          id,
          title: title.trim(),
          company: live.company,
          createdAt: new Date().toISOString(),
          appointmentIds: live.population.map((p) => p.appointmentId),
          patientIds: live.population.map((p) => p.patientId),
          filters: { ...filters },
          selectedAbnormalities: live.selectedAbnormalities,
          topN,
          sort,
          report: structuredClone(live),
          status: "合成快照",
        },
      },
    });
    setSnapshotId(id);
    setNotice(
      `已保存 ${live.population.length} 人的不可变统计快照；后续订单变化不改写此版本。`,
    );
  };
  const word = async () => {
    if (!snapshot || exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true);
    try {
      const { downloadGroupReportDocx } = await import("../groupReportDocx");
      await downloadGroupReportDocx(
        report,
        snapshot.title,
        snapshot.id,
        snapshot.createdAt,
      );
      setNotice(
        "可编辑 Word .docx 文件已在本地生成，内容采用当前归档人群快照。",
      );
    } catch {
      setNotice("Word 文件生成失败，快照已保留，可重试。");
    } finally {
      exportBusy.current = false;
      setExporting(false);
    }
  };
  const selectedNames = live.selectedAbnormalities;
  const allPopulation = buildGroupReport(state, {
    ...defaultGroupReportFilter,
    company: filters.company,
  }).population;
  return (
    <div className="ops-page">
      <PageTitle
        eyebrow="SYNTHETIC COHORT REPORT"
        title="单位团体报告工作台"
        description="筛选完成体检人群，选取实际异常，归档并导出可编辑 Word"
      />
      <Banner>
        仅使用本地合成客户；报告不用于诊断。所有非弃检项目已有结果才纳入，至少一项有效检查；每客户取范围内最新完成订单，未完成或取消单排除。归档保存名单与统计快照，导出不随以后订单变化。
      </Banner>
      <section className="panel">
        <div className="form-grid">
          <label>
            团检报告单位
            <select
              value={filters.company}
              onChange={(e) => edit("company", e.target.value)}
            >
              <option value="">请选择</option>
              {uniqueStrings(all.map((r) => r.company)).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            团报开始日期
            <input
              type="date"
              value={filters.from}
              onChange={(e) => edit("from", e.target.value)}
            />
          </label>
          <label>
            团报结束日期
            <input
              type="date"
              value={filters.to}
              onChange={(e) => edit("to", e.target.value)}
            />
          </label>
          <label>
            团报性别
            <select
              value={filters.sex}
              onChange={(e) => edit("sex", e.target.value)}
            >
              <option value="">全部</option>
              <option>男</option>
              <option>女</option>
            </select>
          </label>
          <label>
            团报婚姻
            <select
              value={filters.marriage}
              onChange={(e) => edit("marriage", e.target.value)}
            >
              <option value="">全部</option>
              {uniqueStrings([
                "已婚",
                "未婚",
                "未登记婚姻",
                ...allPopulation.map((p) => p.marriage),
              ]).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            团报最小年龄
            <input
              type="number"
              min="0"
              value={filters.ageMin}
              onChange={(e) => edit("ageMin", e.target.value)}
            />
          </label>
          <label>
            团报最大年龄
            <input
              type="number"
              min="0"
              value={filters.ageMax}
              onChange={(e) => edit("ageMax", e.target.value)}
            />
          </label>
          <label>
            团报套餐
            <select
              value={filters.packageId}
              onChange={(e) => edit("packageId", e.target.value)}
            >
              <option value="">全部</option>
              {state.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            团报单位部门
            <select
              value={filters.department}
              onChange={(e) => edit("department", e.target.value)}
            >
              <option value="">全部</option>
              {uniqueStrings(allPopulation.map((p) => p.department)).map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            报告标题
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSnapshotId("");
              }}
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <p>
          当前筛选符合完成口径：<strong>{live.population.length}</strong>{" "}
          人。婚姻/部门未登记保持未知，不自动补齐。
        </p>
      </section>
      <section className="panel">
        <div className="actions">
          <h2>选择实际检出异常</h2>
          <label>
            异常排序
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setSnapshotId("");
              }}
            >
              <option>检出数降序</option>
              <option>名称升序</option>
            </select>
          </label>
          <label>
            男女各前N异常
            <input
              type="number"
              min="1"
              max="20"
              value={topN}
              onChange={(e) => {
                setTopN(Number(e.target.value));
                setSnapshotId("");
              }}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              setSelected(null);
              setSnapshotId("");
            }}
          >
            全选当前实际异常
          </button>
          <button
            className="btn"
            onClick={() => {
              setSelected([]);
              setSnapshotId("");
            }}
          >
            清空所选异常
          </button>
        </div>
        <div className="actions">
          {live.choices.map((r) => (
            <label key={r.name}>
              <input
                type="checkbox"
                aria-label={`纳入异常 ${r.name}`}
                checked={selectedNames.includes(r.name)}
                onChange={() => {
                  setSelected(
                    selectedNames.includes(r.name)
                      ? selectedNames.filter((v) => v !== r.name)
                      : [...selectedNames, r.name],
                  );
                  setSnapshotId("");
                }}
              />
              {r.name} · {r.count} 人
            </label>
          ))}
        </div>
        {!live.choices.length && (
          <p>当前人群未检出可按演示规则判读的异常，不编造异常选项。</p>
        )}
      </section>
      <section className="panel">
        <div className="actions">
          <button className="btn btn-primary" onClick={save}>
            归档当前人群报告
          </button>
          <label>
            已归档团检报告
            <select
              value={snapshotId}
              onChange={(e) => {
                setSnapshotId(e.target.value);
                setNotice(
                  e.target.value
                    ? "正在查看历史快照，当前筛选未改写历史版本。"
                    : "返回实时筛选预览。",
                );
              }}
            >
              <option value="">实时预览（未归档）</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company} · {s.title} · {s.createdAt}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            disabled={!snapshot || exporting}
            onClick={word}
          >
            {exporting ? "正在生成 Word" : "导出可编辑 Word"}
          </button>
          <button
            className="btn"
            disabled={!snapshot || !report.abnormalities.length}
            onClick={() =>
              snapshot &&
              exportCsv(
                `${snapshot.title}_阳性明细.csv`,
                groupPositiveCsv(report),
              )
            }
          >
            导出阳性明细CSV
          </button>
          <button
            className="btn"
            disabled={!snapshot}
            onClick={() =>
              snapshot &&
              exportCsv(
                `${snapshot.title}_单位结论.csv`,
                groupConclusionCsv(report),
              )
            }
          >
            导出单位结论CSV
          </button>
        </div>
        <p role="status">{notice}</p>
        {snapshot && (
          <p>
            归档编号 {snapshot.id} · {snapshot.createdAt} ·
            人群与结果为保存时快照
          </p>
        )}
      </section>
      <section className="panel">
        <h2>
          {snapshot ? snapshot.title : "实时团体报告预览"} · {report.company} ·{" "}
          {report.population.length} 人
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))",
            gap: 24,
          }}
        >
          <div>
            <h3>男女参检比例</h3>
            <DynamicPie
              rows={report.sexDistribution}
              label="团体报告性别比例"
            />
          </div>
          <div>
            <h3>所选常见异常分布（不作疾病诊断）</h3>
            <DynamicBars rows={report.summary} label="团体实际异常分布" />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))",
            gap: 24,
          }}
        >
          <div>
            <h3>男性前 {report.topN} 项异常</h3>
            <DynamicBars rows={report.maleTop} label="男性前N异常" />
          </div>
          <div>
            <h3>女性前 {report.topN} 项异常</h3>
            <DynamicBars rows={report.femaleTop} label="女性前N异常" />
          </div>
        </div>
        <h3>三高合成规则人群分析</h3>
        <p>
          血糖 &gt;6.1；血压
          ≥140/90；血脂明确异常文本。独立于勾选附件异常，未开、缺失与不可判读不视为正常。
        </p>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="团报三高统计">
            <thead>
              <tr>
                <th>指标</th>
                <th>检出人数</th>
                <th>可判读人数</th>
              </tr>
            </thead>
            <tbody>
              {report.threeHigh.counts.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.count}</td>
                  <td>{r.denominator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          任一检出 {report.threeHigh.any} 人；三项同时检出{" "}
          {report.threeHigh.allThree} 人；三项均可判读{" "}
          {report.threeHigh.fullyKnown} 人。
        </p>
      </section>
      <section className="panel">
        <h2>纳入名单与实际结论</h2>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="团检报告纳入名单">
            <thead>
              <tr>
                <th>客户 / 体检号</th>
                <th>性别 / 年龄 / 婚姻</th>
                <th>日期 / 部门 / 套餐</th>
                <th>实际结论</th>
              </tr>
            </thead>
            <tbody>
              {report.population.map((p) => (
                <tr key={p.patientId}>
                  <td>
                    {p.name} / {p.appointmentId}
                  </td>
                  <td>
                    {p.sex} / {p.age ?? "未知"} / {p.marriage}
                  </td>
                  <td>
                    {p.date} / {p.department}
                    <small>{p.packageNames.join("、")}</small>
                  </td>
                  <td>{p.conclusion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>所选阳性检查与结论附件</h3>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="团检阳性明细">
            <thead>
              <tr>
                <th>客户</th>
                <th>异常</th>
                <th>实际结果</th>
                <th>结论</th>
              </tr>
            </thead>
            <tbody>
              {groupPositiveCsv(report).map((r, i) => (
                <tr key={i}>
                  <td>{r.姓名}</td>
                  <td>{r.异常}</td>
                  <td>
                    {r.检查项目}：{r.结果}
                  </td>
                  <td>{r.结论}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
export default GroupReportBuilder;
