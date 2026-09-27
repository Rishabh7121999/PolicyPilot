import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { RequireAuth } from './components/RequireAuth'
import { ChatPage } from './pages/ChatPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PolicyDetailPage } from './pages/PolicyDetailPage'
import { PolicyListPage } from './pages/PolicyListPage'
import { ProfilePage } from './pages/ProfilePage'
import { RemindersPage } from './pages/RemindersPage'
import { SignupPage } from './pages/SignupPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <App />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'policies', element: <PolicyListPage /> },
      { path: 'policies/:id', element: <PolicyDetailPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'reminders', element: <RemindersPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
])
