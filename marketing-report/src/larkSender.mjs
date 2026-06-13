// Gui tin nhan vao Lark qua Custom Bot Webhook.
// Ho tro 2 kieu: text don gian, va interactive card (dep, dung cho ban tin).
// Neu bot bat "Signature verification", truyen `secret` de tu dong ky chu ky.

import crypto from "node:crypto";

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
