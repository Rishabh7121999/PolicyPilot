import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BellIcon, LogoutIcon, SearchIcon, UserIcon } from './icons'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  function handleLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-beige-200 bg-cream-50/80 px-6 py-4 backdrop-blur">
      <div className="flex max-w-md flex-1 items-center gap-2 rounded-full border border-beige-200 bg-white px-4 py-2 text-sm text-neutral-500">
        <SearchIcon className="h-4 w-4 shrink-0" />
        <input
          placeholder="Search anything about your policies…"
          className="w-full bg-transparent text-neutral-700 outline-none placeholder:text-neutral-400"
          disabled
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative rounded-full p-2 text-neutral-500 hover:bg-beige-100"
          aria-label="Notifications"
        >
          <BellIcon className="h-5 w-5" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-600 text-sm font-semibold text-white"
            aria-label="Account menu"
          >
            {user ? getInitials(user.name) : <UserIcon className="h-5 w-5" />}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-10 w-44 overflow-hidden rounded-xl border border-beige-200 bg-white py-1 shadow-lg"
            >
              <Link
                to="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-beige-50"
              >
                <UserIcon className="h-4 w-4" />
                Profile
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogoutIcon className="h-4 w-4" />
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
