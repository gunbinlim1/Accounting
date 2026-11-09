import { Pencil, Plus, Search, SlidersHorizontal, UserCheck, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { i9Badge, i9State, maskSsn } from '../lib/compliance'
import { formatCurrency } from '../lib/format'
import { filingLabel, payLabel, roleLabel } from '../lib/labels'
import { usePrefs } from '../prefs'
import { useStore } from '../store'

type Filter = 'active' | 'all' | 'inactive' | 'attention'

export default function Employees() {
  const { t } = usePrefs()
  const { employees, results, toggleActive } = useStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [today] = useState(() => new Date())

  const enriched = useMemo(
    () =>
      employees.map((e) => {
        const i9 = i9Badge(i9State(e, today), t)
        const needsAttention = e.active && (i9.tone !== 'good' || !e.w4)
        return { e, i9, needsAttention }
      }),
    [employees, today, t],
  )

  const list = enriched.filter(({ e, needsAttention }) => {
    const q = query.trim().toLowerCase()
    const matches = !q || `${e.name} ${roleLabel(e.role, t)} ${e.id}`.toLowerCase().includes(q)
    const inFilter =
      filter === 'all' || (filter === 'active' ? e.active : filter === 'inactive' ? !e.active : needsAttention)
    return matches && inFilter
  })

  const counts: Record<Filter, number> = {
    active: employees.filter((e) => e.active).length,
    attention: enriched.filter((x) => x.needsAttention).length,
    all: employees.length,
    inactive: employees.filter((e) => !e.active).length,
  }
  const filterLabel: Record<Filter, string> = {
    active: t('재직', 'Active'),
    attention: t('서류 확인 필요', 'Needs paperwork'),
    all: t('전체', 'All'),
    inactive: t('퇴사', 'Former'),
  }

  return (
    <div className="page">
      <header className="page-head row between wrap">
        <div>
          <p className="eyebrow">{t(`재직 ${counts.active}명 · 텍사스`, `${counts.active} active · Texas`)}</p>
          <h1>{t('직원', 'People')}</h1>
        </div>
        <Link className="btn primary" to="/employees/new">
          <Plus size={18} aria-hidden /> {t('직원 등록', 'Add employee')}
        </Link>
      </header>

      <div className="toolbar">
        <div className="search">
          <Search size={16} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('이름, 직무로 검색', 'Search name or role')} />
        </div>
        <div className="segmented scroll-x">
          {(['active', 'attention', 'all', 'inactive'] as const).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {filterLabel[f]} {counts[f]}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card empty">{t('조건에 맞는 직원이 없습니다.', 'No one matches.')}</div>
      ) : (
        <div className="emp-grid">
          {list.map(({ e, i9 }) => {
            const r = results.find((x) => x.employeeId === e.id)
            return (
              <article key={e.id} className={`card emp ${e.active ? '' : 'inactive'}`}>
                <div className="person">
                  <span className="avatar lg">{e.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                  <div>
                    <strong>{e.name}</strong>
                    <span className="muted small">
                      {roleLabel(e.role, t)} · {e.id} · SSN {maskSsn(e.ssnLast4)}
                    </span>
                  </div>
                </div>
                <div className="badges">
                  <span className={`badge ${e.w4 ? 'good' : 'warn'}`}>
                    {e.w4 ? `W-4 · ${filingLabel(e.w4.filingStatus, t)}` : t('W-4 미제출', 'No W-4')}
                  </span>
                  <span className={`badge ${i9.tone}`}>{i9.label}</span>
                </div>
                <dl className="emp-facts">
                  <div>
                    <dt>{t('급여', 'Pay')}</dt>
                    <dd>{payLabel(e, t)}</dd>
                  </div>
                  <div>
                    <dt>401(k)</dt>
                    <dd>{Math.round(e.pretaxDeferralRate * 100)}%</dd>
                  </div>
                  <div>
                    <dt>{t('이번 입금액', 'Next check')}</dt>
                    <dd className="accent">{r ? formatCurrency(r.netPay) : '—'}</dd>
                  </div>
                </dl>
                <div className="emp-actions">
                  <Link className="btn ghost sm" to={`/employees/${e.id}`}>
                    <Pencil size={15} aria-hidden /> {t('정보·서류', 'Details & forms')}
                  </Link>
                  <Link className="btn ghost sm" to={`/simulator?e=${e.id}`}>
                    <SlidersHorizontal size={15} aria-hidden /> {t('시뮬레이션', 'What-if')}
                  </Link>
                  <button className="btn ghost sm" onClick={() => toggleActive(e.id)}>
                    {e.active ? <UserX size={15} aria-hidden /> : <UserCheck size={15} aria-hidden />}
                    {e.active ? t('퇴사 처리', 'Deactivate') : t('복직', 'Reactivate')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
