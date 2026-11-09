import {
  CirclePlay, Languages, LayoutDashboard, Moon, RotateCcw, Search, SlidersHorizontal, Sun, UserPlus, Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { usePrefs } from '../prefs'
import { useStore } from '../store'
import CommandPalette, { type Command } from './CommandPalette'

export default function Layout() {
  const { t, lang, toggleLang, theme, toggleTheme } = usePrefs()
  const { employees, resetDemo } = useStore()
  const navigate = useNavigate()
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

  const nav = [
    { to: '/', label: t('홈', 'Home'), icon: <LayoutDashboard size={20} />, end: true },
    { to: '/run', label: t('급여 실행', 'Run payroll'), icon: <CirclePlay size={20} /> },
    { to: '/employees', label: t('직원', 'People'), icon: <Users size={20} /> },
    { to: '/simulator', label: t('시뮬레이터', 'What-if'), icon: <SlidersHorizontal size={20} /> },
  ]

  const commands = useMemo<Command[]>(
    () => [
      ...nav.map((n) => ({ id: `go-${n.to}`, label: n.label, hint: t('이동', 'Go to'), icon: n.icon, run: () => navigate(n.to) })),
      { id: 'add', label: t('직원 추가', 'Add employee'), icon: <UserPlus size={18} />, keywords: 'new hire', run: () => navigate('/employees?new=1') },
      ...employees.map((e) => ({
        id: `emp-${e.id}`,
        label: e.name,
        hint: t('시뮬레이션', 'Simulate'),
        icon: <SlidersHorizontal size={18} />,
        keywords: `${e.department} ${e.id}`,
        run: () => navigate(`/simulator?e=${e.id}`),
      })),
      { id: 'lang', label: lang === 'ko' ? 'Switch to English' : '한국어로 전환', icon: <Languages size={18} />, keywords: 'language 언어', run: toggleLang },
      { id: 'theme', label: t('테마 전환', 'Toggle theme'), icon: theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />, keywords: 'dark light 다크', run: toggleTheme },
      { id: 'reset', label: t('데모 데이터 초기화', 'Reset demo data'), icon: <RotateCcw size={18} />, run: resetDemo },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, lang, theme],
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>Payday</span>
        </div>
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
        <div className="side-foot">
          <button className="icon-btn" onClick={toggleLang} title={t('언어 전환', 'Switch language')}>
            <Languages size={18} aria-hidden />
            <span>{lang === 'ko' ? 'English' : '한국어'}</span>
          </button>
          <button className="icon-btn" onClick={toggleTheme} title={t('테마 전환', 'Toggle theme')}>
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            <span>{theme === 'dark' ? t('라이트 모드', 'Light mode') : t('다크 모드', 'Dark mode')}</span>
          </button>
        </div>
      </aside>

      <header className="mobile-top">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>Payday</span>
        </div>
        <div className="mobile-actions">
          <button className="round-btn" onClick={() => setPaletteOpen(true)} aria-label={t('검색', 'Search')}>
            <Search size={18} />
          </button>
          <button className="round-btn" onClick={toggleLang} aria-label={t('언어 전환', 'Switch language')}>
            <Languages size={18} />
          </button>
          <button className="round-btn" onClick={toggleTheme} aria-label={t('테마 전환', 'Toggle theme')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            {n.icon}
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        placeholder={t('무엇을 할까요? 예: 직원 추가, Alex', 'What do you need? e.g. add employee, Alex')}
        emptyText={t('일치하는 항목이 없습니다', 'No matches')}
      />
    </div>
  )
}
