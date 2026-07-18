# 專案進度紀錄

> 用途：跨對話協作時，讓新的對話快速知道目前做到哪、卡在哪、下一步是什麼。
> 架構決策請看 [family-app-project-plan.md](family-app-project-plan.md)，這份只記錄「現在的實際狀態」。

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| Cloudflare Worker 後端（OAuth、CORS、GitHub Contents API 讀寫） | ✅ 已完成並部署，**登入正在從 GitHub OAuth 改成 Google OAuth**（見下方） |
| GitHub Pages 部署 pipeline（GitHub Actions） | ✅ 已跑通 |
| 前端登入/導覽框架 + UI 主題 | ✅ 已完成 |
| 佈告欄 / 食譜庫 / 點菜頁面 | ✅ 已實作（讀取 + 新增） |
| 食譜庫資料 | ✅ 已從手寫食譜目錄匯入 160 道菜（8 大分類），全部 `photoUrl: null`，等家人陸續補照片 |
| 佈告欄「編輯/刪除自己的留言」 | ❌ 尚未實作（只有新增） |

---

## ⚠️ 進行中：登入方式從 GitHub OAuth 改成 Google OAuth

**原因**：原始規劃（第 1 節）就寫「家人不一定有 GitHub 帳號，但都有 Google 帳號」，但 v1 實作卻選了 GitHub OAuth 登入——家人實測登入頁時卡在 GitHub 的「Create an account」，登不進去。改用 Google OAuth 才符合原始使用者輪廓。

**程式碼面已完成**（typecheck + build 都過，本地驗證過 callback 偵測邏輯）：
- Worker：`google-oauth.ts`（取代 `github-oauth.ts`）、`auth.ts` 改呼叫 Google 的 token/userinfo endpoint、`jwt.ts` 的 `SessionPayload` 多了 `name` 欄位（`sub` 現在是 Google 的不可讀 id，顯示要用 `name`）、`board.ts`/`recipes.ts` 的 `author`/`uploadedBy` 改用 `session.name`、`worker-configuration.d.ts` 的 `Env` 把 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` 換成 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- 前端：`googleOAuth.ts`（取代 `githubOAuth.ts`）、**拿掉了 `/auth/callback` 這條 hash route**——Google 的 redirect_uri 規則跟 GitHub 不同（見下方踩坑記錄），改成 `App.tsx` 在 router 掛載前先檢查網址有沒有 `?code=`，有的話直接渲染 `AuthCallback`（帶 `onDone` callback，而不是走路由）

**還沒做的（下一步接手要先做這些）**：
1. 你要去 **Google Cloud Console** 建立一個 OAuth Client（Web application 類型）
   - Authorized redirect URIs 填：`https://frobel0520.github.io/Family/`（注意**沒有** `#` 或任何路徑，就是首頁本身——Google 要求精確比對，不像 GitHub 只能填一組，Google 這邊可以同時加 `http://localhost:5173/` 方便本機測試）
2. 拿到 Client ID / Client Secret 後：
   - Client ID（非機密）：設定 GitHub repo variable `VITE_GOOGLE_CLIENT_ID`，並讓我知道我可以順便寫進 `frontend/.env.local`
   - Client Secret（機密）：你自己在 `worker/` 資料夾跑 `npx wrangler secret put GOOGLE_CLIENT_SECRET`（我不會幫你輸入機密）
   - Client ID 我可以幫你 `wrangler secret put GOOGLE_CLIENT_ID`（非機密，我可以代勞）
3. 舊的 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` Worker secrets 目前還留著沒刪（無害但是多餘），可以之後用 `wrangler secret delete` 清掉
4. `wrangler deploy` 部署新版 Worker、GitHub repo variable 設好後 push 前端，然後**完整實測一次登入**（這步一樣需要你本人在瀏覽器完成 Google 授權，AI 沒辦法代按）
5. GitHub OAuth App（`Family App`）現在沒用了，可以去 GitHub Settings 刪掉，或留著也不影響（不會再被呼叫）

---

## 帳號 / 服務資訊

- **GitHub repo**：https://github.com/frobel0520/Family（public）
- **GitHub Pages 網址**：https://frobel0520.github.io/Family/
- **Cloudflare 帳號**：frobel0520@gmail.com（用 Google 登入）
- **Worker 網址**：https://family-app-worker.frobel0520.workers.dev
- **Google OAuth Client**：還沒申請（見上方「進行中」）

## 已設定的 Secrets / Variables

**Worker secrets**（`worker/` 目錄下用 `wrangler secret put <NAME>` 設定，內容不在任何檔案裡，只存在 Cloudflare）：
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`（**待設定**——目前 Worker 上還是舊的 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`，程式碼已經不會再讀這兩個了）
- `GITHUB_BOT_PAT`（Fine-grained PAT，僅限這個 repo，僅 Contents 讀寫權限）
- `JWT_SECRET`（隨機字串，簽 session JWT 用）

**GitHub Actions repo variables**（Settings → Secrets and variables → Actions → Variables，用來在 build 時注入前端）：
- `VITE_GOOGLE_CLIENT_ID`（**待設定**，目前 repo variable 還是舊的 `VITE_GITHUB_CLIENT_ID`）
- `VITE_API_BASE_URL`

---

## 已踩過的坑（別重踩）

1. **GitHub Pages 沒有伺服器端路由**，直接導到深層路徑會 404，因為只有 `index.html` 是真實檔案。解法：用 `HashRouter` 做前端內部路由（`.../Family/#/board` 這種），完全在前端處理，不會打到伺服器。
2. **`HashRouter` 不能加 `basename`**。`basename` 是套用在 hash 之後的部分，不是真正的網址路徑；加了 `basename="/Family/"` 會讓所有路由都比對不到。現在 [main.tsx](frontend/src/main.tsx) 是不帶 basename 的寫法，之後不要加回去。
3. **Google OAuth 的 `redirect_uri` 不能帶 `#fragment`**，這跟 GitHub OAuth 不一樣——GitHub 那時我們把 callback 頁設計成 hash route（`#/auth/callback`），這招在 Google 這邊行不通，Google Cloud Console 甚至不會讓你登記一個帶 `#` 的 redirect URI。改法：redirect_uri 直接設成網站首頁本身（`https://frobel0520.github.io/Family/`），前端在 `App.tsx` 裡搶在 router 掛載前檢查網址有沒有 `?code=`，用一個 `pendingCallback` state 決定要渲染 `AuthCallback` 還是正常的 `Layout + Routes`，不再靠路由比對。**好處**：Google 允許同一個 OAuth Client 登記多組 redirect URI，所以正式站跟 `localhost` 可以共用一個 Client，不像 GitHub 需要另外申請一個「開發用」App。
4. **Wrangler CLI 在非互動式環境下遇到「是否要註冊 workers.dev 子網域」這種互動提示會自動選 no**，第一次 `wrangler deploy` 因此失敗，需要手動去 Cloudflare Dashboard（Workers & Pages → Account Details）設定一次子網域，之後才能正常部署。
5. **`npm create cloudflare` 產生的專案預設沒有 `@cloudflare/workers-types`**，要自己 `npm install -D @cloudflare/workers-types` 並在 `tsconfig.json` 加 `"types": ["@cloudflare/workers-types"]`。
6. **CORS 的 `ALLOWED_ORIGIN` 不要加路徑**，瀏覽器送出的 `Origin` header 只有 scheme+host，不包含 `/Family/`。這也代表**本機 `localhost:5173` 打正式 Worker 一定會被 CORS 擋掉**（`Failed to fetch`），是預期行為，不是 bug。
7. **`wrangler secret put` 用 PowerShell 管線（`|`）餵值時可能被自動加上尾端換行**，導致存進去的 secret 跟預期值對不起來（GitHub 端症狀是 token exchange 回 404，因為 client_id 尾巴多了看不見的字元、GitHub 認不出這個 App）。改用 Bash 的 `printf '%s' "value" | wrangler secret put NAME`（不會加換行）比較保險。

---

## 已解決：前端怎麼「讀」資料

Worker 有 `GET /api/board`、`GET /api/recipes`、`GET /api/orders`（公開、不用登入），內部一樣透過 GitHub Contents API 讀，不是讓前端直接打 `raw.githubusercontent.com`，避免 CDN 快取延遲（剛寫入的資料要等幾分鐘才會反映在 raw 檔案上）。食譜照片本身（圖片二進位檔）維持用 `raw.githubusercontent.com` 網址，圖片上傳後不會再變動，快取延遲不是問題。`photoUrl` 可能是 `null`（尚未拍照），前端用 `RecipePhoto` 元件顯示 🍽️ 預設圖示。

---

## 下一步（依優先順序）

1. **完成 Google OAuth 遷移**（見上方「進行中」清單）並實測登入
2. 佈告欄「編輯/刪除自己的留言」——Worker 目前只有新增（POST），`board.json` 的 `updatedAt` 欄位已經預留但沒用到
3. 陸續幫已匯入的 160 道菜補照片（現在都顯示預設圖示）
4. 校對 160 道菜裡幾個手寫字跡辨識不確定的品項（湯品 17/20/21/23、麵食 11、飯類 9/18 括號註記）——細節在 `data/recipes.json` 的 commit message 裡有提到

## 已知限制（暫不處理，非 bug）

- wrangler 目前是 3.114.17（有 4.x 可升級，是 breaking change），npm audit 有幾個僅影響本地開發工具鏈的弱點，使用者說先不處理
- 多人同時寫入衝突：v1 是「後寫入覆蓋」（沒有樂觀鎖），照規劃書就是預期行為
