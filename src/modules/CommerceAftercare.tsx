import { useEffect, useRef, useState } from "react";
import { useDemo, today } from "../store";
import type { Row } from "./Operations";
const uid = (p: string) => p + "-" + crypto.randomUUID();
export function validateProductAttributes(rows: Row[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (
      !key ||
      !Array.isArray(row.values) ||
      !row.values.length ||
      row.values.some((v: string) => !v.trim())
    )
      return "属性键及至少一个非空值为必填";
    if (keys.has(key)) return "属性键不可重复";
    keys.add(key);
    if (new Set(row.values).size !== row.values.length)
      return "同属性选项不可重复";
  }
  return "";
}
export function ProductAttributes() {
  const { state, act } = useDemo();
  const products = state.records.products || [];
  const [selected, setSelected] = useState(products[0]?.id || "");
  const product = products.find((p) => p.id === selected);
  const [key, setKey] = useState("");
  const [values, setValues] = useState("");
  const [notice, setNotice] = useState("");
  const attrs: Row[] = product?.attributeOptions || [];
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>商品结构化属性与详情</h2>
      <select
        aria-label="属性管理商品"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="actions">
        <input
          aria-label="商品属性键"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <input
          aria-label="商品属性选项"
          value={values}
          onChange={(e) => setValues(e.target.value)}
          placeholder="以逗号分隔"
        />
        <button
          className="btn"
          disabled={!product}
          onClick={() => {
            const row = {
              key: key.trim(),
              values: values.split(/[，,]/).map((v) => v.trim()),
            };
            const next = [...attrs, row];
            const error = validateProductAttributes(next);
            if (error) return setNotice(error);
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "products",
                record: { ...product, attributeOptions: next },
              },
            });
            setKey("");
            setValues("");
            setNotice("属性已保存，商品详情立即更新");
          }}
        >
          添加商品属性
        </button>
      </div>
      {product && (
        <div aria-label="结构化商品详情">
          <h3>{product.name}</h3>
          <p>{product.description}</p>
          {attrs.map((a, i) => (
            <p key={a.key}>
              <b>{a.key}</b>：{a.values.join(" / ")}
              <button
                className="btn"
                aria-label={`删除商品属性 ${a.key}`}
                onClick={() =>
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "products",
                      record: {
                        ...product,
                        attributeOptions: attrs.filter(
                          (_, index) => index !== i,
                        ),
                      },
                    },
                  })
                }
              >
                删除属性
              </button>
            </p>
          ))}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function ExchangeWorkbench() {
  const { state, act } = useDemo();
  const orders = (state.records.shopOrders || []).filter(
    (o) => !o.exchangeReservation,
  );
  const products = state.records.products || [];
  const exchanges = state.records.orderExchanges || [];
  const [orderId, setOrderId] = useState("");
  const [productId, setProductId] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const pendingReservations = useRef<Record<string, number>>({});
  useEffect(() => {
    inFlight.current.clear();
    pendingReservations.current = {};
  }, [state.records.orderExchanges, state.records.shopOrders]);
  const save = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  const move = (x: Row, step: string) => {
    const key = x.id + ":" + step;
    if (busy.current.has(key) || inFlight.current.has(x.id)) return;
    const original = orders.find((o) => o.id === x.orderId);
    const replacement = products.find((p) => p.id === x.replacementProductId);
    const reserved =
      (state.records.resourceUsage || []).find(
        (r) => r.kind === "commerce" && r.resourceId === replacement?.id,
      )?.used || 0;
    if (
      step === "审核通过" &&
      (!replacement ||
        Number(replacement.stock) -
          reserved -
          (pendingReservations.current[replacement.id] || 0) <
          x.quantity)
    ) {
      setNotice("替换商品库存不足，未审核或占用");
      return;
    }
    if (step === "已取消" && !["待审核", "待退回"].includes(x.status))
      return setNotice("已收货后不可取消换货，须继续重发或人工处理");
    busy.current.add(key);
    inFlight.current.add(x.id);
    if (step === "审核通过") {
      pendingReservations.current[replacement!.id] =
        (pendingReservations.current[replacement!.id] || 0) + x.quantity;
      save("shopOrders", {
        id: "EXRES-" + x.id,
        name: replacement!.name,
        productId: replacement!.id,
        customerId: original?.customerId,
        quantity: x.quantity,
        amount: 0,
        date: today(),
        status: "换货预留",
        exchangeReservation: true,
        exchangeId: x.id,
      });
      save("orderExchanges", {
        ...x,
        status: "待退回",
        approvedAt: new Date().toISOString(),
      });
      if (original)
        save("shopOrders", {
          ...original,
          exchangeId: x.id,
          exchangeStatus: "待退回",
        });
    }
    if (step === "确认退回") {
      const product = products.find((p) => p.id === original?.productId);
      if (!product) {
        busy.current.delete(key);
        inFlight.current.delete(x.id);
        return setNotice("原商品未登记，不能虚构入库");
      }
      save("products", {
        ...product,
        stock: Number(product.stock) + x.quantity,
        stockHistory: [
          ...(product.stockHistory || []),
          {
            id: "RETURN-" + x.id,
            delta: x.quantity,
            reason: "合成换货退回",
            date: today(),
          },
        ],
      });
      save("orderExchanges", {
        ...x,
        status: "待重发",
        returnedAt: new Date().toISOString(),
      });
      if (original)
        save("shopOrders", { ...original, exchangeStatus: "待重发" });
    }
    if (step === "确认重发") {
      const reservation = (state.records.shopOrders || []).find(
        (o) => o.id === "EXRES-" + x.id,
      );
      if (!reservation) {
        busy.current.delete(key);
        inFlight.current.delete(x.id);
        return setNotice("缺少替换库存预留，不允许重发");
      }
      save("shopOrders", {
        ...reservation,
        status: "已签收",
        tracking: "DEMO-EX-" + x.id,
      });
      save("orderExchanges", {
        ...x,
        status: "已完成",
        shippedAt: new Date().toISOString(),
      });
      if (original)
        save("shopOrders", {
          ...original,
          exchangeStatus: "已完成",
          replacementOrderId: reservation.id,
        });
    }
    if (step === "已取消") {
      const reservation = (state.records.shopOrders || []).find(
        (o) => o.id === "EXRES-" + x.id,
      );
      if (reservation) save("shopOrders", { ...reservation, status: "已取消" });
      save("orderExchanges", { ...x, status: "已取消" });
      if (original)
        save("shopOrders", { ...original, exchangeStatus: "已取消" });
    }
    setNotice("换货状态与库存台账已同步，无退款资金操作");
  };
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>换货库存闭环</h2>
      <p>
        已签收源订单→审核预留替换库存→原商品退回入库→演示重发。取消仅允许退回前，释放预留，不产生退款。
      </p>
      <div className="actions">
        <select
          aria-label="换货源订单"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        >
          <option value="">选择已签收订单</option>
          {orders
            .filter((o) => o.status === "已签收")
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.name}
              </option>
            ))}
        </select>
        <select
          aria-label="换货替换商品"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">替换商品</option>
          {products
            .filter((p) => p.status === "在售")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <input
          aria-label="换货申请原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => {
            const order = orders.find((o) => o.id === orderId);
            if (
              !order ||
              order.status !== "已签收" ||
              !products.some((p) => p.id === productId) ||
              !reason.trim()
            )
              return setNotice("请选择有效已签收订单、替换商品及原因");
            if (
              exchanges.some(
                (x) => x.orderId === orderId && x.status !== "已取消",
              )
            )
              return setNotice("该订单已有换货流程，不重复申请");
            const record = {
              id:
                "EXCHANGE-" +
                orderId +
                "-" +
                (exchanges.filter((x) => x.orderId === orderId).length + 1),
              orderId,
              customerId: order.customerId,
              replacementProductId: productId,
              quantity: Number(order.quantity || 1),
              reason,
              status: "待审核",
              date: today(),
              originalAmount: order.amount,
            };
            save("orderExchanges", record);
            save("shopOrders", {
              ...order,
              exchangeId: record.id,
              exchangeStatus: record.status,
            });
          }}
        >
          提交换货申请
        </button>
      </div>
      {exchanges.map((x) => (
        <div key={x.id}>
          <h3>
            {x.orderId} →{" "}
            {products.find((p) => p.id === x.replacementProductId)?.name} ·{" "}
            {x.status}
          </h3>
          <p>
            {x.reason} · {x.quantity} 件
          </p>
          {x.status === "待审核" && (
            <button className="btn" onClick={() => move(x, "审核通过")}>
              审核换货 {x.id}
            </button>
          )}
          {x.status === "待退回" && (
            <button className="btn" onClick={() => move(x, "确认退回")}>
              确认退回入库 {x.id}
            </button>
          )}
          {x.status === "待重发" && (
            <button className="btn" onClick={() => move(x, "确认重发")}>
              确认模拟重发 {x.id}
            </button>
          )}
          {["待审核", "待退回"].includes(x.status) && (
            <button className="btn" onClick={() => move(x, "已取消")}>
              取消换货 {x.id}
            </button>
          )}
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function OrderDisputes() {
  const { state, act } = useDemo();
  const [collection, setCollection] = useState("serviceOrders");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [notice, setNotice] = useState("");
  const rows = state.records[collection] || [];
  const disputes = state.records.orderDisputes || [];
  const save = (c: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection: c, record } });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>订单关联平台介入</h2>
      <p>本地纠纷流程，不代表法律裁决或真实支付争议处理。结案不自动退款。</p>
      <div className="actions">
        <select
          aria-label="介入订单类型"
          value={collection}
          onChange={(e) => {
            setCollection(e.target.value);
            setOrderId("");
          }}
        >
          <option value="serviceOrders">服务订单</option>
          <option value="shopOrders">商城订单</option>
        </select>
        <select
          aria-label="平台介入源订单"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        >
          <option value="">请选择</option>
          {rows
            .filter((o) => !o.exchangeReservation)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.name}
              </option>
            ))}
        </select>
        <input
          aria-label="订单纠纷原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => {
            const order = rows.find((o) => o.id === orderId);
            if (!order || !reason.trim())
              return setNotice("订单及介入原因不能为空");
            const key = `DISPUTE-${collection}-${order.id}`;
            if (disputes.some((d) => d.id === key))
              return setNotice("该订单已存在关联纠纷");
            save("orderDisputes", {
              id: key,
              collection,
              orderId,
              customerId: order.customerId,
              reason,
              status: "待介入",
              date: today(),
            });
            save(collection, {
              ...order,
              disputeId: key,
              disputeStatus: "待介入",
            });
          }}
        >
          发起订单平台介入
        </button>
        <input
          aria-label="平台介入结论"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        />
      </div>
      {disputes
        .filter((d) => d.collection === collection)
        .map((d) => (
          <div key={d.id}>
            <h3>
              {d.orderId} · {d.status}
            </h3>
            <p>
              {d.reason} · {d.resolution || "未结案"}
            </p>
            <p>
              源订单处理结果：
              {rows.find((o) => o.id === d.orderId)?.disputeResolution ||
                "未登记"}
            </p>
            {d.status !== "已结案" && (
              <button
                className="btn"
                onClick={() => {
                  const order = rows.find((o) => o.id === d.orderId);
                  if (!order) return setNotice("源订单不存在，拒绝处理");
                  if (d.status === "处理中" && !resolution.trim())
                    return setNotice("结案必须填写处理结论");
                  const status = d.status === "待介入" ? "处理中" : "已结案";
                  save("orderDisputes", {
                    ...d,
                    status,
                    resolution: status === "已结案" ? resolution : undefined,
                  });
                  save(collection, {
                    ...order,
                    disputeStatus: status,
                    disputeResolution:
                      status === "已结案" ? resolution : undefined,
                  });
                }}
              >
                {" "}
                {d.status === "待介入" ? "受理介入" : "提交结案"} {d.orderId}
              </button>
            )}
          </div>
        ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
