/**
 * 랭큐 굿즈샵 출시 알림(2026-10-24 오너: "이 그림 우리 굿즈로 · 나중에 굿즈샵으로 실물 판매 — 옷 · 큐 · 큐 케이스 등등" → "추천대로 순서대로").
 * 실물을 만들기 전에 무엇을 갖고 싶어 하는지 센다 — 큐 케이스 아래 '랭큐 굿즈 곧 나와요'에서 고르고 '출시 알림 받기'.
 * 한 사람에 한 줄(goods_shop_interest, 고른 것 목록). 비우면 신청을 거둔 것. 어드민 '굿즈 · 배지 증정' 위에 품목별 수.
 * 출시 알림은 아직 보내지 않는다 — 열 때 이 명단으로 보낸다.
 * ⚠️ 서버도 부른다 — 상대 임포트는 ./x.js(지금은 임포트 없음).
 */

export type GoodsShopLocale = "ko" | "en" | "es" | "vi" | "tr";
export interface GoodsShopItem { readonly id: string; readonly name: Readonly<Record<GoodsShopLocale, string>> }

const N = (ko: string, en: string, es: string, vi: string, tr: string) => ({ ko, en, es, vi, tr });
export const GOODS_SHOP_ITEMS: readonly GoodsShopItem[] = [
    { id: "cap", name: N("모자", "Cap", "Gorra", "Mũ", "Şapka") },
    { id: "apparel", name: N("후드 · 티셔츠", "Hoodie · Tee", "Sudadera · Camiseta", "Hoodie · Áo thun", "Kapüşonlu · Tişört") },
    { id: "cue-case", name: N("큐 케이스", "Cue case", "Estuche de taco", "Hộp đựng cơ", "Istaka çantası") },
    { id: "cue", name: N("큐", "Cue", "Taco", "Cơ", "Istaka") },
    { id: "glove", name: N("당구 장갑", "Billiard glove", "Guante de billar", "Găng tay bida", "Bilardo eldiveni") },
    { id: "goods", name: N("키링 · 스티커", "Keyring · Stickers", "Llavero · Pegatinas", "Móc khóa · Sticker", "Anahtarlık · Çıkartma") },
];
const IDS = new Set(GOODS_SHOP_ITEMS.map((x) => x.id));

/** 고른 것 검사 — 아는 것만, 겹치지 않게, 목록 차례로. 모양이 틀리면 null */
export function cleanShopItems(v: unknown): string[] | null {
    if (!Array.isArray(v) || v.length > GOODS_SHOP_ITEMS.length * 2) return null;
    if (!v.every((x) => typeof x === "string")) return null;
    const set = new Set(v.filter((x) => IDS.has(x)));
    return GOODS_SHOP_ITEMS.map((x) => x.id).filter((id) => set.has(id));
}

/** 기다리는 사람 수를 화면에 적는 문턱 — 너무 적으면 오히려 비어 보인다 */
export const SHOP_WAITING_SHOWN_FROM = 20;

export interface GoodsShopStats { total: number; byItem: Record<string, number>; recent: { memberId: string; name: string; items: string[]; at: number }[] }
