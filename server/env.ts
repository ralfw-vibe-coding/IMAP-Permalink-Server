function requireEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]

    if (value) {
      return value
    }
  }

  throw new Error(`${names.join(' oder ')} fehlt. Bitte in .env setzen.`)
}

function optionalEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]

    if (value) {
      return value
    }
  }

  return null
}

export const serverEnv = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: requireEnv(['DATABASE_URL']),
  cryptoSecret: requireEnv(['APP_CRYPTO_SECRET']),
  authSessionSecret: requireEnv(['AUTH_SESSION_SECRET']),
  authSecretOtp: optionalEnv(['AUTH_SECRET_OTP']),
  resendApiKey: optionalEnv(['RESEND_API_KEY']),
  authFromEmail: optionalEnv(['AUTH_FROM_EMAIL', 'RESEND_FROM_EMAIL']),
}
