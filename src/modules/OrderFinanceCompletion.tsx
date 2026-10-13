import { useState } from "react";
import type { Action, DemoState } from "../model";
import { exportCsv } from "../model";
import { Modal } from "../ui";
import {
  PAYMENT_CHANNELS,
  DEMO_CARD_CODE,
  canProcessFinance,
  orderPricingLines,
  orderPaidAllocations,
  previewOrderPayment,
  previewGroupSettlement,
  synchronizePackageCardLifecycle,
} from "../orderFinanceRules";
import type {
  PaymentDraft,
  PaymentMode,
  GroupSettlementMode,
} from "../orderFinanceRules";
import {
  appointmentFingerprint,
  pricingCatalogSignature,
  uid,
} from "../batchOrderingRules";
import { getOrderRules } from "../orderingRules";
type Props = { state: DemoState; act: (action: Action) => void };
const modes: Record<PaymentMode, string> = {
  full_charge: "整单收费",
  full_refund: "整单全退",
  items: "按项目收退费",
  offset: "收退相抵",
  refund_recharge: "全退全收",
};
const groupModes: Record<GroupSettlementMode, string> = {
  contract: "订单合同金额",
  order_details: "订单明细",
  checked_orders: "已检订单",
  checked_items: "已检项目",
  exclude_waived: "弃检项目不计费",
  exclude_unchecked: "未检项目不计费",
};
export function OrderFinanceDesk({
  state,
  act,
  appointmentId,
}: Props & { appointmentId?: string }) {
  const [campus, setCampus] = useState(state.config.campus || "中心院区");
  const visibleOrders = state.appointments.filter(
    (a) => campus === "all" || a.campus === campus,
  );
  const [selected, setSelected] = useState(appointmentId || ""),
    [mode, setMode] = useState<PaymentMode>("full_charge"),
    [channel, setChannel] = useState(PAYMENT_CHANNELS[0]),
    [charges, setCharges] = useState<string[]>([]),
    [refunds, setRefunds] = useState<string[]>([]),
    [extra, setExtra] = useState(""),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [message, setMessage] = useState("");
  const a =
      (appointmentId ? state.appointments : visibleOrders).find(
        (r) => r.id === (appointmentId || selected),
      ) ||
      (!appointmentId
        ? visibleOrders.find((r) => r.status === "booked") || visibleOrders[0]
        : undefined),
    pricing = a ? orderPricingLines(state, a) : [],
    paid = a ? orderPaidAllocations(state, a) : {},
    history = (state.records.orderTransactions || []).filter(
      (r) => !a || r.appointmentId === a.id,
    );
  return (
    <section className="panel" style={{ padding: 20 }}>
      <h2>红创 · 分渠道模拟收退费</h2>
      <p>
        交易以项目余额和预览快照为准。仅模拟现金、银联、微信、支付宝，不连接支付网关或真实退款。旧订单无逐项报价时按已保存总额及套餐比例重建演示分摊。
      </p>
      <div className="form-grid">
        {!appointmentId && (
          <label>
            财务查询院区
            <select
              aria-label="财务查询院区"
              value={campus}
              onChange={(e) => {
                setCampus(e.target.value);
                setSelected("");
              }}
            >
              <option>中心院区</option>
              <option>东院区</option>
              <option value="all">全部院区（显式切换）</option>
            </select>
          </label>
        )}
        {!appointmentId && (
          <label>
            收退费订单
            <select
              aria-label="收退费订单"
              value={a?.id || ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setCharges([]);
                setRefunds([]);
                setExtra("");
              }}
            >
              {visibleOrders.map((r) => (
                <option key={r.id} value={r.id}>
                  {state.patients.find((p) => p.id === r.patientId)?.name} ·{" "}
                  {r.id}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          收退费模式
          <select
            aria-label="收退费模式"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as PaymentMode);
              setCharges([]);
              setRefunds([]);
            }}
          >
            {Object.entries(modes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          收退费渠道
          <select
            aria-label="收退费渠道"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {PAYMENT_CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>应收</th>
              <th>已收余额</th>
              <th>本次收款</th>
              <th>本次退款</th>
            </tr>
          </thead>
          <tbody>
            {pricing.map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td>¥{row.amount.toFixed(2)}</td>
                <td>¥{(paid[row.item] || 0).toFixed(2)}</td>
                <td>
                  <input
                    aria-label={`收款项目 ${row.item}`}
                    type="checkbox"
                    disabled={!["items", "offset"].includes(mode)}
                    checked={charges.includes(row.item)}
                    onChange={(e) =>
                      setCharges(
                        e.target.checked
                          ? [...charges, row.item]
                          : charges.filter((v) => v !== row.item),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`退款项目 ${row.item}`}
                    type="checkbox"
                    disabled={!["items", "offset"].includes(mode)}
                    checked={refunds.includes(row.item)}
                    onChange={(e) =>
                      setRefunds(
                        e.target.checked
                          ? [...refunds, row.item]
                          : refunds.filter((v) => v !== row.item),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {["items", "offset"].includes(mode) && (
        <label>
          本次财务追加项目
          <select
            aria-label="本次财务追加项目"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          >
            <option value="">不追加</option>
            {[
              ...new Set([
                ...state.packages.flatMap((p) => p.items),
                ...getOrderRules(state).map((r) => r.item),
              ]),
            ]
              .filter((item) => !a?.items.includes(item))
              .map((item) => (
                <option key={item}>{item}</option>
              ))}
          </select>
        </label>
      )}
      <label className="field">
        收退费说明
        <textarea
          aria-label="收退费说明"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="btn btn-primary"
        disabled={!a || !canProcessFinance(state)}
        onClick={() => {
          if (!a) return;
          const draft: PaymentDraft = {
            id: uid("PAY"),
            appointmentId: a.id,
            mode,
            channel,
            chargeItems: charges,
            refundItems: refunds,
            extraItems: extra ? [extra] : [],
            reason,
          };
          const details = previewOrderPayment(state, draft);
          if (details.errors.length) {
            setMessage(details.errors.join("；"));
            return;
          }
          setMessage("");
          setPreview({
            ...draft,
            expected: appointmentFingerprint(a),
            catalogSignature: pricingCatalogSignature(state),
            previewSignature: JSON.stringify(details),
            details,
          });
        }}
      >
        预览模拟收退费
      </button>
      {message && <p role="alert">{message}</p>}
      {preview && (
        <Modal title="确认模拟收退费账单" onClose={() => setPreview(null)} wide>
          <p>
            {modes[preview.mode as PaymentMode]} · {preview.channel} ·{" "}
            {preview.appointmentId}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>项目</th>
                  <th>本次收</th>
                  <th>本次退</th>
                </tr>
              </thead>
              <tbody>
                {preview.details.lines.map((r: any) => (
                  <tr key={r.item}>
                    <td>{r.item}</td>
                    <td>¥{r.charge.toFixed(2)}</td>
                    <td>¥{r.refund.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            收 ¥{preview.details.grossCharge.toFixed(2)} / 退 ¥
            {preview.details.grossRefund.toFixed(2)} / 净额 ¥
            {preview.details.net.toFixed(2)}；订单剩余待收 ¥
            {(preview.details.amount - preview.details.paidAfter).toFixed(2)}
          </p>
          <button className="btn" onClick={() => setPreview(null)}>
            取消模拟收退费
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              act({ type: "ORDER_PAYMENT_APPLY", payload: preview });
              setPreview(null);
            }}
          >
            确认模拟收退费
          </button>
        </Modal>
      )}
      <h3>该订单交易明细</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间 / 交易</th>
              <th>渠道 / 模式</th>
              <th>收 / 退 / 净额</th>
              <th>项目明细</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.at}
                  <small>{r.id}</small>
                </td>
                <td>
                  {r.channel} / {modes[r.mode as PaymentMode] || "会员卡抵扣"}
                </td>
                <td>
                  {r.grossCharge} / {r.grossRefund} / {r.net}
                </td>
                <td>
                  {r.lines
                    .map((l: any) => `${l.item} 收${l.charge} 退${l.refund}`)
                    .join("；")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function MembershipCardDesk({ state, act }: Props) {
  const effective = synchronizePackageCardLifecycle(state),
    cards = effective.records.cards || [],
    [count, setCount] = useState(3),
    [type, setType] = useState("储值卡"),
    [balance, setBalance] = useState(500),
    [packageId, setPackageId] = useState(state.packages[0]?.id || ""),
    [issue, setIssue] = useState<any>(null),
    [cardId, setCardId] = useState(""),
    [appointmentId, setAppointmentId] = useState(""),
    [amount, setAmount] = useState(100),
    [challengeId, setChallengeId] = useState(""),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("");
  const card = cards.find((r) => r.id === cardId) || cards[0],
    a =
      state.appointments.find((r) => r.id === appointmentId) ||
      state.appointments.find((r) => r.status === "booked"),
    challenge = (state.records.cardChallenges || []).find(
      (r) => r.id === challengeId,
    ),
    transactions = (state.records.cardTransactions || []).filter(
      (r) => !filter || r.cardId === filter,
    );
  return (
    <section className="panel" style={{ padding: 20, marginTop: 20 }}>
      <h2>红创 · 会员卡批量与消费台账</h2>
      <p>
        全部为合成卡片与余额；短信验证码在本页面模拟显示，不发送真实短信。套餐卡绑定订单检查完成后自动失效。
      </p>
      <div className="form-grid">
        <label>
          批量卡数量
          <input
            aria-label="批量卡数量"
            type="number"
            min="1"
            max="100"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <label>
          批量卡类型
          <select
            aria-label="批量卡类型"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option>储值卡</option>
            <option>套餐卡</option>
          </select>
        </label>
        {type === "储值卡" ? (
          <label>
            每卡初始余额
            <input
              aria-label="每卡初始余额"
              type="number"
              min="0"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
            />
          </label>
        ) : (
          <label>
            套餐卡绑定套餐
            <select
              aria-label="套餐卡绑定套餐"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              {state.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button
        className="btn"
        onClick={() => {
          if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 100 ||
            balance < 0
          ) {
            setMessage("数量须1–100整数，余额不能为负。");
            return;
          }
          setIssue({ id: uid("CARD-BATCH"), count, type, balance, packageId });
        }}
      >
        预览批量制卡
      </button>
      {issue && (
        <Modal title="确认批量合成会员卡" onClose={() => setIssue(null)} wide>
          <p>
            {issue.count} 张 {issue.type}，每张{" "}
            {issue.type === "套餐卡"
              ? state.packages.find((p) => p.id === issue.packageId)?.name
              : `余额 ¥${issue.balance}`}
          </p>
          <ul>
            {Array.from({ length: issue.count }, (_, i) => (
              <li key={i}>
                CARD-{issue.id}-{String(i + 1).padStart(3, "0")}
              </li>
            ))}
          </ul>
          <button className="btn" onClick={() => setIssue(null)}>
            取消批量制卡
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              act({ type: "CARD_BATCH_ISSUE", payload: issue });
              setIssue(null);
            }}
          >
            确认批量制卡
          </button>
        </Modal>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>卡号</th>
              <th>类型 / 套餐</th>
              <th>余额</th>
              <th>生命周期</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>
                  {r.type || "储值卡"} {r.packageId}
                </td>
                <td>{r.balance}</td>
                <td>
                  {r.status || "可用"} {r.appointmentId} {r.expiredReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>关联订单与验证码抵扣</h3>
      <div className="form-grid">
        <label>
          抵扣会员卡
          <select
            aria-label="抵扣会员卡"
            value={card?.id || ""}
            onChange={(e) => {
              setCardId(e.target.value);
              setChallengeId("");
            }}
          >
            {cards.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.balance} · {r.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          会员卡抵扣订单
          <select
            aria-label="会员卡抵扣订单"
            value={a?.id || ""}
            onChange={(e) => {
              setAppointmentId(e.target.value);
              setChallengeId("");
            }}
          >
            {state.appointments.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          本次卡抵扣金额
          <input
            aria-label="本次卡抵扣金额"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(Number(e.target.value));
              setChallengeId("");
            }}
          />
        </label>
      </div>
      <button
        className="btn"
        disabled={!card || !a || card.status === "已失效"}
        onClick={() => {
          if (!a || !card) return;
          const due =
            a.amount -
            Object.values(orderPaidAllocations(state, a)).reduce(
              (n, v) => n + v,
              0,
            );
          if (amount <= 0 || amount > card.balance || amount > due) {
            setMessage("抵扣额必须大于0，不能超过卡余额和订单待收。");
            return;
          }
          const id = uid("CARD-CODE");
          act({
            type: "CARD_SEND_CODE",
            payload: { id, cardId: card.id, appointmentId: a.id, amount },
          });
          setChallengeId(id);
          setMessage("");
        }}
      >
        发送模拟短信验证码
      </button>
      {challenge && (
        <div>
          <p>
            公开演示验证码：{DEMO_CARD_CODE} ·{" "}
            {challenge.status === "consumed"
              ? "本次验证码已消费"
              : challenge.status === "locked"
                ? "错误次数过多，已锁定"
                : "待校验"}{" "}
            · 错误 {challenge.attempts} 次
          </p>
          <label>
            会员卡模拟验证码
            <input
              aria-label="会员卡模拟验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={challenge.status !== "pending"}
            onClick={() => {
              act({ type: "CARD_REDEEM", payload: { id: challenge.id, code } });
              setCode("");
            }}
          >
            验证并抵扣此订单
          </button>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
      <h3>消费明细报表</h3>
      <label>
        消费卡明细筛选
        <select
          aria-label="消费卡明细筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部卡</option>
          {cards.map((r) => (
            <option key={r.id}>{r.id}</option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        disabled={!transactions.length}
        onClick={() =>
          exportCsv(
            "合成会员卡消费明细.csv",
            transactions.map((r) => ({
              卡号: r.cardId,
              订单: r.appointmentId,
              金额: r.amount,
              时间: r.at,
              消费前余额: r.balanceBefore,
              消费后余额: r.balanceAfter,
            })),
          )
        }
      >
        导出消费卡明细
      </button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>卡号 / 订单</th>
              <th>金额</th>
              <th>时间</th>
              <th>余额变化</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.cardId}
                  <small>{r.appointmentId}</small>
                </td>
                <td>{r.amount}</td>
                <td>{r.at}</td>
                <td>
                  {r.balanceBefore} → {r.balanceAfter}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function GroupSettlementDesk({ state, act }: Props) {
  const [campus, setCampus] = useState(state.config.campus || "中心院区");
  const groups = state.records.groupOrders || [],
    [groupId, setGroupId] = useState(groups[0]?.id || ""),
    [mode, setMode] = useState<GroupSettlementMode>("order_details"),
    [contract, setContract] = useState(0),
    [preview, setPreview] = useState<any>(null),
    [message, setMessage] = useState("");
  const details = previewGroupSettlement(
    state,
    groupId,
    mode,
    contract,
    campus,
  );
  return (
    <section className="panel" style={{ padding: 20, marginTop: 20 }}>
      <h2>单位多口径结算</h2>
      <label>
        单位结算院区
        <select
          aria-label="单位结算院区"
          value={campus}
          onChange={(e) => setCampus(e.target.value)}
        >
          <option>中心院区</option>
          <option>东院区</option>
          <option value="all">全部院区（显式切换）</option>
        </select>
      </label>
      <div className="form-grid">
        <label>
          结算单位订单
          <select
            aria-label="结算单位订单"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.company} · {g.name} · {g.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          单位结算口径
          <select
            aria-label="单位结算口径"
            value={mode}
            onChange={(e) => setMode(e.target.value as GroupSettlementMode)}
          >
            {Object.entries(groupModes).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {mode === "contract" && (
          <label>
            本次合同金额
            <input
              aria-label="本次合同金额"
              type="number"
              min="0"
              value={contract}
              onChange={(e) => setContract(Number(e.target.value))}
            />
          </label>
        )}
      </div>
      <p>
        当前口径预计结算 ¥{details.amount.toFixed(2)}
        ；逐单按合同限额封顶，个人自费项目不计单位账。
      </p>
      <button
        className="btn"
        onClick={() => {
          if (details.errors.length) {
            setMessage(details.errors.join("；"));
            return;
          }
          setPreview({
            id: uid("GROUP-SETTLE"),
            groupOrderId: groupId,
            mode,
            contractAmount: contract,
            campus,
            expected: details.signature,
            ...details,
          });
        }}
      >
        预览单位结算单
      </button>
      {message && <p role="alert">{message}</p>}
      {preview && (
        <Modal title="确认单位结算快照" onClose={() => setPreview(null)} wide>
          <p>
            {groupModes[preview.mode as GroupSettlementMode]} · ¥
            {preview.amount.toFixed(2)}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>订单 / 项目</th>
                  <th>明细价</th>
                  <th>计费说明</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((r: any) => (
                  <tr key={`${r.appointmentId}-${r.item}`}>
                    <td>
                      {r.appointmentId} / {r.item}
                    </td>
                    <td>{r.amount}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" onClick={() => setPreview(null)}>
            取消单位结算
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              act({ type: "GROUP_SETTLEMENT_CONFIRM", payload: preview });
              setPreview(null);
            }}
          >
            确认生成单位结算快照
          </button>
        </Modal>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>结算快照</th>
              <th>口径</th>
              <th>金额</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {(state.records.groupSettlementSnapshots || [])
              .filter((r) => r.groupOrderId === groupId)
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{groupModes[r.mode as GroupSettlementMode]}</td>
                  <td>{r.amount}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
