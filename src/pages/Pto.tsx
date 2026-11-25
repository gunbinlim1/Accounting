import { CalendarPlus, Check, ChevronDown, Clock, Palmtree, Plus, Settings2, X } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { formatDate } from '../lib/format'
import { compareByName, fullName } from '../lib/names'
import { addDaysIso, employmentStatus } from '../lib/employment'
import { accrualText, defaultRequestHours, policyAppliesTo, ptoEligibleFrom, ptoKindLabel, ptoLedger, type PtoBalance } from '../lib/pto'
import { parseISODate, toISODate } from '../lib/schedule'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { Employee, PayType, PtoPolicy, PtoRequest } from '../types'

type T = (ko: string, en: string) => string

/** 휴가(PTO) 관리: 잔액 한눈에 보기 · 신청 승인 · 휴가 등록 · 잔액 조정 · 규칙 */
export default function Pto() {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const store = useStore()
  const { employees, runs, pto, time } = store
  const me = session?.name ?? store.company.ownerName
  const actor = session?.role === 'firm' ? 'firm' : 'client'
  const [now] = useState(() => new Date())
  const today = toISODate(now)
  const [recording, setRecording] = useState(false)
  const [policyForm, setPolicyForm] = useState<PtoPolicy | 'new' | null>(null)
  const [openEmp, setOpenEmp] = useState<string | null>(null)

  const policies = pto.policies.filter((p) => p.active)
  const recentCut = addDaysIso(today, -180)
  // 재직·입사 예정·퇴사 예정 직원 + 최근 180일 안에 퇴사한 직원(남은 잔액 확인용)
  const active = useMemo(() => employees.filter((e) => employmentStatus(e, today) !== 'former' || (e.terminationDate && e.terminationDate >= recentCut)).sort(compareByName), [employees, today, recentCut])
  const working = active.filter((e) => employmentStatus(e, today) !== 'former')
  const name = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? fullName(e) : ''
  }
  const policyName = (id: string) => pto.policies.find((p) => p.id === id)?.name ?? ''
  const d = (iso: string) => formatDate(parseISODate(iso), locale, { month: 'short', day: 'numeric', weekday: 'short' })
  const range = (r: PtoRequest) => (r.startDate === r.endDate ? d(r.startDate) : `${d(r.startDate)} – ${d(r.endDate)}`)

  const balances = useMemo(() => {
    const m = new Map<string, PtoBalance[]>()
    for (const e of active) m.set(e.id, policies.filter((p) => policyAppliesTo(p, e)).map((p) => ptoLedger(e, p, runs, pto.adjustments, now)))
    return m
  }, [active, policies, runs, pto.adjustments, now])
  /** 아직 처리 안 된 이번 회차에 입력한 휴가 시간 */
  const pendingUse = (e: Employee, policyId: string) => time[e.id]?.timeOff?.[policyId] ?? 0

  const pending = pto.requests.filter((r) => r.status === 'pending').sort((a, b) => a.startDate.localeCompare(b.startDate))
  const upcoming = pto.requests.filter((r) => r.status === 'approved' && r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))

  if (!pto.policies.length && policyForm === null) {
    return (
      <div className="page">
        <PageHead t={t} />
        <section className="card pto-start">
          <span className="pto-start-icon"><Palmtree size={28} aria-hidden /></span>
          <h2>{t('휴가 규칙부터 정해 볼까요?', 'Let’s set up your time-off rules')}</h2>
          <p className="muted">{t('규칙을 만들면 급여를 처리할 때마다 직원별 휴가 시간이 자동으로 쌓이고, 사용한 만큼 줄어들어요. 많이 쓰는 방식에서 고르고 나중에 바꿀 수 있어요.', 'Balances build up automatically with each payroll and go down as time off is used. Start from a common setup — you can change it later.')}</p>
          <div className="pto-presets">
            {presets(t).map((p) => (
              <button key={p.key} type="button" className="pto-preset" onClick={() => setPolicyForm({ ...p.policy, id: '' })}>
                <strong>{p.title}</strong>
                <small>{p.detail}</small>
              </button>
            ))}
          </div>
          <p className="muted small">{t('텍사스는 유급 휴가를 법으로 정하지 않아요. 회사 방침대로 정하면 되고, 정한 규칙은 직원에게 알려 주세요.', 'Texas doesn’t require paid leave — follow your company policy and share it with your team.')}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHead t={t} action={
        <div className="row gap">
          <button type="button" className="btn" onClick={() => setPolicyForm(policyForm ? null : 'new')}><Settings2 size={16} aria-hidden /> {t('휴가 규칙', 'Rules')}</button>
          <button type="button" className="btn primary" onClick={() => setRecording(true)} disabled={!policies.length}><CalendarPlus size={16} aria-hidden /> {t('휴가 등록', 'Record time off')}</button>
        </div>
      } />

      {policyForm !== null && (
        <PolicySection
          policies={pto.policies}
          editing={policyForm}
          onEdit={setPolicyForm}
          onSave={async (p) => { await store.savePtoPolicy(p, me, actor); setPolicyForm(null) }}
        />
      )}

      {recording && (
        <RecordForm
          employees={working}
          policies={policies}
          onCancel={() => setRecording(false)}
          onSave={async (r) => { await store.requestPto(r, actor, me); setRecording(false) }}
        />
      )}

      {pending.length > 0 && (
        <section className="card pto-pending">
          <div className="card-head"><h2><Clock size={18} aria-hidden /> {t(`승인 대기 ${pending.length}건`, `${pending.length} request(s) to review`)}</h2></div>
          <ul className="pto-req-list">
            {pending.map((r) => {
              const e = employees.find((x) => x.id === r.employeeId)
              const bal = balances.get(r.employeeId)?.find((b) => b.policy.id === r.policyId)?.balance
              return (
                <li key={r.id}>
                  <span className="pto-req-main">
                    <strong>{name(r.employeeId)}</strong>
                    <span>{range(r)} · <b>{r.hours}h</b> <span className="tag neutral">{policyName(r.policyId)}</span></span>
                    {r.note && <small className="muted">“{r.note}”</small>}
                    {bal !== undefined && <small className={bal < r.hours ? 'warn-text' : 'muted'}>{t(`현재 잔액 ${bal}h`, `Balance ${bal}h`)}{bal < r.hours ? t(' — 잔액보다 많아요', ' — more than balance') : ''}</small>}
                  </span>
                  <span className="row gap">
                    <button type="button" className="btn sm" onClick={() => void store.decidePto(r.id, 'denied', me, actor)}><X size={14} aria-hidden /> {t('거절', 'Deny')}</button>
                    <button type="button" className="btn sm primary" disabled={!e} onClick={() => void store.decidePto(r.id, 'approved', me, actor)}><Check size={14} aria-hidden /> {t('승인', 'Approve')}</button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card list-card pto-balances" style={{ ['--cols' as string]: Math.max(1, policies.length) }}>
        <div className="table-toolbar"><h2>{t('직원별 휴가 잔액', 'Balances by employee')}</h2><span className="muted small">{t('처리된 급여 기준 · 행을 누르면 내역', 'From processed payrolls · click a row for history')}</span></div>
        <div className="pto-bal-head" aria-hidden>
          <span>{t('직원', 'Employee')}</span>
          {policies.map((p) => <span key={p.id} className="num">{p.name}</span>)}
          <span />
        </div>
        <ul className="pto-bal-list">
          {active.map((e) => {
            const bs = balances.get(e.id) ?? []
            const isOpen = openEmp === e.id
            return (
              <Fragment key={e.id}>
                <li className={isOpen ? 'open' : ''}>
                  <button type="button" className="pto-bal-row" onClick={() => setOpenEmp(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <span className="pto-who">
                      <strong>{fullName(e)}</strong>
                      <small className="muted">{payTypeLabel(e.payType, t)} · {t(`${d(e.hireDate)} 입사`, `hired ${d(e.hireDate)}`)}{e.terminationDate ? t(` · ${d(e.terminationDate)} 퇴사`, ` · left ${d(e.terminationDate)}`) : ''}</small>
                    </span>
                    {policies.map((p) => {
                      const b = bs.find((x) => x.policy.id === p.id)
                      if (!b) return <span key={p.id} className="num muted">—</span>
                      const use = pendingUse(e, p.id)
                      const from = ptoEligibleFrom(e, p)
                      if (from > today && b.balance === 0) {
                        return (
                          <span key={p.id} className="num pto-amount waiting">
                            <strong className="muted">{t('대기 중', 'Waiting')}</strong>
                            <small className="muted">{t(`${d(from)}부터 적립`, `accrues from ${d(from)}`)}</small>
                          </span>
                        )
                      }
                      return (
                        <span key={p.id} className="num pto-amount">
                          <strong>{round(b.balance - use)}<small>h</small></strong>
                          <small className="muted">{e.terminationDate && e.terminationDate < today ? t('퇴사 — 남은 잔액', 'Left — remaining') : use > 0 ? t(`이번 회차 −${use}h`, `−${use}h this run`) : from > today ? t(`${d(from)}부터 적립`, `accrues from ${d(from)}`) : p.maxBalance !== null ? t(`최대 ${p.maxBalance}h`, `max ${p.maxBalance}h`) : ' '}</small>
                        </span>
                      )
                    })}
                    <ChevronDown size={18} className="chev" aria-hidden />
                  </button>
                </li>
                {isOpen && (
                  <li className="pto-detail">
                    {bs.map((b) => (
                      <LedgerView key={b.policy.id} employee={e} balance={b} onAdjust={(a) => store.adjustPto({ ...a, employeeId: e.id, policyId: b.policy.id }, me, actor)} />
                    ))}
                    {!bs.length && <p className="muted small">{t('이 직원에게 적용되는 휴가 규칙이 없어요.', 'No time-off rule applies to this employee.')}</p>}
                  </li>
                )}
              </Fragment>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <div className="card-head"><h2>{t('예정된 휴가', 'Upcoming time off')}</h2></div>
        {upcoming.length === 0 ? (
          <p className="muted small">{t('승인된 휴가가 없어요.', 'No approved time off coming up.')}</p>
        ) : (
          <ul className="pto-req-list">
            {upcoming.map((r) => (
              <li key={r.id}>
                <span className="pto-req-main">
                  <strong>{name(r.employeeId)}</strong>
                  <span>{range(r)} · <b>{r.hours}h</b> <span className="tag neutral">{policyName(r.policyId)}</span></span>
                  <small className="muted">{r.requestedBy === 'employee' ? t('직원 신청', 'Employee request') : t('회사 등록', 'Recorded')}{r.decidedByName ? ` · ${r.decidedByName}` : ''}{r.note ? ` · “${r.note}”` : ''}</small>
                </span>
                <button type="button" className="btn sm ghost" onClick={() => {
                  if (window.confirm(t('이 휴가를 취소할까요?', 'Cancel this time off?'))) void store.decidePto(r.id, 'cancelled', me, actor)
                }}>{t('취소', 'Cancel')}</button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{t('급여 실행 화면에서 "승인된 휴가 반영"을 누르면 그 급여 기간에 들어가는 휴가 시간이 자동으로 채워져요.', 'In Run payroll, “Fill approved time off” adds the hours that fall in that pay period.')}</p>
      </section>
    </div>
  )
}

const round = (n: number) => Math.round(n * 100) / 100

const payTypeLabel = (p: PayType, t: T) => ({ hourly: t('시급', 'Hourly'), tipped: t('팁 직원', 'Tipped'), salary: t('연봉', 'Salary') })[p]

function PageHead({ t, action }: { t: T; action?: ReactNode }) {
  return (
    <header className="page-head row between wrap">
      <div>
        <h1>{t('휴가 (PTO)', 'Time off (PTO)')}</h1>
        <p className="lead">{t('직원별 휴가 잔액을 보고, 신청을 승인하고, 쓴 휴가를 급여에 반영해요.', 'See balances, approve requests, and pay time off through payroll.')}</p>
      </div>
      {action}
    </header>
  )
}

function presets(t: T): { key: string; title: string; detail: string; policy: Omit<PtoPolicy, 'id'> }[] {
  const all: PayType[] = ['hourly', 'tipped', 'salary']
  return [
    { key: 'hour', title: t('일한 만큼 쌓기', 'Earn as you work'), detail: t('근무 30시간마다 1시간 · 최대 40시간 (시급 직원에게 흔한 방식)', '1h per 30h worked · max 40h'), policy: { name: 'PTO', kind: 'pto', accrual: 'per_hour', amount: 1, perHours: 30, maxBalance: 40, appliesTo: all, waitingDays: 0, active: true } },
    { key: 'year', title: t('매년 정해진 시간', 'Fixed yearly amount'), detail: t('입사 90일 후부터 · 매년 1월 1일 40시간 (5일) · 최대 80시간', 'After 90 days · 40h every Jan 1 · max 80h'), policy: { name: t('연차', 'Vacation'), kind: 'vacation', accrual: 'annual', amount: 40, perHours: 30, maxBalance: 80, appliesTo: all, waitingDays: 90, active: true } },
    { key: 'period', title: t('급여마다 조금씩', 'A little each payroll'), detail: t('급여 회차마다 3시간 · 최대 80시간', '3h every payroll · max 80h'), policy: { name: 'PTO', kind: 'pto', accrual: 'per_period', amount: 3, perHours: 30, maxBalance: 80, appliesTo: all, waitingDays: 0, active: true } },
    { key: 'none', title: t('기록만 하기', 'Just track it'), detail: t('적립 없이 쓴 휴가만 기록 (잔액은 직접 넣기)', 'No accrual — enter balances yourself'), policy: { name: t('병가', 'Sick leave'), kind: 'sick', accrual: 'none', amount: 0, perHours: 30, maxBalance: null, appliesTo: all, waitingDays: 0, active: true } },
  ]
}

/** 휴가 규칙 목록·추가·수정 */
function PolicySection({ policies, editing, onEdit, onSave }: {
  policies: PtoPolicy[]
  editing: PtoPolicy | 'new'
  onEdit: (p: PtoPolicy | 'new' | null) => void
  onSave: (p: Omit<PtoPolicy, 'id'> & { id?: string }) => Promise<void>
}) {
  const { t } = usePrefs()
  const formFor = editing === 'new' ? null : editing
  return (
    <section className="card pto-policies">
      <div className="card-head"><h2><Settings2 size={18} aria-hidden /> {t('휴가 규칙', 'Time-off rules')}</h2><button type="button" className="btn sm ghost" onClick={() => onEdit(null)}><X size={14} aria-hidden /> {t('닫기', 'Close')}</button></div>
      {policies.length > 0 && (
        <ul className="pto-policy-list">
          {policies.map((p) => (
            <li key={p.id} className={p.active ? '' : 'off'}>
              <span><strong>{p.name}</strong> <span className="tag neutral">{ptoKindLabel(p.kind, t)}</span>{!p.active && <span className="tag neutral">{t('사용 안 함', 'Off')}</span>}<small className="muted">{accrualText(p, t)} · {p.appliesTo.map((x) => payTypeLabel(x, t)).join(', ')}</small></span>
              <button type="button" className="btn sm" onClick={() => onEdit(p)}>{t('수정', 'Edit')}</button>
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' && <PolicyForm key="new" onCancel={() => onEdit(null)} onSave={onSave} />}
      {formFor && <PolicyForm key={formFor.id || 'preset'} initial={formFor} onCancel={() => onEdit(null)} onSave={onSave} />}
      {editing !== 'new' && !formFor && <button type="button" className="btn" onClick={() => onEdit('new')}><Plus size={15} aria-hidden /> {t('규칙 추가', 'Add a rule')}</button>}
    </section>
  )
}

function PolicyForm({ initial, onSave, onCancel }: { initial?: PtoPolicy; onSave: (p: Omit<PtoPolicy, 'id'> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const { t } = usePrefs()
  const [p, setP] = useState<Omit<PtoPolicy, 'id'>>(initial ?? { name: 'PTO', kind: 'pto', accrual: 'per_hour', amount: 1, perHours: 30, maxBalance: 40, appliesTo: ['hourly', 'tipped', 'salary'], waitingDays: 0, active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((x) => ({ ...x, [k]: v }))
  const ok = p.name.trim() && p.appliesTo.length && (p.accrual === 'none' || p.amount > 0) && p.perHours > 0
  const save = async () => {
    setSaving(true)
    setError(null)
    try { await onSave({ ...p, id: initial?.id || undefined }) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSaving(false) }
  }
  const accruals: { v: PtoPolicy['accrual']; label: string }[] = [
    { v: 'per_hour', label: t('일한 시간만큼', 'Per hours worked') },
    { v: 'per_period', label: t('급여마다', 'Each payroll') },
    { v: 'annual', label: t('매년', 'Yearly') },
    { v: 'none', label: t('적립 없음', 'No accrual') },
  ]
  return (
    <div className="pto-form">
      <h3>{initial?.id ? t('규칙 수정', 'Edit rule') : t('새 휴가 규칙', 'New rule')}</h3>
      <div className="form-grid">
        <label className="field"><span>{t('이름', 'Name')}</span><input value={p.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder={t('예: PTO, 병가', 'e.g. PTO, Sick')} /></label>
        <label className="field"><span>{t('종류', 'Type')}</span>
          <select value={p.kind} onChange={(e) => set('kind', e.target.value as PtoPolicy['kind'])}>
            {(['pto', 'vacation', 'sick', 'other'] as const).map((k) => <option key={k} value={k}>{ptoKindLabel(k, t)}</option>)}
          </select>
        </label>
      </div>
      <div className="field"><span>{t('쌓이는 방식', 'How it builds up')}</span>
        <div className="segmented">
          {accruals.map((a) => <button key={a.v} type="button" className={p.accrual === a.v ? 'on' : ''} onClick={() => set('accrual', a.v)}>{a.label}</button>)}
        </div>
      </div>
      {p.accrual !== 'none' && (
        <p className="pto-sentence">
          {p.accrual === 'per_hour' && <>{t('근무', 'Every')} <input type="number" min={1} step={1} value={p.perHours} onChange={(e) => set('perHours', Math.max(1, Number(e.target.value) || 1))} /> {t('시간마다', 'hours worked earns')} <input type="number" min={0} step={0.25} value={p.amount} onChange={(e) => set('amount', Math.max(0, Number(e.target.value) || 0))} /> {t('시간 적립', 'hour(s)')}</>}
          {p.accrual === 'per_period' && <>{t('급여 회차마다', 'Each payroll earns')} <input type="number" min={0} step={0.25} value={p.amount} onChange={(e) => set('amount', Math.max(0, Number(e.target.value) || 0))} /> {t('시간 적립', 'hour(s)')}</>}
          {p.accrual === 'annual' && <>{t('매년 1월 1일에', 'Every Jan 1, grant')} <input type="number" min={0} step={1} value={p.amount} onChange={(e) => set('amount', Math.max(0, Number(e.target.value) || 0))} /> {t('시간 지급 (입사 첫해는 입사일)', 'hours (hire date in the first year)')}</>}
        </p>
      )}
      {p.accrual !== 'none' && (
        <div className="field"><span>{t('입사 후 대기 기간 (이 기간에는 적립 안 됨)', 'Waiting period after hire (no accrual)')}</span>
          <div className="wait-pick">
            {[0, 30, 60, 90].map((n) => (
              <button key={n} type="button" className={`chip${p.waitingDays === n ? ' on' : ''}`} onClick={() => set('waitingDays', n)}>{n === 0 ? t('없음 (입사일부터)', 'None (from hire date)') : t(`${n}일`, `${n} days`)}</button>
            ))}
            <label className="wait-custom">{t('직접', 'Custom')} <input type="number" min={0} max={730} step={1} value={p.waitingDays} onChange={(e) => set('waitingDays', Math.min(730, Math.max(0, Math.round(Number(e.target.value) || 0))))} /> {t('일', 'days')}</label>
          </div>
        </div>
      )}
      <div className="form-grid">
        <label className="field"><span>{t('최대 잔액 (비우면 제한 없음)', 'Max balance (blank = no limit)')}</span>
          <input type="number" min={0} step={1} value={p.maxBalance ?? ''} onChange={(e) => set('maxBalance', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} placeholder={t('제한 없음', 'No limit')} />
        </label>
        <div className="field"><span>{t('적용 대상', 'Applies to')}</span>
          <div className="chips">
            {(['hourly', 'tipped', 'salary'] as PayType[]).map((x) => (
              <label key={x} className={`chip${p.appliesTo.includes(x) ? ' on' : ''}`}>
                <input type="checkbox" className="sr-only" checked={p.appliesTo.includes(x)} onChange={() => set('appliesTo', p.appliesTo.includes(x) ? p.appliesTo.filter((y) => y !== x) : [...p.appliesTo, x])} />
                {payTypeLabel(x, t)}
              </label>
            ))}
          </div>
        </div>
      </div>
      {initial?.id && (
        <label className="check-line"><input type="checkbox" checked={!p.active} onChange={(e) => set('active', !e.target.checked)} /> {t('이 규칙 사용 안 함 (기록은 남아요)', 'Turn this rule off (history is kept)')}</label>
      )}
      <p className="muted small">{t('연봉 직원은 회차마다 표준 근무시간(주 40시간)으로 적립돼요. 팁 직원의 휴가는 최저임금($7.25)으로 지급돼요.', 'Salaried staff accrue on a standard 40-hour week. Tipped staff are paid $7.25/h for time off.')}</p>
      {error && <p className="de-error" role="alert">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>{t('취소', 'Cancel')}</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!ok || saving}>{saving ? t('저장 중…', 'Saving…') : t('저장', 'Save')}</button>
      </div>
    </div>
  )
}

/** 회사가 휴가를 등록 (바로 승인) */
function RecordForm({ employees, policies, onSave, onCancel }: {
  employees: Employee[]
  policies: PtoPolicy[]
  onSave: (r: { employeeId: string; policyId: string; startDate: string; endDate: string; hours: number; note: string }) => Promise<void>
  onCancel: () => void
}) {
  const { t } = usePrefs()
  const [r, setR] = useState({ employeeId: employees[0]?.id ?? '', policyId: '', startDate: '', endDate: '', hours: 0, note: '' })
  const [hoursTouched, setHoursTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emp = employees.find((e) => e.id === r.employeeId)
  const choices = emp ? policies.filter((p) => policyAppliesTo(p, emp)) : []
  const policyId = choices.some((p) => p.id === r.policyId) ? r.policyId : choices[0]?.id ?? ''
  const end = r.endDate || r.startDate
  const hours = hoursTouched ? r.hours : defaultRequestHours(r.startDate, end)
  const ok = r.employeeId && policyId && r.startDate && end >= r.startDate && hours > 0
  const save = async () => {
    setSaving(true)
    setError(null)
    try { await onSave({ ...r, policyId, endDate: end, hours }) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSaving(false) }
  }
  return (
    <section className="card pto-form">
      <h3><CalendarPlus size={18} aria-hidden /> {t('휴가 등록', 'Record time off')}</h3>
      <div className="form-grid">
        <label className="field"><span>{t('직원', 'Employee')}</span>
          <select value={r.employeeId} onChange={(e) => setR({ ...r, employeeId: e.target.value })}>
            {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('휴가 종류', 'Type')}</span>
          <select value={policyId} onChange={(e) => setR({ ...r, policyId: e.target.value })} disabled={!choices.length}>
            {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('시작일', 'From')}</span><input type="date" value={r.startDate} onChange={(e) => setR({ ...r, startDate: e.target.value })} /></label>
        <label className="field"><span>{t('종료일', 'To')}</span><input type="date" value={end} min={r.startDate} onChange={(e) => setR({ ...r, endDate: e.target.value })} /></label>
        <label className="field"><span>{t('시간 (평일 × 8시간 자동)', 'Hours (weekdays × 8)')}</span>
          <input type="number" min={0.25} step={0.25} value={hours || ''} onChange={(e) => { setHoursTouched(true); setR({ ...r, hours: Math.max(0, Number(e.target.value) || 0) }) }} />
        </label>
        <label className="field"><span>{t('메모 (선택)', 'Note (optional)')}</span><input value={r.note} maxLength={300} onChange={(e) => setR({ ...r, note: e.target.value })} /></label>
      </div>
      {!choices.length && <p className="warn-text small">{t('이 직원에게 적용되는 휴가 규칙이 없어요.', 'No rule applies to this employee.')}</p>}
      {error && <p className="de-error" role="alert">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>{t('취소', 'Cancel')}</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={!ok || saving}>{saving ? t('저장 중…', 'Saving…') : t('등록 (승인됨)', 'Save as approved')}</button>
      </div>
    </section>
  )
}

/** 한 직원·한 규칙의 내역 + 잔액 조정 */
function LedgerView({ employee, balance, onAdjust }: { employee: Employee; balance: PtoBalance; onAdjust: (a: { hours: number; effectiveDate: string; reason: string }) => Promise<void> }) {
  const { t, locale } = usePrefs()
  const [adjusting, setAdjusting] = useState(false)
  const [hours, setHours] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kindText = { adjusted: t('조정', 'Adjusted'), granted: t('연간 지급', 'Granted'), accrued: t('적립', 'Accrued'), used: t('사용', 'Used') }
  const save = async () => {
    const h = Number(hours)
    if (!h || !reason.trim()) return
    setSaving(true)
    setError(null)
    try { await onAdjust({ hours: h, effectiveDate: toISODate(new Date()), reason }); setAdjusting(false); setHours(''); setReason('') } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setSaving(false) }
  }
  const recent = [...balance.entries].reverse().slice(0, 12)
  return (
    <div className="ledger">
      <div className="ledger-head">
        <strong>{balance.policy.name}</strong>
        <span className="muted small">{t(`적립 ${balance.accrued}h · 사용 ${balance.used}h · 잔액 ${balance.balance}h`, `Earned ${balance.accrued}h · used ${balance.used}h · balance ${balance.balance}h`)}</span>
        <button type="button" className="btn sm" onClick={() => setAdjusting(!adjusting)}>{t('잔액 조정', 'Adjust')}</button>
      </div>
      {adjusting && (
        <div className="ledger-adjust">
          <label className="field"><span>{t('시간 (+ 더하기 / − 빼기)', 'Hours (+ add / − subtract)')}</span><input type="number" step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="+16" /></label>
          <label className="field"><span>{t('사유', 'Reason')}</span><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t('예: 시작 잔액, 이월', 'e.g. Opening balance, carryover')} /></label>
          <button type="button" className="btn primary sm" disabled={!Number(hours) || !reason.trim() || saving} onClick={() => void save()}>{t('저장', 'Save')}</button>
          <small className="muted">{t(`${fullName(employee)}님 기록에 남고, 수정·삭제할 수 없어요. 잘못 넣었으면 반대 숫자로 다시 조정하세요.`, `Saved to ${fullName(employee)}’s history and can’t be edited — enter the opposite amount to undo.`)}</small>
          {error && <p className="de-error" role="alert">{error}</p>}
        </div>
      )}
      {recent.length === 0 ? (
        <p className="muted small">{t('아직 내역이 없어요. 시작 잔액이 있으면 "잔액 조정"으로 넣으세요.', 'No history yet. Add a starting balance with “Adjust”.')}</p>
      ) : (
        <table className="mini-table ledger-table">
          <thead><tr><th>{t('날짜', 'Date')}</th><th>{t('내용', 'What')}</th><th className="num">{t('시간', 'Hours')}</th><th className="num">{t('잔액', 'Balance')}</th></tr></thead>
          <tbody>
            {recent.map((x, i) => (
              <tr key={i}>
                <td>{formatDate(parseISODate(x.date), locale, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td>{kindText[x.kind]}{x.note ? <small className="muted"> · {x.note}</small> : null}{x.capped && <small className="warn-text"> · {t('최대 잔액', 'max reached')}</small>}</td>
                <td className={`num ${x.hours < 0 ? 'neg' : 'pos'}`}>{x.hours > 0 ? '+' : ''}{x.hours}</td>
                <td className="num"><strong>{x.balance}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
