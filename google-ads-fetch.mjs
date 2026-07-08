// Keo chi phi quang cao Google Ads (nhieu tai khoan duoi 1 MCC) theo ngay tu Google Ads API.
// Chay: node google-ads-fetch.mjs
// Output: marketing-report/dashboard/google-ads-data.json (doc boi lark-build-data.mjs)
// Dung de tinh ROAS cho nhom "GG Ads" (= Zalo + Web) trong tab Doanh so.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfgPath = join(__dirname, "google.config.json");
if (!existsSync(cfgPath)) { console.log("Không tìm thấy google.config.json — bỏ qua Google Ads fetch."); process.exit(0); }
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const { clientId, clientSecret, refreshToken, developerToken, loginCustomerId, accounts } = cfg;
if (!clientId || !clientSecret || !refreshToken || !developerToken || !loginCustomerId || !accounts?.length) {
  console.log("Thiếu clientId/clientSecret/refreshToken/developerToken/loginCustomerId/accounts trong google.config.json.");
  process.exit(0);
}

const API_VERSION = cfg.apiVersion || "v21";
const OUT = join(__dirname, "marketing-report", "dashboard", "google-ads-data.json");
const noDash = (s) => String(s).replace(/-/g, "");

// ---- Buoc 1: doi refresh token -> access token (het han sau ~1h, sinh moi moi lan chay) ----
async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    refresh_token: refreshToken, grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const d = await r.json();
  if (!d.access_token) throw new Error("Không lấy được access_token: " + JSON.stringify(d));
  return d.access_token;
}

// ---- Buoc 2: GAQL searchStream cho tung tai khoan (chi phi theo ngay, 90 ngay gan nhat) ----
const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const until = new Date().toISOString().slice(0, 10);
const query = `SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`;

async function fetchAccountDaily(accessToken, customerId) {
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${noDash(customerId)}/googleAds:searchStream`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": noDash(loginCustomerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const d = await r.json();
  // Loi cung tra ve dang mang [{error:{...}}] giong ket qua thanh cong [{results:[...]}]
  // -> phai kiem tra key "error" tren tung phan tu, khong the chi dua vao Array.isArray
  if (!r.ok || !Array.isArray(d) || d.some(chunk => chunk.error)) {
    throw new Error(JSON.stringify(d).slice(0, 400));
  }
  const rows = [];
  for (const chunk of d) rows.push(...(chunk.results || []));
  return rows;
}

const daily = {}; // { "YYYY-MM-DD": tong_chi_phi_VND_tat_ca_tai_khoan }
const accessToken = await getAccessToken();

for (const acc of accounts) {
  console.log(`Kéo ${acc.name} (${acc.id})...`);
  try {
    const rows = await fetchAccountDaily(accessToken, acc.id);
    for (const row of rows) {
      const day = row.segments?.date;
      const costMicros = Number(row.metrics?.costMicros || 0);
      if (!day) continue;
      daily[day] = (daily[day] || 0) + costMicros / 1e6; // micros -> don vi tien te tai khoan (gia dinh VND)
    }
    console.log(`  ${rows.length} ngày có dữ liệu`);
  } catch (e) {
    console.log(`  LỖI ${acc.name}: ${e.message}`);
  }
}

for (const day in daily) daily[day] = Math.round(daily[day]);

const data = { generatedAt: new Date().toISOString(), source: "google-ads", daily };
writeFileSync(OUT, JSON.stringify(data, null, 2), "utf8");
console.log(`\nĐã lưu ${Object.keys(daily).length} ngày chi phí Google Ads vào ${OUT}`);
