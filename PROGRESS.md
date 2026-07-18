# 專案進度紀錄

> 用途：跨對話協作時，讓新的對話快速知道目前做到哪、卡在哪、下一步是什麼。
> 架構決策請看 [family-app-project-plan.md](family-app-project-plan.md)，這份只記錄「現在的實際狀態」。

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| Cloudflare Worker 後端（OAuth、CORS、GitHub Contents API 寫入） | ✅ 已完成並部署 |
| GitHub Pages 部署 pipeline（GitHub Actions） | ✅ 已跑通 |
| 前端登入/導覽框架 | ✅ 已完成，正在做最後的登入流程實測 |
| 佈告欄 / 食譜庫 / 點菜頁面 | ❌ 尚未實作（只有佔位頁面） |

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
3. **Wrangler CLI 在非互動式環境下（例如自動化工具跑指令）遇到「是否要註冊 workers.dev 子網域」這種互動提示會自動選 no**，第一次 `wrangler deploy` 因此失敗，需要手動去 Cloudflare Dashboard（Workers & Pages → Account Details）設定一次子網域，之後才能正常部署。
4. **`npm create cloudflare` 產生的專案預設沒有 `@cloudflare/workers-types`**，要自己 `npm install -D @cloudflare/workers-types` 並在 `tsconfig.json` 加 `"types": ["@cloudflare/workers-types"]`，不然 `Request`/`Response`/`crypto` 等 runtime 全域型別都會編譯失敗。
5. **CORS 的 `ALLOWED_ORIGIN` 不要加路徑**，瀏覽器送出的 `Origin` header 只有 scheme+host（`https://frobel0520.github.io`），不包含 `/Family/`。

---

## 下一步（依優先順序）

1. **完整實測登入流程**：目前卡在剛修完 `HashRouter` 的 basename bug，需要 push 後重新在 https://frobel0520.github.io/Family/ 上點「登入」→ 完成 GitHub 授權 → 確認能導回首頁、顯示頭像/使用者名稱。
2. 佈告欄頁面：串接 `POST /api/board`，讀取 `data/board.json` 顯示列表（讀取目前規劃是直接 fetch repo 裡的 JSON 檔，還沒實作 GET API，見下方「待決定」）。
3. 食譜庫頁面：分類瀏覽 + 上傳（`POST /api/recipes`，已有 Worker API）。
4. 點菜頁面：分類搜尋 + 訂單清單（`POST /api/orders`，已有 Worker API）。
5. 佈告欄「編輯/刪除自己的留言」——Worker 目前只有新增（POST），編輯/刪除還沒寫。

## 待決定

- **前端要怎麼「讀」資料**：目前 Worker 只做了寫入（POST）路由，讀取（顯示佈告欄/食譜/訂單列表）還沒決定要新增 `GET /api/*` 路由，還是前端直接 fetch GitHub repo 裡的 raw JSON 檔（public repo 的話可以直接 `raw.githubusercontent.com` 讀，不需要經過 Worker，但要注意快取延遲）。做佈告欄頁面時要先拍板這個。
- wrangler 目前是 3.114.17（有 4.x 可升級，是 breaking change），npm audit 有幾個僅影響本地開發工具鏈的弱點，使用者說先不處理。
