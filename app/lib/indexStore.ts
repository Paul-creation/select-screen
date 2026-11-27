// 전체 게임 목록을 받아 탭 안(메모리)에 두는 저장소 — useGameIndex가 쓴다. 화면·fetch에 기대지 않아 테스트에서 그대로 부른다
// - 목록 요청은 timeoutMs 안에 안 끝나면 끊고 실패로 본다. 실패는 기억하지 않아 다시 부르면 새로 요청한다
// - 한 번 받은 목록은 새로고침 전까지 다시 받지 않는다
// - 태그 나무는 못 받아도 목록은 돌려주고, 다음에 부를 때 나무만 다시 받는다
export const LOAD_TIMEOUT_MS = 8000;

export type Loaded<G, T> = { games: G[]; tree: T | null };

export function withTimeout<V>(run: (signal: AbortSignal) => Promise<V>, ms: number): Promise<V> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('timeout');
      reject(error);
      abort.abort(error);
    }, ms);
  });
  return Promise.race([run(abort.signal), late]).finally(() => clearTimeout(timer));
}

export function createIndexStore<G, T>({ fetchGames, loadTree, timeoutMs = LOAD_TIMEOUT_MS }: {
  fetchGames: (signal: AbortSignal) => Promise<G[]>;
  loadTree: () => Promise<T>;
  timeoutMs?: number;
}) {
  let kept: Loaded<G, T> | null = null;
  let inflight: Promise<Loaded<G, T>> | null = null;

  function load(): Promise<Loaded<G, T>> {
    if (kept?.tree) return Promise.resolve(kept);
    if (!inflight) {
      const games = kept ? Promise.resolve(kept.games) : withTimeout(fetchGames, timeoutMs);
      const tree = withTimeout(loadTree, timeoutMs).catch(() => null);
      inflight = Promise.all([games, tree])
        .then(([g, t]) => {
          if (!kept || t) kept = { games: g, tree: t };
          return kept;
        })
        .finally(() => { inflight = null; });
    }
    return inflight;
  }

  return { peek: () => kept, load };
}
