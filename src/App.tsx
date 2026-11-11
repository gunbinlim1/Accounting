import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ClientLayout, FirmLayout } from './components/Layout'
import CompanySettings from './pages/CompanySettings'
import CompanySetup from './pages/CompanySetup'
import Dashboard from './pages/Dashboard'
import EmployeeForm from './pages/EmployeeForm'
import EmployeePortal from './pages/EmployeePortal'
import Employees from './pages/Employees'
import FirmQueue from './pages/FirmQueue'
import FirmReview from './pages/FirmReview'
import FirmSettings from './pages/FirmSettings'
import History from './pages/History'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import PayrollRun from './pages/PayrollRun'
import Simulator from './pages/Simulator'
import Taxes from './pages/Taxes'
import { PortalProvider } from './portal'
import { PrefsProvider } from './prefs'

export default function App() {
  return (
    <PrefsProvider>
      <PortalProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<CompanySetup mode="client" />} />
            <Route path="me" element={<EmployeePortal />} />
            <Route element={<ClientLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="run" element={<PayrollRun />} />
              <Route path="payroll" element={<Navigate to="/run" replace />} />
              <Route path="employees" element={<Employees />} />
              <Route path="employees/new" element={<EmployeeForm />} />
              <Route path="employees/:id" element={<EmployeeForm key="edit" />} />
              <Route path="history" element={<History />} />
              <Route path="taxes" element={<Taxes />} />
              <Route path="company" element={<CompanySettings />} />
              <Route path="simulator" element={<Simulator />} />
            </Route>
            <Route path="firm" element={<FirmLayout />}>
              <Route index element={<FirmQueue />} />
              <Route path="settings" element={<FirmSettings />} />
              <Route path="new" element={<CompanySetup mode="firm" />} />
              <Route path="c/:companyId" element={<FirmReview />} />
              <Route path="c/:companyId/taxes" element={<FirmReview tab="taxes" />} />
              <Route path="c/:companyId/history" element={<FirmReview tab="history" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PortalProvider>
    </PrefsProvider>
  )
}
