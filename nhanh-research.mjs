// Nghien cuu toan dien du lieu ban hang nhanh.vn: order/list vs bill/list vs bill/retail.
// Muc tieu: hieu cac chieu (loai don, kenh ban, cua hang, si/le) va kiem tra trung lap.

import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(new URL("./nhanh.config.json", import.meta.url), "utf8"));
const depots = JSON.parse(readFileSync(new URL("./nhanh-data/depots.json", import.meta.url), "utf8"));
const depotName = Object.fromEntries(depots.map((d) => [d.id, d.name]));
const BASE = "https://pos.open.nhanh.vn/v3.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SALE_CHANNEL = {1:"Admin",2:"Website",10:"API",20:"Facebook",21:"Instagram",41:"Lazada",42:"Shopee",43:"Sendo",45:"Tiki",48:"Tiktok Shop",49:"Zalo OA",50:"Shopee chat",51:"Lazada chat",52:"Zalo cá nhân"};
const ORDER_TYPE = {1:"Giao tận nhà",2:"Mua tại quầy",3:"Đặt trước",5:"Đổi quà",10:"Báo giá",12:"Đổi SP",14:"Trả hàng",15:"Chuyển kho",16:"Hoàn 1 phần",17:"Đền bù"};
const BILL_MODE = {1:"Giao hàng",2:"Bán lẻ",3:"Chuyển kho",4:"Quà tặng HĐ lẻ",5:"Nhà cung cấp",6:"Bán sỉ",8:"Kiểm kho",10:"Khác",18:"Quà tặng đơn"};

const fmt = (n) => Math.round(n).toLocaleString("vi-VN");
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
      if (/rate limit/i.test(msg) && attempt < 4) { await sleep(3000*(attempt+1)); continue; }
      return { error: msg, items: all };
    }
    const items = data.data ?? [];
    all.push(...items);
    next = data.paginator?.next ?? null;
    if (!items.length || !next) break;
    await sleep(450);
  }
  return { items: all };
}

function tally(map, key, rev) {
  map[key] ??= { count: 0, rev: 0 };
  map[key].count++;
  map[key].rev += rev || 0;
}
function show(title, map) {
  console.log(`\n  ${title}:`);
  for (const [k, v] of Object.entries(map).sort((a,b)=>b[1].rev-a[1].rev)) {
    console.log(`    ${String(k).padEnd(22)} ${String(v.count).padStart(5)} đơn  ${fmt(v.rev).padStart(14)}đ`);
  }
}

const now = Math.floor(Date.now()/1000);
const from = now - 7*86400;
const toDate = ymd(new Date());
const fromDate = ymd(new Date(Date.now() - 7*86400*1000));

// ---------- 1) ORDER/LIST ----------
console.log("==================== ORDER/LIST (7 ngày) ====================");
const orderRev = (o) => { const p=o.payment??{}; return (p.transfer?.amount||0)+(p.credit?.amount||0)+(p.deposit?.amount||0)+(p.codAmount||0)+(p.usedPoints?.amount||0); };
const ord = await callPaged("/order/list", (next) => ({ filters:{createdAtFrom:from,createdAtTo:now}, paginator: next?{size:100,next}:{size:100} }));
if (ord.error) console.log("  LOI:", ord.error);
console.log(`  Tong: ${ord.items.length} don`);
const byType={}, byChan={}, byDepotO={}, byTraffic={};
for (const o of ord.items) {
  const r = orderRev(o);
  tally(byType, ORDER_TYPE[o.info?.type]||`type ${o.info?.type}`, r);
  tally(byChan, SALE_CHANNEL[o.channel?.saleChannel]||`ch ${o.channel?.saleChannel}`, r);
  tally(byDepotO, depotName[o.info?.depotId]||`depot ${o.info?.depotId}`, r);
  tally(byTraffic, o.channel?.trafficSource||"(không rõ)", r);
}
show("Theo LOẠI ĐƠN (type)", byType);
show("Theo KÊNH BÁN (saleChannel)", byChan);
show("Theo NGUỒN (trafficSource)", byTraffic);
show("Theo KHO/CỬA HÀNG (depotId)", byDepotO);

// ---------- 2) BILL/LIST ----------
console.log("\n==================== BILL/LIST (7 ngày) ====================");
const bl = await callPaged("/bill/list", (next) => ({ filters:{fromDate,toDate}, paginator: next?{size:100,next}:{size:100} }));
if (bl.error) console.log("  LOI:", bl.error);
console.log(`  Tong: ${bl.items.length} hóa đơn`);
if (bl.items[0]) console.log("  Keys 1 bill:", Object.keys(bl.items[0]).join(", "));
const byMode={}, byDepotB={}; let withOrder=0, noOrder=0;
for (const b of bl.items) {
  const amt = b.amount ?? b.payment?.amount ?? 0;
  tally(byMode, BILL_MODE[b.mode]||`mode ${b.mode}`, amt);
  tally(byDepotB, depotName[b.depotId]||`depot ${b.depotId}`, amt);
  if (b.orderId && b.orderId>0) withOrder++; else noOrder++;
}
show("Theo MODE (lẻ/sỉ...)", byMode);
show("Theo CỬA HÀNG", byDepotB);
console.log(`  Có orderId (gắn đơn online): ${withOrder} | Không có (bán trực tiếp): ${noOrder}`);

// ---------- 3) BILL/RETAIL ----------
console.log("\n==================== BILL/RETAIL (7 ngày) ====================");
const br = await callPaged("/bill/retail", (next) => ({ filters:{fromDate,toDate}, paginator: next?{size:100,next}:{size:100} }));
if (br.error) console.log("  LOI:", br.error);
console.log(`  Tong: ${br.items.length} hóa đơn bán lẻ`);
if (br.items[0]) console.log("  Keys 1 bill:", Object.keys(br.items[0]).join(", "));
const byDepotR={}; let retailRev=0;
for (const b of br.items) {
  const amt = b.amount ?? b.payment?.amount ?? 0;
  retailRev += amt;
  tally(byDepotR, depotName[b.depotId]||`depot ${b.depotId}`, amt);
}
show("Theo CỬA HÀNG", byDepotR);
console.log(`  Tong doanh thu ban le: ${fmt(retailRev)}đ`);
