import type { PeopleN } from '../../lib/peopleRecs';
import { PLAYERS_MAX } from '../../lib/rangeFilter';
import { peopleHref as href, trendingHref as trend } from '../../lib/peopleLink';

export const peopleLabel = (n: number) => (n >= 5 ? '5인 이상' : `${n}인`);

// /find 주소에 인원과 내 PC 조건을 담은 "전체 보기" 주소 — 인원별 추천의 전체 보기 링크와, 추천 데이터가 없을 때의 인원 버튼 이동이 같이 쓴다
export const peopleHref = (n: PeopleN, myPc: boolean) => href(n, myPc, PLAYERS_MAX);
export const trendingHref = (n: PeopleN, myPc: boolean) => trend(n, myPc, PLAYERS_MAX);
