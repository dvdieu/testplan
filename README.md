# Integration Planner

Lập timeline Backend đáp ứng mốc API Doc & Deadline Studio.

## Tech Stack

- Vite + React 19
- React Router (BrowserRouter)
- Cloudflare Pages (static hosting)

## Local development

```bash
npm install
npm run dev
```

### Local with Cloudflare KV

Để test KV trên local, cần dùng Wrangler Pages Dev (Vite dev không chạy Pages Functions):

```bash
npm run dev:kv
```

Lệnh này sẽ build trước, sau đó chạy `wrangler pages dev dist --kv=PLANS=<id>`. Mở URL mà Wrangler cấp (thường `http://127.0.0.1:8788`).

## Build

```bash
npm run build
```

## Deploy to Cloudflare Pages

1. Push code to GitHub.
2. Trong Cloudflare Dashboard → Pages → Create a project → Connect to Git.
3. Chọn repository này.
4. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Save & deploy.

File `public/_redirects` đảm bảo SPA routing hoạt động đúng trên Cloudflare Pages.

## Data storage (Cloudflare KV)

- Mỗi dự án được lưu trong **Cloudflare KV** qua Pages Functions.
- Key format: `plan:<project-slug>`
- Nếu KV chưa được cấu hình hoặc lỗi mạng, frontend tự động fallback về **localStorage**.

### Cấu hình KV trên Cloudflare Pages

Repo đã có `wrangler.jsonc` với namespace ID và binding `PLANS`. Bạn chỉ cần đảm bảo namespace đó tồn tại trong tài khoản Cloudflare của bạn.

Cách 1 — Tự động qua Wrangler CLI:
```bash
npx wrangler kv namespace create PLANS
```
Sau đó cập nhật `id` trong `wrangler.jsonc` bằng ID vừa nhận được.

Cách 2 — Thủ công trong Dashboard:
1. Vào Cloudflare Dashboard → **Workers & Pages** → chọn project Pages của bạn.
2. Tab **Settings** → **Functions** → **KV namespace bindings**.
3. Thêm binding:
   - **Variable name**: `PLANS`
   - **KV namespace**: chọn namespace có ID `ec77e6d9e8e64c229465992beeba27e5` (hoặc namespace bạn đã tạo)
4. Redeploy project.

Sau khi binding đúng, frontend sẽ tự động lưu plan vào KV.
