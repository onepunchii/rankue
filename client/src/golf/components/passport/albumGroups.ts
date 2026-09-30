/**
 * 앨범 묶기(2026-09-30) — 사진을 골프장마다 묶고 발자국 번호(전체 기간, 처음 간 순서)를 붙인다. 순수 함수(albumGroups.test.ts).
 *
 * 골프장 이름으로 잇는다: 사진은 경기의 골프장 이름(golf_match_sessions.course_name)을, 발자국은 원장 이름을 가진다(대개 같다).
 * 공백·대소문자를 무시하고, 그래도 안 맞으면 끝의 'CC·GC·컨트리클럽…' 을 떼고 한 번 더 본다.
 * 도장이 없는 라운드(18홀을 다 적지 않은 판)의 사진은 번호 없이 이름으로 묶는다.
 * 묶음 순서는 최근 라운드부터, 묶음 안은 찍은 순서.
 */
import type { FootprintStop } from "@shared/golfFootprints";

/** 묶는 데 쓰는 사진 칸만 — photoApi 의 MinePhoto 가 이 모양을 품는다 */
export interface GroupablePhoto { id: string; sessionId: string; courseName: string | null; playedAt: string; createdAt: string }

export interface CourseGroup<P extends GroupablePhoto = GroupablePhoto> {
    key: string;
    name: string;
    /** 발자국 번호(1부터). 도장 없는 골프장이면 null */
    n: number | null;
    /** 가장 최근 발자국(지도에서 주황)인가 */
    latest: boolean;
    /** 사진이 있는 라운드 날 'YYYY.MM.DD'(최근 먼저, 한국 날짜) */
    days: string[];
    photos: P[];
    lastAt: number;
}

const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
const loose = (v: string) => squash(v).replace(/(컨트리클럽|골프클럽|골프앤리조트|cc|gc)$/, "");
const t = (iso: string) => Date.parse(iso) || 0;
/** 한국 날짜 'YYYY.MM.DD' — 기기 시간대와 무관하게 */
export function kstDot(iso: string): string {
    const d = new Date(t(iso) + 9 * 3600_000);
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function groupByCourse<P extends GroupablePhoto>(photos: readonly P[], stops: readonly FootprintStop[]): CourseGroup<P>[] {
    const exact = new Map<string, number>(), rough = new Map<string, number>();
    stops.forEach((s, i) => {
        if (!exact.has(squash(s.name))) exact.set(squash(s.name), i);
        const l = loose(s.name);
        if (l && !rough.has(l)) rough.set(l, i);
    });
    const groups = new Map<string, CourseGroup<P>>();
    for (const p of photos) {
        const name = p.courseName?.trim() || "골프장";
        const idx = exact.get(squash(name)) ?? (loose(name) ? rough.get(loose(name)) : undefined);
        const key = idx != null ? `s${idx}` : `n:${squash(name)}`;
        let g = groups.get(key);
        if (!g) {
            g = { key, name: idx != null ? stops[idx].name : name, n: idx != null ? idx + 1 : null, latest: idx != null && idx === stops.length - 1, days: [], photos: [], lastAt: 0 };
            groups.set(key, g);
        }
        g.photos.push(p);
        g.lastAt = Math.max(g.lastAt, t(p.playedAt), t(p.createdAt));
        const day = kstDot(p.playedAt);
        if (!g.days.includes(day)) g.days.push(day);
    }
    return [...groups.values()]
        .map((g) => ({ ...g, photos: [...g.photos].sort((a, b) => t(a.createdAt) - t(b.createdAt)), days: [...g.days].sort().reverse() }))
        .sort((a, b) => b.lastAt - a.lastAt);
}
