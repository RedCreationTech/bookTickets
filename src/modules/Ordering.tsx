import { useState } from "react";
import { useDemo } from "../store";
import { getOrderRules } from "../orderingRules";
import { Badge } from "../ui";

const campusChoices = ["中心院区", "东院区"];
const splitItemNames = (value: string) => [
  ...new Set(
    value
      .split(/[、,，\n]/)
      .map((name) => name.trim())
      .filter(Boolean),
  ),
];

export function OrderingRuleEditor() {
  const { state, act } = useDemo();
  const [item, setItem] = useState("腹部CT");
  const [requires, setRequires] = useState("一般检查");
  const [excludes, setExcludes] = useState("腹部彩超");
  const [sex, setSex] = useState("不限");
  const [marriage, setMarriage] = useState("不限");
  const [bodyPart, setBodyPart] = useState("");
  const [diseaseType, setDiseaseType] = useState("");
  const [nonDiscount, setNonDiscount] = useState(false);
  const [required, setRequired] = useState(false);
  const [price, setPrice] = useState(350);
  const initialPackageId = state.packages.some((p) => p.id === "PK02")
    ? "PK02"
    : state.packages[0]?.id || "";
  const initialPackageRule = (state.records.packageRules || []).find(
    (r) => r.packageId === initialPackageId,
  );
  const [pkg, setPkg] = useState(initialPackageId);
  const [minAge, setMinAge] = useState(initialPackageRule?.minAge ?? 0);
  const [maxAge, setMaxAge] = useState(initialPackageRule?.maxAge ?? 120);
  const [company, setCompany] = useState(initialPackageRule?.company || "");
  const [packageSex, setPackageSex] = useState(
    initialPackageRule?.sex || "不限",
  );
  const [campuses, setCampuses] = useState<string[]>(
    initialPackageRule?.campuses || [],
  );
  const [optionalItems, setOptionalItems] = useState(
    (initialPackageRule?.optionalItems || []).join("、"),
  );
  const [choose, setChoose] = useState(initialPackageRule?.choose ?? 0);
  const [message, setMessage] = useState("");
  const loadPackageRule = (packageId: string) => {
    const rule = (state.records.packageRules || []).find(
      (r) => r.packageId === packageId,
    );
    setPkg(packageId);
    setMinAge(rule?.minAge ?? 0);
    setMaxAge(rule?.maxAge ?? 120);
    setCompany(rule?.company || "");
    setPackageSex(rule?.sex || "不限");
    setCampuses(rule?.campuses || []);
    setOptionalItems((rule?.optionalItems || []).join("、"));
    setChoose(rule?.choose ?? 0);
    setMessage("");
  };
  const persist = () => {
    if (!item.trim() || !Number.isFinite(price) || price < 0)
      return setMessage("请输入项目名和非负价格");
    const rules = getOrderRules(state);
    const existing = rules.find((r) => r.item === item.trim());
    for (const r of rules)
      act({
        type: "UPSERT_RECORD",
        payload: { collection: "orderingRules", record: r },
      });
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "orderingRules",
        record: {
          ...existing,
          id: existing?.id || "OR-" + item.trim(),
          item: item.trim(),
          requires,
          excludes,
          sex,
          marriage,
          bodyPart: bodyPart.trim(),
          diseaseType: diseaseType.trim(),
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
      <label>
        小程序默认套餐必选套数
        <input
          type="number"
          min="1"
          max={state.packages.length}
          value={state.config.packageChooseCount || 1}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1 && n <= state.packages.length)
              act({
                type: "UPDATE_CONFIG",
                payload: { packageChooseCount: n },
              });
          }}
        />
      </label>
      <p className="muted">
        只影响个检 H5，单位优先使用团检订单约定；默认单套餐。
      </p>
      <label>
        患者取消预约后的记录策略
        <select
          value={
            state.config.cancellationPolicy === "deleteBusiness"
              ? "deleteBusiness"
              : "retain"
          }
          onChange={(e) =>
            act({
              type: "UPDATE_CONFIG",
              payload: {
                cancellationPolicy:
                  e.target.value === "deleteBusiness"
                    ? "deleteBusiness"
                    : "retain",
              },
            })
          }
        >
          <option value="retain">保留已取消记录（默认）</option>
          <option value="deleteBusiness">删除可取消的本人本地业务记录</option>
        </select>
      </label>
      <p className="muted">
        删除策略仅作用于本人可取消的本地业务记录。审计记录和可恢复归档始终保留，
        不会被取消操作删除或改写；这是本地合成演示，不涉及医院真实数据。
      </p>
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
        <label>
          检查部位
          <input
            value={bodyPart}
            onChange={(e) => setBodyPart(e.target.value)}
            placeholder="例如：腹部"
          />
        </label>
        <label>
          疾病类型
          <input
            value={diseaseType}
            onChange={(e) => setDiseaseType(e.target.value)}
            placeholder="例如：代谢类（合成分类）"
          />
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
                {r.enabled === false && <Badge>项目停用</Badge>}
                {r.ruleEnabled === false && <Badge>规则停用</Badge>}
              </td>
              <td>
                {r.sex || "不限"} / {r.marriage || "不限"} · 依赖
                {r.requires || "无"} · 互斥{r.excludes || "无"}
                <br />
                部位：{r.bodyPart || "未分类"} · 疾病类型：
                {r.diseaseType || "未分类"}
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
                    setBodyPart(r.bodyPart || "");
                    setDiseaseType(r.diseaseType || "");
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
      <h3>套餐适用、单位绑定与自选包</h3>
      <div className="form-grid">
        <label>
          规则套餐
          <select value={pkg} onChange={(e) => loadPackageRule(e.target.value)}>
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
        <label>
          套餐适用性别
          <select
            value={packageSex}
            onChange={(e) => setPackageSex(e.target.value)}
          >
            <option>不限</option>
            <option>男</option>
            <option>女</option>
          </select>
        </label>
        <label>
          套餐自选项目（以顿号、逗号或换行分隔）
          <textarea
            value={optionalItems}
            onChange={(e) => setOptionalItems(e.target.value)}
            placeholder="骨密度、腹部CT"
          />
        </label>
        <label>
          套餐自选项目必选数
          <input
            type="number"
            min="0"
            step="1"
            max={splitItemNames(optionalItems).length}
            value={choose}
            onChange={(e) => setChoose(Number(e.target.value))}
          />
        </label>
      </div>
      <fieldset>
        <legend>套餐可预约院区（不勾选表示全部院区）</legend>
        {campusChoices.map((campus) => (
          <label className="check-line" key={campus}>
            <input
              type="checkbox"
              checked={campuses.includes(campus)}
              onChange={(e) =>
                setCampuses((current) =>
                  e.target.checked
                    ? [...new Set([...current, campus])]
                    : current.filter((value) => value !== campus),
                )
              }
            />
            {campus}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        自选包属于当前套餐，与默认必选套餐套数独立配置。当前有
        {splitItemNames(optionalItems).length} 个去重后的自选项目，需选 {choose}{" "}
        个。
      </p>
      <button
        className="btn"
        onClick={() => {
          if (!state.packages.some((p) => p.id === pkg))
            return setMessage("请选择有效套餐");
          if (
            !Number.isInteger(minAge) ||
            !Number.isInteger(maxAge) ||
            minAge < 0 ||
            maxAge > 120 ||
            minAge > maxAge
          )
            return setMessage("年龄区间须为 0–120 岁以内的有效整数");
          const names = splitItemNames(optionalItems);
          if (!Number.isInteger(choose) || choose < 0 || choose > names.length)
            return setMessage("自选必选数须为 0 到去重后自选项目数之间的整数");
          const existing = (state.records.packageRules || []).find(
            (r) => r.packageId === pkg,
          );
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "packageRules",
              record: {
                ...existing,
                id: existing?.id || "PKR-" + pkg,
                packageId: pkg,
                minAge,
                maxAge,
                sex: packageSex,
                company: company.trim(),
                campuses: [...new Set(campuses)],
                optionalItems: names,
                choose,
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
          {r.maxAge}岁 / {r.sex} / {r.company || "不限单位"} / 院区：
          {r.campuses?.length ? r.campuses.join("、") : "全部院区"} / 自选：
          {r.optionalItems?.length ? r.optionalItems.join("、") : "无"}
          （选 {r.choose ?? 0} 项）{" "}
          <button
            className="text-btn"
            onClick={() => loadPackageRule(r.packageId)}
          >
            载入套餐规则
          </button>
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
