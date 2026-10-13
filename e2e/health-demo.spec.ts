import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "每一份健康，都值得悉心守护" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = "hongchuang.health.demo.v1";
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

test("all role workbenches produce real browser visual evidence", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Role workbench evidence uses desktop viewport",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const roles = [
    "admin",
    "reception",
    "doctor",
    "reviewer",
    "manager",
    "finance",
    "enterprise",
    "service",
  ];
  for (const role of roles) {
    await page.getByLabel("切换演示角色").selectOption(role);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/role-${role}-desktop.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow, `page horizontal overflow for ${role}`).toBe(false);
  }
});

test("patient, kiosk, report kiosk and queue visual evidence", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  for (const [name, path] of [
    ["patient-home", "/patient"],
    ["kiosk-home", "/kiosk"],
    ["report-machine", "/kiosk?mode=report"],
    ["waiting-screen", "/queue?screen=1"],
  ]) {
    if (!mobile)
      await page.setViewportSize({
        width: name === "waiting-screen" ? 1920 : 1440,
        height: 1000,
      });
    await page.goto("/#" + path);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/${name}-${testInfo.project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      ),
      name + " horizontal overflow",
    ).toBe(false);
  }
});

test("complete cross-surface lifecycle persists from booking to follow-up", async ({
  page,
}) => {
  await page.evaluate(() => {
    const k = "hongchuang.health.demo.v1";
    const s = JSON.parse(localStorage.getItem(k)!);
    s.appointments = [];
    s.tasks = [];
    s.records.queueTickets = [];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.goto("/#/patient");
  await page.reload();
  await page.getByRole("button", { name: "开启健康计划", exact: true }).click();
  await page.getByRole("checkbox", { name: /已阅读预约须知/ }).check();
  await page.getByRole("button", { name: "确认预约", exact: true }).click();
  await page.getByRole("button", { name: "模拟支付", exact: true }).click();
  await page.getByRole("button", { name: "关闭支付" }).click();
  await page.getByRole("button", { name: "模拟支付", exact: true }).click();
  await page.getByRole("button", { name: "确认模拟付款" }).click();
  await page.goto("/#/kiosk");
  await page.getByRole("button", { name: /自助签到/ }).click();
  await page.getByRole("button", { name: "模拟识别并继续" }).click();
  await page.getByRole("button", { name: "确认签到", exact: true }).click();
  await page.goto("/#/exam");
  await page.getByRole("button", { name: "填入正常示例" }).click();
  await page
    .getByLabel("分检小结 / 医学建议（演示）")
    .fill("合成演示结果，待总检复核。");
  await page.getByRole("button", { name: "提交分检结果" }).click();
  await page.goto("/#/review");
  await page.getByRole("button", { name: "通过初审" }).click();
  await page.getByRole("button", { name: "通过主检" }).click();
  await page.getByRole("button", { name: "创建随访任务" }).click();
  await page.getByRole("button", { name: "通过总检" }).click();
  await page.goto("/#/kiosk?mode=report");
  await page.getByRole("button", { name: /打印体检报告/ }).click();
  await page.getByRole("button", { name: "模拟识别并继续" }).click();
  await page.getByRole("button", { name: "开始模拟打印与装订" }).click();
  await expect(page.getByText("您的报告已完成模拟打印")).toBeVisible();
  await page.screenshot({
    path: `test-results/report-completed-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "完成并退出" }).click();
  await page.goto("/#/health");
  await page.getByRole("button", { name: "干预随访", exact: true }).click();
  await page.getByRole("button", { name: "开始跟进", exact: true }).click();
  await page.getByRole("button", { name: "完成随访", exact: true }).click();
  await page.getByLabel("本次随访结果").fill("合成回访已完成。");
  await page.getByRole("button", { name: "记录并完成随访" }).click();
  await page.reload();
  const final = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!),
  );
  expect(final.appointments).toHaveLength(1);
  expect(final.appointments[0].status).toBe("printed");
  expect(final.appointments[0].printCount).toBe(1);
  expect(final.tasks[0].status).toBe("已完成");
});
