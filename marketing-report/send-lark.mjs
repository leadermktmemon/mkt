// Gui the KPI Marketing hang ngay vao Lark (doc dashboard/data.json) + anh thumbnail chien dich.
// Chay sau lark-build-data.mjs (va meta-fetch.mjs neu co). Dung trong cron hang ngay.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sendCard, uploadImage } from "./src/larkSender.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
const larkCfg = JSON.parse(readFileSync(join(__dirname, "../lark.config.json"), "utf8"));
const D = JSON.parse(readFileSync(join(__dirname, "dashboard", "data.json"), "utf8"));
const M = D.marketing, S = D.sales;

const vnd = (n) => { n = Math.round(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + " tỷ";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + " tr";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n); };

// ---- Upload dashboard screenshot (neu workflow da chup vao /tmp/dashboard.png) ----
const DASH_SCREENSHOT = "/tmp/dashboard.png";
let dashImgKey = null;
if (existsSync(DASH_SCREENSHOT)) {
  try {
    dashImgKey = await uploadImage(DASH_SCREENSHOT, larkCfg);
    console.log("Upload dashboard screenshot OK:", dashImgKey);
  } catch (e) { console.log("Upload screenshot thất bại:", e.message); }
}

// ---- Upload thumbnail top 3 chien dich (tu meta-data.json) ----
const metaPath = join(__dirname, "dashboard", "meta-data.json");
const thumbCols = [];
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const camps = meta.campaignDays || [];
  // Gom spend + roas theo campaign ID
  const agg = {};
  for (const c of camps) {
    if (!agg[c.id]) agg[c.id] = { name: c.name, spend: 0, roas: 0, thumb: c.thumb };
    agg[c.id].spend += c.spend;
    if (c.roas > agg[c.id].roas) agg[c.id].roas = c.roas;
  }
  const top3 = Object.values(agg)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3)
    .filter(c => c.thumb);

  for (const camp of top3) {
    const thumbPath = join(__dirname, "dashboard", camp.thumb);
    if (!existsSync(thumbPath)) continue;
    try {
      const imgKey = await uploadImage(thumbPath, larkCfg);
      const label = camp.name.length > 22 ? camp.name.slice(0, 22) + "…" : camp.name;
      const roasTxt = camp.roas > 0 ? ` · ROAS ${camp.roas}x` : "";
      thumbCols.push({
        tag: "column",
        width: "1",
        elements: [
          { tag: "img", img_key: imgKey, alt: { tag: "plain_text", content: camp.name } },
          { tag: "div", text: { tag: "lark_md", content: `**${label}**\n💰 ${vnd(camp.spend)}${roasTxt}` } },
        ],
      });
      console.log("Upload thumb OK:", camp.name.slice(0, 30));
    } catch (e) { console.log("Upload thumb thất bại:", camp.name, "-", e.message); }
  }
}

// ---- Build elements ----
const overview =
  `**🎯 MARKETING** _(30 ngày · Lark)_\n` +
  `• Doanh thu online: **${vnd(M.onlineRevenue)}**  •  Đơn: **${M.onlineOrders}**  •  AOV: **${vnd(M.onlineAov)}**`;

let chTable = "**Hiệu quả theo kênh** _(đơn theo kênh: ước tính)_\n```\nKênh           Đơn   Doanh thu   %\n";
for (const c of M.channels) {
  chTable += `${c.name.slice(0, 13).padEnd(13)} ${String(c.orders).padStart(4)}  ${vnd(c.revenue).padStart(8)}  ${String(c.share).padStart(2)}%\n`;
}
chTable += "```";

const B = D.brands || {};
const sales =
  `**🏬 TOÀN HỆ THỐNG**\n` +
  `• Tổng doanh thu: **${vnd(S.totalRevenue)}**  (Cửa hàng ${S.storePct}% · Online ${S.onlinePct}%)\n` +
  `• Bemori (online+cửa hàng): **${vnd(B.Bemori || 0)}**  •  Memon (B2B/sỉ): **${vnd(B.Memon || 0)}**\n` +
  `• Số hóa đơn: ${S.salesCount.toLocaleString("vi-VN")}`;

const elements = [];

// Dashboard screenshot (toan trang) o dau card
if (dashImgKey) {
  elements.push({ tag: "img", img_key: dashImgKey, alt: { tag: "plain_text", content: "Dashboard Marketing" } });
  elements.push({ tag: "hr" });
}

elements.push({ tag: "div", text: { tag: "lark_md", content: overview } });
elements.push({ tag: "hr" });
elements.push({ tag: "div", text: { tag: "lark_md", content: chTable } });
elements.push({ tag: "hr" });
elements.push({ tag: "div", text: { tag: "lark_md", content: sales } });

// Top 3 campaign thumbnails
if (thumbCols.length > 0) {
  elements.push({ tag: "hr" });
  elements.push({ tag: "div", text: { tag: "lark_md", content: "**📸 Top chiến dịch (30 ngày, theo chi phí)**" } });
  elements.push({ tag: "column_set", columns: thumbCols });
}

if (cfg.dashboardUrl) {
  elements.push({ tag: "hr" });
  elements.push({
    tag: "action",
    actions: [{ tag: "button", text: { tag: "plain_text", content: "📊 Mở dashboard đầy đủ" },
      type: "primary", url: cfg.dashboardUrl }],
  });
}
elements.push({ tag: "note", elements: [{ tag: "lark_md", content: `🤖 Cập nhật ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` }] });

const today = new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const card = {
  config: { wide_screen_mode: true },
  header: { template: "blue", title: { tag: "plain_text", content: `📊 Báo cáo Marketing — ${today}` } },
  elements,
};

await sendCard(cfg.lark.webhookUrl, card, cfg.lark.secret || undefined);
console.log("Đã gửi thẻ KPI marketing (có ảnh) vào Lark.");
