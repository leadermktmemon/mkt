// Dung noi dung ban tin marketing tu du lieu THAT.
// Hien tai: doanh so nhanh.vn that; phan ads/organic danh dau "dang ket noi".

const fmtVND = (n) => Math.round(n).toLocaleString("vi-VN") + "đ";
const fmtShort = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "tỷ";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "tr";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(Math.round(n));
};

// Map nguon kenh nhanh.vn -> emoji nhan dien
function channelIcon(name) {
  if (/^FB/i.test(name)) return "📘";
  if (/insta/i.test(name)) return "📸";
  if (/zalo/i.test(name)) return "💬";
  if (/web/i.test(name)) return "🌐";
  if (/lẻ|khách/i.test(name)) return "🏬";
  return "•";
}

function fmtDateVN(unixSec) {
  return new Date((unixSec + 7 * 3600) * 1000)
    .toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export function buildDailyCard({ sales }) {
  const { channels, totals, window } = sales;
  const dayLabel = fmtDateVN(window.from);

  // Phan tong quan
  const overview =
    `**💰 DOANH SỐ** _(nguồn sự thật: nhanh.vn)_\n` +
    `• Doanh thu: **${fmtVND(totals.revenue)}**\n` +
    `• Đơn hợp lệ: **${totals.orders}**  •  Thành công: **${totals.success}**  •  Hủy/trả: ${totals.cancelled}\n` +
    `• AOV: **${fmtVND(totals.aov)}**`;

  // Bang theo kenh
  let table =
    `**🎯 THEO NGUỒN KÊNH**\n` +
    "```\n" +
    "Kênh           Đơn  Doanh thu   AOV\n";
  for (const c of channels) {
    const name = (channelIcon(c.channel) + " " + c.channel).slice(0, 14).padEnd(14);
    table +=
      `${name} ${String(c.orders).padStart(3)}  ${fmtShort(c.revenue).padStart(8)}  ${fmtShort(c.aov).padStart(6)}\n`;
  }
  table += "```";

  // Phan ads/organic - chua ket noi
  const pending =
    `**📊 QUẢNG CÁO & ORGANIC** _(đang chờ kết nối)_\n` +
    `• Facebook Ads (5 acc), Google Ads — _sắp có_\n` +
    `• FB/IG/TikTok/YouTube organic — _sắp có_\n` +
    `→ Khi nối xong sẽ tính **ROAS theo kênh** (chi ads ↔ doanh thu mỗi kênh).`;

  // Canh bao data hygiene neu co don khong ro nguon
  const unknown = channels.find((c) => c.channel === "(không rõ)");
  const elements = [overview, table];
  if (unknown && unknown.revenue > 0) {
    const pct = ((unknown.revenue / totals.revenue) * 100).toFixed(0);
    elements.push(
      `⚠️ **${unknown.orders} đơn (${fmtVND(unknown.revenue)} ~ ${pct}%) chưa gắn nguồn kênh** — nhắc team gắn nguồn để báo cáo ROAS chuẩn hơn.`
    );
  }
  elements.push(pending);

  return makeCard({
    title: `📊 BÁO CÁO MARKETING — ${dayLabel}`,
    subtitle: `_Recap doanh số ngày ${dayLabel} • cập nhật ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}_`,
    sections: elements,
    footer: "🤖 marketing-report • gửi 10:00 hằng ngày",
  });
}

// Dung card tu cac section markdown (khong phu thuoc ham trong larkSender)
function makeCard({ title, subtitle, sections, footer, headerColor = "blue" }) {
  const elements = [];
  if (subtitle) elements.push({ tag: "div", text: { tag: "lark_md", content: subtitle } });
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
    header: { template: headerColor, title: { tag: "plain_text", content: title } },
    elements,
  };
}
