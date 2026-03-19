import { createAuthClient, createInternalNeonAuth } from '@neondatabase/neon-js/auth'

let authClient: ReturnType<typeof createAuthClient> | null = null
let internalAuthClient: ReturnType<typeof createInternalNeonAuth> | null = null

function getNeonAuthUrl() {
  const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL

  if (!neonAuthUrl) {
    throw new Error('VITE_NEON_AUTH_URL fehlt. Bitte .env pruefen und Dev-Server neu starten.')
  }

  return neonAuthUrl
}

export function getNeonAuth() {
  if (!authClient) {
    authClient = createAuthClient(getNeonAuthUrl())
  }

  return authClient
}

export function getInternalNeonAuth() {
  if (!internalAuthClient) {
    internalAuthClient = createInternalNeonAuth(getNeonAuthUrl())
  }

  return internalAuthClient
}
