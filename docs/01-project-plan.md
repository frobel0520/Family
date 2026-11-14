# Family 家庭應用專案計畫

| 文件項目 | 內容 |
|---|---|
| 文件版本 | 1.0 |
| 文件日期 | 2026-11-14 |
| 狀態 | 依現況盤點補齊（已上線產品級 PWA；架構已依 [ADR-001](adr-001-worker-same-origin-frontend.md) 遷移至 Worker 同源服務） |
| 產品類型 | 私人家庭互動與生活資訊 PWA |
| 專案級別 | 產品級 |
| 每月預算上限 | NT$0（零月費硬性規則） |
| 版控／部署 | GitHub `frobel0520/Family`（資料倉儲：`frobel0520/Family-data`）／Cloudflare Worker（同源靜態資源 + API） |
| SDLC | Planning → SA → SD／ADR → Task DAG → 開發測試 → CI／Release Gate |

## 1. 摘要

Family 是專為家庭成員設計的私人可安裝網頁應用（PWA），提供家庭留言板、家常食譜圖鑑、點餐清單、共用行事曆與 Web Push 提醒功能。系統不依賴傳統資料庫主機或容器，以 Cloudflare Worker 作為統一的同源前端與 API 閘道，將結構化 JSON 與圖片存放於私人 GitHub repository，達成零月費且易於手機安裝使用的目標。

## 2. 目標使用者

- **家庭成員**：以手機瀏覽器（iOS Safari / Android Chrome）為主的非技術背景家人，使用既有個人 Google 帳號登入並透過 PWA 安裝至桌面。
- **系統擁有者（Owner）**：負責於後台審核新加入成員的 Google 帳號申請、維護食譜與系統運作。

## 3. 目標與成功標準

| 目標 | 成功標準 |
|---|---|
| 家庭日常溝通與協作 | 支援留言板（最多 9 張壓縮圖片、編輯、留言、Emoji 回應）、8 分類食譜瀏覽與上傳、點餐與共用行事曆 |
| 跨裝置即時提醒 | 支援 Web Push 推播（留言、點餐、行事曆 Cron 掃描提醒）與手機 PWA 安裝引導 |
| 嚴格私人存取隔離 | 採 Google OAuth 登入與 Owner 審核制（allowlist），每次請求皆重檢核名單（fail closed） |
| 同源安全邊界 | 依 [ADR-001](adr-001-worker-same-origin-frontend.md) 由 Worker 同源提供前端與 API，session 採 `__Host-family_session` HttpOnly Cookie |
| 零月費營運 | 嚴格控制於 Cloudflare Workers／KV 免費方案與 GitHub API 額度內 |

## 4. 範圍

### 4.1 已實作範圍（現況）

- **前端 PWA（`frontend/`）**：React 19 + React Router (`HashRouter`) + Vite 8，涵蓋首頁（`Home`）、留言板（`Board`）、食譜（`Recipes`）、點餐（`Orders`）、行事曆（`Calendar`）、設定（`Settings`）、管理審核（`Admin`）與 OAuth 回呼（`AuthCallback`）。
- **後端 Worker（`worker/`）**：提供完整 `/api/*` 路由、同源靜態資產託管（`worker/public/Family/`）、Web Push 推播（RFC 8291/8292）與每 5 分鐘執行一次的 Cron 行事曆提醒。
- **舊網址導流（`pages-redirect/`）**：舊 GitHub Pages 網址改為靜態導流頁，清除舊版 `localStorage` session 並導向新 Worker 同源網址。

### 4.2 明確排除

- 公開註冊或匿名瀏覽（未核准帳號僅能進入待審清單，上限 20 筆）。
- 付費雲端資料庫（如 RDS、Firestore 付費版）或自建主機。
- 原生 App Store / Google Play 雙平台打包上架。
