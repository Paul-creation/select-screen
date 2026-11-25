'use client';

import { useEffect, useRef, useState } from 'react';

// /find 결과 이미지 — 행 카드(세로 2:3 칸)와 카드 보기(가로 460:215 칸)가 같이 쓴다
// vertical: Steam 세로 포스터 library_600x900_2x.jpg를 먼저. 404 등으로 깨지면 가로 header.jpg를 같은 이미지로 흐린 배경(blur 16px + brightness .6)에 꽉 채우고 그 위에 원본을 contain으로 가운데에 (큐레이터 페이지 썸네일과 같은 방식, 자르지 않음)
// wide: header.jpg 그대로 (칸 비율이 같아 cover로 자르지 않는다). Steam이 아니거나 header가 깨지면 저장된 가로 이미지로
const steam = (appid: string | number, file: string) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/${file}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 게임 칸은 목록(gameIndex)과 같은 느슨한 모양
export default function FindPoster({ game, variant, eager = false }: { game: any; variant: 'vertical' | 'wide'; eager?: boolean }) {
  const appid = game.steam_appid ?? null;
  const stored: string | null = game.cover_image_url || game.card_image_url || null;
  const header = appid ? steam(appid, 'header.jpg') : stored;
  const vertical = variant === 'vertical' ? (game.cover_vertical_url === '' ? null : appid ? steam(appid, 'library_600x900_2x.jpg') : game.cover_vertical_url || null) : null;
  const [failed, setFailed] = useState(false); // 1차 이미지(세로 포스터 또는 header)가 깨짐
  const [headerFailed, setHeaderFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // hydration 전에 이미 실패한 이미지는 onError가 안 불리므로 한 번 더 확인
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [vertical]);
  const loading = eager ? 'eager' : 'lazy';

  if (variant === 'vertical' && vertical && !failed) {
    return <img ref={ref} className="fp-img" src={vertical} alt="" loading={loading} decoding="async" onError={() => setFailed(true)} />;
  }
  if (variant === 'vertical') {
    const src = headerFailed ? stored : header;
    if (!src) return null;
    return (
      <>
        <img className="fp-bg" src={src} alt="" loading={loading} decoding="async" onError={() => setHeaderFailed(true)} />
        <img className="fp-fg" src={src} alt="" loading={loading} decoding="async" />
      </>
    );
  }
  const src = failed ? stored : header;
  if (!src) return null;
  return <img className="fp-img" src={src} alt="" loading={loading} decoding="async" onError={() => setFailed(true)} />;
}
