// 메인 인원 버튼이 가는 검색 주소 — 순수 함수라 테스트(peopleLink.test.mjs)가 .ts를 바로 불러온다 (다른 파일을 import하지 않는다)
// 결과는 통합 /find에서 본다 (app/lib/abSearch 주소 규칙): 2~4인은 n=N(한 명수), 5인 이상은 players=5-최대인원(playersMax = PLAYERS_MAX)

// "N인 게임 전체 보기" 주소 — /find에 인원과 내 PC 조건을 담는다
export const peopleHref = (n: number, myPc: boolean, playersMax: number) =>
  `/find?${n >= 5 ? `players=5-${playersMax}` : `n=${n}`}${myPc ? '&mypc=1' : ''}`;

// 인원 버튼을 눌렀을 때 이동할 주소. 인원별 추천 데이터가 있으면(recsReady) null — 이동 없이 아래 추천만 바뀐다
export const peopleButtonTarget = (recsReady: boolean, n: number, myPc: boolean, playersMax: number): string | null =>
  recsReady ? null : peopleHref(n, myPc, playersMax);

// 인원별 추천 "더 보기 →" — 같은 인원 /find에 "지금 뜨는 게임" 필터(신작·인기 급상승)를 더한 주소
export const trendingHref = (n: number, myPc: boolean, playersMax: number) => `${peopleHref(n, myPc, playersMax)}&trend=new,rising`;
