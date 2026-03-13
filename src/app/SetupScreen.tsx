import { useState } from 'react'
import { useStore } from '@/store'
import styles from './SetupScreen.module.css'

export function SetupScreen() {
  const setTokens = useStore(s => s.setTokens)
  const [cesiumToken, setCesiumToken] = useState(() => {
    try { return localStorage.getItem('earthexplorer_cesium_token') || '' } catch { return '' }
  })
  const [googleKey, setGoogleKey] = useState(() => {
    try { return localStorage.getItem('earthexplorer_google_key') || '' } catch { return '' }
  })
  const [error, setError] = useState('')

  function handleLaunch() {
    const token = cesiumToken.trim()
    if (!token) {
      setError('Please enter your Cesium Ion access token.')
      return
    }
    // Save to localStorage for persistence across sessions
    try {
      localStorage.setItem('earthexplorer_cesium_token', token)
      if (googleKey.trim()) localStorage.setItem('earthexplorer_google_key', googleKey.trim())
    } catch {}
    setTokens(token, googleKey.trim() || undefined)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleLaunch()
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Earth Explorer</h1>
        <p className={styles.subtitle}>
          An interactive 3D globe with terrain, buildings, and atmosphere.
          You'll need a free Cesium Ion token to load the world data.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Cesium Ion Access Token</label>
          <input
            className={styles.input}
            type="text"
            value={cesiumToken}
            onChange={e => setCesiumToken(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            spellCheck={false}
            autoComplete="off"
          />
          <div className={styles.hint}>
            Free at{' '}
            <a href="https://ion.cesium.com/signup" target="_blank" rel="noopener">
              ion.cesium.com/signup
            </a>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            Google Maps API Key <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <input
            className={styles.input}
            type="text"
            value={googleKey}
            onChange={e => setGoogleKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="AIza..."
            spellCheck={false}
            autoComplete="off"
          />
          <div className={styles.hint}>
            Enables photorealistic 3D buildings.{' '}
            <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" rel="noopener">
              Enable Map Tiles API
            </a>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.buttons}>
          <button className={styles.btnPrimary} onClick={handleLaunch}>
            Launch Earth Explorer
          </button>
          <a
            className={styles.btnSecondary}
            href="https://ion.cesium.com/signup"
            target="_blank"
            rel="noopener"
          >
            Get a Free Cesium Ion Token
          </a>
        </div>
      </div>
    </div>
  )
}
