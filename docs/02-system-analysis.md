# Family 系統分析（SA）

| 文件項目 | 內容 |
|---|---|
| 文件版本 | 1.0 |
| 文件日期 | 2026-11-14 |
| 狀態 | 依現況盤點補齊 |
| 專案級別 | 產品級 |

## 1. 角色與存取邊界

| 角色 | 認證來源 | 權限範圍 |
|---|---|---|
| 未核准 Google 帳號 | Google OAuth 2.0 | 登入時寫入 `data/access.json` 的 `pending` 佇列（上限 20 筆），回傳拒絕存取，無法讀取任何家庭資料 |
| 已核准家庭成員 | Google OAuth 2.0 + `approved` 名單 | 可讀寫留言板、食譜、點餐、行事曆、個人設定、訂閱推播與讀取簽章圖片 |
| 擁有者（Owner） | `OWNER_EMAIL`（Worker Secret） | 永久核准，另具備 `/api/admin/*` 權限可檢視與核准／拒絕 `pending` 申請 |

## 2. 核心業務流程

### 2.1 登入、授權與撤銷即時生效

1. 使用者於 `/Family/` 發起 Google OAuth 2.0 Authorization Code 流程，`redirect_uri` 鎖定為 Worker 自身的 `/Family/`。
2. Worker `/api/auth/callback` 向 Google 驗證授權碼取得 email，檢查是否為 `OWNER_EMAIL` 或存在於 `data/access.json` 的 `approved` 清單。
3. 核准者簽發 HS256 JWT（有效期 30 天），透過 `Set-Cookie: __Host-family_session`（`HttpOnly; Secure; SameSite=Strict; Path=/`）回傳；不再於 JSON 回應暴露 token。
4. 之後每次受保護請求，皆由 `requireSession` 即時向 `Family-data` 重讀 `data/access.json` 驗證 `isStillApproved`。若成員已被移除則立即回傳 `403`；若 GitHub 不可達則 fail closed 回傳 `503`。

### 2.2 留言板、食譜與圖片代理

- **留言與編輯**：支援發文（最多 9 張圖片，前端預先縮圖）、編輯文章內文（含版本衝突 `409` 處理）、刪除本人文章／留言、Emoji 回應切換。
- **食譜圖鑑**：8 種固定分類（`飯類`、`快炒／主菜`、`點心`、`滷味`、`麵食`、`炸物／烤物`、`飲料`、`湯品`）；上傳照片時於前端壓縮至最大 1280px / 80% JPEG。食譜名稱盤點現況與 7 筆待核對項目記錄於 [`recipe-name-review.md`](recipe-name-review.md)。
- **圖片能力簽章代理**：私人資料倉儲的圖片不直接公開，而是由後端產生含路徑、時間戳記與 24 小時效期的 HMAC-SHA256 簽章 URL，經 `/api/image` 代理回傳並標註 `Cache-Control: private, no-store`。

### 2.3 共用行事曆與自動推播

- 成員新增或更新事件時可指定提醒時間與推播對象；Cloudflare Cron（`*/5 * * * *`）定期掃描待提醒事件。
- 推播訂閱資訊存於 Cloudflare KV（`PUSH_SUBS`），由 Worker 以 WebCrypto 原生實作 RFC 8291（`aes128gcm`）與 RFC 8292（VAPID JWT）發送至各裝置。

## 3. 資料模型與契約（`frobel0520/Family-data`）

| 檔案路徑 | 結構與用途 |
|---|---|
| `data/access.json` | `{ approved: string[], pending: Array<{ email, name, avatar, requestedAt }> }` |
| `data/board.json` | 貼文陣列（含作者、內容、圖片、建立／更新時間、留言、Emoji 回應） |
| `data/recipes.json` | 食譜陣列（`id`、`name`、`category`、`photoUrl`、`uploadedBy`、`uploadedAt`） |
| `data/orders.json` | 點餐清單（`id`、`dishName`、`requestedBy`、`requestedByEmail`、`createdAt`、`done`） |
| `data/events.json` | 行事曆事件（`id`、`title`、`date`、`time`、`reminderTime`、`reminderRecipients`、`notifiedAt`） |
| `data/profiles.json` | 使用者暱稱與頭像對應表（以 email 為 key） |
| `images/recipes/*.jpg`、`images/board/*.jpg` | 圖片二進位檔，透過 `/api/image` 簽章代理讀取 |
| KV `PUSH_SUBS` | 以推播端點為 key 儲存的 Web Push 訂閱物件 |
