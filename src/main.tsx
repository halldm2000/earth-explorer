import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import './app/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register tile cache service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration failed — tile caching will use browser HTTP cache only
  })
}
