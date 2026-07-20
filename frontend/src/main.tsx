import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// PWA：註冊 Service Worker（可安裝 + 之後的推播通知都靠它）。
// BASE_URL 在正式站是 /Family/，本機 dev 也一樣（vite.config 的 base 設定）。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // SW 註冊失敗不影響網站本身，安靜略過（例如舊瀏覽器）
    })
  })
}

// App 圖示紅點（Badging API，只有 Android 支援，iOS Safari 沒實作，呼叫失敗就算了）：
// 開啟或切回這個 App 就當作「看過了」，清掉紅點。sw.js 收到推播時會設回去。
function clearAppBadge() {
  try {
    ;(navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.()
  } catch {
    // 不支援或呼叫失敗都安靜忽略
  }
}
clearAppBadge()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') clearAppBadge()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* GitHub Pages has no server-side routing, so a deep link like /auth/callback
        404s on a hard navigation (e.g. the GitHub OAuth redirect). HashRouter keeps
        the route entirely client-side (.../#/auth/callback) so it never hits the server.
        No basename here — the hash portion is independent of the real URL path, which
        stays fixed at BASE_URL (index.html) regardless of in-app route. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
