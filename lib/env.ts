// 환경변수 접근 지점. 1인용 도구이므로 Auth 없이 APP_SECRET 하나로 막는다.

function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`환경변수 ${key} 가 설정되지 않았습니다. .env.local 을 확인하세요.`)
  return v
}

export const env = {
  get databaseUrl() { return required('DATABASE_URL') },
  get appSecret()   { return required('APP_SECRET') },
  get anthropicKey(): string | null { return process.env.ANTHROPIC_API_KEY || null },
  get storageDriver(): 'local' | 'supabase' {
    return process.env.STORAGE_DRIVER === 'supabase' ? 'supabase' : 'local'
  },
  get supabase() {
    return {
      url: process.env.SUPABASE_URL || null,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
      bucket: process.env.SUPABASE_BUCKET || 'calling-desk',
    }
  },
}

/** LLM 기능(조각 추출·문장 다듬기·뼈대 생성) 사용 가능 여부 */
export function llmAvailable(): boolean {
  return Boolean(env.anthropicKey)
}
