import { Outlet } from 'react-router-dom'
import { FloatingAssistant } from './components/FloatingAssistant'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { UploadPolicyDialog } from './components/UploadPolicyDialog'
import { AppShellProvider, useAppShell } from './context/AppShellContext'

function Shell() {
  const { uploadDialogOpen, closeUploadDialog, refreshPolicies } = useAppShell()

  return (
    <div className="flex h-screen overflow-hidden bg-beige-50 text-neutral-900">
      <Sidebar />
      <div className="flex h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {uploadDialogOpen && (
        <UploadPolicyDialog
          onClose={closeUploadDialog}
          onUploaded={() => {
            refreshPolicies()
            closeUploadDialog()
          }}
        />
      )}

      <FloatingAssistant />
    </div>
  )
}

export function App() {
  return (
    <AppShellProvider>
      <Shell />
    </AppShellProvider>
  )
}
