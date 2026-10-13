import { useState } from "react";
import { useDemo } from "../store";
import type { DemoState } from "../model";
export const knownUiElements = [
  { key: "health.profile.edit", label: "客户档案编辑按钮", kind: "button" },
  { key: "health.profile.phone", label: "客户联系标识字段", kind: "field" },
  { key: "commerce.order.create", label: "商城创建交易按钮", kind: "button" },
  { key: "services.batch.update", label: "服务批量维护按钮", kind: "button" },
  { key: "operations.export", label: "业务列表导出按钮", kind: "button" },
];
export function uiElementAllowed(state: DemoState, key: string) {
  const resource = (state.records.uiResources || []).find(
    (r) => r.resourceKey === key,
  );
  if (resource?.visible === false || resource?.status === "已停用")
    return false;
  const role = (state.records.roles || []).find(
    (r) => r.id === state.config.customRoleId,
  );
  return role?.elementPermissions?.[key] !== "deny";
}
export function resolveMenuPresentation(
  state: DemoState,
  path: string,
  fallback: string,
) {
  const resource = (state.records.uiResources || []).find(
    (r) => r.resourceKey === `menu:${path}`,
  );
  return {
    label: String(resource?.label || fallback),
    order: Number.isFinite(Number(resource?.sort))
      ? Number(resource.sort)
      : 1000,
    visible: resource?.visible !== false && resource?.status !== "已停用",
  };
}
const menuPaths = [
  "/dashboard",
  "/appointments",
  "/queue",
  "/exam",
  "/review",
  "/reports",
  "/health",
  "/enterprise",
  "/services",
  "/commerce",
  "/content",
  "/finance",
  "/analytics",
  "/support",
  "/quality",
  "/settings",
  "/controls",
];
export function UiResourceSettings() {
  const { state, act } = useDemo();
  const [key, setKey] = useState("health.profile.edit");
  const [label, setLabel] = useState("客户档案编辑按钮");
  const [sort, setSort] = useState(10);
  const [visible, setVisible] = useState(true);
  const [roleId, setRoleId] = useState("");
  const [allow, setAllow] = useState("allow");
  const [notice, setNotice] = useState("");
  const choose = (value: string) => {
    setKey(value);
    const r = (state.records.uiResources || []).find(
      (r) => r.resourceKey === value,
    );
    setLabel(
      r?.label ||
        knownUiElements.find((e) => e.key === value)?.label ||
        value.slice(5),
    );
    setSort(r?.sort ?? 10);
    setVisible(r?.visible !== false);
    const role = (state.records.roles || []).find((r) => r.id === roleId);
    setAllow(role?.elementPermissions?.[value] || "allow");
  };
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>实际菜单与页面资源</h2>
      <p>
        只配置已知页面和资源；前端显隐与动作守卫，不构成服务端安全。退出自定义角色入口不受此配置影响。
      </p>
      <div className="actions">
        <label>
          资源
          <select
            aria-label="实际UI资源"
            value={key}
            onChange={(e) => choose(e.target.value)}
          >
            {knownUiElements.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
            {menuPaths.map((p) => (
              <option key={p} value={`menu:${p}`}>
                菜单 {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          名称
          <input
            aria-label="资源显示名称"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          顺序
          <input
            aria-label="资源顺序"
            type="number"
            value={sort}
            onChange={(e) => setSort(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            aria-label="资源可见"
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          可见
        </label>
        <button
          className="btn"
          onClick={() => {
            if (!label.trim() || !Number.isFinite(sort))
              return setNotice("名称及有限顺序为必填");
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "uiResources",
                record: {
                  id: `UI-${key}`,
                  resourceKey: key,
                  label: label.trim(),
                  sort,
                  visible,
                  status: "已启用",
                },
              },
            });
            setNotice("已保存，已知页面立即消费。");
          }}
        >
          保存实际资源
        </button>
      </div>
      <div className="actions">
        <label>
          角色
          <select
            aria-label="元素权限角色"
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setAllow(
                (state.records.roles || []).find((r) => r.id === e.target.value)
                  ?.elementPermissions?.[key] || "allow",
              );
            }}
          >
            <option value="">请选择角色</option>
            {(state.records.roles || []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="元素权限值"
          value={allow}
          onChange={(e) => setAllow(e.target.value)}
        >
          <option value="allow">允许</option>
          <option value="deny">拒绝</option>
        </select>
        <button
          className="btn"
          onClick={() => {
            const role = (state.records.roles || []).find(
              (r) => r.id === roleId,
            );
            if (!role) return setNotice("请选择已有角色");
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "roles",
                record: {
                  ...role,
                  elementPermissions: {
                    ...role.elementPermissions,
                    [key]: allow,
                  },
                },
              },
            });
            setNotice("角色资源权限已保存，激活该角色后消费。");
          }}
        >
          保存元素权限
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
