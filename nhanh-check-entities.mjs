// Kiem tra: 2 phap nhan (Xuong Memon vs Ho KD Bemori) phan biet bang gi?
// + Kiem tra do chinh xac tong doanh thu.
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("./marketing-report/dashboard/.cache-raw.json", import.meta.url), "utf8"));
const depotName = Object.fromEntries((raw.depots||[]).map(d=>[d.id,d.name]));
const fmt=(n)=>Math.round(n).toLocaleString("vi-VN");
const billAmt=(b)=>b.amount??b.payment?.amount??0;
const MODE={1:"Online",2:"Bán lẻ",3:"Chuyển kho",4:"Quà lẻ",5:"Nhập NCC",6:"Bán sỉ",8:"Kiểm kho",10:"Khác",18:"Quà đơn",19:"m19"};

// 1) Danh sach depot tu /business/depot
console.log("=== /business/depot trả về", raw.depots.length, "kho ===");
raw.depots.forEach(d=>console.log(`  ${d.id}: ${d.name}`));

// 2) TAT CA depotId xuat hien trong bills (moi mode) + doanh thu
console.log("\n=== Tất cả depotId trong BILLS (mọi mode) ===");
const dep={};
for(const b of raw.bills){ const id=b.depotId; dep[id]??={c:0,r:0,modes:{}}; dep[id].c++; dep[id].r+=billAmt(b); dep[id].modes[b.mode]=(dep[id].modes[b.mode]||0)+1; }
Object.entries(dep).sort((a,b)=>b[1].r-a[1].r).forEach(([id,v])=>{
  const inList = depotName[id]?depotName[id]:"*** KHÔNG có trong /business/depot ***";
  console.log(`  ${id} | ${String(v.c).padStart(5)} HĐ | ${fmt(v.r).padStart(15)}đ | ${inList}`);
});

// 3) Soi 1 bill o depot la (khong co trong list) de tim ten phap nhan/xuong
const unknownIds = Object.keys(dep).filter(id=>!depotName[id]);
console.log("\n=== Depot KHÔNG có tên (nghi là Memon/Xưởng):", unknownIds.join(", "), "===");
for(const id of unknownIds.slice(0,2)){
  const sample = raw.bills.find(b=>String(b.depotId)===String(id));
  console.log(`\n  --- Mẫu bill ở depot ${id} ---`);
  console.log("  keys:", Object.keys(sample).join(", "));
  console.log("  depotId:", sample.depotId, "| mode:", MODE[sample.mode], "| date:", sample.date);
  console.log("  customer:", JSON.stringify(sample.customer));
  console.log("  created:", JSON.stringify(sample.created));
  console.log("  sale:", JSON.stringify(sample.sale));
}

// 4) Tim chu khoa phap nhan o bat ky dau trong bill/order
console.log("\n=== Tìm 'Xưởng' / 'Hộ kinh doanh' / 'Memon' ===");
function scan(arr,name){ let xuong=0,hkd=0,memon=0;
  for(const x of arr){ const s=JSON.stringify(x); if(/xưởng|xuong/i.test(s))xuong++; if(/hộ kinh doanh|ho kinh doanh/i.test(s))hkd++; if(/memon/i.test(s))memon++; }
  console.log(`  ${name}: 'Xưởng'=${xuong} | 'Hộ kinh doanh'=${hkd} | 'Memon'=${memon}`); }
scan(raw.bills,"bills"); scan(raw.orders,"orders");

// 5) Kiem tra do chinh xac: tong theo mode (sales modes)
console.log("\n=== Tổng doanh thu theo mode (toàn 81 ngày) ===");
const m={};
for(const b of raw.bills){ m[b.mode]??={c:0,r:0}; m[b.mode].c++; m[b.mode].r+=billAmt(b); }
Object.entries(m).sort((a,b)=>b[1].r-a[1].r).forEach(([k,v])=>console.log(`  ${(MODE[k]||k).padEnd(12)} ${String(v.c).padStart(6)} HĐ  ${fmt(v.r).padStart(15)}đ`));

// 6) Kiem tra field 'amount' vs payment tong (sanity)
console.log("\n=== Sanity: amount vs payment ===");
const s2=raw.bills.find(b=>b.mode===2);
console.log("  1 bill bán lẻ — amount:", s2?.amount, "| payment:", JSON.stringify(s2?.payment));
