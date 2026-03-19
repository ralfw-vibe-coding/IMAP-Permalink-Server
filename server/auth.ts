import type { FastifyReply, FastifyRequest } from 'fastify'

interface JwtPayload {
  sub?: string
}

function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split('.')

  if (parts.length < 2) {
    return {}
  }

  const payload = parts[1]

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtPayload
  } catch {
    return {}
  }
}

export function getBearerToken(request: FastifyRequest, reply: FastifyReply) {
  const authorization = request.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    void reply.code(401).send({ error: 'Bearer-Token fehlt.' })
    return null
  }

  return authorization.slice('Bearer '.length)
}

export function getAuthenticatedUserId(token: string) {
  return decodeJwtPayload(token).sub ?? null
}
