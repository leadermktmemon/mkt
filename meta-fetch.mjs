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
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url); const d = await r.json();
    if (d.error) {
      // code 4 = app request limit, 17 = user rate limit, 613 = custom rate limit -> doi roi thu lai
      if (d.error.code === 4 || d.error.code === 17 || d.error.code === 613) {
        console.log(`  Rate limit (code ${d.error.code}), đợi 61s... (lần ${i + 1}/4)`);
        await sleep(61000); continue;
      }
      throw new Error(`${d.error.message} (code ${d.error.code})`);
    }
    return d;
  }
  throw new Error("Hết số lần thử lại (rate limit kéo dài)");
}
async function pages(url) {
  const rows = []; let next = url;
  while (next) { const d = await get(next); rows.push(...(d.data || [])); next = d.paging?.next || null; }
  return rows;
}

const since = "2025-01-01";
const until = new Date().toISOString().slice(0, 10);
// Chi keo lai ~40 ngay gan nhat cho chi phi tai khoan (ngay cu KHONG bao gio doi -> tai su dung
// tu file cu). Truoc day keo lai het 557 ngay moi lan chay -> ton rat nhieu request, gay loi
// "Application request limit reached" khien cac tai khoan sau (PA15) bi mat du lieu.
const DAILY_WINDOW = 40;
const sinceDaily = new Date(Date.now() - DAILY_WINDOW * 86400000).toISOString().slice(0, 10);
const daily = {};
// Nap lai daily cu, GIU cac ngay < sinceDaily (ngoai cua so keo moi)
if (existsSync(OUT)) {
  try {
    const prevDaily = JSON.parse(readFileSync(OUT, "utf8")).daily || {};
    let reused = 0;
    for (const [day, v] of Object.entries(prevDaily)) {
      if (day < sinceDaily) { daily[day] = v; reused++; }
    }
    console.log(`Tái dùng ${reused} ngày chi phí lịch sử (chỉ kéo mới từ ${sinceDaily})`);
  } catch { /* file loi -> keo lai binh thuong */ }
}

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
      time_range: JSON.stringify({ since: sinceDaily, until }),
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

// ---- Buoc 1c: thumbnail + noi dung sang tao theo campaign ----
// CHI goi API cho campaign DANG CHAY (ACTIVE). Campaign da dung thi anh/noi dung khong bao gio
// doi nua -> tai su dung lai tu file cu, khong ton request. Truoc day quet het ~682 creative moi
// lan chay khien Meta chan (rate limit) va anh bi mat.
console.log('\nKéo thumbnail + nội dung quảng cáo (chỉ campaign đang chạy)...');
const campThumb = {};
const campCreative = {};
const campCreativeId = {}; // cid -> creative id, de sau nay xin thumbnail do phan giai cao
const campToken = {}; // cid -> token dung de list no (de goi lai dung quyen truy cap)
// Nap lai anh/noi dung da co tu lan chay truoc (giu cho campaign da dung)
const oldThumb = {}, oldCreative = {};
if (existsSync(OUT)) {
  try {
    const prevRows = JSON.parse(readFileSync(OUT, "utf8")).campaignDays || [];
    for (const r of prevRows) {
      if (r.thumb && !oldThumb[r.id]) oldThumb[r.id] = r.thumb;
      if (r.creative && Object.keys(r.creative).length && !oldCreative[r.id]) oldCreative[r.id] = r.creative;
    }
    console.log(`  Tái dùng ${Object.keys(oldThumb).length} ảnh đã có từ lần chạy trước`);
  } catch { /* file loi -> coi nhu chua co gi */ }
}
const isActive = cid => campStatus[cid]?.status === 'ACTIVE';
async function fetchThumbs(label, grpToken, accounts) {
  for (const acc of accounts) {
    const p = new URLSearchParams({ fields: 'campaign_id,effective_status,creative{id,thumbnail_url,image_url,title,body,call_to_action_type,link_url,object_story_spec{link_data{picture,child_attachments{picture}}}}', limit: '100', access_token: grpToken });
    try {
      const rows = await pages(`${G}/act_${acc.id}/ads?${p}`);
      for (const a of rows) {
        const cid = a.campaign_id, cr = a.creative || {};
        if (!cid) continue;
        // Campaign da dung + da co anh tu lan truoc -> bo qua, khong ton request nang cap anh sau nay
        if (!isActive(cid) && oldThumb[cid]) continue;
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

// LUU Y: buoc nang cap thumbnail 640px da duoc DOI XUONG SAU Buoc 2 (xem "Buoc 2b").
// Ly do: /act_.../ads tra ve MOI campaign trong lich su tai khoan (~682), trong khi bao cao chi
// dung ~100 campaign co chi tieu trong 30 ngay. Nang cap het 682 la lang phi va bi Meta chan.

// ---- Buoc 2: Chi phi theo ngay x campaign (30 ngay, time_increment=1) ----
// CPM (=spend/impressions, deu cong don duoc) la tin hieu chinh phan biet Branding (CPM thap: hien thi rong/re)
// vs Ban hang (CPM cao: tep hep, dat) -> tinh truc tiep o dashboard.
// reach: cong don theo ngay la XAP XI (1 nguoi xem nhieu ngay se bi dem lai nhieu lan), dung de
// tinh Tan suat (impressions/reach) cho biet co lap qua nhieu / tiep can hep khong - khong phai
// reach chinh xac ca ky.
console.log('\nKéo chi tiết chiến dịch theo ngày...');
const campaignDays = [];
const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
// Nap campaignDays cu theo tung tai khoan -> neu 1 tai khoan bi rate limit (code 4), khoi phuc
// du lieu cu cua RIENG tai khoan do thay vi de mat trang (truoc day PA15 bi mat het khi loi).
const oldCampByAcc = {};
if (existsSync(OUT)) {
  try {
    for (const r of (JSON.parse(readFileSync(OUT, "utf8")).campaignDays || [])) {
      (oldCampByAcc[r.account] = oldCampByAcc[r.account] || []).push(r);
    }
  } catch { /* file loi -> bo qua */ }
}
async function fetchCampaignDays(label, grpToken, accounts) {
  for (const acc of accounts) {
    const nBefore = campaignDays.length;
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
        if (!campThumb[row.campaign_id] && !oldThumb[row.campaign_id]) missingThumbCids.add(row.campaign_id);
        campaignDays.push({
          day: row.date_start,
          account: acc.name, bm: label, id: row.campaign_id, name: row.campaign_name,
          status: campStatus[row.campaign_id]?.status || 'UNKNOWN',
          objective: campStatus[row.campaign_id]?.objective || '',
          optGoal: campOpt[row.campaign_id] || '',
          thumb: campThumb[row.campaign_id] || oldThumb[row.campaign_id] || '',
          creative: campCreative[row.campaign_id] || oldCreative[row.campaign_id] || {},
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
          const p2 = new URLSearchParams({ fields: 'id,effective_status,creative{id,thumbnail_url,image_url,title,body,call_to_action_type,link_url,object_story_spec{link_data{picture,child_attachments{picture}}}}', access_token: grpToken });
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
    } catch (e) {
      console.log(`  [CampDays] LỖI ${acc.name}: ${e.message}`);
      // Neu chua push duoc dong nao cho tai khoan nay ma co du lieu cu -> khoi phuc de khong mat trang
      if (campaignDays.length === nBefore && oldCampByAcc[acc.name]?.length) {
        campaignDays.push(...oldCampByAcc[acc.name]);
        console.log(`    → Giữ lại ${oldCampByAcc[acc.name].length} dòng cũ của ${acc.name} (tránh mất dữ liệu)`);
      }
    }
  }
}
for (const g of allGroups) await fetchCampaignDays(g.label, g.token, g.accounts);
campaignDays.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : b.spend - a.spend);
console.log(`CampaignDays: ${campaignDays.length} ngày×campaign (${since30} → ${until})`);

// ---- Buoc 2b: Xin thumbnail do phan giai cao (640px) ----
// Luu y: thumbnail_width/height CHI duoc Meta ton trong khi goi truc tiep node creative
// (/{creative_id}?fields=thumbnail_url&thumbnail_width=..), KHONG hoat dong khi xin qua
// field long "creative{thumbnail_url}" tren edge /ads (da test thuc te, van tra ve p64x64).
// CHI goi cho campaign THUC SU nam trong bao cao 30 ngay VA chua co anh san tu lan chay truoc.
const needHiRes = new Set();
for (const r of campaignDays) {
  if (oldThumb[r.id] && existsSync(join(__dirname, "marketing-report", "dashboard", "thumbs", r.id + ".jpg"))) continue;
  if (campCreativeId[r.id]) needHiRes.add(r.id);
}
console.log(`\nXin thumbnail 640px cho ${needHiRes.size} campaign (bỏ qua ${Object.keys(campCreativeId).length - needHiRes.size} đã có/ngoài kỳ)...`);
let hiResOk = 0, hiResFail = 0;
for (const cid of needHiRes) {
  try {
    const p = new URLSearchParams({ fields: 'thumbnail_url', thumbnail_width: '640', thumbnail_height: '640', access_token: campToken[cid] });
    const r = await fetch(`${G}/${campCreativeId[cid]}?${p}`);
    const d = await r.json();
    if (d.thumbnail_url) { campThumb[cid] = d.thumbnail_url; hiResOk++; } else hiResFail++;
  } catch { hiResFail++; }
}
console.log(`  Nâng cấp ${hiResOk} thumbnail, lỗi ${hiResFail}`);
// Cap nhat lai thumb cho cac dong vua nang cap
for (const r of campaignDays) if (campThumb[r.id]) r.thumb = campThumb[r.id];

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
// Gan thumb = duong dan local. Neu lan nay khong tai gi (campaign da dung, tai su dung anh cu)
// thi giu lai duong dan cu MIEN LA file thuc su con ton tai -> tranh xoa mat anh da co.
for (const r of campaignDays) {
  if (localThumb[r.id]) { r.thumb = localThumb[r.id]; continue; }
  const keep = oldThumb[r.id];
  r.thumb = (keep && !keep.startsWith("http") && existsSync(join(THUMB_DIR, r.id + ".jpg"))) ? keep : "";
}
// Don file cu khong con campaign nao dung.
// QUAN TRONG: phai giu MOI anh dang duoc campaignDays tham chieu (ke ca anh tai su dung tu lan
// chay truoc, khong nam trong localThumb), neu khong se xoa nham anh cu va mat sach.
const keep = new Set([
  ...Object.values(localThumb).map(p => p.split("/").pop()),
  ...campaignDays.filter(r => r.thumb && !r.thumb.startsWith("http")).map(r => r.thumb.split("/").pop()),
]);
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
