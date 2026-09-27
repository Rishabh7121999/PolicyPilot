import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAppShell } from '../context/AppShellContext'
import {
  BellIcon,
  ChatIcon,
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
  const { openUploadDialog } = useAppShell()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      return next
    })
  }

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-beige-200 bg-cream-50 py-6 transition-[width] duration-200 ${
        collapsed ? 'w-[76px] px-2' : 'w-60 px-4'
      }`}
    >
      <div className={`mb-8 flex items-center px-2 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <LeafLogoIcon className="h-6 w-6" />
            <span className="text-base font-semibold text-neutral-900">PolicyPilot</span>
          </div>
        )}
        {collapsed && <LeafLogoIcon className="h-6 w-6" />}
      </div>

      <nav className={`flex flex-1 flex-col gap-1 ${collapsed ? 'items-center' : ''}`}>
        {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `${linkBase} ${collapsed ? 'w-11 justify-center px-0' : ''} ${isActive ? linkActive : linkInactive}`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={openUploadDialog}
          title={collapsed ? 'Upload Policy' : undefined}
          className={`${linkBase} ${collapsed ? 'w-11 justify-center px-0' : ''} ${linkInactive}`}
        >
          <UploadIcon className="h-5 w-5 shrink-0" />
          {!collapsed && 'Upload Policy'}
        </button>
      </nav>

      <button
        type="button"
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-500 hover:bg-beige-100 ${
          collapsed ? 'w-11 justify-center px-0 self-center' : ''
        }`}
      >
        <PanelToggleIcon className="h-5 w-5 shrink-0" />
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  )
}
