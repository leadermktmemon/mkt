// Bo tong hop du lieu dashboard MARKETING-FIRST tu nhanh.vn.
// Nguon: order/list (quy nguon marketing cho don online) + bill/list (so cai ban hang - boi canh).
// Xuat: dashboard/data.json + data.js
//
// Chay:
//   node build-data.mjs 30          -> keo API 30 ngay (luu cache raw) + tong hop
//   node build-data.mjs --recompute -> dung cache raw, chi tong hop lai (nhanh, khong goi API)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const cfg = JSON.parse(readFileSync(join(root, "nhanh.config.json"), "utf8"));
const BASE = "https://pos.open.nhanh.vn/v3.0";
let depotName = {}; // se nap qua API (khong phu thuoc file local)
const CACHE = join(__dirname, ".cache-raw.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SALE_CHANNEL = {1:"Admin",2:"Website",10:"API",20:"Facebook",21:"Instagram",41:"Lazada",42:"Shopee",43:"Sendo",45:"Tiki",48:"Tiktok Shop",49:"Zalo OA",50:"Shopee chat",51:"Lazada chat",52:"Zalo cá nhân"};
const SALES_MODE = { 1: "Online", 2: "Cửa hàng", 6: "Sỉ" };
const BAD_STATUS = [58,61,63,64,68,71,72];

const recompute = process.argv.includes("--recompute");
const DAYS = Number(process.argv.find((a) => /^\d+$/.test(a)) || 30);
const ymd = (d) => d.toISOString().slice(0, 10);

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
      if (/rate limit/i.test(msg) && attempt < 4) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`${path}: ${msg}`);
    }
    const items = data.data ?? [];
    all.push(...items);
    process.stdout.write(`\r  ${path}: ${all.length}`);
    next = data.paginator?.next ?? null;
    if (!items.length || !next) break;
    await sleep(450);
  }
  process.stdout.write("\n");
  return all;
}

let raw, period;
if (recompute && existsSync(CACHE)) {
  console.log("Dung cache raw (khong goi API)...");
  raw = JSON.parse(readFileSync(CACHE, "utf8"));
  period = raw.period;
} else {
  const now = Math.floor(Date.now() / 1000);
  const fromTs = now - DAYS * 86400;
  const toDate = ymd(new Date());
  const fromDate = ymd(new Date(Date.now() - DAYS * 86400 * 1000));
  period = { days: DAYS, fromDate, toDate, fromTs, toTs: now };
  console.log(`Keo ${DAYS} ngay (${fromDate} -> ${toDate})...`);
  const depotList = await callPaged("/business/depot", (next) => ({ filters: {}, paginator: next ? { size: 100, next } : { size: 100 } }));
  const bills = await callPaged("/bill/list", (next) => ({ filters: { fromDate, toDate }, paginator: next ? { size: 100, next } : { size: 100 } }));
  const orders = await callPaged("/order/list", (next) => ({ filters: { createdAtFrom: fromTs, createdAtTo: now }, paginator: next ? { size: 100, next } : { size: 100 } }));
  raw = { period, bills, orders, depots: depotList };
  writeFileSync(CACHE, JSON.stringify(raw), "utf8");
  console.log(`  Da cache ${bills.length} bills + ${orders.length} orders + ${depotList.length} depots.`);
}

const { bills, orders } = raw;
depotName = Object.fromEntries((raw.depots || []).map((d) => [d.id, d.name]));
const billAmount = (b) => b.amount ?? b.payment?.amount ?? 0;
const orderRev = (o) => { const p=o.payment??{}; return (p.transfer?.amount||0)+(p.credit?.amount||0)+(p.deposit?.amount||0)+(p.codAmount||0)+(p.usedPoints?.amount||0); };
const brandOf = (name = "") => (/teddy/i.test(name) ? "Teddy" : "Bemori");
function billDay(b){ const d=b.date; if(typeof d==="number") return ymd(new Date(d*1000)); if(typeof d==="string") return d.slice(0,10); return null; }

// ---------- BOI CANH SALES (bill/list) ----------
const byType={}, byStore={}, byBrand={}, byDaySales={};
let totalRev=0, salesCount=0;
for (const b of bills) {
  const type = SALES_MODE[b.mode]; if(!type) continue;
  const amt = billAmount(b); totalRev+=amt; salesCount++;
  byType[type]=(byType[type]||0)+amt;
  const store=depotName[b.depotId]||`Kho ${b.depotId}`;
  byStore[store]=(byStore[store]||0)+amt;
  byBrand[brandOf(store)]=(byBrand[brandOf(store)]||0)+amt;
  const day=billDay(b); if(day) byDaySales[day]=(byDaySales[day]||0)+amt;
}

// ---------- MARKETING (order/list don online) ----------
const ch={}, tf={}, byDayChan={};
let onlineRev=0, onlineOrders=0;
let fbAdsOrders=0, fbAdsRev=0; const fbAdsIds=new Set();
const daySet=new Set();
for (const o of orders) {
  if (BAD_STATUS.includes(o.info?.status)) continue;
  const r=orderRev(o); onlineRev+=r; onlineOrders++;
  const cname=SALE_CHANNEL[o.channel?.saleChannel]||`#${o.channel?.saleChannel}`;
  ch[cname]??={orders:0,revenue:0}; ch[cname].orders++; ch[cname].revenue+=r;
  const t=o.channel?.trafficSource||"(không gắn nguồn)";
  tf[t]??={orders:0,revenue:0}; tf[t].orders++; tf[t].revenue+=r;
  const fid=o.channel?.fbAdsId||0;
  if(fid>0){ fbAdsOrders++; fbAdsRev+=r; fbAdsIds.add(fid); }
  const day=o.info?.createdAt?ymd(new Date(o.info.createdAt*1000)):null;
  if(day){ daySet.add(day); byDayChan[day]??={}; byDayChan[day][cname]=(byDayChan[day][cname]||0)+r; }
}

const round=(n)=>Math.round(n);
const sortRev=(obj)=>Object.entries(obj).sort((a,b)=>b[1].revenue-a[1].revenue);
const channels = sortRev(ch).map(([name,v])=>({name,orders:v.orders,revenue:round(v.revenue),aov:round(v.revenue/v.orders),share:round(v.revenue/onlineRev*100)}));
const traffic  = sortRev(tf).map(([name,v])=>({name,orders:v.orders,revenue:round(v.revenue),aov:round(v.revenue/v.orders),share:round(v.revenue/onlineRev*100)}));

// Trend: top 5 kenh theo doanh thu, con lai gop "Khác"
const days=[...daySet].sort();
const top5=channels.slice(0,5).map(c=>c.name);
const trend={ days, series: top5.map(name=>({name, data: days.map(d=>round((byDayChan[d]||{})[name]||0))})) };
const otherSeries={ name:"Khác", data: days.map(d=>{ const m=byDayChan[d]||{}; let s=0; for(const k in m) if(!top5.includes(k)) s+=m[k]; return round(s); }) };
if (otherSeries.data.some(v=>v>0)) trend.series.push(otherSeries);

const sortObj=(o)=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
const data = {
  generatedAt: new Date().toISOString(),
  period: { days: period.days, fromDate: period.fromDate, toDate: period.toDate },
  marketing: {
    onlineRevenue: round(onlineRev),
    onlineOrders,
    onlineAov: onlineOrders?round(onlineRev/onlineOrders):0,
    channels, traffic, trend,
    fbAds: { orders: fbAdsOrders, revenue: round(fbAdsRev), ads: fbAdsIds.size,
             orderShare: onlineOrders?round(fbAdsOrders/onlineOrders*100):0 },
  },
  sales: {
    totalRevenue: round(totalRev), salesCount,
    aov: salesCount?round(totalRev/salesCount):0,
    byType: Object.fromEntries(Object.entries(byType).map(([k,v])=>[k,round(v)])),
    byBrand: Object.fromEntries(Object.entries(byBrand).map(([k,v])=>[k,round(v)])),
    byStore: sortObj(byStore).map(([name,rev])=>({name,rev:round(rev)})),
    byDay: Object.entries(byDaySales).sort((a,b)=>a[0].localeCompare(b[0])).map(([day,rev])=>({day,rev:round(rev)})),
    onlinePct: totalRev?round((byType["Online"]||0)/totalRev*100):0,
    storePct: totalRev?round((byType["Cửa hàng"]||0)/totalRev*100):0,
  },
};

writeFileSync(join(__dirname, "data.json"), JSON.stringify(data, null, 2), "utf8");
writeFileSync(join(__dirname, "data.js"), `window.DASHBOARD_DATA=${JSON.stringify(data)};`, "utf8");

console.log("\n=== MARKETING ===");
console.log(`Doanh thu online: ${data.marketing.onlineRevenue.toLocaleString("vi-VN")}đ | ${onlineOrders} đơn | AOV ${data.marketing.onlineAov.toLocaleString("vi-VN")}đ`);
console.log("Theo kênh:"); channels.forEach(c=>console.log(`  ${c.name.padEnd(14)} ${c.orders} đơn  ${c.revenue.toLocaleString("vi-VN")}đ  (${c.share}%)`));
console.log(`Đơn từ FB Ads: ${fbAdsOrders} đơn / ${fbAdsRev.toLocaleString("vi-VN")}đ / ${fbAdsIds.size} mẫu QC`);
console.log("\nĐã lưu data.json + data.js");
