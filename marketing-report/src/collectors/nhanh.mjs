// Collector: doanh so theo nguon kenh tu nhanh.vn (du lieu that).
// Tra ve { channels: [...], totals: {...}, window: {from,to} }.

import { readFileSync } from "node:fs";

const BASE = "https://pos.open.nhanh.vn/v3.0";
const BAD_STATUS = new Set([58, 61, 63, 64, 68, 71, 72]); // huy/tra/that bai/het hang
const VN_OFFSET = 7 * 3600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cua so "hom qua" theo gio VN (cho ban tin 10h sang recap ngay truoc)
export function yesterdayWindowVN() {
  const nowS = Math.floor(Date.now() / 1000);
  const vnNow = nowS + VN_OFFSET;
  const vnMidnightToday = vnNow - (vnNow % 86400);
  const from = vnMidnightToday - 86400 - VN_OFFSET; // 00:00 hom qua (unix that)
  const to = vnMidnightToday - 1 - VN_OFFSET;        // 23:59:59 hom qua
  return { from, to };
}

// Cua so N ngay gan nhat (dung de test)
export function lastNDaysWindow(n) {
  const to = Math.floor(Date.now() / 1000);
  return { from: to - n * 86400, to };
}

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

async function fetchOrders(cfg, from, to) {
  const all = [];
  let next = null;
  while (true) {
    const paginator = { size: 100 };
    if (next) paginator.next = next;
    let data;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}/order/list?appId=${cfg.appId}&businessId=${cfg.businessId}`, {
        method: "POST",
        headers: { Authorization: cfg.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { createdAtFrom: from, createdAtTo: to }, paginator }),
      });
      data = await res.json();
      if (data.code === 1) break;
      const msg = JSON.stringify(data.messages ?? data);
      if (/rate limit/i.test(msg) && attempt < 4) { await sleep(3000 * (attempt + 1)); continue; }
      throw new Error(`nhanh order/list: ${msg}`);
    }
    const items = data.data ?? [];
    all.push(...items);
    next = data.paginator?.next ?? null;
    if (!items.length || !next) break;
    await sleep(450);
  }
  return all;
}

export async function getSalesByChannel({ configPath, window }) {
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const { from, to } = window;
  const orders = await fetchOrders(cfg, from, to);

  const byChannel = {};
  const totals = { orders: 0, success: 0, cancelled: 0, revenue: 0 };

  for (const o of orders) {
    const ch = o.channel?.trafficSource || "(không rõ)";
    const status = o.info?.status;
    byChannel[ch] ??= { channel: ch, orders: 0, success: 0, revenue: 0 };
    if (BAD_STATUS.has(status)) { totals.cancelled++; continue; }
    const rev = orderRevenue(o);
    byChannel[ch].orders++;
    byChannel[ch].revenue += rev;
    if (status === 60) { byChannel[ch].success++; totals.success++; }
    totals.orders++;
    totals.revenue += rev;
  }
  totals.aov = totals.orders ? totals.revenue / totals.orders : 0;

  const channels = Object.values(byChannel)
    .map((c) => ({ ...c, aov: c.orders ? c.revenue / c.orders : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  return { channels, totals, window: { from, to } };
}
