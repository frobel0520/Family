# Family 系統設計（SD）

| 文件項目 | 內容 |
|---|---|
| 文件版本 | 1.0 |
| 文件日期 | 2026-11-14 |
| 狀態 | 依現況盤點補齊；同源與 Session 設計沿用 [ADR-001](adr-001-worker-same-origin-frontend.md) |
| 專案級別 | 產品級 |
| 依據 | Harbor `standards/DevelopmentStandards.md`、`standards/DeploymentHandbook.md` |

## 1. 架構總覽與關鍵決策

本系統的核心架構決策記錄於 **[`adr-001-worker-same-origin-frontend.md`](adr-001-worker-same-origin-frontend.md)**：前端已從共網域的 GitHub Pages 遷移至 Cloudflare Worker 同源靜態資產（`/Family/`），徹底消除同網域 XSS 竊取 `localStorage` token 的風險，並將 session 改為 `__Host-family_session` Cookie。

```text
使用者手機／瀏覽器（PWA: /Family/）
  └─ Cloudflare Worker（同源：靜態資產 + /api/*）
       ├─ 靜態資產：worker/public/Family/（不消耗 Worker CPU 執行次數）
       ├─ 安全邊界：_headers CSP、isSameOriginWrite（CSRF 防護）、requireSession（fail closed）
       ├─ 資料倉儲：GitHub Contents API → frobel0520/Family-data（JSON + 圖片）
       ├─ 推播儲存：Cloudflare KV（PUSH_SUBS）
       └─ 排程觸發：Cron */5 * * * * → 行事曆提醒掃描與 RFC 8291/8292 Web Push
```

## 2. 模組與 API 設計

### 2.1 後端目錄（`worker/src/`）

- **路由層（`routes/`）**：`auth.ts`、`me.ts`、`board.ts`、`recipes.ts`、`orders.ts`、`calendar.ts`、`family.ts`、`profile.ts`、`admin.ts`、`push.ts`、`image.ts`。
- **安全與認證核心**：
  - `session.ts` / `jwt.ts` / `cookie.ts`：HS256 JWT 與 `__Host-family_session` Cookie 管理（拒絕 Bearer token）。
  - `access.ts`：`OWNER_EMAIL` 與 `data/access.json` 動態重檢核、`pending` 上限 20 筆控管。
  - `image-url.ts`：24 小時效期 HMAC-SHA256 圖片能力 URL 簽發與驗證。
- **外部整合與推播**：`github-contents.ts`（GitHub Contents REST API 讀寫）、`google-oauth.ts`、`web-push.ts`、`notify.ts`。

### 2.2 前端目錄（`frontend/src/`）

- **認證與狀態**：`auth/AuthContext.tsx`、`auth/googleOAuth.ts`、`api.ts`（同源 fetch 攜帶 Cookie）。
- **頁面與元件**：8 個頁面（`Home`、`Board`、`Recipes`、`Orders`、`Calendar`、`Settings`、`Admin`、`AuthCallback`）與 11 個共用元件；`public/sw.js` 處理 PWA 離線快取與推播通知點擊導頁。

### 2.3 安全標頭與同源寫入保護

- `worker/public/_headers` 設定嚴格 CSP、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff` 與 `Permissions-Policy: camera=(), microphone=(), geolocation=()`。
- 所有寫入操作由 `isSameOriginWrite` 檢驗請求 `Origin` 或 `Sec-Fetch-Site === "same-origin"`，跨來源（含同帳號其他 `*.workers.dev`）一律回傳 `403`。

## 3. 部署與 CI 流程

- **PR／分支驗證（`.github/workflows/validate.yml`）**：
  - 前端：`npm ci`、`npm audit --audit-level=high`、`npm run lint`（`oxlint`）、`npm run build`。
  - Worker：`npm ci`、`npm audit --audit-level=high`、`npx tsc --noEmit`、`npm test -- --run`（11 份 Miniflare Vitest spec）、`node --test scripts/publish-worker-ci.check.mjs`。
- **正式部署（`.github/workflows/publish-worker.yml`）**：僅於 `refs/heads/main` 且 actor 為 repo 擁有者時，將前端建置輸出至 `worker/public/Family/`，通過完整測試後執行 `node scripts/publish-worker-ci.mjs` 部署 Worker 並產生發布報告。
- **Rollback 方式**：透過 Cloudflare Dashboard / `wrangler rollback` 回退 Worker 版本，或於 GitHub `main` revert 後重新觸發 `publish-worker.yml`。

## 4. 零月費與效能設計

| 項目 | 免費額度與系統邊界 |
|---|---|
| Cloudflare Workers | 免費方案每日 100,000 次請求；靜態前端資源不消耗 Worker CPU 調用次數 |
| Cloudflare KV（`PUSH_SUBS`） | 免費方案每日 1,000 寫入 / 100,000 讀取 / 1 GB 容量；僅儲存裝置推播訂閱 |
| GitHub REST API | 私人資料倉儲以 Bot PAT 讀寫，免費額度每小時 5,000 次請求 |
| 圖片與封包最佳化 | 前端上傳前自動縮圖（最大 1280px / 80% JPEG）；客戶端 JS+CSS gzip 約 106 KB |
| 效能基準與門檻 | 合成 fixture（Miniflare `/api/me` 50 次暖啟動樣本）要求 p95 `< 100ms`；正式環境延遲待真機／線上量測驗收（見 `04-mvp-release-gate.md`） |
