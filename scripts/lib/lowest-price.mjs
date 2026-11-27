// scripts/lib/lowest-price.mjs
// 우리 price_history만으로 역대 최저가를 정할 때의 기준 — 서로 다른 날(UTC 날짜 — checked_at에 저장된 날짜) 기록이 MIN_DAYS일 이상일 때만
// 하루치 기록의 최저가는 그냥 오늘 가격이라 화면에 "지금이 최저가"로 잘못 나온다
export const MIN_DAYS = 2;
const MIN_PRICE = 100; // 100원 미만은 달러로 잘못 들어온 기록 (app/lib/price와 같은 기준)

// 한국 시간으로 세면 매일 갱신(KST 03시쯤) 앞뒤의 몇 시간 간격 기록이 이틀로 잡혀서 UTC 날짜를 쓴다
const utcDay = (at) => new Date(at).toISOString().slice(0, 10);

// rows: [{ price, checked_at }] → 가장 싼 기록 | null(저장하지 않음)
export function lowestFromHistory(rows) {
  const valid = (rows || []).filter((r) => r.price >= MIN_PRICE && Number.isFinite(Date.parse(r.checked_at)));
  if (new Set(valid.map((r) => utcDay(r.checked_at))).size < MIN_DAYS) return null;
  return valid.reduce((a, b) => (b.price < a.price ? b : a));
}
