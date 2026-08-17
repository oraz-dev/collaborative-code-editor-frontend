import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Before the stylesheet, so the @font-face rules are registered by the time
// anything asks for the families they declare.
import '@/app/styles/fonts'
import '@/app/styles/index.scss'
import App from './app/App'
import { BrowserRouter } from 'react-router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
