// Gui tin nhan vao Lark qua Custom Bot Webhook.
// Ho tro 2 kieu: text don gian, va interactive card (dep, dung cho ban tin).
// Neu bot bat "Signature verification", truyen `secret` de tu dong ky chu ky.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Thuat toan ky cua Lark: key = "{timestamp}\n{secret}", data rong, HMAC-SHA256 -> base64
function genSign(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac("sha256", stringToSign).update("").digest();
  return hmac.toString("base64");
}

export async function sendText(webhookUrl, text, secret) {
  return post(webhookUrl, { msg_type: "text", content: { text } }, secret);
}

export async function sendCard(webhookUrl, card, secret) {
  return post(webhookUrl, { msg_type: "interactive", card }, secret);
}

async function post(webhookUrl, payload, secret) {
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    payload = { timestamp, sign: genSign(secret, timestamp), ...payload };
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  // Webhook tra ve { code: 0, msg: "success" } khi thanh cong
  if (data.code !== undefined && data.code !== 0) {
    throw new Error(`Lark webhook loi (code ${data.code}): ${data.msg}`);
  }
  if (data.StatusCode !== undefined && data.StatusCode !== 0 && data.code === undefined) {
    throw new Error(`Lark webhook loi: ${JSON.stringify(data)}`);
  }
  return data;
}

// Upload anh len Lark Image API, tra ve img_key de dung trong card.
// larkCfg = { domain, appId, appSecret } (tu lark.config.json).
export async function uploadImage(filePath, larkCfg) {
  const base = larkCfg.domain === "feishu"
    ? "https://open.feishu.cn" : "https://open.larksuite.com";

  const tokenRes = await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: larkCfg.appId, app_secret: larkCfg.appSecret }),
  });
  const { tenant_access_token: token } = await tokenRes.json();
  if (!token) throw new Error("Không lấy được tenant_access_token");

  const form = new FormData();
  form.append("image_type", "message");
  const buf = readFileSync(filePath);
  form.append("image", new Blob([buf], { type: "image/jpeg" }), basename(filePath));

  const res = await fetch(`${base}/open-apis/im/v1/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Upload ảnh lỗi (code ${data.code}): ${data.msg}`);
  return data.data.image_key;
}

// Tien ich: dung 1 card ban tin tu cac "section" markdown.
export function buildReportCard({ title, subtitle, sections, footer, headerColor = "blue" }) {
  const elements = [];
  if (subtitle) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: subtitle } });
  }
  for (const sec of sections) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "div", text: { tag: "lark_md", content: sec } });
  }
  if (footer) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "note", elements: [{ tag: "lark_md", content: footer }] });
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerColor,
      title: { tag: "plain_text", content: title },
    },
    elements,
  };
}
