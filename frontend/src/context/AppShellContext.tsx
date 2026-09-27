import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface AppShellContextValue {
  uploadDialogOpen: boolean
  openUploadDialog: () => void
  closeUploadDialog: () => void
  policiesVersion: number
  refreshPolicies: () => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [policiesVersion, setPoliciesVersion] = useState(0)

  const value = useMemo(
    () => ({
      uploadDialogOpen,
      openUploadDialog: () => setUploadDialogOpen(true),
      closeUploadDialog: () => setUploadDialogOpen(false),
      policiesVersion,
      refreshPolicies: () => setPoliciesVersion((v) => v + 1),
    }),
    [uploadDialogOpen, policiesVersion],
  )

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider')
  return ctx
}
