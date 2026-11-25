'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AbSearch from '../ab/AbSearch';
import GameLink from '../../GameLink';
import { EMPTY_QUERY, HOWS, GENRES, queryHref, type AbQuery } from '../../../lib/abSearch';
import { MOODS, MOOD_FIND, hasPickConditions, isMoodFree, type MoodKey, type PickGenre, type PickHow } from '../../../lib/aiPick/moods';
import { useGameIndex } from '../../../lib/useGameIndex';
import { useMyPc } from '../../pcspec/useMyPc';
import { judgePc } from '../../../lib/specJudge';
import { toUserPc, type MyPc } from '../../../lib/myPc';
import './aipick.css';

// 메인 검색 바 + "알아서 골라줘" (시안 AiPick.dc.html). 검색 바 끝에 [찾기][✦ 알아서 골라줘] — 조건이 비었으면 질문 패널, 있으면 바로 로딩
// 결과는 검색 바 바로 아래에 펼친다. 서버(/api/pick)가 DB에서 후보를 거르고 AI는 3개와 이유만 쓴다 — 여기서는 응답을 그리기만 한다
// 내 PC 사양은 서버로 보내지 않는다(개인정보처리방침) — 카드의 "내 PC OK"는 이 브라우저가 계산한다
type Cond = { n: number | null; how: PickHow | null; g: PickGenre[]; mood: MoodKey | null };
type Card = {
  id: string; name: string; steam_appid: string | number | null; cover_image_url: string | null; card_image_url: string | null;
  price_final: number | null; price_discount: number | null; price_original: number | null; is_free: boolean; price_type: string | null;
  reason: string; badges: string[];
};
type Result = { picks: Card[]; fallback: boolean; ownedExcluded: boolean; logId: string | null };
type Phase = 'closed' | 'ask' | 'loading' | 'result' | 'error';

const N_OPTS: { label: string; n: number }[] = [{ label: '혼자', n: 1 }, { label: '2명', n: 2 }, { label: '3명', n: 3 }, { label: '4명', n: 4 }, { label: '5명 이상', n: 5 }];
const MOOD_OPTS: MoodKey[] = ['laugh', 'scary', 'brain', 'compete', 'chill', 'any'];
const LOADING_MOOD: Record<MoodKey, string> = { laugh: '웃고 떠들', scary: '무서운', brain: '머리 쓰는', compete: '경쟁하는', chill: '느긋한', any: '같이 할' };
const TITLE_WHO: Record<number, string> = { 1: '혼자서', 2: '둘이서', 3: '셋이서', 4: '넷이서' };
const steam = (appid: string | number) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

const fromQuery = (q: AbQuery): Cond => ({ n: q.n ?? q.nTo ?? null, how: q.how, g: q.genres, mood: null });
const nText = (n: number | null) => (n == null ? '' : n === 1 ? '혼자' : n >= 5 ? `${n}명 이상` : `${n}명`);

function CardImage({ c }: { c: Card }) {
  const stored = c.cover_image_url || c.card_image_url || null;
  const [src, setSrc] = useState<string | null>(c.steam_appid ? steam(c.steam_appid) : stored);
  if (!src) return null;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setSrc((cur) => (cur !== stored ? stored : null))} />;
}

export default function AiPickBar({ games }: { games: any[] | null }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [phase, setPhase] = useState<Phase>('closed');
  const [cond, setCond] = useState<Cond>({ n: null, how: null, g: [], mood: null });
  const [ask, setAsk] = useState<{ n: number | null; mood: MoodKey | null }>({ n: null, mood: null });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { pc } = useMyPc();
  const index = useGameIndex(); // 검색 바가 받는 목록과 같은 캐시 — 내 PC OK 계산(spec_min)과 전체 수에 쓴다
  const total = (index.games ?? games)?.length ?? null;

  const close = useCallback(() => { abortRef.current?.abort(); setPhase('closed'); setShown([]); }, []);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, close]);
  useEffect(() => { if (phase === 'result' || phase === 'loading') panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [phase]);

  const run = useCallback(async (c: Cond, exclude: string[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCond(c);
    setPhase('loading');
    setVote(null);
    try {
      const r = await fetch('/api/pick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: ctrl.signal,
        body: JSON.stringify({ n: c.n, how: c.how, g: c.g, mood: c.mood, excludeIds: exclude }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(typeof j.error === 'string' ? j.error : '골라 오지 못했어요. 잠시 뒤에 다시 눌러주세요'); setPhase('error'); return; }
      if (!Array.isArray(j.picks) || j.picks.length === 0) { setError('조건에 맞는 게임을 찾지 못했어요. 조건을 바꿔 볼까요?'); setPhase('error'); return; }
      setResult(j as Result);
      setShown((s) => [...s, ...(j.picks as Card[]).map((p) => p.id)]);
      setPhase('result');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError('골라 오지 못했어요. 잠시 뒤에 다시 눌러주세요');
      setPhase('error');
    }
  }, []);

  // 검색 바의 버튼 — 조건이 있으면 질문 없이 바로, 없으면 질문부터
  const start = (q: AbQuery) => {
    const c = fromQuery(q);
    setShown([]);
    if (hasPickConditions(c)) { void run(c, []); return; }
    setAsk({ n: null, mood: null });
    setPhase('ask');
  };

  const submitAsk = () => { setShown([]); void run({ ...cond, n: ask.n, mood: ask.mood }, []); };
  const sendVote = (v: 'up' | 'down') => {
    if (vote || !result) return;
    setVote(v);
    if (result.logId) void fetch('/api/pick/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logId: result.logId, gameIds: result.picks.map((p) => p.id), vote: v }) }).catch(() => {});
  };

  // 내 PC OK — 이 브라우저의 PC 사양과 게임의 최소 사양(받아 둔 목록)으로만 계산
  const pcState = (id: string): 'ok' | 'fail' | null => {
    if (!pc) return null;
    const g = (index.games ?? games)?.find((x) => x.id === id);
    if (!g?.spec_min) return null;
    return verdictOf(pc, g.spec_min);
  };

  const btn = (q: AbQuery) => (
    <button type="button" className="ap-btn" title="인원이랑 취향 보고 AI가 딱 3개 골라줘요" aria-haspopup="dialog" aria-expanded={phase !== 'closed'} disabled={phase === 'loading'} onClick={() => start(q)}>
      <span className="ap-spark" aria-hidden="true">✦</span>알아서 골라줘
    </button>
  );

  const findHref = () => {
    const f = cond.mood ? MOOD_FIND[cond.mood] : {};
    const q: AbQuery = { ...EMPTY_QUERY, n: cond.n, how: cond.how ?? f.how ?? null, genres: [...new Set([...cond.g, ...(f.genres ?? [])])], opts: f.fs ? ['fs'] : [], sort: 'fit' };
    return queryHref(q);
  };

  const condChips = (): string[] => {
    const out: string[] = [];
    const who = nText(cond.n);
    if (who) out.push(who);
    if (cond.how) out.push(HOWS.find((h) => h.key === cond.how)?.label ?? '');
    for (const k of cond.g) out.push(GENRES.find((x) => x.key === k)?.label ?? '');
    if (!isMoodFree(cond.mood)) out.push(MOODS[cond.mood!].label);
    if (result?.ownedExcluded) out.push('이미 가진 게임 제외');
    return out.filter(Boolean);
  };

  const title = cond.n == null ? '오늘은 이거 어때요?' : `오늘 ${TITLE_WHO[cond.n] ?? (cond.n >= 5 ? '다 같이' : `${cond.n}명이서`)}는 이거 어때요?`;
  const who = cond.n == null ? '친구들이' : cond.n === 1 ? '혼자서' : `${cond.n}명이`;

  return (
    <>
      <AbSearch games={games} trailing={btn} />
      {phase !== 'closed' && (
        <>
          {phase === 'ask' && <div className="ap-backdrop" onClick={close} aria-hidden="true" />}
          <div ref={panelRef} className={`ap-panel${phase === 'ask' ? ' ap-asking' : ''}`} role="region" aria-label="알아서 골라줘">
            {phase === 'ask' && (
              <div className="ap-ask">
                <div className="ap-result-top">
                  <div className="ap-head"><span className="ap-spark" aria-hidden="true">✦</span>알아서 골라줘</div>
                  <button type="button" className="ap-close" aria-label="닫기" onClick={close}>✕</button>
                </div>
                <fieldset className="ap-q">
                  <legend>몇 명이서 해요?</legend>
                  <div className="ap-opts">
                    {N_OPTS.map((o) => <button key={o.n} type="button" className="ap-opt" aria-pressed={ask.n === o.n} onClick={() => setAsk({ ...ask, n: ask.n === o.n ? null : o.n })}>{o.label}</button>)}
                  </div>
                </fieldset>
                <fieldset className="ap-q">
                  <legend>오늘 분위기는?</legend>
                  <div className="ap-opts">
                    {MOOD_OPTS.map((m) => <button key={m} type="button" className="ap-opt" aria-pressed={ask.mood === m} onClick={() => setAsk({ ...ask, mood: ask.mood === m ? null : m })}>{MOODS[m].label}</button>)}
                  </div>
                </fieldset>
                <div className="ap-foot">
                  <span className="ap-hint">로그인하면 Steam 라이브러리랑 내 PC 사양도 같이 봐요</span>
                  <button type="button" className="ap-btn" onClick={submitAsk}><span className="ap-spark" aria-hidden="true">✦</span>3개 골라줘</button>
                </div>
              </div>
            )}

            {phase === 'loading' && (
              <div className="ap-loading" role="status" aria-live="polite">
                <span className="ap-head"><span className="ap-spark" aria-hidden="true">✦</span></span>
                <span className="ap-loading-text">{who} {LOADING_MOOD[cond.mood ?? 'any']} 게임 고르는 중…</span>
                {total != null && <span className="ap-loading-count">{total.toLocaleString('ko-KR')}개 중에서</span>}
              </div>
            )}

            {phase === 'error' && (
              <div className="ap-error" role="alert">
                <p>{error}</p>
                <div className="ap-act-l">
                  <button type="button" className="ap-sec" onClick={() => { setAsk({ n: cond.n, mood: cond.mood }); setPhase('ask'); }}>조건 바꾸기</button>
                  <button type="button" className="ap-close" aria-label="닫기" onClick={close}>✕</button>
                </div>
              </div>
            )}

            {phase === 'result' && result && (
              <div className="ap-result">
                <div className="ap-result-top">
                  <div>
                    <div className="ap-head"><span className="ap-spark" aria-hidden="true">✦</span>알아서 골라줘</div>
                    <h2 className="ap-title">{title}</h2>
                    {condChips().length > 0 && <ul className="ap-conds" aria-label="적용된 조건">{condChips().map((c) => <li key={c} className="ap-cond">{c}</li>)}</ul>}
                  </div>
                  <button type="button" className="ap-close" aria-label="닫기" onClick={close}>✕</button>
                </div>
                <ol className="ap-cards">
                  {result.picks.map((c, i) => {
                    const pcs = pcState(c.id);
                    return (
                      <li key={c.id}>
                        <GameLink href={`/games/${c.id}`} className="ap-card">
                          <span className="ap-brk" aria-hidden="true"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></span>
                          <span className="ap-img"><CardImage c={c} /><span className="ap-num">{i + 1}</span></span>
                          <span className="ap-name">{c.name}</span>
                          <span className="ap-reason">“{c.reason}”</span>
                          {(c.badges.length > 0 || pcs) && (
                            <span className="ap-checks">
                              {c.badges.slice(0, 4).map((b) => <span key={b} className="ap-check">✓ {b}</span>)}
                              {pcs === 'ok' && <span className="ap-check">✓ 내 PC OK</span>}
                              {pcs === 'fail' && <span className="ap-check is-warn">내 PC 최소 사양 미달</span>}
                            </span>
                          )}
                          <span className="ap-bottom">
                            <span className="ap-price">
                              {c.is_free ? <span className="ap-now">무료</span> : c.price_final != null && !c.price_type ? (
                                <>
                                  {c.price_discount ? <span className="ap-sale"><span className="ap-off">-{c.price_discount}%</span>{c.price_original != null && <span className="ap-was">{won(c.price_original)}</span>}</span> : null}
                                  <span className="ap-now">{won(c.price_final)}</span>
                                </>
                              ) : <span className="ap-was">가격은 상세에서 확인</span>}
                            </span>
                            <span className="ap-go">상세 보기 →</span>
                          </span>
                        </GameLink>
                      </li>
                    );
                  })}
                </ol>
                {result.picks.length < 3 && <p className="ap-note">조건에 맞는 게임이 {result.picks.length}개뿐이에요.</p>}
                <div className="ap-actions">
                  <div className="ap-act-l">
                    <button type="button" className="ap-btn ap-btn-sm" onClick={() => void run(cond, shown)}><span className="ap-spark" aria-hidden="true">✦</span>다시 골라줘</button>
                    <button type="button" className="ap-sec" onClick={() => { setShown([]); setAsk({ n: cond.n, mood: cond.mood }); setPhase('ask'); }}>조건 바꾸기</button>
                    <Link href={findHref()} className="ap-link">비슷한 게임 전체 보기 →</Link>
                  </div>
                  <div className="ap-vote">
                    {vote ? <span>의견 고마워요</span> : (
                      <>이 추천 어땠어요?
                        <button type="button" aria-pressed="false" onClick={() => sendVote('up')}>좋아요</button>
                        <button type="button" aria-pressed="false" onClick={() => sendVote('down')}>별로예요</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// 최소 사양 판정은 상세 페이지와 같은 함수 — 사양을 모르는 게임은 표시하지 않는다
function verdictOf(pc: MyPc, specMin: unknown): 'ok' | 'fail' | null {
  const v = judgePc(toUserPc(pc), { min: specMin as never });
  return v ? (v.level === 'fail' ? 'fail' : 'ok') : null;
}
