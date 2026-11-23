# Family 同源部署公開效能實測紀錄（2026-11-23）

- **量測時間**：2026-11-23T05:59:17Z（2026-11-23 13:59 Asia/Taipei）
- **對應基準**：`main` commit `c87520b`（[ADR-001](../adr-001-worker-same-origin-frontend.md)、Issue #11）
- **測試環境**：macOS 本機 CLI（`curl` HTTP/2、匿名未登入、每次請求建立新 TCP/TLS 連線、無瀏覽器本地快取）
- **目標端點**：Family Worker 同源正式站（`FAMILY_APP_URL`，`/` 與 `/Family/`）

## 回應版本與安全標頭訊號

- **首頁 HTML（`GET /Family/`）**：
  - `HTTP 200`、`content-type: text/html`、`1,214 B`
  - `etag`: `"2e6971cea0fdd8b8ccf54bcabb868e99"`
  - 安全標頭：`content-security-policy` 存在、`x-frame-options: DENY`、`x-content-type-options: nosniff`
- **靜態資源指紋（HTML 引用）**：
  - `/Family/assets/index-ChK1XYZo.js`（`282,050 B`）
  - `/Family/assets/index-DpfTihir.css`（`21,903 B`）
- **根路徑轉址（`GET /`）**：
  - `HTTP 302` → `location: /Family/`，同樣帶有 `content-security-policy`、`x-frame-options: DENY`、`x-content-type-options: nosniff`

## 公開首頁與靜態資產量測結果

> 註：每筆樣本皆為獨立 `curl` 連線（含 TLS 握手時間），故數值反映「無瀏覽器快取、單次新連線」的端對端延遲；Cloudflare Edge 快取狀態皆標示於 `cf-cache-status`。

| 端點 | 樣本說明 | `cf-cache-status` | 大小 | TTFB p50 | TTFB p95 | Total p50 | Total p95 |
|---|---|---|---:|---:|---:|---:|---:|
| `GET /`（302 轉址） | 單次（n=1） | — | 0 B | 429.2 ms | — | 429.4 ms | — |
| `GET /Family/`（首筆） | 冷連線（n=1，DNS 3.1 ms / TLS 184.2 ms） | `HIT` | 1,214 B | 367.7 ms | — | 371.1 ms | — |
| `GET /Family/`（後續） | 暖邊緣快取（n=9） | `HIT` | 1,214 B | 382.2 ms | 1,147.7 ms | 382.8 ms | 1,148.2 ms |
| `GET /Family/assets/index-ChK1XYZo.js` | 首筆 628.9 ms；暖邊緣快取（n=5） | `HIT` | 282,050 B | 374.5 ms | — | 646.4 ms | 745.4 ms |
| `GET /Family/assets/index-DpfTihir.css` | 首筆 389.0 ms；暖邊緣快取（n=5） | `HIT` | 21,903 B | 384.1 ms | — | 394.9 ms | 489.0 ms |

### 觀察摘要

- 同源靜態資產均由 Cloudflare Edge `HIT` 提供，首頁 HTML 與 CSS 暖連線 p50 約 383–395 ms，主 JS bundle（~275 KiB）p50 約 646 ms（含每次新連線約 180–290 ms TLS 握手成本）。
- 本次小樣本中 `/Family/` 有一筆尾部離群值（`1,148.2 ms`），屬於網路抖動與新連線握手波動。

## 公開 API 與需授權量測項目

- 依 `worker/src/index.ts` 路由盤點，Family Worker **沒有未登入的公開唯讀 `/api/*` 端點**：所有資料 API 皆要求有效的 `__Host-family_session` HttpOnly cookie，`/api/image` 亦要求 HMAC 簽章。
- 為避免失真，**不以未登入的 `401`/`403` 拒絕回應或登入畫面推估已登入 API 延遲**。
- 以下項目仍需擁有者於已登入狀態下進行正式環境量測：
  1. `GET /api/me`（session 驗證與白名單檢查）正式環境 p50 / p95。
  2. `GET /api/board`、`GET /api/events`、`GET /api/recipes`（經由 GitHub 資料 repo 讀取）正式環境 p50 / p95。
  3. 實機瀏覽器冷／暖快取 FCP / LCP 與家人手機 PWA 流程實測（Issue #15）。
