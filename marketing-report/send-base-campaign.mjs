// Gui BAO CAO CAMPAIGN hang ngay vao BASE.VN chat (doc dashboard/data.json -> campaignDays).
// Base webhook: POST form-urlencoded voi bot_name, bot_username, base_content (text), base_blocks.
// Thanh cong khi HTTP 2xx + response {code:1, message:"ok"}.
// Chay sau lark-build-data.mjs, trong cron 8h30 VN (01:30 UTC).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
const D = JSON.parse(readFileSync(join(__dirname, "dashboard", "data.json"), "utf8"));
const cd = D.campaignDays || [];

const baseCfg = cfg.base || {};
const WEBHOOK = process.env.BASE_WEBHOOK_URL || baseCfg.webhookUrl || "";
const BOT_NAME = baseCfg.botName || "Báo cáo Campaign";
const BOT_USERNAME = baseCfg.botUsername || "campaign_report";

const vnd = (n) => { n = Math.round(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + " tỷ";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + " tr";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n); };

// ---- Moc thoi gian (gio VN) ----
const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
const ymd = (d) => d.toISOString().slice(0, 10);
const dm = (s) => s.slice(8) + "/" + s.slice(5, 7);
const today = ymd(vnNow);
const yesterday = ymd(new Date(vnNow.getTime() - 86400000));
const since7 = ymd(new Date(vnNow.getTime() - 7 * 86400000));

// ---- Gom theo campaign trong khoang ngay ----
function aggBy(fromDay, toDay) {
  const m = {};
  for (const r of cd) {
    if (r.day < fromDay || r.day > toDay) continue;
    const c = m[r.id] || (m[r.id] = { name: r.name, status: r.status, spend: 0, msg: 0, pur: 0, pv: 0 });
    c.spend += r.spend || 0; c.msg += r.messages || 0; c.pur += r.purchases || 0; c.pv += r.purchaseValue || 0;
  }
  return m;
}
function totals(m) {
  const t = { spend: 0, msg: 0, pur: 0, pv: 0, n: 0 };
  for (const c of Object.values(m)) { t.spend += c.spend; t.msg += c.msg; t.pur += c.pur; t.pv += c.pv; if (c.spend > 0) t.n++; }
  t.roas = t.spend ? t.pv / t.spend : 0;
  return t;
}
const roasEmoji = (r) => r >= 3 ? "🟢" : r >= 1.5 ? "🟡" : "🔴";
const short = (s, n = 34) => s.length > n ? s.slice(0, n) + "…" : s;

// Bao cao cho NGAY HOM QUA (buoi sang 8h30 -> hom qua da du du lieu ca ngay)
const yAgg = aggBy(yesterday, yesterday);
const dayT = totals(yAgg);
const camps = Object.values(yAgg).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend);

// ---- Noi dung: BAO CAO HOM QUA ----
let msg = `📊 BÁO CÁO ADS — HÔM QUA (${dm(yesterday)})\n`;
msg += `\n━━━ TỔNG QUAN ━━━\n`;
msg += `💰 Chi ads   ${vnd(dayT.spend)}\n`;
msg += `📈 ROAS      ${dayT.roas.toFixed(1)}x ${roasEmoji(dayT.roas)}\n`;
msg += `💬 Tin nhắn  ${dayT.msg}\n`;
msg += `🛒 Đơn       ${dayT.pur}\n`;
msg += `💎 DT pixel  ${vnd(dayT.pv)}\n`;
msg += `\n━━━ CHIẾN DỊCH (${camps.length}) ━━━\n`;
if (!camps.length) {
  msg += `(hôm qua không có chiến dịch phát sinh chi phí)\n`;
} else {
  camps.forEach((c, i) => {
    const r = c.spend ? c.pv / c.spend : 0;
    const roasTxt = c.pv > 0 ? `ROAS ${r.toFixed(1)}x ${roasEmoji(r)}` : `${c.msg} tn`;
    msg += `${i + 1}. ${short(c.name, 32)}\n    ${vnd(c.spend)} · ${roasTxt} · ${c.pur || 0} đơn\n`;
  });
}
if (cfg.dashboardUrl) msg += `\n🔗 ${cfg.dashboardUrl}`;
msg += `\n🤖 Cập nhật ${vnNow.toISOString().slice(11, 16)}`;

// ---- DRY RUN: chi in noi dung, khong gui ----
if (process.env.DRY_RUN === "1") {
  console.log("=== DRY RUN (không gửi) ===\n");
  console.log(msg);
  console.log(`\n[DRY RUN] Webhook: ${WEBHOOK ? WEBHOOK.slice(0, 40) + "..." : "(CHƯA cấu hình cfg.base.webhookUrl)"}`);
  process.exit(0);
}

if (!WEBHOOK) { console.log("Chưa cấu hình webhook Base (cfg.base.webhookUrl). Bỏ qua."); process.exit(0); }

// ---- Gui toi Base (form-urlencoded) ----
const body = new URLSearchParams({
  bot_name: BOT_NAME,
  bot_username: BOT_USERNAME,
  base_content: msg,
  base_blocks: "null",
}).toString();

try {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const code = res.status;
  const text = await res.text();
  let r = {};
  try { r = JSON.parse(text); } catch { /* khong phai JSON */ }
  if (code >= 200 && code < 300 && r.code === 1 && r.message === "ok") {
    console.log("✓ Đã gửi báo cáo Campaign sang Base thành công.");
  } else {
    console.log(`✗ Base trả về lỗi (HTTP ${code}):`, text.slice(0, 200));
    process.exit(1);
  }
} catch (e) {
  console.log("✗ Lỗi gọi webhook Base:", e.message);
  process.exit(1);
}
