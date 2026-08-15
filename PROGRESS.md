# 專案進度紀錄

> 用途：跨對話協作時，讓新的對話快速知道目前做到哪、卡在哪、下一步是什麼。
> 架構決策請看 [family-app-project-plan.md](family-app-project-plan.md)，這份只記錄「現在的實際狀態」。

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| Cloudflare Worker 後端（Google OAuth、CORS、GitHub Contents API 讀寫） | ✅ 已完成並部署，登入已改成 Google OAuth 並實測成功 |
| 登入審核機制（同意/拒絕新申請，取代寫死白名單） | ✅ 已完成並實測成功（申請 → 審核頁核准 → 對方重新登入成功） |
| 記住登入（不用每天重登） | ✅ 已完成並部署（2026-07-25 實作，已隨後續 Worker 部署上線）：session 從 24h 改成 30 天＋開 App 自動續期（`POST /api/auth/refresh`），詳見下方「記住登入」章節 |
| GitHub Pages 部署 pipeline（GitHub Actions） | ✅ 已跑通 |
| 前端登入/導覽框架 + UI 主題 | ✅ 已完成 |
| 佈告欄 / 食譜庫 / 點菜頁面 | ✅ 已實作（讀取 + 新增）。食譜庫已改版：菜色圖固定用插畫（移除菜色照片上傳）；新增「食譜圖」功能——登入者可對每道菜上傳手寫食譜照片（卡片角落「＋食譜」），有食譜圖的卡片顯示「📖 食譜」按鈕點開彈窗看圖（`recipeUrl` 欄位、`POST /api/recipes/recipe-image`）。新增菜色只填菜名＋分類（＋可選食譜圖），菜色圖之後補插畫。後續 UI 調整：「食譜庫」改名「食譜」；新增菜色表單收在標題旁的「＋」圓鈕（送出後自動收合）；訂單項目可按「完成訂單」移除（登入即可，API 仍是 `POST /api/orders/delete`）；**2026-07-25：訂單列表顯示點餐人＋點餐時間**（詳見下方章節）；食譜圖可在彈窗內「更換圖片」。**2026-07-25：食譜圖上傳改成先縮到最長邊 1600 的 JPEG**（原本原圖直傳，平均一張 2.9 MB，詳見下方「食譜圖改成縮圖上傳 + 空間用量盤點」） |
| 食譜庫資料 | ✅ 已匯入 160 道菜（8 大分類），**160/160 全部為自製扁平風插畫**（照片已全數汰換，0 張授權照片；`PhotoCredits` 頁尾區塊在沒有授權圖時會自動隱藏），家人實拍可隨時覆蓋 |
| 佈告欄「刪除自己的貼文」 | ✅ 已實作（本人或擁有者可按 ✕ 刪，`POST /api/board/delete`）；「編輯」仍未做 |
| 佈告欄「貼文底下留言」 | ✅ 已實作（2026-07-19）：留言存在貼文物件的 `comments` 陣列（`POST /api/board/comment` 新增、`POST /api/board/comment/delete` 刪除，刪除限本人或擁有者）。貼文與留言都存 `avatar` 欄位並顯示頭像＋名稱＋時間（舊資料沒有 `avatar`/`comments` 欄位，前端用名字首字當替代頭像、留言區顯示為空，相容無誤）。已部署（2026-07-19，Worker + Pages 都上線並煙霧測試通過） |
| 刪除操作的確認彈窗 | ✅ 已實作（2026-07-19）：新增共用 `ConfirmDialog` 元件（`frontend/src/components/ConfirmDialog.tsx`），佈告欄刪貼文/刪留言、點菜刪訂單（原本完全沒確認）都套用；取代原本的 `window.confirm`。已部署（2026-07-19） |
| PWA：安裝到主畫面 | ✅ 已完成並部署（2026-07-19）：`manifest.webmanifest`（standalone、`/Family/` scope）、自製小屋圖示（192/512/apple-touch-icon，scratchpad SVG 轉出）、極簡 Service Worker（`public/sw.js`，**刻意不做離線快取**避免舊版前端卡快取，只留 push/notificationclick handler）、`/install` 安裝教學頁（iOS/Android 分平台步驟 + Android `beforeinstallprompt` 一鍵安裝） |
| 佈告欄「發文附圖」 | ✅ 已完成並部署（2026-07-19）：發文可附一張圖（也可以只有圖沒文字）。前端 canvas 等比縮到最長邊 1280 的 JPEG（`fileToResizedJpegDataUrl`）再送 base64；Worker 存 `images/board/<postId>.jpg`（先傳圖成功才寫 board.json，不會有半套狀態），board.json 存 repo 相對路徑 `imagePath`，回傳前端時轉成 `imageUrl`（raw URL，貼文不可改圖所以不用快取破壞參數）。貼文圖點擊放大（重用 recipe-modal-backdrop 燈箱）。刪貼文**不會**刪掉 repo 裡的圖片檔（孤兒圖，家庭規模可接受，公開 repo 本來就看得到）。**2026-07-25 改成一次可傳多張（上限 9 張）**：詳見下方「✅ 已完成：貼文／留言多張附圖」 |
| 留言附圖 + 留言收合 | ✅ 已完成並部署（2026-07-19）：留言比照貼文可附一張圖（同樣可以只有圖沒文字），存 `images/board/comments/<commentId>.jpg`，`BoardComment` 多 `imagePath`/`imageUrl`。留言區收合仿 Facebook：`Board.tsx` 的 `COLLAPSE_THRESHOLD=3`／`COLLAPSED_VISIBLE_COUNT=2`，超過 3 則只露出最新 2 則＋「查看全部 N 則留言」，點了才整串展開並可「收合留言」；剛送出留言後該貼文會自動展開（不然使用者會以為自己的留言消失了）。點留言圖也能放大（跟貼文圖共用同一個燈箱 state）。**2026-07-25 起留言同樣可以一次傳多張（上限 9 張）** |
| 設定頁（`/settings`，原 `/install` 改名並保留舊路由） | ✅ 已完成並部署（2026-07-19）：三區塊＝👤 個人資料（暱稱＋大頭貼）、🔔 通知開關、📲 安裝教學。暱稱/自訂大頭貼存 `data/profiles.json`（key=email 小寫），大頭貼傳 `images/avatars/<sha256(email) 前 16 hex>.jpg`（前端 canvas 裁 256x256 JPEG 再上傳）。**登入時套用**（`routes/auth.ts` 讀 profile → JWT 的 name/avatar 就是生效值，發文留言點菜自動用暱稱）；JWT 另存 `googleName`/`googleAvatar` 供「清除暱稱／改回 Google 大頭貼」還原。`POST /api/profile` 會**重簽 session 回傳**，前端 `applySessionResponse` 即時套用不用重登。貼文/留言新增 `authorEmail` 欄位，刪除權限改用 email 比對（暱稱改名不影響），舊資料 fallback 名字比對 |
| 推播通知（Web Push） | ✅ 已完成並部署（2026-07-19）：純 WebCrypto 實作 RFC 8291 aes128gcm 加密 + RFC 8292 VAPID（`worker/src/web-push.ts`，**有 vitest 測試對照 RFC 8291 附錄 A 官方向量**，不用 Node 專用的 npm web-push）。訂閱存 Cloudflare KV（binding `PUSH_SUBS`，id `4b6a850c...`，一台裝置一筆，key = `sub:<b64url endpoint>`，發送遇 404/410 自動清除失效訂閱）。VAPID 私鑰 = secret `VAPID_PRIVATE_JWK`，公鑰在 `wrangler.jsonc` vars + `frontend/src/push.ts` 各一份（**兩邊要一致**）。觸發點（都 `ctx.waitUntil` 背景送、排除觸發者本人）：新貼文/新留言→全員、點菜→全員、新登入申請→僅擁有者。前端開關在設定頁「🔔 通知」區塊。**通知外觀**（2026-07-19 補）：payload 帶 `tag`（board/orders/admin，同 tag 在 Android 摺疊成一則、SW 用 `getNotifications({tag})` 疊加「還有 N 則」計數）＋ `icon`（觸發者大頭貼當縮圖）；`public/badge.png` 是透明底白色小屋剪影（Android 狀態列 badge 必須單色透明底，彩色圖會變一片白）。**iOS 全部不適用**：通知圖示固定是 App 圖示、不能自訂縮圖，堆疊由系統自動做。**App 圖示紅點**（2026-07-20 補，家人反饋要求）：Badging API（`navigator.setAppBadge()`，不帶數字，單純一個點），`sw.js` 收到 push 就設、`notificationclick` 或前端 `main.tsx` 偵測到 App 開啟/切回前景就清掉。**只有 Android 支援**——iOS Safari 完全沒實作這個標準（跟 Web Push 不一樣，那個 iOS 有做），呼叫在 iOS 上安靜失敗，iPhone 家人只能靠推播通知本身，圖示不會有紅點。**2026-07-20 追加討論**：家人全部是 iPhone，問能不能做類似效果。研究結論：**PWA 在 iOS 上沒有任何辦法（不只紅點，任何形式）在主畫面圖示旁邊顯示標記**——WebKit 完全沒開放這個能力，不是技術難度問題，沒有 workaround。曾提出「在 App 內導覽列做未讀提示」當次優解（做到一半，程式碼已還原、沒有留在專案裡），但使用者要的明確是「圖示旁邊」，這個退而求其次的方案不符合需求，故不採用。**真正能做到的唯一路徑是包成原生 App**（例如用 Capacitor 包現有網頁），代價是要加入 Apple Developer Program（US$99/年）＋ TestFlight／App Store 上架＋家人要重新安裝——這正是當初選 PWA 想避開的成本，使用者確認**不做**，維持現在的 PWA 版本。iPhone 家人的新內容提醒目前只能靠推播通知本身（鎖屏/通知中心），圖示旁邊沒有標記是已知且不會解決的限制 |
| 佈告欄「表情回應」 | ✅ 已完成並部署（2026-08-15）：貼文下方 👍 ❤️ 😂 😮 🙏，一人一則貼文只有一個表情（按同一個＝取消、按別的＝換掉），存在 `board.json` 每則貼文的 `reactions` 陣列，只通知貼文作者本人。詳見下方「貼文表情回應」章節 |
| **行事曆 + 提醒**（新分頁 `/calendar`） | ✅ 已完成並部署（2026-08-15）：大家都能編輯的共用行事曆，活動可勾選「要提醒誰」＋自己指定提醒時間，Cloudflare Cron Trigger 每 5 分鐘掃一次只推給被勾選的人。新增 `data/events.json` 與 `GET /api/family`（家人名單）。詳見下方「家庭行事曆 + 自訂提醒」章節 |
| **隱私：所有內容只有登入的家人能看** | ✅ 已完成並部署（2026-07-20）。背景：登入機制原本只擋「打 Worker API 的請求」，但 repo 是 public，圖片走 `raw.githubusercontent.com`、`GET /api/board`\|`recipes`\|`orders` 也不用登入，等於任何人知道網址就能完全繞過登入看光所有資料。修法分兩層，詳見下方「✅ 已完成：內容存取保護」完整章節 |

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

## ✅ 已完成：內容存取保護（2026-07-20）

**背景**：使用者問「怎麼確保所有內容只有家人才能看到」才發現的漏洞——登入機制只保護「打 Worker API 的請求」，但當時 `frobel0520/Family` 是 **public** repo，而且：
1. 圖片（貼文圖、食譜圖、大頭貼）都是直接連 `raw.githubusercontent.com`，不經過 Worker，完全繞過登入。
2. `GET /api/board`、`GET /api/recipes`、`GET /api/orders` 當初設計成公開不用登入（見下方舊的「前端怎麼讀資料」章節，已過時）。

只要知道 repo 網址或圖片直連網址，不用登入就能看光所有貼文/照片/食譜/`access.json` 裡的 email。修法分兩層：

### 1. 圖片改走簽章轉發，不再直連 raw.githubusercontent.com

新增 `worker/src/image-url.ts`：Worker 用 `JWT_SECRET` 對 repo 相對路徑做 HMAC 簽章，組出 `${origin}/api/image?path=...&sig=...`（大頭貼/食譜圖還會帶 `&v=<更新時間>` 當版本，換圖後簽章跟著變，不會被快取卡住看舊圖）。**簽章刻意不設過期時間**（不像 session token 24h 就失效）——這樣貼文/留言存的大頭貼快照網址才能一直有效，不會因為原 po 主的 session 過期就變成一張壞圖。安全性靠的是「這個連結只會出現在登入後才拿得到的 API 回應裡」，跟一般雲端相簿的分享連結是同一種模式（不是核對使用者身分，是核對連結本身有沒有被正確簽過）。

`worker/src/routes/image.ts`（`GET /api/image`）驗證簽章＋路徑白名單（只允許 `images/recipes/`、`images/board/`、`images/avatars/` 三個資料夾，擋路徑逃逸），通過才用 `github-contents.ts` 新增的 `fetchRawFile`（`Accept: application/vnd.github.raw`，binary-safe，不像 `getFile` 那樣走 base64 解文字，圖片會爛掉）把圖轉發出去，`Cache-Control: public, max-age=86400, immutable`（簽章連結本身就是憑證，不需要每次重驗，可以放心快取）。

套用的地方：`board.ts`（貼文/留言圖）、`recipes.ts`（`photoUrl`/`recipeUrl`）、`profiles.ts` 的 `avatarProxyUrl`（大頭貼，`effectiveIdentity` 現在是 async，登入時 `routes/auth.ts` 要 `await`）。**有 vitest 測試**（`worker/test/image-url.spec.ts`）覆蓋簽章正確性、路徑/密鑰/版本被改動都要失敗。

### 2. 讀取 API 全部要求登入

`GET /api/board`、`/api/recipes`、`/api/orders` 都加上 `requireSession`（之前是刻意公開，現在改掉了）。前端 `Board.tsx`／`Recipes.tsx`／`Orders.tsx` 改成：沒登入就顯示「請先登入才能查看…」，不會嘗試打 API；`api.ts` 的 `listBoardPosts`/`listRecipes`/`listOrders` 都改成要傳 `token`。

**部署時踩到的坑**：Worker 跟前端要一起上線，不能只部署 Worker——第一次只部署了 Worker（改成要求登入），前端還是舊版（沒帶 Authorization header），結果家人打開 App 全部看到「Missing Authorization header」。**以後任何「後端要求變嚴、前端要配合」的改動，一定要前後端一起 commit+push+deploy，不要分開驗證。**

### 3. 資料本體搬到獨立的 private repo

只把圖片轉發跟 API 上鎖還不夠——**public repo 本身**（`github.com/frobel0520/Family` 網頁、`git clone`）任何人都能直接看到 `data/*.json`、`images/`，這是 GitHub 平台本身的行為，Worker 完全管不到。原本想法是把整個 repo 設成 private，但卡到一個關页限制：

> **GitHub Pages 在免費帳號的 private repo 上不能用**（只有 Pro/Team 方案支援）。使用者的帳號是免費方案，整個 repo 設 private 會直接讓 GitHub Pages 網站 404。

改成這樣分工：
- 新建 **`frobel0520/Family-data`（private）**，只放 `data/`、`images/`，Worker 的 `GITHUB_REPO` 改指向這裡；`GITHUB_BOT_PAT` 也換成一把**新的 fine-grained PAT，只有 `Family-data` 的 Contents read/write 權限**（舊 PAT 是 `Family` repo 專用，對新 repo沒有存取權，這步是使用者自己在 GitHub 網站產生新 token，用 `wrangler secret put GITHUB_BOT_PAT` 更新，token 沒有出現在對話紀錄裡）。
- `frobel0520/Family`（public）**只留前端程式碼**，沒有任何家人資料，繼續用 GitHub Pages 免費部署，家人完全無感——不用重裝 App、不用重新登入、網址沒變。

**搬遷過程踩到的坑（資料落差）**：搬資料的當下用 `cp -r` 拍了一份快照丟到新 repo，但**在切換 Worker 指向新 repo 之前**，家人還在用（指向舊 repo 的）App 繼續發文留言，那段空窗期新增的 1 篇貼文＋3 則留言＋2 張圖片只寫進了舊 repo，新 repo 沒有。症狀是使用者回報「部分貼文不見了」。修法：把兩邊 `data/board.json` 用 id 逐筆比對（`orders.json`/`recipes.json`/`profiles.json`/`access.json` 這幾個當時確認完全沒有落差，只有 `board.json` 有，因為那段時間家人剛好在發文），補進缺的貼文/留言跟兩張圖片。**這個坑的教訓**：搬遷「資料庫」跟「切換讀寫指向」如果不是同一時刻做，中間的空窗期就會有寫入丟失風險；下次要搬類似的東西，該讓舊系統在切換瞬間停寫，或搬完立刻切換不要拖。

搬完之後把 `data/`、`images/` 從舊 public repo 的**目前檔案**裡刪掉（`git rm` + commit + push），Worker 也確認 `raw.githubusercontent.com/frobel0520/Family/main/data/board.json` 打不到了（404）。

**已知殘留、風險低**：舊 public repo 在這次清除**之前**的 git commit 歷史裡，還留著家人資料的舊版本（GitHub 網頁上目前檔案列表已經看不到，但翻歷史 commit 還能挖到）。真的要斷根需要把這個 repo整個刪掉重建（不可逆操作，需要使用者另外確認才會做，見下方「下一步」）。這個 repo 從來沒被分享過連結、沒有被搜尋引擎索引，現況風險非常低。

---

## ✅ 已完成：貼文／留言多張附圖（2026-07-25，已隨 08-10／08-15 的部署上線）

原本發文/留言只能附「一張」圖，改成一次可以選多張（上限 9 張，前後端都擋）。

**資料格式**：`BoardPost`/`BoardComment` 新增 `imagePaths: string[]`，舊資料的單張 `imagePath` 保留不動，讀取時由 `imagePathsOf()` 攤成陣列（所以舊貼文完全不用轉檔）。回前端的欄位是 `imageUrls: string[]`（每張都各自簽章）；另外仍回傳 `imageUrl` = 第一張，只是為了相容還沒重新載入的舊前端 bundle，新前端只看 `imageUrls`。

**檔名**：`images/board/<postId>-<n>.jpg`、`images/board/comments/<commentId>-<n>.jpg`（n 從 1 開始）。上傳仍是「先傳完所有圖才寫 board.json」，任何一張失敗就整篇/整則不送出。**一張圖一個 commit**（GitHub Contents API 沒有批次寫；9 張圖 = 9 個 commit，家庭規模可接受）。

**前端**（`Board.tsx`）：`attachedImages: string[]` / `commentImages: Record<string, string[]>`，file input 加 `multiple`，可以分幾次選（按鈕顯示「再加圖片（n/9）」），每張縮圖右上角 ✕ 可個別移除。貼文圖顯示改成格狀（1 張照原比例、2 張兩欄、3 張以上三欄，`.board-post-images.count-1/2/3`）。燈箱改成 `viewing: { urls, index }`，多張圖時有左右箭頭＋「n / N」計數，鍵盤 ←/→ 翻頁、Esc 關閉。

**注意**：多張圖是**一個 request 送 base64 陣列**（9 張 1280px JPEG 大約 3 MB），家用流量沒問題，但如果之後要放寬張數上限就得改成逐張上傳。

typecheck / build / worker vitest 都過，**還沒部署**（Worker 要 `wrangler deploy`，前端 push 到 main 由 Actions 部署）。

---

## ✅ 已完成：食譜圖改成縮圖上傳 + 空間用量盤點（2026-07-25，已隨 08-10／08-15 的部署上線）

討論多圖功能的空間成本時撈了 `Family-data` 的實際用量，發現真正的空間大戶不是佈告欄，是**食譜圖沒縮圖**：

| 內容 | 檔數 | 總大小 | 平均 |
|---|---|---|---|
| 食譜圖（手寫食譜照） | 17 | **48.3 MB** | **2.9 MB** |
| 菜色插畫 | 161 | 4.4 MB | 28 KB |
| 佈告欄貼文/留言圖 | 20 | 4.0 MB | 204 KB |
| `data/*.json` | 5 | 0.07 MB | — |

repo 本體 GitHub 回報 53.6 MB，**其中 85% 來自 17 張食譜圖**——因為 `RecipeCard.tsx`（＋食譜／更換圖片）跟 `Recipes.tsx`（新增菜色時附食譜圖）用的是 `fileToDataUrl`（**原圖直傳、完全沒縮**），佈告欄那條路徑則一直有走 `fileToResizedJpegDataUrl`。160 道菜若都補上食譜照，照舊做法會是 ~460 MB。

**修法**：三個 call site 全部改用 `fileToResizedJpegDataUrl(file, RECIPE_IMAGE_MAX_SIDE)`，`RECIPE_IMAGE_MAX_SIDE = 1600`（比貼文圖的 1280 大，手寫字要看得清楚）。預期一張 2.9 MB → ~400 KB。順手刪掉沒人用的 `fileToDataUrl`。**只影響之後新上傳的圖，已經在 repo 裡的 48 MB 不會變小**（見下面）。

**空間天花板（給以後的自己）**：
- GitHub repo 沒有硬配額，官方建議 1 GB 以內、5 GB 才會被關切；單檔 50 MB 警告 / 100 MB 擋掉。private repo 儲存不計費。
- **git 空間有進無出**：刪貼文本來就沒刪圖檔（已知孤兒圖），就算刪了 blob 還在 commit 歷史裡。真要回收只能 `git filter-repo` 改寫歷史 + force push（對這個 repo 技術上可行，Worker 只走 API 不在乎歷史，但不可逆，現在規模不值得）。
- `data/board.json` 現在 32.6 KB，Worker 讀它走 Contents API 的 **base64 JSON 路徑上限 1 MB**；哪天貼文累積接近就得改用 raw media type 讀。
- 長期若照片變成主要內容，正解是把圖搬到 **Cloudflare R2**（10 GB 免費、egress 免費、刪除真的釋放空間）。因為圖片已收斂在 `/api/image`，改動範圍小：`putBase64File` → R2 put、`fetchRawFile` → R2 get，路徑字串不用動 + 一次性搬移。**目前不做**。

---

## ✅ 已完成：訂單列表顯示點餐人與時間（2026-07-25，已隨 08-10／08-15 的部署上線）

原本訂單列表只有菜名（`data/orders.json` 連點餐人都沒存，只有 `createdAt` 但沒顯示），家人看不出來是誰點的。

- `Order` 新增 `orderedBy`（顯示名稱，暱稱優先）／`orderedByEmail`／`avatar`，在 `POST /api/orders` 從 session 帶入（跟貼文/留言存快照的做法一致）。**舊訂單沒有這三個欄位 → 前端只顯示時間**，不用轉檔。
- 前端訂單列表每一項改成兩行：菜名 + 小字的「頭像＋by 名字·時間」（`.order-item-body`／`.order-meta`）；確認彈窗也會說是誰點的（同一道菜被兩個人點時比較不會弄錯）。
- **✕ 改成「完成訂單」按鈕**（使用者反饋：✕ 看起來像刪除，實際語意是「這道菜做好了，從列表移掉」）。後端 API 沒變，還是 `POST /api/orders/delete`；`ConfirmDialog` 多了 `busyLabel` prop（原本執行中文字寫死「刪除中…」，非刪除的操作看起來很怪）。
- **舊訂單顯示不出點餐人是資料問題，不是 bug**：這功能上線前的 14 筆訂單在 `orders.json` 裡只有 `id`/`dishName`/`createdAt`，當初根本沒存是誰點的，也沒辦法從 commit 訊息回推（`orders: add "菜名"` 沒帶人名）。新點的菜才會有 `by 名字`。
- 時間格式從 `Board.tsx` 的區域函式抽成共用的 `frontend/src/formatTime.ts`（貼文/留言/訂單同一個格式）。
- 刪除權限沒變（任何登入的家人都能刪，做完的菜手動清掉）。

---

## ✅ 已完成：記住登入（session 30 天 + 自動續期）（2026-07-25，已隨 08-10／08-15 的部署上線）

**背景**：session TTL 原本寫死 24h（`routes/auth.ts` 的註解還寫「家人再登入一次就好」），實際使用起來就是**每天都要重新走一次 Google 登入**，使用者受不了。

**做法**（沒有做「記住我」勾選框，一律記住；不想被記住就按登出）：
- `SESSION_TTL_SECONDS` 從 24h 改成 **30 天**，並從 `routes/auth.ts`／`routes/profile.ts` 各自一份改成統一放在 `worker/src/session.ts` 匯出（之前是兩份重複的常數，改一邊會漏）。
- 新端點 **`POST /api/auth/refresh`**（`handleAuthRefresh`）：拿一個**還沒過期**的 token 換一張新的（TTL 重新計算），回傳格式跟登入端點一致，前端直接餵給既有的 `applySessionResponse`。續期時會重新確認**存取權**（`access.ts` 新增純讀取的 `isStillApproved`——不能用 `checkAccess`，那個會把不在名單上的人塞進 pending 佇列，續期打它會產生垃圾申請）、**profile**（暱稱/大頭貼，所以續期不會讓顯示名稱倒退回 Google 名字）、**isOwner**。過期的 token 一律 401，只能重新登入，不然「有效期」等於沒意義。
- 前端 `AuthContext`：session 多存一個 `refreshAt`（= 發出時間 + 24h，但不超過有效期一半），**開 App 時**與 **PWA 從背景切回前景時**（`visibilitychange`）檢查，過了就背景續期一次（`refreshing` ref 防連續觸發）。401/403 → 登出回登入頁；其他失敗（離線、後端還沒部署到有這個端點的版本）→ 什麼都不做保留現有 session，下次再試。
- **舊 session 沒有 `refreshAt` 欄位 → 視為「該續期了」**，所以這版上線後家人開 App 會自動換到 30 天的長效 token，不用重新登入（前提是他手上那張 24h token 還沒過期）。

**安全性取捨（重要）**：token 是無狀態 HS256 JWT，**簽出去就無法撤銷**。在 `/admin` 把某人移出 approved 之後，他手上還沒過期的 token 最多還能再用 30 天（續期會被 403 擋掉，所以到期就真的進不來）。想縮短這個空窗就把 `SESSION_TTL_SECONDS` 改小（例如 7 天，對「每天開 App 的人不用重登」完全沒差）；要立刻踢掉所有人只能換 `JWT_SECRET`（全家一起被登出）。真正可撤銷的做法是 refresh token 存 KV + 輪替，這次刻意沒做（家庭規模不值得）。

**測試**：`worker/test/index.spec.ts` 加了「沒帶 token 打 refresh → 401」。成功續期的路徑沒辦法在 vitest 裡測（要真的 JWT_SECRET + 讀 GitHub 上的 access.json/profiles.json），要在部署後實測。

**iOS 提醒**：從主畫面開啟的 PWA 不受 Safari「7 天沒互動清掉 script-writable storage」的限制，所以 localStorage 裡的 session 會留著；但如果家人是在 Safari 分頁裡用（沒加到主畫面），超過 7 天沒開就可能被清掉而需要重新登入——這不是這次改動能解決的，請家人用主畫面的 App。

---

## ✅ 已完成：貼文表情回應（2026-08-15，已部署）

家人不見得每則貼文都想留言，但想給個反應。做法刻意最小：**不開新檔案**，回應存在 `data/board.json` 每則貼文的 `reactions` 陣列裡。

- **規則跟 Facebook 一樣：一個人對一則貼文只有一個表情**（按同一個＝取消，按別的＝換掉）。所以資料是「一人一列」，不會有人連按十個洗版，前後端的 toggle 邏輯也只有一種。可選表情固定 5 個：👍 ❤️ 😂 😮 🙏（`worker/src/reactions.ts` 的 `REACTION_EMOJIS`，後端會擋不在清單裡的字串）。
- **存的是 `{ emoji, email, name, createdAt }`**，`name` 只是當下的顯示名快照；讀取時用 `profiles.json` 的暱稱覆蓋（跟頭像那次事故同一個教訓：身分快照會過時，顯示時才解析）。回前端的是彙總 `{ emoji, count, names, mine }`，**email 不外流**。
- 新端點 **`POST /api/board/react`**（`{ postId, emoji }`）。舊貼文沒有 `reactions` 欄位 → 一律當空陣列，不用轉檔。
- **只通知貼文作者本人**（`notifyEmail`），不群發——一個 👍 吵全家人是不能接受的；取消回應不發通知。
- 前端 `components/Reactions.tsx`：貼文下方一排（「☺＋」按鈕展開表情列 + 已有的表情統計 chip），`title`/`aria-label` 顯示按的人。**按下去先在本機算好結果再送出**（`applyLocalToggle`），因為一次寫入是一個 GitHub commit，等回應會有明顯延遲；失敗就還原並顯示錯誤。
- 留言還沒有表情回應（只做貼文），需要的話再說。
- 測試：`worker/test/reactions.spec.ts`（toggle 的三種情況、彙總順序、暱稱覆蓋、舊資料）。

---

## ✅ 已完成：家庭行事曆 + 自訂提醒（2026-08-15，已部署）

大家都能編輯的共用行事曆，活動可以指定**要提醒誰**、**什麼時候提醒**（使用者決定：提醒時間自己填絕對時間，不做「活動前 X 分鐘」；重複性活動 v1 不做）。

- **資料 `data/events.json`**（Family-data private repo，同一套 GitHub Contents API）：`{ id, title, date, time?, note, createdBy, createdByEmail, remindEmails[], remindAt?, notifiedAt? }`。
- **時間一律存台灣的牆上時間字串**（`2026-08-20` / `09:00` / `2026-08-20T08:00`），不存 UTC ISO——家人填的就是本地時間，存本地時間才不會因為 Worker 跑在哪個地區而位移；要比較先後時才在 `worker/src/events.ts` 補 `+08:00` 轉 epoch。台灣沒有日光節約時間，固定 offset 就夠。
- **端點**：`GET/POST /api/events`、`POST /api/events/update`、`POST /api/events/delete`。**任何家人都能編輯與刪除**（使用者指定「大家都可以編輯」），不限建立者。改了提醒時間或對象會把 `notifiedAt` 清掉，改過的提醒才會重新送。
- **新端點 `GET /api/family`**：已核准的家人名單（顯示名＋大頭貼），前端勾選提醒對象用。名單來自 `access.json` 的 approved（＋擁有者），顯示名依序取「暱稱 > 登入時記下的 Google 名字 > email 的 @ 前面」。
  - 連帶改動：`profiles.json` 多存 `googleName`／`googleAvatar`，在**登入時**寫入且**只有值變了才寫**（不然每次登入都多一個 commit）。原因是 `approveEmail()` 核准後會把 pending 那筆（含名字）刪掉，之前系統裡**根本沒有地方存得住家人的名字**，只有 email。
- **提醒＝Cloudflare Cron Trigger**（`wrangler.jsonc` 的 `triggers.crons`: `*/5 * * * *` + `index.ts` 的 `scheduled` handler）：每 5 分鐘掃一次，到期的用 `notifyEmail` **只推給該活動勾選的人**，推完寫 `notifiedAt` 防重複。代價是提醒最慢晚 5 分鐘送到。
  - `dueReminders()` 有 **24 小時補送上限**：cron 若停掉幾天，恢復後不會把整週過期的提醒一次全部推出來洗版，超過就當過期不送。
  - 沒開推播（沒把 App 加到主畫面 / 沒允許通知）的人**不會**收到提醒，這是 Web Push 的先天限制，行事曆上還是看得到活動。
- **前端**：`pages/Calendar.tsx` + `components/MonthGrid.tsx`，月曆格（一格最多列 2 筆 + 「+N」）→ 點日期看當天清單 → 新增/編輯表單。提醒對象是家人頭像 chip 的 checkbox，**勾第一個人時自動把提醒時間預設成活動當天**（沒填時間就 09:00）。導覽列與首頁都加了 📅 行事曆入口。
- **驗證**：`worker/test/events.spec.ts` 9 項（日期驗證含 2026-02-31、台灣時間換算、到期/已送/沒對象/補送上限、摘要與排序）＋ `worker/test/calendar-cron.spec.ts` 2 項——**不打擾家人的端對端測試**：攔截 fetch 假扮 GitHub Contents API 與推播端點，在測試裡產一把真的 VAPID 私鑰，直接跑 `worker.scheduled(...)`，確認「只有被勾選的人收到推播」「沒到期的不推」「推完寫回 notifiedAt」「沒有到期提醒時完全不寫檔」（不然每 5 分鐘就多一個 commit）；前端用 mock 資料在 375px 實測過——6 個 tab（擁有者）剛好不溢出（最後一個 tab 落在 367px），表單、活動卡片、月曆都沒有橫向捲動。
- **未做**：重複性活動（每年生日、每週才藝班）、把活動同步到 Google 日曆、提醒前先問「要不要順延」。

---

## 帳號 / 服務資訊

- **GitHub repo（程式碼，public）**：https://github.com/frobel0520/Family
- **GitHub repo（資料/圖片，private，2026-07-20 起）**：https://github.com/frobel0520/Family-data
- **GitHub Pages 網址**：https://frobel0520.github.io/Family/
- **Cloudflare 帳號**：frobel0520@gmail.com（用 Google 登入）
- **Worker 網址**：https://family-app-worker.frobel0520.workers.dev
- **Google OAuth Client**：已建立（Web application），redirect URIs 含正式站 + `localhost:5173`

## 已設定的 Secrets / Variables

**Worker secrets**（`worker/` 目錄下用 `wrangler secret put <NAME>` 設定，內容不在任何檔案裡，只存在 Cloudflare）：
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ✅ 已設定，登入已實測成功
- `GITHUB_BOT_PAT`（Fine-grained PAT）✅ **2026-07-20 換過一次**：現在是只有 `frobel0520/Family-data`（private）Contents read/write 權限的新 token，舊的（`Family` repo 專用）已作廢
- `JWT_SECRET`（隨機字串，簽 session JWT 用；**現在也拿來當圖片轉發連結的 HMAC 簽章密鑰**，見上方「內容存取保護」）✅
- `OWNER_EMAIL`（你自己的 Google email，永遠放行 + 唯一審核者）✅ 已設定
- `VAPID_PRIVATE_JWK`（Web Push VAPID 私鑰，JWK JSON 字串）✅ 已設定（2026-07-19；公鑰在 wrangler.jsonc vars，金鑰對用 Node webcrypto 產生）
- 舊的 `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`（GitHub OAuth 遷移到 Google 後）已刪除
- `ALLOWED_EMAILS`（白名單版本，被審核機制取代）**從沒真正部署上線過**，如果你當時有跑過 `wrangler secret put ALLOWED_EMAILS`，記得順手 `wrangler secret delete` 清掉

**Worker vars**（`worker/wrangler.jsonc`，明文、會 commit，非機密）：
- `GITHUB_REPO`：`frobel0520/Family-data`（2026-07-20 從 `frobel0520/Family` 改過來，見上方章節）

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
9. **GitHub Pages 在免費帳號的 private repo 上不能用**（只有 Pro/Team 方案支援）。這代表「把整個 repo 設 private 來保護資料」這條路，如果前端還在用 GitHub Pages 免費部署，走不通——要保護資料就得把資料搬到另一個 private repo，程式碼 repo 繼續 public。
10. **後端變嚴（例如 API 開始要求登入）跟前端配合的改動，一定要一起 commit+push+deploy**，不要分開驗證再各自部署——中間任何一段時間新舊不匹配，家人打開 App 就會看到一片錯誤（親身經歷：`Missing Authorization header`）。
11. **搬遷「資料儲存位置」跟「切換讀寫指向」如果有時間差，中間的空窗期會漏資料**——舊系統還在被寫入的時候，新系統只是拍了張快照，之後新增的東西不會自動同步過去。要搬就盡量讓快照時間跟切換時間貼緊，或者搬完立刻比對兩邊差異補齊（這次是用 id 逐筆比對 `board.json` 補回 1 篇貼文＋3 則留言＋2 張圖片）。
12. **`gh api` 用 `-f content=<base64>` 傳大檔案（例如整張圖片轉 base64）會超過 Windows 的 argv 長度限制**（`Argument list too long`）。改成先把 JSON payload 寫成暫存檔，再用 `gh api --input <file>` 讀檔案內容，不會受命令列長度限制。

---

## 前端怎麼「讀」資料（2026-07-20 更新：現在全部都要登入）

`GET /api/board`、`GET /api/recipes`、`GET /api/orders` 現在都要求登入（`requireSession`）——**這跟最早的設計不一樣，最早是刻意公開不用登入**，後來發現這樣等於讓沒登入的人也能看到所有內容，2026-07-20 補上登入檢查（詳見上方「✅ 已完成：內容存取保護」章節）。內部一樣透過 GitHub Contents API 讀，不是讓前端直接打 `raw.githubusercontent.com`，除了避免 CDN 快取延遲，現在資料所在的 `Family-data` 是 private repo，`raw.githubusercontent.com` 本來就打不通了。

圖片（食譜照片、貼文/留言附圖、大頭貼）也不再是 `raw.githubusercontent.com` 網址，而是 Worker 簽章過的轉發連結（`/api/image?path=...&sig=...`，見「內容存取保護」章節的 `image-url.ts`）。`photoUrl` 可能是 `null`（尚未拍照），前端用 `RecipePhoto` 元件顯示 🍽️ 預設圖示。

---

## 照片補齊進度（開放授權圖，Wikimedia 一輪 + Openverse 兩輪）

**154/160 道有照片**（Wikimedia Commons 輪 62 張 + Openverse 兩輪 70 張 + Openverse 第三輪「形象相近即可」22 張——使用者明確同意通用圖，例如奶蓋配珍奶圖、烏龍綠茶配茶葉照）。做法：每道菜用英文關鍵字搜 → 下載候選圖 → 拼對照表 → **逐張人工目視確認才套用**（自動配對錯誤率約一半，出現過「三杯雞」配到廟宇柱子、「厚切牛排」配到真空包生肉、「蜂蜜檸檬汁」配到抽象畫這種結果，人工確認不能省）→ 裁成 800x800 存 `images/recipes/{id}.jpg`，出處記在 `photoCredit`。

Openverse 輪的技術備忘：匿名 API 限 20 次/分、200 次/天，搜尋間隔要 sleep 3.3 秒；**Windows console 是 cp950，print 中文菜名（如「韮」字）會 UnicodeEncodeError，Python 腳本開頭要 `sys.stdout.reconfigure(encoding="utf-8")`**；結果要逐筆寫 jsonl 才能斷點續跑（第一版跑到一半炸掉整批重來過）。第二輪用「相似菜色就好」的寬鬆關鍵字（使用者同意圖片不用完全一樣），命中率比精準關鍵字高很多。

**出處標示已改版**：卡片上不再疊小字連結（使用者嫌影響美觀），改成 `PhotoCredits` 元件收合在食譜庫／點菜頁最底部，集中列出全部開放授權圖的作者＋授權＋連結（CC BY 系列授權要求標示，不能整個拿掉，收合區塊是美觀與合規的折衷）。

最後 6 道（炒菇類、滷虱目魚、香煎雞胸肉、水煮雞胸肉、韮菜炒鴨血、蜂蜜檸檬汁）三輪都找不到像樣的圖，改用**自製扁平風 SVG 插畫**（手寫 SVG → svglib 轉 800x800 JPG，原創作品無版權問題、無 `photoCredit`）。之後**飲料類 14 道應使用者要求全數改為同套插畫**（開放圖庫的手搖飲照片品質參差，插畫反而整齊），產生器在使用者主觀偏好上是「同版型換配色＋配料」的做法，腳本邏輯記在 commit。**160/160 補圖完成**；家人實拍上傳會直接覆蓋。之後**飯類 22 道也改為插畫**（使用者確認插畫辨識度 OK，要求「食物置中放大」，可參考原照片理解菜色長相再畫；順帶把紅酒燉牛肉飯那張 CC BY-**ND**（禁改作）的照片換掉了——當初裁圖其實踩到 ND 條款，插畫化剛好解掉）。目前 119 照片 + 41 插畫，插畫產生器（`draw_dishes/draw_drinks/draw_rice.py` 的做法）：手寫 SVG 版型 + 每道菜配料組合，svglib 轉 800x800 JPG。

## 2026-08-10 事故紀錄：Cloudflare workers.dev subdomain 換掉，全站 API 掛掉

**症狀**：App 打得開（GitHub Pages 正常）但完全不能用，登入卡住。

**原因**：Cloudflare 帳號的 workers.dev subdomain 從 `frobel0520` 變成 `curio-lab`，`family-app-worker.frobel0520.workers.dev` 直接 DNS NXDOMAIN。前端的 `VITE_API_BASE_URL`（GitHub repo variable，build 時寫進 bundle）還指著舊網址。Worker 本身一直是活的，只是那個網域不存在了。

**修法**：`gh variable set VITE_API_BASE_URL https://family-app-worker.curio-lab.workers.dev` + 重跑 Pages workflow（這個變數是 build-time 的，不重新 build 不會生效）。`ALLOWED_ORIGIN` 不用動。

**連帶災情**：`board.json`／`orders.json` 的貼文、留言、訂單把當下的大頭貼**完整網址**快照存進 `avatar` 欄位，host 一換，21 筆歷史紀錄的頭像全部指向死網域（瑜ㄐ 20 筆、茜茜 1 筆）。`profiles.json` 因為只存相對路徑 `avatarPath`，一筆都沒壞。

**連帶災情的修法**（commit `c77a3f6`，選擇不回填資料，改成讀取時解析）：
- `profiles.ts` 的 `avatarForStoredAuthor()`：讀清單時用 `authorEmail` 找當前 profile，有自訂頭貼就用**現算**的簽章網址覆蓋存檔裡的快照；找不到才退回舊快照。`board.ts`／`orders.ts` 的 list 端點都套用
- `image-url.ts` 的 `storedAvatarUrl()`：順手把更早期存的 `raw.githubusercontent.com` 頭貼網址也升級成 `/api/image` 轉發連結
- `Avatar.tsx` 加 `onError` fallback：圖載不出來就顯示名字首字，不會出現破圖 icon
- 好處是資料一個字都不用改，而且以後 host 再變也不會重演。HMAC 簽章只簽 path 不含 host，所以換 host 不會讓舊簽章失效

**留下的坑**：寫入端還是存絕對網址（`board.ts` 的 `avatar: auth.session.avatar`）。現在有讀取時覆蓋所以無害，但如果有人把頭貼切回 Google（`avatarPath` 變 `null`），他舊貼文裡那個死掉的 workers.dev 快照就沒東西能覆蓋了——`storedAvatarUrl()` 只認 `raw.githubusercontent.com`，不認舊的 workers.dev host。目前沒人踩到，最壞情況也只是顯示名字首字。

**教訓**：Worker 改動不會被 GitHub Actions 部署（Actions 只管前端），一定要手動 `cd worker && npx wrangler deploy`，不然線上跑的還是舊邏輯。這次就差點漏掉。

## 下一步（依優先順序）

0. **請家人實機測試 PWA**：iPhone 用 Safari 開網站 →「加入主畫面」→ 從主畫面開啟 → `/install` 頁開通知（iOS 16.4+ 才支援；**必須從主畫面開啟的 App 裡按，Safari 分頁裡按沒用**）。Android 用 Chrome 直接安裝即可
0.5. **（選做，不可逆）舊 public repo 歷史紀錄清除**：`frobel0520/Family` 在 2026-07-20 之前的 commit 歷史裡還留著家人資料舊版本（目前檔案列表已經看不到，但翻歷史還能挖到）。目前風險很低（repo 沒被分享過、沒被索引），先不處理；真要斷根需要把這個 repo **整個刪掉重建**，這件事需要使用者另外明確同意才會做（GitHub Pages 部署設定、Google OAuth redirect URI 等都要重新確認一次不受影響）
1. **確認行事曆的第一則提醒真的有送出**（2026-08-15 新功能）：刻意沒有用真的推播測試（使用者：「不想擾民」），改用 `worker/test/calendar-cron.spec.ts` 驗證整條路徑。線上只剩「Cloudflare cron trigger 有沒有註冊」沒被驗證——家人第一次設提醒時就會知道，或到 Cloudflare Dashboard → `family-app-worker` → Settings → Triggers 看有沒有 `*/5 * * * *`
2. 佈告欄「編輯貼文」——刪除已完成（2026-07），編輯還沒做；`board.json` 的 `updatedAt` 欄位已預留但沒用到
3. 行事曆的重複性活動（每年生日、每週才藝班）——v1 使用者確認先不做，`FamilyEvent` 加一個 `repeat` 欄位就能擴充，單次活動的欄位不用改
4. 校對 160 道菜裡幾個手寫字跡辨識不確定的品項（湯品 17/20/21/23、麵食 11、飯類 9/18 括號註記）——細節在 `data/recipes.json` 的 commit message 裡有提到
5. 使用者感興趣但還沒做的功能：「今天吃什麼」隨機轉盤（純前端，約 1 小時）、每週菜單規劃表（`menu.json`，約 1 天）

## 已知限制（暫不處理，非 bug）

- wrangler 目前是 3.114.17（有 4.x 可升級，是 breaking change），npm audit 有幾個僅影響本地開發工具鏈的弱點，使用者說先不處理
- 多人同時寫入衝突：v1 是「後寫入覆蓋」（沒有樂觀鎖），照規劃書就是預期行為
- 「拒絕」申請只是從待審核移除，沒有黑名單機制，被拒絕的人還能再申請一次
- session token 無法撤銷（無狀態 JWT）：把某人移出 approved 之後，他手上的 token 最多還能用到期（現在是 30 天），詳見「記住登入」章節的取捨說明
- 審核不是即時推播通知，擁有者要自己打開 App 檢查「審核」分頁才會看到新申請
- 圖片轉發連結（`/api/image?path=...&sig=...`）簽章沒有過期時間，只要連結流出去（例如截圖分享、被瀏覽器同步到別的裝置）就能一直看那張圖，不會因為時間久了自動失效——這是刻意的設計取捨（見「內容存取保護」章節），跟大部分雲端相簿的「知道連結就能看」是同一種模式，家庭規模可接受
- 刪貼文/留言不會連動刪除 repo 裡的圖片檔（孤兒圖案），這些孤兒圖現在因為 `Family-data` 是 private repo，一樣不會被外部看到，只是白佔一點儲存空間
- 舊 public repo（`frobel0520/Family`）2026-07-20 之前的 commit 歷史裡仍留有家人資料舊版本，見上方「下一步」第 0.5 項
- 行事曆提醒**最慢會晚 5 分鐘**送到（cron 每 5 分鐘掃一次），而且**沒開推播的人收不到**（沒把 App 加到主畫面／沒允許通知）——行事曆上還是看得到活動
- 行事曆提醒若因 cron 停擺遲超過 24 小時就**不補送**（`dueReminders` 的 grace window），避免恢復後一次推爆
- 行事曆**沒有重複性活動**（每年生日要自己每年建一次），見「下一步」第 3 項
- 刪掉活動不會撤回已經送出的提醒（推播送出去就收不回來，這是 Web Push 的性質）
- **iPhone 主畫面圖示旁邊無法顯示任何未讀標記**（不限紅點，任何形式都不行）——iOS Safari／WebKit 沒開放這個能力給網頁 App，PWA 架構下沒有解法。唯一能做到的路徑是包成原生 App 上架（Apple Developer Program US$99/年 + TestFlight/App Store + 家人重新安裝），2026-07-20 使用者確認不接受這個代價，維持 PWA。**之後不用再研究這題**，除非哪天決定要花錢走原生 App 這條路
