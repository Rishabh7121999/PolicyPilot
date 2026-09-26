import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ChatPage } from './pages/ChatPage'
import { PolicyDetailPage } from './pages/PolicyDetailPage'
import { PolicyListPage } from './pages/PolicyListPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <PolicyListPage /> },
      { path: 'policies/:id', element: <PolicyDetailPage /> },
      { path: 'chat', element: <ChatPage /> },
    ],
  },
])
