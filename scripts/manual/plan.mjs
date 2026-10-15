// 截图点位计划：章节 → 页面 → 子页签，编号与图片文件名在此唯一确定，shoot / sync 共用。
const NAV = { "/patient": ["首页", "预约", "导检", "报告", "我的"] };

export function buildPlan(outlineSections, tabs) {
  const plan = [];
  for (const s of outlineSections) {
    const list = tabs[s.route]?.tabs?.length ? tabs[s.route].tabs : [];
    const nav = NAV[s.route] || [];
    const sets = list.length ? list : nav.length ? nav : [""];
    sets.forEach((label, i) => {
      plan.push({
        num: `${s.num}${sets.length > 1 ? `.${i + 1}` : ""}`,
        image: sets.length > 1 ? `${s.image}-${i + 1}` : s.image,
        route: s.route,
        label,
        sectionTitle: s.title,
      });
    });
  }
  return plan;
}
