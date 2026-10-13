import { useRef, useState } from "react";
import { useDemo } from "../store";
import type { Row } from "./Operations";
const id = (prefix: string) => prefix + "-" + crypto.randomUUID();
const active = (r: Row) => !["已停用", "已作废"].includes(r.status);
export function wouldCreateCycle(
  rows: Row[],
  nodeId: string,
  parentId: string,
) {
  const visited = new Set([nodeId]);
  let current = parentId;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = rows.find((r) => r.id === current)?.parentId || "";
  }
  return false;
}
export function OrganizationWorkspace() {
  const { state, act } = useDemo();
  const orgs = state.records.organizations || [];
  const staff = state.records.staff || [];
  const groups = state.records.doctorGroups || [];
  const [orgId, setOrgId] = useState(state.config.currentOrganizationId || "");
  const currentOrg = orgs.find((r) => r.id === orgId);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("机构");
  const [personName, setPersonName] = useState("");
  const [expert, setExpert] = useState(false);
  const [qualification, setQualification] = useState("");
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [status, setStatus] = useState("全部");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const people = staff.filter((r) => r.organizationId === orgId);
  const save = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>机构 ID 与人员分组</h2>
      <p>
        全部为合成目录。机构改名不改变人员归属；当前组件按机构 ID
        隔离展示，非真实多租户鉴权。
      </p>
      <div className="actions">
        <label>
          当前机构
          <select
            aria-label="当前管理机构"
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setMembers([]);
              act({
                type: "UPDATE_CONFIG",
                payload: { currentOrganizationId: e.target.value },
              });
            }}
          >
            <option value="">请选择</option>
            {orgs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.category}
              </option>
            ))}
          </select>
        </label>
        <label>
          机构名称
          <input
            aria-label="机构名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <select
          aria-label="机构类型"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option>机构</option>
          <option>团体</option>
        </select>
        <button
          className="btn"
          onClick={() => {
            if (!name.trim()) return setNotice("请填写机构名称");
            const record = {
              id: id("ORG"),
              name: name.trim(),
              category: kind,
              status: "已启用",
            };
            save("organizations", record);
            setOrgId(record.id);
            setName("");
          }}
        >
          新建机构或团体
        </button>
        <button
          className="btn"
          disabled={!currentOrg}
          onClick={() => {
            if (!name.trim()) return setNotice("请填写新名称");
            save("organizations", {
              ...currentOrg,
              name: name.trim(),
              category: kind,
            });
            setName("");
          }}
        >
          重命名当前机构
        </button>
      </div>
      {currentOrg && (
        <>
          <h3>{currentOrg.name} · 医生及专家</h3>
          <div className="actions">
            <label>
              人员姓名
              <input
                aria-label="机构人员姓名"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </label>
            <label>
              <input
                aria-label="登记为专家"
                type="checkbox"
                checked={expert}
                onChange={(e) => setExpert(e.target.checked)}
              />
              专家
            </label>
            <label>
              资质记录
              <input
                aria-label="专家资质说明"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
              />
            </label>
            <button
              className="btn"
              onClick={() => {
                if (!personName.trim() || (expert && !qualification.trim()))
                  return setNotice("姓名及专家资质说明为必填");
                save("staff", {
                  id: id("STAFF"),
                  name: personName.trim(),
                  organizationId: orgId,
                  category: expert ? "专家" : "专业医生",
                  expert,
                  qualification,
                  status: "待审核",
                });
                setPersonName("");
                setQualification("");
              }}
            >
              提交机构人员资料
            </button>
            <select
              aria-label="专家审核筛选"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["全部", "仅专家", "待审核专家", "已驳回专家"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input
              aria-label="人员审核原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="驳回原因"
            />
          </div>
          <table aria-label="机构人员">
            <thead>
              <tr>
                <th>姓名 / ID</th>
                <th>身份及资质</th>
                <th>审核状态 / 原因</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {people
                .filter(
                  (p) =>
                    status === "全部" ||
                    (p.expert &&
                      (status === "仅专家" ||
                        (status === "待审核专家" && p.status === "待审核") ||
                        (status === "已驳回专家" && p.status === "已驳回"))),
                )
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <small>{p.id}</small>
                    </td>
                    <td>
                      {p.expert ? "专家" : "普通医生"} ·{" "}
                      {p.qualification || "未登记"}
                    </td>
                    <td>
                      {p.status} · {p.rejectionReason}
                    </td>
                    <td>
                      {p.status === "待审核" ? (
                        <>
                          <button
                            className="btn"
                            onClick={() =>
                              save("staff", { ...p, status: "已通过" })
                            }
                          >
                            通过 {p.name}
                          </button>
                          <button
                            className="btn"
                            onClick={() => {
                              if (!reason.trim())
                                return setNotice("驳回必须填写原因");
                              save("staff", {
                                ...p,
                                status: "已驳回",
                                rejectionReason: reason,
                              });
                            }}
                          >
                            驳回 {p.name}
                          </button>
                        </>
                      ) : p.status === "已驳回" ? (
                        <button
                          className="btn"
                          onClick={() =>
                            save("staff", {
                              ...p,
                              status: "待审核",
                              resubmittedAt: new Date().toISOString(),
                            })
                          }
                        >
                          重新提交 {p.name}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <h3>本机构医生分组</h3>
          <input
            aria-label="医生组名称"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <div className="actions">
            {people
              .filter((p) => p.status === "已通过")
              .map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    aria-label={`医生组成员 ${p.id}`}
                    checked={members.includes(p.id)}
                    onChange={(e) =>
                      setMembers(
                        e.target.checked
                          ? [...members, p.id]
                          : members.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
          </div>
          <button
            className="btn"
            onClick={() => {
              if (!groupName.trim() || !members.length)
                return setNotice("组名称和成员不能为空");
              const old = groups.find(
                (g) =>
                  g.organizationId === orgId && g.name === groupName.trim(),
              );
              save("doctorGroups", {
                id: old?.id || id("DG"),
                organizationId: orgId,
                name: groupName.trim(),
                memberIds: [...new Set(members)],
              });
              setNotice("医生组已保存，未修改人员档案");
            }}
          >
            保存医生分组
          </button>
          {groups
            .filter((g) => g.organizationId === orgId)
            .map((g) => (
              <div key={g.id}>
                <b>
                  {g.name} · {g.memberIds.length} 人
                </b>
                {g.memberIds.map((pid: string) => (
                  <span key={pid}>
                    {" "}
                    {people.find((p) => p.id === pid)?.name ||
                      "人员未登记"}{" "}
                    <button
                      className="btn"
                      aria-label={`移除医生组成员 ${g.id} ${pid}`}
                      onClick={() =>
                        save("doctorGroups", {
                          ...g,
                          memberIds: g.memberIds.filter(
                            (x: string) => x !== pid,
                          ),
                        })
                      }
                    >
                      移除
                    </button>
                  </span>
                ))}
              </div>
            ))}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export const dictionaryDomains = [
  "系统",
  "标准",
  "民族",
  "企业",
  "职业",
  "婚姻状况",
  "教育程度",
];
export function DictionaryCategories() {
  const { state, act } = useDemo();
  const categories = state.records.dictionaryCategories || [];
  const entries = state.records.dictionaries || [];
  const [domain, setDomain] = useState("系统");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [entryName, setEntryName] = useState("");
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  const selected = categories.find((r) => r.id === categoryId);
  const save = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>独立字典分类与条目</h2>
      <div className="actions">
        <select
          aria-label="字典领域"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setCategoryId("");
          }}
        >
          {dictionaryDomains.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <input
          aria-label="字典分类名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="分类名"
        />
        <button
          className="btn"
          onClick={() => {
            if (
              !name.trim() ||
              categories.some(
                (c) => c.domain === domain && c.name === name.trim(),
              )
            )
              return setNotice("分类名不能为空且同领域不可重复");
            const r = {
              id: id("DICT-CAT"),
              domain,
              name: name.trim(),
              status: "已启用",
            };
            save("dictionaryCategories", r);
            setCategoryId(r.id);
            setName("");
          }}
        >
          创建字典分类
        </button>
        <select
          aria-label="字典条目所属分类"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">请选择分类</option>
          {categories
            .filter((c) => c.domain === domain)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.status}
              </option>
            ))}
        </select>
        <button
          className="btn"
          disabled={!selected}
          onClick={() => {
            if (!name.trim()) return setNotice("请填写新分类名");
            save("dictionaryCategories", { ...selected, name: name.trim() });
            setName("");
          }}
        >
          重命名分类
        </button>
        <button
          className="btn"
          disabled={!selected}
          onClick={() =>
            save("dictionaryCategories", {
              ...selected,
              status: active(selected!) ? "已停用" : "已启用",
            })
          }
        >
          切换分类启停
        </button>
      </div>
      <div className="actions">
        <input
          aria-label="字典条目名称"
          value={entryName}
          onChange={(e) => setEntryName(e.target.value)}
          placeholder="条目名"
        />
        <input
          aria-label="字典条目值"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="值"
        />
        <button
          className="btn"
          onClick={() => {
            if (
              !selected ||
              !active(selected) ||
              !entryName.trim() ||
              !value.trim()
            )
              return setNotice("请选择启用分类并填写条目名称和值");
            if (
              entries.some(
                (e) => e.categoryId === categoryId && e.value === value.trim(),
              )
            )
              return setNotice("该分类下条目值已存在");
            save("dictionaries", {
              id: id("DICT"),
              name: entryName.trim(),
              category: domain,
              categoryId,
              value: value.trim(),
              status: "已启用",
            });
            setEntryName("");
            setValue("");
          }}
        >
          添加分类条目
        </button>
      </div>
      <table aria-label="分类字典条目">
        <thead>
          <tr>
            <th>分类 ID / 当前名称</th>
            <th>条目</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {entries
            .filter((e) => e.categoryId === categoryId)
            .map((e) => (
              <tr key={e.id}>
                <td>
                  {e.categoryId} / {selected?.name}
                </td>
                <td>{e.name}</td>
                <td>{e.value}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function deviceBalance(device: Row) {
  return (device.movements || []).reduce(
    (n: number, r: Row) => n + Number(r.delta),
    0,
  );
}
export function DeviceInventory() {
  const { state, act } = useDemo();
  const devices = state.records.deviceInventory || [];
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [type, setType] = useState("入库");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const guard = useRef(false);
  const device = devices.find((d) => d.id === selected);
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>设备库存流水</h2>
      <p>本地数量账本，不代表真实设备连接。无期初流水即库存零。</p>
      <div className="actions">
        <input
          aria-label="库存设备型号"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => {
            if (!name.trim()) return;
            const record = {
              id: id("DEVICE"),
              name: name.trim(),
              status: "可用",
              movements: [],
            };
            act({
              type: "UPSERT_RECORD",
              payload: { collection: "deviceInventory", record },
            });
            setSelected(record.id);
            setName("");
          }}
        >
          新增库存型号
        </button>
        <select
          aria-label="库存设备选择"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            guard.current = false;
          }}
        >
          <option value="">请选择型号</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {deviceBalance(d)} 件
            </option>
          ))}
        </select>
        <select
          aria-label="设备出入库类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            guard.current = false;
          }}
        >
          <option>入库</option>
          <option>出库</option>
        </select>
        <input
          aria-label="设备出入库数量"
          type="number"
          value={qty}
          onChange={(e) => {
            setQty(Number(e.target.value));
            guard.current = false;
          }}
        />
        <input
          aria-label="设备出入库原因"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            guard.current = false;
          }}
        />
        <button
          className="btn"
          onClick={() => {
            if (guard.current) return;
            if (!device || !Number.isInteger(qty) || qty <= 0 || !reason.trim())
              return setNotice("请选择设备并填写正整数数量与原因");
            if (type === "出库" && device.status !== "可用")
              return setNotice("设备状态不可出库，库存未变更");
            const delta = type === "入库" ? qty : -qty;
            if (deviceBalance(device) + delta < 0)
              return setNotice("库存不足，未出库");
            guard.current = true;
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "deviceInventory",
                record: {
                  ...device,
                  movements: [
                    ...(device.movements || []),
                    {
                      id: id("MOVE"),
                      delta,
                      reason,
                      date: new Date().toISOString(),
                      type,
                    },
                  ],
                },
              },
            });
            setNotice("库存流水已登记");
          }}
        >
          确认设备出入库
        </button>
      </div>
      {device && (
        <>
          <label>
            设备状态
            <select
              aria-label="库存设备状态"
              value={device.status || "可用"}
              onChange={(e) =>
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "deviceInventory",
                    record: { ...device, status: e.target.value },
                  },
                })
              }
            >
              <option>可用</option>
              <option>维修</option>
              <option>停用</option>
            </select>
          </label>
          <strong>当前库存：{deviceBalance(device)} 件</strong>
          <table aria-label="设备库存历史">
            <tbody>
              {(device.movements || []).map((r: Row) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.type}</td>
                  <td>{r.delta}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
