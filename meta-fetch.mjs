// Keo chi phi quang cao Meta (Facebook + Instagram) theo ngay tu Graph API.
// Chay: node meta-fetch.mjs
// Output: marketing-report/dashboard/meta-data.json (doc boi lark-build-data.mjs)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
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

// ---- Buoc 1c: thumbnail + noi dung sang tao theo campaign (uu tien ad dang chay) ----
console.log('\nKéo thumbnail + nội dung quảng cáo...');
const campThumb = {};
const campCreative = {};
const campCreativeId = {}; // cid -> creative id, de sau nay xin thumbnail do phan giai cao
const campToken = {}; // cid -> token dung de list no (de goi lai dung quyen truy cap)
async function fetchThumbs(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({ fields: 'campaign_id,effective_status,creative{id,thumbnail_url,image_url,title,body,call_to_action_type,link_url,object_story_spec{link_data{picture,child_attachments{image_url,picture}}}}', limit: '100', access_token: grpToken });
    try {
      const rows = await pages(`${G}/act_${acc.id}/ads?${p}`);
      for (const a of rows) {
        const cid = a.campaign_id, cr = a.creative || {};
        if (!cid) continue;
        // Uu tien ad ACTIVE; neu chua co thi lay tam ad bat ky
        if (!campThumb[cid] || a.effective_status === 'ACTIVE') {
          // thumbnail_url cho local download (nho, on dinh); image_url/link_data.picture la anh chat luong cao hon (CDN)
          const linkPicture = cr.object_story_spec?.link_data?.picture || '';
          if (cr.thumbnail_url || cr.image_url) campThumb[cid] = cr.thumbnail_url || cr.image_url;
          if (cr.id) { campCreativeId[cid] = cr.id; campToken[cid] = grpToken; }
          // Lay anh carousel tu child_attachments (neu co)
          const kids = cr.object_story_spec?.link_data?.child_attachments || [];
          const carouselImgs = kids.map(k => k.image_url || k.picture || '').filter(Boolean);
          campCreative[cid] = {
            title: cr.title || '',
            body: cr.body || '',
            cta: cr.call_to_action_type || '',
            linkUrl: cr.link_url || '',
            imageUrl: cr.image_url || linkPicture || '',   // anh chat luong cao dung trong modal (fallback link_data.picture khi thieu image_url)
            images: carouselImgs,            // tat ca anh carousel (CDN URL, khong download local)
          };
        }
      }
      console.log(`  [${label}] ${acc.name}: ${rows.length} ads`);
    } catch (e) { console.log(`  [Thumb] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchThumbs(g.label, g.token, g.accounts);

// ---- Xin lai thumbnail do phan giai cao hon (640px) ----
// Luu y: thumbnail_width/height CHI duoc Meta ton trong khi goi truc tiep node creative
// (/{creative_id}?fields=thumbnail_url&thumbnail_width=..), KHONG hoat dong khi xin qua
// field long "creative{thumbnail_url}" tren edge /ads (da test thuc te, van tra ve p64x64).
// Da so quang cao la boost bai viet co san (Click-to-Messenger) nen chi co thumbnail_url,
// khong co image_url/link_data.picture -> buoc nay quan trong de anh trong modal khong vo net.
console.log('\nXin lại thumbnail độ phân giải cao...');
let hiResOk = 0, hiResFail = 0;
for (const [cid, creativeId] of Object.entries(campCreativeId)) {
  try {
    const p = new URLSearchParams({ fields: 'thumbnail_url', thumbnail_width: '640', thumbnail_height: '640', access_token: campToken[cid] });
    const r = await fetch(`${G}/${creativeId}?${p}`);
    const d = await r.json();
    if (d.thumbnail_url) { campThumb[cid] = d.thumbnail_url; hiResOk++; } else hiResFail++;
  } catch { hiResFail++; }
}
console.log(`  Nâng cấp ${hiResOk} thumbnail, lỗi/bỏ qua ${hiResFail}`);

// ---- Buoc 2: Chi phi theo ngay x campaign (30 ngay, time_increment=1) ----
// CPM (=spend/impressions, deu cong don duoc) la tin hieu chinh phan biet Branding (CPM thap: hien thi rong/re)
// vs Ban hang (CPM cao: tep hep, dat) -> tinh truc tiep o dashboard.
// reach: cong don theo ngay la XAP XI (1 nguoi xem nhieu ngay se bi dem lai nhieu lan), dung de
// tinh Tan suat (impressions/reach) cho biet co lap qua nhieu / tiep can hep khong - khong phai
// reach chinh xac ca ky.
console.log('\nKéo chi tiết chiến dịch theo ngày...');
const campaignDays = [];
const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
async function fetchCampaignDays(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_name,campaign_id,spend,impressions,reach,clicks,actions,action_values',
      time_range: JSON.stringify({ since: since30, until }),
      time_increment: '1',
      limit: '1000', access_token: grpToken,
    });
    try {
      const rows = await pages(`${G}/act_${acc.id}/insights?${p}`);
      console.log(`  [${label}] ${acc.name}: ${rows.length} ngày×campaign`);
      const missingThumbCids = new Set();
      for (const row of rows) {
        const spend = Math.round(Number(row.spend) || 0);
        if (!spend) continue;
        const acts = {}, actVals = {};
        (row.actions || []).forEach(a => { acts[a.action_type] = (acts[a.action_type] || 0) + (Number(a.value) || 0); });
        (row.action_values || []).forEach(a => { actVals[a.action_type] = (actVals[a.action_type] || 0) + (Number(a.value) || 0); });
        const purch = Math.round((acts['offsite_conversion.fb_pixel_purchase'] || 0) + (acts['onsite_conversion.purchase'] || 0));
        const purchVal = Math.round((actVals['offsite_conversion.fb_pixel_purchase'] || 0) + (actVals['onsite_conversion.purchase'] || 0));
        if (!campThumb[row.campaign_id]) missingThumbCids.add(row.campaign_id);
        campaignDays.push({
          day: row.date_start,
          account: acc.name, bm: label, id: row.campaign_id, name: row.campaign_name,
          status: campStatus[row.campaign_id]?.status || 'UNKNOWN',
          objective: campStatus[row.campaign_id]?.objective || '',
          optGoal: campOpt[row.campaign_id] || '',
          thumb: campThumb[row.campaign_id] || '',
          creative: campCreative[row.campaign_id] || {},
          spend, impressions: Number(row.impressions) || 0, reach: Number(row.reach) || 0, clicks: Number(row.clicks) || 0,
          engagement: Math.round(acts['post_engagement'] || 0),
          messages: Math.round(acts['onsite_conversion.messaging_conversation_started_7d'] || acts['onsite_conversion.messaging_conversation_started_30d'] || 0),
          leads: Math.round((acts['lead'] || 0) + (acts['onsite_conversion.lead'] || 0)),
          purchases: purch, purchaseValue: purchVal,
          roas: purchVal && spend ? Math.round(purchVal / spend * 100) / 100 : 0,
        });
      }
      // Fallback: bulk fetch /act_.../ads (phan trang ca tai khoan) doi khi bo sot vai ad (da gap
      // thuc te: 1 campaign co chi tieu nhung khong xuat hien trong ket qua bulk). Voi campaign nao
      // sau khi bulk van thieu thumb, truy van truc tiep /{campaign_id}/ads de lay lai.
      for (const cid of missingThumbCids) {
        try {
          const p2 = new URLSearchParams({ fields: 'id,effective_status,creative{id,thumbnail_url,image_url,title,body,call_to_action_type,link_url,object_story_spec{link_data{picture,child_attachments{image_url,picture}}}}', access_token: grpToken });
          const r2 = await fetch(`${G}/${cid}/ads?${p2}`);
          const d2 = await r2.json();
          for (const a of (d2.data || [])) {
            const cr = a.creative || {};
            if (!cr.thumbnail_url && !cr.image_url) continue;
            const linkPicture = cr.object_story_spec?.link_data?.picture || '';
            campThumb[cid] = cr.thumbnail_url || cr.image_url;
            campCreativeId[cid] = cr.id;
            campToken[cid] = grpToken;
            const kids = cr.object_story_spec?.link_data?.child_attachments || [];
            campCreative[cid] = {
              title: cr.title || '', body: cr.body || '', cta: cr.call_to_action_type || '', linkUrl: cr.link_url || '',
              imageUrl: cr.image_url || linkPicture || '',
              images: kids.map(k => k.image_url || k.picture || '').filter(Boolean),
            };
            // Buoc nay chay SAU vong nang cap thumbnail 640px chinh (da xong truoc do) nen phai
            // tu xin lai anh do phan giai cao ngay tai day, khong thi se ket qua thumbnail nho 64px.
            try {
              const p3 = new URLSearchParams({ fields: 'thumbnail_url', thumbnail_width: '640', thumbnail_height: '640', access_token: grpToken });
              const r3 = await fetch(`${G}/${cr.id}?${p3}`);
              const d3 = await r3.json();
              if (d3.thumbnail_url) campThumb[cid] = d3.thumbnail_url;
            } catch { /* giu ban thumbnail_url mac dinh neu loi */ }
            break;
          }
        } catch { /* bo qua, giu nguyen khong co anh */ }
      }
      // Cac dong da push o tren dung thumb/creative CU (rong) truoc khi fallback chay xong -> vá lai.
      if (missingThumbCids.size) {
        for (const d of campaignDays) {
          if (missingThumbCids.has(d.id) && campThumb[d.id]) {
            d.thumb = campThumb[d.id];
            d.creative = campCreative[d.id] || {};
          }
        }
      }
    } catch (e) { console.log(`  [CampDays] LỖI ${acc.name}: ${e.message}`); }
  }
}
for (const g of allGroups) await fetchCampaignDays(g.label, g.token, g.accounts);
campaignDays.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : b.spend - a.spend);
console.log(`CampaignDays: ${campaignDays.length} ngày×campaign (${since30} → ${until})`);

// An toan: neu API loi mang/rate-limit khien campaignDays rong (trong khi file cu dang co du lieu),
// DUNG lai truoc khi ghi/xoa gi ca - tranh ghi de meta-data.json ve rong va xoa sach thumbs local
// (da tung xay ra thuc te: "fetch failed" hang loat do mang chap chon).
if (campaignDays.length === 0 && existsSync(OUT)) {
  const prev = JSON.parse(readFileSync(OUT, "utf8"));
  if ((prev.campaignDays || []).length > 0) {
    console.log(`\n⚠ CampaignDays rỗng (có thể do lỗi mạng/API) nhưng file cũ đang có ${prev.campaignDays.length} dòng - DỪNG, không ghi đè để tránh mất dữ liệu.`);
    process.exit(1);
  }
}

// ---- Tai thumbnail ve file tinh (thumbs/<id>.jpg) — URL fbcdn het han nhanh nen luu local de hien thi on dinh ----
const THUMB_DIR = join(__dirname, "marketing-report", "dashboard", "thumbs");
mkdirSync(THUMB_DIR, { recursive: true });
const wantThumb = {};
for (const r of campaignDays) if (r.thumb && r.thumb.startsWith("http")) wantThumb[r.id] = r.thumb;
console.log(`\nTải ${Object.keys(wantThumb).length} thumbnail về thumbs/...`);
const localThumb = {};
let thumbOk = 0, thumbSkip = 0;
for (const [id, url] of Object.entries(wantThumb)) {
  const localPath = join(THUMB_DIR, id + ".jpg");
  if (existsSync(localPath)) {           // da co roi -> dung lai, khong tai lai
    localThumb[id] = "thumbs/" + id + ".jpg";
    thumbSkip++;
    continue;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) continue;
    writeFileSync(localPath, buf);
    localThumb[id] = "thumbs/" + id + ".jpg";
    thumbOk++;
  } catch { /* bo qua anh loi */ }
}
console.log(`  Tải ${thumbOk} mới + dùng lại ${thumbSkip} có sẵn (/${Object.keys(wantThumb).length} tổng)`);
// Gan thumb = duong dan local (rong neu tai that bai)
for (const r of campaignDays) r.thumb = localThumb[r.id] || "";
// Don file cu khong con campaign nao dung
const keep = new Set(Object.values(localThumb).map(p => p.split("/").pop()));
for (const f of readdirSync(THUMB_DIR)) if (f.endsWith(".jpg") && !keep.has(f)) { try { unlinkSync(join(THUMB_DIR, f)); } catch {} }

for (const d of Object.values(daily)) for (const k of Object.keys(d)) d[k] = Math.round(d[k]);

const days = Object.keys(daily).sort();
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), since, until, accounts: cfg.accounts, daily, campaignDays }, null, 2), "utf8");

const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
let fb30 = 0, ig30 = 0, tot30 = 0;
for (const [d, v] of Object.entries(daily)) if (d >= cutoff) { fb30 += v.facebook; ig30 += v.instagram; tot30 += v.total; }
console.log(`\n${days.length} ngày (${days[0]} → ${days[days.length - 1]})`);
console.log(`30 ngày: Facebook ${fb30.toLocaleString("vi-VN")} | Instagram ${ig30.toLocaleString("vi-VN")} | Tổng ${tot30.toLocaleString("vi-VN")} VND`);
console.log(`Đã lưu → ${OUT}`);
