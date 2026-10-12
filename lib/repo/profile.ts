import { query, queryOne } from '../db'
import { mapProfile } from './mappers'
import type { Profile } from './types'

export async function getProfile(): Promise<Profile | null> {
  const r = await queryOne('select * from profile where id = 1')
  return r ? mapProfile(r) : null
}

export async function saveProfile(p: Profile): Promise<void> {
  await query(
    `insert into profile (id, name, birth_year, birth_date, presbytery, ordination_year,
       seminary, career_years_senior, career_years_associate, pension_enrolled,
       preferred_regions, excluded_regions, min_church_size)
     values (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do update set
       name=$1, birth_year=$2, birth_date=$3, presbytery=$4, ordination_year=$5,
       seminary=$6, career_years_senior=$7, career_years_associate=$8, pension_enrolled=$9,
       preferred_regions=$10, excluded_regions=$11, min_church_size=$12`,
    [p.name, p.birthYear, p.birthDate, p.presbytery, p.ordinationYear, p.seminary,
     p.careerYearsSenior, p.careerYearsAssociate, p.pensionEnrolled,
     p.preferredRegions, p.excludedRegions, p.minChurchSize],
  )
}
