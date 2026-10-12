import type {
  CredentialStatus, DocType, EvidenceSource, EvidenceType,
} from '../domain'
import type { ReadinessItem } from '../readiness'

export type Profile = {
  name: string | null
  birthYear: number | null
  birthDate: string | null
  presbytery: string | null
  ordinationYear: number | null
  seminary: string | null
  careerYearsSenior: number | null
  careerYearsAssociate: number | null
  pensionEnrolled: boolean | null
  preferredRegions: string[]
  excludedRegions: string[]
  minChurchSize: number | null
  updatedAt: string | null
}

export type Evidence = {
  id: string
  type: EvidenceType
  title: string
  body: string
  periodFrom: string | null
  periodTo: string | null
  tags: string[]
  strength: number
  verified: boolean
  source: EvidenceSource
  sourceRef: string | null
  sourceQuote: string | null
  createdAt: string
  updatedAt: string
}

export type MasterDoc = {
  id: string
  docType: DocType
  version: number
  title: string
  contentMd: string
  isActive: boolean
  note: string
  readinessScore: number | null
  readinessDetail: ReadinessItem[]
  validUntil: string | null
  createdAt: string
}

export type DocLink = {
  id: string
  evidenceId: string
  section: string
  evidence: Evidence
}

export type Credential = {
  id: string
  seq: number
  docName: string
  issuer: string
  leadTimeDays: number | null
  leadTimeNote: string | null
  status: CredentialStatus
  requestedAt: string | null
  receivedAt: string | null
  validUntil: string | null
  reusable: boolean
  filePath: string | null
  warning: string | null
  note: string
}

export type CoachQuestionRow = {
  id: string
  ruleCode: string
  dedupeKey: string
  question: string
  rationale: string
  targetType: string | null
  targetId: string | null
  priority: number
  status: 'pending' | 'answered' | 'dismissed'
  askedAt: string | null
  snoozeUntil: string | null
}

export type UploadedDoc = {
  id: string
  filename: string
  mime: string | null
  byteSize: number | null
  storagePath: string | null
  extractedText: string
  extractStatus: 'extracted' | 'failed'
  extractError: string | null
  analysisStatus: 'pending' | 'analyzed' | 'failed'
  analysisError: string | null
  createdAt: string
}

export type EvidenceCandidate = {
  id: string
  uploadedDocId: string
  type: EvidenceType
  title: string
  body: string
  periodFrom: string | null
  periodTo: string | null
  tags: string[]
  sourceQuote: string
  status: 'pending' | 'accepted' | 'rejected'
  promotedEvidenceId: string | null
}
