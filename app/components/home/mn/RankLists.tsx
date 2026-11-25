// 메인 3단 리스트 — 인기 차트 / 출시 예정 / 다시 뜨는 중. 각 5개: 순위 숫자(Inter 900) + 작은 세로 표지 + 이름 + 한 줄 정보
// "더 보기"는 /find의 같은 조건으로 간다 — 인기 차트는 필터 없는 /find(뜨는 순), 출시 예정은 trend=soon, 다시 뜨는 중은 trend=back
// 서버 컴포넌트. 줄이 하나도 없는 열은 숨긴다
import GameLink from '../../GameLink';
import PosterImage from './PosterImage';
import RankColumns from './RankColumns';
import SectionHead from '../../brand/SectionHead';
import type { HomeLists, ListRow } from '../../../lib/homeMain';

const COLUMNS: { key: keyof HomeLists; title: string; href?: string }[] = [
  { key: 'popular', title: '인기 차트', href: '/find' },
  { key: 'upcoming', title: '출시 예정', href: '/find?trend=soon' },
  { key: 'rising', title: '다시 뜨는 중', href: '/find?trend=back' },
];

function Row({ row, rank }: { row: ListRow; rank: number }) {
  return (
    <li>
      <GameLink href={`/games/${row.id}`} className="mn-rank-row">
        <span className="mn-rank-n">{rank}</span>
        <span className="mn-mini sb-host"><PosterImage cover={row.cover} brackets /></span>
        <span className="mn-rank-text">
          <span className="mn-rank-name">{row.name}</span>
          {row.sub.length > 0 && <span className="mn-rank-sub">{row.sub.join(' · ')}</span>}
        </span>
      </GameLink>
    </li>
  );
}

export default function RankLists({ lists }: { lists: HomeLists }) {
  const cols = COLUMNS.filter((c) => lists[c.key].length > 0);
  if (!cols.length) return null;
  return (
    <RankColumns
      titles={cols.map((c) => c.title)}
      panels={cols.map((c) => (
        <section key={c.key} className="mn-col" aria-labelledby={`mn-col-${c.key}`}>
          <SectionHead id={`mn-col-${c.key}`} label={c.title} more={c.href ? { href: c.href, text: '전체', hard: true } : undefined} />
          <ol className="mn-rank-list">
            {lists[c.key].map((row, i) => <Row key={row.id} row={row} rank={i + 1} />)}
          </ol>
          {/* 휴대폰: 머리 줄 대신 목록 아래 "○○ 전체 →" (데스크톱은 CSS로 숨김) */}
          {c.href && <a href={c.href} className="mn-rank-all">{c.title} 전체 →</a>}
        </section>
      ))}
    />
  );
}
