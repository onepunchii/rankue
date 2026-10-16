/**
 * 굿즈 · 배지 증정의 목록(2026-10-16 오너: "어드민에 굿즈 내역 · 증정 · 수정 가능하게 · 이쁘게" → 네 종목 전부 · 증정한 것만 회수 + 사유 · 알림 + 받은 화면).
 *
 * 종목마다 이미 있는 목록을 한 꼴(GoodsItem)로 펼친다 — 새 굿즈를 만들지 않는다.
 *  - 당구: 큐 케이스(shared/cueCase — 큐 · 초크 · 장갑 · 페넌트) → hiq_cue_case_awards
 *  - 낚시: 수족관 장식(shared/fishingDecor) → fishing_decor_awards
 *  - 골프: 도장첩 볼마커 · 트로피 · 핀 …(shared/golfStampAwards 의 kind:key) → golf_stamp_awards   — goodsGolfHiking.ts
 *  - 등산: 와펜 · 큰 와펜 · 핀 · 등급(shared/hikingStamps 의 kind:key) → hiking_awards                — goodsGolfHiking.ts
 * 경기 결과로 받는 메달(월대회 · 이달의 랭킹)과 라운드 · 정상 도장은 증정하지 않는다 — 기록이 거짓이 된다.
 */
import { CASE_ITEMS, caseImage, caseItem, type CaseKind } from "./cueCase.js";
import { DECOR, decorImage, decorItem } from "./fishingDecor.js";
import { golfGoods, hikingGoods } from "./goodsGolfHiking.js";

export type GoodsSport = "billiards" | "golf" | "hiking" | "fishing";
export const GOODS_SPORTS: readonly GoodsSport[] = ["billiards", "golf", "hiking", "fishing"];
export const GOODS_SPORT_NAME: Readonly<Record<GoodsSport, string>> = { billiards: "당구", golf: "골프", hiking: "등산", fishing: "낚시" };
/** 알림의 종목(알림함이 종목별이다) */
export const GOODS_SPORT_CATEGORY: Readonly<Record<GoodsSport, string>> = { billiards: "BILLIARDS", golf: "GOLF", hiking: "HIKING", fishing: "FISHING" };

export interface GoodsItem {
    sport: GoodsSport;
    /** 받은 기록의 열쇠 — 당구 'cue-…' · 낚시 'seagrass' · 골프/등산 'kind:key' */
    key: string;
    name: string;
    /** 묶음(큐 · 초크 …) */
    group: string;
    groupName: string;
    /** 작은 그림 — 없으면 화면이 이름 글자로 그린다 */
    image: string | null;
    /** 그림 꼴: 가로로 긴 큐 · 정사각 · 가로로 넓은 띠 */
    shape: "cue" | "square" | "wide";
    /** 수량 한정(다 나가면 더 줄 수 없다) */
    limit?: number;
}

const CASE_GROUP: Readonly<Record<CaseKind, string>> = { cue: "큐", chalk: "초크", glove: "장갑", pennant: "페넌트" };
const billiards = (): GoodsItem[] => CASE_ITEMS.map((x) => ({
    sport: "billiards", key: x.id, name: x.name.ko, group: x.kind, groupName: CASE_GROUP[x.kind], image: caseImage(x),
    shape: x.kind === "cue" ? "cue" : "square", ...(x.limit ? { limit: x.limit } : {}),
}));
const DECOR_GROUP = { bg: "배경", floor: "바닥", big: "큰 장식", prop: "소품" } as const;
const fishing = (): GoodsItem[] => DECOR.map((d) => ({
    sport: "fishing", key: d.id, name: d.name, group: d.kind, groupName: DECOR_GROUP[d.kind], image: decorImage(d.id, true),
    shape: d.kind === "bg" || d.kind === "floor" ? "wide" : "square", ...(d.limit ? { limit: d.limit } : {}),
}));


const cache = new Map<GoodsSport, GoodsItem[]>();
export function goodsCatalog(sport: GoodsSport): readonly GoodsItem[] {
    const hit = cache.get(sport);
    if (hit) return hit;
    const list = sport === "billiards" ? billiards() : sport === "fishing" ? fishing() : sport === "golf" ? golfGoods() : hikingGoods();
    if (list.length) cache.set(sport, list);
    return list;
}
export function goodsItem(sport: GoodsSport, key: string): GoodsItem | null {
    if (sport === "billiards" && !caseItem(key)) return null;
    if (sport === "fishing" && !decorItem(key)) return null;
    return goodsCatalog(sport).find((x) => x.key === key) ?? null;
}
export const isGoodsSport = (v: unknown): v is GoodsSport => typeof v === "string" && (GOODS_SPORTS as readonly string[]).includes(v);

/** 받은 사람이 그것을 보러 가는 곳 */
export function goodsCollectionUrl(sport: GoodsSport, key: string): string {
    if (sport === "billiards") { const x = caseItem(key); return `/cue-case${x && x.kind !== "cue" ? `?sec=${x.kind === "pennant" ? "medals" : x.kind}` : ""}`; }
    if (sport === "fishing") return "/fishing/tank";
    if (sport === "golf") return "/golf/shelf";
    return "/hiking/stamps";
}

/** GET /admin/goods/member/:id 의 한 줄 — 가진 것(자동으로 받은 것 + 증정한 것) */
export interface GoodsOwned { sport: GoodsSport; key: string; serial: number | null; earnedAt: string | null; grant: { id: string; reason: string; adminName: string; at: string } | null }
/** 증정 기록 한 줄 */
export interface GoodsGrantRow {
    id: string; memberId: string; memberName: string; sport: GoodsSport; key: string; name: string; serial: number | null;
    reason: string; message: string | null; notified: boolean; adminName: string; at: string;
    revokedAt: string | null; revokedBy: string | null; revokeReason: string | null;
}
/** GET /gifts/:id — 받은 사람에게 */
export interface GiftView { id: string; sport: GoodsSport; key: string; name: string; groupName: string; image: string | null; shape: GoodsItem["shape"]; serial: number | null; limit: number | null; message: string | null; url: string; at: string }
