import { createContext, useContext, ReactNode } from 'react'
import { Entitlements } from '../api/client'
import { useAuth } from './AuthContext'

interface EntitlementsContextType {
  entitlements: Entitlements | null
  paymentFailed: boolean
  refreshEntitlements: () => Promise<void>
}

const EntitlementsContext = createContext<EntitlementsContextType>({
  entitlements: null,
  paymentFailed: false,
  refreshEntitlements: async () => {},
})

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { entitlements, refreshEntitlements } = useAuth()
  const paymentFailed = entitlements?.payment_failed ?? false

  return (
    <EntitlementsContext.Provider value={{ entitlements, paymentFailed, refreshEntitlements }}>
      {children}
    </EntitlementsContext.Provider>
  )
}

export const useEntitlements = () => useContext(EntitlementsContext)
