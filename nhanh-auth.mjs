// nhanh.vn — Buoc 2: Doi accessCode lay accessToken + businessId
//
// Cach dung:
//   node nhanh-auth.mjs <accessCode>
//
// Truoc do: dien appId + secretKey vao nhanh.config.json.
// accessCode lay tu URL sau khi ban dang nhap & cap quyen (xem huong dan).
// accessCode het han sau 10 phut, chi dung duoc 1 lan.
//
// Script se ghi accessToken + businessId nguoc lai vao nhanh.config.json.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(__dirname, "nhanh.config.json");

const accessCode = process.argv[2];
if (!accessCode) {
  console.error("Thieu accessCode. Chay: node nhanh-auth.mjs <accessCode>");
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
for (const k of ["appId", "secretKey"]) {
  if (!cfg[k] || cfg[k].startsWith("DIEN_")) {
    console.error(`Thieu "${k}" trong nhanh.config.json`);
    process.exit(1);
  }
}

// Thu ca v3.0 va v2.0 (tuy app/version) - lay cai nao thanh cong.
async function exchange(ver) {
  const url = `https://pos.open.nhanh.vn/${ver}/app/getaccesstoken?appId=${encodeURIComponent(cfg.appId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode, secretKey: cfg.secretKey }),
  });
  let data;
  try { data = await res.json(); } catch { return { ok: false, ver, err: `HTTP ${res.status}` }; }
  if (data.code === 1) return { ok: true, ver, data };
  return { ok: false, ver, err: JSON.stringify(data.messages ?? data) };
}

let result = await exchange("v3.0");
if (!result.ok) {
  console.error(`v3.0 that bai: ${result.err} -> thu v2.0...`);
  result = await exchange("v2.0");
}
if (!result.ok) {
  console.error("Doi token that bai (ca v3.0 va v2.0):", result.err);
  process.exit(1);
}
console.log(`Doi token thanh cong qua ${result.ver}`);
const out = result.data.data ?? result.data;
cfg.accessToken = out.accessToken;
cfg.businessId = String(out.businessId);
writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), "utf8");

console.log("Thanh cong! Da luu accessToken + businessId vao nhanh.config.json");
console.log("  businessId :", cfg.businessId);
console.log("  accessToken:", cfg.accessToken.slice(0, 12) + "... (do dai " + cfg.accessToken.length + ")");
if (out.expiredAt) console.log("  Het han luc:", new Date(out.expiredAt * 1000).toLocaleString("vi-VN"));
if (out.permissions) console.log("  Quyen:", JSON.stringify(out.permissions));
console.log("\nGio chay: node nhanh-fetch.mjs");
