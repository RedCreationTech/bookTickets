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
    if (role === "doctor")
      await expect(
        page.getByRole("region", { name: "共享身份核验资料" }),
      ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/role-${role}-desktop.png`,
      fullPage: true,
    });
    if (role === "finance") {
      await page
        .getByText("订单支付明细与分组结算小计", { exact: true })
        .click();
      await expect(
        page.getByRole("table", { name: "分组结算小计" }),
      ).toBeVisible();
      await page.screenshot({
        path: "test-results/finance-details-desktop.png",
        fullPage: true,
      });
    }
    const overflow = await page.evaluate(
      (width) =>
        document.documentElement.scrollWidth > width + 2 ||
        innerWidth > width + 2,
      page.viewportSize()!.width,
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
        (width) =>
          document.documentElement.scrollWidth > width + 2 ||
          innerWidth > width + 2,
        page.viewportSize()!.width,
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
  await page
    .getByLabel("分检业务日期")
    .fill(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!)
            .appointments[0].date,
      ),
    );
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

test("pause slip resumes its original queue only once after reload", async ({
  page,
}) => {
  await page.goto("/#/queue");
  await expect(
    page.getByRole("heading", { name: "智能导检与队列调度" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page
    .getByRole("button", { name: "暂停并生成凭条", exact: true })
    .first()
    .click();
  await page.getByLabel("中断检查原因").fill("合成临时离开");
  const pauseDialog = page.getByRole("dialog", { name: "暂停检查与凭条" });
  await expect(pauseDialog).toBeInViewport({ ratio: 1 });
  const dialogBox = await pauseDialog.boundingBox();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.getByRole("button", { name: "确认暂停并生成凭条" }).click();
  const token = await page.getByLabel("演示凭条编号").inputValue();
  expect(token).toMatch(/^DEMO-RESUME-/);
  await page.screenshot({
    path: `test-results/queue-pause-slip-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭凭条预览" }).click();
  await page.reload();
  await page.getByLabel("扫描模拟 / 输入凭条编号").fill(token);
  await page.getByRole("button", { name: "核验凭条并恢复原队列" }).click();
  await page.getByLabel("扫描模拟 / 输入凭条编号").fill(token);
  await page.getByRole("button", { name: "核验凭条并恢复原队列" }).click();
  await expect(page.getByRole("alert")).toContainText("不能重复使用");
});

test("five-dimension patient survey validates and persists its result", async ({
  page,
}) => {
  await page.goto("/#/patient");
  await page.getByRole("button", { name: "查看消息", exact: true }).click();
  await page.getByRole("button", { name: "提交满意度问卷" }).click();
  await expect(page.getByRole("status")).toContainText("全部 5 道必答");
  for (const label of [
    "预约流程是否清晰便捷",
    "工作人员服务是否耐心友善",
    "体检环境与导检标识是否清晰",
    "检查说明与报告沟通是否易懂",
    "本次整体服务体验是否满意",
  ]) {
    await page.getByLabel(label, { exact: true }).selectOption("4");
  }
  await page.getByRole("button", { name: "提交满意度问卷" }).click();
  await page.reload();
  await page.getByRole("button", { name: "查看消息", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "满意度问卷已提交结果" }),
  ).toContainText("平均评分：4 / 5");
  await expect(
    page.getByRole("button", { name: "提交满意度问卷" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/satisfaction-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("expanded report workspace creates an actual PDF download without recording a print", async ({
  page,
}) => {
  await page.goto("/#/reports");
  const identity = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!);
    return s.appointments.find((a: any) => a.status === "approved")
      .id as string;
  });
  const before = await page.evaluate(
    (id) =>
      JSON.parse(
        localStorage.getItem("hongchuang.health.demo.v1")!,
      ).appointments.find((a: any) => a.id === id).printCount || 0,
    identity,
  );
  await page.getByLabel("选择报告" + identity, { exact: true }).check();
  await page.getByText("真实PDF生成与报告版式", { exact: true }).click();
  await page.getByLabel("报告用途与版式").selectOption("vip");
  await page
    .getByRole("button", { name: "生成并预览PDF", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "下载 " + identity, exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载 " + identity, exact: true })
    .click();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await download.saveAs(
    `test-results/actual-report-${test.info().project.name}.pdf`,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(
          localStorage.getItem("hongchuang.health.demo.v1")!,
        ).appointments.find((a: any) => a.id === id).printCount || 0,
      identity,
    ),
  ).toBe(before);
  expect(
    await page.evaluate(
      (width) =>
        document.documentElement.scrollWidth <= width + 1 &&
        innerWidth <= width + 1,
      page.viewportSize()!.width,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/real-pdf-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("expanded specimen station generates barcode history for a started order", async ({
  page,
}) => {
  await page.goto("/#/exam");
  await page.getByRole("button", { name: "采样条码", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "采样与条码工作站 · 模拟" });
  await expect(
    modal.getByRole("heading", { name: "标本采样工作站" }),
  ).toBeVisible();
  await modal
    .getByRole("button", { name: "生成并模拟打印条码", exact: true })
    .click();
  await modal
    .getByRole("button", { name: "确认标本采集", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "确认标本采集", exact: true }),
  ).toBeDisabled();
  await expect(modal.getByRole("img", { name: /CODE128条码/ })).toBeVisible();
  const rows = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("hongchuang.health.demo.v1")!).records
        .specimenBarcodes,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].prints).toHaveLength(1);
  expect(rows[0].status).toBe("已采集");
  expect(
    await page.evaluate(
      (width) =>
        document.documentElement.scrollWidth <= width + 1 &&
        innerWidth <= width + 1,
      page.viewportSize()!.width,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/specimen-barcode-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("expanded group report saves a population snapshot and downloads editable Word", async ({
  page,
}) => {
  await page.goto("/#/reports");
  expect(await page.evaluate(() => innerWidth)).toBe(
    page.viewportSize()!.width,
  );
  await page.getByText("团体健康报告与Word导出", { exact: true }).click();
  await page.getByLabel("团检报告单位").selectOption("远帆制造");
  await page
    .getByRole("button", { name: "归档当前人群报告", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "导出可编辑 Word", exact: true }),
  ).toBeEnabled();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出可编辑 Word", exact: true })
    .click();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  await download.saveAs(
    `test-results/actual-group-report-${test.info().project.name}.docx`,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe("PK");
  expect(
    await page.evaluate(
      (width) =>
        document.documentElement.scrollWidth <= width + 1 &&
        innerWidth <= width + 1,
      page.viewportSize()!.width,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/group-report-${test.info().project.name}.png`,
    fullPage: true,
  });
});
