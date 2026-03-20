import { Pool, type QueryResultRow } from 'pg'
import { serverEnv } from './env.js'

const pool = new Pool({
  connectionString: serverEnv.databaseUrl,
})

export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const result = await pool.query<T>(text, values)
  return result.rows
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const rows = await queryRows<T>(text, values)
  return rows[0] ?? null
}
