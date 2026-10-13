import { useState } from "react";
import { useDemo } from "../store";
import { getOrderRules } from "../orderingRules";
import { Badge } from "../ui";
export function OrderingRuleEditor() {
  const { state, act } = useDemo();
  const [item, setItem] = useState("腹部CT");
  const [requires, setRequires] = useState("一般检查");
  const [excludes, setExcludes] = useState("腹部彩超");
  const [sex, setSex] = useState("不限");
  const [marriage, setMarriage] = useState("不限");
  const [nonDiscount, setNonDiscount] = useState(false);
  const [required, setRequired] = useState(false);
  const [price, setPrice] = useState(350);
  const [pkg, setPkg] = useState("PK02");
  const [minAge, setMinAge] = useState(0);
  const [maxAge, setMaxAge] = useState(120);
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const persist = () => {
    if (!item.trim() || price < 0) return setMessage("请输入项目名和非负价格");
    for (const r of getOrderRules(state))
      act({
        type: "UPSERT_RECORD",
        payload: { collection: "orderingRules", record: r },
      });
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "orderingRules",
        record: {
          id:
            getOrderRules(state).find((r) => r.item === item.trim())?.id ||
            "OR-" + item.trim(),
          item: item.trim(),
          requires,
          excludes,
          sex,
          marriage,
          nonDiscount,
          required,
          price,
        },
      },
    });
    setMessage("项目规则已保存并用于开单校验。");
  };
  return (
    <div>
      <div className="notice">
        以下规则仅为合成业务演示，不是医学适应证。保存后参与开单校验、去重与计费。
      </div>
      <div className="form-grid">
        <label>
          规则项目
          <input value={item} onChange={(e) => setItem(e.target.value)} />
        </label>
        <label>
          单项示例价格
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </label>
        <label>
          依赖项目
          <input
            value={requires}
            onChange={(e) => setRequires(e.target.value)}
          />
        </label>
        <label>
          互斥项目
          <input
            value={excludes}
            onChange={(e) => setExcludes(e.target.value)}
          />
        </label>
        <label>
          适用性别
          <select value={sex} onChange={(e) => setSex(e.target.value)}>
            <option>不限</option>
            <option>男</option>
            <option>女</option>
          </select>
        </label>
        <label>
          适用婚姻
          <select
            value={marriage}
            onChange={(e) => setMarriage(e.target.value)}
          >
            <option>不限</option>
            <option>已婚</option>
            <option>未婚</option>
          </select>
        </label>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        必检不可删除
      </label>
      <label className="check-line">
        <input
          type="checkbox"
          checked={nonDiscount}
          onChange={(e) => setNonDiscount(e.target.checked)}
        />
        不参与折扣
      </label>
      <button className="btn btn-primary" onClick={persist}>
        保存并应用项目规则
      </button>
      <table>
        <thead>
          <tr>
            <th>项目</th>
            <th>适用/绑定</th>
            <th>定价</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {getOrderRules(state).map((r) => (
            <tr key={r.id}>
              <td>
                {r.item}
                {r.required && <Badge>必检</Badge>}
              </td>
              <td>
                {r.sex || "不限"} / {r.marriage || "不限"} · 依赖
                {r.requires || "无"} · 互斥{r.excludes || "无"}
              </td>
              <td>{r.nonDiscount ? "禁止折扣" : "可折扣"}</td>
              <td>
                <button
                  className="text-btn"
                  onClick={() => {
                    setItem(r.item);
                    setRequires(r.requires || "");
                    setExcludes(r.excludes || "");
                    setSex(r.sex || "不限");
                    setMarriage(r.marriage || "不限");
                    setRequired(!!r.required);
                    setNonDiscount(!!r.nonDiscount);
                    setPrice(r.price);
                  }}
                >
                  载入编辑
                </button>
                <button
                  className="text-btn"
                  onClick={() => {
                    for (const rule of getOrderRules(state))
                      act({
                        type: "UPSERT_RECORD",
                        payload: {
                          collection: "orderingRules",
                          record:
                            rule.id === r.id
                              ? {
                                  ...rule,
                                  ruleEnabled: rule.ruleEnabled === false,
                                }
                              : rule,
                        },
                      });
                  }}
                >
                  {r.ruleEnabled === false ? "启用规则" : "停用规则"}
                </button>
                <button
                  className="text-btn"
                  onClick={() => {
                    for (const rule of getOrderRules(state))
                      act({
                        type: "UPSERT_RECORD",
                        payload: {
                          collection: "orderingRules",
                          record:
                            rule.id === r.id
                              ? { ...rule, enabled: rule.enabled === false }
                              : rule,
                        },
                      });
                  }}
                >
                  {r.enabled === false ? "恢复项目" : "停用项目"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>套餐适用与单位绑定</h3>
      <div className="form-grid">
        <label>
          规则套餐
          <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
            {state.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          最小年龄
          <input
            type="number"
            min="0"
            value={minAge}
            onChange={(e) => setMinAge(Number(e.target.value))}
          />
        </label>
        <label>
          最大年龄
          <input
            type="number"
            max="120"
            value={maxAge}
            onChange={(e) => setMaxAge(Number(e.target.value))}
          />
        </label>
        <label>
          限定单位（空为不限）
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
      </div>
      <button
        className="btn"
        onClick={() => {
          if (minAge > maxAge) return setMessage("年龄区间无效");
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "packageRules",
              record: {
                id: "PKR-" + pkg,
                packageId: pkg,
                minAge,
                maxAge,
                sex,
                company,
              },
            },
          });
          setMessage("套餐规则已生效，预约会过滤不适用套餐。");
        }}
      >
        保存并应用套餐规则
      </button>
      {(state.records.packageRules || []).map((r) => (
        <p key={r.id}>
          {state.packages.find((p) => p.id === r.packageId)?.name}：{r.minAge}–
          {r.maxAge}岁 / {r.sex} / {r.company || "不限单位"}{" "}
          <button
            className="text-btn"
            onClick={() =>
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "packageRules",
                  record: { ...r, onlineEnabled: r.onlineEnabled === false },
                },
              })
            }
          >
            {r.onlineEnabled === false ? "启用线上预约" : "禁用线上预约"}
          </button>
        </p>
      ))}
      <PackageCatalogEditor />
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function PackageCatalogEditor() {
  const { state, act } = useDemo();
  const [id, setId] = useState("DEMO-PK-NEW");
  const [name, setName] = useState("合成自定义套餐");
  const [price, setPrice] = useState(499);
  const [items, setItems] = useState("一般检查、血常规、肝功能");
  const [message, setMessage] = useState("");
  return (
    <details>
      <summary>创建与编辑真实演示套餐目录</summary>
      <label>
        载入已有套餐
        <select
          value=""
          onChange={(e) => {
            const p = state.packages.find((p) => p.id === e.target.value);
            if (p) {
              setId(p.id);
              setName(p.name);
              setPrice(p.price);
              setItems(p.items.join("、"));
            }
          }}
        >
          <option value="">选择后编辑</option>
          {state.packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          套餐编码
          <input
            aria-label="套餐编码"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label>
          套餐名称
          <input
            aria-label="套餐名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          套餐金额
          <input
            aria-label="套餐金额"
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </label>
        <label>
          套餐项目
          <input
            aria-label="套餐项目"
            value={items}
            onChange={(e) => setItems(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn"
        onClick={() => {
          const names = [
            ...new Set(
              items
                .split(/[、,]/)
                .map((x) => x.trim())
                .filter(Boolean),
            ),
          ];
          if (!id.trim() || !name.trim() || price < 0 || !names.length)
            return setMessage("请核对套餐编码、名称、金额与项目");
          act({
            type: "UPSERT_PACKAGE",
            payload: { id, name, price, items: names, tag: "自定义合成" },
          });
          setMessage("已保存到共享套餐目录，后台/患者/自助端将使用新目录");
        }}
      >
        保存共享套餐目录
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
