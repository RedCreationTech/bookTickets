import { useMemo, useState } from "react";
import { Download, Stethoscope } from "lucide-react";
import { useDemo, exportCsv } from "../store";
import { Badge, Empty, PageTitle } from "../ui";
import { Banner, Metrics } from "./Operations";
import {
  buildProjectRows,
  defaultProjectFilters,
  filterProjectRows,
  groupProjectRows,
  projectCsvRows,
  projectFilterError,
  summarizeProjectRows,
} from "../projectStatisticsRules";
import type { ProjectFilters } from "../projectStatisticsRules";
import "./operations.css";
const money = (value: number | null) =>
  value === null ? "未知" : `¥${(value / 100).toFixed(2)}`;
export default function ProjectStatistics() {
  const { state, act } = useDemo();
  const [filters, setFilters] = useState<ProjectFilters>(defaultProjectFilters);
  const [dimension, setDimension] = useState<
    "doctor" | "department" | "room" | "item"
  >("doctor");
  const [mappingItem, setMappingItem] = useState("");
  const [department, setDepartment] = useState("");
  const [room, setRoom] = useState("");
  const [notice, setNotice] = useState("");
  const all = useMemo(() => buildProjectRows(state), [state]);
  const rows = useMemo(() => filterProjectRows(all, filters), [all, filters]);
  const summary = summarizeProjectRows(rows);
  const groups = groupProjectRows(rows, dimension);
  const error = projectFilterError(filters);
  const items = [
    ...new Set([
      ...all.map((r) => r.item),
      ...state.packages.flatMap((p) => p.items),
    ]),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const set = <K extends keyof ProjectFilters>(
    key: K,
    value: ProjectFilters[K],
  ) => setFilters({ ...filters, [key]: value });
  const saveMapping = () => {
    if (!mappingItem || !department.trim() || !room.trim()) {
      setNotice("请选择项目并填写科室和诊室。");
      return;
    }
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "projectStatMappings",
        record: {
          id: `PROJECT-MAP-${encodeURIComponent(mappingItem)}`,
          item: mappingItem,
          department: department.trim(),
          room: room.trim(),
        },
      },
    });
    setNotice(
      "项目归属已保存；仅补充缺失元数据的项目，已有结果归属不会被覆盖。",
    );
  };
  const totals = (known: number, unknown: number) =>
    unknown ? `${money(known)} + ${unknown} 项未知` : money(known);
  return (
    <div className="ops-page">
      <PageTitle
        eyebrow="PROJECT WORKLOAD / 项目统计"
        title="精细项目工作量"
        description="医生、科室与项目明细使用同一套订单项目数据和价格口径"
        actions={
          <button
            className="btn"
            disabled={!rows.length || !!error}
            onClick={() =>
              exportCsv(
                "红创_项目工作量明细.csv",
                projectCsvRows(rows, filters),
              )
            }
          >
            <Download size={15} />
            导出当前明细 CSV
          </button>
        }
      />
      <Banner>
        数量按订单 × 项目去重，依据当前结果判断检查完成。金额是项目工作量 /
        开单价，不代表实收收入。取消、弃检、移除、退款或退款申请项目不计入有效数量与金额；无逐项退款归属时保守排除整单。
      </Banner>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="form-grid">
          <label>
            统计口径
            <select
              value={filters.mode}
              onChange={(e) =>
                set("mode", e.target.value as ProjectFilters["mode"])
              }
            >
              <option value="completed">检查完成工作量</option>
              <option value="ordered">开单项目与人员清单</option>
            </select>
          </label>
          <label>
            审核流程
            <select
              value={filters.reviewFlow}
              onChange={(e) => set("reviewFlow", e.target.value)}
            >
              <option value="">全部审核流程</option>
              {[
                "未送审",
                "初审待办",
                "主检待办",
                "总检待办",
                "审核完成",
                "已取消",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            统计开始日期
            <input
              type="date"
              value={filters.start}
              onChange={(e) => set("start", e.target.value)}
            />
          </label>
          <label>
            统计结束日期
            <input
              type="date"
              value={filters.end}
              onChange={(e) => set("end", e.target.value)}
            />
          </label>
          {(
            [
              ["doctor", "统计医生"],
              ["seller", "项目业务员"],
              ["creator", "项目创建人"],
              ["department", "统计科室"],
              ["room", "统计诊室"],
              ["item", "指定检查项目"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={filters[key]}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">全部</option>
                {[...new Set(all.map((r) => r[key]))]
                  .sort((a, b) => a.localeCompare(b, "zh-CN"))
                  .map((value) => (
                    <option key={value}>{value}</option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={filters.includeExcluded}
            onChange={(e) => set("includeExcluded", e.target.checked)}
          />
          显示取消 / 弃检 / 退款排除项，仅供追踪，不计有效合计
        </label>
        <p className="muted">
          {filters.mode === "completed"
            ? "日期优先取项目结果时间；缺失时使用送审时间或体检日期代理，并逐项标注。医生与科室、诊室优先项目元数据。"
            : "开单日期优先创建时间；旧订单缺创建时间时以体检日期代理。开出总数包含勾选显示的排除项，有效合计始终扣除排除项。"}
        </p>
        {error && (
          <div role="alert" className="callout alert">
            {error}
          </div>
        )}
      </section>
      <Metrics
        items={[
          {
            label:
              filters.mode === "completed" ? "有效完成项目" : "有效开出项目",
            value: summary.count,
            note: `${summary.people} 位客户 · 列示 ${summary.listedCount} 条`,
          },
          {
            label: "原价合计",
            value: totals(summary.originalKnownCents, summary.originalUnknown),
            note: "未知金额未按零补齐",
          },
          {
            label: "执行价合计",
            value: totals(
              summary.executionKnownCents,
              summary.executionUnknown,
            ),
            note: "不等同实收 / 净收入",
          },
          {
            label: "估算 / 排除项目",
            value: `${summary.estimatedCount} / ${summary.excludedCount}`,
            note: "快照缺失与排除原因可追踪",
          },
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Stethoscope size={17} /> 分组工作量
          </h2>
          <label>
            汇总维度
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as typeof dimension)}
            >
              <option value="doctor">医生</option>
              <option value="department">科室</option>
              <option value="room">诊室</option>
              <option value="item">检查项目</option>
            </select>
          </label>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="项目分组工作量">
            <thead>
              <tr>
                <th>分组</th>
                <th>有效数量</th>
                <th>原价</th>
                <th>执行价</th>
                <th>估算 / 排除</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.name}>
                  <td>{group.name}</td>
                  <td>{group.count}</td>
                  <td>
                    {totals(group.originalKnownCents, group.originalUnknown)}
                  </td>
                  <td>
                    {totals(group.executionKnownCents, group.executionUnknown)}
                  </td>
                  <td>
                    {group.estimatedCount} / {group.excludedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!groups.length && <Empty text="当前条件没有项目记录" />}
      </section>
      <section className="panel">
        <h2>
          {filters.mode === "ordered"
            ? "指定项目开单人员明细"
            : "检查项目完成明细"}
        </h2>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="项目统计人员明细">
            <thead>
              <tr>
                <th>客户 / 订单</th>
                <th>项目</th>
                <th>医生 / 科室 / 诊室</th>
                <th>统计日期 / 流程</th>
                <th>原价 / 执行价</th>
                <th>依据与排除状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name}
                    <small style={{ display: "block" }}>
                      {row.appointmentId}
                      <br />
                      {row.company} · {row.seller}
                    </small>
                  </td>
                  <td>
                    {row.item}
                    <small style={{ display: "block" }}>
                      {row.completed ? "已有检查结果" : "尚无检查结果"}
                    </small>
                  </td>
                  <td>
                    {row.doctor}
                    <small style={{ display: "block" }}>
                      {row.department} · {row.room}
                    </small>
                  </td>
                  <td>
                    {filters.mode === "completed"
                      ? row.resultDate || "日期未知"
                      : row.orderDate || "日期未知"}
                    <small style={{ display: "block" }}>{row.reviewFlow}</small>
                  </td>
                  <td>
                    {money(row.originalCents)} / {money(row.executionCents)}
                    {row.exclusion && (
                      <small style={{ display: "block" }}>不计入有效合计</small>
                    )}
                  </td>
                  <td>
                    <Badge
                      tone={
                        row.exclusion
                          ? "gray"
                          : row.estimated
                            ? "amber"
                            : "green"
                      }
                    >
                      {row.exclusion ||
                        (row.originalCents === null ||
                        row.executionCents === null
                          ? "金额未知"
                          : row.estimated
                            ? "含估算"
                            : "价格快照")}
                    </Badge>
                    <details>
                      <summary>查看口径</summary>
                      <p>
                        {row.priceSource}
                        <br />
                        {row.assignmentSource}
                        <br />
                        {filters.mode === "completed"
                          ? row.resultDateSource
                          : row.orderDateSource}
                        <br />
                        {row.warning}
                      </p>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text="没有匹配的项目 / 人员" />}
      </section>
      <details className="panel">
        <summary>价格与归属口径 / 项目映射配置</summary>
        <p>
          有唯一项目价格快照时保留原价及执行价。旧记录缺快照时，按当前套餐等分目录价（重叠项目取高值）或当前项目规则估算原价，再把订单总额扣除已知快照后的余额按原价权重分摊到缺项，分配精确到分且尾差按最大余数分配。所有估算均不是历史原价证据。
        </p>
        <p>
          项目集合从当前订单、结果、弃检清单与价格快照重建；旧单缺历史快照时不能还原已删且未保留的数据。
        </p>
        <p>
          无目录价格时原价保留未知，执行价只按订单余额均摊估算。重复快照不选取任一条；快照与当前订单总额不一致会逐项提示。表内金额不进行付款确认或部分退款归属推断。
        </p>
        <div className="form-grid">
          <label>
            映射检查项目
            <select
              value={mappingItem}
              onChange={(e) => {
                setMappingItem(e.target.value);
                const m = state.records.projectStatMappings?.find(
                  (m) => m.item === e.target.value,
                );
                setDepartment(m?.department || "");
                setRoom(m?.room || "");
              }}
            >
              <option value="">选择项目</option>
              {items.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            统计映射科室
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </label>
          <label>
            统计映射诊室
            <input value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>
        </div>
        <button className="btn" onClick={saveMapping}>
          保存项目统计归属
        </button>
        {notice && <p role="status">{notice}</p>}
        <ul>
          {(state.records.projectStatMappings || []).map((m) => (
            <li key={m.id}>
              {m.item} → {m.department} / {m.room}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
export { ProjectStatistics };
