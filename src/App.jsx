import { AuthProvider, AuthGate } from '@/contexts/AuthContext'
import { ConfirmationDialogProvider } from '@/components/ui/ConfirmationDialog'

export default function App() {
  return (
    <ConfirmationDialogProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ConfirmationDialogProvider>
  )
}
