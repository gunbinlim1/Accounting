import { useMemo, useState } from 'react'
import { sampleEmployees } from '../data/sampleEmployees'
import { formatCurrency } from '../lib/format'
import { calculatePayroll } from '../lib/payroll'

type Hours = Record<string, { regular: number; overtime: number }>

export default function PayrollRun() {
  const employees = sampleEmployees.filter((e) => e.active)
  const [hours, setHours] = useState<Hours>(() =>
    Object.fromEntries(
      employees.filter((e) => e.payType === 'hourly').map((e) => [e.id, { regular: 80, overtime: 0 }]),
    ),
  )

  const results = useMemo(
    () =>
      employees.map((employee) =>
        calculatePayroll({
          employee,
          regularHours: hours[employee.id]?.regular,
          overtimeHours: hours[employee.id]?.overtime,
        }),
      ),
    [employees, hours],
  )

  const totals = results.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossPay,
      deductions: acc.deductions + r.totalDeductions,
      net: acc.net + r.netPay,
    }),
    { gross: 0, deductions: 0, net: 0 },
  )

  const updateHours = (id: string, field: 'regular' | 'overtime', value: string) => {
    const parsed = Math.max(0, Number(value) || 0)
    setHours((prev) => ({ ...prev, [id]: { ...prev[id], [field]: parsed } }))
  }

  return (
    <section>
      <h1>급여 계산</h1>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th className="num">정규 시간</th>
              <th className="num">초과 시간</th>
              <th className="num">총급여</th>
              <th className="num">401(k)</th>
              <th className="num">연방세</th>
              <th className="num">주세</th>
              <th className="num">SS</th>
              <th className="num">Medicare</th>
              <th className="num">실수령액</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => {
              const r = results[i]
              const h = hours[e.id]
              return (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className="num">
                    {h ? (
                      <input
                        type="number"
                        min={0}
                        value={h.regular}
                        aria-label={`${e.name} 정규 시간`}
                        onChange={(ev) => updateHours(e.id, 'regular', ev.target.value)}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">
                    {h ? (
                      <input
                        type="number"
                        min={0}
                        value={h.overtime}
                        aria-label={`${e.name} 초과 시간`}
                        onChange={(ev) => updateHours(e.id, 'overtime', ev.target.value)}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{formatCurrency(r.grossPay)}</td>
                  <td className="num">{formatCurrency(r.pretaxDeductions)}</td>
                  <td className="num">{formatCurrency(r.federalWithholding)}</td>
                  <td className="num">{formatCurrency(r.stateWithholding)}</td>
                  <td className="num">{formatCurrency(r.socialSecurity)}</td>
                  <td className="num">{formatCurrency(r.medicare)}</td>
                  <td className="num strong">{formatCurrency(r.netPay)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>합계</td>
              <td className="num">{formatCurrency(totals.gross)}</td>
              <td colSpan={5} className="num">
                공제 {formatCurrency(totals.deductions)}
              </td>
              <td className="num strong">{formatCurrency(totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
