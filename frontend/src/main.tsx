import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* GitHub Pages has no server-side routing, so a deep link like /auth/callback
        404s on a hard navigation (e.g. the GitHub OAuth redirect). HashRouter keeps
        the route entirely client-side (.../#/auth/callback) so it never hits the server. */}
    <HashRouter basename={import.meta.env.BASE_URL}>
      <App />
    </HashRouter>
  </StrictMode>,
)
