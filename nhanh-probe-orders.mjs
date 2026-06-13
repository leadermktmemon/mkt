// Probe: lay thu mot it don hang gan day de xem cau truc (nguon kenh + doanh thu)
import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(new URL("./nhanh.config.json", import.meta.url), "utf8"));
const BASE = "https://pos.open.nhanh.vn/v3.0";

const now = Math.floor(Date.now() / 1000);
const from = now - 14 * 86400; // 14 ngay gan nhat

const url = `${BASE}/order/list?appId=${cfg.appId}&businessId=${cfg.businessId}`;
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: cfg.accessToken, "Content-Type": "application/json" },
  body: JSON.stringify({
    filters: { createdAtFrom: from, createdAtTo: now },
    paginator: { size: 10 },
  }),
});
const data = await res.json();
if (data.code !== 1) { console.error("LOI:", JSON.stringify(data, null, 2)); process.exit(1); }

const orders = data.data ?? [];
console.log(`Lay duoc ${orders.length} don (14 ngay gan nhat, trang dau).`);
console.log("\n--- payment cua don dau ---");
console.log(JSON.stringify(orders[0]?.payment, null, 2));
console.log("\n--- Tom tat 10 don: nguon | status | money ---");
for (const o of orders) {
  const p = o.payment ?? {};
  console.log(
    `#${o.info.id} | ${o.channel.trafficSource.padEnd(14)} | status ${o.info.status} | ` +
    `money keys: ${Object.keys(p).join(",")}`
  );
  break; // chi can xem payment keys 1 lan
}
console.log("\n--- Nguon kenh cua ca 10 don ---");
for (const o of orders) {
  console.log(`${o.channel.trafficSource} (saleChannel=${o.channel.saleChannel}) | status=${o.info.status}`);
}
