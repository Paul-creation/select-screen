'use client';

import { useMemo, useState, type ReactNode } from 'react';
import FindRange from './FindRange';
import FriendslopChip from '../FriendslopChip';
import MyPcLink from '../pcspec/MyPcLink';
import TagHelp from '../search/TagHelp';
import { useMyPc } from '../pcspec/useMyPc';
import {
  BARRIERS, GENRES, MODES, NETS, OPTS, PRICE_ALL, PRICE_MAX, SIZES, TRENDS, playersRange, rangeToPlayers, whoText,
  type AbQuery, type BarrierKey, type OptKey, type Range, type SizeKey,
} from '../../lib/abSearch';
import { PLAYERS_MAX, playersLabel, priceLabel } from '../../lib/rangeFilter';
import { EXCLUDE_TAG_IDS, countByNode, type TagTree } from '../../lib/tagTree';
import { ACTIVITY_BY_GROUP } from '../../lib/activitySearch';
import { ACTIVITIES, ACTIVITY_TAG_MAP, activityForTag, type ActivityKey } from '../../lib/activities';
import { countActivities } from '../../lib/activityFilter';
import { hasTag } from '../../lib/tagSearch';

// /find 왼쪽 "더 좁히기" — 자주 쓰는 칩 6개 + "필터 더 보기"(펼치면 아래 순서). 모든 값은 요약 바와 같은 조건(AbQuery, 주소 쿼리)이라 여기서 바꾸면 요약 바도 바뀐다
// 펼친 순서: 내 PC · 지금 뜨는 게임 · 같이 하는 방식 · 인원 · 가격 · 장르 · 진입장벽 · 언어·평가 · 방송 · (예전 필터) 가능한 활동 · 분류 · 빼고 보기
// 시안에 있는 "친구 패스"·"한 판 시간"은 DB에 값이 없어 그리지 않는다 (화면에는 데이터로 확인되는 사실만)
// 자주 쓰는 칩 순서 — 쉬운 게임은 진입장벽 낮음(barrier)과 같은 값이라 OPTS가 아니라 여기서 따로 붙인다
const FREQUENT: (OptKey | 'easy')[] = ['free', 'u10k', 'sale', 'easy', 'ko', 'fs'];
const MORE_LIMIT = 6; // 분류 큰 칸 안의 태그는 처음 이만큼만 보이고 나머지는 "더 보기"

const tog = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const BARRIER_DESC: Record<BarrierKey, string> = { 낮음: '설명 없이 바로 시작해서 같이 즐길 수 있어요', 보통: '조금 익히면 같이 즐길 수 있어요', 높음: '조작·규칙을 꽤 배워야 같이 즐길 수 있어요' };
const SIZE_DESC: Record<SizeKey, string> = { solo: '혼자서만 하는 1인용 게임만 보여줘요', duo: '최대 2명까지만 같이 하는 게임만 보여줘요', large: '최대 8명 이상이 같이 하는 게임만 보여줘요' };

function Chip({ on, onClick, children, title, disabled }: { on: boolean; onClick: () => void; children: ReactNode; title?: string; disabled?: boolean }) {
  return <button type="button" className="fd-chip" aria-pressed={on} title={title} disabled={disabled} onClick={onClick}>{children}</button>;
}

// 접을 수 있는 필터 묶음 — 제목 줄 전체가 토글. 고른 값이 있으면 오른쪽에 "N개 선택"(또는 값)
function Section({ title, meta, defaultOpen = true, children }: { title: string; meta?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (defaultOpen || !!meta);
  return (
    <div className="fd-sec">
      <button type="button" className="fd-sec-head" aria-expanded={open} onClick={() => setUserOpen(!open)}>
        <span className="fd-sec-title">{title}</span>
        {meta ? <span className="fd-sec-meta is-on">{meta}</span> : <span className="fd-sec-meta" aria-hidden="true">{open ? '▴' : '▾'}</span>}
      </button>
      {open && children}
    </div>
  );
}

export default function FindFilters({ q, go, games, tree, count, loaded, open, onToggle, onApply, hideOwned, setHideOwned, ownedAvailable, onClearAll }: {
  q: AbQuery;
  go: (next: AbQuery) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 게임 칸은 목록(gameIndex)과 같은 느슨한 모양
  games: any[] | null;
  tree: TagTree | null;
  count: number | null;
  loaded: boolean;
  open: boolean;
  onToggle: () => void;
  onApply: () => void;
  hideOwned: boolean;
  setHideOwned: (v: boolean) => void;
  ownedAvailable: boolean;
  onClearAll: () => void;
}) {
  const { pc, ready } = useMyPc();
  const set = (patch: Partial<AbQuery>) => go({ ...q, ...patch });
  const toggleOpt = (o: OptKey) => set({ opts: tog(q.opts, o) });
  const easyOn = q.barrier.length === 1 && q.barrier[0] === '낮음';
  const priceOn = q.price[0] !== PRICE_ALL[0] || q.price[1] !== PRICE_ALL[1];
  const who = whoText(q);
  const anyCondition = who || q.how || q.genres.length || q.kw || q.opts.length || q.trend.length || q.mypc || q.mode.length || q.net.length || q.size || q.story || priceOn || q.demo || q.low || q.barrier.length || q.rev || q.tv || q.act.length || q.tags.length || q.ex.length || hideOwned;

  // ----- 예전 필터용 집계: 활동마다 게임 수, 칸마다 게임 수 -----
  const alsoHas = (g: unknown, k: string) => {
    const t = ACTIVITY_TAG_MAP[k as ActivityKey];
    return !!t && hasTag(g as never, String(t.tagId), tree);
  };
  const actCounts = useMemo(
    () => countActivities(games || [], q.actu, ACTIVITIES.map((a) => a.key), alsoHas),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alsoHas는 tree만 읽는다
    [games, q.actu, tree],
  );
  const tagCounts = useMemo(() => (tree && games ? countByNode(tree, games) : new Map<number, number>()), [tree, games]);
  const roots = tree ? tree.roots.filter((id) => id !== tree.contentId && tagCounts.get(id)) : [];
  const excludable = tree ? EXCLUDE_TAG_IDS.filter((id) => tree.nodes.has(id) && tagCounts.get(id)) : [];
  const [openRoots, setOpenRoots] = useState<number[]>([]);
  const [moreRoots, setMoreRoots] = useState<number[]>([]);

  return (
    <aside className="fd-aside" aria-label="더 좁히기">
      <div className="fd-aside-head">
        <span className="fd-aside-title">더 좁히기</span>
        {anyCondition && <button type="button" className="fd-clear" onClick={onClearAll}>전체 지우기</button>}
      </div>

      {/* 자주 쓰는 칩 */}
      <div className="fd-chips" role="group" aria-label="자주 쓰는 조건">
        {FREQUENT.map((k) => {
          if (k === 'easy') return <Chip key={k} on={easyOn} onClick={() => set({ barrier: easyOn ? [] : ['낮음'] })}>쉬운 게임</Chip>;
          if (k === 'fs') return <FriendslopChip key={k} className="fd-chip" pressed={q.opts.includes('fs')} onToggle={() => toggleOpt('fs')} />;
          return <Chip key={k} on={q.opts.includes(k)} onClick={() => toggleOpt(k)}>{OPTS.find((o) => o.key === k)!.label}</Chip>;
        })}
      </div>

      <button type="button" className="fd-more-btn" aria-expanded={open} aria-controls="fd-more" onClick={onToggle}>
        {open ? '필터 접기' : '필터 더 보기'} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {!open && <p className="fd-hint">내 PC · 지금 뜨는 게임 · 같이 하는 방식 · 인원 · 가격 · 장르 · 진입장벽 · 언어·평가 · 방송</p>}

      {open && (
        <div id="fd-more" style={{ display: 'contents' }}>
          {/* 1. 내 PC */}
          <Section title="내 PC" meta={q.mypc || hideOwned ? `${(q.mypc ? 1 : 0) + (hideOwned ? 1 : 0)}개 선택` : undefined}>
            {ready && (pc ? (
              <p className="fd-note"><span>{pc.gpu.name} / {pc.cpu.name} / {pc.ram}GB</span><MyPcLink className="fd-link">변경</MyPcLink></p>
            ) : (
              <p className="fd-note"><span>사양 넣으면 못 돌리는 게임은 빼줘요</span><MyPcLink className="fd-link">사양 입력 →</MyPcLink></p>
            ))}
            {((ready && pc) || ownedAvailable) && (
              <div className="fd-chips">
                {pc && <Chip on={q.mypc} onClick={() => set({ mypc: !q.mypc })}>내 PC로 돌아가는 게임만</Chip>}
                {ownedAvailable && <Chip on={hideOwned} onClick={() => setHideOwned(!hideOwned)}>보유 게임 빼고 보기</Chip>}
              </div>
            )}
          </Section>

          {/* 2. 지금 뜨는 게임 */}
          <Section title="지금 뜨는 게임" meta={q.trend.length ? `${q.trend.length}개 선택` : undefined}>
            <div className="fd-chips">
              {TRENDS.map(([k, label]) => <Chip key={k} on={q.trend.includes(k)} onClick={() => set({ trend: tog(q.trend, k) })}>{label}</Chip>)}
            </div>
          </Section>

          {/* 3. 같이 하는 방식 */}
          <Section title="같이 하는 방식" meta={q.mode.length + q.net.length ? `${q.mode.length + q.net.length}개 선택` : undefined}>
            <div className="fd-chips">
              {MODES.map(([k, label]) => <Chip key={k} on={q.mode.includes(k)} onClick={() => set({ mode: tog(q.mode, k) })}>{label}</Chip>)}
              {NETS.map(([k, label]) => (
                <Chip key={k} on={q.net.includes(k)} title={k === 'p2p' ? 'P2P (방장 컴퓨터로 연결)' : k === 'dedicated' ? '전용 서버가 있는 온라인 게임' : undefined} onClick={() => set({ net: tog(q.net, k) })}>{label}</Chip>
              ))}
            </div>
          </Section>

          {/* 4. 인원 — 친구끼리 한 판에 같이 할 수 있는 인원(팀 인원, 없으면 최대 인원) 기준 */}
          <Section title="인원" meta={who || undefined}>
            <FindRange value={playersRange(q)} max={PLAYERS_MAX} minHigh={1} label={playersLabel} lowName="최소 인원" highName="최대 인원" onChange={(r: Range) => set(rangeToPlayers(r))} />
            <div className="fd-chips">
              {SIZES.map(([k, label]) => <Chip key={k} on={q.size === k} title={SIZE_DESC[k]} onClick={() => set({ size: q.size === k ? null : k })}>{label}</Chip>)}
              <Chip on={q.story} title="혼자서도 끝까지 즐길 수 있는 게임" onClick={() => set({ story: !q.story })}>혼자도 충분</Chip>
            </div>
          </Section>

          {/* 5. 가격 — 지금 실제 가격(할인가) 기준 */}
          <Section title="가격" meta={priceOn ? `${priceLabel(q.price[0])} ~ ${priceLabel(q.price[1])}` : undefined}>
            <FindRange value={q.price} max={PRICE_MAX} label={priceLabel} lowName="최저 가격" highName="최고 가격" onChange={(r: Range) => set({ price: r })} />
            <p className="fd-sub">할인 중이면 할인가 기준</p>
            <div className="fd-chips">
              <Chip on={q.opts.includes('free')} onClick={() => toggleOpt('free')}>무료만</Chip>
              <Chip on={q.demo} title="출시 전 게임 중 스팀 무료 데모가 있는 게임" onClick={() => set({ demo: !q.demo })}>데모 있음</Chip>
              <Chip on={q.opts.includes('sale')} onClick={() => toggleOpt('sale')}>지금 할인 중</Chip>
              <Chip on={q.low} title="지금 가격이 기록된 최저가 이하" onClick={() => set({ low: !q.low })}>역대 최저가</Chip>
            </div>
          </Section>

          {/* 6. 장르 10개 + 여러 개 고르면 하나라도/모두 */}
          <Section title="장르" meta={q.genres.length ? `${q.genres.length}개 선택` : undefined}>
            <div className="fd-chips">
              {GENRES.map((g) => <Chip key={g.key} on={q.genres.includes(g.key)} onClick={() => set({ genres: tog(q.genres, g.key) })}>{g.label}</Chip>)}
            </div>
            <div className="fd-gm" role="group" aria-label="장르를 여러 개 고르면">
              여러 개 고르면
              <span className="fd-seg">
                <button type="button" aria-pressed={q.gm === 'any'} onClick={() => set({ gm: 'any' })}>하나라도</button>
                <button type="button" aria-pressed={q.gm === 'all'} onClick={() => set({ gm: 'all' })}>모두</button>
              </span>
            </div>
          </Section>

          {/* 7. 한 판 시간 — DB에 값이 없어 아직 없음 */}

          {/* 8. 진입장벽 */}
          <Section title="진입장벽" meta={q.barrier.length ? `${q.barrier.length}개 선택` : undefined}>
            <div className="fd-chips">
              {BARRIERS.map(([k]) => <Chip key={k} on={q.barrier.includes(k)} title={BARRIER_DESC[k]} onClick={() => set({ barrier: tog(q.barrier, k) })}>{k}</Chip>)}
            </div>
          </Section>

          {/* 9. 언어·평가 */}
          <Section title="언어·평가" meta={(q.opts.includes('ko') ? 1 : 0) + (q.rev ? 1 : 0) ? `${(q.opts.includes('ko') ? 1 : 0) + (q.rev ? 1 : 0)}개 선택` : undefined}>
            <div className="fd-chips">
              <Chip on={q.opts.includes('ko')} onClick={() => toggleOpt('ko')}>한국어 지원</Chip>
              <Chip on={q.rev} title="Steam 평가가 매우 긍정적 · 압도적으로 긍정적" onClick={() => set({ rev: !q.rev })}>Steam 매우 긍정적 이상</Chip>
            </div>
          </Section>

          {/* 10. 방송 */}
          <Section title="방송" meta={q.tv ? '1개 선택' : undefined}>
            <div className="fd-chips">
              <Chip on={q.tv} title="등록된 스트리머 영상이 있는 게임" onClick={() => set({ tv: !q.tv })}>스트리머가 한 게임</Chip>
            </div>
          </Section>

          {/* 가능한 활동 — 묶음별 칩, 고른 활동을 모두 가진 게임. 칩 옆 숫자는 그 활동이 있는 게임 수 */}
          <Section title="가능한 활동" meta={q.act.length ? `${q.act.length}개 선택` : undefined} defaultOpen={false}>
            <div className="fd-chips">
              <Chip on={q.actu} onClick={() => set({ actu: !q.actu })}>확인 중 포함</Chip>
            </div>
            <p className="fd-sub">{q.actu ? 'AI가 있을 것으로 판단했지만 공식 설명에서 확인하지 못한 활동도 포함해요' : '설명에서 확인된 활동만 보여줘요'}</p>
            {ACTIVITY_BY_GROUP.map(({ group, items }) => (
              <div key={group} className="fd-group">
                <p className="fd-group-label">{group}</p>
                <div className="fd-chips">
                  {items.map((a) => {
                    const n = actCounts.get(a.key) ?? 0;
                    const on = q.act.includes(a.key);
                    return (
                      <button key={a.key} type="button" className={`fd-chip${n === 0 ? ' is-zero' : ''}`} aria-pressed={on} disabled={n === 0 && !on} onClick={() => set({ act: tog(q.act, a.key) })}>
                        {a.label}<span className="fd-chip-n">{n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Section>

          {/* 분류 — 큰 칸을 고르면 그 아래 태그 중 하나라도 있는 게임, 서로 다른 칸끼리는 모두 만족 */}
          <Section title="분류" meta={q.tags.length ? `${q.tags.length}개 선택` : undefined} defaultOpen={false}>
            {!tree ? (
              <p className="fd-sub">{loaded ? '태그 목록을 불러오지 못했어요' : '태그 목록 불러오는 중…'}</p>
            ) : roots.length === 0 ? (
              <p className="fd-sub">태그 정보를 준비하고 있어요</p>
            ) : (
              <div className="fd-acc">
                {roots.map((id) => {
                  const node = tree.nodes.get(id)!;
                  const isOpen = openRoots.includes(id);
                  const picked = q.tags.filter((t) => isUnder(tree, Number(t), id)).length;
                  const kids = shownKids(tree, node.children, tagCounts);
                  // 많은 칸은 처음 일부만 — 숨겨진 칸에 고른 게 있으면 처음부터 다 보임
                  const foldable = kids.length - MORE_LIMIT >= 2;
                  const hiddenPicked = foldable && kids.slice(MORE_LIMIT).some((c) => q.tags.some((t) => isUnder(tree, Number(t), c)));
                  const more = !foldable || hiddenPicked || moreRoots.includes(id);
                  return (
                    <div key={id} className="fd-acc-item">
                      <button type="button" className="fd-acc-head" aria-expanded={isOpen} onClick={() => setOpenRoots((p) => tog(p, id))}>
                        <span>{node.ko}</span>
                        {picked > 0 && <span className="fd-sec-meta is-on">{picked}개 선택</span>}
                        <span className="fd-sec-meta" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                      </button>
                      {isOpen && (
                        <ul className="fd-tree" role="group">
                          {(more ? kids : kids.slice(0, MORE_LIMIT)).map((c) => (
                            <TagRow key={c} id={c} tree={tree} counts={tagCounts} selected={q.tags} onToggle={(k) => set({ tags: tog(q.tags, k) })} />
                          ))}
                          {foldable && !hiddenPicked && (
                            <li><button type="button" className="fd-text-btn" onClick={() => setMoreRoots((p) => tog(p, id))}>{more ? '접기' : `더 보기 (${kids.length - MORE_LIMIT}개)`}</button></li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* 빼고 보기 — 이용 연령·표현 */}
          {excludable.length > 0 && (
            <Section title="빼고 보기" meta={q.ex.length ? `${q.ex.length}개 선택` : undefined} defaultOpen={false}>
              <ul className="fd-tree">
                {excludable.map((id) => {
                  const key = String(id);
                  return (
                    <li key={id}>
                      <div className="fd-tag-row">
                        <label className="fd-check">
                          <input type="checkbox" checked={q.ex.includes(key)} onChange={() => set({ ex: tog(q.ex, key) })} />
                          <span className="fd-check-name">{tree!.nodes.get(id)!.ko} 있는 게임 빼기</span>
                          <span className="fd-check-n">{tagCounts.get(id)}</span>
                          <TagHelp tag={tree!.nodes.get(id)!.ko} />
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {/* 펼친 필터 맨 아래 — 지금 결과 수 */}
          <button type="button" className="fd-apply" onClick={onApply}>{count == null ? '결과 보기' : `${count.toLocaleString('ko-KR')}개 보기`}</button>
        </div>
      )}
    </aside>
  );
}

// 분류 트리에 보일 칸들 — 게임이 있는 칸만. 활동과 같은 뜻의 태그(운전·낚시 등)는 "가능한 활동"에서만 고르므로 숨기고,
// 그 아래 칸이 있으면(예: 스포츠 아래 팀 구기 종목) 사라지지 않게 그 자리로 올려 보인다
function shownKids(tree: TagTree, ids: number[], counts: Map<number, number>): number[] {
  return ids.filter((c) => counts.get(c)).flatMap((c) => (activityForTag(String(c)) ? shownKids(tree, tree.nodes.get(c)?.children ?? [], counts) : [c]));
}

// id가 root 아래(또는 root 자신)인지
function isUnder(tree: TagTree, id: number, root: number) {
  for (let cur: number | null = id; cur != null; cur = tree.nodes.get(cur)?.parent ?? null) if (cur === root) return true;
  return false;
}

// 태그 한 줄 (체크 + 이름 + 게임 수 + 아래 칸 펼치기). 게임이 0개인 칸은 그리지 않음
function TagRow({ id, tree, counts, selected, onToggle }: {
  id: number; tree: TagTree; counts: Map<number, number>; selected: string[]; onToggle: (key: string) => void;
}) {
  const node = tree.nodes.get(id)!;
  const kids = shownKids(tree, node.children, counts);
  // 아래 칸 중 고른 게 있으면 처음부터 펼쳐 둔다
  const [open, setOpen] = useState(() => selected.some((t) => Number(t) !== id && isUnder(tree, Number(t), id)));
  const key = String(id);
  return (
    <li>
      <div className="fd-tag-row">
        <label className="fd-check">
          <input type="checkbox" checked={selected.includes(key)} onChange={() => onToggle(key)} />
          <span className="fd-check-name">{node.ko}</span>
          <span className="fd-check-n">{counts.get(id)}</span>
          {/* 라벨 안의 버튼은 눌러도 체크가 바뀌지 않음 (설명만 열림) */}
          <TagHelp tag={node.ko} />
        </label>
        {kids.length > 0 && (
          <button type="button" className="fd-text-btn" aria-expanded={open} aria-label={`${node.ko} 아래 태그 ${open ? '접기' : '펼치기'}`} onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : '펼치기'}
          </button>
        )}
      </div>
      {open && kids.length > 0 && (
        <ul className="fd-tree" role="group">
          {kids.map((c) => <TagRow key={c} id={c} tree={tree} counts={counts} selected={selected} onToggle={onToggle} />)}
        </ul>
      )}
    </li>
  );
}

