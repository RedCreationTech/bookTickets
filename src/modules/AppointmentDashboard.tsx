import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo, exportCsv, today } from "../store";
import { PageTitle, Empty } from "../ui";
import { Banner, Metrics } from "./Operations";
import { DynamicBars, DynamicPie } from "./AnalyticsCharts";
import {
  appointmentCapacityDetails,
  appointmentDailyStatistics,
  appointmentSlotStatistics,
  buildOrderAnalytics,
  countGroups,
  filterAppointmentAnalytics,
  inclusiveDays,
} from "../analyticsData";
import type { AppointmentAnalyticsFilters } from "../analyticsData";
export function AppointmentDashboard() {
  const { state, act } = useDemo();
  const [filters, setFilters] = useState<AppointmentAnalyticsFilters>(() => ({
    from: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
    to: today(),
    timeFrom: "",
    timeTo: "",
    company: "",
    sex: "",
    kind: "",
    type: "",
    customerType: "",
    includeCancelled: false,
  }));
  const [auto, setAuto] = useState(true);
  const [seconds, setSeconds] = useState(30);
  const [refresh, setRefresh] = useState({
    at: new Date().toISOString(),
    count: 0,
  });
  const [full, setFull] = useState(false);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState("项目");
  const [capacityName, setCapacityName] = useState("");
  const [capacity, setCapacity] = useState(20);
  const root = useRef<HTMLDivElement>(null);
  const refreshNow = () =>
    setRefresh((r) => ({ at: new Date().toISOString(), count: r.count + 1 }));
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(refreshNow, seconds * 1000);
    return () => window.clearInterval(id);
  }, [auto, seconds]);
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const all = useMemo(() => buildOrderAnalytics(state), [state]);
  const rows = useMemo(
    () => filterAppointmentAnalytics(state, filters),
    [state, filters],
  );
  const daily = appointmentDailyStatistics(state, filters);
  const capacities = appointmentCapacityDetails(state, filters);
  const error = !inclusiveDays(filters.from, filters.to).length
    ? "请选择有效且不超过366天的日期范围。"
    : filters.timeFrom && filters.timeTo && filters.timeFrom > filters.timeTo
      ? "起始时段不能晚于结束时段。"
      : "";
  const set = (
    key: keyof AppointmentAnalyticsFilters,
    value: string | boolean,
  ) => setFilters({ ...filters, [key]: value });
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (root.current?.requestFullscreen) {
        await root.current.requestFullscreen();
      } else setMessage("当前浏览器不提供全屏 API，可使用浏览器自身全屏功能。");
    } catch {
      setMessage("浏览器未允许进入全屏，数据展示保持可用。");
    }
  };
  const names =
    scope === "项目"
      ? [
          ...new Set([
            ...all.flatMap((r) => r.items),
            ...state.packages.flatMap((p) => p.items),
          ]),
        ].map((name) => ({ id: name, name }))
      : state.packages.map((p) => ({ id: p.id, name: p.name }));
  return (
    <div
      ref={root}
      className="ops-page"
      style={{
        background: "#f5f8f5",
        padding: full ? 24 : 0,
        overflow: full ? "auto" : undefined,
      }}
    >
      <PageTitle
        eyebrow="LIVE LOCAL APPOINTMENT DATA"
        title="预约排期驾驶舱"
        description="日期、时段、性别与单位分布均来自当前合成预约订单"
        actions={
          <button className="btn" onClick={fullscreen}>
            {full ? "退出统计全屏" : "进入统计全屏"}
          </button>
        }
      />
      <Banner>
        动态读取本地共享订单；自动刷新只重读本地数据，不代表医院实时接口。取消预约默认排除。剩余容量按全量有效预约扣减，不能用筛选后的子集虚增号源。
      </Banner>
      <section className="panel">
        <div className="form-grid">
          <label>
            预约统计开始日期
            <input
              type="date"
              value={filters.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <label>
            预约统计结束日期
            <input
              type="date"
              value={filters.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </label>
          <label>
            预约起始时段
            <input
              type="time"
              value={filters.timeFrom}
              onChange={(e) => set("timeFrom", e.target.value)}
            />
          </label>
          <label>
            预约截止时段
            <input
              type="time"
              value={filters.timeTo}
              onChange={(e) => set("timeTo", e.target.value)}
            />
          </label>
          {(
            [
              ["company", "预约统计单位"],
              ["sex", "预约统计性别"],
              ["kind", "个检团检筛选"],
              ["type", "预约类型筛选"],
              ["customerType", "客户类型筛选"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={filters[key]}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">全部</option>
                {[...new Set(all.map((r) => r[key]))].sort().map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={filters.includeCancelled}
            onChange={(e) => set("includeCancelled", e.target.checked)}
          />
          明细包含已取消预约（不占有效号源）
        </label>
        <div className="actions" style={{ marginTop: 14 }}>
          <label className="check-line">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            图表自动刷新
          </label>
          <label>
            刷新间隔
            <select
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            >
              <option value="5">5秒</option>
              <option value="15">15秒</option>
              <option value="30">30秒</option>
            </select>
          </label>
          <button className="btn" onClick={refreshNow}>
            立即刷新图表
          </button>
          <button
            className="btn"
            disabled={!rows.length || !!error}
            onClick={() =>
              exportCsv(
                "红创_预约排期明细.csv",
                rows.map((r) => ({
                  体检号: r.id,
                  姓名: r.name,
                  单位: r.company,
                  性别: r.sex,
                  类型: r.type,
                  个团检: r.kind,
                  日期: r.date,
                  时段: r.time,
                  状态: r.status,
                })),
              )
            }
          >
            导出预约筛选明细
          </button>
        </div>
        <p data-testid="dashboard-refresh">
          本地刷新时间：{refresh.at} · 刷新轮次 {refresh.count}
        </p>
        {(error || message) && (
          <p role={error ? "alert" : "status"}>{error || message}</p>
        )}
      </section>
      <Metrics
        items={[
          { label: "筛选预约订单", value: rows.length },
          {
            label: "独立客户",
            value: new Set(rows.map((r) => r.patientId)).size,
          },
          {
            label: "筛选已到检",
            value: rows.filter((r) => r.arrived && !r.cancelled).length,
          },
          {
            label: "筛选团检 / 个检",
            value: `${rows.filter((r) => r.kind === "团检").length} / ${rows.filter((r) => r.kind === "个检").length}`,
          },
        ]}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 18,
        }}
      >
        <section className="panel">
          <h2>每日预约趋势（含零预约日）</h2>
          <DynamicBars
            label="动态每日预约柱状图"
            rows={daily.map((r) => ({ name: r.date, count: r.count }))}
          />
        </section>
        <section className="panel">
          <h2>性别分布</h2>
          <DynamicPie
            label="动态性别预约饼图"
            rows={countGroups(rows, (r) => r.sex)}
          />
        </section>
        <section className="panel">
          <h2>时段预约分布</h2>
          <DynamicBars
            label="动态时段预约分布"
            rows={appointmentSlotStatistics(state, filters)}
          />
        </section>
        <section className="panel">
          <h2>单位预约分布</h2>
          <DynamicBars
            label="动态单位预约分布"
            rows={countGroups(rows, (r) => r.company)}
          />
        </section>
      </div>
      <section className="panel">
        <h2>每日排期与院级号源</h2>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="每日预约号源">
            <thead>
              <tr>
                <th>日期</th>
                <th>筛选预约 / 类型</th>
                <th>全院有效预约</th>
                <th>院级容量</th>
                <th>院级剩余</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>
                    {r.count} ·{" "}
                    {r.types.map((t) => `${t.name} ${t.count}`).join(" / ") ||
                      "无"}
                  </td>
                  <td>{r.globalBooked}</td>
                  <td>{r.capacity}</td>
                  <td>{r.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>每日类型与项目号源明细</h2>
        <p>
          套餐/项目名额读取预约入口同一
          bookingResourceLimits，0为禁约；全局占用使用匿名汇总，隐藏他人名单不释放名额。类型仅显示人数分布，不杜撰独立额度。资源剩余还需同时满足全院、单位及所选时段规则。
        </p>
        <details>
          <summary>维护共享预约资源额度</summary>
          <div className="form-grid">
            <label>
              号源统计维度
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setCapacityName("");
                }}
              >
                <option>项目</option>
                <option>套餐</option>
              </select>
            </label>
            <label>
              额度统计名称
              <select
                value={capacityName}
                onChange={(e) => setCapacityName(e.target.value)}
              >
                <option value="">请选择</option>
                {names.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              每日统计额度
              <input
                type="number"
                min="0"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </label>
          </div>
          <button
            className="btn"
            onClick={() => {
              if (
                !capacityName ||
                !Number.isInteger(capacity) ||
                capacity < 0
              ) {
                setMessage("请选择名称及非负整数额度。");
                return;
              }
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "bookingResourceLimits",
                  record: {
                    id: `resource-${scope === "项目" ? "item" : "package"}-${encodeURIComponent(capacityName)}-all-all`,
                    kind: scope === "项目" ? "item" : "package",
                    resourceId: capacityName,
                    dailyCapacity: capacity,
                    slotCapacity: null,
                    date: "",
                    time: "",
                    enabled: true,
                  },
                },
              });
              setMessage("共享预约额度已保存，预约入口立即采用同一拒单规则。");
            }}
          >
            保存共享预约额度
          </button>
        </details>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="每日项目类型容量">
            <thead>
              <tr>
                <th>日期</th>
                <th>维度 / 名称</th>
                <th>筛选人数</th>
                <th>全院占用</th>
                <th>额度 / 余量</th>
              </tr>
            </thead>
            <tbody>
              {capacities.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>
                    {r.scope} · {r.name}
                    <small style={{ display: "block" }}>
                      {r.time || "每日"}
                    </small>
                  </td>
                  <td>{r.count}</td>
                  <td>{r.used ?? "不推定"}</td>
                  <td>
                    {r.capacity ?? "未配置"} / {r.remaining ?? "不推定"}
                    <small style={{ display: "block" }}>{r.rule}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>预约人员明细</h2>
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="预约统计人员明细">
            <thead>
              <tr>
                <th>姓名 / 订单</th>
                <th>单位 / 性别</th>
                <th>日期 / 时段</th>
                <th>类型 / 状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    <small>{r.id}</small>
                  </td>
                  <td>
                    {r.company} · {r.sex}
                  </td>
                  <td>
                    {r.date} {r.time}
                  </td>
                  <td>
                    {r.kind} / {r.type} / {r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty />}
      </section>
    </div>
  );
}
export default AppointmentDashboard;
