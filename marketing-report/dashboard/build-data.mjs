// Tong hop du lieu dashboard 2 NHANH (Bemori / Memon), theo tung NGAY, toi 1 nam.
//   Bemori = bill mode 1 (Online) + mode 2 (Cửa hàng)
//   Memon  = bill mode 6 (Sỉ / B2B)
// Marketing kenh (FB/Zalo/Insta/Web/Shopee) = don online Bemori (order/list).
//
// Chay:
//   node build-data.mjs 365         -> keo tat ca (toi 365 ngay) + tong hop
//   node build-data.mjs --recompute -> dung cache, tong hop lai (nhanh)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const cfg = JSON.parse(readFileSync(join(root, "nhanh.config.json"), "utf8"));
const BASE = "https://pos.open.nhanh.vn/v3.0";
const CACHE = join(__dirname, ".cache-raw.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SALE_CHANNEL = {1:"Admin",2:"Website",10:"API",20:"Facebook",21:"Instagram",41:"Lazada",42:"Shopee",43:"Sendo",45:"Tiki",48:"Tiktok Shop",49:"Zalo OA",50:"Shopee chat",51:"Lazada chat",52:"Zalo cá nhân"};
// mode ban hang (ban cho khach) -> loai
const TYPE_OF = { 1: "Online", 2: "Cửa hàng", 6: "Sỉ" };
// Phap nhan tach theo KHO: Xưởng Memon = kho 230213 / 230786; con lai = Bemori
const MEMON_DEPOTS = new Set([230213, 230786]);
// Bemori: Online = kho Nguyen Khuyen (230791); con lai = Cua hang
const ONLINE_DEPOT = 230791;
const BAD_STATUS = [58,61,63,64,68,71,72];

const recompute = process.argv.includes("--recompute");
const DAYS = Number(process.argv.find((a) => /^\d+$/.test(a)) || 365);
const ymd = (d) => d.toISOString().slice(0, 10);
const dayOf = (ts) => ymd(new Date(ts * 1000));

async function callPaged(path, makeBody) {
  const all = [];
  let next = null;
  while (true) {
    let data;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}${path}?appId=${cfg.appId}&businessId=${cfg.businessId}`, {
        method: "POST",
        headers: { Authorization: cfg.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify(makeBody(next)),
      });
      data = await res.json();
      if (data.code === 1) break;
      const msg = JSON.stringify(data.messages ?? data);
      if (/rate limit/i.test(msg) && attempt < 5) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`${path}: ${msg}`);
    }
    const items = data.data ?? [];
    all.push(...items);
    process.stdout.write(`\r  ${path}: ${all.length}   `);
    next = data.paginator?.next ?? null;
    if (!items.length || !next) break;
    await sleep(450);
  }
  return all;
}

async function fetchBillsChunked(fromDate, toDate) {
  const all = [];
  let s = new Date(fromDate + "T00:00:00Z");
  const end = new Date(toDate + "T00:00:00Z");
  while (s <= end) {
    let e = new Date(s); e.setUTCDate(e.getUTCDate() + 29);
    if (e > end) e = end;
    const part = await callPaged("/bill/list", (next) => ({ filters: { fromDate: ymd(s), toDate: ymd(e) }, paginator: next ? { size: 100, next } : { size: 100 } }));
    all.push(...part);
    s = new Date(e); s.setUTCDate(s.getUTCDate() + 1);
  }
  return all;
}
async function fetchOrdersChunked(fromTs, toTs) {
  const all = [];
  let s = fromTs;
  while (s <= toTs) {
    const e = Math.min(s + 30 * 86400, toTs);
    const part = await callPaged("/order/list", (next) => ({ filters: { createdAtFrom: s, createdAtTo: e }, paginator: next ? { size: 100, next } : { size: 100 } }));
    all.push(...part);
    s = e + 1;
  }
  return all;
}

let raw, period;
if (recompute && existsSync(CACHE)) {
  console.log("Dung cache raw...");
  raw = JSON.parse(readFileSync(CACHE, "utf8"));
  period = raw.period;
} else {
  const now = Math.floor(Date.now() / 1000);
  const fromTs = now - DAYS * 86400;
  const toDate = ymd(new Date());
  const fromDate = ymd(new Date(Date.now() - DAYS * 86400 * 1000));
  period = { days: DAYS, fromDate, toDate, fromTs, toTs: now };
  console.log(`Keo toi ${DAYS} ngay (${fromDate} -> ${toDate})...`);
  const depots = await callPaged("/business/depot", (next) => ({ filters: {}, paginator: next ? { size: 100, next } : { size: 100 } }));
  const bills = await fetchBillsChunked(fromDate, toDate);
  const orders = await fetchOrdersChunked(fromTs, now);
  raw = { period, depots, bills, orders };
  writeFileSync(CACHE, JSON.stringify(raw), "utf8");
  console.log(`\n  Cache: ${bills.length} bills + ${orders.length} orders + ${depots.length} depots.`);
}

const { bills, orders } = raw;
const depotName = Object.fromEntries((raw.depots || []).map((d) => [d.id, d.name]));
const billAmount = (b) => b.amount ?? b.payment?.amount ?? 0;
const orderRev = (o) => { const p=o.payment??{}; return (p.transfer?.amount||0)+(p.credit?.amount||0)+(p.deposit?.amount||0)+(p.codAmount||0)+(p.usedPoints?.amount||0); };
function billDay(b){ const d=b.date; if(typeof d==="number") return dayOf(d); if(typeof d==="string") return d.slice(0,10); return null; }
const round = (n) => Math.round(n);

const dayMap = {};
function ensureDay(day){ return dayMap[day] ??= { online:{}, onlineRev:0, onlineOrders:0, store:{}, storeRev:0, memonRev:0 }; }
const memonBills = []; // {day, customer, amount} - ban ra ngoai cua Xuong Memon

// BILLS: Cua hang = ban le mode 2 (bao cao "Ban Le - Theo Cua Hang"); Memon = ban tai kho Xuong
for (const b of bills) {
  if (![1,2,6].includes(b.mode)) continue;  // chi ban cho khach
  const day = billDay(b); if (!day) continue;
  const amt = billAmount(b);
  const D = ensureDay(day);
  if (MEMON_DEPOTS.has(b.depotId)) { // Xuong Memon (B2B/si)
    D.memonRev += amt;
    memonBills.push({ day, customer: (b.customer?.name || b.customer?.mobile || "(không tên)").replace(/&amp;/g,"&"), amount: round(amt) });
  } else if (b.mode === 2) { // ban le tai cua hang theo shop
    const store = depotName[b.depotId] || `Kho ${b.depotId}`;
    D.store[store] = (D.store[store]||0) + amt;
    D.storeRev += amt;
  }
  // mode 1 (Online giao hang) bo qua: Online tinh tu ORDER (gom moi kho, khop "bao cao theo kenh")
}
// ORDERS: Online = toan bo don online theo nguon (moi kho), khop "Bao cao theo kenh ban"
for (const o of orders) {
  if (BAD_STATUS.includes(o.info?.status)) continue;
  if (MEMON_DEPOTS.has(o.info?.depotId)) continue;
  const day = o.info?.createdAt ? dayOf(o.info.createdAt) : null; if (!day) continue;
  const r = orderRev(o);
  const D = ensureDay(day);
  const cname = o.channel?.trafficSource || SALE_CHANNEL[o.channel?.saleChannel] || `#${o.channel?.saleChannel}`;
  D.online[cname] ??= { rev:0, orders:0 };
  D.online[cname].rev += r; D.online[cname].orders++;
  D.onlineRev += r; D.onlineOrders++;
}

const days = Object.keys(dayMap).sort();
const channelTotals = {}, storeTotals = {};
const roundObj = (o) => Object.fromEntries(Object.entries(o).map(([k,v])=>[k,round(v)]));
const roundChan = (o) => Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{rev:round(v.rev),orders:v.orders}]));
const daily = days.map((day) => {
  const D = dayMap[day];
  for (const k in D.online) channelTotals[k] = (channelTotals[k]||0) + D.online[k].rev;
  for (const k in D.store) storeTotals[k] = (storeTotals[k]||0) + D.store[k];
  return {
    day,
    online: roundChan(D.online), onlineRev: round(D.onlineRev), onlineOrders: D.onlineOrders, // Online theo nguon (don)
    store: roundObj(D.store), storeRev: round(D.storeRev),   // Cua hang ban le theo shop
    memonRev: round(D.memonRev),
  };
});
const channels = Object.entries(channelTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);
const stores = Object.entries(storeTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);

// ----- Tong hop 30 ngay (cho the Lark) -----
function summarize(slice) {
  const ch = {}; let onlineRev=0, onlineOrders=0, storeRev=0, memon=0;
  for (const d of slice) {
    for (const k in d.online) { ch[k]??={revenue:0,orders:0}; ch[k].revenue+=d.online[k].rev; ch[k].orders+=d.online[k].orders; }
    onlineRev+=d.onlineRev; onlineOrders+=d.onlineOrders; storeRev+=d.storeRev; memon+=d.memonRev;
  }
  const chList = Object.entries(ch).sort((a,b)=>b[1].revenue-a[1].revenue)
    .map(([name,v])=>({name,orders:v.orders,revenue:round(v.revenue),aov:v.orders?round(v.revenue/v.orders):0,share:onlineRev?round(v.revenue/onlineRev*100):0}));
  const total = onlineRev + storeRev;
  return {
    marketing: { onlineRevenue:round(onlineRev), onlineOrders, onlineAov:onlineOrders?round(onlineRev/onlineOrders):0, channels:chList },
    sales: { totalRevenue:round(total), salesCount:onlineOrders, byType:{Online:round(onlineRev),"Cửa hàng":round(storeRev)},
      onlinePct: total?round(onlineRev/total*100):0, storePct: total?round(storeRev/total*100):0 },
    brands: { Bemori: round(total), Memon: round(memon) },
  };
}
const sum30 = summarize(daily.slice(-30));

const data = {
  generatedAt: new Date().toISOString(),
  period: { days: period.days, fromDate: period.fromDate, toDate: period.toDate },
  channels, stores,
  daily,
  memonBills,
  marketing: sum30.marketing,
  sales: sum30.sales,
  brands: sum30.brands,
};

writeFileSync(join(__dirname, "data.json"), JSON.stringify(data, null, 2), "utf8");
writeFileSync(join(__dirname, "data.js"), `window.DASHBOARD_DATA=${JSON.stringify(data)};`, "utf8");

console.log(`\n=== ${daily.length} ngày (${days[0]} → ${days[days.length-1]}) ===`);
console.log(`30 ngày — Bemori ${sum30.brands.Bemori.toLocaleString("vi-VN")}đ | Memon(B2B) ${sum30.brands.Memon.toLocaleString("vi-VN")}đ`);
console.log(`Khách B2B (mode 6): ${memonBills.length} HĐ trong toàn kỳ`);
console.log("Đã lưu data.json + data.js");
