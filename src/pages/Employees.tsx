import { Pencil, Plus, Search, SlidersHorizontal, UserCheck, UserX, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatCurrency, formatPercent, initials } from '../lib/format'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import type { Employee, PayType } from '../types'

type Filter = 'active' | 'all' | 'inactive'

interface Draft {
  id?: string
  name: string
  department: string
  payType: PayType
  rate: string
  pretax: string
}

const emptyDraft: Draft = { name: '', department: '', payType: 'salary', rate: '', pretax: '0' }

function EmployeeDrawer({ initial, onClose, onSave }: { initial: Draft; onClose: () => void; onSave: (d: Draft) => void }) {
  const { t } = usePrefs()
  const [d, setD] = useState<Draft>(initial)
  const [touched, setTouched] = useState(false)

  const errors = {
    name: d.name.trim() ? '' : t('이름을 입력하세요', 'Enter a name'),
    rate: Number(d.rate) > 0 ? '' : t('0보다 큰 금액을 입력하세요', 'Enter an amount above 0'),
    pretax:
      Number(d.pretax) >= 0 && Number(d.pretax) <= 100 ? '' : t('0~100 사이로 입력하세요', 'Enter 0–100'),
  }
  const valid = !errors.name && !errors.rate && !errors.pretax

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (valid) onSave(d)
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="drawer" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} noValidate>
        <div className="drawer-head">
          <h2>{d.id ? t('직원 정보 수정', 'Edit employee') : t('새 직원 추가', 'Add employee')}</h2>
          <button type="button" className="round-btn" onClick={onClose} aria-label={t('닫기', 'Close')}>
            <X size={18} />
          </button>
        </div>

        <label className="field">
          <span>{t('이름', 'Name')}</span>
          <input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Jamie Yoon" />
          {touched && errors.name && <em>{errors.name}</em>}
        </label>

        <label className="field">
          <span>{t('부서', 'Department')}</span>
          <input value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} placeholder="Tax" />
        </label>

        <div className="field">
          <span>{t('급여 형태', 'Pay type')}</span>
          <div className="segmented">
            {(['salary', 'hourly'] as const).map((p) => (
              <button type="button" key={p} className={d.payType === p ? 'on' : ''} onClick={() => setD({ ...d, payType: p })}>
                {p === 'salary' ? t('연봉', 'Salary') : t('시급', 'Hourly')}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{d.payType === 'salary' ? t('연봉 (USD)', 'Annual salary (USD)') : t('시급 (USD)', 'Hourly rate (USD)')}</span>
          <div className="input-affix">
            <span>$</span>
            <input inputMode="decimal" value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })} placeholder={d.payType === 'salary' ? '70000' : '25'} />
          </div>
          {touched && errors.rate && <em>{errors.rate}</em>}
        </label>

        <label className="field">
          <span>{t('401(k) 세전 저축률', '401(k) pre-tax rate')}</span>
          <div className="input-affix">
            <input inputMode="decimal" value={d.pretax} onChange={(e) => setD({ ...d, pretax: e.target.value })} />
            <span>%</span>
          </div>
          {touched && errors.pretax && <em>{errors.pretax}</em>}
        </label>

        <div className="drawer-foot">
          <button type="button" className="btn" onClick={onClose}>
            {t('취소', 'Cancel')}
          </button>
          <button type="submit" className="btn primary">
            {t('저장', 'Save')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Employees() {
  const { t } = usePrefs()
  const { employees, results, upsertEmployee, toggleActive } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [draft, setDraft] = useState<Draft | null>(null)

  const openDraft = draft ?? (params.get('new') === '1' ? emptyDraft : null)
  const closeDraft = () => {
    setDraft(null)
    if (params.has('new')) setParams({}, { replace: true })
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter(
      (e) =>
        (filter === 'all' || (filter === 'active' ? e.active : !e.active)) &&
        (!q || `${e.name} ${e.department} ${e.id}`.toLowerCase().includes(q)),
    )
  }, [employees, query, filter])

  const save = (d: Draft) => {
    const nextId = `EMP-${String(employees.length + 1).padStart(3, '0')}`
    const existing = employees.find((e) => e.id === d.id)
    const e: Employee = {
      id: d.id ?? (employees.some((x) => x.id === nextId) ? `EMP-${Date.now()}` : nextId),
      name: d.name.trim(),
      department: d.department.trim() || '—',
      payType: d.payType,
      rate: Number(d.rate),
      pretaxDeferralRate: Number(d.pretax) / 100,
      active: existing?.active ?? true,
    }
    upsertEmployee(e)
    closeDraft()
  }

  const counts = {
    active: employees.filter((e) => e.active).length,
    all: employees.length,
    inactive: employees.filter((e) => !e.active).length,
  }

  return (
    <div className="page">
      <header className="page-head row between wrap">
        <div>
          <p className="eyebrow">{t(`재직 ${counts.active}명`, `${counts.active} active`)}</p>
          <h1>{t('직원', 'People')}</h1>
        </div>
        <button className="btn primary" onClick={() => setDraft(emptyDraft)}>
          <Plus size={18} aria-hidden /> {t('직원 추가', 'Add employee')}
        </button>
      </header>

      <div className="toolbar">
        <div className="search">
          <Search size={16} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('이름, 부서로 검색', 'Search name or department')} />
        </div>
        <div className="segmented">
          {(['active', 'all', 'inactive'] as const).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {{ active: t('재직', 'Active'), all: t('전체', 'All'), inactive: t('퇴사', 'Former') }[f]} {counts[f]}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card empty">{t('조건에 맞는 직원이 없습니다.', 'No one matches.')}</div>
      ) : (
        <div className="emp-grid">
          {list.map((e) => {
            const r = results.find((x) => x.employeeId === e.id)
            return (
              <article key={e.id} className={`card emp ${e.active ? '' : 'inactive'}`}>
                <div className="person">
                  <span className="avatar lg">{initials(e.name)}</span>
                  <div>
                    <strong>{e.name}</strong>
                    <span className="muted small">
                      {e.department} · {e.id}
                    </span>
                  </div>
                </div>
                <dl className="emp-facts">
                  <div>
                    <dt>{e.payType === 'salary' ? t('연봉', 'Salary') : t('시급', 'Hourly')}</dt>
                    <dd>
                      {formatCurrency(e.rate)}
                      {e.payType === 'hourly' && <span className="muted">/{t('시간', 'hr')}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>401(k)</dt>
                    <dd>{formatPercent(e.pretaxDeferralRate, 0)}</dd>
                  </div>
                  <div>
                    <dt>{t('이번 실수령', 'Next take-home')}</dt>
                    <dd className="accent">{r ? formatCurrency(r.netPay) : '—'}</dd>
                  </div>
                </dl>
                <div className="emp-actions">
                  <button
                    className="btn ghost sm"
                    onClick={() =>
                      setDraft({
                        id: e.id,
                        name: e.name,
                        department: e.department,
                        payType: e.payType,
                        rate: String(e.rate),
                        pretax: String(Math.round(e.pretaxDeferralRate * 1000) / 10),
                      })
                    }
                  >
                    <Pencil size={15} aria-hidden /> {t('수정', 'Edit')}
                  </button>
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

      {openDraft && <EmployeeDrawer initial={openDraft} onClose={closeDraft} onSave={save} />}
    </div>
  )
}
