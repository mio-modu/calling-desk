// 파일 저장 어댑터. 로컬 개발은 파일시스템, 배포는 Supabase Storage.
// DB 와 마찬가지로 교체 지점을 한 곳에 모아 둔다.
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { env } from './env'

const LOCAL_ROOT = join(process.cwd(), '.data', 'uploads')

/** 경로 조작을 막는다. 저장 키는 우리가 만들지만 방어적으로 검사한다. */
function safeKey(key: string): string {
  const n = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')
  if (n.startsWith('..') || n.includes('\0')) throw new Error('잘못된 저장 경로입니다.')
  return n.replace(/^[/\\]+/, '')
}

async function supabaseFetch(key: string, init: RequestInit): Promise<Response> {
  const { url, serviceKey, bucket } = env.supabase
  if (!url || !serviceKey) {
    throw new Error('STORAGE_DRIVER=supabase 인데 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.')
  }
  return fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
    ...init,
    headers: {
      authorization: `Bearer ${serviceKey}`,
      ...(init.headers ?? {}),
    },
  })
}

export async function putFile(
  key: string,
  data: Buffer | Uint8Array,
  contentType = 'application/octet-stream',
): Promise<string> {
  const k = safeKey(key)
  if (env.storageDriver === 'local') {
    const path = join(LOCAL_ROOT, k)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
    return k
  }
  const res = await supabaseFetch(k, {
    method: 'POST',
    body: new Uint8Array(data) as unknown as BodyInit,
    headers: { 'content-type': contentType, 'x-upsert': 'true' },
  })
  if (!res.ok) throw new Error(`Supabase Storage 업로드 실패 (${res.status}): ${await res.text()}`)
  return k
}

export async function getFile(key: string): Promise<Buffer> {
  const k = safeKey(key)
  if (env.storageDriver === 'local') return readFile(join(LOCAL_ROOT, k))
  const res = await supabaseFetch(k, { method: 'GET' })
  if (!res.ok) throw new Error(`Supabase Storage 조회 실패 (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function deleteFile(key: string): Promise<void> {
  const k = safeKey(key)
  if (env.storageDriver === 'local') {
    await unlink(join(LOCAL_ROOT, k)).catch(() => {})
    return
  }
  await supabaseFetch(k, { method: 'DELETE' })
}
