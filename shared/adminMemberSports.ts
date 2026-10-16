/**
 * 어드민 · 회원 상세의 '종목' 칸(2026-10-17 어드민 전수 조사 — 기반의 "회원 상세에 종목 칸" + 낚시 ⑤ "회원별 낚시 데이터").
 * 당구(큐 케이스 · 친구 초대 · 온라인 레이팅) · 골프 보상 · 등산 기록 수 · 낚시 기록 수와 최근 조과.
 *
 * **좌표는 싣지 않는다** — 조과의 lat/lng · 등산 표시 지점의 위경도는 여기로 오지 않는다(장소 이름 · 날짜 · 크기만).
 * 숫자를 보여 줄 뿐 고치는 단추는 없다 — 고치는 일은 각 종목 메뉴(조과 검수 · 정상 인증 · 큐 케이스 · 굿즈 · 배지)에서.
 */
import { caseItem, type CaseKind } from "./cueCase.js";

export interface AdminMemberFishingCatch {
    id: string; day: string; species: string; lengthCm: number | null; count: number; weightKg: number | null; place: string;
    thumbUrl: string | null; isPublic: boolean; hidden: boolean; appealed: boolean; rankVoid: boolean; onTrip: boolean;
}

export interface AdminMemberSports {
    billiards: {
        /** 큐 케이스에 든 것(받은 순) — 이름은 화면이 shared/cueCase 로 찾는다 */
        caseItems: string[];
        hero: string | null;
        invites: { joined: number; canceled: number; invitedBy: string | null };
        online: { gameType: string; rating: number; matches: number; wins: number }[];
    };
    golf: { awards: Record<string, number> };
    hiking: {
        verified: number; unverified: number; voided: number; mountains: number;
        trips: number; reached: number; km: number; photos: number; hiddenPhotos: number; marks: number;
        awards: Record<string, number>; crews: number; lastAt: string | null;
    };
    fishing: {
        catches: number; species: number; fish: number; photos: number; public: number; hidden: number; appeals: number; rankVoid: number;
        onTrips: number; gear: number; decor: number; crews: number; lastDay: string | null;
        recent: AdminMemberFishingCatch[];
    };
    /** 운영자가 증정한 것 — 종목마다 (남은 것, 회수한 것) */
    grants: Record<string, { active: number; revoked: number }>;
}

/** 시트가 보여 주는 최근 조과 수 */
export const RECENT_CATCHES = 8;

/** 큐 케이스를 종류별로 — 모르는 id(지운 물건)는 '기타' */
export function caseByKind(ids: readonly string[]): Record<CaseKind | "other", number> {
    const out: Record<CaseKind | "other", number> = { cue: 0, chalk: 0, glove: 0, pennant: 0, other: 0 };
    for (const id of ids) out[caseItem(id)?.kind ?? "other"] += 1;
    return out;
}
/** 한정 큐(번호가 붙는 99개짜리) 수 */
export const limitedCount = (ids: readonly string[]) => ids.filter((id) => caseItem(id)?.group === "limited").length;

/** 골프 보상 — 받은 기록의 kind 를 사람이 읽는 네 묶음으로(shared/golfStampAwards StampAwardKind) */
export function golfAwardGroups(a: Record<string, number>): { books: number; trophies: number; pins: number; markers: number } {
    const n = (k: string) => a[k] ?? 0;
    return { books: n("book") + n("all"), trophies: n("trophy"), pins: n("pin"), markers: n("black") + n("pearl") + n("tag") + n("special") };
}

/** 등산 받은 것 — 와펜(도장첩 완성) · 완등 · 핀 · 등급(shared/hikingStamps HikingAwardKind) */
export function hikingAwardGroups(a: Record<string, number>): { patches: number; grands: number; pins: number; grades: number } {
    const n = (k: string) => a[k] ?? 0;
    return { patches: n("patch"), grands: n("grand"), pins: n("pin"), grades: n("grade") };
}

/** 종목마다 보여 줄 것이 있는가 — 없으면 한 줄로 접는다 */
export function sportHasData(s: AdminMemberSports) {
    const b = s.billiards, h = s.hiking, f = s.fishing;
    return {
        billiards: b.caseItems.length > 0 || b.invites.joined + b.invites.canceled > 0 || !!b.invites.invitedBy || b.online.some((o) => o.matches > 0) || (s.grants.billiards?.active ?? 0) + (s.grants.billiards?.revoked ?? 0) > 0,
        golf: Object.values(s.golf.awards).some((v) => v > 0) || (s.grants.golf?.active ?? 0) + (s.grants.golf?.revoked ?? 0) > 0,
        hiking: h.verified + h.unverified + h.voided + h.trips + h.photos + h.marks + h.crews > 0 || Object.values(h.awards).some((v) => v > 0) || (s.grants.hiking?.active ?? 0) + (s.grants.hiking?.revoked ?? 0) > 0,
        fishing: f.catches + f.gear + f.decor + f.crews > 0 || (s.grants.fishing?.active ?? 0) + (s.grants.fishing?.revoked ?? 0) > 0,
    };
}

/** 조과 한 줄의 크기 — "38cm" · "3마리" · "1.2kg" 중 있는 것 */
export function catchSize(c: Pick<AdminMemberFishingCatch, "lengthCm" | "count" | "weightKg">): string {
    const parts: string[] = [];
    if (c.lengthCm != null) parts.push(`${c.lengthCm % 1 ? c.lengthCm.toFixed(1) : c.lengthCm}cm`);
    if (c.weightKg != null) parts.push(`${c.weightKg}kg`);
    if (c.count > 1) parts.push(`${c.count}마리`);
    return parts.join(" · ") || "1마리";
}
