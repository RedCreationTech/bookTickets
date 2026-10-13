import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, "..", "..");
const STORE_KEY = "hongchuang.health.demo.v1";
const script: {
  scenes: { id: string; title: string; narration: string[] }[];
} = JSON.parse(readFileSync(join(here, "ep01-script.json"), "utf8"));
const ORDER = script.scenes.map((s) => s.id);

const FAST = process.env.TOUR_FAST === "1";
const STOP_AT = process.env.TOUR_STOP_AT || "";
const CDP = process.env.TOUR_CDP === "1";
const CAPTURE_W = Number(process.env.TOUR_W || 1920);
const CAPTURE_H = Number(process.env.TOUR_H || 1080);
const unit = Number(process.env.TOUR_UNIT_MS || (FAST ? 70 : 520));
const leadMs = FAST ? 250 : Number(process.env.TOUR_LEAD_MS || 1600);
// 每幕画面时长对齐 artifacts/video/tts/schedule.json 里的真实配音长度
// （由 scripts/video/make-voiceover.mjs 预先生成）。
const VO_PATH = join(rootDir, "artifacts", "video", "tts", "schedule.json");
const VO: { scenes: { id: string; targetMs: number }[] } | null = existsSync(
  VO_PATH,
)
  ? JSON.parse(readFileSync(VO_PATH, "utf8"))
  : null;
const maxPadMs = Number(process.env.TOUR_MAX_PAD_MS || 60000);

const marks: { id: string; start: number; end: number }[] = [];
let t0 = 0;

function readState(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) || "{}"),
    STORE_KEY,
  );
}

// 光标层：CDP 抓帧不含系统光标，这里用页面真实鼠标事件画一个高亮光标。
// 字幕与章节角标不再画进界面，改由 build-ep01.mjs 合成到底部字幕带，避免遮挡内容。
async function installOverlay(page: Page) {
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "tour-overlay";
    host.setAttribute("aria-hidden", "true");
    host.innerHTML =
      '<div class="t-cursor"><svg viewBox="0 0 24 24" width="30" height="30"><path ' +
      'd="M4 2 L4 19 L8.6 14.8 L11.4 20.6 L14.4 19.2 L11.6 13.6 L18.2 13.2 Z" ' +
      'fill="#ffffff" stroke="#12352d" stroke-width="1.6"/></svg>' +
      '<span class="t-ring"></span></div>';
    document.body.appendChild(host);
    const style = document.createElement("style");
    style.textContent = [
      "#tour-overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483000}",
      "#tour-overlay .t-cursor{position:absolute;left:0;top:0;transform:translate(-120px,-120px);",
      "transition:transform .16s ease-out}",
      "#tour-overlay .t-cursor svg{display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}",
      "#tour-overlay .t-ring{position:absolute;left:1px;top:1px;width:14px;height:14px;border-radius:50%;",
      "border:3px solid rgba(255,205,110,.95);opacity:0}",
      "#tour-overlay .t-ring.on{animation:t-pulse .55s ease-out}",
      "@keyframes t-pulse{from{opacity:.95;transform:scale(.35)}to{opacity:0;transform:scale(3.4)}}",
    ].join("");
    document.head.appendChild(style);
    const cursor = host.querySelector(".t-cursor") as HTMLElement;
    const ring = host.querySelector(".t-ring") as HTMLElement;
    const move = (e: MouseEvent) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener(
      "mousedown",
      (e) => {
        move(e);
        ring.classList.remove("on");
        void ring.offsetWidth;
        ring.classList.add("on");
      },
      true,
    );
  });
}

// 1080p 采集：Playwright 自带录屏会被压到 800x500，这里改用 CDP 抓帧，
// 交给 scripts/video/build-ep01.mjs 按真实帧间隔合成。
const captureDir = join(rootDir, "artifacts", "video", "cdp");

async function startCdpCapture(page: Page) {
  const frames: { file: string; at: number }[] = [];
  rmSync(captureDir, { recursive: true, force: true });
  mkdirSync(captureDir, { recursive: true });
  const session = await page.context().newCDPSession(page);
  session.on("Page.screencastFrame", (frame: any) => {
    const file = `${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(
      join(captureDir, file),
      Buffer.from(frame.data, "base64"),
    );
    frames.push({ file, at: frame.metadata.timestamp * 1000 });
    session
      .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
      .catch(() => {});
  });
  await session.send("Page.enable");
  await session.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: CAPTURE_W,
    maxHeight: CAPTURE_H,
    everyNthFrame: 1,
  });
  return async (t0EpochMs: number) => {
    await session.send("Page.stopScreencast").catch(() => {});
    const list = ["ffconcat version 1.0"];
    frames.forEach((f, i) => {
      const dur =
        i + 1 < frames.length
          ? Math.max(0.04, (frames[i + 1].at - f.at) / 1000)
          : 0.2;
      list.push(`file '${f.file}'`, `duration ${dur.toFixed(3)}`);
    });
    if (frames.length) list.push(`file '${frames[frames.length - 1].file}'`);
    writeFileSync(join(captureDir, "list.txt"), `${list.join("\n")}\n`);
    const span = frames.length
      ? (frames[frames.length - 1].at - frames[0].at) / 1000
      : 0;
    writeFileSync(
      join(captureDir, "meta.json"),
      JSON.stringify(
        {
          width: CAPTURE_W,
          height: CAPTURE_H,
          frames: frames.length,
          startEpochMs: frames[0]?.at || 0,
          t0EpochMs,
          spanSec: Number(span.toFixed(2)),
          avgFps: span ? Number((frames.length / span).toFixed(2)) : 0,
        },
        null,
        2,
      ),
    );
    return frames.length;
  };
}

async function selectByText(sel: Locator, re: RegExp) {  const value = await sel
    .first()
    .evaluate((el: HTMLSelectElement, src: string) => {
      const rx = new RegExp(src);
      const opt = Array.from(el.options).find((o) =>
        rx.test(o.textContent || o.value),
      );
      if (!opt) throw new Error(`下拉框中没有匹配 ${src} 的选项`);
      return opt.value;
    }, re.source);
  await sel.first().selectOption({ value });
}

test("ep01 总览片自动录屏", async ({ page }) => {
  const nap = (mult = 1) => page.waitForTimeout(Math.round(unit * mult));
  // 断言只看应用本体：弹窗是 portal 到 body 的，因此按「body 下除字幕层之外」收窄。
  const appText = (re: RegExp) =>
    page.locator("body > :not(#tour-overlay)").getByText(re);
  const go = async (path: string) => {
    const target = `#${path.startsWith("/") ? path : `/${path}`}`;
    await page.evaluate((h) => {
      window.location.hash = h;
    }, target);
    await nap(2.4);
  };
  const focusHeading = async (name: string | RegExp, mult = 2.4) => {
    await page
      .getByRole("heading", { name })
      .first()
      .scrollIntoViewIfNeeded();
    await nap(mult);
  };
  const scene = async (id: string, body: () => Promise<void>) => {
    const index = ORDER.indexOf(id);
    if (index < 0) throw new Error(`未登记的分镜：${id}`);
    if (STOP_AT && ORDER.indexOf(STOP_AT) < index) return;
    const start = Date.now() - t0;
    await body();
    await nap(1.2);
    if (process.env.TOUR_SHOTS) {
      const shots = join(rootDir, "artifacts", "video", "frames");
      mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: join(shots, `${String(index + 1).padStart(2, "0")}-${id}.png`),
      });
    }
    // 补足到本幕配音长度；只静置，不做任何滚动，避免画面上下抖动。
    const target = FAST ? 0 : (VO?.scenes.find((s) => s.id === id)?.targetMs || 0);
    const pad = Math.max(
      0,
      Math.min(maxPadMs, target - (Date.now() - t0 - start)),
    );
    if (pad > 200) await page.waitForTimeout(pad);
    marks.push({ id, start, end: Date.now() - t0 });
  };

  const stopCapture = CDP ? await startCdpCapture(page) : null;
  await page.goto("/#/dashboard", { waitUntil: "domcontentloaded" });  await expect(
    page.getByRole("link", { name: "运营概览" }),
  ).toBeVisible();
  await installOverlay(page);
  await page.waitForTimeout(leadMs);
  t0 = Date.now();

  try {
    await scene("open", async () => {
      await focusHeading("每一份健康，都值得悉心守护", 3);
      await focusHeading("我的待办");
      await focusHeading("今日体检进度");
      await focusHeading("常用工作台", 2);
      await focusHeading("今日预约", 2.2);
      await focusHeading("每一份健康，都值得悉心守护", 1.6);
    });

    await scene("nav", async () => {
      const role = page.getByLabel("切换演示角色");
      for (const name of [
        "前台登记员",
        "分检医生",
        "总检医生",
        "健康管理师",
        "企业 HR",
        "平台管理员",
      ]) {
        await role.selectOption({ label: name });
        await nap(name === "平台管理员" ? 1.6 : 2.2);
      }
      await page.getByLabel("切换演示角色").selectOption({ label: "平台管理员" });
      await go("/dashboard");
    });

    await scene("booking", async () => {
      await page.getByRole("link", { name: "患者小程序 H5" }).click();
      await nap(2);
      await page.getByRole("button", { name: /开启健康计划/ }).click();
      await nap(1.8);

      const toQuestionnaire = page
        .getByRole("button", { name: /填写检前问卷/ })
        .first();
      if (await toQuestionnaire.count()) {
        await toQuestionnaire.click();
        await nap(1.8);
        for (const kw of ["熬夜", "血糖"]) {
          const box = page
            .locator("label")
            .filter({ hasText: kw })
            .locator('input[type="checkbox"]')
            .first();
          if (await box.count()) await box.check();
          await nap(0.8);
        }
        await page
          .getByRole("button", { name: /完成问卷并生成参考方案/ })
          .click();
        await nap(2.4);
        await page
          .getByRole("button", { name: /使用方案继续预约/ })
          .click();
        await nap(2);
      }

      await selectByText(page.getByLabel(/体检人/), /许悦宁/);
      await nap(1.2);
      await page.getByRole("button", { name: /都市精英体检/ }).first().click();
      await nap(1.6);
      const extra = page
        .locator("label")
        .filter({ hasText: /甲状腺彩超/ })
        .locator('input[type="checkbox"]')
        .first();
      if (await extra.count()) await extra.check();
      await nap(1);

      const days = page
        .locator("button")
        .filter({ hasText: /^\d{2}-\d{2}$/ });
      await days.nth(2).click();
      await nap(1.2);
      await page.getByLabel(/到院时段/).selectOption({ index: 1 });
      await nap(1);

      const notice = page
        .getByRole("checkbox", { name: /已阅读预约须知/ })
        .first();
      await expect(notice).toBeVisible();
      await notice.check();
      await nap(1.2);
      await page.getByRole("button", { name: /确认预约/ }).click();
      await expect(appText(/预约成功/)).toBeVisible({ timeout: 15000 });
      await nap(2.4);
    });

    await scene("sync", async () => {
      const before = await readState(page);
      const paidBefore = before.appointments.filter(
        (a: { status: string }) => a.status === "paid",
      ).length;
      await go("/appointments");
      await page
        .getByPlaceholder(/搜索姓名、体检号、单位/)
        .scrollIntoViewIfNeeded();
      await nap(2);
      await page.getByPlaceholder(/搜索姓名、体检号、单位/).fill("许悦宁");
      await nap(2.2);
      await page.getByRole("button", { name: "模拟收款" }).first().click();
      await nap(2.4);
      const after = await readState(page);
      expect(
        after.appointments.filter(
          (a: { status: string }) => a.status === "paid",
        ).length,
      ).toBeGreaterThan(paidBefore);
    });

    await scene("kiosk-checkin", async () => {
      await go("/kiosk");
      await nap(2.6);
      await page.getByRole("button", { name: /自助签到/ }).first().click();
      await nap(1.8);
      await selectByText(page.getByLabel("合成身份"), /苏清禾/);
      await nap(1.2);
      await page.getByRole("button", { name: /模拟识别并继续/ }).click();
      await nap(2);
      await page.locator(".ks-orders button").first().click();
      await nap(1.6);
      await page.getByRole("button", { name: /确认签到/ }).click();
      await expect(
        appText(/到检签到成功，已同步医护工作台/),
      ).toBeVisible({ timeout: 15000 });
      await nap(2.6);
      await page.getByRole("button", { name: /模拟打印导检单/ }).click();
      await expect(
        appText(/已完成模拟打印/),
      ).toBeVisible({ timeout: 30000 });
      await nap(3);
      await page.getByRole("button", { name: /完成并退出/ }).click();
      await nap(1.6);
      const state = await readState(page);
      expect(
        state.appointments.some(
          (a: { patientId: string; status: string }) =>
            a.patientId === "P002" && a.status === "checked",
        ),
      ).toBeTruthy();
    });

    await scene("exam", async () => {
      await go("/exam");
      await page
        .locator("button")
        .filter({ hasText: /苏清禾/ })
        .first()
        .click();
      await nap(2);
      await page.getByRole("button", { name: /填入正常示例/ }).click();
      await nap(1.8);
      await page.getByPlaceholder("输入数值").first().fill("8.2");
      await nap(1.6);
      const recheck = page
        .getByRole("checkbox", { name: /已复核异常结果/ })
        .first();
      await expect(recheck).toBeVisible({ timeout: 10000 });
      await recheck.check();
      await nap(0.8);
      await page
        .getByPlaceholder(/填写所见、小结与建议/)
        .fill("演示样例：空腹血糖高于演示阈值，建议复查并转入随访跟踪。");
      await nap(1.2);
      await page.getByRole("button", { name: /提交分检结果/ }).click();
      await expect(appText(/重大异常已上报/)).toBeVisible({
        timeout: 15000,
      });
      await nap(2.4);
    });

    await scene("alert", async () => {
      const modal = appText(/重大异常全局提醒/);
      await expect(modal).toBeVisible({ timeout: 15000 });
      await nap(2);
      await page
        .getByLabel(/处理结果/)
        .fill("已电话联系演示健康管理师，约定复查时间并纳入随访跟踪。");
      await nap(1.2);
      await page.getByRole("button", { name: /保存处置/ }).click();
      await nap(2.4);
      const ack = page.getByRole("button", { name: /我已知晓/ });
      if (await ack.count()) {
        await ack.click();
        await nap(1.4);
      }
      const state = await readState(page);
      expect(
        (state.records.alerts || []).some(
          (a: { status: string }) => a.status === "已处理",
        ),
      ).toBeTruthy();
    });

    await scene("review", async () => {
      await go("/review");
      await page
        .locator("button")
        .filter({ hasText: /陈映山/ })
        .first()
        .click();
      await nap(2);
      await page
        .getByRole("button", { name: /生成关联异常综合建议/ })
        .click();
      await nap(2.4);
      for (const stage of ["初审", "主检", "总检"]) {
        const btn = page.getByRole("button", {
          name: new RegExp(`^通过${stage}`),
        });
        await expect(btn).toBeVisible({ timeout: 15000 });
        await btn.click();
        await nap(2.4);
      }
      const state = await readState(page);
      expect(
        state.appointments.some(
          (a: { patientId: string; status: string }) =>
            a.patientId === "P003" && a.status === "approved",
        ),
      ).toBeTruthy();
    });

    await scene("report-kiosk", async () => {
      await go("/kiosk?mode=report");
      await nap(2.6);
      await page.getByRole("button", { name: /打印体检报告/ }).first().click();
      await nap(1.6);
      await selectByText(page.getByLabel("合成身份"), /沈砚秋/);
      await nap(1.2);
      await page.getByRole("button", { name: /模拟识别并继续/ }).click();
      await nap(2);
      await page.getByLabel("打印份数").selectOption({ label: "2 份" });
      await nap(1);
      await page.getByRole("button", { name: /开始模拟打印/ }).click();
      await expect(appText(/已完成模拟打印/)).toBeVisible({
        timeout: 30000,
      });
      await nap(3);
      const printedState = await readState(page);
      const printedCount = printedState.appointments.find(
        (a: { patientId: string }) => a.patientId === "P005",
      )?.printCount;
      await page.getByRole("button", { name: /完成并退出/ }).click();
      await nap(1.6);

      await page.getByRole("button", { name: /打印体检报告/ }).first().click();
      await nap(1.4);
      await selectByText(page.getByLabel("合成身份"), /沈砚秋/);
      await page.getByRole("button", { name: /模拟识别并继续/ }).click();
      await nap(1.6);
      await page.getByRole("button", { name: /演示控制/ }).click();
      await nap(1.4);
      await page.getByRole("button", { name: /纸张不足/ }).click();
      await nap(1.6);
      await page.getByRole("button", { name: /开始模拟打印/ }).click();
      await expect(
        appText(/打印任务尚未创建/),
      ).toBeVisible({ timeout: 10000 });
      await nap(2.6);
      await page.getByRole("button", { name: /恢复设备并重试/ }).click();
      await nap(2);
      const faultState = await readState(page);
      expect(
        faultState.appointments.find(
          (a: { patientId: string }) => a.patientId === "P005",
        )?.printCount,
      ).toBe(printedCount);
      await page.getByRole("button", { name: /关闭演示控制/ }).click();
      await nap(1);
      await page.getByRole("button", { name: /返回首页/ }).click();
      await nap(1.4);
    });

    await scene("reports", async () => {
      await go("/reports");
      await page
        .locator("tr")
        .filter({ hasText: "沈砚秋" })
        .first()
        .getByRole("button", { name: /预览/ })
        .click();
      await nap(2);
      const history = page.getByLabel(/历史对比次数/);
      if (await history.count()) await selectByText(history, /3 次/);
      await nap(2.6);
      await page.getByRole("button", { name: "关闭", exact: true }).first().click();
      await nap(1.4);
      await go("/queue?screen=1");
      await nap(6);
      await go("/queue");
      const call = page.getByRole("button", { name: /呼叫下一位/ });
      if (await call.count()) {
        await call.first().click();
        await nap(2.6);
      }
    });

    await scene("health", async () => {
      await go("/health");
      await page.getByRole("button", { name: "干预随访" }).first().click();
      await nap(2);
      const start = page.getByRole("button", { name: /开始跟进/ }).first();
      if (await start.count()) {
        await start.click();
        await nap(1.8);
      }
      await page.getByRole("button", { name: "详情" }).first().click();
      await nap(1.6);
      await page
        .getByPlaceholder(/仅填写合成随访结果/)
        .fill("演示：已确认可复查安排，完成健康宣教与随访记录。");
      await nap(1.2);
      await page.getByRole("button", { name: /记录并完成随访/ }).click();
      await nap(2.4);
    });

    await scene("coverage", async () => {
      await go("/coverage");
      await nap(2.4);
      const search = page.getByLabel("搜索需求");
      await search.fill("装订");
      await nap(2.2);
      await search.fill("");
      await nap(1.4);
      const star = page.getByRole("checkbox", { name: /仅看 ★/ });
      await star.check();
      await nap(2.4);
      await star.uncheck();
      await nap(1.2);
      await go("/dashboard");
      await nap(3);
    });
  } finally {
    if (stopCapture) {
      const captured = await stopCapture(t0);
      console.log(`CDP 抓帧 ${captured} 帧 → ${captureDir}`);
    }
    if (marks.length) {
      mkdirSync(join(rootDir, "artifacts", "video"), { recursive: true });
      writeFileSync(
        join(rootDir, "artifacts", "video", "ep01-cues.json"),
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            fast: FAST,
            rawLeadMs: Math.round(leadMs / 1000) * 1000,
            voiceover: Boolean(VO),
            durationMs: marks[marks.length - 1].end,
            scenes: marks,
            script: script.scenes,
          },
          null,
          2,
        ),
      );
    }
  }
});
