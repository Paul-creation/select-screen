// 상세 태그 칩이 누르면 이동할 목록 주소 — /find에 분류(tags) 필터를 담는다 (lib/abSearch가 tags를 읽음).
// 태그 나무 칸은 번호, 협동·대전은 이름(FLAG_TAGS), '혼자 플레이'는 1인 전용(solo). 특별 칩(TOP 10·올해의 게임)은 태그가 아니라 링크 없음
const PLAY_TAGS = new Set(['협동', '온라인 협동', '로컬 협동', '대전']);

export function chipHref(c: { text: string; kind: string; tagId?: number }): string | null {
  if (c.tagId != null) return `/find?tags=${c.tagId}`;
  if (c.kind === 'play') {
    if (PLAY_TAGS.has(c.text)) return `/find?tags=${encodeURIComponent(c.text)}`;
    if (c.text === '혼자 플레이') return '/find?solo=1';
  }
  return null;
}
