# Kế hoạch: App báo cáo chỉ số Marketing (Social & Ads) về Lark

> Tự động kéo số liệu **paid ads + social organic + doanh số thật từ nhanh.vn**,
> tổng hợp thành **bản tin định kỳ 10h sáng** và đẩy vào Lark. Chạy 24/7 trên cloud (GitHub Actions).

---

## 1. Phạm vi đã chốt

| Kênh | Số tài khoản | Loại | Nguồn API |
|------|:---:|------|-----------|
| Facebook Ads | 5 | Paid | Meta Marketing API |
| Google Ads | 1 | Paid | Google Ads API |
| Fanpage Facebook | 3 | Organic | Graph API (Page Insights) |
| Instagram | 3 | Organic | Graph API (IG Insights) |
| TikTok | 3 | Organic | TikTok Business Account API |
| YouTube | 2 | Organic | YouTube Data + Analytics API |
| **nhanh.vn** | 1 | **Nguồn doanh số thật** | nhanh.vn Open API v3.0 |

- Đầu ra: **bản tin định kỳ 10:00 hằng ngày** (recap số liệu ngày hôm trước).
- Nơi nhận: **gửi cho riêng bạn** qua một nhóm Lark chỉ có bạn + bot (mở rộng cho team sau).

---

## 2. Triết lý số liệu: chi tiêu từ nền tảng, doanh số (theo kênh) từ nhanh.vn

- **Nền tảng ads** (Meta/Google) → lấy **chi tiêu, hiển thị, click, lead/chuyển đổi nền tảng tự báo**.
- **nhanh.vn** → lấy **đơn hàng, doanh thu, AOV thật** — và **tách theo nguồn kênh** (sale channel: Facebook, web, TikTok Shop, sàn...).
- Ghép lại → tính ROAS/CPA **ở 2 cấp**:
  - **Theo từng kênh:** chi tiêu Facebook Ads ↔ doanh thu đơn nguồn Facebook → **ROAS Facebook thật**. Tương tự Google, TikTok...
  - **Tổng (blended):** tổng chi ads ↔ tổng doanh thu.
- Lý do: số chuyển đổi mỗi nền tảng tự báo thường lệch và cộng dồn bị trùng; doanh số thật + phân bổ theo kênh chỉ có ở hệ thống bán hàng (nhanh.vn).

> Lưu ý: tên các "nguồn kênh" trong nhanh.vn sẽ được xác định khi kéo dữ liệu thật (qua `filters.saleChannels` / trường `channel` của đơn), rồi ta **map** sang đúng nền tảng ads.

---

## 3. Chỉ số theo từng kênh (phù hợp mục tiêu của kênh)

### Paid — Facebook Ads (×5) & Google Ads (×1)
- Chi tiêu, Hiển thị (impressions), Click, CTR, CPC, CPM
- Lead / chuyển đổi (nền tảng báo), Cost/result
- Tách theo **campaign** để thấy cái nào hiệu quả

### Organic — Facebook Page (×3) & Instagram (×3)
- Follower + thay đổi ròng, Reach, Hiển thị
- Tương tác (reaction + comment + share + save)
- Video views, Bài đăng nổi bật nhất

### Organic — TikTok (×3)
- Follower + thay đổi, Video views, Lượt xem hồ sơ
- Tương tác (like + comment + share), Bài nổi bật

### Organic — YouTube (×2)
- Subscriber + thay đổi, Views, Watch time (giờ xem)
- Lượt thích/bình luận, Video nổi bật

### Doanh số — nhanh.vn (tách theo nguồn kênh)
- Số đơn, Doanh thu, **AOV** (doanh thu/đơn) — tổng và **theo từng nguồn kênh**
- Doanh thu nguồn Facebook / Google / TikTok / web / sàn... riêng biệt
- Lead (nếu nhanh.vn lưu), Tỷ trọng doanh thu mỗi kênh

### Tổng hợp & ROAS theo kênh (phần quan trọng nhất)
- **ROAS theo kênh** = doanh thu kênh đó (nhanh.vn) / chi tiêu ads kênh đó
  - VD: ROAS Facebook = doanh thu đơn nguồn FB / chi Facebook Ads
- **CPA theo kênh** = chi ads kênh / số đơn kênh
- **Blended ROAS** = tổng doanh thu nhanh.vn / tổng chi ads
- **Blended CPA**, **AOV** tổng
- So sánh ▲▼: hôm qua & cùng kỳ tuần trước

---

## 4. Mẫu bản tin Lark (hình dung)

```
📊 BÁO CÁO MARKETING — 13/06 (số liệu ngày 12/06)

💰 TỔNG QUAN (doanh số thật từ nhanh.vn)
• Doanh thu: 48.900.000đ  • Đơn: 156  • AOV: 313.000đ
• Tổng chi ads: 12.450.000đ (▲8%)
• Blended ROAS: 3.93 (▼0.2)  • Blended CPA: 79.800đ

🎯 HIỆU QUẢ THEO KÊNH (chi ads ↔ doanh thu nhanh.vn)
   Kênh        Chi      Doanh thu   ROAS   Đơn   CPA
   Facebook    8.20tr   33.6tr      4.10   98    83.7K
   Google      4.25tr   15.3tr      3.60   58    73.3K
   (TikTok Shop/web... bổ sung khi có dữ liệu)

📘 FACEBOOK ADS (5 acc) — CTR 3.1% | 4.2tr hiển thị
   Acc cao nhất: "Shop A" 3.1tr chi | Lead 64
📈 GOOGLE ADS — CTR 4.2% | CPC 3.100đ

🌱 ORGANIC
   FB (3 page): +124 follow | reach 45K | tương tác 3.1K
   IG (3):      +89 follow  | reach 22K | tương tác 1.8K
   TikTok (3):  +210 follow | views 88K | tương tác 5.2K
   YouTube (2): +18 sub | views 12K | watch 340h
```

**Lịch gửi:** 10:00 hằng ngày (cron). Có thể thêm khung giờ sau.

---

## 5. Kiến trúc & cấu trúc dự án

```
marketing-report/
├── config.json
├── src/
│   ├── collectors/
│   │   ├── metaAds.mjs        # 5 ad account
│   │   ├── googleAds.mjs      # 1 account (MCC nếu có)
│   │   ├── metaOrganic.mjs    # 3 page + 3 IG
│   │   ├── tiktok.mjs         # 3 kênh organic
│   │   ├── youtube.mjs        # 2 kênh organic
│   │   └── nhanh.mjs          # doanh số (tái dùng script đã có)
│   ├── transform.mjs          # ROAS/CPA/AOV, so sánh kỳ trước
│   ├── store.mjs              # lưu lịch sử (JSON/SQLite)
│   ├── report.mjs             # dựng nội dung bản tin
│   └── larkSender.mjs         # webhook bot Lark
├── index.mjs
└── .github/workflows/cron.yml # chạy 10:00 VN hằng ngày
```

Công nghệ: **Node.js** (đồng bộ các script đã có).

---

## 6. Quyền API cần xin — xếp theo độ khó (làm song song, cái chậm xin trước)

| Nguồn | Độ khó | Cần lấy |
|-------|:------:|---------|
| **Lark bot** | 🟢 2 phút | Webhook URL của nhóm |
| **YouTube** | 🟢 dễ | Google Cloud project + OAuth, bật YouTube Data + Analytics API |
| **nhanh.vn** | 🟡 (đang làm) | accessToken + businessId |
| **Meta (Ads + FB/IG organic)** | 🟡 vài giờ | App Business + System User token (`ads_read, read_insights, pages_read_engagement, instagram_basic, pages_show_list`); ad account IDs, Page IDs, IG business IDs |
| **TikTok organic** | 🟠 cần duyệt | TikTok for Business app + tài khoản TikTok Business; quyền đọc video & account insights |
| **Google Ads** | 🔴 chậm nhất | Cloud project + OAuth refresh token + **Developer Token (Google duyệt, vài ngày)** + customer ID |

> Khuyến nghị: nộp đơn xin **Google Ads Developer Token** và **TikTok app** NGAY hôm nay vì chờ duyệt lâu nhất.

---

## 7. Hosting: GitHub Actions theo lịch (đã chốt có tài khoản GitHub)

- Workflow cron chạy **10:00 giờ VN** (`0 3 * * *` UTC) → gọi `index.mjs`.
- Mọi token/secret lưu trong **GitHub Secrets** (an toàn, không commit vào code).
- Miễn phí cho nhu cầu này, không cần quản lý server.

---

## 8. Lộ trình triển khai (theo độ sẵn sàng của API)

| Phase | Nội dung | Phụ thuộc | Kết quả |
|:---:|---|---|---|
| **0** | Bot Lark + khung app + gửi tin mẫu | Webhook Lark | Thấy bản tin mẫu trong Lark hôm nay |
| **1** | nhanh.vn (doanh số) + YouTube | token nhanh.vn, OAuth YouTube | Bản tin có doanh số + YouTube |
| **2** | Meta Ads + FB/IG organic | token Meta | Thêm Facebook/IG |
| **3** | TikTok organic | duyệt TikTok app | Thêm TikTok |
| **4** | Google Ads | duyệt dev token | Thêm Google Ads |
| **5** | Blended ROAS/CPA/AOV + so sánh kỳ trước + deploy cron 10h | — | Bản tin hoàn chỉnh, tự động hằng ngày |

→ Có kết quả nhìn thấy ngay từ Phase 0–1, các kênh còn lại "gắn dần" khi có quyền.

---

## 9. Việc bắt đầu ngay (Phase 0)

1. Bạn **tạo 1 nhóm Lark chỉ có mình bạn** → thêm **Custom Bot** → copy **Webhook URL** gửi tôi.
2. Tôi dựng khung dự án `marketing-report/` + `larkSender.mjs` và gửi **bản tin mẫu** vào Lark để bạn duyệt bố cục.
3. Song song: bạn nộp đơn xin **Google Ads Developer Token** và tạo **TikTok for Business app** (vì chờ duyệt lâu).
```
```
