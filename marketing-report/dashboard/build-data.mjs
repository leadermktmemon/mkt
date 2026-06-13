// Bo tong hop du lieu dashboard MARKETING-first, co du lieu THEO TUNG NGAY (90 ngay)
// de dashboard loc theo ngay/tuan/thang phia client.
// Nguon: order/list (marketing theo kenh) + bill/list (so cai ban hang).
//
// Chay:
//   node build-data.mjs 90          -> keo API 90 ngay (cache raw) + tong hop
//   node build-data.mjs --recompute -> dung cache, chi tong hop lai (nhanh)

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
const SALES_MODE = { 1: "Online", 2: "Cửa hàng", 6: "Sỉ" };
const BAD_STATUS = [58,61,63,64,68,71,72];

const recompute = process.argv.includes("--recompute");
const DAYS = Number(process.argv.find((a) => /^\d+$/.test(a)) || 90);
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

// bill/list gioi han 31 ngay -> chia cua so 30 ngay
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

// order/list cung gioi han 31 ngay -> chia cua so 30 ngay (theo timestamp giay)
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
  console.log(`Keo ${DAYS} ngay (${fromDate} -> ${toDate})...`);
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

// ----- Xay dung map theo NGAY -----
const dayMap = {}; // day -> { type:{}, store:{}, salesRev, salesCount, channel:{name:{rev,orders}}, mktRev, mktOrders }
function ensureDay(day){ return dayMap[day] ??= { type:{}, store:{}, salesRev:0, salesCount:0, channel:{}, mktRev:0, mktOrders:0 }; }

for (const b of bills) {
  const type = SALES_MODE[b.mode]; if (!type) continue;
  const day = billDay(b); if (!day) continue;
  const amt = billAmount(b);
  const D = ensureDay(day);
  D.type[type] = (D.type[type]||0) + amt;
  const store = depotName[b.depotId] || `Kho ${b.depotId}`;
  D.store[store] = (D.store[store]||0) + amt;
  D.salesRev += amt; D.salesCount++;
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

// Danh sach ngay lien tuc + tong hop cac danh sach kenh/cua hang
const days = Object.keys(dayMap).sort();
const channelTotals = {}, storeTotals = {};
const daily = days.map((day) => {
  const D = dayMap[day];
  for (const k in D.channel) channelTotals[k] = (channelTotals[k]||0) + D.channel[k].rev;
  for (const k in D.store) storeTotals[k] = (storeTotals[k]||0) + D.store[k];
  return {
    day,
    salesRev: round(D.salesRev), salesCount: D.salesCount,
    type: Object.fromEntries(Object.entries(D.type).map(([k,v])=>[k,round(v)])),
    store: Object.fromEntries(Object.entries(D.store).map(([k,v])=>[k,round(v)])),
    mktRev: round(D.mktRev), mktOrders: D.mktOrders,
    channel: Object.fromEntries(Object.entries(D.channel).map(([k,v])=>[k,{rev:round(v.rev),orders:v.orders}])),
  };
});
const channels = Object.entries(channelTotals).sort((a,b)=>b[1]-a[1]).map(([name])=>name);
const stores = Object.entries(storeTotals).sort((a,b)=>b[1]-a[1]).map(([name])=>name);

// ----- Tong hop 30 ngay gan nhat (cho the Lark + view mac dinh) -----
function summarize(slice) {
  const ch = {}, type = {}; let onlineRev=0, onlineOrders=0, totalRev=0, salesCount=0;
  for (const d of slice) {
    for (const k in d.channel) { ch[k]??={revenue:0,orders:0}; ch[k].revenue+=d.channel[k].rev; ch[k].orders+=d.channel[k].orders; }
    for (const k in d.type) type[k]=(type[k]||0)+d.type[k];
    onlineRev+=d.mktRev; onlineOrders+=d.mktOrders; totalRev+=d.salesRev; salesCount+=d.salesCount;
  }
  const chList = Object.entries(ch).sort((a,b)=>b[1].revenue-a[1].revenue)
    .map(([name,v])=>({name,orders:v.orders,revenue:round(v.revenue),aov:v.orders?round(v.revenue/v.orders):0,share:onlineRev?round(v.revenue/onlineRev*100):0}));
  return {
    marketing: { onlineRevenue:round(onlineRev), onlineOrders, onlineAov:onlineOrders?round(onlineRev/onlineOrders):0, channels:chList },
    sales: { totalRevenue:round(totalRev), salesCount, byType:Object.fromEntries(Object.entries(type).map(([k,v])=>[k,round(v)])),
      onlinePct: totalRev?round((type["Online"]||0)/totalRev*100):0, storePct: totalRev?round((type["Cửa hàng"]||0)/totalRev*100):0 },
  };
}
const last30 = daily.slice(-30);
const sum30 = summarize(last30);

const data = {
  generatedAt: new Date().toISOString(),
  period: { days: period.days, fromDate: period.fromDate, toDate: period.toDate },
  channels, stores,
  daily,
  marketing: sum30.marketing,  // 30 ngay (cho the Lark)
  sales: sum30.sales,
};

writeFileSync(join(__dirname, "data.json"), JSON.stringify(data, null, 2), "utf8");
writeFileSync(join(__dirname, "data.js"), `window.DASHBOARD_DATA=${JSON.stringify(data)};`, "utf8");

console.log(`\n=== ${daily.length} ngày dữ liệu (${days[0]} → ${days[days.length-1]}) ===`);
console.log(`30 ngày gần nhất — Online ${sum30.marketing.onlineRevenue.toLocaleString("vi-VN")}đ | ${sum30.marketing.onlineOrders} đơn`);
console.log(`Kênh: ${channels.join(", ")}`);
console.log("Đã lưu data.json + data.js");
