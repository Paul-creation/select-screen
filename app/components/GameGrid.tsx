'use client';

import { type ReactNode } from 'react';
import { useGameIndex } from '../lib/useGameIndex';
import MainHero from './home/mn/MainHero';
import PeopleProvider from './home/PeopleContext';
import type { HeroFeatured } from '../lib/homeMain';
import '../brand-tokens.css';
import './home/mn/mn.css';
import '../mono-page.css';
import '../mono-lists.css';

// 메인 화면 틀 — 홈 섹션은 서버에서 그려 받고(firstSection·sections), 검색창(AbSearch)만 여기서 상태로 다룬다
// 검색 결과·필터는 /find 한 곳에서만 본다 (components/find/FindPage). 전체 게임 목록은 검색창의 "N개 보기"·게임 이름 바로가기용으로 첫 화면 뒤에 따로 받는다 (useGameIndex)
export default function GameGrid({ firstSection, sections, peopleReady = true, hero = null, heroLines = [], member = false }: { firstSection: ReactNode; sections?: ReactNode; peopleReady?: boolean; hero?: HeroFeatured | null; heroLines?: string[]; member?: boolean }) {
  const index = useGameIndex();

  return (
    <PeopleProvider recsReady={peopleReady}>
      <div className={`mn mn-page${member ? ' mn-member' : ''}`}>
        {/* 첫 화면 래퍼(.mn-fold, 방문자 홈만): 히어로 + 인원별 추천을 화면 높이에 맞춘다 */}
        <div className={!member ? 'mn-fold' : undefined}>
          <MainHero games={index.games || []} hero={hero} heroLines={heroLines} member={member} />
          <div className="mn-fold-next"><div className="mn-wrap">{firstSection}</div></div>
        </div>

        {/* 나머지 섹션 */}
        {sections && <div className="home-only mn-rest"><div className="mn-wrap">{sections}</div></div>}
      </div>
    </PeopleProvider>
  );
}
