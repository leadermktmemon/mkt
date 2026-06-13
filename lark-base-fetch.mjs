// Lark Base (Bitable) record fetcher
// Reads ALL records from a Lark Base table via the Lark Open Platform API.
// No external dependencies — uses Node 18+ built-in fetch.
//
// Usage:
//   node lark-base-fetch.mjs
//
// Configuration is read from lark.config.json in the same folder (see lark.config.example.json).
// Output: writes base-data.json (raw records) and base-data.csv (flattened) next to this script.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  const path = join(__dirname, "lark.config.json");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`Khong tim thay lark.config.json. Hay copy lark.config.example.json thanh lark.config.json va dien thong tin.`);
    process.exit(1);
  }
  const cfg = JSON.parse(raw);
  for (const k of ["appId", "appSecret", "appToken", "tableId"]) {
    if (!cfg[k]) {
      console.error(`Thieu truong "${k}" trong lark.config.json`);
      process.exit(1);
    }
  }
  // domain: "larksuite" (quoc te) hoac "feishu" (Trung Quoc)
  cfg.baseUrl =
    (cfg.domain === "feishu")
      ? "https://open.feishu.cn"
      : "https://open.larksuite.com";
  return cfg;
}

async function getTenantToken(cfg) {
  const res = await fetch(`${cfg.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Lay token that bai (code ${data.code}): ${data.msg}`);
  }
  return data.tenant_access_token;
}

async function fetchAllRecords(cfg, token) {
  const records = [];
  let pageToken = null;
  let page = 0;
  do {
    const url = new URL(
      `${cfg.baseUrl}/open-apis/bitable/v1/apps/${cfg.appToken}/tables/${cfg.tableId}/records`
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`Doc record that bai (code ${data.code}): ${data.msg}`);
    }
    const items = data.data?.items ?? [];
    records.push(...items);
    pageToken = data.data?.has_more ? data.data.page_token : null;
    page++;
    console.log(`  Trang ${page}: +${items.length} record (tong ${records.length})`);
  } while (pageToken);
  return records;
}

// Flatten a Bitable field value into a plain string for CSV.
function flattenValue(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(flattenValue).join("; ");
  if (typeof v === "object") {
    if ("text" in v) return String(v.text);
    if ("name" in v) return String(v.name);
    if ("link" in v) return String(v.link);
    return JSON.stringify(v);
  }
  return String(v);
}

function toCsv(records) {
  const cols = new Set();
  for (const r of records) for (const k of Object.keys(r.fields ?? {})) cols.add(k);
  const headers = ["record_id", ...cols];
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(",")];
  for (const r of records) {
    const row = [r.record_id, ...[...cols].map((c) => flattenValue(r.fields?.[c]))];
    lines.push(row.map(esc).join(","));
  }
  return "﻿" + lines.join("\r\n"); // BOM giup Excel doc dung tieng Viet
}

async function main() {
  const cfg = loadConfig();
  console.log(`Ket noi ${cfg.baseUrl} ...`);
  const token = await getTenantToken(cfg);
  console.log("Da lay token. Dang doc record...");
  const records = await fetchAllRecords(cfg, token);

  writeFileSync(join(__dirname, "base-data.json"), JSON.stringify(records, null, 2), "utf8");
  writeFileSync(join(__dirname, "base-data.csv"), toCsv(records), "utf8");

  console.log(`\nXong! ${records.length} record da luu vao:`);
  console.log(`  - base-data.json`);
  console.log(`  - base-data.csv`);
}

main().catch((e) => {
  console.error("\nLOI:", e.message);
  process.exit(1);
});
