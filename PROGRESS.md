# 專案進度紀錄

> 用途：跨對話協作時，讓新的對話快速知道目前做到哪、卡在哪、下一步是什麼。
> 架構決策請看 [family-app-project-plan.md](family-app-project-plan.md)，這份只記錄「現在的實際狀態」。

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| Cloudflare Worker 後端（OAuth、CORS、GitHub Contents API 讀寫） | ✅ 已完成並部署 |
| GitHub Pages 部署 pipeline（GitHub Actions） | ✅ 已跑通 |
| 前端登入/導覽框架 | ✅ 已完成，OAuth 流程本身已修過兩個 bug（見下方「已踩過的坑」） |
| 佈告欄 / 食譜庫 / 點菜頁面 | ✅ 已實作（讀取 + 新增），**尚未實測「登入後才能做的操作」**（留言、上傳食譜、點菜）——需要真人在瀏覽器裡完成 GitHub Authorize 那步，AI 無法代按 |
| 佈告欄「編輯/刪除自己的留言」 | ❌ 尚未實作（只有新增） |

---

## 帳號 / 服務資訊

- **GitHub repo**：https://github.com/frobel0520/Family（public）
- **GitHub Pages 網址**：https://frobel0520.github.io/Family/
- **Cloudflare 帳號**：frobel0520@gmail.com（用 Google 登入）
- **Worker 網址**：https://family-app-worker.frobel0520.workers.dev
- **GitHub OAuth App**：名稱 `Family App`，Client ID `Ov23liAviw6rgnugOBMi`
  - Callback URL 目前設定為 `https://frobel0520.github.io/Family/#/auth/callback`（注意有 `#`，見下方「已踩過的坑」）
  - Classic OAuth App 只能登記一組 callback URL，如果要在 `localhost` 本機測登入，需要另外申請一個「開發用」OAuth App

## 已設定的 Secrets / Variables

**Worker secrets**（`worker/` 目錄下用 `wrangler secret put <NAME>` 設定，內容不在任何檔案裡，只存在 Cloudflare）：
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_BOT_PAT`（Fine-grained PAT，僅限這個 repo，僅 Contents 讀寫權限）
- `JWT_SECRET`（隨機字串，簽 session JWT 用）

**GitHub Actions repo variables**（Settings → Secrets and variables → Actions → Variables，用來在 build 時注入前端）：
- `VITE_GITHUB_CLIENT_ID`
- `VITE_API_BASE_URL`

---

## 已踩過的坑（別重踩）

1. **GitHub Pages 沒有伺服器端路由**，直接導到深層路徑（例如 OAuth 導回 `/Family/auth/callback`）會 404，因為只有 `index.html` 是真實檔案。解法：改用 `HashRouter`（網址變成 `.../Family/#/auth/callback`），完全在前端處理，不會打到伺服器。
2. **`HashRouter` 不能加 `basename`**。`basename` 是套用在 hash 之後的部分，不是真正的網址路徑；加了 `basename="/Family/"` 會讓所有路由都比對不到（因為 Link 產生的是 `#/board` 而不是 `#/Family/board`），首頁看起來正常但所有導覽/callback 都失效。現在 [main.tsx](frontend/src/main.tsx) 是不帶 basename 的寫法，之後不要加回去。
3. **`HashRouter` 底下 `useSearchParams()` 讀不到 GitHub 回傳的 `code`**。GitHub 把 `?code=...&state=...` 加在網址的 `#` **之前**（標準查詢字串位置），但 react-router 的 `useSearchParams()` 在 HashRouter 模式下只解析 `#` **之後**的內容，所以永遠讀不到。[AuthCallback.tsx](frontend/src/pages/AuthCallback.tsx) 現在改成直接讀 `window.location.search`，不要改回 `useSearchParams()`。
4. **Wrangler CLI 在非互動式環境下（例如自動化工具跑指令）遇到「是否要註冊 workers.dev 子網域」這種互動提示會自動選 no**，第一次 `wrangler deploy` 因此失敗，需要手動去 Cloudflare Dashboard（Workers & Pages → Account Details）設定一次子網域，之後才能正常部署。
5. **`npm create cloudflare` 產生的專案預設沒有 `@cloudflare/workers-types`**，要自己 `npm install -D @cloudflare/workers-types` 並在 `tsconfig.json` 加 `"types": ["@cloudflare/workers-types"]`，不然 `Request`/`Response`/`crypto` 等 runtime 全域型別都會編譯失敗。
6. **CORS 的 `ALLOWED_ORIGIN` 不要加路徑**，瀏覽器送出的 `Origin` header 只有 scheme+host（`https://frobel0520.github.io`），不包含 `/Family/`。這也代表**本機 `localhost:5173` 打正式 Worker 一定會被 CORS 擋掉**（`Failed to fetch`），這是預期行為不是 bug——本機開發時 GET 讀取類的功能沒辦法測，只能部署到 Pages 後在正式網址測。

---

## 已解決：前端怎麼「讀」資料

Worker 加了 `GET /api/board`、`GET /api/recipes`、`GET /api/orders`（公開、不用登入），內部一樣透過 GitHub Contents API 讀，不是讓前端直接打 `raw.githubusercontent.com`。理由：避免 CDN 快取延遲——如果直接讀 raw 檔案，剛寫入的資料可能要等幾分鐘才會反映在 `raw.githubusercontent.com` 上，體驗會很奇怪（自己剛留言卻看不到）。食譜照片本身（圖片二進位檔）維持用 `raw.githubusercontent.com` 的網址，因為圖片上傳後不會再變動，快取延遲不是問題。

---

## 下一步（依優先順序）

1. **實測「登入後才能做的操作」**：佈告欄留言、食譜上傳、點菜——這三個都需要真人在瀏覽器完成 GitHub Authorize，AI 沒辦法代按，需要你回來後在 https://frobel0520.github.io/Family/ 上實際跑一次。
2. 佈告欄「編輯/刪除自己的留言」——Worker 目前只有新增（POST），編輯/刪除還沒寫，`board.json` 的 `updatedAt` 欄位已經預留但沒用到。
3. UI/視覺風格還很陽春（純功能，沒有特別設計），規劃書 7 節提到之後要處理。
4. 手機版排版目前只有基本的 `@media` 斷點（nav 換行），沒有針對食譜格狀排版等做手機優化。

## 已知限制（暫不處理，非 bug）

- wrangler 目前是 3.114.17（有 4.x 可升級，是 breaking change），npm audit 有幾個僅影響本地開發工具鏈的弱點，使用者說先不處理。
- 多人同時寫入衝突：v1 是「後寫入覆蓋」（沒有樂觀鎖），照規劃書就是預期行為。
