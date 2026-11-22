import { useState } from 'react'
import { CameraIcon, GoogleLogo } from './icons.jsx'
import { Segmented } from './ui.jsx'
import { readJson } from './shared.js'

export default function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() =>
    new URLSearchParams(window.location.search).get('auth') === 'failed' ? 'Google sign-in did not finish. Try again.' : '',
  )
  const create = mode === 'create'

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await readJson(
        await fetch(create ? '/api/auth/register' : '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }),
      )
      setPassword('')
      await onSignedIn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="signin">
      <div className="signin-hero">
        <span className="signin-mark" aria-hidden="true">
          <CameraIcon size={30} />
        </span>
        <h1 className="poster">
          Know what your <span>figures</span> are worth
        </h1>
        <p>Snap a photo to identify and price a figure, watch eBay prices every day, and track your collection's value.</p>
      </div>

      <section className="signin-sheet" aria-label={create ? 'Create account' : 'Sign in'}>
        <Segmented
          label="Account"
          value={mode}
          onChange={(next) => {
            setMode(next)
            setError('')
          }}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'create', label: 'Create account' },
          ]}
        />
        <a className="google-button" href="/api/auth/google">
          <GoogleLogo />
          Continue with Google
        </a>
        <div className="divider">or use email</div>
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            {create ? 'Choose a password' : 'Password'}
            <input
              type="password"
              autoComplete={create ? 'new-password' : 'current-password'}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn primary big" disabled={busy}>
            {busy ? 'Working…' : create ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
