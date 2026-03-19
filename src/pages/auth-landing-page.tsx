import { ArrowRight } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useAuth } from '../lib/use-auth'

export function AuthLandingPage() {
  const { session } = useAuth()

  if (session?.user) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8f5ef_0%,_#efe7da_100%)] px-4">
      <Card className="w-full max-w-md border-white/80 bg-white/95 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.65)]">
        <CardHeader>
          <CardTitle className="text-3xl">Mail Thread Vault</CardTitle>
          <CardDescription>
            Einloggen oder neues Konto anlegen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link className="block" to="/login">
            <Button className="w-full justify-between" size="lg">
              Login
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link className="block" to="/signup">
            <Button className="w-full justify-between" size="lg" variant="outline">
              Signup
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
