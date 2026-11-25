import { ArrowDownUp, ChevronRight, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, UserCheck, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { periodsPerYear } from '../config/payrollConfig'
import FrequencyBadge from '../components/FrequencyBadge'
import { scheduleOf } from '../lib/paySchedules'
import { employmentStatus, tenureMonths } from '../lib/employment'
import { toISODate } from '../lib/schedule'
import { i9Badge, i9State, maskSsn } from '../lib/compliance'
import { formatCurrency, formatCurrencyWhole, formatDate, initials } from '../lib/format'
import { filingLabel, jobLabel } from '../lib/labels'
import { usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { Employee } from '../types'
import { compareByName, fullName, sortName } from '../lib/names'

type Filter = 'active' | 'attention' | 'tipped' | 'hourly' | 'inactive' | 'all'
type Sort = 'name' | 'role' | 'hire' | 'pay'

/** 이름으로 정해지는 아바타 색 (항목 구분용, 데이터 의미 없음) */
const avatarHue = (name: string) => [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)


export default function Employees() {
  const { t, locale } = usePrefs()
  const { session } = usePortal()
  const { employees, results, setTermination, company, schedules } = useStore()
  const multi = schedules.filter((x) => x.active).length > 1
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<Sort>('name')
  const [menu, setMenu] = useState<string | null>(null)
  const [today] = useState(() => new Date())
  const todayIso = toISODate(today)
  const [terminating, setTerminating] = useState<{ id: string; date: string } | null>(null)
  /** 재직 중(입사 예정·퇴사 예정 포함) */
  const current = (e: Employee) => employmentStatus(e, todayIso) !== 'former'
  const me = session?.name ?? company.ownerName

  const enriched = useMemo(
    () =>
      employees.map((e) => {
        const i9 = i9Badge(i9State(e, today), t)
        return { e, i9, attention: employmentStatus(e, todayIso) !== 'former' && (i9.tone !== 'good' || !e.w4) }
      }),
    [employees, today, todayIso, t],
  )

  const counts: Record<Filter, number> = {
    active: employees.filter(current).length,
    attention: enriched.filter((x) => x.attention).length,
    tipped: employees.filter((e) => current(e) && e.payType === 'tipped').length,
    hourly: employees.filter((e) => current(e) && e.payType === 'hourly').length,
    inactive: employees.filter((e) => !current(e)).length,
    all: employees.length,
  }
  const filterLabel: Record<Filter, string> = {
    active: t('재직', 'Active'),
    attention: t('서류 확인 필요', 'Needs paperwork'),
    tipped: t('팁 직원', 'Tipped'),
    hourly: t('시급 직원', 'Hourly'),
    inactive: t('퇴사', 'Former'),
    all: t('전체', 'All'),
  }

  const annual = (e: Employee) => (e.payType === 'salary' ? e.rate : e.rate * 2080)
  const list = enriched
    .filter(({ e, attention }) => {
      const q = query.trim().toLowerCase()
      if (q && !`${fullName(e)} ${sortName(e)} ${jobLabel(e, t)} ${e.id} ${e.email ?? ''}`.toLowerCase().includes(q)) return false
      if (filter === 'active') return current(e)
      if (filter === 'inactive') return !current(e)
      if (filter === 'attention') return attention
      if (filter === 'tipped') return current(e) && e.payType === 'tipped'
      if (filter === 'hourly') return current(e) && e.payType === 'hourly'
      return true
    })
    .sort((a, b) => {
      if (sort === 'role') return jobLabel(a.e, t).localeCompare(jobLabel(b.e, t)) || compareByName(a.e, b.e)
      if (sort === 'hire') return a.e.hireDate.localeCompare(b.e.hireDate)
      if (sort === 'pay') return annual(b.e) - annual(a.e)
      return compareByName(a.e, b.e)
    })

  return (
    <div className="page" onClick={() => menu && setMenu(null)}>
      <header className="page-head row between wrap">
        <div>
          <p className="eyebrow">{company.dba}</p>
          <h1>{t('직원', 'People')}</h1>
        </div>
        <Link className="btn primary" to="/employees/new">
          <Plus size={18} aria-hidden /> {t('직원 등록', 'Add employee')}
        </Link>
      </header>

      <section className="people-summary">
        <button className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>
          <strong>{counts.active}</strong><span>{t('재직 중', 'Active')}</span>
        </button>
        {company.tipsEnabled ? (
          <button className={filter === 'tipped' ? 'on' : ''} onClick={() => setFilter('tipped')}>
            <strong>{counts.tipped}</strong><span>{t('팁 직원', 'Tipped')}</span>
          </button>
        ) : (
          <button className={filter === 'hourly' ? 'on' : ''} onClick={() => setFilter('hourly')}>
            <strong>{counts.hourly}</strong><span>{t('시급 직원', 'Hourly')}</span>
          </button>
        )}
        <button className={`${filter === 'attention' ? 'on' : ''}${counts.attention ? ' warn' : ''}`} onClick={() => setFilter('attention')}>
          <strong>{counts.attention}</strong><span>{t('W-4·I-9 확인 필요', 'W-4 / I-9 to fix')}</span>
        </button>
        <button className={filter === 'inactive' ? 'on' : ''} onClick={() => setFilter('inactive')}>
          <strong>{counts.inactive}</strong><span>{t('퇴사', 'Former')}</span>
        </button>
      </section>

      <section className="card list-card">
        <div className="table-toolbar">
          <div className="search compact">
            <Search size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('이름, 직무, 이메일 검색', 'Search name, role, email')} />
          </div>
          <div className="toolbar-actions">
            <div className="segmented scroll-x">
              {(['active', 'attention', 'all'] as const).map((f) => (
                <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                  {filterLabel[f]} <span className="count">{counts[f]}</span>
                </button>
              ))}
            </div>
            <label className="sort-select">
              <ArrowDownUp size={14} aria-hidden />
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('정렬', 'Sort')}>
                <option value="name">{t('이름순', 'Name')}</option>
                <option value="role">{t('직무순', 'Role')}</option>
                <option value="hire">{t('입사일순', 'Hire date')}</option>
                <option value="pay">{t('급여 높은순', 'Highest pay')}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="plist-head" aria-hidden>
          <span>{t('직원', 'Employee')}</span>
          <span>{t('급여', 'Pay')}</span>
          <span>{t('서류', 'Paperwork')}</span>
          <span className="num">{t('이번 입금액', 'Next check')}</span>
          <span />
        </div>

        {list.length === 0 ? (
          <div className="empty">{t('조건에 맞는 직원이 없습니다.', 'No one matches.')}</div>
        ) : (
          <ul className="plist">
            {list.map(({ e, i9 }) => {
              const r = results.find((x) => x.employeeId === e.id)
              const hue = avatarHue(fullName(e))
              return (
                <li key={e.id} className={current(e) ? '' : 'inactive'}>
                  <button className="plist-row" onClick={() => navigate(`/employees/${e.id}`)}>
                    <span className="plist-person">
                      <span className="avatar" style={{ background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 45% 32%)` }}>{initials(fullName(e))}</span>
                      <span className="plist-name">
                        <strong>{fullName(e)}<EmploymentTag e={e} today={todayIso} />{multi && <> <FrequencyBadge frequency={e.payFrequency ?? 'biweekly'} name={scheduleOf(e, schedules)?.name || undefined} size="sm" /></>}</strong>
                        <small>
                          {jobLabel(e, t)} · {t('입사', 'Hired')} {formatDate(new Date(e.hireDate + 'T00:00'), locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                          {e.terminationDate && <> → {t('퇴사', 'Left')} {formatDate(new Date(e.terminationDate + 'T00:00'), locale, { year: 'numeric', month: 'short', day: 'numeric' })}</>}
                          {e.hireDate <= todayIso && <> ({tenureLabel(tenureMonths(e, todayIso), t)})</>} · SSN {maskSsn(e.ssnLast4)}
                        </small>
                      </span>
                    </span>
                    <span className="plist-pay">
                      <strong>
                        {e.payType === 'salary' ? formatCurrencyWhole(e.rate) : formatCurrency(e.rate)}
                        <small>{e.payType === 'salary' ? t('/년', '/yr') : '/h'}</small>
                      </strong>
                      <small>
                        {e.payType === 'salary'
                          ? t(`회당 ${formatCurrency(e.rate / periodsPerYear[e.payFrequency ?? 'biweekly'])}`, `${formatCurrency(e.rate / periodsPerYear[e.payFrequency ?? 'biweekly'])} per check`)
                          : e.payType === 'tipped' ? t('팁 직원 · 401(k) ', 'Tipped · 401(k) ') + `${Math.round(e.pretaxDeferralRate * 100)}%`
                          : t('시급 · 401(k) ', 'Hourly · 401(k) ') + `${Math.round(e.pretaxDeferralRate * 100)}%`}
                      </small>
                    </span>
                    <span className="plist-docs">
                      <span className={`pill-dot ${e.w4 ? 'good' : 'warn'}`}>{e.w4 ? `W-4 · ${filingLabel(e.w4.filingStatus, t)}` : t('W-4 미제출', 'No W-4')}</span>
                      <span className={`pill-dot ${i9.tone}`}>{i9.label}</span>
                    </span>
                    <span className="plist-net num">
                      {r ? <strong>{formatCurrency(r.netPay)}</strong> : <span className="muted">—</span>}
                      {r && <small>{t('총급여', 'gross')} {formatCurrency(r.grossPay)}</small>}
                    </span>
                    <ChevronRight size={18} className="plist-chev" aria-hidden />
                  </button>
                  <div className="plist-menu">
                    <button
                      className="icon-only"
                      aria-label={t('더보기', 'More')}
                      onClick={(ev) => { ev.stopPropagation(); setMenu(menu === e.id ? null : e.id) }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menu === e.id && (
                      <div className="menu-pop" onClick={(ev) => ev.stopPropagation()}>
                        <Link to={`/employees/${e.id}`}><Pencil size={15} aria-hidden /> {t('정보·서류 수정', 'Edit details & forms')}</Link>
                        <Link to={`/simulator?e=${e.id}`}><SlidersHorizontal size={15} aria-hidden /> {t('급여 시뮬레이션', 'Pay what-if')}</Link>
                        {e.terminationDate || !e.active ? (
                          <button onClick={() => { setTermination(e.id, null, me); setMenu(null) }}>
                            <UserCheck size={15} aria-hidden /> {t('복직 (퇴사 취소)', 'Rehire / undo termination')}
                          </button>
                        ) : terminating?.id === e.id ? (
                          <div className="terminate-box">
                            <label>{t('퇴사일 (마지막 근무일)', 'Last day worked')}<input type="date" value={terminating.date} min={e.hireDate} onChange={(ev) => setTerminating({ id: e.id, date: ev.target.value })} /></label>
                            <small className="muted">{t('이 날짜가 든 급여 기간까지 마지막 급여가 나가요.', 'Their final check is in the pay period that includes this date.')}</small>
                            <button className="btn sm primary" disabled={!terminating.date || terminating.date < e.hireDate} onClick={() => { setTermination(e.id, terminating.date, me); setTerminating(null); setMenu(null) }}>{t('퇴사 처리', 'Terminate')}</button>
                          </div>
                        ) : (
                          <button onClick={() => setTerminating({ id: e.id, date: todayIso })}>
                            <UserX size={15} aria-hidden /> {t('퇴사 처리…', 'Terminate…')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="table-hint muted small">
          {t(`${list.length}명 표시 · 행을 누르면 W-4·I-9를 포함한 직원 정보를 수정할 수 있어요. 변경 내용은 회계법인에 기록됩니다 (${me}).`, `${list.length} shown · Click a row to edit details including W-4 and I-9. Changes are logged for your CPA (${me}).`)}
        </p>
      </section>
    </div>
  )
}

/** 입사 예정 · 퇴사 예정 · 퇴사 표시 */
function EmploymentTag({ e, today }: { e: Employee; today: string }) {
  const { t, locale } = usePrefs()
  const md = (iso: string) => formatDate(new Date(`${iso}T00:00`), locale, { month: 'short', day: 'numeric' })
  const s = employmentStatus(e, today)
  if (s === 'upcoming') return <span className="tag info">{t(`${md(e.hireDate)} 입사 예정`, `Starts ${md(e.hireDate)}`)}</span>
  if (s === 'leaving') return <span className="tag warn">{t(`${md(e.terminationDate!)} 퇴사 예정`, `Leaving ${md(e.terminationDate!)}`)}</span>
  if (s === 'former') return <span className="tag neutral">{e.terminationDate ? t(`${md(e.terminationDate)} 퇴사`, `Left ${md(e.terminationDate)}`) : t('퇴사', 'Former')}</span>
  return null
}

const tenureLabel = (months: number, t: (ko: string, en: string) => string) =>
  months < 1 ? t('1개월 미만', '< 1 mo') : months < 12 ? t(`${months}개월`, `${months} mo`) : t(`${Math.floor(months / 12)}년 ${months % 12}개월`, `${Math.floor(months / 12)}y ${months % 12}m`)
