// Doi chieu du lieu ORDER cua tôi voi bao cao "Theo kenh ban" cua nhanh (01-14/06, Ho KD Bemori).
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("./marketing-report/dashboard/.cache-raw.json", import.meta.url), "utf8"));
const SALE_CHANNEL={1:"Admin",2:"Website",10:"API",20:"Facebook",21:"Instagram",41:"Lazada",42:"Shopee",43:"Sendo",45:"Tiki",48:"Tiktok Shop",49:"Zalo OA",50:"Shopee chat",51:"Lazada chat",52:"Zalo cá nhân"};
const BAD=[58,61,63,64,68,71,72];
const fmt=(n)=>Math.round(n).toLocaleString("vi-VN");
const orderRev=(o)=>{const p=o.payment??{};return (p.transfer?.amount||0)+(p.credit?.amount||0)+(p.deposit?.amount||0)+(p.codAmount||0)+(p.usedPoints?.amount||0);};
const vnDay=(ts)=>new Date((ts+7*3600)*1000).toISOString().slice(0,10);

// loc 01-14/06 theo gio VN
const orders=raw.orders.filter(o=>{const d=vnDay(o.info.createdAt);return d>="2026-06-01"&&d<="2026-06-14";});

function group(keyFn,excludeCancel){
  const g={}; let tc=0,tr=0;
  for(const o of orders){ if(excludeCancel&&BAD.includes(o.info?.status))continue;
    const k=keyFn(o); g[k]??={c:0,r:0}; g[k].c++; g[k].r+=orderRev(o); tc++; tr+=orderRev(o); }
  return {g,tc,tr};
}
function show(title,res){
  console.log(`\n${title} — Tổng ${res.tc} đơn | ${fmt(res.tr)}đ`);
  Object.entries(res.g).sort((a,b)=>b[1].r-a[1].r).forEach(([k,v])=>console.log(`   ${k.padEnd(16)} ${String(v.c).padStart(4)} đơn | ${fmt(v.r).padStart(13)}đ`));
}

// Key = trafficSource neu co, else saleChannel name
const keyTS = (o)=> o.channel?.trafficSource || SALE_CHANNEL[o.channel?.saleChannel] || `#${o.channel?.saleChannel}`;
show("[Đơn tạo] theo Nguồn (trafficSource||saleChannel)", group(keyTS,false));
show("[Đơn tạo - Hoàn hủy] theo Nguồn", group(keyTS,true));

// So sanh: bao cao nhanh (Đơn tạo): Tổng 397/268.362.225; Khách lẻ 24/38.751.500; FB Bemori 16/10.350.000; Zalo Bemori 15/6.797.500; Web Bemori 2/960.000; Insta Bemori 2/890.000; Website 1/480.000; Admin 60/58.229.000
console.log("\n=== BÁO CÁO NHANH (Đơn tạo) để đối chiếu ===");
console.log("   Tổng 397 | 268.362.225 | Khách lẻ 24/38.751.500 | FB Bemori 16/10.350.000 | Zalo Bemori 15/6.797.500 | Admin 60/58.229.000");

// Online theo kho 230791 vs cua hang (orders)
let onlineC=0,onlineR=0,shopC=0,shopR=0;
for(const o of orders){ if([230213,230786].includes(o.info?.depotId))continue;
  if(o.info?.depotId===230791){onlineC++;onlineR+=orderRev(o);} else {shopC++;shopR+=orderRev(o);} }
console.log(`\nOnline (Kho Online 230791): ${onlineC} đơn | ${fmt(onlineR)}đ`);
console.log(`Cửa hàng (kho khác):        ${shopC} đơn | ${fmt(shopR)}đ`);
