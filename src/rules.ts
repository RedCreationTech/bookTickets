/** Synthetic demonstration rules. NOT a validated clinical knowledge base. */
export function analyzeDemoResults(results: Record<string, string>) {
  const alerts: string[] = [];
  const glucose = Number(results["空腹血糖"]);
  const lipids = results["血脂四项"] || "";
  const bp = String(results["一般检查"] || "")
    .split("/")
    .map(Number);
  if (Number.isFinite(glucose) && glucose > 6.1)
    alerts.push("血糖结果需要复核");
  if (/异常|升高|偏高/.test(lipids)) alerts.push("血脂结果需要复核");
  if (bp.length === 2 && bp[0] >= 140) alerts.push("血压结果需要复核");
  const merged =
    alerts.length > 1
      ? `发现 ${alerts.length} 项关联指标：${alerts.join("、")}。已合并为“代谢相关指标联合复核”任务。`
      : alerts.length
        ? alerts[0] + "。建议由医生结合病史复核。"
        : "当前演示规则未抓取明显异常，仍需医生审核原始结果。";
  return {
    alerts,
    merged,
    conclusion: `【合成规则演示】${merged} 此规则未经临床验证，不构成诊断或治疗建议。`,
  };
}
export function agingBucket(days: number) {
  return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : days <= 180 ? 3 : 4;
}
export function numericResultIsValid(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}
