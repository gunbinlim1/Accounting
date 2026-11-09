import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import NotFound from './pages/NotFound'
import PayrollRun from './pages/PayrollRun'
import Simulator from './pages/Simulator'
import { PrefsProvider } from './prefs'
import { StoreProvider } from './store'

export default function App() {
  return (
    <PrefsProvider>
      <StoreProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="run" element={<PayrollRun />} />
              <Route path="payroll" element={<Navigate to="/run" replace />} />
              <Route path="employees" element={<Employees />} />
              <Route path="simulator" element={<Simulator />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </PrefsProvider>
  )
}
