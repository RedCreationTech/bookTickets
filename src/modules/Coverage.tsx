import { useState } from "react";
import { Search, ArrowUpRight } from "lucide-react";
import requirements from "../data/requirements.json";
import { Badge, PageTitle } from "../ui";
export default function Coverage() {
  const [q, setQ] = useState("");
  const [star, setStar] = useState(false);
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const list = requirements.filter(
    (r) =>
      (!star || r.star) &&
      (kind === "all" || r.status === kind) &&
      [r.id, r.clause, r.title, r.text].join(" ").includes(q),
  );
  const labels: Record<string, string> = {
    demonstrated: "交互演示",
    partial: "部分 / 待完善",
    "config-only": "配置演示",
    "hardware-unverifiable": "硬件不可验证",
  };
  const rows = requirements as unknown as {
    clause: string;
    subitem?: string;
    star?: boolean;
    status: string;
  }[];
  const starRows = rows.filter((r) => r.star);
  const summary = {
    clauses: new Set(rows.map((r) => r.clause)).size,
    items: rows.length,
    starPositions: new Set(
      starRows.map((r) => `${r.clause}|${r.subitem ?? ""}`),
    ).size,
    starItems: starRows.length,
    hardware: rows.filter((r) => r.status === "hardware-unverifiable").length,
  };
  return (
    <>
      <PageTitle
        eyebrow="COVERAGE / 逐条响应"
        title="标书需求覆盖与边界"
        description={`${summary.items} 项是需求核对数量，不能等同于已实现功能数量。逐项记录交互入口、验证与不可纯前端验收部分。`}
      />
      <div className="coverage-summary">
        <div>
          <strong>{summary.clauses}</strong>
          <span>原编号技术条款</span>
        </div>
        <div>
          <strong>{summary.items}</strong>
          <span>需求核对项</span>
        </div>
        <div>
          <strong>{summary.starPositions}</strong>
          <span>★ 星标条款位置 · 拆分 {summary.starItems} 项核对</span>
        </div>
        <div>
          <strong>{summary.hardware}</strong>
          <span>硬件项需实机验收</span>
        </div>
      </div>
      <div className="notice">
        安全说明：页面权限、临床逻辑、通讯与支付均为展示。完整的安全鉴权、数据持久化、接口协议、真实硬件及性能验收需要生产系统。覆盖记录区分模拟展示与可验证的前端交互。
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="搜索 T 编号、条款、功能关键词"
              aria-label="搜索需求"
            />
          </div>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">全部覆盖状态</option>
            {Object.entries(labels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label className="check-line">
            <input
              type="checkbox"
              checked={star}
              onChange={(e) => {
                setStar(e.target.checked);
                setPage(0);
              }}
            />
            仅看 ★
          </label>
          <span className="spacer" />
          <Badge tone="gray">{list.length} 项</Badge>
        </div>
        <div className="requirement-list">
          {list.slice(page * 20, page * 20 + 20).map((r) => (
            <details key={r.id} className="requirement">
              <summary>
                <span className="req-id">
                  {r.star ? "★ " : ""}
                  {r.id}
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <small>
                    {r.clause} · {r.text}
                  </small>
                </div>
                <Badge
                  tone={
                    r.status === "demonstrated"
                      ? "green"
                      : r.status === "hardware-unverifiable"
                        ? "gray"
                        : "amber"
                  }
                >
                  {labels[r.status] || r.status}
                </Badge>
              </summary>
              <div className="requirement-body">
                <p>
                  <b>演示交互：</b>
                  {r.interaction}
                </p>
                <p>
                  <b>实现证据：</b>
                  {Array.isArray(r.evidence)
                    ? r.evidence.join("；")
                    : r.evidence}
                </p>
                <p>
                  <b>边界与未验证项：</b>
                  {r.boundary}
                </p>
                <p>
                  <b>测试映射：</b>
                  {r.test}
                </p>
                <a className="btn" href={"#" + r.route}>
                  打开演示页面 <ArrowUpRight size={15} />
                </a>
              </div>
            </details>
          ))}
        </div>
        <div className="table-footer">
          <span>
            第 {page + 1} / {Math.max(1, Math.ceil(list.length / 20))} 页
          </span>
          <div className="actions">
            <button
              className="btn"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <button
              className="btn"
              disabled={(page + 1) * 20 >= list.length}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
