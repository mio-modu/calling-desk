import { revalidatePath } from 'next/cache'
import { getProfile, saveProfile } from '@/lib/repo/profile'
import { formatKorean } from '@/lib/date'
import { Button, Card, Input, Label, Textarea } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: '프로필 · 청빙 작업대' }

async function save(formData: FormData) {
  'use server'
  const num = (k: string) => {
    const v = String(formData.get(k) ?? '').trim()
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const str = (k: string) => String(formData.get(k) ?? '').trim() || null
  const list = (k: string) =>
    String(formData.get(k) ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

  await saveProfile({
    name: str('name'),
    birthYear: num('birthYear'),
    birthDate: str('birthDate'),
    presbytery: str('presbytery'),
    ordinationYear: num('ordinationYear'),
    seminary: str('seminary'),
    careerYearsSenior: num('careerYearsSenior'),
    careerYearsAssociate: num('careerYearsAssociate'),
    pensionEnrolled: formData.get('pensionEnrolled') === 'on',
    preferredRegions: list('preferredRegions'),
    excludedRegions: list('excludedRegions'),
    minChurchSize: num('minChurchSize'),
    updatedAt: null,
  })

  revalidatePath('/profile')
}

export default async function ProfilePage() {
  const p = await getProfile()

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <Card
        title="프로필"
        subtitle={
          p?.updatedAt
            ? `최종 수정 ${formatKorean(p.updatedAt)} — Phase 3 의 자격 판정이 이 값을 씁니다.`
            : 'Phase 3 의 자격 판정(공고 요건 대조)이 이 값을 씁니다.'
        }
      >
        <form action={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>성명</Label><Input name="name" defaultValue={p?.name ?? ''} /></div>
            <div><Label>소속 노회</Label><Input name="presbytery" defaultValue={p?.presbytery ?? ''} /></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label hint="— 연령 요건 판정 기준">출생연도</Label>
              <Input name="birthYear" type="number" inputMode="numeric" defaultValue={p?.birthYear ?? ''} />
            </div>
            <div><Label>생년월일</Label><Input name="birthDate" type="date" defaultValue={p?.birthDate ?? ''} /></div>
            <div>
              <Label>안수 연도</Label>
              <Input name="ordinationYear" type="number" inputMode="numeric" defaultValue={p?.ordinationYear ?? ''} />
            </div>
          </div>

          <div><Label>신학대학원</Label><Input name="seminary" defaultValue={p?.seminary ?? ''} /></div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label hint="— 년">담임 경력</Label>
              <Input name="careerYearsSenior" type="number" step="0.5" defaultValue={p?.careerYearsSenior ?? ''} />
            </div>
            <div>
              <Label hint="— 년">부교역자 경력</Label>
              <Input name="careerYearsAssociate" type="number" step="0.5" defaultValue={p?.careerYearsAssociate ?? ''} />
            </div>
            <div>
              <Label hint="— 명">최소 교회 규모</Label>
              <Input name="minChurchSize" type="number" defaultValue={p?.minChurchSize ?? ''} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label hint="— 쉼표로 구분">선호 지역</Label>
              <Textarea name="preferredRegions" rows={2} defaultValue={(p?.preferredRegions ?? []).join(', ')} />
            </div>
            <div>
              <Label hint="— 쉼표로 구분">제외 지역</Label>
              <Textarea name="excludedRegions" rows={2} defaultValue={(p?.excludedRegions ?? []).join(', ')} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" name="pensionEnrolled" defaultChecked={p?.pensionEnrolled ?? false} className="size-4" />
            총회연금 가입
          </label>

          <Button type="submit">저장</Button>
        </form>
      </Card>
    </main>
  )
}
