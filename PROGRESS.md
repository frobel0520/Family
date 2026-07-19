# 專案進度紀錄

> 用途：跨對話協作時，讓新的對話快速知道目前做到哪、卡在哪、下一步是什麼。
> 架構決策請看 [family-app-project-plan.md](family-app-project-plan.md)，這份只記錄「現在的實際狀態」。

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| Cloudflare Worker 後端（Google OAuth、CORS、GitHub Contents API 讀寫） | ✅ 已完成並部署，登入已改成 Google OAuth 並實測成功 |
| 登入審核機制（同意/拒絕新申請，取代寫死白名單） | ✅ 已完成並實測成功（申請 → 審核頁核准 → 對方重新登入成功） |
| GitHub Pages 部署 pipeline（GitHub Actions） | ✅ 已跑通 |
| 前端登入/導覽框架 + UI 主題 | ✅ 已完成 |
| 佈告欄 / 食譜庫 / 點菜頁面 | ✅ 已實作（讀取 + 新增） |
| 食譜庫資料 | ✅ 已匯入 160 道菜（8 大分類），154 道有開放授權照片，剩 6 道等家人實拍 |
| 佈告欄「編輯/刪除自己的留言」 | ❌ 尚未實作（只有新增） |

---

## ✅ 已完成：登入審核機制（同意制，取代白名單）

**背景**：一開始做了 `ALLOWED_EMAILS`（Worker secret，逗號分隔的信任 email 清單）這個版本，但使用者不想手動維護一份寫死的名單，希望「有人嘗試登入時來問我同不同意」。所以整個換掉，改成審核佇列機制。**`ALLOWED_EMAILS`/`allowlist.ts` 那個版本已經完全移除，沒有部署過就被取代了。**

**設計**（兩層防護的第二層，第一層仍是 Google OAuth consent screen 的 Test users 名單）：
1. `OWNER_EMAIL`（Worker secret，只有你一個人的 email）——永遠放行，且只有這個帳號能核准/拒絕別人。這是必要的「起點」，不然你自己也進不去審核別人。
2. 其他人登入時：Worker 查 `data/access.json` 的 `approved` 清單，在裡面就放行；不在的話，如果還沒申請過，就把 email/name/頭像/時間寫進同一個檔案的 `pending` 佇列（等於在 repo 產生一個 commit），回應「已送出申請，請等待同意」，**不發 session**。
3. 你（`OWNER_EMAIL`）登入後，導覽列會多一個「🛡️ 審核」分頁（`/admin`，別人看不到也進不去），列出待審核名單，按「同意」會把對方 email 從 `pending` 移到 `approved`；按「拒絕」只從 `pending` 移除（之後對方還能再申請一次，v1 沒有「永久黑名單」機制）。

**注意這不是即時推播通知**——你要自己打開 App 看「審核」分頁才會看到新申請，沒有另外接 Email/簡訊/LINE 通知（使用者已確認這個版本可以接受，之後真的需要即時通知再說）。

**程式碼面已完成**（typecheck + build 都過，本地驗證過未登入時 `/admin` 會被擋）：
- Worker：`access.ts`（新檔案，`checkAccess`/`listPending`/`approveEmail`/`denyEmail`，資料存 `data/access.json`）、`routes/admin.ts`（`GET /api/admin/pending`、`POST /api/admin/approve`、`POST /api/admin/deny`，都要求 `session.isOwner`）、`session.ts` 多了 `requireOwner` helper、`jwt.ts` 的 `SessionPayload` 多了 `email`/`isOwner` 欄位、`github-contents.ts` 把陣列限定的 `readJsonArrayFile`/`updateJsonArrayFile` 通用化成 `readJsonFile`/`updateJsonFile`（給 `access.json` 這種物件結構用）、`worker-configuration.d.ts` 拿掉 `ALLOWED_EMAILS`、加了 `OWNER_EMAIL`
- 前端：`pages/Admin.tsx`（新頁面，未登入/非擁有者會看到對應提示而不是清單）、`Nav.tsx` 只有 `session.isOwner` 才會多顯示「審核」分頁、`api.ts` 加了 `listPendingRequests`/`approveRequest`/`denyRequest`、`Session` 型別多了 `isOwner`

**`OWNER_EMAIL` 已設定、Worker 已部署、完整流程已實測成功**（申請 → 擁有者在 `/admin` 核准 → 對方重新登入成功）。

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
- `OWNER_EMAIL`（你自己的 Google email，永遠放行 + 唯一審核者）⚠️ **待設定**，見上方「進行中」
- 舊的 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`（GitHub OAuth 遷移到 Google 後）已刪除
- `ALLOWED_EMAILS`（白名單版本，被審核機制取代）**從沒真正部署上線過**，如果你當時有跑過 `wrangler secret put ALLOWED_EMAILS`，記得順手 `wrangler secret delete` 清掉

**GitHub Actions repo variables**（Settings → Secrets and variables → Actions → Variables，用來在 build 時注入前端）：
- `VITE_GOOGLE_CLIENT_ID` ✅ 已設定
- `VITE_API_BASE_URL` ✅

---

## 已踩過的坑（別重踩）

1. **GitHub Pages 沒有伺服器端路由**，直接導到深層路徑會 404，因為只有 `index.html` 是真實檔案。解法：用 `HashRouter` 做前端內部路由（`.../Family/#/board` 這種），完全在前端處理，不會打到伺服器。
2. **`HashRouter` 不能加 `basename`**。`basename` 是套用在 hash 之後的部分，不是真正的網址路徑；加了 `basename="/Family/"` 會讓所有路由都比對不到。現在 [main.tsx](frontend/src/main.tsx) 是不帶 basename 的寫法，之後不要加回去。
3. **Google OAuth 的 `redirect_uri` 不能帶 `#fragment`**，這跟 GitHub OAuth 不一樣。改法：redirect_uri 直接設成網站首頁本身（`https://frobel0520.github.io/Family/`），前端在 `App.tsx` 裡搶在 router 掛載前檢查網址有沒有 `?code=`，用一個 `pendingCallback` state 決定要渲染 `AuthCallback` 還是正常的 `Layout + Routes`，不再靠路由比對。**好處**：Google 允許同一個 OAuth Client 登記多組 redirect URI，正式站跟 `localhost` 可以共用一個 Client。
4. **Google OAuth consent screen 在 Testing 狀態時，只有 Test users 名單上的帳號能登入**——這跟 Worker 自己的審核機制（`OWNER_EMAIL` + `access.json`）是分開的兩件事，要分別維護。
5. **Wrangler CLI 在非互動式環境下遇到「是否要註冊 workers.dev 子網域」這種互動提示會自動選 no**，第一次 `wrangler deploy` 因此失敗，需要手動去 Cloudflare Dashboard（Workers & Pages → Account Details）設定一次子網域，之後才能正常部署。
6. **`npm create cloudflare` 產生的專案預設沒有 `@cloudflare/workers-types`**，要自己 `npm install -D @cloudflare/workers-types` 並在 `tsconfig.json` 加 `"types": ["@cloudflare/workers-types"]`。
7. **CORS 的 `ALLOWED_ORIGIN` 不要加路徑**，瀏覽器送出的 `Origin` header 只有 scheme+host，不包含 `/Family/`。這也代表**本機 `localhost:5173` 打正式 Worker 一定會被 CORS 擋掉**（`Failed to fetch`），是預期行為，不是 bug。
8. **`wrangler secret put` 用 PowerShell 管線（`|`）餵值時可能被自動加上尾端換行**，導致存進去的 secret 跟預期值對不起來（症狀：token exchange 回 404，因為 client_id 尾巴多了看不見的字元）。改用 Bash 的 `printf '%s' "value" | wrangler secret put NAME`（不會加換行）比較保險。

---

## 已解決：前端怎麼「讀」資料

Worker 有 `GET /api/board`、`GET /api/recipes`、`GET /api/orders`（公開、不用登入），內部一樣透過 GitHub Contents API 讀，不是讓前端直接打 `raw.githubusercontent.com`，避免 CDN 快取延遲（剛寫入的資料要等幾分鐘才會反映在 raw 檔案上）。食譜照片本身（圖片二進位檔）維持用 `raw.githubusercontent.com` 網址，圖片上傳後不會再變動，快取延遲不是問題。`photoUrl` 可能是 `null`（尚未拍照），前端用 `RecipePhoto` 元件顯示 🍽️ 預設圖示。

---

## 照片補齊進度（開放授權圖，Wikimedia 一輪 + Openverse 兩輪）

**154/160 道有照片**（Wikimedia Commons 輪 62 張 + Openverse 兩輪 70 張 + Openverse 第三輪「形象相近即可」22 張——使用者明確同意通用圖，例如奶蓋配珍奶圖、烏龍綠茶配茶葉照）。做法：每道菜用英文關鍵字搜 → 下載候選圖 → 拼對照表 → **逐張人工目視確認才套用**（自動配對錯誤率約一半，出現過「三杯雞」配到廟宇柱子、「厚切牛排」配到真空包生肉、「蜂蜜檸檬汁」配到抽象畫這種結果，人工確認不能省）→ 裁成 800x800 存 `images/recipes/{id}.jpg`，出處記在 `photoCredit`。

Openverse 輪的技術備忘：匿名 API 限 20 次/分、200 次/天，搜尋間隔要 sleep 3.3 秒；**Windows console 是 cp950，print 中文菜名（如「韮」字）會 UnicodeEncodeError，Python 腳本開頭要 `sys.stdout.reconfigure(encoding="utf-8")`**；結果要逐筆寫 jsonl 才能斷點續跑（第一版跑到一半炸掉整批重來過）。第二輪用「相似菜色就好」的寬鬆關鍵字（使用者同意圖片不用完全一樣），命中率比精準關鍵字高很多。

**出處標示已改版**：卡片上不再疊小字連結（使用者嫌影響美觀），改成 `PhotoCredits` 元件收合在食譜庫／點菜頁最底部，集中列出全部開放授權圖的作者＋授權＋連結（CC BY 系列授權要求標示，不能整個拿掉，收合區塊是美觀與合規的折衷）。

沒圖的最後 6 道（三輪都找不到像樣的圖）：炒菇類、滷虱目魚、香煎雞胸肉、水煮雞胸肉、韮菜炒鴨血、蜂蜜檸檬汁，等家人實拍。

## 下一步（依優先順序）

1. 佈告欄「編輯/刪除自己的留言」——Worker 目前只有新增（POST），`board.json` 的 `updatedAt` 欄位已經預留但沒用到
2. 剩下 6 道沒照片的菜等家人上傳實拍（上傳會自動蓋掉預設圖示；有 photoCredit 的圖被家人的實拍蓋掉也沒關係）
3. 校對 160 道菜裡幾個手寫字跡辨識不確定的品項（湯品 17/20/21/23、麵食 11、飯類 9/18 括號註記）——細節在 `data/recipes.json` 的 commit message 裡有提到

## 已知限制（暫不處理，非 bug）

- wrangler 目前是 3.114.17（有 4.x 可升級，是 breaking change），npm audit 有幾個僅影響本地開發工具鏈的弱點，使用者說先不處理
- 多人同時寫入衝突：v1 是「後寫入覆蓋」（沒有樂觀鎖），照規劃書就是預期行為
- 「拒絕」申請只是從待審核移除，沒有黑名單機制，被拒絕的人還能再申請一次
- 審核不是即時推播通知，擁有者要自己打開 App 檢查「審核」分頁才會看到新申請
