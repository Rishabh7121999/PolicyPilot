import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listPolicies } from '../api/client'
import { useAppShell } from '../context/AppShellContext'
import { useAuth } from '../context/AuthContext'
import { daysUntil, getInitials } from '../lib/format'
import { BellIcon, LogoutIcon, MenuIcon, UserIcon } from './icons'

export function Topbar() {
  const { user, logout } = useAuth()
  const { openMobileNav, policiesVersion } = useAppShell()
  const [dueCount, setDueCount] = useState(0)
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

  // Renewals due within 30 days (or overdue), for the bell's badge.
  useEffect(() => {
    listPolicies()
      .then((policies) =>
        setDueCount(
          policies.filter((p) => {
            const d = p.status === 'ready' ? daysUntil(p.policy_end_date_iso) : null
            return d !== null && d <= 30
          }).length,
        ),
      )
      .catch(() => {})
  }, [policiesVersion])

  function handleLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex items-center justify-between gap-2 border-b border-beige-200 bg-cream-50/80 px-3 py-3 backdrop-blur sm:gap-4 sm:px-6 sm:py-4">
      <button
        type="button"
        onClick={openMobileNav}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-beige-100 md:hidden"
        aria-label="Open menu"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
        <Link
          to="/reminders"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-beige-100"
          aria-label={dueCount > 0 ? `Reminders: ${dueCount} renewal${dueCount === 1 ? '' : 's'} due soon` : 'Reminders'}
        >
          <BellIcon className="h-5 w-5" />
          {dueCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {dueCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-600 text-sm font-semibold text-white"
            aria-label="Account menu"
          >
            {user && getInitials(user.name) ? getInitials(user.name) : <UserIcon className="h-5 w-5" />}
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
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
