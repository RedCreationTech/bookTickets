import type { DemoState, Patient } from "./model";
export interface OrderRule {
  id: string;
  item: string;
  price: number;
  required?: boolean;
  nonDiscount?: boolean;
  sex?: string;
  marriage?: string;
  requires?: string;
  excludes?: string;
  enabled?: boolean;
  ruleEnabled?: boolean;
}
export const defaultOrderRules: OrderRule[] = [
  {
    id: "OR-basic",
    item: "一般检查",
    price: 99,
    required: true,
    nonDiscount: true,
  },
  { id: "OR-bone", item: "骨密度", price: 80, requires: "一般检查" },
  { id: "OR-ct", item: "腹部CT", price: 350, excludes: "腹部彩超" },
  { id: "OR-breast", item: "乳腺彩超", price: 150, sex: "女" },
  { id: "OR-prostate", item: "前列腺彩超", price: 150, sex: "男" },
  { id: "OR-women", item: "妇科检查", price: 100, sex: "女", marriage: "已婚" },
];
export const getOrderRules = (s: DemoState): OrderRule[] =>
  s.records.orderingRules || defaultOrderRules;
export function getOrderingIssues(
  s: DemoState,
  patientId: string,
  items: string[],
  packageIds: string[] = [],
) {
  const p = s.patients.find((p) => p.id === patientId);
  const errors: string[] = [];
  for (const r of getOrderRules(s))
    if (r.enabled === false && items.includes(r.item))
      errors.push(`${r.item}项目已停用`);
  for (const r of getOrderRules(s).filter(
    (r) => r.enabled !== false && r.ruleEnabled !== false,
  )) {
    if (r.required && !items.includes(r.item))
      errors.push(`必检项目缺失：${r.item}`);
    if (!items.includes(r.item)) continue;
    if (r.sex && r.sex !== "不限" && p?.sex !== r.sex)
      errors.push(`${r.item}限${r.sex}性`);
    if (r.marriage && r.marriage !== "不限" && p?.marriage !== r.marriage)
      errors.push(`${r.item}要求婚姻状态为${r.marriage}`);
    if (r.requires && !items.includes(r.requires))
      errors.push(`${r.item}依赖${r.requires}`);
    if (r.excludes && items.includes(r.excludes))
      errors.push(`${r.item}与${r.excludes}互斥`);
  }
  for (const id of packageIds) {
    const pack = s.packages.find((p) => p.id === id);
    const r =
      (s.records.packageRules || []).find((r) => r.packageId === id) || pack;
    if (!r) continue;
    if (r.sex && r.sex !== "不限" && p?.sex !== r.sex)
      errors.push(`${pack?.name}不适用当前性别`);
    if (
      p &&
      ((r.minAge !== undefined && p.age < Number(r.minAge)) ||
        (r.maxAge !== undefined && p.age > Number(r.maxAge)))
    )
      errors.push(`${pack?.name}不适用当前年龄`);
    if (r.company && r.company !== p?.company)
      errors.push(`${pack?.name}仅限${r.company}`);
  }
  return [...new Set(errors)];
}
export function packageIsApplicable(
  s: DemoState,
  p: Patient,
  packageId: string,
) {
  const pack = s.packages.find((x) => x.id === packageId);
  return !!pack && !getOrderingIssues(s, p.id, pack.items, [packageId]).length;
}
export function quoteOrder(
  s: DemoState,
  ids: string[],
  discount: number,
  lineDiscounts: Record<string, number> = {},
  extras: string[] = [],
) {
  const prices: Record<string, number> = {};
  for (const id of ids) {
    const p = s.packages.find((x) => x.id === id);
    if (!p) continue;
    p.items.forEach((name, i) => {
      const price =
        (Math.floor((p.price * 100) / p.items.length) +
          (i < Math.round(p.price * 100) % p.items.length ? 1 : 0)) /
        100;
      prices[name] = Math.max(prices[name] || 0, price);
    });
  }
  for (const item of extras)
    if (!(item in prices))
      prices[item] = getOrderRules(s).find((r) => r.item === item)?.price ?? 80;
  const rows = Object.entries(prices).map(([item, price]) => {
    const nonDiscount = !!getOrderRules(s).find(
      (r) => r.enabled !== false && r.ruleEnabled !== false && r.item === item,
    )?.nonDiscount;
    const percent = nonDiscount
      ? 100
      : Math.min(100, Math.max(0, lineDiscounts[item] ?? discount));
    return {
      item,
      price,
      percent,
      nonDiscount,
      amount: Math.round(price * percent) / 100,
    };
  });
  return {
    rows,
    items: Object.keys(prices),
    original: Math.round(rows.reduce((n, r) => n + r.price, 0) * 100) / 100,
    amount: Math.round(rows.reduce((n, r) => n + r.amount, 0) * 100) / 100,
  };
}
export function percentFromAmount(
  s: DemoState,
  ids: string[],
  target: number,
  extras: string[] = [],
) {
  const q = quoteOrder(s, ids, 100, {}, extras);
  const fixed = q.rows
    .filter((r) => r.nonDiscount)
    .reduce((n, r) => n + r.price, 0);
  const base = q.original - fixed;
  return base
    ? Math.max(
        0,
        Math.min(100, Math.round(((target - fixed) / base) * 10000) / 100),
      )
    : 100;
}

export function resolveDependencies(s: DemoState, items: string[]) {
  const resolved = new Set(items);
  const rules = getOrderRules(s).filter(
    (r) => r.enabled !== false && r.ruleEnabled !== false,
  );
  const errors: string[] = [];
  for (const r of rules) if (r.required) resolved.add(r.item);
  const visit = (item: string, path: string[]) => {
    if (path.includes(item)) {
      errors.push("依赖循环：" + [...path, item].join(" → "));
      return;
    }
    const rule = rules.find((r) => r.item === item);
    if (rule?.requires) {
      resolved.add(rule.requires);
      visit(rule.requires, [...path, item]);
    }
  };
  for (const item of [...resolved]) visit(item, []);
  return {
    items: [...resolved],
    errors: [...new Set(errors)],
    added: [...resolved].filter((i) => !items.includes(i)),
  };
}
