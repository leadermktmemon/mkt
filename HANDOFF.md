# BÀN GIAO DỰ ÁN: Dashboard Marketing Memon/Bemori

> File tóm tắt để tiếp tục ở chat mới. Cập nhật: 2026-06-15.
> Thư mục dự án: `D:\Claude\Memon`. Repo GitHub: **github.com/leadermktmemon/mkt** (private).
> Dashboard live: **https://mkt.leader-mkt-memon.workers.dev/** (Cloudflare, đang CÔNG KHAI — chưa bật Access).

---

## 1. MỤC TIÊU
Dashboard marketing tự động cho doanh nghiệp **Memon/Bemori** (chuỗi bán gấu bông): theo dõi doanh thu Online (marketing) + Cửa hàng (bán lẻ) + B2B/sỉ, theo ngày/tuần/tháng/năm, tự cập nhật, đẩy báo cáo về Lark.

## 2. NGUỒN DỮ LIỆU (quan trọng)
Có 3 nguồn đã kết nối; **hiện dashboard chạy bằng LARK** (chính xác nhất, do team nhập tay):

### a) Lark Bitable (ĐANG DÙNG cho dashboard)
- App Lark: `cli_aaa7b7542e781eea` (quyền `bitable:app:readonly`, đã publish, đã add vào các Base). Config: `lark.config.json` (appId/appSecret, domain `larksuite`).
- **Base "Sales Online"** app_token `NimAbYHV3aWjPmsp7I9lugmbgcv`:
  - Bảng **3.1 "DT theo nguồn hàng ngày"** = `tbl6xpLNnyuXLydn` → doanh thu Online THEO KÊNH (cột formula: `Doanh thu Facebook/Instagram/Zalo/Website`, `Bán lẻ NK`) + ads/organic (`Doanh thu FB ADS`, `GG ADS`, `Social tự nhiên`). Daily từ 2025-05; Jan–Apr 2025 là theo tháng.
  - Bảng **2.2 "Tổng hợp SO theo ngày"** = `tblLf6OWq6Z9nFQD` → `Target ngày`, `Số đơn hàng chốt được` (đơn tổng — đáng tin hơn đơn theo-kênh ở 3.1 vốn gần đây team bỏ trống).
- **Base "Cửa hàng"** app_token `Sfb9bDqKgakJMSs9xOglyyE5gdg`:
  - Bảng **2.2 "Tổng hợp cửa hàng theo NGÀY"** = `tblH6XAodJy1WQwy` (4488 dòng, daily) → `Doanh thu CH` (walk-in), `Doanh thu đơn Online chuyển đơn` (marketing giao tại CH), `Target ngày`, `SL Khách vào`, `SL khách mua`. ⚠️ DÙNG BẢNG NÀY (theo ngày), KHÔNG dùng bảng 2.4 theo tháng `tblqPCxm7QbDv6Zh` (gây lỗi "7 ngày = 0").
  - Còn nhiều bảng khác (KPI nhân viên, hoàn/hủy, CVR, báo cáo từng cửa hàng) chưa dùng.

### b) nhanh.vn API (đã dựng, KHÔNG dùng cho dashboard hiện tại — để dành cho Memon/đối chiếu)
- Config `nhanh.config.json` (appId 77730, accessToken hết hạn 2027-06, businessId 221998).
- Scripts: `nhanh-auth.mjs`, `nhanh-fetch.mjs`, `nhanh-sales-summary.mjs`, `build-data.mjs` (bản dashboard cũ dùng nhanh).
- Có chi tiết kênh FB/Zalo/Shopee theo `trafficSource`/`saleChannel`, nhưng số liệu kém chính xác hơn Lark. Memon (B2B/sỉ) = kho 230213 (mode 6).

### c) Lark bot webhook (đẩy báo cáo)
- Webhook (có ký chữ ký HMAC) trong `marketing-report/config.json`. Script `marketing-report/send-lark.mjs` gửi thẻ KPI sáng.

## 3. MÔ HÌNH DỮ LIỆU (đã chốt với chủ DN)
- **Online = 100% Marketing** = bảng 3.1 (Sales Online), theo kênh FB/Zalo/IG/Web, mọi kho giao hàng.
- **Cửa hàng = Walk-in (Doanh thu CH) + Online chuyển đơn (marketing giao tại CH)**. % Marketing→Cửa hàng = chuyển đơn / (CH + chuyển đơn) ≈ 13-16%.
- **Tổng = Online + Cửa hàng (walk-in)** (không đếm trùng; "chuyển đơn" là tập con của Online).
- Dùng **doanh thu THỰC TẾ** (Doanh thu CH, Doanh thu 100%), KHÔNG dùng cột Target.
- 10 cửa hàng hiện tại: Nguyễn Trãi, Láng, Cầu Giấy, Xuân Thuỷ, Bạch Mai, Nguyễn Văn Cừ, Xã Đàn, Tây Sơn, Outlet, Lê Văn Sỹ (+ Nguyễn Gia Trí HCM đã đóng, giữ lịch sử).
- **Memon (B2B/sỉ)** = chưa tách trong dashboard Lark (memonRev=0); để làm sau.

## 4. CẤU TRÚC FILE (trong repo)
```
marketing-report/
  config.json                     # webhook+secret Lark, dashboardUrl (GITIGNORED)
  send-lark.mjs                   # gửi thẻ KPI sáng vào Lark
  src/larkSender.mjs              # gửi Lark có ký chữ ký
  dashboard/
    lark-build-data.mjs           # ⭐ PIPELINE CHÍNH: kéo 2 Base Lark -> data.js/data.json
    build-data.mjs                # pipeline cũ (nhanh.vn) - không dùng nữa nhưng giữ lại
    index.html                    # ⭐ Dashboard (HTML+Chart.js, đọc data.js)
    data.js / data.json           # dữ liệu sinh ra (Lark)
    static-server.mjs             # server tĩnh để preview local (port 4321)
    .cache-raw.json               # cache nhanh.vn (gitignored)
.github/workflows/daily-report.yml # cron mỗi ~3h: build từ Lark + gửi Lark + commit data.js
lark.config.json / nhanh.config.json / meta.config.json  # GITIGNORED (chứa secret)
wrangler.jsonc                    # Cloudflare phục vụ marketing-report/dashboard làm static
DEPLOY.md, KE-HOACH-BAO-CAO-MARKETING.md  # tài liệu
```

## 5. DASHBOARD (index.html) — đã có
- Điều hướng theo **4 TẦNG (tab "Nhóm")** thay cho bộ "Xem" cũ. Bộ **"Kỳ"** (Hôm nay/7/30 ngày/Tháng này/90/1 năm + lịch tùy chọn) và **"Gộp"** (Ngày/Tuần/Tháng) giữ nguyên.
  - **Nhóm 1 · Sales Online / Cửa hàng**: KPI Tổng, Online, Cửa hàng (walk-in), Marketing→CH, Memon, *Chi phí (placeholder)*; trend Online vs CH; bảng Online vs CH (đơn/DT/%); biểu đồ theo cửa hàng (walk-in).
  - **Nhóm 2 · Thương hiệu**: doanh thu Bemori/Teddy/Khác (cột tổng hợp 3.1, chưa gồm Bán lẻ NK) + *chi phí/ROAS placeholder*; trend + donut theo TH.
  - **Nhóm 3 · Theo kênh**: KPI Online/đơn/AOV/số kênh + bảng kênh (đơn&AOV **ước tính**) + **ma trận Thương hiệu × Kênh** (panel riêng `#matrixPanel`).
  - **Nhóm 4 · Nội dung & Ads**: KPI DT Ads (FB+GG) vs Tự nhiên/Viral (Social) — từ `fbAds/ggAds/social`; trend Ads vs Tự nhiên; **khung 9 kênh** (`#n4Panel`, mảng `N4` trong JS) tuyến Cố định (Web/FB/IG có DT) + Viral (TikTok×3/YouTube×2 — placeholder); cột Ads/Traffic/Chi phí = "chờ DL".
- Chi phí, ROAS, Traffic, TikTok/YouTube: **Base chưa có** → để placeholder, cắm sau khi nối ads/truyền thông.
- Logo: dùng `marketing-report/dashboard/logo.png` (nếu chưa upload thì hiện chữ "Memon").

## 6. DEPLOY (đã chạy)
- **GitHub Actions** `daily-report.yml`: cron `0 1,4,7,10,13 * * *` UTC (~08/11/14/17/20h VN). Mỗi lần: tạo config từ Secrets → `node lark-build-data.mjs` → gửi Lark (chỉ 08h) → commit `data.js`.
- **GitHub Secrets** đã set: `LARK_BASE_CONFIG` (=nội dung lark.config.json), `LARK_CONFIG` (=marketing-report/config.json), `NHANH_CONFIG`.
- **Cloudflare**: Workers Static Assets (qua `wrangler.jsonc`), tự deploy khi push. ⚠️ Đừng để `[skip ci]` trong commit message của cron (Cloudflare sẽ bỏ deploy).

## 7. VIỆC CÒN TREO (NEXT)
1. ⚠️ **Bật Cloudflare Access** (Zero Trust → Access → Self-hosted → hostname `mkt.leader-mkt-memon.workers.dev` → Allow theo email) — vì dashboard đang công khai lộ doanh thu.
2. **Điền `dashboardUrl`** = `https://mkt.leader-mkt-memon.workers.dev/` vào Secret `LARK_CONFIG` (để nút "Mở dashboard" trong thẻ Lark hoạt động).
3. **Tách Memon (B2B/sỉ)** — chưa làm; nguồn từ nhanh.vn (kho 230213) hoặc Base Lark riêng nếu có.
4. **Lead/CVR**: team chỉ nhập T5-T6/2025 rồi dừng → chưa đưa vào; bật lại khi nhập đều.
5. **Số đơn THẬT theo kênh** (bảng 3.1) + **số đơn marketing tại CH** (bảng cửa hàng 2.2): Base đang trống → hiện ước tính. Đề nghị team nhập để có số thật.
6. **Google Ads**: chưa nối. Khi nối sẽ có CP Google → ROAS Google Ads trong Nhóm 4.
7. **TikTok/YouTube traffic**: cần API TikTok Ads + GA4 cho Nhóm 4 viral.
8. **ROAS Instagram**: Lark không có cột "DT IG ADS" riêng → hiện chỉ có CP IG, chưa có ROAS.

## 7b. ĐÃ HOÀN THÀNH (Meta Ads — 2026-06-16)
- **meta-fetch.mjs**: kéo chi phí Meta theo ngày, breakdown FB/IG, gộp **5 tài khoản từ 2 BM**:
  - BM1: Pa15 (token System User Apimemon, app get-data)
  - BM2: Bemori 1/2/3/4
- **meta-data.json** (gitignored, build artifact): output trung gian
- **lark-build-data.mjs**: đọc meta-data.json → thêm `metaFb/metaIg/metaTotal` vào mỗi ngày
- **index.html**: hiển thị số thật — Nhóm 1 (CP + ROAS), Nhóm 3 (FB/IG riêng), Nhóm 4 (Ads card)
- **daily-report.yml**: chạy meta-fetch trước lark-build → cần Secret `META_CONFIG` ✅ (đã set)
- **30 ngày (đầy đủ)**: FB 87.6tr + IG 6tr = **93.7tr VND tổng chi phí Meta**

## 8. CÁCH TIẾP TỤC (cho chat mới / người mới)
- Cập nhật dữ liệu tay: `node marketing-report/dashboard/lark-build-data.mjs` (kéo Lark → data.js).
- Xem local: `node marketing-report/dashboard/static-server.mjs` rồi mở http://localhost:4321 (hoặc dùng preview tool).
- Sửa dashboard: edit `index.html` → rebuild data nếu cần → commit & push (Cloudflare tự deploy ~2 phút).
- Đẩy lên: `git add ... && git commit && git push` (nếu remote có commit cron mới: `git fetch && git rebase -X theirs origin/main` rồi push).
- ⚠️ KHÔNG commit các file `*.config.json` (đã gitignore — chứa secret).
- Bộ nhớ Claude (memory) có file `marketing-report-app.md`, `lark-base-fetch-setup.md`, `nhanh-vn-api-setup.md` lưu chi tiết kỹ thuật.

## 9. SỐ LIỆU THAM CHIẾU (Lark, để đối chiếu khi tiếp tục)
- 1 năm: Online ~15.6 tỷ + Cửa hàng (walk-in) ~36 tỷ.
- 30 ngày: Online ~986tr (Zalo 43% / FB 37% / Bán lẻ NK 8% / IG 7% / Web 5%), 1.481 đơn, AOV 666K, %KPI 81%.
- Cửa hàng 7 ngày (09-15/06): ~494tr, 991 khách vào, tỷ lệ chốt 89%.
