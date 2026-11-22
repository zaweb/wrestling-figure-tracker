import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import Account from './Account.jsx'
import Appraise from './Appraise.jsx'
import Collection from './Collection.jsx'
import FigureDetail from './FigureDetail.jsx'
import Search from './Search.jsx'
import SignIn from './SignIn.jsx'
import Watchlist from './Watchlist.jsx'
import { CameraIcon, EyeIcon, PersonIcon, SearchIcon, StackIcon } from './icons.jsx'
import { applyTheme, readJson, storedThemeMode } from './shared.js'

// Hash routes keep the phone's back gesture working without a router library:
// #/ · #/search?q=… · #/collection · #/collection/<itemId> · #/account · #/figure/<id> · #/add
function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, queryString = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  return { name: parts[0] || 'watchlist', id: parts[1] || null, params: new URLSearchParams(queryString) }
}

const TABS = [
  { name: 'watchlist', href: '#/', label: 'Watchlist', Icon: EyeIcon },
  { name: 'search', href: '#/search', label: 'Search', Icon: SearchIcon },
  { name: 'add' },
  { name: 'collection', href: '#/collection', label: 'Collection', Icon: StackIcon },
  { name: 'account', href: '#/account', label: 'Account', Icon: PersonIcon },
]

function TabBar({ current }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) =>
        tab.name === 'add' ? (
          <a key="add" href="#/add" className="tab-add" aria-label="Add a figure from a photo">
            <CameraIcon size={28} />
          </a>
        ) : (
          <a
            key={tab.name}
            href={tab.href}
            className={`tab${current === tab.name ? ' on' : ''}`}
            aria-current={current === tab.name ? 'page' : undefined}
          >
            <tab.Icon />
            {tab.label}
          </a>
        ),
      )}
    </nav>
  )
}

export default function App() {
  const [route, setRoute] = useState(parseRoute)
  const [access, setAccess] = useState('checking') // checking | locked | ready
  const [account, setAccount] = useState(null)
  const [tracked, setTracked] = useState(null)
  const [listError, setListError] = useState('')
  const [collectionVersion, setCollectionVersion] = useState(0)
  const [themeMode, setThemeMode] = useState(storedThemeMode)
  const [toast, setToast] = useState('')
  const lastTab = useRef('watchlist')
  const navigated = useRef(false)

  useEffect(() => {
    function onHash() {
      navigated.current = true
      setRoute(parseRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (['watchlist', 'search', 'collection', 'account'].includes(route.name)) lastTab.current = route.name
  }, [route.name])

  // Follow the device's light/dark setting while the mode is System.
  useEffect(() => {
    if (themeMode !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [themeMode])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(timer)
  }, [toast])

  function changeTheme(mode) {
    applyTheme(mode)
    setThemeMode(mode)
  }

  const go = useCallback((hash) => {
    window.location.hash = hash
  }, [])

  // Back within the app when there's history; otherwise to the last tab.
  const back = useCallback(() => {
    if (navigated.current && window.history.length > 1) window.history.back()
    else window.location.hash = lastTab.current === 'watchlist' ? '#/' : `#/${lastTab.current}`
  }, [])

  async function confirmAccess() {
    try {
      const response = await fetch('/api/auth/me')
      if (!response.ok) {
        setAccount(null)
        setAccess('locked')
        return
      }
      setAccount(await response.json())
      setAccess('ready')
    } catch {
      setAccount(null)
      setAccess('locked')
    }
  }

  useEffect(() => {
    confirmAccess()
  }, [])

  const loadTracked = useCallback(async () => {
    try {
      const data = await readJson(await fetch('/api/tracked-figures'))
      setTracked(data)
      setListError('')
      return data
    } catch (error) {
      setListError(error.message)
      return null
    }
  }, [])

  useEffect(() => {
    if (access === 'ready') loadTracked()
  }, [access, loadTracked])

  // Called whenever something changes the Collection, so owned counts stay in step.
  const onCollectionChanged = useCallback(() => {
    loadTracked()
    setCollectionVersion((version) => version + 1)
  }, [loadTracked])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAccount(null)
    setTracked(null)
    setAccess('locked')
    window.location.hash = '#/'
  }

  if (access === 'checking') {
    return <main className="splash" aria-busy="true" />
  }

  if (access === 'locked') {
    return <SignIn onSignedIn={confirmAccess} />
  }

  const shared = { tracked, go, back, notify: setToast, reloadTracked: loadTracked, onCollectionChanged }
  const fullScreen = route.name === 'add' || route.name === 'figure'

  return (
    <div className={`app${fullScreen ? ' full' : ''}`}>
      {route.name === 'watchlist' && <Watchlist {...shared} error={listError} />}
      {route.name === 'search' && <Search {...shared} initialQuery={route.params.get('q') || ''} initialCondition={route.params.get('condition')} initialBrand={route.params.get('brand')} />}
      {route.name === 'collection' && (
        <Collection {...shared} version={collectionVersion} editId={route.id} />
      )}
      {route.name === 'account' && (
        <Account account={account} themeMode={themeMode} onThemeChange={changeTheme} onSignOut={signOut} />
      )}
      {route.name === 'figure' && <FigureDetail key={route.id} {...shared} figureId={route.id} />}
      {route.name === 'add' && <Appraise {...shared} />}
      {!fullScreen && <TabBar current={route.name} />}
      <div className="toast-slot" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}
