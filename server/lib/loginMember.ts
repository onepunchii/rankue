/**
 * 소셜 로그인이 들어갈 회원 행 고르기(2026-10-05 카카오 로그인 검토).
 *
 * 한 프로필(사람)에 회원 행이 여럿일 수 있다 — 같은 전화번호+PIN 으로 제휴 매장과 본 사이트(hiq)에 따로 가입하면
 * 프로필 하나에 행이 둘이다. 전적·레이팅·크루는 회원 행 단위다.
 * 지금까지 소셜 프로필은 글로벌 매장 행 하나뿐이라 "가장 오래된 행"이 늘 맞았는데, 전화번호 회원이 설정에서 카카오를
 * **연결**할 수 있게 되면서 어긋났다: 매장에 먼저 가입한 사람이 hiq 행에서 연결하고 카카오로 들어오면 매장 행으로 들어갔다.
 *
 * 순서: 본 사이트(hiq) → 글로벌(global) → 그 밖(가장 오래된 것).
 * 연결 단추는 본 사이트 화면에만 있고(매장 진입에는 카카오 단추가 없다) 카카오에서 돌아오는 주소에도 매장이 실리지 않아,
 * 고정 순서만으로 "연결을 누른 그 행"이 잡힌다. 구글·애플·카카오로 **가입한** 프로필은 global 행 하나뿐이라 결과가 그대로다.
 *
 * DB 를 모르는 순수 함수로 둔다 — 저장소(user.repo getLoginMemberByProfileId)와 시험의 메모리 저장소가 같은 규칙을 쓴다.
 */
import { DEFAULT_STORE_SLUG, GLOBAL_STORE_SLUG } from "../../shared/systemStores.js";

export type LoginMemberRow<M> = { member: M; storeSlug: string | null | undefined; createdAt?: Date | string | number | null };

function storeRank(slug: string | null | undefined): number {
    if (slug === DEFAULT_STORE_SLUG) return 0;
    if (slug === GLOBAL_STORE_SLUG) return 1;
    return 2;
}

function timeOf(v: LoginMemberRow<unknown>["createdAt"]): number {
    if (v === null || v === undefined) return Number.POSITIVE_INFINITY;
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** 한 프로필의 회원 행들 가운데 로그인할 행. 행이 없으면 undefined. 넘겨받은 배열은 건드리지 않는다. */
export function pickLoginMember<M>(rows: readonly LoginMemberRow<M>[]): M | undefined {
    let best: LoginMemberRow<M> | undefined;
    for (const row of rows) {
        if (!best) { best = row; continue; }
        const byStore = storeRank(row.storeSlug) - storeRank(best.storeSlug);
        if (byStore < 0 || (byStore === 0 && timeOf(row.createdAt) < timeOf(best.createdAt))) best = row;
    }
    return best?.member;
}
