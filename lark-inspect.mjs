// Doc nhanh cau truc 2 Base (Sales Online + Cua hang): liet ke cot + vai ban ghi mau.
import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(new URL("./lark.config.json", import.meta.url), "utf8"));
const BASE = cfg.domain === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";

const TARGETS = [
  { name: "Sales Online", appToken: "NimAbYHV3aWjPmsp7I9lugmbgcv", tableId: "tblLf6OWq6Z9nFQD" },
  { name: "Cửa hàng",     appToken: "Sfb9bDqKgakJMSs9xOglyyE5gdg", tableId: "tblqPCxm7QbDv6Zh" },
];

async function token() {
  const r = await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error("Token: " + d.msg);
  return d.tenant_access_token;
}

async function get(url, tk) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
  return r.json();
}

const tk = await token();
for (const t of TARGETS) {
  console.log(`\n===== ${t.name} (${t.appToken}/${t.tableId}) =====`);
  const f = await get(`${BASE}/open-apis/bitable/v1/apps/${t.appToken}/tables/${t.tableId}/fields?page_size=200`, tk);
  if (f.code !== 0) { console.log("  LỖI fields:", f.code, f.msg); continue; }
  console.log("  CỘT:");
  (f.data?.items || []).forEach((x) => console.log(`    - ${x.field_name}  [type ${x.type}]`));
  const rec = await get(`${BASE}/open-apis/bitable/v1/apps/${t.appToken}/tables/${t.tableId}/records?page_size=2`, tk);
  if (rec.code === 0) {
    console.log("  Tổng record:", rec.data?.total);
    console.log("  Bản ghi mẫu:", JSON.stringify(rec.data?.items?.[0]?.fields, null, 1).slice(0, 1500));
  } else console.log("  LỖI records:", rec.code, rec.msg);
}
