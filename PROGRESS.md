# 專案進度紀錄

> 用途：跨對話協作時，讓新的對話快速知道目前做到哪、卡在哪、下一步是什麼。
> 架構決策請看 [family-app-project-plan.md](family-app-project-plan.md)，這份只記錄「現在的實際狀態」。

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| Cloudflare Worker 後端（Google OAuth、CORS、GitHub Contents API 讀寫） | ✅ 已完成並部署，登入已改成 Google OAuth 並實測成功 |
| Email 白名單（防止不信任的人登入） | ⚠️ 程式碼已寫好、待部署 + 待你設定 `ALLOWED_EMAILS` secret（見下方「進行中」） |
| GitHub Pages 部署 pipeline（GitHub Actions） | ✅ 已跑通 |
| 前端登入/導覽框架 + UI 主題 | ✅ 已完成 |
| 佈告欄 / 食譜庫 / 點菜頁面 | ✅ 已實作（讀取 + 新增） |
| 食譜庫資料 | ✅ 已從手寫食譜目錄匯入 160 道菜（8 大分類），全部 `photoUrl: null`，等家人陸續補照片 |
| 佈告欄「編輯/刪除自己的留言」 | ❌ 尚未實作（只有新增） |

---

## ⚠️ 進行中：Email 白名單（限制誰能登入）

**背景**：Google OAuth 遷移完成、實測登入成功後，使用者問「怎麼確保只有信任的人能用」。設計成兩層防護：

1. **Google OAuth consent screen 的 Test users 名單**（Google 側、網頁上設定）——不在名單上的人連 Google 登入畫面都過不去。上限 100 人，且不在 repo 裡、容易忘記維護。
2. **Worker 自己再驗證一次 email**（程式碼側，這次新加的）——即使 Google 登入成功，Worker 拿到 email 後會比對 `ALLOWED_EMAILS` 這個 secret（逗號分隔的信任 email 清單），不在名單上就回 403，不發 session。

**程式碼面已完成**（typecheck 過）：
- `google-oauth.ts`：`GoogleUser` 多了 `email` 欄位（原本只有 id/name/avatar）
- `allowlist.ts`（新檔案）：`isAllowedEmail(env, email)`，大小寫不敏感比對
- `auth.ts`：拿到 Google user 後，登入前先檢查 `isAllowedEmail`，不通過回 403 `{"error":"此帳號未被授權使用這個家庭應用程式"}`
- `worker-configuration.d.ts` 的 `Env` 多了 `ALLOWED_EMAILS: string`
- `ALLOWED_EMAILS` 刻意存成 **Worker secret**（不是 `wrangler.jsonc` 的 `vars`），因為這個 repo 是公開的，家人的 email 不該進版控

**還沒做的（下一步接手要先做這些）**：
1. 你要在 `worker/` 資料夾自己跑 `npx wrangler secret put ALLOWED_EMAILS`，輸入逗號分隔的信任 email 清單（例如 `me@gmail.com,sister@gmail.com`）——這是個人資料，Claude 不會幫忙輸入
2. `npx wrangler deploy` 部署這次的改動（在 `worker/` 資料夾）
3. 部署後測試：用不在白名單的帳號登入應該收到 403；白名單內的帳號應該正常登入
4. 別忘了同時去 Google Cloud Console 的 OAuth consent screen 把每個家人的 Google email 加進 **Test users**（不然他們連 Google 登入畫面都過不去，跟 Worker 的白名單是不同機制、要分別設定）

---

## 帳號 / 服務資訊

- **GitHub repo**：https://github.com/frobel0520/Family（public）
- **GitHub Pages 網址**：https://frobel0520.github.io/Family/
- **Cloudflare 帳號**：frobel0520@gmail.com（用 Google 登入）
- **Worker 網址**：https://family-app-worker.frobel0520.workers.dev
- **Google OAuth Client**：已建立（Web application），redirect URIs 含正式站 + `localhost:5173`

## 已設定的 Secrets / Variables

**Worker secrets**（`worker/` 目錄下用 `wrangler secret put <NAME>` 設定，內容不在任何檔案裡，只存在 Cloudflare）：
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ✅ 已設定，登入已實測成功
- `GITHUB_BOT_PAT`（Fine-grained PAT，僅限這個 repo，僅 Contents 讀寫權限）✅
- `JWT_SECRET`（隨機字串，簽 session JWT 用）✅
- `ALLOWED_EMAILS`（逗號分隔信任 email 清單）⚠️ **待設定**，見上方「進行中」
- 舊的 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` 已刪除（GitHub OAuth 遷移到 Google 後不再需要）

**GitHub Actions repo variables**（Settings → Secrets and variables → Actions → Variables，用來在 build 時注入前端）：
- `VITE_GOOGLE_CLIENT_ID` ✅ 已設定
- `VITE_API_BASE_URL` ✅

---

## 已踩過的坑（別重踩）

1. **GitHub Pages 沒有伺服器端路由**，直接導到深層路徑會 404，因為只有 `index.html` 是真實檔案。解法：用 `HashRouter` 做前端內部路由（`.../Family/#/board` 這種），完全在前端處理，不會打到伺服器。
2. **`HashRouter` 不能加 `basename`**。`basename` 是套用在 hash 之後的部分，不是真正的網址路徑；加了 `basename="/Family/"` 會讓所有路由都比對不到。現在 [main.tsx](frontend/src/main.tsx) 是不帶 basename 的寫法，之後不要加回去。
3. **Google OAuth 的 `redirect_uri` 不能帶 `#fragment`**，這跟 GitHub OAuth 不一樣——GitHub 那時我們把 callback 頁設計成 hash route（`#/auth/callback`），這招在 Google 這邊行不通，Google Cloud Console 甚至不會讓你登記一個帶 `#` 的 redirect URI。改法：redirect_uri 直接設成網站首頁本身（`https://frobel0520.github.io/Family/`），前端在 `App.tsx` 裡搶在 router 掛載前檢查網址有沒有 `?code=`，用一個 `pendingCallback` state 決定要渲染 `AuthCallback` 還是正常的 `Layout + Routes`，不再靠路由比對。**好處**：Google 允許同一個 OAuth Client 登記多組 redirect URI，所以正式站跟 `localhost` 可以共用一個 Client，不像 GitHub 需要另外申請一個「開發用」App。
4. **Google OAuth consent screen 在 Testing 狀態時，只有 Test users 名單上的帳號能登入**——這是額外要記得維護的一層，跟 Worker 自己的 `ALLOWED_EMAILS` 白名單是分開的兩件事。
5. **Wrangler CLI 在非互動式環境下遇到「是否要註冊 workers.dev 子網域」這種互動提示會自動選 no**，第一次 `wrangler deploy` 因此失敗，需要手動去 Cloudflare Dashboard（Workers & Pages → Account Details）設定一次子網域，之後才能正常部署。
6. **`npm create cloudflare` 產生的專案預設沒有 `@cloudflare/workers-types`**，要自己 `npm install -D @cloudflare/workers-types` 並在 `tsconfig.json` 加 `"types": ["@cloudflare/workers-types"]`。
7. **CORS 的 `ALLOWED_ORIGIN` 不要加路徑**，瀏覽器送出的 `Origin` header 只有 scheme+host，不包含 `/Family/`。這也代表**本機 `localhost:5173` 打正式 Worker 一定會被 CORS 擋掉**（`Failed to fetch`），是預期行為，不是 bug。
8. **`wrangler secret put` 用 PowerShell 管線（`|`）餵值時可能被自動加上尾端換行**，導致存進去的 secret 跟預期值對不起來（症狀：token exchange 回 404，因為 client_id 尾巴多了看不見的字元）。改用 Bash 的 `printf '%s' "value" | wrangler secret put NAME`（不會加換行）比較保險。

---

## 已解決：前端怎麼「讀」資料

Worker 有 `GET /api/board`、`GET /api/recipes`、`GET /api/orders`（公開、不用登入），內部一樣透過 GitHub Contents API 讀，不是讓前端直接打 `raw.githubusercontent.com`，避免 CDN 快取延遲（剛寫入的資料要等幾分鐘才會反映在 raw 檔案上）。食譜照片本身（圖片二進位檔）維持用 `raw.githubusercontent.com` 網址，圖片上傳後不會再變動，快取延遲不是問題。`photoUrl` 可能是 `null`（尚未拍照），前端用 `RecipePhoto` 元件顯示 🍽️ 預設圖示。

---

## 下一步（依優先順序）

1. **完成 Email 白名單設定**（見上方「進行中」清單）並實測 403 擋人 + 白名單內帳號正常登入
2. 佈告欄「編輯/刪除自己的留言」——Worker 目前只有新增（POST），`board.json` 的 `updatedAt` 欄位已經預留但沒用到
3. 陸續幫已匯入的 160 道菜補照片（現在都顯示預設圖示）
4. 校對 160 道菜裡幾個手寫字跡辨識不確定的品項（湯品 17/20/21/23、麵食 11、飯類 9/18 括號註記）——細節在 `data/recipes.json` 的 commit message 裡有提到

## 已知限制（暫不處理，非 bug）

- wrangler 目前是 3.114.17（有 4.x 可升級，是 breaking change），npm audit 有幾個僅影響本地開發工具鏈的弱點，使用者說先不處理
- 多人同時寫入衝突：v1 是「後寫入覆蓋」（沒有樂觀鎖），照規劃書就是預期行為
