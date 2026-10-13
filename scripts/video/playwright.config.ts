import { defineConfig } from "@playwright/test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

// 与 CI 用的 playwright.config.ts 分离：这里只负责第 1 集总览片的自动录屏。
export default defineConfig({
  testDir: here,
  outputDir: join(root, "artifacts/video/playwright"),
  timeout: 30 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  expect: { timeout: 8000 },
  use: {
    baseURL: process.env.TOUR_BASE || "http://127.0.0.1:5173",
    actionTimeout: 12000,
    navigationTimeout: 20000,
    viewport: {
      width: Number(process.env.TOUR_W || 1440),
      height: Number(process.env.TOUR_H || 900),
    },
    video: "on",
    recordVideo: {
      dir: join(root, "artifacts/video/raw"),
      size: { width: 1440, height: 900 },
    },
  },
  projects: [{ name: "ep01-tour", testMatch: "ep01-tour.spec.ts" }],
});
