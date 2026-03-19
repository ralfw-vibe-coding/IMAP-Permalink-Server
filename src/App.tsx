import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/auth/protected-route'
import { AppShell } from './components/layout/app-shell'
import { AuthLandingPage } from './pages/auth-landing-page'
import { AuthPage } from './pages/auth-page'
import { DashboardPage } from './pages/dashboard-page'
import { PublicPermalinkPage } from './pages/public-permalink-page'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthLandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/p/:token" element={<PublicPermalinkPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/app" element={<DashboardPage />} />
      </Route>
    </Routes>
  )
}

export default App
