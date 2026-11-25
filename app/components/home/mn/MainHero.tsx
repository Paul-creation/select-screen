// 담당: Paul(메인 배너·디자인)
'use client';

import AiPickBar from '../ai/AiPickBar';
import MemberHeadline from './MemberHeadline';
import GameLink from '../../GameLink';
import type { HeroFeatured } from '../../../lib/homeMain';

// 메인 상단
// 방문자: 높이 640px 히어로 — 이번 주 대표 게임의 Steam 라이브러리 히어로 이미지 1장(와이드) 위에 좌우·위아래 그라데이션 마스크 → 제목 + 한 줄 설명 → 3칸 검색창. 오른쪽 가장자리에 세로 글씨 "게임 이름 (출시연도)"(누르면 그 게임 상세)
// 로그인(member): 이미지 없이 헤더 아래 멘트(MemberHeadline, 2시간마다) → 검색창. 헤더는 흐름 안에서 아래 1px 선
// 검색 결과는 /find로 간다 (이 화면에는 결과 모드가 없다)
// 상황 타일("이런 판 어때요?")·인원 탭·필터 칩·현황 숫자는 히어로 밖 섹션에 있다 (HomeSections)
export default function MainHero({ games, hero = null, heroLines = [], member = false }: { games: any[]; hero?: HeroFeatured | null; heroLines?: string[]; member?: boolean }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className={member ? 'mn-top' : 'mn-hero'}>
      {!member && hero && (
        <div className="home-only mn-hero-media" aria-hidden="true">
          <img src={hero.src} srcSet={`${hero.srcSmall} 1920w, ${hero.src} 3840w`} sizes="100vw" alt="" width={3840} height={1240} loading="eager" decoding="async" fetchPriority="high" />
        </div>
      )}
      {!member && hero && <div className="home-only mn-hero-scrim" aria-hidden="true" />}
      {!member && hero && (
        <div className="home-only mn-hero-credit">
          <GameLink href={`/games/${hero.id}`}>{hero.title}</GameLink>
        </div>
      )}
      <div className="mn-wrap mn-hero-inner">
        {!member && (
          <div className="home-only mn-intro" data-tour="hero">
            <h1 className="mn-h1">금요일 밤,<br className="mn-h1-br" /> 친구들이랑 뭐 하지?</h1>
            <p className="mn-hero-sub">몇 명이서, 어떻게 놀지만 고르면 같이 할 게임을 찾아줘요.</p>
          </div>
        )}
        {member && <div className="home-only mn-intro"><MemberHeadline lines={heroLines} /></div>}
        {/* 3칸 검색창 — 찾기를 누르면 /find로 간다. 검색창 끝의 [✦ 알아서 골라줘]는 질문(조건이 비었을 때) → 로딩 → 결과 3개를 검색창 바로 아래에 펼친다 (components/home/ai/AiPickBar, select-screen-mockups AiPick) */}
        <div className="ab-hero" data-tour="cmdbar">
          {member
            ? <div data-tour="welcome-member"><AiPickBar games={games} /></div>
            : <AiPickBar games={games} />}
        </div>
      </div>
    </div>
  );
}
