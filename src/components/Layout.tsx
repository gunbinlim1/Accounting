import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: '대시보드', end: true },
  { to: '/employees', label: '직원 관리' },
  { to: '/payroll', label: '급여 계산' },
]

export default function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Payroll</span>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
