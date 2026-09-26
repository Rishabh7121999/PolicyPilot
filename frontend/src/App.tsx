import { NavLink, Outlet } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive
      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
      : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
  }`

export function App() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <nav className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <span className="mr-2 text-sm font-semibold">🎙️ Insurance Voicebot</span>
          <NavLink to="/" end className={navLinkClass}>
            Policies
          </NavLink>
          <NavLink to="/chat" className={navLinkClass}>
            Chat
          </NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
