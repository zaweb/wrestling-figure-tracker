import { useState } from 'react'
import { HomeScreenIcon } from './icons.jsx'
import { Segmented } from './ui.jsx'
import { BRANDS, CONDITIONS, brandLabel, saveSearchDefaults, searchDefaults } from './shared.js'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export default function Account({ account, themeMode, onThemeChange, onSignOut }) {
  const [defaults, setDefaults] = useState(searchDefaults)
  const initial = (account?.name || account?.email || '?').trim().charAt(0).toUpperCase()

  function update(key, value) {
    const next = { ...defaults, [key]: value }
    setDefaults(next)
    saveSearchDefaults(next)
  }

  return (
    <main className="screen">
      <header className="screen-head">
        <h1 className="poster">Account</h1>
      </header>

      <div className="stack">
        <section className="card account-card">
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
          <span>
            <strong>{account?.name || 'Signed in'}</strong>
            <span className="muted small">{account?.email}</span>
          </span>
        </section>

        <section className="card">
          <span className="card-title">Appearance</span>
          <Segmented label="Appearance" options={THEMES} value={themeMode} onChange={onThemeChange} />
        </section>

        <section className="card list-card">
          <span className="card-title">Search defaults</span>
          <label className="list-row">
            Brand
            <select value={defaults.brand} onChange={(event) => update('brand', event.target.value)}>
              {BRANDS.map((brand) => (
                <option key={brand || 'any'} value={brand}>
                  {brandLabel(brand)}
                </option>
              ))}
            </select>
          </label>
          <label className="list-row">
            Condition
            <select value={defaults.condition} onChange={(event) => update('condition', event.target.value)}>
              {CONDITIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="tip-card">
          <HomeScreenIcon size={26} />
          <span>
            <strong>Put it on your home screen</strong>
            <span>In Safari, tap Share, then Add to Home Screen. It opens full screen like an app.</span>
          </span>
        </section>

        <button type="button" className="btn danger-outline" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  )
}
