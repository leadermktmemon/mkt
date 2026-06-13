# Hướng dẫn deploy: Dashboard Marketing tự cập nhật (riêng tư)

Mục tiêu: dashboard chạy trên **Cloudflare Pages** (chỉ email được duyệt mới xem được),
tự cập nhật **10h sáng mỗi ngày** qua **GitHub Actions**, và đẩy thẻ KPI + link vào **Lark**.

Kiến trúc: GitHub (code + cron) → build data.js → commit → Cloudflare Pages tự deploy (có Access bảo vệ) → Lark nhận link.

---

## Bước 1 — Đưa code lên GitHub (repo PRIVATE)

1. Tạo repo **private** trên GitHub, ví dụ `bemori-marketing` (đừng để public — `data.js` chứa doanh thu).
2. Ở máy, trong thư mục `D:\Claude\Memon`, chạy (PowerShell):

```powershell
git init
git add .
git commit -m "Marketing dashboard"
git branch -M main
git remote add origin https://github.com/<USERNAME>/bemori-marketing.git
git push -u origin main
```

> File `nhanh.config.json`, `meta.config.json`, `marketing-report/config.json` đã được `.gitignore` loại trừ — **token KHÔNG bị đẩy lên**. Yên tâm.

---

## Bước 2 — Khai báo Secrets cho GitHub Actions

Vào repo → **Settings → Secrets and variables → Actions → New repository secret**. Tạo 2 secret:

**`NHANH_CONFIG`** — dán **toàn bộ nội dung** file `nhanh.config.json` (gồm accessToken, businessId...).

**`LARK_CONFIG`** — dán **toàn bộ nội dung** file `marketing-report/config.json` (webhook + secret Lark). Phần `dashboardUrl` để trống, sẽ điền ở Bước 4.

---

## Bước 3 — Kết nối Cloudflare Pages

1. Tạo tài khoản tại **https://dash.cloudflare.com** (miễn phí).
2. **Workers & Pages → Create → Pages → Connect to Git** → chọn repo `bemori-marketing`.
3. Cấu hình build:
   - **Framework preset:** None
   - **Build command:** (để trống)
   - **Build output directory:** `marketing-report/dashboard`
4. **Save and Deploy** → Cloudflare cho 1 URL dạng `https://bemori-marketing.pages.dev`.

> Mỗi khi cron commit `data.js`, Cloudflare tự deploy lại → dashboard luôn mới.

---

## Bước 4 — Bảo vệ bằng Cloudflare Access (chỉ email được duyệt)

1. Cloudflare → **Zero Trust** (lần đầu chọn gói **Free**).
2. **Access → Applications → Add an application → Self-hosted**.
3. Application domain: nhập domain Pages của bạn (`bemori-marketing.pages.dev`).
4. **Add policy:** Action = **Allow**; Include = **Emails** → liệt kê email được phép xem (vd email của bạn + team).
5. Lưu. Từ giờ mở dashboard sẽ yêu cầu **đăng nhập bằng mã OTP gửi qua email**.

Sau khi có URL: cập nhật `dashboardUrl` = `https://bemori-marketing.pages.dev` trong:
- Secret **`LARK_CONFIG`** trên GitHub (để nút Lark trỏ đúng)
- File `marketing-report/config.json` ở máy (nếu chạy thủ công)

---

## Bước 5 — Chạy thử & lên lịch

1. Repo → tab **Actions** → workflow **Daily Marketing Report** → **Run workflow** (chạy tay 1 lần để test).
2. Kiểm tra: Lark nhận thẻ KPI; mở link dashboard (qua đăng nhập email) thấy dữ liệu mới.
3. Từ đó workflow **tự chạy 10h sáng mỗi ngày** (cron `0 3 * * *` UTC = 10:00 VN).

---

## Cập nhật dữ liệu thủ công (tùy chọn, ở máy)

```powershell
node marketing-report/dashboard/build-data.mjs 30   # kéo lại 30 ngày
node marketing-report/send-lark.mjs                 # gửi thẻ Lark
```

## Khi nối được Meta/Google Ads sau này
Thêm collector chi tiêu → ghép vào `build-data.mjs` → dashboard tự có thêm ROAS/CPA theo kênh.
