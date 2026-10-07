import { storage } from "../storage/index.js";
import { isStoreSlug } from "../../shared/joinStore.js";
import { isSystemStore } from "../../shared/systemStores.js";

/**
 * 화면이 보낸 '가입 매장'(매장 QR 로 온 기기의 표시 — shared/joinStore)을 실제 매장으로 바꾼다.
 * 화면이 보낸 값이라 그대로 믿지 않는다 — 아래를 다 지킬 때만 그 매장을 돌려주고, 아니면 null(= 예전처럼 기본·글로벌 매장으로 가입한다):
 *  - 매장 slug 로 올 수 있는 글자다
 *  - 시스템 매장(hiq · global)이 아니다
 *  - 실제로 있는 매장이고 **사장님이 있다**(owner_id) — 주인 없는 매장에 회원을 붙이지 않는다
 * 누구든 아무 매장의 slug 를 보낼 수는 있다 — 그 매장의 QR 을 찍은 것과 같은 결과라 문제가 되지 않는다(새 계정의 소속만 정한다).
 * 조회가 실패해도 가입을 막지 않는다 — null 을 돌려주고 기본 매장으로 가입시킨다.
 */
export async function resolveJoinStore(slug: unknown): Promise<{ id: string; slug: string } | null> {
    if (!isStoreSlug(slug) || isSystemStore(slug)) return null;
    try {
        const store = await storage.getStoreBySlug(slug);
        if (!store || !store.ownerId || isSystemStore(store.slug)) return null;
        return { id: store.id, slug: store.slug };
    } catch (e) {
        console.warn("[joinStore] 매장 조회 실패 — 기본 매장으로 가입시킨다:", (e as Error)?.message);
        return null;
    }
}
