// 준비도 집계. 화면은 판정 로직을 갖지 않고 이 함수의 결과만 그린다.
import { COMPLETION, DOC_TYPES_BY_SEQ, DOC_TYPE_META, type DocType } from './domain'
import { isDocComplete, type ReadinessItem } from './readiness'
import { kstTodayISO } from './date'
import { listActiveDocs } from './repo/docs'
import {
  expiringCredentials, isCredentialComplete, listCredentials,
} from './repo/credentials'
import type { Credential, MasterDoc } from './repo/types'

export type DocSummary = {
  docType: DocType
  label: string
  reuse: string
  kind: 'written' | 'media'
  doc: MasterDoc | null
  score: number
  complete: boolean
  topIssues: ReadinessItem[]
  blockerCount: number
}

export type Dashboard = {
  total: number
  complete: number
  docsComplete: number
  credentialsComplete: number
  docs: DocSummary[]
  credentials: Credential[]
  expiring: Credential[]
}

export async function loadDashboard(today = kstTodayISO()): Promise<Dashboard> {
  const [active, credentials] = await Promise.all([listActiveDocs(), listCredentials()])

  const docs: DocSummary[] = DOC_TYPES_BY_SEQ.map((docType) => {
    const meta = DOC_TYPE_META[docType]
    const doc = active[docType] ?? null
    const detail = doc?.readinessDetail ?? []
    const score = doc?.readinessScore ?? 0
    return {
      docType,
      label: meta.label,
      reuse: meta.reuse,
      kind: meta.kind,
      doc,
      score,
      complete: Boolean(doc) && isDocComplete(score, detail),
      topIssues: detail.slice(0, 3),
      blockerCount: detail.filter((d) => d.severity === 'blocker').length,
    }
  })

  const docsComplete = docs.filter((d) => d.complete).length
  const credentialsComplete = credentials.filter((c) => isCredentialComplete(c, today)).length

  return {
    total: COMPLETION.totalItems,
    complete: docsComplete + credentialsComplete,
    docsComplete,
    credentialsComplete,
    docs,
    credentials,
    expiring: expiringCredentials(credentials, today),
  }
}
