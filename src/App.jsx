import { AuthProvider, AuthGate } from '@/contexts/AuthContext'

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
