function requireEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]

    if (value) {
      return value
    }
  }

  throw new Error(`${names.join(' oder ')} fehlt. Bitte in .env setzen.`)
}

export const serverEnv = {
  port: Number(process.env.PORT ?? 8787),
  neonDataApiUrl: requireEnv(['VITE_NEON_DATA_API_URL', 'NEON_DATA_API_URL']),
  cryptoSecret: requireEnv(['APP_CRYPTO_SECRET']),
}
