import {
  Building2, CirclePlay, History, Inbox, Landmark, Languages, LayoutDashboard, LogOut, Moon, Plug, Search, SlidersHorizontal, Sun, UserPlus, Users,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { firmName } from '../lib/supabase'
import { statusTone } from '../lib/runStatus'
import { currentPayDate, usePortal } from '../portal'
import { usePrefs } from '../prefs'
import { CompanyProvider, useStore } from '../store'
import CommandPalette, { type Command } from './CommandPalette'
import { fullName } from '../lib/names'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  mobile?: boolean
}

/** 공통 화면 틀: 사이드바, 모바일 상단·하단 바, 명령 팔레트 */
function Shell({ nav, identity, extraNav, commands, mobileTitle }: {
  nav: NavItem[]; identity: ReactNode; extraNav?: ReactNode; commands: Command[]; mobileTitle: string
}) {
  const { t, lang, toggleLang, theme, toggleTheme } = usePrefs()
  const { logout, saving, error, dismissError } = usePortal()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allCommands: Command[] = [
    ...commands,
    { id: 'lang', label: lang === 'ko' ? 'Switch to English' : '한국어로 전환', icon: <Languages size={18} />, keywords: 'language 언어', run: toggleLang },
    { id: 'theme', label: t('테마 전환', 'Toggle theme'), icon: theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />, keywords: 'dark light 다크', run: toggleTheme },
    { id: 'logout', label: t('로그아웃', 'Sign out'), icon: <LogOut size={18} />, run: () => void logout() },
  ]

  return (
    <div className="shell">
      {(saving || error) && (
        <div className={`save-status${error ? ' failed' : ''}`} role="status">
          {error
            ? <>{t('저장하지 못했어요 — 최신 데이터로 되돌렸습니다', 'Couldn’t save — reloaded the latest data')}: {error} <button className="link-btn" onClick={dismissError}>{t('닫기', 'Dismiss')}</button></>
            : t('저장 중…', 'Saving…')}
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>Payday</span>
          <span className="brand-tag">{t('고객 포털', 'Client portal')}</span>
        </div>
        {identity}
        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={16} aria-hidden />
          <span>{t('검색 또는 명령', 'Search or jump to')}</span>
          <kbd>⌘K</kbd>
        </button>
        <nav className="side-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.icon}
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        {extraNav}
        <div className="side-foot">
          <button className="icon-btn" onClick={toggleLang}>
            <Languages size={18} aria-hidden />
            <span>{lang === 'ko' ? 'English' : '한국어'}</span>
          </button>
          <button className="icon-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            <span>{theme === 'dark' ? t('라이트 모드', 'Light mode') : t('다크 모드', 'Dark mode')}</span>
          </button>
          <button className="icon-btn" onClick={logout}>
            <LogOut size={18} aria-hidden />
            <span>{t('로그아웃', 'Sign out')}</span>
          </button>
        </div>
      </aside>

      <header className="mobile-top">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span className="mobile-title">{mobileTitle}</span>
        </div>
        <div className="mobile-actions">
          <button className="round-btn" onClick={() => setPaletteOpen(true)} aria-label={t('검색', 'Search')}><Search size={18} /></button>
          <button className="round-btn" onClick={toggleLang} aria-label={t('언어 전환', 'Switch language')}><Languages size={18} /></button>
          <button className="round-btn" onClick={logout} aria-label={t('로그아웃', 'Sign out')}><LogOut size={18} /></button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${nav.filter((n) => n.mobile !== false).length}, 1fr)` }}>
        {nav.filter((n) => n.mobile !== false).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            {n.icon}
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={allCommands}
        placeholder={t('무엇을 할까요? 예: 직원 등록, 급여 실행', 'What do you need? e.g. add employee, run payroll')}
        emptyText={t('일치하는 항목이 없습니다', 'No matches')}
      />
    </div>
  )
}

/* ───────── 고객사 ───────── */

function ClientShell() {
  const { t } = usePrefs()
  const { session } = usePortal()
  const { company, employees, status } = useStore()
  const navigate = useNavigate()

  const nav: NavItem[] = [
    { to: '/', label: t('홈', 'Home'), icon: <LayoutDashboard size={20} />, end: true },
    { to: '/run', label: t('급여 실행', 'Run payroll'), icon: <CirclePlay size={20} /> },
    { to: '/employees', label: t('직원', 'People'), icon: <Users size={20} /> },
    { to: '/history', label: t('급여 내역', 'History'), icon: <History size={20} /> },
    { to: '/taxes', label: t('세금·신고', 'Taxes'), icon: <Landmark size={20} /> },
    { to: '/company', label: t('회사 정보', 'Company'), icon: <Building2 size={20} />, mobile: false },
    { to: '/simulator', label: t('시뮬레이터', 'What-if'), icon: <SlidersHorizontal size={20} />, mobile: false },
  ]

  const commands = useMemo<Command[]>(
    () => [
      ...nav.map((n) => ({ id: `go-${n.to}`, label: n.label, hint: t('이동', 'Go to'), icon: n.icon, run: () => navigate(n.to) })),
      { id: 'add', label: t('직원 등록 (W-4·I-9)', 'Add employee (W-4, I-9)'), icon: <UserPlus size={18} />, keywords: 'new hire', run: () => navigate('/employees/new') },
      ...employees.map((e) => ({ id: `emp-${e.id}`, label: fullName(e), hint: t('직원 정보', 'Profile'), icon: <Users size={18} />, keywords: `${e.role} ${e.id}`, run: () => navigate(`/employees/${e.id}`) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, t],
  )

  return (
    <Shell
      nav={nav}
      commands={commands}
      mobileTitle={company.dba}
      identity={
        <div className="identity">
          <span className="identity-logo">{company.dba.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
          <div>
            <strong>{company.dba}</strong>
            <small>{session?.name} · {t('대표', 'Owner')}</small>
          </div>
          <span className={`status-dot ${statusTone(status)}`} title={status} />
        </div>
      }
    />
  )
}

export function ClientLayout() {
  const { session } = usePortal()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'client') return <Navigate to={session.role === 'firm' ? '/firm' : '/me'} replace />
  return (
    <CompanyProvider companyId={session.companyId}>
      <ClientShell />
    </CompanyProvider>
  )
}

/* ───────── 회계법인 ───────── */

export function FirmLayout() {
  const { t } = usePrefs()
  const { session, companies } = usePortal()
  const navigate = useNavigate()
  const payDate = currentPayDate()
  if (!session) return <Navigate to="/login" replace />
  if (session.role !== 'firm') return <Navigate to={session.role === 'employee' ? '/me' : '/'} replace />

  const nav: NavItem[] = [
    { to: '/firm', label: t('제출 대기열', 'Payroll queue'), icon: <Inbox size={20} />, end: true },
    { to: '/firm/settings', label: t('지급·납부 연결', 'Payment rails'), icon: <Plug size={20} /> },
  ]
  const commands: Command[] = [
    ...nav.map((n) => ({ id: `go-${n.to}`, label: n.label, hint: t('이동', 'Go to'), icon: n.icon, run: () => navigate(n.to) })),
    ...companies.map((c) => ({ id: `co-${c.company.id}`, label: c.company.dba, hint: t('검토', 'Review'), icon: <Building2 size={18} />, run: () => navigate(`/firm/c/${c.company.id}`) })),
  ]

  return (
    <Shell
      nav={nav}
      commands={commands}
      mobileTitle={firmName}
      identity={
        <div className="identity firm">
          <span className="identity-logo">CPA</span>
          <div>
            <strong>{firmName}</strong>
            <small>{session.name}{session.role === 'firm' && session.title ? ` · ${session.title}` : ''}</small>
          </div>
        </div>
      }
      extraNav={
        <div className="side-section">
          <span className="side-label">{t('고객사', 'Clients')}</span>
          {companies.map((c) => {
            const status = c.current.payDate === payDate ? c.current.status : 'draft'
            return (
              <NavLink key={c.company.id} to={`/firm/c/${c.company.id}`} className="side-client">
                <span className={`status-dot ${statusTone(status)}`} />
                <span>{c.company.dba}</span>
              </NavLink>
            )
          })}
        </div>
      }
    />
  )
}
