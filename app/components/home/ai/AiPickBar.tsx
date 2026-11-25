'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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

// 애니메이션 시간(ms) — aipick.css의 값과 맞춘다
const POP_MS = 550, OPEN_DELAY_MS = 120, COLLAPSE_MS = 360, LEAVE_MS = 180, MIN_LOADING_MS = 900;
const PHRASES = ['인원 맞는 게임 추리는 중', '분위기에 맞는지 보는 중', '가격이랑 평점 확인하는 중'];

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
  const [mounted, setMounted] = useState(false); // 패널이 DOM에 있는지(접히는 동안에도 true)
  const [open, setOpen] = useState(false); // 펼침 상태 — grid-template-rows 0fr ↔ 1fr
  const [leaving, setLeaving] = useState(false); // 나가는 화면 애니메이션 중
  const [popping, setPopping] = useState(false); // 버튼 ✦ 클릭 효과 중
  const openRef = useRef(false);
  const reduceRef = useRef(false);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const swapT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pc } = useMyPc();
  const index = useGameIndex(); // 검색 바가 받는 목록과 같은 캐시 — 내 PC OK 계산(spec_min)과 전체 수에 쓴다
  const total = (index.games ?? games)?.length ?? null;

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
    return t;
  }, []);

  // 움직임 줄이기 — 지연·전환 없이 바로 바꾼다(CSS 쪽 애니메이션도 꺼져 있다)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { reduceRef.current = mq.matches; };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // 패널을 펼친다 — 0fr로 한 번 그린 뒤 1fr로 바꿔야 전환이 걸린다
  const reveal = useCallback((p: Phase) => {
    if (closeT.current) { clearTimeout(closeT.current); closeT.current = null; }
    setPhase(p);
    setLeaving(false);
    setMounted(true);
    later(() => { openRef.current = true; setOpen(true); }, 40);
  }, [later]);

  // 화면 전환 — 열려 있으면 나가는 화면을 0.18초 보여준 뒤 바꾼다
  const show = useCallback((p: Phase, apply?: () => void) => {
    if (swapT.current) { clearTimeout(swapT.current); swapT.current = null; }
    if (!openRef.current) { apply?.(); reveal(p); return; }
    if (reduceRef.current) { apply?.(); setPhase(p); setLeaving(false); return; }
    setLeaving(true);
    swapT.current = later(() => { swapT.current = null; apply?.(); setPhase(p); setLeaving(false); }, LEAVE_MS);
  }, [later, reveal]);

  // 닫기 — 내용은 그대로 둔 채 먼저 접고, 접힌 뒤에 상태를 비운다
  const close = useCallback(() => {
    abortRef.current?.abort();
    if (swapT.current) { clearTimeout(swapT.current); swapT.current = null; }
    setLeaving(false);
    openRef.current = false;
    setOpen(false);
    if (closeT.current) clearTimeout(closeT.current);
    closeT.current = later(() => { closeT.current = null; setMounted(false); setPhase('closed'); setShown([]); }, reduceRef.current ? 0 : COLLAPSE_MS);
  }, [later]);
  useEffect(() => {
    const all = timers.current;
    return () => { abortRef.current?.abort(); all.forEach(clearTimeout); all.clear(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);
  useEffect(() => {
    if (!open || (phase !== 'result' && phase !== 'loading')) return;
    const t = later(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceRef.current ? 'auto' : 'smooth' }), 260);
    return () => clearTimeout(t);
  }, [phase, open, later]);

  const run = useCallback(async (c: Cond, exclude: string[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = Date.now();
    setCond(c);
    setVote(null);
    show('loading');
    // 응답이 빨라도 로딩은 최소 0.9초(나가는 화면 시간 뒤부터) 보여준다 — 깜빡이고 사라지면 어색하다
    const settle = async () => {
      const left = t0 + (reduceRef.current ? 0 : LEAVE_MS) + MIN_LOADING_MS - Date.now();
      if (left > 0) await new Promise<void>((r) => { later(r, left); });
    };
    const fail = async (msg: string) => { await settle(); if (ctrl.signal.aborted) return; show('error', () => setError(msg)); };
    try {
      const r = await fetch('/api/pick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', signal: ctrl.signal,
        body: JSON.stringify({ n: c.n, how: c.how, g: c.g, mood: c.mood, excludeIds: exclude }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { await fail(typeof j.error === 'string' ? j.error : '골라 오지 못했어요. 잠시 뒤에 다시 눌러주세요'); return; }
      if (!Array.isArray(j.picks) || j.picks.length === 0) { await fail('조건에 맞는 게임을 찾지 못했어요. 조건을 바꿔 볼까요?'); return; }
      await settle();
      if (ctrl.signal.aborted) return;
      show('result', () => { setResult(j as Result); setShown((s) => [...s, ...(j.picks as Card[]).map((p) => p.id)]); });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      await fail('골라 오지 못했어요. 잠시 뒤에 다시 눌러주세요');
    }
  }, [show, later]);

  // 검색 바의 버튼 — 조건이 있으면 질문 없이 바로, 없으면 질문부터
  const start = (q: AbQuery) => {
    if (popping) return;
    const c = fromQuery(q);
    const go = () => {
      setShown([]);
      if (hasPickConditions(c)) { void run(c, []); return; }
      show('ask', () => setAsk({ n: null, mood: null }));
    };
    if (reduceRef.current) { go(); return; }
    setPopping(true); // ✦ 회전 + 링 0.55초, 패널은 0.12초 뒤에 연다
    later(() => setPopping(false), POP_MS);
    later(go, OPEN_DELAY_MS);
  };

  const changeCond = (resetShown: boolean) => show('ask', () => { if (resetShown) setShown([]); setAsk({ n: cond.n, mood: cond.mood }); });
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
    <button type="button" className={`ap-btn${popping ? ' is-pop' : ''}`} title="인원이랑 취향 보고 AI가 딱 3개 골라줘요" aria-haspopup="dialog" aria-expanded={open} disabled={phase === 'loading'} onClick={() => start(q)}>
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
  const lv = leaving ? ' is-leaving' : '';
  const who = cond.n == null ? '친구들이' : cond.n === 1 ? '혼자서' : `${cond.n}명이`;

  return (
    <>
      <AbSearch games={games} trailing={btn} />
      {mounted && (
        <>
          <div className={`ap-backdrop${open && phase === 'ask' ? ' is-on' : ''}`} onClick={close} aria-hidden="true" />
          <div className={`ap-wrap${open ? ' is-open' : ''}`}><div className="ap-wrap-in">
          <div ref={panelRef} className={`ap-panel${phase === 'ask' ? ' ap-asking' : ''}`} role="region" aria-label="알아서 골라줘">
            {phase === 'ask' && (
              <div className={`ap-ask ap-screen${lv}`}>
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
              <div className={`ap-loading ap-screen${lv}`} role="status" aria-live="polite">
                <div className="ap-load-head">
                  <span className="ap-head"><span className="ap-spark ap-spin" aria-hidden="true">✦</span></span>
                  <span className="ap-loading-text">{who} {LOADING_MOOD[cond.mood ?? 'any']} 게임 고르는 중</span>
                  <span className="ap-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span className="ap-phrases" aria-hidden="true">{PHRASES.map((t) => <span key={t}>{t}</span>)}</span>
                  {total != null && <span className="ap-loading-count">{total.toLocaleString('ko-KR')}개 중에서</span>}
                </div>
                <div className="ap-sk-wrap" aria-hidden="true">
                  <ol className="ap-cards">
                    {[0, 1, 2].map((i) => (
                      <li key={i}>
                        <div className="ap-card ap-sk">
                          <span className="ap-img ap-sk-b" />
                          <span className="ap-sk-b ap-sk-name" />
                          <span className="ap-sk-lines"><span className="ap-sk-b" /><span className="ap-sk-b" /><span className="ap-sk-b" /></span>
                          <span className="ap-sk-chips"><span className="ap-sk-b" /><span className="ap-sk-b" /></span>
                          <span className="ap-bottom"><span className="ap-sk-b ap-sk-price" /><span className="ap-sk-b ap-sk-go" /></span>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <span className="ap-sel"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></span>
                </div>
              </div>
            )}

            {phase === 'error' && (
              <div className={`ap-error ap-screen${lv}`} role="alert">
                <p>{error}</p>
                <div className="ap-act-l">
                  <button type="button" className="ap-sec" onClick={() => changeCond(false)}>조건 바꾸기</button>
                  <button type="button" className="ap-close" aria-label="닫기" onClick={close}>✕</button>
                </div>
              </div>
            )}

            {phase === 'result' && result && (
              <div className={`ap-result ap-screen${lv}`} style={{ '--ap-last': result.picks.length - 1 } as CSSProperties}>
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
                      <li key={c.id} style={{ '--i': i } as CSSProperties}>
                        <GameLink href={`/games/${c.id}`} className="ap-card">
                          <span className="ap-brk" aria-hidden="true"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></span>
                          {i === 0 && <span className="ap-brk-intro" aria-hidden="true"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></span>}
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
                    <button type="button" className="ap-sec" onClick={() => changeCond(true)}>조건 바꾸기</button>
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
          </div></div>
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
