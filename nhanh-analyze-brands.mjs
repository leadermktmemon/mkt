// Phan tich cache de hieu Memon (B2B/si) vs Bemori (online/cua hang) the nao trong du lieu.
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("./marketing-report/dashboard/.cache-raw.json", import.meta.url), "utf8"));
const depots = Object.fromEntries((raw.depots||[]).map(d=>[d.id,d.name]));
const BILL_MODE = {1:"Online giao hàng",2:"Bán lẻ",3:"Chuyển kho",4:"Quà HĐ lẻ",5:"Nhập NCC",6:"Bán sỉ",8:"Kiểm kho",10:"Khác",18:"Quà đơn",19:"mode19"};
const fmt=(n)=>Math.round(n).toLocaleString("vi-VN");
const billAmt=(b)=>b.amount??b.payment?.amount??0;

// 1) trafficSource tren ORDERS
const tf={};
for(const o of raw.orders){ const t=o.channel?.trafficSource||"(trống)"; tf[t]=(tf[t]||0)+1; }
console.log("=== ORDER trafficSource (nguồn) ===");
Object.entries(tf).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${k.padEnd(20)} ${v} đơn`));

// 2) BILL mode -> doanh thu
const mode={};
for(const b of raw.bills){ const m=BILL_MODE[b.mode]||`mode ${b.mode}`; mode[m]??={c:0,r:0}; mode[m].c++; mode[m].r+=billAmt(b); }
console.log("\n=== BILL theo mode ===");
Object.entries(mode).sort((a,b)=>b[1].r-a[1].r).forEach(([k,v])=>console.log(`  ${k.padEnd(16)} ${String(v.c).padStart(6)} HĐ  ${fmt(v.r).padStart(15)}đ`));

// 3) Ban si (mode 6) - khach hang & customerSource
console.log("\n=== BÁN SỈ (mode 6) ===");
const si = raw.bills.filter(b=>b.mode===6);
console.log(`  ${si.length} HĐ, doanh thu ${fmt(si.reduce((s,b)=>s+billAmt(b),0))}đ`);
const siCust={}, siSrc={}, siDepot={};
for(const b of si){
  const c=b.customer?.name||b.customer?.mobile||"(không tên)"; siCust[c]=(siCust[c]||0)+billAmt(b);
  const s=b.customerSource||b.customer?.source||"(?)"; siSrc[JSON.stringify(s)]=(siSrc[JSON.stringify(s)]||0)+1;
  siDepot[depots[b.depotId]||b.depotId]=(siDepot[depots[b.depotId]||b.depotId]||0)+1;
}
console.log("  Top khách sỉ:"); Object.entries(siCust).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>console.log(`    ${k} : ${fmt(v)}đ`));
console.log("  customerSource:", JSON.stringify(siSrc));
console.log("  Theo kho:", JSON.stringify(siDepot));

// 4) Tim chu "Memon" o bat ky dau
console.log("\n=== Tìm 'Memon' / 'Bemori' ===");
const billKeys = raw.bills[0]?JSON.stringify(raw.bills[0]):"";
let memonBills=0, bemoriBills=0;
for(const b of raw.bills){ const s=JSON.stringify(b); if(/memon/i.test(s))memonBills++; if(/bemori/i.test(s))bemoriBills++; }
console.log(`  Bills chứa 'Memon': ${memonBills} | chứa 'Bemori': ${bemoriBills}`);
let memonOrd=0, bemoriOrd=0;
for(const o of raw.orders){ const s=JSON.stringify(o); if(/memon/i.test(s))memonOrd++; if(/bemori/i.test(s))bemoriOrd++; }
console.log(`  Orders chứa 'Memon': ${memonOrd} | chứa 'Bemori': ${bemoriOrd}`);

// 5) customerSource tren ORDERS (xem co phan biet brand)
const oSrc={};
for(const o of raw.orders){ const s=o.customerSource; if(s) oSrc[JSON.stringify(s)]=(oSrc[JSON.stringify(s)]||0)+1; }
console.log("\n=== ORDER customerSource (mẫu) ===");
Object.entries(oSrc).slice(0,15).forEach(([k,v])=>console.log(`  ${k}: ${v}`));

// 6) cac kho (depot)
console.log("\n=== Kho/cửa hàng ===");
Object.entries(depots).forEach(([id,n])=>console.log(`  ${id}: ${n}`));
