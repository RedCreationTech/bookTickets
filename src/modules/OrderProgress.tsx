import { useState } from "react";
import type { Action, DemoState } from "../model";
import { Modal } from "../ui";
import { reviewNodes } from "../clinicalRules";
import { appointmentFingerprint } from "../batchOrderingRules";
import {
  ORDER_FLOW_STATES,
  ORDER_SOURCES,
  ITEM_STATES,
  queryOrders,
  orderSourceClass,
  orderItemRows,
  orderFlowEvents,
  itemOperationErrors,
  canUnlockOrder,
  previewThirdPartyOrder,
  type ThirdPartyDraft,
  type OrderSearchFilters,
} from "../orderProgressRules";
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
type Props = { state: DemoState; act: (a: Action) => void };
export function OrderItemProgress({
  state,
  act,
  appointmentId,
}: Props & { appointmentId: string }) {
  const a = state.appointments.find((a) => a.id === appointmentId),
    [item, setItem] = useState(""),
    [operation, setOperation] = useState("confirm"),
    [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [reference, setReference] = useState(""),
    [confirmation, setConfirmation] = useState("未完成"),
    [pending, setPending] = useState<Record<string, any> | null>(null),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("all");
  if (!a) return <p>订单不存在</p>;
  const selected = item || a.items[0] || "",
    rows = orderItemRows(state, a),
    draft = {
      item: selected,
      operation,
      reason,
      date,
      reference,
      confirmation,
    },
    errors = itemOperationErrors(state, a, draft);
  return (
    <section aria-label="逐项目执行与改期">
      <h3>逐项目执行、确认与改期</h3>
      <p className="muted">
        开始或收到报告登记不制造检查结果。结果保存后自动显示完成。改期只保存该项目日期，不改整单预约，不预留新的医院号源。弃检不直接退款。
      </p>
      <label>
        项目状态筛选
        <select
          aria-label="项目状态筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部</option>
          <option>未检</option>
          {ITEM_STATES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>检查项目</th>
              <th>状态</th>
              <th>项目改期</th>
              <th>人工确认 / 报告</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(
                (r) =>
                  filter === "all" ||
                  (filter === "未检" && r.unfinished) ||
                  r.state === filter,
              )
              .map((r) => (
                <tr key={r.item}>
                  <td>{r.item}</td>
                  <td>{r.state}</td>
                  <td>{r.rescheduleDate || "—"}</td>
                  <td>{r.confirmation || r.reference || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="form-grid">
        <label>
          操作项目
          <select
            aria-label="操作项目"
            value={selected}
            onChange={(e) => setItem(e.target.value)}
          >
            {a.items.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          项目动作
          <select
            aria-label="项目动作"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="confirm">人工确认未完成情况</option>
            <option value="start">开始检查</option>
            <option value="register">项目登记</option>
            <option value="report_received">收到合成报告登记</option>
            <option value="reschedule">仅此项目改期</option>
            <option value="waive">弃检此项目</option>
          </select>
        </label>
        {operation === "confirm" && (
          <label>
            确认结论
            <select
              aria-label="确认结论"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            >
              <option>未完成</option>
              <option>待回传</option>
            </select>
          </label>
        )}
        {operation === "reschedule" && (
          <label>
            项目改期日期
            <input
              aria-label="项目改期日期"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
        {operation === "report_received" && (
          <label>
            合成报告编号
            <input
              aria-label="合成报告编号"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        )}
        <label>
          项目操作原因
          <input
            aria-label="项目操作原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      {errors.length > 0 && <p className="muted">{errors.join("；")}</p>}
      <button
        className="btn btn-primary"
        disabled={!!errors.length}
        onClick={() =>
          setPending({
            ...draft,
            id: id("ITEM"),
            appointmentId: a.id,
            expected: appointmentFingerprint(a),
          })
        }
      >
        预览项目操作
      </button>
      {message && <p role="status">{message}</p>}
      {pending && (
        <Modal title="确认单个项目操作" onClose={() => setPending(null)}>
          <p>
            {a.id} / {pending.item} / {pending.operation}{" "}
            {pending.date || pending.confirmation || pending.reference}
          </p>
          <p>不会补造结果或覆盖其他项目。{pending.reason}</p>
          <div className="actions">
            <button className="btn" onClick={() => setPending(null)}>
              取消项目操作
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                act({ type: "ORDER_ITEM_ACTION", payload: pending });
                setPending(null);
                setMessage("已提交项目动作，可在项目明细与操作审计回看。");
              }}
            >
              确认项目操作
            </button>
          </div>
        </Modal>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>项目操作记录</th>
              <th>内容</th>
              <th>时间 / 人员</th>
            </tr>
          </thead>
          <tbody>
            {(state.records.orderItemEvents || [])
              .filter((r) => r.appointmentId === a.id)
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.item} / {r.operation}
                  </td>
                  <td>
                    {r.reason} {r.date || r.confirmation || r.reference}
                  </td>
                  <td>
                    {r.at} / {r.actor}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function OrderFlowDesk({
  state,
  act,
  appointmentId,
}: Props & { appointmentId: string }) {
  const a = state.appointments.find((a) => a.id === appointmentId),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState("初审");
  if (!a) return null;
  const nodes: string[] = reviewNodes(state, a);
  const send = (type: string) =>
    act({
      type,
      payload: {
        id: id("FLOW"),
        appointmentId: a.id,
        expected: appointmentFingerprint(a),
        reason,
        target,
      },
    });
  return (
    <section aria-label="完整订单流转">
      <h3>订单流转证据</h3>
      <p className="muted">
        22
        类状态按真实业务记录查询。未发生节点不会补造；种子订单缺少时间时显示未知。审核通过复用总检审核页面。
      </p>
      <div className="actions">
        <button
          className="btn"
          disabled={!["booked", "paid"].includes(a.status) || a.locked}
          onClick={() => send("ORDER_REVIEW_CONFIGURE")}
        >
          本订单启用四节点审核
        </button>
      </div>
      <label>
        流转操作原因
        <input
          aria-label="流转操作原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          className="btn"
          disabled={!reason.trim() || a.status !== "review" || a.locked}
          onClick={() => send("ORDER_REVIEW_START")}
        >
          开始当前审核节点
        </button>
        <select
          aria-label="驳回审核目标"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {nodes.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button
          className="btn"
          disabled={
            !reason.trim() ||
            a.locked ||
            !["review", "approved"].includes(a.status)
          }
          onClick={() => send("ORDER_REVIEW_RETURN")}
        >
          驳回到已到达节点
        </button>
        <button
          className="btn"
          disabled={
            !reason.trim() ||
            a.locked ||
            !["approved", "printed"].includes(a.status) ||
            !!a.closedAt
          }
          onClick={() => send("ORDER_CLOSE")}
        >
          确认订单结束
        </button>
        {a.locked && (
          <button
            className="btn"
            disabled={!canUnlockOrder(state, a) || !reason.trim()}
            onClick={() => send("ORDER_UNLOCK")}
          >
            按权限解禁订单
          </button>
        )}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>真实节点 / 事件</th>
              <th>记录时间</th>
              <th>证据来源</th>
            </tr>
          </thead>
          <tbody>
            {orderFlowEvents(state, a).map((e) => (
              <tr key={e.id}>
                <td>{e.label}</td>
                <td>{e.at || "未知"}</td>
                <td>{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function OrderUnlockSettings({ state, act }: Props) {
  const [roles, setRoles] = useState<string[]>(
    state.config.orderUnlockRoles || ["admin"],
  );
  return (
    <section>
      <h3>订单解禁权限</h3>
      <p>
        管理员始终保留解禁权限；自定义角色还须具有订单处理权限。前端本地校验不能替代服务端鉴权。
      </p>
      <div className="check-grid">
        {[
          "admin",
          "reception",
          "doctor",
          "reviewer",
          "finance",
          ...(state.records.roles || []).map((r) => r.id),
        ].map((role) => (
          <label key={role}>
            <input
              type="checkbox"
              aria-label={`允许解禁 ${role}`}
              checked={roles.includes(role)}
              disabled={role === "admin"}
              onChange={(e) =>
                setRoles(
                  e.target.checked
                    ? [...roles, role]
                    : roles.filter((v) => v !== role),
                )
              }
            />
            {role}
          </label>
        ))}
      </div>
      <button
        className="btn btn-primary"
        disabled={state.config.role !== "admin" || !!state.config.customRoleId}
        onClick={() =>
          act({
            type: "ORDER_UNLOCK_CONFIGURE",
            payload: { id: id("UNLOCKCFG"), roles },
          })
        }
      >
        保存解禁角色权限
      </button>
      <p>当前授权：{(state.config.orderUnlockRoles || ["admin"]).join("、")}</p>
    </section>
  );
}
export function ThirdPartyOrderImport({ state, act }: Props) {
  const [draft, setDraft] = useState<ThirdPartyDraft>({
      id: id("THIRD"),
      externalId: "DEMO-THIRD-001",
      patientId: state.patients.find((p) => p.company === "个检")?.id || "",
      packageId: state.packages[0]?.id || "",
      date: new Date().toISOString().slice(0, 10),
      time: "08:00",
      campus: state.config.campus || "中心院区",
    }),
    [pending, setPending] = useState<ReturnType<
      typeof previewThirdPartyOrder
    > | null>(null),
    [message, setMessage] = useState("");
  const preview = previewThirdPartyOrder(state, draft),
    set = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <section aria-label="合成第三方预约导入">
      <h3>第三方预约 · 合成导入</h3>
      <p className="muted">
        只使用现有合成客户及 DEMO- 编号；没有第三方网络接口。
      </p>
      <div className="form-grid">
        <label>
          第三方合成编号
          <input
            aria-label="第三方合成编号"
            value={draft.externalId}
            onChange={(e) => set("externalId", e.target.value)}
          />
        </label>
        <label>
          第三方预约客户
          <select
            aria-label="第三方预约客户"
            value={draft.patientId}
            onChange={(e) => set("patientId", e.target.value)}
          >
            {state.patients
              .filter((p) => p.company === "个检")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} / {p.id}
                </option>
              ))}
          </select>
        </label>
        <label>
          第三方预约套餐
          <select
            aria-label="第三方预约套餐"
            value={draft.packageId}
            onChange={(e) => set("packageId", e.target.value)}
          >
            {state.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          第三方预约日期
          <input
            aria-label="第三方预约日期"
            type="date"
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
        <label>
          第三方预约时段
          <input
            aria-label="第三方预约时段"
            type="time"
            value={draft.time}
            onChange={(e) => set("time", e.target.value)}
          />
        </label>
        <label>
          第三方预约院区
          <select
            aria-label="第三方预约院区"
            value={draft.campus}
            onChange={(e) => set("campus", e.target.value)}
          >
            <option>中心院区</option>
            <option>东院区</option>
          </select>
        </label>
      </div>
      <p>{preview.errors.join("；")}</p>
      <button
        className="btn btn-primary"
        disabled={!!preview.errors.length}
        onClick={() => setPending(preview)}
      >
        预览第三方导入
      </button>
      {pending && (
        <Modal title="确认合成第三方预约" onClose={() => setPending(null)}>
          <p>
            {pending.order.thirdPartyExternalId} / {pending.order.date} / ¥
            {pending.order.amount}
          </p>
          <p>{pending.order.items.join("、")}</p>
          <div className="actions">
            <button className="btn" onClick={() => setPending(null)}>
              取消第三方导入
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                act({
                  type: "ORDER_THIRD_PARTY_IMPORT",
                  payload: { ...draft, expected: pending.signature },
                });
                setPending(null);
                setMessage("已提交合成第三方预约，请在第三方来源列表核对。");
              }}
            >
              确认第三方导入
            </button>
          </div>
        </Modal>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function OrderSearchDesk({
  state,
  act,
  onSelect,
}: Props & { onSelect?: (appointmentId: string) => void }) {
  const [filters, setFilters] = useState<OrderSearchFilters>({
      campus: state.config.campus || "中心院区",
      dateField: "appointment",
      match: "fuzzy",
    }),
    [detail, setDetail] = useState(""),
    [cardPatient, setCardPatient] = useState(state.patients[0]?.id || ""),
    [cardStart, setCardStart] = useState(state.config.cardHistoryStart || ""),
    [cardEnd, setCardEnd] = useState(state.config.cardHistoryEnd || ""),
    [message, setMessage] = useState("");
  const set = (key: string, value: string | boolean) =>
      setFilters({ ...filters, [key]: value }),
    rows = queryOrders(state, filters);
  return (
    <section aria-label="高级订单查询与流转">
      <h3>订单检索与未完成明细</h3>
      <div className="form-grid">
        <label>
          订单检索词
          <input
            aria-label="订单检索词"
            placeholder="姓名、证件、体检号、单位、已登记简拼"
            value={filters.query || ""}
            onChange={(e) => set("query", e.target.value)}
          />
        </label>
        <label>
          匹配方式
          <select
            aria-label="匹配方式"
            value={filters.match}
            onChange={(e) => set("match", e.target.value)}
          >
            <option value="fuzzy">模糊</option>
            <option value="exact">精准</option>
          </select>
        </label>
        <label>
          查询院区
          <select
            aria-label="查询院区"
            value={filters.campus}
            onChange={(e) => set("campus", e.target.value)}
          >
            <option>中心院区</option>
            <option>东院区</option>
            <option value="all">全部院区（显式跨院区）</option>
          </select>
        </label>
        <label>
          订单来源
          <select
            aria-label="订单来源"
            value={filters.source || "all"}
            onChange={(e) => set("source", e.target.value)}
          >
            <option value="all">全部来源</option>
            {ORDER_SOURCES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          时间字段
          <select
            aria-label="时间字段"
            value={filters.dateField}
            onChange={(e) => set("dateField", e.target.value)}
          >
            <option value="appointment">预约时间</option>
            <option value="created">创建时间</option>
            <option value="checked">开始体检 / 到检时间</option>
          </select>
        </label>
        <label>
          查询开始日期
          <input
            aria-label="查询开始日期"
            type="date"
            value={filters.start || ""}
            onChange={(e) => set("start", e.target.value)}
          />
        </label>
        <label>
          查询结束日期
          <input
            aria-label="查询结束日期"
            type="date"
            value={filters.end || ""}
            onChange={(e) => set("end", e.target.value)}
          />
        </label>
        <label>
          流转状态查询
          <select
            aria-label="流转状态查询"
            value={filters.flow || "all"}
            onChange={(e) => set("flow", e.target.value)}
          >
            <option value="all">全部真实流转</option>
            {ORDER_FLOW_STATES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          订单项目状态
          <select
            aria-label="订单项目状态"
            value={filters.itemState || "all"}
            onChange={(e) => set("itemState", e.target.value)}
          >
            <option value="all">全部项目状态</option>
            <option>未检</option>
            {ITEM_STATES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={!!filters.missingOnly}
          onChange={(e) => set("missingOnly", e.target.checked)}
        />
        仅未完成 / 未回传项目订单
      </label>
      <details>
        <summary>模拟刷证件查询历史订单</summary>
        <p className="muted">
          使用当前模拟读卡器 {state.config.cardReaderModel || "DEMO-USB-A"}
          。历史时间范围由操作者明确设置；原文“自动设置”的联动含义待澄清。
        </p>
        <label>
          刷卡合成客户
          <select
            aria-label="刷卡合成客户"
            value={cardPatient}
            onChange={(e) => setCardPatient(e.target.value)}
          >
            {state.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} / {p.certificate || `DEMO-${p.id}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          刷卡历史开始
          <input
            aria-label="刷卡历史开始"
            type="date"
            value={cardStart}
            onChange={(e) => setCardStart(e.target.value)}
          />
        </label>
        <label>
          刷卡历史结束
          <input
            aria-label="刷卡历史结束"
            type="date"
            value={cardEnd}
            onChange={(e) => setCardEnd(e.target.value)}
          />
        </label>
        <button
          className="btn"
          onClick={() => {
            if (!cardStart || !cardEnd || cardStart > cardEnd) {
              setMessage("请设置有效历史起止日期。");
              return;
            }
            const p = state.patients.find((p) => p.id === cardPatient);
            setFilters({
              ...filters,
              identity: p?.certificate || `DEMO-${cardPatient}`,
              query: p?.certificate || `DEMO-${cardPatient}`,
              match: "exact",
              dateField: "appointment",
              start: cardStart,
              end: cardEnd,
            });
            act({
              type: "UPDATE_CONFIG",
              payload: { cardHistoryStart: cardStart, cardHistoryEnd: cardEnd },
            });
            setMessage("模拟读卡已填入合成证件号并应用历史日期。");
          }}
        >
          模拟刷证件并查询
        </button>
        <button
          className="btn"
          onClick={() =>
            setFilters({ ...filters, identity: undefined, query: "" })
          }
        >
          清除刷卡限定
        </button>
      </details>
      {message && <p role="status">{message}</p>}
      <p>匹配 {rows.length} 单；未知创建 / 到检时间不会推定为预约时间。</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>订单 / 客户</th>
              <th>来源 / 院区</th>
              <th>预约 / 创建 / 到检</th>
              <th>未完成 / 未回传项目</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.id} /{" "}
                  {state.patients.find((p) => p.id === a.patientId)?.name}
                </td>
                <td>
                  {orderSourceClass(a)} / {a.campus}
                </td>
                <td>
                  {a.date} / {a.createdAt || "未知"} / {a.checkedAt || "未知"}
                </td>
                <td>
                  未完成：
                  {orderItemRows(state, a)
                    .filter((r) => r.unfinished)
                    .map((r) => r.item)
                    .join("、") || "无"}
                  <br />
                  未回传：
                  {orderItemRows(state, a)
                    .filter((r) => r.unreturned)
                    .map((r) => r.item)
                    .join("、") || "无"}
                </td>
                <td>
                  <button
                    className="text-btn"
                    onClick={() => {
                      if (onSelect) onSelect(a.id);
                      else setDetail(a.id);
                    }}
                  >
                    查看项目与流转 {a.id}
                  </button>{" "}
                  <a href={`#/exam?appointmentId=${encodeURIComponent(a.id)}`}>
                    前往分检
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <Modal
          title={`订单项目与流转 ${detail}`}
          onClose={() => setDetail("")}
          wide
        >
          <OrderItemProgress state={state} act={act} appointmentId={detail} />
          <OrderFlowDesk state={state} act={act} appointmentId={detail} />
        </Modal>
      )}
    </section>
  );
}
