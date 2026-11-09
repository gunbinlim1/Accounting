import { payrollConfig } from '../config/payrollConfig'
import { sampleEmployees } from '../data/sampleEmployees'
import { formatCurrency } from '../lib/format'

export default function Dashboard() {
  const active = sampleEmployees.filter((e) => e.active)
  const annualSalaries = active
    .filter((e) => e.payType === 'salary')
    .reduce((sum, e) => sum + e.rate, 0)

  return (
    <section>
      <h1>대시보드</h1>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">재직 직원</span>
          <span className="stat-value">{active.length}명</span>
        </div>
        <div className="stat">
          <span className="stat-label">연봉 합계 (정규직)</span>
          <span className="stat-value">{formatCurrency(annualSalaries)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">기준 과세연도</span>
          <span className="stat-value">{payrollConfig.taxYear}</span>
        </div>
      </div>
      <p className="notice">
        연방·주 원천징수는 임시 정률로 계산됩니다. 실제 급여 처리 전에{' '}
        <code>src/config/payrollConfig.ts</code>의 세율 로직을 교체하세요.
      </p>
    </section>
  )
}
