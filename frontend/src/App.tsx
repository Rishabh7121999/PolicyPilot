import { useMatch } from 'react-router-dom'
import { PageTransition } from './components/PageTransition'
import { FloatingAssistant } from './components/FloatingAssistant'
import { PolicyViewerDialog } from './components/PolicyViewerDialog'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { UploadPolicyDialog } from './components/UploadPolicyDialog'
import { AppShellProvider, useAppShell } from './context/AppShellContext'

function Shell() {
  const { uploadDialogOpen, closeUploadDialog, refreshPolicies, policyViewer, closePolicyViewer } = useAppShell()
  // Chat manages its own scroll regions (message list only) so the composer
  // stays pinned; every other page scrolls as a whole.
  const onChat = useMatch('/chat') !== null

  return (
    <div className="flex h-screen overflow-hidden bg-beige-50 text-neutral-900">
      <Sidebar />
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <Topbar />
        <main className={`min-h-0 flex-1 ${onChat ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <PageTransition />
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

      {policyViewer && (
        <PolicyViewerDialog policyId={policyViewer.policyId} page={policyViewer.page} onClose={closePolicyViewer} />
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
