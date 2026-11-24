# Family MVP Release Gate

| 文件項目 | 內容 |
|---|---|
| 文件版本 | 1.0 |
| 文件日期 | 2026-11-14 |
| 狀態 | 已部署上線；#15 手機流程已收到 Owner 實測回報，正式首頁與登入前後 API 延遲已量測 |
| 專案級別 | 產品級 |
| 依據 | Harbor `standards/DevelopmentStandards.md`、`standards/DeploymentHandbook.md` |

## 1. Gate 檢核總覽

| 項目 | 條件／門檻 | 目前狀態 | 證據位置 |
|---|---|---|---|
| 相依套件安全 | `npm audit --audit-level=high` 零高危／嚴重漏洞（前端與 Worker） | 通過 | `.github/workflows/validate.yml`、`security/reports/2026-10-24-p1-remediation.md` |
| 型別與 Lint | `oxlint`（前端）與 `tsc --noEmit`（Worker）零錯誤 | 通過 | `.github/workflows/validate.yml` |
| 自動化測試 | Worker 11 份 Miniflare Vitest spec（認證、CSRF、圖片簽章、Cron、推播、編輯衝突）與發布腳本測試全數通過 | 通過 | `worker/test/*.spec.ts`、`worker/scripts/publish-worker-ci.check.mjs` |
| 前端產物大小 | Client JS+CSS gzip bytes（level 9）`after <= before * 1.05`（實測 106,304 bytes，比例 0.994） | 通過 | `security/reports/2026-10-24-p1-remediation.json` |
| 合成效能基準 | Miniflare 50 次暖啟動 `/api/me`（含 `access.json` 檢核）p95 `< 100ms` | 通過（合成） | `docs/adr-001-worker-same-origin-frontend.md`、`security/reports/2026-10-24-p1-remediation.json` |
| 發布權限控管 | `publish-worker.yml` 強制 `refs/heads/main` 且 `GITHUB_ACTOR == GITHUB_REPOSITORY_OWNER` | 通過 | `.github/workflows/publish-worker.yml` |
| 零月費確認 | Workers、KV、GitHub API、Pages 導流皆位於免費額度內，無付費服務 | 通過 | `worker/wrangler.jsonc`、`docs/03-system-design.md` |
| 正式環境效能驗收 | 正式 Worker 網址之頁面載入與 API 延遲（p50 / p95）實測 | 已量測首頁、HTTP 401 與登入 HTTP 200；正式延遲門檻待訂 | [正式站延遲基準](evidence/2026-11-24-production-latency.md) |
| 家庭成員真機驗收 | iOS Safari / Android Chrome 手機實際登入、PWA 安裝、推播與食譜操作 | #15 手機流程已收到 Owner 實測回報；裝置別、推播送達與食譜操作待查證 | [實測回報範圍](evidence/2026-11-24-production-latency.md) |
| 食譜名稱待核對 | 7 筆手寫來源待補或編碼異常之食譜名稱人工確認 | 待處理 | `docs/recipe-name-review.md` |

## 2. 交接與進度上限說明

- 目前現況與待辦集中維護於 [`PROGRESS.md`](../PROGRESS.md)（目前 20 行），變更不超過實際狀態與證據範圍。
- 任何涉及登入、session、資料寫入或部署 workflow 的變更，依 `DevelopmentStandards.md` 第 1.3 節變更風險覆寫規定，須走分支、PR、回歸測試並附上 rollback 方式後始可合併。
