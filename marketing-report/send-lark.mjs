// Gui the KPI Marketing hang ngay vao Lark (doc dashboard/data.json) + nut mo dashboard.
// Chay sau build-data.mjs. Dung trong cron hang ngay.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sendCard } from "./src/larkSender.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
const D = JSON.parse(readFileSync(join(__dirname, "dashboard", "data.json"), "utf8"));
const M = D.marketing, S = D.sales;

const vnd = (n) => { n=Math.round(n);
  if (n>=1e9) return (n/1e9).toFixed(2).replace(/\.?0+$/,"")+" tỷ";
  if (n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,"")+" tr";
  if (n>=1e3) return Math.round(n/1e3)+"K";
  return String(n); };

const overview =
  `**🎯 MARKETING** _(${D.period.days} ngày · nhanh.vn)_\n` +
  `• Doanh thu online: **${vnd(M.onlineRevenue)}**  •  Đơn: **${M.onlineOrders}**  •  AOV: **${vnd(M.onlineAov)}**`;

let chTable = "**Hiệu quả theo kênh**\n```\nKênh           Đơn   Doanh thu   %\n";
for (const c of M.channels) {
  chTable += `${c.name.slice(0,13).padEnd(13)} ${String(c.orders).padStart(4)}  ${vnd(c.revenue).padStart(8)}  ${String(c.share).padStart(2)}%\n`;
}
chTable += "```";

const B = D.brands || {};
const sales =
  `**🏬 TOÀN HỆ THỐNG**\n` +
  `• Tổng doanh thu: **${vnd(S.totalRevenue)}**  (Cửa hàng ${S.storePct}% · Online ${S.onlinePct}%)\n` +
  `• Bemori (online+cửa hàng): **${vnd(B.Bemori||0)}**  •  Memon (B2B/sỉ): **${vnd(B.Memon||0)}**\n` +
  `• Số hóa đơn: ${S.salesCount.toLocaleString("vi-VN")}`;

const pending = `⏳ _ROAS/CPA theo kênh sẽ có khi nối Meta/Google/TikTok Ads._`;

const elements = [
  { tag: "div", text: { tag: "lark_md", content: overview } },
  { tag: "hr" },
  { tag: "div", text: { tag: "lark_md", content: chTable } },
  { tag: "hr" },
  { tag: "div", text: { tag: "lark_md", content: sales } },
  { tag: "hr" },
  { tag: "div", text: { tag: "lark_md", content: pending } },
];

if (cfg.dashboardUrl) {
  elements.push({
    tag: "action",
    actions: [{ tag: "button", text: { tag: "plain_text", content: "📊 Mở dashboard đầy đủ" },
      type: "primary", url: cfg.dashboardUrl }],
  });
}
elements.push({ tag: "note", elements: [{ tag: "lark_md", content: `🤖 Cập nhật ${new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}` }] });

const today = new Date().toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", timeZone:"Asia/Ho_Chi_Minh" });
const card = {
  config: { wide_screen_mode: true },
  header: { template: "blue", title: { tag: "plain_text", content: `📊 Báo cáo Marketing — ${today}` } },
  elements,
};

await sendCard(cfg.lark.webhookUrl, card, cfg.lark.secret || undefined);
console.log("Da gui the KPI marketing vao Lark.");
