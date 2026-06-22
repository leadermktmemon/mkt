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
      level: "account", fields: "spend,impressions,clicks,action_values",
      time_increment: "1", breakdowns: "publisher_platform",
      time_range: JSON.stringify({ since, until }),
      limit: "500", access_token: grpToken,
    });
    try {
      const rows = await pages(`${G}/act_${acc.id}/insights?${p}`);
      console.log(`  ${rows.length} dòng`);
      for (const row of rows) {
        const day = row.date_start;
        if (!daily[day]) daily[day] = { facebook: 0, instagram: 0, messenger: 0, audience_network: 0, total: 0, igPurchaseValue: 0 };
        const spend = Number(row.spend) || 0;
        const plat = row.publisher_platform?.toLowerCase() || "other";
        if (plat in daily[day]) daily[day][plat] += spend;
        daily[day].total += spend;
        if (plat === 'instagram') {
          const actVals = {};
          (row.action_values || []).forEach(a => { actVals[a.action_type] = (actVals[a.action_type] || 0) + (Number(a.value) || 0); });
          daily[day].igPurchaseValue = (daily[day].igPurchaseValue || 0) +
            (actVals['offsite_conversion.fb_pixel_purchase'] || 0) +
            (actVals['onsite_conversion.purchase'] || 0);
        }
      }
    } catch (e) { console.log(`  LỖI ${acc.name}: ${e.message}`); }
  }
}

for (const g of allGroups) await fetchGroup(g.label, g.token, g.accounts);

// ---- Buoc 1: Lay trang thai campaign (management API) ----
console.log('\nKéo trạng thái chiến dịch...');
const campStatus = {};
async function fetchStatuses(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({ fields: 'id,effective_status,objective', limit: '500', access_token: grpToken });
    try {
      const rows = await pages(`${G}/act_${acc.id}/campaigns?${p}`);
      for (const c of rows) campStatus[c.id] = { status: c.effective_status, objective: c.objective || '' };
      console.log(`  [${label}] ${acc.name}: ${rows.length} campaigns`);
    } catch (e) { console.log(`  [Status] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchStatuses(g.label, g.token, g.accounts);

// ---- Buoc 1b: optimization_goal theo ad set -> map ve campaign ----
// Vi objective OUTCOME_ENGAGEMENT gop ca messaging (ban hang) lan video/like (branding),
// optimization_goal moi phan biet duoc dung: CONVERSATIONS/OFFSITE_CONVERSIONS=ban hang, POST_ENGAGEMENT/THRUPLAY/REACH=branding.
console.log('\nKéo optimization_goal theo nhóm quảng cáo...');
const BRAND_GOAL = new Set(['POST_ENGAGEMENT','ENGAGED_USERS','PROFILE_AND_PAGE_ENGAGEMENT','EVENT_RESPONSES','THRUPLAY','TWO_SECOND_CONTINUOUS_VIDEO_VIEWS','VIDEO_VIEWS','REACH','IMPRESSIONS','AD_RECALL_LIFT','PAGE_LIKES','VISIT_INSTAGRAM_PROFILE','PROFILE_VISIT']);
const campOpt = {};
async function fetchOptGoals(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({ fields: 'campaign_id,optimization_goal', limit: '500', access_token: grpToken });
    try {
      const rows = await pages(`${G}/act_${acc.id}/adsets?${p}`);
      for (const a of rows) {
        const cid = a.campaign_id, g = a.optimization_goal || '';
        if (!cid || !g) continue;
        const prev = campOpt[cid];
        // Uu tien goal ban hang: neu campaign co ca adset branding lan ban hang -> xep ban hang
        if (!prev || (BRAND_GOAL.has(prev) && !BRAND_GOAL.has(g))) campOpt[cid] = g;
      }
      console.log(`  [${label}] ${acc.name}: ${rows.length} ad sets`);
    } catch (e) { console.log(`  [OptGoal] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchOptGoals(g.label, g.token, g.accounts);

// ---- Buoc 1c: thumbnail quang cao theo campaign (uu tien ad dang chay) ----
console.log('\nKéo thumbnail quảng cáo...');
const campThumb = {};
async function fetchThumbs(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({ fields: 'campaign_id,effective_status,creative{thumbnail_url}', limit: '500', access_token: grpToken });
    try {
      const rows = await pages(`${G}/act_${acc.id}/ads?${p}`);
      for (const a of rows) {
        const cid = a.campaign_id, t = a.creative?.thumbnail_url || '';
        if (!cid || !t) continue;
        // Uu tien thumbnail cua ad ACTIVE; neu chua co thi lay tam ad bat ky
        if (!campThumb[cid] || a.effective_status === 'ACTIVE') campThumb[cid] = t;
      }
      console.log(`  [${label}] ${acc.name}: ${rows.length} ads`);
    } catch (e) { console.log(`  [Thumb] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchThumbs(g.label, g.token, g.accounts);

// ---- Buoc 2: Chi phi theo ngay x campaign (30 ngay, time_increment=1) ----
// CPM (=spend/impressions, deu cong don duoc) la tin hieu chinh phan biet Branding (CPM thap: hien thi rong/re)
// vs Ban hang (CPM cao: tep hep, dat) -> tinh truc tiep o dashboard, khong can fetch reach/frequency.
console.log('\nKéo chi tiết chiến dịch theo ngày...');
const campaignDays = [];
const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
async function fetchCampaignDays(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_name,campaign_id,spend,impressions,clicks,actions,action_values',
      time_range: JSON.stringify({ since: since30, until }),
      time_increment: '1',
      limit: '1000', access_token: grpToken,
    });
    try {
      const rows = await pages(`${G}/act_${acc.id}/insights?${p}`);
      console.log(`  [${label}] ${acc.name}: ${rows.length} ngày×campaign`);
      for (const row of rows) {
        const spend = Math.round(Number(row.spend) || 0);
        if (!spend) continue;
        const acts = {}, actVals = {};
        (row.actions || []).forEach(a => { acts[a.action_type] = (acts[a.action_type] || 0) + (Number(a.value) || 0); });
        (row.action_values || []).forEach(a => { actVals[a.action_type] = (actVals[a.action_type] || 0) + (Number(a.value) || 0); });
        const purch = Math.round((acts['offsite_conversion.fb_pixel_purchase'] || 0) + (acts['onsite_conversion.purchase'] || 0));
        const purchVal = Math.round((actVals['offsite_conversion.fb_pixel_purchase'] || 0) + (actVals['onsite_conversion.purchase'] || 0));
        campaignDays.push({
          day: row.date_start,
          account: acc.name, bm: label, id: row.campaign_id, name: row.campaign_name,
          status: campStatus[row.campaign_id]?.status || 'UNKNOWN',
          objective: campStatus[row.campaign_id]?.objective || '',
          optGoal: campOpt[row.campaign_id] || '',
          thumb: campThumb[row.campaign_id] || '',
          spend, impressions: Number(row.impressions) || 0, clicks: Number(row.clicks) || 0,
          engagement: Math.round(acts['post_engagement'] || 0),
          messages: Math.round(acts['onsite_conversion.messaging_conversation_started_7d'] || acts['onsite_conversion.messaging_conversation_started_30d'] || 0),
          leads: Math.round((acts['lead'] || 0) + (acts['onsite_conversion.lead'] || 0)),
          purchases: purch, purchaseValue: purchVal,
          roas: purchVal && spend ? Math.round(purchVal / spend * 100) / 100 : 0,
        });
      }
    } catch (e) { console.log(`  [CampDays] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchCampaignDays(g.label, g.token, g.accounts);
campaignDays.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : b.spend - a.spend);
console.log(`CampaignDays: ${campaignDays.length} ngày×campaign (${since30} → ${until})`);

for (const d of Object.values(daily)) for (const k of Object.keys(d)) d[k] = Math.round(d[k]);

const days = Object.keys(daily).sort();
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), since, until, accounts: cfg.accounts, daily, campaignDays }, null, 2), "utf8");

const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
let fb30 = 0, ig30 = 0, tot30 = 0;
for (const [d, v] of Object.entries(daily)) if (d >= cutoff) { fb30 += v.facebook; ig30 += v.instagram; tot30 += v.total; }
console.log(`\n${days.length} ngày (${days[0]} → ${days[days.length - 1]})`);
console.log(`30 ngày: Facebook ${fb30.toLocaleString("vi-VN")} | Instagram ${ig30.toLocaleString("vi-VN")} | Tổng ${tot30.toLocaleString("vi-VN")} VND`);
console.log(`Đã lưu → ${OUT}`);
