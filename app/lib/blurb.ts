// 결과 카드 게임 소개 한 줄 — 순수 함수라 blurb.test.mjs가 .ts를 바로 불러온다 (다른 파일을 import하지 않는다)
// 우선순위: ① 큐레이터 한 줄 소개(curator_posts.post_title, 가장 최근 것) ② Steam 짧은 설명 한국어(description_ko, 없으면 description이 한글일 때) ③ 없음(null → 줄을 그리지 않는다)
// 영어 설명은 쓰지 않는다. HTML 태그는 지우고 엔티티는 풀고 공백은 한 칸으로 정리한다
const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

export function cleanText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<\/?(br|p|li|div)\b[^>]*>/gi, ' ') // 줄바꿈 태그는 공백으로
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const hasHangul = (s: string) => /[가-힣]/.test(s);
export const BLURB_MAX = 160; // 목록(전체 게임)에 실리므로 길이를 막는다 — 화면에선 CSS가 한 줄·두 줄로 자른다

export function blurbOf(curatorTitle: string | null | undefined, descriptionKo: string | null | undefined, description: string | null | undefined): string | null {
  const cut = (t: string) => (t.length > BLURB_MAX ? `${t.slice(0, BLURB_MAX - 1).trimEnd()}…` : t);
  const quote = cleanText(curatorTitle);
  if (quote) return cut(quote);
  for (const raw of [descriptionKo, description]) {
    const t = cleanText(raw);
    if (t && hasHangul(t)) return cut(t);
  }
  return null;
}
