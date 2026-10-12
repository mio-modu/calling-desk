// supabase/migrations/*.sql 를 파일명 순서대로 적용한다.
// 적용 이력은 _migration 테이블에 남기므로 재실행해도 안전하다.
// 로컬 Postgres와 Supabase가 같은 SQL을 쓴다 — DATABASE_URL 만 바꾸면 된다.
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL 이 설정되지 않았습니다. .env.local 을 확인하세요.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()

await client.query(`
  create table if not exists _migration (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`)

const { rows } = await client.query('select name from _migration')
const applied = new Set(rows.map((r) => r.name))

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
let count = 0

for (const file of files) {
  if (applied.has(file)) {
    console.log(`· ${file} — 이미 적용됨`)
    continue
  }
  const sql = await readFile(join(dir, file), 'utf8')
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('insert into _migration (name) values ($1)', [file])
    await client.query('commit')
    console.log(`✓ ${file} — 적용`)
    count++
  } catch (err) {
    await client.query('rollback')
    console.error(`✗ ${file} — 실패\n${err.message}`)
    await client.end()
    process.exit(1)
  }
}

console.log(count ? `\n${count}개 마이그레이션 적용 완료.` : '\n변경 없음 — 최신 상태입니다.')
await client.end()
