/** 센트 단위로 반올림 (부동소수점 오차 방지) */
export const roundCents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
