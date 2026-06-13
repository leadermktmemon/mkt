// Dieu phoi: collect -> report -> send.
// Phase 1: doanh so nhanh.vn that -> ban tin Lark.
//
// Chay:
//   node index.mjs            -> recap "hom qua" (dung cho cron 10h)
//   node index.mjs --days 7   -> tong hop 7 ngay gan nhat (test)
//   node index.mjs --text     -> chi gui tin text kiem tra ket noi

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { sendCard, sendText } from "./src/larkSender.mjs";
import { buildDailyCard } from "./src/report.mjs";
import { getSalesByChannel, yesterdayWindowVN, lastNDaysWindow } from "./src/collectors/nhanh.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
const webhook = cfg.lark.webhookUrl;
const secret = cfg.lark.secret || undefined;

if (process.argv.includes("--text")) {
  await sendText(webhook, "✅ Kết nối Lark bot OK (test).", secret);
  console.log("Da gui tin text kiem tra.");
  process.exit(0);
}

const daysIdx = process.argv.indexOf("--days");
const window = daysIdx !== -1
  ? lastNDaysWindow(Number(process.argv[daysIdx + 1] || 7))
  : yesterdayWindowVN();

const nhanhConfigPath = resolve(__dirname, cfg.nhanh.configPath);

console.log("Dang lay doanh so nhanh.vn...");
const sales = await getSalesByChannel({ configPath: nhanhConfigPath, window });
console.log(`  ${sales.totals.orders} don hop le, doanh thu ${Math.round(sales.totals.revenue).toLocaleString("vi-VN")}d`);

const card = buildDailyCard({ sales });
await sendCard(webhook, card, secret);
console.log("Da gui ban tin vao Lark.");
