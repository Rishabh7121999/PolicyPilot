import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface PolicyViewerTarget {
  policyId: number
  page?: number
}

interface AppShellContextValue {
  uploadDialogOpen: boolean
  openUploadDialog: () => void
  closeUploadDialog: () => void
  policiesVersion: number
  refreshPolicies: () => void
  mobileNavOpen: boolean
  openMobileNav: () => void
  closeMobileNav: () => void
  policyViewer: PolicyViewerTarget | null
  openPolicyViewer: (policyId: number, page?: number) => void
  closePolicyViewer: () => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [policiesVersion, setPoliciesVersion] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [policyViewer, setPolicyViewer] = useState<PolicyViewerTarget | null>(null)

  const value = useMemo(
    () => ({
      uploadDialogOpen,
      openUploadDialog: () => setUploadDialogOpen(true),
      closeUploadDialog: () => setUploadDialogOpen(false),
      policiesVersion,
      refreshPolicies: () => setPoliciesVersion((v) => v + 1),
      mobileNavOpen,
      openMobileNav: () => setMobileNavOpen(true),
      closeMobileNav: () => setMobileNavOpen(false),
      policyViewer,
      openPolicyViewer: (policyId: number, page?: number) => setPolicyViewer({ policyId, page }),
      closePolicyViewer: () => setPolicyViewer(null),
    }),
    [uploadDialogOpen, policiesVersion, mobileNavOpen, policyViewer],
  )

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider')
  return ctx
}
