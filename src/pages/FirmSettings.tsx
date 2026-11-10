import { Building, FileCheck2, Landmark, Mail, Plug, Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { usePrefs } from '../prefs'

interface Rail {
  id: string
  icon: ReactNode
  ko: string
  en: string
  descKo: string
  descEn: string
  connected: boolean
}

/**
 * 회계법인 관리자: 지급·납부·신고 채널 연결 상태.
 * 데모에서는 연결 상태만 보여 주며, 실제 연동은 서버 단계에서 각 서비스 API·계약으로 붙입니다.
 */
export default function FirmSettings() {
  const { t } = usePrefs()
  const [rails, setRails] = useState<Rail[]>([
    { id: 'peo', icon: <Landmark size={20} />, ko: '급여·세금 대행 납부 채널 (등록한 PEO 서비스)', en: 'Payroll & tax remittance channel (your registered PEO service)', descKo: '고객 EIN 명의로 직원 직접입금(ACH)과 연방·주 세금 납부를 대행. 공동고용이 아닌 납부 대행 용도로만 사용', descEn: 'Direct deposit (ACH) and tax remittance under each client’s EIN — used as a payment rail, not co-employment', connected: true },
    { id: 'eftps', icon: <Send size={20} />, ko: 'IRS 대리 신고 (Reporting Agent · EFTPS)', en: 'IRS reporting agent (EFTPS)', descKo: 'Form 8655 위임을 받은 고객의 941·940 전자신고와 연방 예치', descEn: 'E-file 941/940 and make federal deposits for clients who signed Form 8655', connected: true },
    { id: 'twc', icon: <Building size={20} />, ko: '텍사스 TWC 대리인 계정', en: 'Texas TWC agent account', descKo: '고객 C-3 분기 보고와 실업세 납부', descEn: 'Client C-3 quarterly reports and unemployment tax', connected: true },
    { id: 'ssa', icon: <FileCheck2 size={20} />, ko: 'SSA Business Services Online (W-2 제출)', en: 'SSA Business Services Online (W-2 filing)', descKo: '연말 W-2·W-3 전자 제출', descEn: 'Year-end W-2/W-3 e-filing', connected: false },
    { id: 'mail', icon: <Mail size={20} />, ko: '급여명세서·알림 이메일 발송', en: 'Pay stub & notification email', descKo: '전자 수령에 동의한 직원에게 명세서, 고객에게 처리 완료·수표 준비·세금 안내', descEn: 'Stubs to e-consented employees; processed, check-ready and tax notices to clients', connected: false },
  ])

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{t('회계법인 관리자', 'Firm admin')}</p>
        <h1>{t('지급·납부 연결', 'Payment & filing rails')}</h1>
        <p className="lead">{t('급여 지급, 세금 납부, 신고에 쓰는 채널입니다. 모든 고객은 각자의 EIN으로 처리되고, 돈은 고객 계좌에서 인출됩니다.', 'Channels used to pay employees, remit taxes and file. Every client is processed under its own EIN, funded from its own account.')}</p>
      </header>
      <section className="card">
        <ul className="rails">
          {rails.map((r) => (
            <li key={r.id}>
              <span className="rail-icon">{r.icon}</span>
              <div>
                <strong>{t(r.ko, r.en)}</strong>
                <small className="muted">{t(r.descKo, r.descEn)}</small>
              </div>
              {r.connected ? (
                <span className="pill-dot good">{t('연결됨 (데모)', 'Connected (demo)')}</span>
              ) : (
                <button className="btn sm" onClick={() => setRails((list) => list.map((x) => (x.id === r.id ? { ...x, connected: true } : x)))}>
                  <Plug size={15} aria-hidden /> {t('연결하기', 'Connect')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className="muted small">{t('직접입금 파일은 지급일 2영업일 전에 전송해야 하므로, 고객 제출 마감은 지급일 2영업일 전 오후 3시로 설정되어 있어요.', 'Direct deposit files go out two business days before pay day, so client cutoff is 3 PM two business days before.')}</p>
    </div>
  )
}
