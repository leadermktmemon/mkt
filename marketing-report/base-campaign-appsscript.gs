// =====================================================
// BOT BÁO CÁO CAMPAIGN → BASE.VN  (chạy 8h30 sáng hàng ngày)
// Đọc dashboard (data.json công khai) → gửi báo cáo NGÀY HÔM QUA
// Chạy trên Google Apps Script — độc lập với GitHub
// =====================================================


// =====================================================
// 1. CẤU HÌNH
// =====================================================

const DATA_URL =
  "https://mkt.leader-mkt-memon.workers.dev/data.json";

// ⚠️ DÁN WEBHOOK BASE CỦA BẠN VÀO ĐÂY (không commit webhook thật lên repo public)
const BASE_WEBHOOK_URL =
  "DAN_WEBHOOK_BASE_CUA_BAN_VAO_DAY";

const BOT_NAME = "Báo cáo Campaign";
const BOT_USERNAME = "campaign_report";
const DASHBOARD_URL = "https://mkt.leader-mkt-memon.workers.dev";


// =====================================================
// 2. HÀM CHÍNH — gửi báo cáo
// =====================================================

function sendCampaignReport() {
  try {
    const resp = UrlFetchApp.fetch(DATA_URL + "?v=" + Date.now(), { muteHttpExceptions: true });
    const D = JSON.parse(resp.getContentText());
    const cd = D.campaignDays || [];

    const msg = buildReport(cd);

    const options = {
      method: "post",
      payload: {
        bot_name: BOT_NAME,
        bot_username: BOT_USERNAME,
        base_content: msg,
        base_blocks: "null",
      },
      muteHttpExceptions: true,
    };
    const r = UrlFetchApp.fetch(BASE_WEBHOOK_URL, options);
    Logger.log("HTTP " + r.getResponseCode() + " | " + r.getContentText());
  } catch (error) {
    Logger.log("Lỗi: " + error.toString());
  }
}


// =====================================================
// 3. DỰNG NỘI DUNG — BÁO CÁO NGÀY HÔM QUA
// =====================================================

function buildReport(cd) {
  const vnd = function (n) {
    n = Math.round(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + " tỷ";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + " tr";
    if (n >= 1e3) return Math.round(n / 1e3) + "K";
    return String(n);
  };
  const roasE = function (r) { return r >= 3 ? "🟢" : r >= 1.5 ? "🟡" : "🔴"; };
  const short = function (s, n) { n = n || 32; return s.length > n ? s.slice(0, n) + "…" : s; };

  const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
  const ymd = function (d) { return d.toISOString().slice(0, 10); };
  const dm = function (s) { return s.slice(8) + "/" + s.slice(5, 7); };
  const yesterday = ymd(new Date(vnNow.getTime() - 86400000));

  const m = {};
  for (const r of cd) {
    if (r.day !== yesterday) continue;
    const c = m[r.id] || (m[r.id] = { name: r.name, spend: 0, msg: 0, pur: 0, pv: 0 });
    c.spend += r.spend || 0; c.msg += r.messages || 0; c.pur += r.purchases || 0; c.pv += r.purchaseValue || 0;
  }
  const camps = Object.values(m).filter(function (c) { return c.spend > 0; }).sort(function (a, b) { return b.spend - a.spend; });
  const T = { spend: 0, msg: 0, pur: 0, pv: 0 };
  camps.forEach(function (c) { T.spend += c.spend; T.msg += c.msg; T.pur += c.pur; T.pv += c.pv; });
  T.roas = T.spend ? T.pv / T.spend : 0;

  let msg = "📊 BÁO CÁO ADS — HÔM QUA (" + dm(yesterday) + ")\n";
  msg += "\n━━━ TỔNG QUAN ━━━\n";
  msg += "💰 Chi ads   " + vnd(T.spend) + "\n";
  msg += "📈 ROAS      " + T.roas.toFixed(1) + "x " + roasE(T.roas) + "\n";
  msg += "💬 Tin nhắn  " + T.msg + "\n";
  msg += "🛒 Đơn       " + T.pur + "\n";
  msg += "💎 DT pixel  " + vnd(T.pv) + "\n";
  msg += "\n━━━ CHIẾN DỊCH (" + camps.length + ") ━━━\n";
  if (!camps.length) {
    msg += "(hôm qua không có chiến dịch phát sinh chi phí)\n";
  } else {
    camps.forEach(function (c, i) {
      const r = c.spend ? c.pv / c.spend : 0;
      const roasTxt = c.pv > 0 ? "ROAS " + r.toFixed(1) + "x " + roasE(r) : c.msg + " tn";
      msg += (i + 1) + ". " + short(c.name) + "\n    " + vnd(c.spend) + " · " + roasTxt + " · " + (c.pur || 0) + " đơn\n";
    });
  }
  if (DASHBOARD_URL) msg += "\n🔗 " + DASHBOARD_URL;
  msg += "\n🤖 Cập nhật " + vnNow.toISOString().slice(11, 16);
  return msg;
}


// =====================================================
// 4. CÀI TRIGGER 8H30 HÀNG NGÀY — chạy hàm này 1 LẦN
// (Nhớ đặt múi giờ project = GMT+7 trong Project Settings)
// =====================================================

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendCampaignReport") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendCampaignReport")
    .timeBased().everyDays(1).atHour(8).nearMinute(30).create();
  Logger.log("✓ Đã cài lịch gửi báo cáo Campaign ~8h30 sáng hàng ngày.");
}
