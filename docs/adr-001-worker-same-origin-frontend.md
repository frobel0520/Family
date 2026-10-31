# ADR-001：前端改由 Family Worker 同源提供，session 改用 HttpOnly cookie

- 狀態：提案（2026-10-31），待擁有者核准與正式部署驗收
- 相關：跨專案資安檢查 SEC-P1-20261031；取代 `family-app-project-plan.md` 第 2、3、6 節中「前端部署在 GitHub Pages、session 存在瀏覽器」的做法

## 背景

前端原本部署在 `https://frobel0520.github.io/Family/`，Worker 用 CORS 允許 `https://frobel0520.github.io`，登入後把 30 天有效的 session token 存在 `localStorage`。

`frobel0520.github.io` 是同一帳號下所有 GitHub Pages 專案共用的 origin。瀏覽器的 `localStorage` 與 CORS 都以 origin 為界，不分路徑，所以任何一個 Pages 專案只要被注入腳本（XSS、被汙染的依賴、錯誤的部署流程），就能讀走 Family 的 token，並以家人身分讀寫佈告欄、行事曆與照片。

## 選項

| 選項 | 說明 | 結論 |
|---|---|---|
| A. 留在 github.io，只縮短 token 期限、改用不可匯出的裝置金鑰 | 降低被偷後的影響，但同源腳本仍可在使用者開著頁面時代為發送請求 | 只能緩解，不採用 |
| B. 留在 github.io，改用 path cookie 或 sessionStorage | 同源頁面可用 iframe 讀取 `/Family/` 的內容；Worker 設的 cookie 對 github.io 是第三方 cookie，會被瀏覽器擋 | 無效，不採用 |
| C. 買自訂網域 | 一次性與年費支出 | 擁有者不想新增網域，不採用 |
| D. 前端改由現有 Family Worker 的 `workers.dev` 網址提供 | 不需新網域；前端與 API 同源，session 可放 HttpOnly cookie | **採用** |

## 決定

- Worker 以 static assets 提供前端（`worker/public/`，前端 build 輸出到 `worker/public/Family/`），網址路徑維持 `/Family/`，PWA scope 與通知連結不變。
- Session 只放 `__Host-family_session` cookie（`HttpOnly; Secure; SameSite=Strict; Path=/`），API 回應不再含 token，也不再接受 `Authorization: Bearer`。
- 不開 CORS。改資料的請求必須帶本 Worker 的 `Origin`（同站的其他 `*.workers.dev` 也擋）。
- OAuth `redirect_uri` 只接受本 Worker 的 `/Family/`。
- 頁面加 CSP、`X-Frame-Options: DENY` 等標頭（`worker/public/_headers`）。
- 舊 Pages 網址只發布轉址頁：清掉舊版 `localStorage` token，導到 repository variable `FAMILY_APP_URL`。
- 前端與 Worker 由 `publish-worker.yml` 一起建置、一起發布，不再有兩邊版本不同步的情況。

## 取捨與限制

- 網址從 `github.io` 換成 `workers.dev`，家人需重新登入、重新加入主畫面、重新開啟通知。
- `workers.dev` 在 Public Suffix List 上，同帳號其他 Worker 與本 Worker 屬同站不同源；`__Host-` cookie 只屬於本主機，跨源寫入由 Origin 檢查擋下。
- 頁面仍載入 Harbor 維護腳本（`harbor-1wk.pages.dev`），CSP 允許該來源；它的安全性等同本站。
- 舊 token 雖然不再被接受，仍建議上線後輪替 `JWT_SECRET`，讓舊圖片連結一併失效。

## 零月費

- 前端靜態檔走 Workers static assets，免費方案不收費；只有 `/api/*` 會執行 Worker，用量與現在相同，仍在免費額度內。
- 不新增付費服務、網域或資料庫。GitHub Pages 只剩一頁轉址。

## 效能

- 既有 fixture 測試量測 `/api/me`（含名單檢查）暖啟動 50 筆樣本的 p50／p95，門檻 p95 < 100 ms，改版後仍通過；這是 Miniflare fixture，不代表正式環境延遲。
- 正式環境的頁面載入與 API 延遲：**待驗收**，部署後量測並記錄。

## 上線順序與 rollback

1. Google Cloud Console 的 OAuth client 加上 `https://<worker>.<subdomain>.workers.dev/Family/` 為重新導向 URI。
2. Family repo 設定 Actions secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`，variables `FAMILY_APP_URL`、`VITE_GOOGLE_CLIENT_ID`。
3. PR 通過後併入 `main`：`publish-worker.yml` 發布 Worker 與前端，`deploy.yml` 發布舊站轉址頁。
4. Rollback：`wrangler rollback` 回到上一版 Worker，並 revert 本 PR 讓 `deploy.yml` 重新發布舊前端；舊 token 已被清除，家人需重新登入。
