import { toISODate } from '../date'
import type { DocType, EvidenceSource, EvidenceType, CredentialStatus } from '../domain'
import type {
  CoachQuestionRow, Credential, DocLink, Evidence, EvidenceCandidate,
  MasterDoc, Profile, UploadedDoc,
} from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mapEvidence(r: any): Evidence {
  return {
    id: r.id,
    type: r.type as EvidenceType,
    title: r.title,
    body: r.body,
    periodFrom: toISODate(r.period_from),
    periodTo: toISODate(r.period_to),
    tags: r.tags ?? [],
    strength: r.strength,
    verified: r.verified,
    source: r.source as EvidenceSource,
    sourceRef: r.source_ref,
    sourceQuote: r.source_quote,
    createdAt: r.created_at?.toISOString?.() ?? String(r.created_at),
    updatedAt: r.updated_at?.toISOString?.() ?? String(r.updated_at),
  }
}

export function mapDoc(r: any): MasterDoc {
  return {
    id: r.id,
    docType: r.doc_type as DocType,
    version: r.version,
    title: r.title,
    contentMd: r.content_md,
    isActive: r.is_active,
    note: r.note,
    readinessScore: r.readiness_score,
    readinessDetail: r.readiness_detail ?? [],
    validUntil: toISODate(r.valid_until),
    createdAt: r.created_at?.toISOString?.() ?? String(r.created_at),
  }
}

export function mapLink(r: any): DocLink {
  return { id: r.id, evidenceId: r.evidence_id, section: r.section, evidence: mapEvidence(r) }
}

export function mapCredential(r: any): Credential {
  return {
    id: r.id,
    seq: r.seq,
    docName: r.doc_name,
    issuer: r.issuer,
    leadTimeDays: r.lead_time_days,
    leadTimeNote: r.lead_time_note,
    status: r.status as CredentialStatus,
    requestedAt: toISODate(r.requested_at),
    receivedAt: toISODate(r.received_at),
    validUntil: toISODate(r.valid_until),
    reusable: r.reusable,
    filePath: r.file_path,
    warning: r.warning,
    note: r.note,
  }
}

export function mapQuestion(r: any): CoachQuestionRow {
  return {
    id: r.id,
    ruleCode: r.rule_code,
    dedupeKey: r.dedupe_key,
    question: r.question,
    rationale: r.rationale,
    targetType: r.target_type,
    targetId: r.target_id,
    priority: r.priority,
    status: r.status,
    askedAt: r.asked_at?.toISOString?.() ?? (r.asked_at ? String(r.asked_at) : null),
    snoozeUntil: toISODate(r.snooze_until),
  }
}

export function mapProfile(r: any): Profile {
  return {
    name: r.name,
    birthYear: r.birth_year,
    birthDate: toISODate(r.birth_date),
    presbytery: r.presbytery,
    ordinationYear: r.ordination_year,
    seminary: r.seminary,
    careerYearsSenior: r.career_years_senior == null ? null : Number(r.career_years_senior),
    careerYearsAssociate: r.career_years_associate == null ? null : Number(r.career_years_associate),
    pensionEnrolled: r.pension_enrolled,
    preferredRegions: r.preferred_regions ?? [],
    excludedRegions: r.excluded_regions ?? [],
    minChurchSize: r.min_church_size,
    updatedAt: r.updated_at?.toISOString?.() ?? null,
  }
}

export function mapUpload(r: any): UploadedDoc {
  return {
    id: r.id,
    filename: r.filename,
    mime: r.mime,
    byteSize: r.byte_size,
    storagePath: r.storage_path,
    extractedText: r.extracted_text,
    extractStatus: r.extract_status,
    extractError: r.extract_error,
    analysisStatus: r.analysis_status,
    analysisError: r.analysis_error,
    createdAt: r.created_at?.toISOString?.() ?? String(r.created_at),
  }
}

export function mapCandidate(r: any): EvidenceCandidate {
  return {
    id: r.id,
    uploadedDocId: r.uploaded_doc_id,
    type: r.type as EvidenceType,
    title: r.title,
    body: r.body,
    periodFrom: toISODate(r.period_from),
    periodTo: toISODate(r.period_to),
    tags: r.tags ?? [],
    sourceQuote: r.source_quote,
    status: r.status,
    promotedEvidenceId: r.promoted_evidence_id,
  }
}
