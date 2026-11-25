'use client';

import GameLink from '../GameLink';
import GameImage from '../GameImage';
import PosterImage from '../home/mn/PosterImage';
import { badgesFor, type AbCtx, type AbQuery } from '../../lib/abSearch';
import { getPriceInfo, PRICE_TYPE_LABEL } from '../../lib/price';
import { playersText } from '../../lib/players';
import { barrierLabel } from '../../lib/cardInfo';
import { gameName } from '../../lib/gameName';
import { isComingSoon, comingSoonLabel } from '../../lib/release';

// /find 결과 카드 — 행(포스터 88×132 · 이름 · 정보 줄 · ✓ 이유 · 오른쪽 Steam 가격 + "+ 비교")과 카드 보기(3열 가로 캡슐)
// 호버 브래킷은 평소엔 숨기고 호버·포커스 때만 카드 전체 네 모서리에 띄운다 (find.css .fd-brk) — 첫 카드 고정 없음
// 이름 링크가 카드 전체로 늘어난다(::after) — 버튼(+ 비교)은 그 위에 있어서 따로 눌린다
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 게임 칸은 목록(gameIndex)과 같은 느슨한 모양
type Game = any;

export type CardProps = { g: Game; i: number; q: AbQuery; ctx: AbCtx; picked: boolean; onCompare: (g: Game) => void };

function Brackets() {
  return <span className="fd-brk" aria-hidden="true"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></span>;
}

function metaOf(g: Game) {
  const barrier = barrierLabel(g);
  return [playersText(g).replace('-', '~'), barrier ? `진입장벽 ${barrier}` : '', g.review_percent ? `${g.review_summary ? `${g.review_summary} ` : ''}${g.review_percent}%` : ''].filter(Boolean).join(' · ');
}

function Why({ g, q, ctx, tour }: { g: Game; q: AbQuery; ctx: AbCtx; tour?: boolean }) {
  const badges = badgesFor(g, q, ctx);
  if (!badges.length) return null;
  return (
    <ul className="fd-why" aria-label="이 게임이 조건에 맞는 이유" data-tour={tour ? 'evidence' : undefined}>
      {badges.map((b) => (
        <li key={b.text} className={b.ok ? 'is-ok' : 'is-warn'}><span aria-hidden="true">{b.ok ? '✓' : '⚠'}</span> <span className="ab-sr">{b.ok ? '맞음: ' : '주의: '}</span>{b.text}</li>
      ))}
    </ul>
  );
}

// 가격 자리 — 출시 예정 · 무료 · 가격 유형 · 할인가
function Price({ g }: { g: Game }) {
  const price = getPriceInfo(g);
  return (
    <>
      {isComingSoon(g) ? <span className="fd-price-now">{comingSoonLabel(g)}</span>
        : g.is_free ? <span className="fd-price-now">무료</span>
        : PRICE_TYPE_LABEL[g.price_type] ? <span className="fd-price-now">{PRICE_TYPE_LABEL[g.price_type]}</span>
        : price ? (
          <>
            {price.discount > 0 && <span className="fd-price-sale"><span className="mn-sale">-{price.discount}%</span><s>{price.formattedOriginal}</s></span>}
            <span className="fd-price-now">{price.formattedFinal}</span>
          </>
        ) : null}
    </>
  );
}

function Compare({ g, picked, onCompare }: { g: Game; picked: boolean; onCompare: (g: Game) => void }) {
  return (
    <button type="button" className="fd-cmp" aria-pressed={picked} aria-label={`${gameName(g)} ${picked ? '비교에서 빼기' : '비교에 담기'}`} onClick={() => onCompare(g)}>
      {picked ? '✓ 비교 중' : '+ 비교'}
    </button>
  );
}

export function FindRow({ g, i, q, ctx, picked, onCompare }: CardProps) {
  const meta = metaOf(g);
  return (
    <li className="fd-hv fd-row">
      <Brackets />
      <span className="fd-poster" aria-hidden="true">
        <PosterImage cover={{ vertical: g.cover_vertical_url ?? null, appid: g.steam_appid ?? null, wide: g.card_image_url || g.cover_image_url || null }} eager={i < 4} />
      </span>
      <div className="fd-body">
        <GameLink href={`/games/${g.id}`} className="fd-name">{gameName(g)}</GameLink>
        {meta && <span className="fd-meta">{meta}</span>}
        <Why g={g} q={q} ctx={ctx} tour={i === 0} />
      </div>
      <div className="fd-side">
        <div className="fd-price">
          <span className="fd-price-label">Steam 가격</span>
          <Price g={g} />
        </div>
        <Compare g={g} picked={picked} onCompare={onCompare} />
      </div>
    </li>
  );
}

const steamHeader = (appid: number | null | undefined) => (appid ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg` : null);

export function FindCard({ g, i, q, ctx, picked, onCompare }: CardProps) {
  const meta = metaOf(g);
  const src = g.card_image_url || g.cover_image_url || steamHeader(g.steam_appid);
  return (
    <li className="fd-hv fd-card">
      <Brackets />
      <span className="fd-card-img" aria-hidden="true">
        {src && <GameImage src={src} alt="" loading={i < 6 ? 'eager' : 'lazy'} decoding="async" fallbackWidth={460} />}
      </span>
      <div className="fd-body">
        <GameLink href={`/games/${g.id}`} className="fd-name">{gameName(g)}</GameLink>
        {meta && <span className="fd-meta">{meta}</span>}
        <Why g={g} q={q} ctx={ctx} tour={i === 0} />
        <div className="fd-card-foot">
          <div className="fd-card-price">
            <span className="fd-price-label">Steam 가격</span>
            <Price g={g} />
          </div>
          <Compare g={g} picked={picked} onCompare={onCompare} />
        </div>
      </div>
    </li>
  );
}
