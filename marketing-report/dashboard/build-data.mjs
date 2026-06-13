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
function ensureDay(day){ return dayMap[day] ??= { bemori:{}, memonRev:0, storeRetail:{}, salesRev:0, salesCount:0, channel:{}, mktRev:0, mktOrders:0 }; }
const memonBills = []; // {day, customer, amount} - ban ra ngoai cua Xuong Memon

for (const b of bills) {
  const type = TYPE_OF[b.mode]; if (!type) continue;  // chi tinh ban cho khach (mode 1,2,6); bo nhap NCC/chuyen kho/dieu chinh ton
  const day = billDay(b); if (!day) continue;
  const amt = billAmount(b);
  const D = ensureDay(day);
  D.salesRev += amt; D.salesCount++;
  if (MEMON_DEPOTS.has(b.depotId)) { // Xuong Memon ban ra ngoai
    D.memonRev += amt;
    memonBills.push({ day, customer: (b.customer?.name || b.customer?.mobile || "(không tên)").replace(/&amp;/g,"&"), amount: round(amt) });
  } else { // Bemori (online + cua hang)
    D.bemori[type] = (D.bemori[type]||0) + amt;
    if (b.mode === 2) {
      const store = depotName[b.depotId] || `Kho ${b.depotId}`;
      D.storeRetail[store] = (D.storeRetail[store]||0) + amt;
    }
  }
}
for (const o of orders) {
  if (BAD_STATUS.includes(o.info?.status)) continue;
  const day = o.info?.createdAt ? dayOf(o.info.createdAt) : null; if (!day) continue;
  const r = orderRev(o);
  const D = ensureDay(day);
  const cname = SALE_CHANNEL[o.channel?.saleChannel] || `#${o.channel?.saleChannel}`;
  D.channel[cname] ??= { rev:0, orders:0 };
  D.channel[cname].rev += r; D.channel[cname].orders++;
  D.mktRev += r; D.mktOrders++;
}

const days = Object.keys(dayMap).sort();
const channelTotals = {}, storeTotals = {};
const roundObj = (o) => Object.fromEntries(Object.entries(o).map(([k,v])=>[k,round(v)]));
const daily = days.map((day) => {
  const D = dayMap[day];
  for (const k in D.channel) channelTotals[k] = (channelTotals[k]||0) + D.channel[k].rev;
  for (const k in D.storeRetail) storeTotals[k] = (storeTotals[k]||0) + D.storeRetail[k];
  return {
    day,
    salesRev: round(D.salesRev), salesCount: D.salesCount,
    bemori: roundObj(D.bemori),          // {Online, Cửa hàng, Sỉ} tai cac kho Bemori
    memonRev: round(D.memonRev),         // Xuong Memon ban ra ngoai
    storeRetail: roundObj(D.storeRetail),
    mktRev: round(D.mktRev), mktOrders: D.mktOrders,
    channel: Object.fromEntries(Object.entries(D.channel).map(([k,v])=>[k,{rev:round(v.rev),orders:v.orders}])),
  };
});
const channels = Object.entries(channelTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);
const stores = Object.entries(storeTotals).sort((a,b)=>b[1]-a[1]).map(([n])=>n);

// ----- Tong hop 30 ngay (cho the Lark) -----
function summarize(slice) {
  const ch = {}, type = {}; let onlineRev=0, onlineOrders=0, totalRev=0, salesCount=0, memon=0;
  for (const d of slice) {
    for (const k in d.channel) { ch[k]??={revenue:0,orders:0}; ch[k].revenue+=d.channel[k].rev; ch[k].orders+=d.channel[k].orders; }
    for (const k in d.bemori) type[k]=(type[k]||0)+d.bemori[k];
    memon += d.memonRev;
    onlineRev+=d.mktRev; onlineOrders+=d.mktOrders; totalRev+=d.salesRev; salesCount+=d.salesCount;
  }
  const chList = Object.entries(ch).sort((a,b)=>b[1].revenue-a[1].revenue)
    .map(([name,v])=>({name,orders:v.orders,revenue:round(v.revenue),aov:v.orders?round(v.revenue/v.orders):0,share:onlineRev?round(v.revenue/onlineRev*100):0}));
  const bemori = (type["Online"]||0)+(type["Cửa hàng"]||0)+(type["Sỉ"]||0);
  return {
    marketing: { onlineRevenue:round(onlineRev), onlineOrders, onlineAov:onlineOrders?round(onlineRev/onlineOrders):0, channels:chList },
    sales: { totalRevenue:round(totalRev), salesCount, byType:Object.fromEntries(Object.entries(type).map(([k,v])=>[k,round(v)])),
      onlinePct: bemori?round((type["Online"]||0)/bemori*100):0, storePct: bemori?round((type["Cửa hàng"]||0)/bemori*100):0 },
    brands: { Bemori: round(bemori), Memon: round(memon) },
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
