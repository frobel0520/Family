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
