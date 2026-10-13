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
  bodyPart?: string;
  diseaseType?: string;
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
  context: { company?: string } = {},
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
    if (r.company && r.company !== (context.company ?? p?.company))
      errors.push(`${pack?.name}仅限${r.company}`);
  }
  return [...new Set(errors)];
}
export function packageIsApplicable(
  s: DemoState,
  p: Patient,
  packageId: string,
  context: { company?: string } = {},
) {
  const pack = s.packages.find((x) => x.id === packageId);
  return (
    !!pack &&
    !getOrderingIssues(s, p.id, pack.items, [packageId], context).length
  );
}
export function quoteOrder(
  s: DemoState,
  ids: string[],
  discount: number,
  lineDiscounts: Record<string, number> = {},
  extras: string[] = [],
  excludedItems: string[] = [],
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
  const rows = Object.entries(prices)
    .filter(([item]) => !excludedItems.includes(item))
    .map(([item, price]) => {
      const nonDiscount = !!getOrderRules(s).find(
        (r) =>
          r.enabled !== false && r.ruleEnabled !== false && r.item === item,
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
    items: rows.map((row) => row.item),
    original: Math.round(rows.reduce((n, r) => n + r.price, 0) * 100) / 100,
    amount: Math.round(rows.reduce((n, r) => n + r.amount, 0) * 100) / 100,
  };
}
export function percentFromAmount(
  s: DemoState,
  ids: string[],
  target: number,
  extras: string[] = [],
  excludedItems: string[] = [],
) {
  const q = quoteOrder(s, ids, 100, {}, extras, excludedItems);
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

/** Campus restrictions are business configuration, not medical eligibility. */
export function packageAvailableAtCampus(
  s: DemoState,
  packageId: string,
  campus: string,
) {
  const pack = s.packages.find((row) => row.id === packageId);
  const rule = (s.records.packageRules || []).find(
    (row) => row.packageId === packageId,
  );
  const campuses = rule?.campuses ?? pack?.campuses;
  return (
    !!pack &&
    (!Array.isArray(campuses) || !campuses.length || campuses.includes(campus))
  );
}

export function getPackageOptionalBundles(s: DemoState, packageIds: string[]) {
  return [...new Set(packageIds)].flatMap((packageId) => {
    const pack = s.packages.find((row) => row.id === packageId);
    const rule = (s.records.packageRules || []).find(
      (row) => row.packageId === packageId,
    );
    if (!pack || !Array.isArray(rule?.optionalItems)) return [];
    const items = [
      ...new Set<string>(
        rule.optionalItems
          .map((item: unknown) => String(item).trim())
          .filter(Boolean),
      ),
    ];
    const choose = Number(rule.choose ?? 0);
    return [
      {
        packageId,
        name: pack.name,
        items,
        choose: Number.isInteger(choose) && choose >= 0 ? choose : 0,
      },
    ];
  });
}

/** Deterministic synthetic rule: required items win, otherwise first selection wins. */
export function normalizeOrderItems(s: DemoState, source: string[]) {
  const rules = getOrderRules(s).filter(
    (row) => row.enabled !== false && row.ruleEnabled !== false,
  );
  const ruleFor = (item: string) => rules.find((row) => row.item === item);
  const unique: string[] = [];
  const removed: { item: string; reason: string; keptItem?: string }[] = [];
  const errors: string[] = [];
  for (const item of source) {
    if (unique.includes(item))
      removed.push({ item, reason: "重复项目，仅保留一份" });
    else unique.push(item);
  }
  const prioritized = [...unique].sort(
    (a, b) => Number(!!ruleFor(b)?.required) - Number(!!ruleFor(a)?.required),
  );
  const kept: string[] = [];
  for (const item of prioritized) {
    const conflict = kept.find(
      (other) =>
        ruleFor(item)?.excludes === other || ruleFor(other)?.excludes === item,
    );
    if (!conflict) {
      kept.push(item);
      continue;
    }
    if (ruleFor(item)?.required && ruleFor(conflict)?.required) {
      errors.push(`两个必检项目互斥，需人工调整：${conflict} / ${item}`);
      kept.push(item);
    } else
      removed.push({
        item,
        keptItem: conflict,
        reason: `与${conflict}互斥，${ruleFor(conflict)?.required ? "必检项目优先" : "先选项目优先"}`,
      });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of [...kept]) {
      const dependency = ruleFor(item)?.requires;
      if (
        dependency &&
        unique.includes(dependency) &&
        !kept.includes(dependency)
      ) {
        if (ruleFor(item)?.required)
          errors.push(`必检项目${item}的依赖${dependency}被过滤，需人工调整`);
        else {
          kept.splice(kept.indexOf(item), 1);
          removed.push({ item, reason: `依赖项目${dependency}已被过滤` });
          changed = true;
        }
      }
    }
  }
  return {
    items: unique.filter((item) => kept.includes(item)),
    removed,
    errors: [...new Set(errors)],
  };
}

export function getItemClassification(s: DemoState, item: string) {
  const preset: Record<string, [string, string]> = {
    甲状腺彩超: ["颈部", "内分泌"],
    糖化血红蛋白: ["血液", "代谢"],
    骨密度检查: ["骨骼", "骨健康"],
    骨密度: ["骨骼", "骨健康"],
    腹部CT: ["腹部", "消化系统"],
    腹部彩超: ["腹部", "消化系统"],
    乳腺彩超: ["胸部", "乳腺健康"],
    前列腺彩超: ["盆腔", "泌尿系统"],
    妇科检查: ["盆腔", "妇科健康"],
  };
  const rule = getOrderRules(s).find((row) => row.item === item);
  return {
    bodyPart: rule?.bodyPart || preset[item]?.[0] || "其他部位",
    diseaseType: rule?.diseaseType || preset[item]?.[1] || "其他类型",
  };
}
