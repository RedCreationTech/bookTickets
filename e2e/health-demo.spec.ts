import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "每一份健康，都值得悉心守护" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = "qinghe.health.demo.v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.config.weekendAllowed = true;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
});
test("dashboard renders and booking survives reload", async ({ page }) => {
  await page.goto("/#/appointments");
  await page.getByRole("button", { name: "新建预约", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认预约", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("共 9 条", { exact: false })).toBeVisible();
  await page.screenshot({
    path: `test-results/appointments-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("doctor role rejects direct finance navigation", async ({ page }) => {
  await page.getByLabel("切换演示角色").selectOption("doctor");
  await expect(
    page.getByRole("heading", { name: "分检工作站", exact: true }),
  ).toBeVisible();
  await page.goto("/#/finance");
  await expect(page.getByText("当前角色无此页面权限")).toBeVisible();
});
test("patient booking, simulated payment and confirmation persist", async ({
  page,
}) => {
  await page.goto("/#/patient");
  await page.getByRole("button", { name: "开启健康计划", exact: true }).click();
  await page.getByRole("checkbox", { name: /已阅读预约须知/ }).check();
  await page.getByRole("button", { name: "确认预约", exact: true }).click();
  await page
    .getByRole("button", { name: "模拟支付", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "确认模拟付款", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "查看预约", exact: true }).click();
  await expect(page.getByText("待到检", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: `test-results/patient-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("clinical numeric input validation is visible", async ({ page }) => {
  await page.goto("/#/exam");
  await page.getByRole("button", { name: "填入正常示例" }).click();
  await page.getByLabel("空腹血糖结果").fill("文字");
  await page.getByRole("button", { name: "提交分检结果" }).click();
  await expect(page.getByRole("alert")).toContainText("必须为数值型");
});
test("kiosk identification can fail then recover without false checkin", async ({
  page,
}) => {
  await page.goto("/#/kiosk");
  await page.getByRole("button", { name: "演示控制", exact: true }).click();
  await page.getByRole("button", { name: "设备离线", exact: true }).click();
  await page.getByRole("button", { name: "关闭演示控制" }).click();
  await page.getByRole("button", { name: /自助签到/ }).click();
  await page.getByRole("button", { name: "模拟识别并继续" }).click();
  await expect(page.getByRole("status")).toContainText("设备离线");
  await page.getByRole("button", { name: "演示控制", exact: true }).click();
  await page.getByRole("button", { name: "恢复设备并重试" }).click();
  await page.getByRole("button", { name: "关闭演示控制" }).click();
  await page.getByRole("button", { name: "模拟识别并继续" }).click();
  await expect(page.getByText("身份已核验（模拟）")).toBeVisible();
  await page.screenshot({
    path: `test-results/kiosk-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("coverage search exposes explicit hardware boundaries", async ({
  page,
}) => {
  await page.goto("/#/coverage");
  await page.getByLabel("搜索需求").fill("T0945");
  await expect(page.getByText("T0945", { exact: true })).toBeVisible();
  await expect(
    page.getByText("硬件不可验证", { exact: true }).last(),
  ).toBeVisible();
});
