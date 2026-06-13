// nhanh.vn — Buoc 3: Lay TOAN BO du lieu tren tai khoan
//
// Cach dung:
//   node nhanh-fetch.mjs               -> lay tat ca cac nhom
//   node nhanh-fetch.mjs orders        -> chi 1 nhom
//   node nhanh-fetch.mjs orders products customers
//
// Yeu cau: nhanh.config.json da co accessToken + businessId (chay nhanh-auth.mjs truoc).
// Output: thu muc nhanh-data/<key>.json cho moi nhom du lieu.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "nhanh.config.json"), "utf8"));

for (const k of ["appId", "businessId", "accessToken"]) {
  if (!cfg[k]) {
    console.error(`Thieu "${k}" trong nhanh.config.json. Chay nhanh-auth.mjs truoc.`);
    process.exit(1);
  }
}

const BASE = "https://pos.open.nhanh.vn/v3.0";
const OUT_DIR = join(__dirname, "nhanh-data");
mkdirSync(OUT_DIR, { recursive: true });

// paginated=true: dung con tro paginator.next, lap qua nhieu trang.
// paginated=false: danh muc nho, lay 1 lan.
const ENDPOINTS = {
  // Don hang
  orders:           { path: "/order/list",              paginated: true },
  orderHistory:     { path: "/order/history",           paginated: true },
  orderTags:        { path: "/order/tags",              paginated: false },
  orderSource:      { path: "/order/source",            paginated: false }, // nguon kenh (Facebook/web/san...)
  // San pham
  products:         { path: "/product/list",            paginated: true },
  productCategory:  { path: "/product/category",        paginated: false },
  productInternalCategory: { path: "/product/internalcategory", paginated: false },
  productBrand:     { path: "/product/brand",           paginated: false },
  productTags:      { path: "/product/tags",            paginated: false },
  productCombo:     { path: "/product/combo",           paginated: true },
  // Ton kho
  inventory:        { path: "/product/inventory",       paginated: true },
  // Khach hang
  customers:        { path: "/customer/list",           paginated: true },
  customerTags:     { path: "/customer/tags",           paginated: false },
  // Doanh nghiep
  depots:           { path: "/business/depot",          paginated: false },
  employees:        { path: "/business/user",           paginated: false },
  departments:      { path: "/business/department",     paginated: false },
  suppliers:        { path: "/business/supplier",       paginated: false },
  // Ke toan
  accountingAccounts: { path: "/accounting/account",    paginated: false },
  // Bang gia
  priceLists:       { path: "/promotion/pricelist",     paginated: false },
  priceListProducts:{ path: "/promotion/pricelistproduct", paginated: true },
  // Tra hang
  returns:          { path: "/ecom/return",             paginated: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 450;   // gian nhip giua cac request de khong dinh rate limit
const MAX_RETRY = 4;

async function callApi(path, body) {
  const url = `${BASE}${path}?appId=${encodeURIComponent(cfg.appId)}&businessId=${encodeURIComponent(cfg.businessId)}`;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": cfg.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error(`HTTP ${res.status} - phan hoi khong phai JSON`); }
    if (data.code === 1) {
      await sleep(THROTTLE_MS);
      return data;
    }
    const msg = JSON.stringify(data.messages ?? data);
    // Dinh rate limit -> cho lau hon roi thu lai
    if (/rate limit/i.test(msg) && attempt < MAX_RETRY) {
      const wait = 3000 * (attempt + 1);
      console.log(`    (rate limit, cho ${wait / 1000}s roi thu lai...)`);
      await sleep(wait);
      continue;
    }
    throw new Error(msg);
  }
}

async function fetchResource(name) {
  const { path, paginated } = ENDPOINTS[name];
  if (!paginated) {
    const resp = await callApi(path, { filters: {}, paginator: { size: 100 } });
    const items = resp.data ?? [];
    const rows = Array.isArray(items) ? items : [items];
    console.log(`  [${name}] ${rows.length} ban ghi`);
    return rows;
  }
  // cursor pagination: paginator.next tu response -> request sau
  const all = [];
  let next = null;
  let page = 0;
  do {
    const paginator = { size: 100 };
    if (next) paginator.next = next;
    const resp = await callApi(path, { filters: {}, paginator });
    const items = resp.data ?? [];
    all.push(...items);
    next = resp.paginator?.next ?? null;
    page++;
    console.log(`  [${name}] trang ${page}: +${items.length} (tong ${all.length})`);
    if (!items.length || !next) break;
  } while (true);
  return all;
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENDPOINTS);
const summary = [];

for (const name of wanted) {
  if (!ENDPOINTS[name]) {
    console.error(`Bo qua "${name}" (khong hop le). Chon: ${Object.keys(ENDPOINTS).join(", ")}`);
    continue;
  }
  console.log(`\n=== ${name} (${ENDPOINTS[name].path}) ===`);
  try {
    const rows = await fetchResource(name);
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(rows, null, 2), "utf8");
    summary.push({ nhom: name, so_ban_ghi: rows.length, trang_thai: "OK" });
  } catch (e) {
    console.error(`  LOI: ${e.message}`);
    summary.push({ nhom: name, so_ban_ghi: 0, trang_thai: "LOI: " + e.message });
  }
}

console.log("\n========== TONG KET ==========");
console.table(summary);
console.log(`File luu trong thu muc: nhanh-data/`);
