# Family 正式站延遲基準

2026-11-24 11:21（台灣時間）完成。正式 Worker 發布紀錄對應 `a936b84`，量測時首頁回傳該版本新增的 COOP 標頭。請求經 Cloudflare SIN 節點，首頁走 HTTP/3。[Worker 發布紀錄](https://github.com/frobel0520/Family/actions/runs/45131422597)

在 Windows x64、Intel Family 6 Model 151、Headless Chrome 157（1280 × 800）以單一新瀏覽器設定檔依序取樣，使用瀏覽器 Performance API 記錄毫秒，分位數採 nearest-rank。停用 Service Worker 介入；冷快取停用瀏覽器 HTTP cache，暖快取啟用後先預熱一輪。兩組可重用網路連線，未控制 Cloudflare Worker 冷啟動。API 同源、未帶 session、停用快取，捨棄前兩次暖身，計時至回應本文讀取完成。

| 正式站指標 | 樣本數 | p50 | p95 | 最大值 |
|---|---:|---:|---:|---:|
| 首頁 TTFB，冷快取 | 20 | 74 ms | 128 ms | 192 ms |
| 首頁 LCP，冷快取 | 20 | 320 ms | 376 ms | 576 ms |
| 首頁 load，冷快取 | 20 | 183 ms | 236 ms | 347 ms |
| 首頁 TTFB，暖快取 | 20 | 72 ms | 78 ms | 79 ms |
| 首頁 LCP，暖快取 | 20 | 296 ms | 316 ms | 320 ms |
| 首頁 load，暖快取 | 20 | 165 ms | 170 ms | 173 ms |
| `GET /api/me` 未登入，回應本文讀完 | 50 | 67 ms | 73 ms | 109 ms |
| `GET /api/me` 已登入，Edge Network Time | 50 | 80 ms | 102 ms | 182 ms |

- 首頁所有樣本皆 HTTP 200；未登入 API 50 筆皆為預期 HTTP 401。樣本為單裝置、單測點、串行請求。
- 11:42（台灣時間）補測已登入路徑。使用同一台 Windows x64 電腦上的一般 Edge 158，以 DevTools Network 的 Time 欄讀取 50 筆完整 HTTP 200 回應。停用瀏覽器快取、無網路節流，採單一分頁依序發出的文件導覽請求，沿用既有 session；捨棄前兩次暖身。11 筆直接請求（p50／p95 80／101 ms），39 筆使用樣本編號 query 來辨識請求（80／107 ms）。另外 3 次操作未取得完整 Network 記錄，未計入樣本或 HTTP 錯誤率。未保存回應內容、憑證或 HAR。
- 正式環境尚無核定延遲門檻。現行 p95 < 100 ms 門檻適用於 Miniflare fixture；Edge 登入樣本使用文件導覽，Chrome 未登入樣本使用頁面內 fetch，兩組量測方法有別。
- Owner 回報 #15 手機流程已實測完成。此處只記錄回報，未取得裝置別紀錄、通知事件或食譜操作證據。
