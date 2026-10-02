import { useState } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import { useAppShell } from '../context/AppShellContext'
import {
  BellIcon,
  ChatIcon,
  CloseIcon,
  FolderIcon,
  HomeIcon,
  LeafLogoIcon,
  PanelToggleIcon,
  UploadIcon,
  UserIcon,
} from './icons'

const STORAGE_KEY = 'sidebar-collapsed'

const linkBase =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors'
const linkActive = 'bg-sage-100 text-sage-800'
const linkInactive =
  'text-neutral-600 hover:bg-beige-100'

const NAV_ITEMS = [
  { to: '/', end: true, icon: HomeIcon, label: 'Home' },
  { to: '/policies', end: false, icon: FolderIcon, label: 'My Policies' },
  { to: '/chat', end: false, icon: ChatIcon, label: 'Chat' },
  { to: '/reminders', end: false, icon: BellIcon, label: 'Reminders' },
  { to: '/profile', end: false, icon: UserIcon, label: 'Profile' },
]

export function Sidebar() {
  const { openUploadDialog, mobileNavOpen, closeMobileNav } = useAppShell()
  const onChat = useMatch('/chat') !== null
  // On /chat the rail collapses by default to give the conversation room,
  // without touching the saved preference used everywhere else. Expanding it
  // there is a temporary override that resets on the next visit.
  const [expandedOnChat, setExpandedOnChat] = useState(false)
  const [storedCollapsed, setStoredCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const [lastOnChat, setLastOnChat] = useState(onChat)
  if (lastOnChat !== onChat) {
    setLastOnChat(onChat)
    setExpandedOnChat(false)
  }

  const collapsed = onChat ? !expandedOnChat : storedCollapsed

  function toggleCollapsed(e?: { stopPropagation: () => void }) {
    e?.stopPropagation()
    if (onChat) {
      setExpandedOnChat((v) => !v)
      return
    }
    setStoredCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      return next
    })
  }

  // While collapsed, clicking anywhere in the rail (not just the toggle)
  // expands it back out. On mobile the rail is never collapsed, so this
  // only applies at md+ where `collapsed` state is in play.
  function handleAsideClick() {
    if (collapsed && !mobileNavOpen) toggleCollapsed()
  }

  function handleNavClick() {
    closeMobileNav()
  }

  return (
    <>
      {/* Backdrop: only rendered on mobile while the drawer is open. */}
      {mobileNavOpen && (
        <div
          onClick={closeMobileNav}
          className="fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden"
        />
      )}

      <aside
        onClick={handleAsideClick}
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r border-beige-200 bg-cream-50 px-4 py-6 transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:transition-[width] ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-[76px] md:cursor-pointer md:px-2' : 'md:w-60 md:px-4'}`}
      >
        <div className={`mb-8 flex items-center px-2 ${collapsed ? 'md:justify-center' : 'justify-between'}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="-m-1.5 flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-beige-100"
          >
            <LeafLogoIcon className="h-6 w-6 shrink-0" />
            <span className={`text-base font-semibold text-neutral-900 ${collapsed ? 'md:hidden' : ''}`}>
              PolicyPilot
            </span>
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-beige-100 hover:text-neutral-600 ${
              collapsed ? 'hidden' : ''
            }`}
          >
            <PanelToggleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closeMobileNav}
            title="Close menu"
            aria-label="Close menu"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-beige-100 hover:text-neutral-600 md:hidden"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <nav className={`flex flex-1 flex-col gap-1 ${collapsed ? 'md:items-center' : ''}`}>
          {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={handleNavClick}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `${linkBase} transition-transform duration-150 active:scale-[0.97] ${collapsed ? 'md:w-11 md:justify-center md:px-0' : ''} ${isActive ? linkActive : linkInactive}`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => {
              openUploadDialog()
              closeMobileNav()
            }}
            title={collapsed ? 'Upload Policy' : undefined}
            className={`${linkBase} transition-transform duration-150 active:scale-[0.97] ${collapsed ? 'md:w-11 md:justify-center md:px-0' : ''} ${linkInactive}`}
          >
            <UploadIcon className="h-5 w-5 shrink-0" />
            <span className={collapsed ? 'md:hidden' : ''}>Upload Policy</span>
          </button>
        </nav>
      </aside>
    </>
  )
}
