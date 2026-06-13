import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("./marketing-report/dashboard/.cache-raw.json", import.meta.url), "utf8"));
const fmt=(n)=>Math.round(n).toLocaleString("vi-VN");
const amt=(b)=>b.amount??b.payment?.amount??0;
const MODE={1:"Online",2:"Bán lẻ",3:"Chuyển kho",4:"Quà lẻ",5:"Nhập NCC",6:"Bán sỉ",8:"Kiểm kho",10:"Khác",18:"Quà đơn",19:"m19"};
const MEMON_DEPOTS=new Set([230213,230786]);

// 1) Tai kho 230213 (Memon): breakdown theo mode
console.log("=== Kho 230213 (nghi Memon) — theo mode ===");
const m={};
for(const b of raw.bills){ if(b.depotId!==230213) continue; m[b.mode]??={c:0,r:0,cust:0}; m[b.mode].c++; m[b.mode].r+=amt(b); if(b.customer?.id>0)m[b.mode].cust++; }
Object.entries(m).sort((a,b)=>b[1].r-a[1].r).forEach(([k,v])=>console.log(`  ${(MODE[k]||k).padEnd(11)} ${String(v.c).padStart(4)} HĐ  ${fmt(v.r).padStart(15)}đ  (có khách thật: ${v.cust})`));

// 2) Mode 10 "Khác" — o dau, ban cho ai
console.log("\n=== Mode 10 'Khác' (8.2 tỷ) — chi tiết ===");
const khac=raw.bills.filter(b=>b.mode===10);
const byDepot={}; let withCust=0;
for(const b of khac){ byDepot[b.depotId]=(byDepot[b.depotId]||0)+amt(b); if(b.customer?.id>0)withCust++; }
console.log("  Theo depot:", Object.entries(byDepot).map(([d,r])=>`${d}:${fmt(r)}`).join(" | "));
console.log("  Số HĐ có khách thật:", withCust, "/", khac.length);
console.log("  Mẫu:", JSON.stringify({depot:khac[0].depotId,date:khac[0].date,cust:khac[0].customer,desc:khac[0].description,amt:amt(khac[0]),prodCount:khac[0].products?.length}));

// 3) Tach theo PHAP NHAN (depot): Memon vs Bemori, chi tinh SALES modes (1,2,6)
console.log("\n=== Doanh thu KHÁCH HÀNG (mode 1,2,6) theo pháp nhân — 81 ngày ===");
let memon=0, bemori=0, memonC=0, bemoriC=0;
for(const b of raw.bills){ if(![1,2,6].includes(b.mode)) continue; const a=amt(b);
  if(MEMON_DEPOTS.has(b.depotId)){memon+=a;memonC++;} else {bemori+=a;bemoriC++;} }
console.log(`  Memon (kho ${[...MEMON_DEPOTS].join(",")}): ${fmt(memon)}đ  (${memonC} HĐ)`);
console.log(`  Bemori (các kho còn lại):        ${fmt(bemori)}đ  (${bemoriC} HĐ)`);

// 4) Chuyen kho (mode 3) tu Memon -> Bemori (noi bo, gia tri hang Xuong cung cap)
console.log("\n=== Chuyển kho (mode 3) phát từ kho 230213 (Xưởng cấp hàng cho Bemori) ===");
let xferFromMemon=0,xferTotal=0;
for(const b of raw.bills){ if(b.mode!==3)continue; xferTotal+=amt(b); if(b.depotId===230213)xferFromMemon+=amt(b); }
console.log(`  Tổng chuyển kho: ${fmt(xferTotal)}đ | Phát từ Xưởng 230213: ${fmt(xferFromMemon)}đ`);

// 5) Nhap NCC tai 230213 (mua nguyen lieu/hang ve Xuong) - la CHI PHI, khong phai doanh thu
let ncc=0; for(const b of raw.bills){ if(b.mode===5&&b.depotId===230213)ncc+=amt(b); }
console.log(`  Nhập NCC tại Xưởng 230213 (chi phí nhập, KHÔNG phải doanh thu): ${fmt(ncc)}đ`);
