import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Action, DemoState } from "../model";
import { Modal } from "../ui";
import { getOrderRules } from "../orderingRules";
import {
  list,
  labelFor,
  uid,
  orderingActor,
  canEditOrders,
  canApproveDiscount,
  orderEditPolicy,
  previewBatchOrders,
  createBatchOrderPlan,
  appointmentFingerprint,
  pricingCatalogSignature,
  discountFloorPercent,
  discountRequestErrors,
  prepareOrder,
} from "../batchOrderingRules";
import type {
  Row,
  BatchOrderOperation,
  BatchOrderRow,
  BatchOrderPlan,
  DiscountRequest,
} from "../batchOrderingRules";

interface WorkbenchProps {
  state: DemoState;
  act: (action: Action) => void;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel" style={{ padding: 20, marginTop: 16 }}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} wide>
      {children}
    </Modal>
  );
}
function PreviewTable({ rows }: { rows: BatchOrderRow[] }) {
  return (
    <div className="table-scroll">
      <table aria-label="批量变更逐单预览">
        <thead>
          <tr>
            <th>订单 / 客户</th>
            <th>原价 → 新价</th>
            <th>项目变化</th>
            <th>执行策略</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.appointmentId}>
              <td>
                {row.patient}
                <small>{row.appointmentId}</small>
              </td>
              <td>
                ¥{row.beforeAmount.toFixed(2)} → ¥{row.afterAmount.toFixed(2)}
              </td>
              <td>
                增加：{row.added.join("、") || "无"}
                <small>减少：{row.removed.join("、") || "无"}</small>
              </td>
              <td>
                {row.errors.length
                  ? row.errors.join("；")
                  : row.unchanged
                    ? "无变化，不重复写入"
                    : "可执行"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function BatchOrdering({
  state,
  act,
  appointmentIds,
}: WorkbenchProps & { appointmentIds?: string[] }) {
  const [ids, setIds] = useState<string[]>(appointmentIds || []),
    [operation, setOperation] = useState<BatchOrderOperation>("add"),
    [items, setItems] = useState<string[]>([]),
    [packageId, setPackageId] = useState(state.packages[0]?.id || ""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [plan, setPlan] = useState<BatchOrderPlan | null>(null),
    [lastBatch, setLastBatch] = useState(""),
    [query, setQuery] = useState("");
  const submitting = useRef(false),
    externalIds = appointmentIds?.join("|");
  useEffect(() => {
    if (externalIds !== undefined)
      setIds(externalIds ? externalIds.split("|") : []);
  }, [externalIds]);
  const catalog = [
    ...new Set([
      ...state.packages.flatMap((p) => p.items),
      ...getOrderRules(state).map((r) => r.item),
    ]),
  ];
  const candidates = state.appointments.filter((a) =>
    `${a.id} ${state.patients.find((p) => p.id === a.patientId)?.name}`.includes(
      query,
    ),
  );
  const previews = plan ? previewBatchOrders(state, plan) : [];
  const batch = list(state, "orderBatches").find((r) => r.id === lastBatch);
  return (
    <Panel title="红创 · 预约批量项目与套餐调整">
      <p>
        仅修改未付款、未到检、无检查记录且未锁定的预约；已付款、锁定和检查后订单逐单跳过，真实收费与退款不在此操作范围。
      </p>
      <div className="form-grid">
        <label>
          查询批量订单
          <input
            aria-label="查询批量订单"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          批量操作
          <select
            aria-label="批量操作"
            value={operation}
            onChange={(e) =>
              setOperation(e.target.value as BatchOrderOperation)
            }
          >
            <option value="add">增加项目</option>
            <option value="remove">删减项目</option>
            <option value="replace">更换套餐</option>
          </select>
        </label>
      </div>
      <button
        className="btn"
        onClick={() =>
          setIds(
            candidates
              .filter((a) => !orderEditPolicy(state, a).length)
              .map((a) => a.id),
          )
        }
      >
        选择当前可编辑订单
      </button>
      <button className="btn" onClick={() => setIds([])}>
        清空批量选择
      </button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>选择</th>
              <th>预约单</th>
              <th>状态处理策略</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((a) => {
              const policy = orderEditPolicy(state, a);
              return (
                <tr key={a.id}>
                  <td>
                    <input
                      aria-label={`批量选择 ${a.id}`}
                      type="checkbox"
                      checked={ids.includes(a.id)}
                      disabled={!!policy.length && !ids.includes(a.id)}
                      onChange={(e) =>
                        setIds(
                          e.target.checked
                            ? [...new Set([...ids, a.id])]
                            : ids.filter((id) => id !== a.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    {state.patients.find((p) => p.id === a.patientId)?.name}
                    <small>
                      {a.id} · ¥{a.amount.toFixed(2)}
                    </small>
                  </td>
                  <td>{policy.join("；") || "可预览并确认变更"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {operation === "replace" ? (
        <label className="field">
          批量目标套餐
          <select
            aria-label="批量目标套餐"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            {state.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · ¥{p.price}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <fieldset>
          <legend>勾选需{operation === "add" ? "增加" : "删减"}的项目</legend>
          <div className="item-grid">
            {catalog.map((item) => (
              <label className="check-line" key={item}>
                <input
                  aria-label={`批量项目 ${item}`}
                  type="checkbox"
                  checked={items.includes(item)}
                  onChange={(e) =>
                    setItems(
                      e.target.checked
                        ? [...items, item]
                        : items.filter((v) => v !== item),
                    )
                  }
                />
                {item}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="field">
        批量调整原因
        <textarea
          aria-label="批量调整原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn btn-primary"
        disabled={!canEditOrders(state)}
        onClick={() => {
          if (
            !ids.length ||
            !reason.trim() ||
            (operation !== "replace" && !items.length)
          )
            return setError("请选择订单、变更项目或套餐，并填写调整原因。");
          setError("");
          submitting.current = false;
          setPlan(
            createBatchOrderPlan(state, {
              operation,
              appointmentIds: ids,
              items,
              packageId,
              reason,
            }),
          );
        }}
      >
        预览批量变更
      </button>
      {plan && (
        <Dialog title="确认批量预约变更" onClose={() => setPlan(null)}>
          <p>
            {labelFor[plan.operation]} · 已选 {plan.appointmentIds.length}{" "}
            单。确认时再次校验订单、价格和权限；失败订单保留原数据。
          </p>
          <PreviewTable rows={previews} />
          <div className="modal-actions">
            <button className="btn" onClick={() => setPlan(null)}>
              取消批量变更
            </button>
            <button
              className="btn btn-primary"
              disabled={!previews.some((row) => row.eligible && !row.unchanged)}
              onClick={() => {
                if (submitting.current) return;
                submitting.current = true;
                act({ type: "BATCH_ORDER_APPLY", payload: plan });
                setLastBatch(plan.id);
                setPlan(null);
              }}
            >
              确认执行批量变更
            </button>
          </div>
        </Dialog>
      )}
      {batch && (
        <div className="table-scroll" aria-label="批量执行结果">
          <h3>
            批次结果：成功 {batch.success} · 失败 {batch.failed} · 无变化{" "}
            {batch.unchanged}
          </h3>
          <table>
            <thead>
              <tr>
                <th>订单</th>
                <th>结果</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {batch.results.map((r: Row) => (
                <tr key={r.appointmentId}>
                  <td>{r.appointmentId}</td>
                  <td>
                    {r.status === "success"
                      ? "成功"
                      : r.status === "unchanged"
                        ? "无变化"
                        : "失败 / 跳过"}
                  </td>
                  <td>
                    {r.errors.join("；") ||
                      `¥${r.beforeAmount.toFixed(2)} → ¥${r.afterAmount.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>历史批次结果</summary>
        {list(state, "orderBatches").map((r) => (
          <p key={r.id}>
            <button className="text-btn" onClick={() => setLastBatch(r.id)}>
              {r.id}
            </button>{" "}
            {labelFor[r.operation as BatchOrderOperation]} · 成功 {r.success} /
            失败 {r.failed} · {r.reason}
          </p>
        ))}
      </details>
    </Panel>
  );
}
export function DiscountApprovalDesk({
  state,
  act,
  appointmentId,
  initialPercent = 70,
}: WorkbenchProps & { appointmentId?: string; initialPercent?: number }) {
  const [selected, setSelected] = useState(appointmentId || ""),
    [percent, setPercent] = useState(initialPercent),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [decision, setDecision] = useState<{
      id: string;
      type: "approved" | "rejected" | "withdrawn";
    } | null>(null),
    [decisionReason, setDecisionReason] = useState("");
  const [preview, setPreview] = useState<Row | null>(null),
    sending = useRef(false);
  const a =
    state.appointments.find((row) => row.id === (appointmentId || selected)) ||
    (!appointmentId
      ? state.appointments.find((row) => !orderEditPolicy(state, row).length)
      : undefined);
  const requests = list(state, "discountApprovals").filter(
    (r) => !appointmentId || r.appointmentId === appointmentId,
  ) as DiscountRequest[];
  return (
    <Panel title="红创 · 超权限折扣审批">
      <p>
        申请绑定已保存的未付款预约、项目和报价。前台申请，管理员或财务角色审核，获批后才能一次性应用；不得用旧授权修改另一订单。此处均为本地演示角色，不代表真实身份认证。
      </p>
      <div className="form-grid">
        {!appointmentId && (
          <label>
            折扣审批订单
            <select
              aria-label="折扣审批订单"
              value={a?.id || ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setError("");
              }}
            >
              <option value="">选择预约单</option>
              {state.appointments.map((row) => (
                <option key={row.id} value={row.id}>
                  {state.patients.find((p) => p.id === row.patientId)?.name} ·{" "}
                  {row.id}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          申请折扣百分比
          <input
            aria-label="申请折扣百分比"
            type="number"
            min="0"
            max="100"
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
        </label>
      </div>
      <p>
        当前角色：{orderingActor(state)} · 当前订单授权下限：
        {discountFloorPercent(state, a)}%。不可折扣项目仍按 100% 计费。
      </p>
      <label className="field">
        超权限申请原因
        <textarea
          aria-label="超权限申请原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        className="btn btn-primary"
        disabled={!a || !canEditOrders(state)}
        onClick={() => {
          const errors = discountRequestErrors(
            state,
            a?.id || "",
            percent,
            reason,
          );
          if (errors.length) return setError(errors.join("；"));
          setError("");
          sending.current = false;
          const order = a!;
          setPreview({
            id: uid("DISCOUNT"),
            appointmentId: order.id,
            percent,
            reason: reason.trim(),
            expected: appointmentFingerprint(order),
            catalogSignature: pricingCatalogSignature(state),
            quote: prepareOrder(state, order, undefined, percent).quote,
          });
        }}
      >
        预览折扣申请
      </button>
      {preview && (
        <Dialog title="确认提交折扣审批申请" onClose={() => setPreview(null)}>
          <p>
            订单 {preview.appointmentId} · 申请 {preview.percent}% ·
            申请后仍保留原应收，批准并应用后应收 ¥
            {preview.quote.amount.toFixed(2)}。
          </p>
          <ul>
            {preview.quote.rows.map((r: Row) => (
              <li key={r.item}>
                {r.item} · {r.percent}% · ¥{r.amount.toFixed(2)}
                {r.nonDiscount ? " · 不参与折扣" : ""}
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="btn" onClick={() => setPreview(null)}>
              取消折扣申请
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (sending.current) return;
                sending.current = true;
                act({ type: "DISCOUNT_REQUEST", payload: preview });
                setPreview(null);
                setReason("");
                setNotice("请在下方申请记录查看实际审批状态。");
              }}
            >
              确认提交折扣申请
            </button>
          </div>
        </Dialog>
      )}
      <div className="table-scroll">
        <table aria-label="折扣审批记录">
          <thead>
            <tr>
              <th>订单 / 申请</th>
              <th>折扣 / 待应用金额</th>
              <th>流程状态</th>
              <th>审批与执行</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.appointmentId}
                  <small>
                    {r.id} · {r.reason}
                  </small>
                </td>
                <td>
                  {r.percent}% / ¥{r.quote.amount.toFixed(2)}
                </td>
                <td>
                  {
                    {
                      pending: "待审核",
                      approved: "已批准待应用",
                      rejected: "已驳回",
                      consumed: "已应用（授权已消费）",
                      withdrawn: "已撤回",
                      stale: "已失效需重申请",
                    }[r.status]
                  }
                  <small>
                    申请：{r.requestedBy}
                    {r.decidedBy ? ` · 审批：${r.decidedBy}` : ""}
                    {r.decisionReason ? ` · ${r.decisionReason}` : ""}
                  </small>
                </td>
                <td>
                  {r.status === "pending" && (
                    <>
                      <button
                        className="text-btn"
                        aria-label={`批准折扣 ${r.id}`}
                        disabled={
                          !canApproveDiscount(state) ||
                          orderingActor(state) === r.requestedBy
                        }
                        onClick={() => {
                          setDecision({ id: r.id, type: "approved" });
                          setDecisionReason("");
                        }}
                      >
                        批准
                      </button>
                      <button
                        className="text-btn danger"
                        aria-label={`驳回折扣 ${r.id}`}
                        disabled={
                          !canApproveDiscount(state) ||
                          orderingActor(state) === r.requestedBy
                        }
                        onClick={() => {
                          setDecision({ id: r.id, type: "rejected" });
                          setDecisionReason("");
                        }}
                      >
                        驳回
                      </button>
                    </>
                  )}
                  {["pending", "approved"].includes(r.status) &&
                    orderingActor(state) === r.requestedBy && (
                      <button
                        className="text-btn"
                        aria-label={`撤回折扣 ${r.id}`}
                        onClick={() => {
                          setDecision({ id: r.id, type: "withdrawn" });
                          setDecisionReason("");
                        }}
                      >
                        撤回申请
                      </button>
                    )}
                  {r.status === "approved" && (
                    <button
                      className="btn"
                      aria-label={`应用折扣 ${r.id}`}
                      disabled={
                        !canEditOrders(state) ||
                        (orderingActor(state) !== r.requestedBy &&
                          !canApproveDiscount(state))
                      }
                      onClick={() =>
                        act({
                          type: "DISCOUNT_CONSUME",
                          payload: { id: r.id, appointmentId: r.appointmentId },
                        })
                      }
                    >
                      一次性应用到此订单
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!requests.length && (
        <p>
          暂无折扣审批申请。新开单请先按授权内价格保存预约，再绑定订单申请。
        </p>
      )}
      {decision && (
        <Dialog
          title={
            decision.type === "approved"
              ? "批准折扣申请"
              : decision.type === "rejected"
                ? "驳回折扣申请"
                : "撤回折扣申请"
          }
          onClose={() => setDecision(null)}
        >
          <label className="field">
            处理原因（必填）
            <textarea
              aria-label="折扣审批处理原因"
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDecision(null)}>
              取消审批处理
            </button>
            <button
              className="btn btn-primary"
              disabled={!decisionReason.trim()}
              onClick={() => {
                act({
                  type:
                    decision.type === "withdrawn"
                      ? "DISCOUNT_WITHDRAW"
                      : "DISCOUNT_DECIDE",
                  payload: {
                    id: decision.id,
                    decision: decision.type,
                    reason: decisionReason.trim(),
                  },
                });
                setDecision(null);
              }}
            >
              确认审批处理
            </button>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}

export function DiscountPasswordDesk({
  state,
  act,
  appointmentId,
}: WorkbenchProps & { appointmentId: string }) {
  const [code, setCode] = useState(""),
    [percent, setPercent] = useState(85),
    [authId, setAuthId] = useState(""),
    [message, setMessage] = useState("");
  const a = state.appointments.find((r) => r.id === appointmentId),
    auth = list(state, "discountCodeAuthorizations").find(
      (r) => r.id === authId,
    );
  return (
    <Panel title="演示折扣密码授权">
      <p>
        公开合成口令 DEMO-DISCOUNT-85（最低85%）或
        DEMO-DISCOUNT-60（最低60%），非真实账户密码。授权绑定本订单、当前角色及报价，10分钟有效且只能应用一次。
      </p>
      <label>
        演示折扣口令
        <input
          aria-label="演示折扣口令"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="请勿输入真实密码"
        />
      </label>
      <button
        className="btn"
        disabled={!a}
        onClick={() => {
          if (!a) return;
          if (!["DEMO-DISCOUNT-85", "DEMO-DISCOUNT-60"].includes(code)) {
            setMessage("演示口令错误，未获得折扣权限。");
            return;
          }
          const errors = orderEditPolicy(state, a);
          if (errors.length) {
            setMessage(errors.join("；"));
            return;
          }
          const id = uid("CODE");
          act({
            type: "DISCOUNT_CODE_UNLOCK",
            payload: {
              id,
              appointmentId,
              code,
              expected: appointmentFingerprint(a),
            },
          });
          setAuthId(id);
          setCode("");
          setMessage("");
        }}
      >
        验证演示折扣口令
      </button>
      {auth && (
        <>
          <p>
            当前授权下限 {auth.minPercent}% ·{" "}
            {auth.status === "consumed" ? "已消费" : "待使用"}
          </p>
          <label>
            口令授权折扣
            <input
              aria-label="口令授权折扣"
              type="number"
              min={auth.minPercent}
              max="100"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={auth.status !== "active"}
            onClick={() => {
              if (percent < auth.minPercent || percent > 100) {
                setMessage(`折扣不能低于授权下限 ${auth.minPercent}%。`);
                return;
              }
              act({
                type: "DISCOUNT_CODE_APPLY",
                payload: { id: auth.id, appointmentId, percent },
              });
              setMessage(
                "请核对订单金额及授权消费状态；状态变化后的旧授权不可使用。",
              );
            }}
          >
            应用本次口令折扣
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </Panel>
  );
}
export function GroupItemSwap({
  state,
  act,
  appointmentId,
}: WorkbenchProps & { appointmentId: string }) {
  const a = state.appointments.find((row) => row.id === appointmentId),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [reason, setReason] = useState(""),
    [plan, setPlan] = useState<BatchOrderPlan | null>(null);
  if (!a) return null;
  const catalog = [
    ...new Set([
      ...state.packages.flatMap((p) => p.items),
      ...getOrderRules(state).map((r) => r.item),
    ]),
  ];
  return (
    <Panel title="套餐内换项与个人差额">
      <p>
        仅未付款、未到检订单可换项；必检及已出结果项目不能换出。新金额按单位合同限额重算，超额部分归个人。
      </p>
      <div className="form-grid">
        <label>
          换出套餐项目
          <select
            aria-label="换出套餐项目"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value="">请选择</option>
            {a.items.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          换入检查项目
          <select
            aria-label="换入检查项目"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">请选择</option>
            {catalog
              .filter((item) => !a.items.includes(item))
              .map((item) => (
                <option key={item}>{item}</option>
              ))}
          </select>
        </label>
      </div>
      <label>
        套餐换项原因
        <input
          aria-label="套餐换项原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="btn"
        disabled={!from || !to || !reason.trim()}
        onClick={() =>
          setPlan(
            createBatchOrderPlan(state, {
              operation: "swap",
              appointmentIds: [a.id],
              items: [to],
              removeItems: [from],
              reason,
            }),
          )
        }
      >
        预览套餐换项
      </button>
      {plan && (
        <Dialog title="确认套餐换项与差额" onClose={() => setPlan(null)}>
          <PreviewTable rows={previewBatchOrders(state, plan)} />
          {previewBatchOrders(state, plan)[0]?.patch?.groupSplit && (
            <p>
              单位承担 ¥
              {previewBatchOrders(state, plan)[0].patch!.groupSplit.unit} ·
              个人承担 ¥
              {previewBatchOrders(state, plan)[0].patch!.groupSplit.personal}
            </p>
          )}
          <button className="btn" onClick={() => setPlan(null)}>
            取消套餐换项
          </button>
          <button
            className="btn btn-primary"
            disabled={!previewBatchOrders(state, plan).every((r) => r.eligible)}
            onClick={() => {
              act({ type: "BATCH_ORDER_APPLY", payload: plan });
              setPlan(null);
            }}
          >
            确认套餐内换项
          </button>
        </Dialog>
      )}
    </Panel>
  );
}
