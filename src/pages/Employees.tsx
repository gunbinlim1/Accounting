import { payFrequencyLabel } from '../config/payrollConfig'
import { sampleEmployees } from '../data/sampleEmployees'
import { formatCurrency, formatPercent } from '../lib/format'

export default function Employees() {
  return (
    <section>
      <h1>직원 관리</h1>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>사번</th>
              <th>이름</th>
              <th>부서</th>
              <th>급여 형태</th>
              <th className="num">급여</th>
              <th>지급 주기</th>
              <th className="num">401(k)</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {sampleEmployees.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td>{e.name}</td>
                <td>{e.department}</td>
                <td>{e.payType === 'salary' ? '연봉' : '시급'}</td>
                <td className="num">
                  {formatCurrency(e.rate)}
                  {e.payType === 'hourly' ? '/h' : '/yr'}
                </td>
                <td>{payFrequencyLabel[e.payFrequency]}</td>
                <td className="num">{formatPercent(e.pretaxDeferralRate)}</td>
                <td>
                  <span className={e.active ? 'badge on' : 'badge off'}>
                    {e.active ? '재직' : '퇴사'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
