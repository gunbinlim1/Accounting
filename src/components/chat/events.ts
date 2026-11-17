export const OPEN_CHAT_EVENT = 'payday:open-chat'

/** 다른 화면(예: 홈 급여 일정표)에서 고객 채팅 창 열기 */
export const openChat = () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))
