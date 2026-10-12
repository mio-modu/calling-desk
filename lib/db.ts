// node-postgres 풀. 로컬 Postgres 와 Supabase 가 동일한 코드로 동작한다.
// Supabase 로 옮길 때 바꾸는 것은 DATABASE_URL 하나뿐이다.
import { Pool, type QueryResultRow } from 'pg'
import { env } from './env'

declare global {
  var __callingDeskPool: Pool | undefined
}

function createPool(): Pool {
  const url = env.databaseUrl
  // Supabase 는 TLS 를 요구하지만 자체 체인을 쓴다. 로컬은 평문.
  const needsSsl = /supabase|sslmode=require/.test(url)
  return new Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 10_000,
  })
}

/**
 * 풀은 **지연 생성**한다. 모듈 로드 시점에 만들면 DATABASE_URL 이 없는 맥락
 * (빌드 단계의 정적 분석, DB 를 쓰지 않는 단위 테스트)에서 import 만으로 터진다.
 * dev 의 HMR 로 풀이 중복 생성되는 것도 전역 캐시로 막는다.
 */
export function getPool(): Pool {
  if (!global.__callingDeskPool) {
    const p = createPool()
    if (process.env.NODE_ENV !== 'production') global.__callingDeskPool = p
    else return p
  }
  return global.__callingDeskPool!
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(sql, params)
  return res.rows
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/** 트랜잭션. 버전 생성처럼 "이전 비활성화 + 새 행 삽입"이 한 묶음이어야 할 때 쓴다. */
export async function tx<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
