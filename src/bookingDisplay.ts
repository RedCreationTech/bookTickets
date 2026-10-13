import type { DemoState, Package } from "./model";
export type PackageType = "固定套餐" | "筛查套餐";
export function getPackageType(pack: Package): PackageType {
  return pack.packageType === "筛查套餐" ? "筛查套餐" : "固定套餐";
}
export function bookingPriceMode(state: DemoState) {
  if (
    state.config.showPrices === false ||
    ["不显示", "不显示价格"].includes(state.config.priceMode)
  )
    return "不显示";
  return state.config.priceMode === "原价" ? "原价" : "执行价";
}
const validAmount = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : fallback;
export function displayedPackagePrice(
  state: DemoState,
  pack: Package,
  discount = 100,
) {
  return bookingPriceMode(state) === "原价"
    ? validAmount(pack.originalPrice ?? pack.price, pack.price)
    : Math.round(pack.price * discount) / 100;
}
export function displayedItemPrice(
  state: DemoState,
  item: string,
  executionPrice: number,
  discount = 100,
) {
  const rule = (state.records.orderingRules || []).find(
    (row) => row.item === item,
  );
  return bookingPriceMode(state) === "原价"
    ? validAmount(rule?.originalPrice ?? executionPrice, executionPrice)
    : Math.round(executionPrice * discount) / 100;
}
export function originalPricingState(state: DemoState): DemoState {
  return {
    ...state,
    packages: state.packages.map((p) => ({
      ...p,
      price: validAmount(p.originalPrice ?? p.price, p.price),
    })),
    records: {
      ...state.records,
      orderingRules: (state.records.orderingRules || []).map((r) => ({
        ...r,
        price: validAmount(r.originalPrice ?? r.price, Number(r.price) || 0),
      })),
    },
  };
}
