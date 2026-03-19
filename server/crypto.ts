import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plaintext: string, secret: string) {
  const iv = randomBytes(12)
  const key = deriveKey(secret)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(ciphertext: string, secret: string) {
  const [ivValue, tagValue, encryptedValue] = ciphertext.split('.')

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Verschluesseltes Secret hat ein ungueltiges Format.')
  }

  const key = deriveKey(secret)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
