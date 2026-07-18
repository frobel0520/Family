# 家庭生活小工具 — Side Project 規劃書

> 目的：給自己與家人使用的簡單網站，架在 GitHub Pages 上。
> 這份文件記錄目前討論出的架構決策與頁面規劃，作為跨對話協作的依據。之後每次討論有新決定，請直接更新這份文件。

---

## 1. 專案目標

- Users：自己 + 家人（非技術背景，家人不一定有 GitHub 帳號，但都有 Google 帳號）
- 三個核心功能：
  1. 佈告欄（家人共同編輯）
  2. 食譜庫（上傳/瀏覽食譜照片）
  3. 點菜頁面（依分類搜尋 + 訂單清單）

---

## 2. 技術架構總覽

| 層級 | 選用技術 | 說明 |
|---|---|---|
| 前端 | React.js | 部署在 GitHub Pages（靜態網站） |
| 後端 | 無傳統後端伺服器；用 **Cloudflare Worker** 當輕量中介層 | 因為 GitHub Pages 純靜態，無法執行 Python/Node 等 server-side 程式，也無法安全處理 OAuth 的 client secret 交換 |
| 資料庫 | 無獨立資料庫，**資料存在本專案 GitHub repo 內的 JSON 檔** | 符合「只 refer 專案內檔案」的原始需求 |
| 身份驗證 | GitHub OAuth（透過 Cloudflare Worker 中介） | 家人用自己的 GitHub 帳號登入即可標示身份，**不需要成為 repo collaborator** |
| 圖片儲存 | 直接以 base64 commit 進 repo（`images/recipes/` 目錄） | 食譜照片 |

### 架構決策記錄（重要，之後不要重新繞回去討論）

- ❌ 純前端 + localStorage：放棄，因為不能跨裝置同步，不符合「家人共同編輯」需求
- ❌ Firebase / Supabase：放棄，因為想維持「資料都在自己的 repo 裡」
- ❌ 每人手動申請/貼上 GitHub PAT：放棄，體驗太差
- ✅ **採用：GitHub repo 當資料庫 + Cloudflare Worker 處理 GitHub OAuth 登入與實際寫入**

---

## 3. 身份驗證與資料寫入流程

關鍵設計：**家人登入只是為了「標示是誰做的」，實際 commit 資料的動作統一由後端的一組 Bot GitHub Token 執行**，家人不需要對 repo 有寫入權限，也不會拿到任何敏感 Token。

流程：

1. 前端「登入」按鈕 → 導向 GitHub OAuth 授權頁（需先在 GitHub 註冊一個 OAuth App，取得 `Client ID` / `Client Secret`）
2. GitHub 導回前端指定的 callback URL，帶上 `code`
3. 前端把 `code` 傳給 Cloudflare Worker（例如 `POST /api/auth/callback`）
4. Worker 用 `Client Secret` 向 GitHub 交換 `access_token`，並取得使用者資訊（username、頭像）
5. Worker 簽發一組短期 session（例如 JWT）回給前端，前端存在瀏覽器裡代表「已登入」
6. 之後家人做以下任一動作時，前端呼叫 Worker 對應 API，並帶上 session：
   - 新增/編輯佈告欄留言 → `POST /api/board`
   - 上傳食譜照片 → `POST /api/recipes`
   - 點菜（加入訂單清單）→ `POST /api/orders`
7. Worker 驗證 session 合法 → 用內部保存的 **Bot PAT**（僅存在 Worker 環境變數，前端永遠看不到）呼叫 GitHub Contents API，把資料寫進 repo 對應的 JSON/圖片檔
8. GitHub Pages 於 repo 更新後透過 GitHub Actions 自動重新 build + 部署，家人重新整理頁面即可看到最新內容

### 需要準備的帳號/設定（待辦）

- [ ] 在 GitHub 註冊一個 OAuth App，取得 Client ID / Secret
- [ ] 申請 Cloudflare 帳號（免費），部署一個 Worker
- [ ] 產生一組 GitHub Fine-grained PAT（僅限這個 repo、僅 Contents 讀寫權限），設為 Worker 的環境變數（secret）
- [ ] Worker 設定 CORS，只允許自己的 GitHub Pages 網域呼叫

---

## 4. 資料結構設計（repo 內檔案）

```
repo/
├── data/
│   ├── board.json       # 佈告欄
│   ├── recipes.json     # 食譜索引
│   └── orders.json      # 點菜訂單清單
└── images/
    └── recipes/
        └── {recipeId}.jpg
```

### `data/board.json`
```json
[
  {
    "id": "uuid",
    "author": "github_username",
    "content": "留言內容",
    "createdAt": "2026-07-18T12:00:00Z",
    "updatedAt": "2026-07-18T12:00:00Z"
  }
]
```

### `data/recipes.json`
```json
[
  {
    "id": "uuid",
    "name": "滷肉飯",
    "category": "飯類",
    "photoUrl": "images/recipes/uuid.jpg",
    "uploadedBy": "github_username",
    "uploadedAt": "2026-07-18T12:00:00Z"
  }
]
```
> v1 欄位先簡化為：照片 + 名稱 + 分類。文字備註、食材、步驟之後再考慮擴充。

### `data/orders.json`
```json
[
  { "id": "uuid", "dishName": "滷肉飯", "createdAt": "2026-07-18T12:00:00Z" }
]
```
> v1 只存菜名清單（像購物清單），不記錄是誰點的、哪一餐。

### 食譜分類（沿用手寫食譜目錄的分類）

1. 飯類
2. 快炒／主菜
3. 點心
4. 滷味
5. 麵食
6. 炸物／烤物
7. 飲料
8. 湯品

---

## 5. 頁面規劃

### 5.1 佈告欄
- 顯示所有留言（依時間排序）
- 登入後可新增留言、編輯/刪除自己的留言
- 未登入僅能瀏覽

### 5.2 食譜庫
- 依分類瀏覽已上傳的食譜（顯示照片 + 名稱）
- 「上傳食譜」頁面：登入後可選擇分類、輸入菜名、上傳手機拍照的照片
- 目前尚無任何食譜照片，先讓上傳功能可用，之後陸續補上

### 5.3 點菜頁面
- 使用者先選擇分類（8 大類）
- 按「搜尋」→ 顯示該分類底下所有食譜庫已收錄的菜（含照片，若尚未上傳照片則先用文字/預設圖示呈現）
- 使用者點選菜名 → 加入右側/下方「訂單列表」
- 訂單列表：顯示目前累積的點菜清單（純菜名清單）

---

## 6. 部署方式

- 前端（React）：GitHub Actions，於 `main` branch 有更新時自動 `npm run build`，部署到 `gh-pages` branch 或 `docs/` 目錄，由 GitHub Pages 讀取
- 後端中介層（Cloudflare Worker）：獨立部署（`wrangler deploy`），與 GitHub Pages 分開管理，只需部署一次，之後有邏輯異動再重新部署

---

## 7. 尚未討論 / 之後要決定的事

- [ ] 多人同時寫入資料時的衝突處理（v1 先用「後寫入覆蓋」，之後可考慮樂觀鎖或版本號）
- [ ] 食譜若要擴充文字內容（食材、步驟）的欄位設計
- [ ] 點菜訂單要不要加上「清空訂單」「哪一餐」等功能
- [ ] UI/視覺風格
- [ ] 手機版排版（家人可能主要用手機操作）

---

*最後更新：討論確認 GitHub repo + Cloudflare Worker + GitHub OAuth 架構後建立*
