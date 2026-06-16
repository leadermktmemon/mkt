// Meta Ads — kiem tra ket noi: doi token song lau (60 ngay), liet ke ad account, keo chi tieu 30 ngay.
//
// Chay: node meta-check.mjs
// Yeu cau: dien appId, appSecret, token vao meta.config.json (token lay tu Graph API Explorer).

import { readFileSync, writeFileSync } from "node:fs";
const CONFIG = new URL("./meta.config.json", import.meta.url);
const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const V = cfg.apiVersion || "v21.0";
const G = `https://graph.facebook.com/${V}`;

for (const k of ["appId", "token"]) {
  if (!cfg[k] || String(cfg[k]).startsWith("DIEN_")) { console.error(`Thieu "${k}" trong meta.config.json`); process.exit(1); }
}

async function get(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`${data.error.message} (code ${data.error.code})`);
  return data;
}

// 1) Doi sang long-lived token (chi khi co appSecret; System User token khong can exchange)
let token = cfg.token;
if (cfg.appSecret) {
  console.log("Đổi token sống lâu (60 ngày)...");
  try {
    const ex = await get(`${G}/oauth/access_token?grant_type=fb_exchange_token&client_id=${cfg.appId}&client_secret=${cfg.appSecret}&fb_exchange_token=${encodeURIComponent(cfg.token)}`);
    if (ex.access_token) {
      token = ex.access_token;
      cfg.longLivedToken = token;
      console.log("  OK. Token mới hết hạn sau ~60 ngày.");
    }
  } catch (e) { console.log("  (Không đổi được, dùng token gốc):", e.message); }
} else {
  console.log("System User token — bỏ qua bước exchange (token không hết hạn).");
}

// 2) Liet ke ad account
console.log("\nLiệt kê ad account...");
const acc = await get(`${G}/me/adaccounts?fields=name,account_id,currency,account_status&limit=100&access_token=${encodeURIComponent(token)}`);
const accounts = (acc.data || []).map((a) => ({ id: a.account_id, name: a.name, currency: a.currency, status: a.account_status }));
cfg.accounts = accounts;
console.log(`  Tìm thấy ${accounts.length} tài khoản:`);
accounts.forEach((a) => console.log(`   • act_${a.id} | ${a.name} | ${a.currency} | status ${a.status}`));

writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");

// 3) Keo chi tieu 30 ngay (account level)
const until = new Date().toISOString().slice(0, 10);
const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
console.log(`\nChi tiêu 30 ngày (${since} → ${until}):`);
let totalSpend = 0;
for (const a of accounts) {
  try {
    const ins = await get(`${G}/act_${a.id}/insights?level=account&fields=spend,impressions,clicks,ctr,cpm&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&access_token=${encodeURIComponent(token)}`);
    const row = ins.data?.[0];
    const spend = row ? Number(row.spend) : 0;
    totalSpend += spend;
    console.log(`   • ${a.name.padEnd(28)} chi ${spend.toLocaleString("vi-VN")} ${a.currency} | ${row?.impressions||0} hiển thị | CTR ${row?.ctr||0}%`);
  } catch (e) { console.log(`   • ${a.name}: LỖI ${e.message}`); }
}
console.log(`\nTổng chi 30 ngày: ${Math.round(totalSpend).toLocaleString("vi-VN")} (đơn vị theo currency mỗi acc)`);
console.log("Đã lưu longLivedToken + accounts vào meta.config.json");
