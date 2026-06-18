// Keo chi phi quang cao Meta (Facebook + Instagram) theo ngay tu Graph API.
// Chay: node meta-fetch.mjs
// Output: marketing-report/dashboard/meta-data.json (doc boi lark-build-data.mjs)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(__dirname, "meta.config.json");
if (!existsSync(cfgPath)) { console.log("Không tìm thấy meta.config.json — bỏ qua Meta fetch."); process.exit(0); }
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const token = cfg.longLivedToken || cfg.token;
if (!token || !cfg.accounts?.length) { console.log("Thiếu token hoặc accounts trong meta.config.json."); process.exit(0); }

const V = cfg.apiVersion || "v21.0";
const G = `https://graph.facebook.com/${V}`;
const OUT = join(__dirname, "marketing-report", "dashboard", "meta-data.json");

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url); const d = await r.json();
    if (d.error) {
      if (d.error.code === 17 || d.error.code === 613) { console.log("  Rate limit, đợi 61s..."); await sleep(61000); continue; }
      throw new Error(`${d.error.message} (code ${d.error.code})`);
    }
    return d;
  }
}
async function pages(url) {
  const rows = []; let next = url;
  while (next) { const d = await get(next); rows.push(...(d.data || [])); next = d.paging?.next || null; }
  return rows;
}

const since = "2025-01-01";
const until = new Date().toISOString().slice(0, 10);
const daily = {};

// Gop tat ca BM: main token + additionalTokens
const allGroups = [
  { label: "BM1", token, accounts: cfg.accounts || [] },
  ...(cfg.additionalTokens || []).map(t => ({ label: t.label || "BM?", token: t.token, accounts: t.accounts || [] })),
];

async function fetchGroup(label, grpToken, accounts) {
  for (const acc of accounts) {
    console.log(`[${label}] Kéo ${acc.name} (act_${acc.id})...`);
    const p = new URLSearchParams({
      level: "account", fields: "spend,impressions,clicks",
      time_increment: "1", breakdowns: "publisher_platform",
      time_range: JSON.stringify({ since, until }),
      limit: "500", access_token: grpToken,
    });
    try {
      const rows = await pages(`${G}/act_${acc.id}/insights?${p}`);
      console.log(`  ${rows.length} dòng`);
      for (const row of rows) {
        const day = row.date_start;
        if (!daily[day]) daily[day] = { facebook: 0, instagram: 0, messenger: 0, audience_network: 0, total: 0 };
        const spend = Number(row.spend) || 0;
        const plat = row.publisher_platform?.toLowerCase() || "other";
        if (plat in daily[day]) daily[day][plat] += spend;
        daily[day].total += spend;
      }
    } catch (e) { console.log(`  LỖI ${acc.name}: ${e.message}`); }
  }
}

for (const g of allGroups) await fetchGroup(g.label, g.token, g.accounts);

// ---- Campaign-level summary (last 30 days) ----
console.log('\nKéo chiến dịch (30 ngày)...');
const campaigns = [];
const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
async function fetchCampaigns(label, grpToken, accounts) {
  for (const acc of accounts) {
    console.log(`[${label}] Campaigns ${acc.name}...`);
    const p = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_name,campaign_id,spend,impressions,clicks,actions,action_values',
      time_range: JSON.stringify({ since: since30, until }),
      limit: '200', access_token: grpToken,
    });
    try {
      const rows = await pages(`${G}/act_${acc.id}/insights?${p}`);
      console.log(`  ${rows.length} chiến dịch`);
      for (const row of rows) {
        const spend = Math.round(Number(row.spend) || 0);
        if (!spend) continue;
        const acts = {}, actVals = {};
        (row.actions || []).forEach(a => { acts[a.action_type] = (acts[a.action_type] || 0) + (Number(a.value) || 0); });
        (row.action_values || []).forEach(a => { actVals[a.action_type] = (actVals[a.action_type] || 0) + (Number(a.value) || 0); });
        const purch = Math.round((acts['offsite_conversion.fb_pixel_purchase'] || 0) + (acts['onsite_conversion.purchase'] || 0));
        const purchVal = Math.round((actVals['offsite_conversion.fb_pixel_purchase'] || 0) + (actVals['onsite_conversion.purchase'] || 0));
        campaigns.push({
          account: acc.name, bm: label, id: row.campaign_id, name: row.campaign_name,
          spend, impressions: Number(row.impressions) || 0, clicks: Number(row.clicks) || 0,
          engagement: Math.round(acts['post_engagement'] || 0),
          messages: Math.round(acts['onsite_conversion.messaging_conversation_started_7d'] || acts['onsite_conversion.messaging_conversation_started_30d'] || 0),
          leads: Math.round((acts['lead'] || 0) + (acts['onsite_conversion.lead'] || 0)),
          purchases: purch, purchaseValue: purchVal,
          roas: purchVal && spend ? Math.round(purchVal / spend * 100) / 100 : 0,
        });
      }
    } catch (e) { console.log(`  [Campaigns] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchCampaigns(g.label, g.token, g.accounts);
campaigns.sort((a, b) => b.spend - a.spend);
console.log(`Campaigns: ${campaigns.length} chiến dịch có chi phí (${since30} → ${until})`);

for (const d of Object.values(daily)) for (const k of Object.keys(d)) d[k] = Math.round(d[k]);

const days = Object.keys(daily).sort();
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), since, until, accounts: cfg.accounts, daily, campaigns }, null, 2), "utf8");

const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
let fb30 = 0, ig30 = 0, tot30 = 0;
for (const [d, v] of Object.entries(daily)) if (d >= cutoff) { fb30 += v.facebook; ig30 += v.instagram; tot30 += v.total; }
console.log(`\n${days.length} ngày (${days[0]} → ${days[days.length - 1]})`);
console.log(`30 ngày: Facebook ${fb30.toLocaleString("vi-VN")} | Instagram ${ig30.toLocaleString("vi-VN")} | Tổng ${tot30.toLocaleString("vi-VN")} VND`);
console.log(`Đã lưu → ${OUT}`);
