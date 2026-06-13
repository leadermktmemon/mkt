// Tong hop doanh so theo NGUON KENH tu nhanh.vn (du lieu that).
//
// Chay:
//   node nhanh-sales-summary.mjs          -> 7 ngay gan nhat
//   node nhanh-sales-summary.mjs 1        -> 1 ngay gan nhat
//   node nhanh-sales-summary.mjs 30       -> 30 ngay gan nhat
//
// Doanh thu/don = tien vao (transfer+credit+deposit+cod+diem). Don huy/tra/that bai bi loai.

import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(new URL("./nhanh.config.json", import.meta.url), "utf8"));
const BASE = "https://pos.open.nhanh.vn/v3.0";

const DAYS = Number(process.argv[2] || 7);
const now = Math.floor(Date.now() / 1000);
const from = now - DAYS * 86400;

// Status loai tru (huy/that bai/het hang/tra hang)
const BAD_STATUS = new Set([58, 61, 63, 64, 68, 71, 72]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function orderRevenue(o) {
  const p = o.payment ?? {};
  return (
    (p.transfer?.amount || 0) +
    (p.credit?.amount || 0) +
    (p.deposit?.amount || 0) +
    (p.codAmount || 0) +
    (p.usedPoints?.amount || 0)
  );
}

async function fetchOrders() {
  const all = [];
  let next = null;
  let page = 0;
  while (true) {
    const paginator = { size: 100 };
    if (next) paginator.next = next;
    let data;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}/order/list?appId=${cfg.appId}&businessId=${cfg.businessId}`, {
        method: "POST",
        headers: { Authorization: cfg.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { createdAtFrom: from, createdAtTo: now }, paginator }),
      });
      data = await res.json();
      if (data.code === 1) break;
      const msg = JSON.stringify(data.messages ?? data);
      if (/rate limit/i.test(msg) && attempt < 4) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(msg);
    }
    const items = data.data ?? [];
    all.push(...items);
    page++;
    process.stdout.write(`\r  Dang lay... trang ${page}, tong ${all.length} don`);
    next = data.paginator?.next ?? null;
    if (!items.length || !next) break;
    await sleep(450);
  }
  process.stdout.write("\n");
  return all;
}

const orders = await fetchOrders();

const byChannel = {};
let totalRev = 0, totalOrders = 0, totalSuccess = 0, totalCancelled = 0;

for (const o of orders) {
  const ch = o.channel?.trafficSource || "(không rõ)";
  const status = o.info?.status;
  byChannel[ch] ??= { orders: 0, revenue: 0, success: 0 };
  if (BAD_STATUS.has(status)) { totalCancelled++; continue; } // loai don huy/tra
  const rev = orderRevenue(o);
  byChannel[ch].orders++;
  byChannel[ch].revenue += rev;
  if (status === 60) { byChannel[ch].success++; totalSuccess++; }
  totalRev += rev;
  totalOrders++;
}

const fmt = (n) => Math.round(n).toLocaleString("vi-VN");
console.log(`\n=== DOANH SỐ THEO KÊNH — ${DAYS} ngày gần nhất (đã loại đơn hủy/trả) ===\n`);
const rows = Object.entries(byChannel)
  .map(([ch, v]) => ({
    "Nguồn kênh": ch,
    "Đơn hợp lệ": v.orders,
    "Thành công": v.success,
    "Doanh thu": fmt(v.revenue),
    "AOV": v.orders ? fmt(v.revenue / v.orders) : 0,
  }))
  .sort((a, b) => Number(String(b["Doanh thu"]).replaceAll(".", "")) - Number(String(a["Doanh thu"]).replaceAll(".", "")));
console.table(rows);
console.log(`\nTỔNG: ${totalOrders} đơn hợp lệ | ${totalSuccess} thành công | ${totalCancelled} bị hủy/trả`);
console.log(`Tổng doanh thu (đơn hợp lệ): ${fmt(totalRev)}đ`);
console.log(`AOV chung: ${totalOrders ? fmt(totalRev / totalOrders) : 0}đ`);
