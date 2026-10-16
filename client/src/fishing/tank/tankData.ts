/**
 * 수족관에 들어갈 것 — 물고기 줄(shared/fishingAquarium 의 크기 · 빠르기 · 깊이)과 내 수족관 응답(GET /fishing/tank).
 * 자리를 바꾸면 화면이 먼저 바뀌고(서버와 같은 규칙 — resolveLayout) 서버 답으로 맞춘다.
 */
import { useQuery } from "@tanstack/react-query";
import { aquariumFish } from "@shared/fishingAquarium";
import { fishByName } from "@shared/fishingFish";
import { DECOR_SLOTS, resolveLayout, type DecorLayout, type DecorSlot, type TankFishRow, type TankView } from "@shared/fishingDecor";
import type { TankFishIn } from "./engine";

export const TANK_KEY = ["/api/hiq/fishing/tank"] as const;
/** 잡은 것이 없을 때의 예시 셋(흐리게 · '예시') */
export const SAMPLE_FISH: readonly TankFishRow[] = [{ species: "감성돔", count: 3 }, { species: "붕어", count: 2 }, { species: "고등어", count: 2 }];

export function tankRows(list: readonly TankFishRow[]): TankFishIn[] {
    return aquariumFish(list).flatMap((t) => {
        const fish = fishByName(t.species);
        // 깊이 0(가까이) ~ 0.85(멀리) — 많이 잡은 어종일수록 앞으로
        return fish ? [{ fish, size: t.size, speed: t.speed, phase: t.phase, z: Math.max(0, Math.min(0.85, ((t.z + 1.5) / 2.5) * 0.85 - (t.size - 0.55) * 0.35)) }] : [];
    });
}

export function useMyTank(enabled: boolean) {
    return useQuery<TankView>({ queryKey: TANK_KEY, enabled, staleTime: 30_000 });
}

/** 한 칸을 바꾼 뒤의 자리(서버 POST /fishing/tank/layout 과 같은 규칙) */
export function placeLocal(view: TankView, slot: DecorSlot, item: string | null): TankView {
    const owned = new Set((view.items ?? []).filter((x) => x.have).map((x) => x.id));
    const next: Record<string, string> = { ...view.layout } as Record<string, string>;
    if (item) for (const k of Object.keys(next)) if (next[k] === item) delete next[k];
    if (item === null) delete next[slot]; else next[slot] = item;
    const layout: DecorLayout = {};
    for (const s of DECOR_SLOTS) if (next[s] !== undefined) layout[s] = next[s];
    return { ...view, layout, placed: resolveLayout(layout, owned) };
}

/** 이 기기에서 이미 보여 준 받은 장식 — 새로 받은 것은 한 번 크게 보여 준다 */
export const DECOR_SEEN_KEY = "rankue.fishing.decor.seen";
export const readDecorSeen = (): Set<string> | null => {
    try { const raw = localStorage.getItem(DECOR_SEEN_KEY); if (raw == null) return null; const v = JSON.parse(raw); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return null; }
};
export const writeDecorSeen = (ids: readonly string[]) => { try { localStorage.setItem(DECOR_SEEN_KEY, JSON.stringify([...new Set([...(readDecorSeen() ?? []), ...ids])])); } catch { /* 못 적어도 수족관은 돈다 */ } };
