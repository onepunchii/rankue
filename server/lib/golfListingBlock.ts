/**
 * 골프장 공개 페이지(/api/hiq/golf-courses)에서 **보는 사람과 차단 관계인 회원의 조인·부킹 글**을 빼는 순수 함수(2026-10-06).
 *
 * 왜 따로 있나: 그 라우트는 비로그인·검색 로봇도 읽는 공개 자료라 60초 **공용 캐시** 하나를 모두가 나눠 쓴다
 * (routes/modules/golfCourses.ts loadSummary). 보는 사람별 결과를 그 캐시에 넣으면 남의 차단 목록으로 거른 글이
 * 다음 사람에게 나간다. 그래서 캐시에서 **꺼낸 뒤에** 거른다 — 여기 함수는 받은 것을 고치지 않고 새 배열·새 객체를 준다.
 *
 *  - 양방향이다: `blocked` 는 '내가 차단한 사람 + 나를 차단한 사람'(storage.golf.blockPeerIds).
 *    회원용 목록·날짜 칩·상세·신청(golf.repo notBlockedByViewer)과 같은 뜻이어야, 골프장 페이지의 티타임 줄을 눌렀을 때
 *    목록에 그 글이 있다.
 *  - 글 주인은 `ownerOf`(글 id → 회원 id)로만 안다. **글 객체에는 주인 id 를 싣지 않는다** — 그 객체가 그대로 공개 응답이 된다.
 *  - 주인을 모르는 글(owner_id 가 빈 2026-09-09 이전 글)은 빠지지 않는다 — 누구 글인지 몰라 어떤 차단과도 맞지 않는다.
 *  - 뺄 것이 없으면 **받은 배열·객체를 그대로** 돌려준다. 비로그인(blocked 없음)과 차단 관계가 없는 회원의 응답이
 *    예전과 한 글자도 다르지 않다는 것이 이 한 줄에 달려 있다.
 */
export function withoutBlockedListings<T extends { id: string }>(
    listings: T[],
    ownerOf: ReadonlyMap<string, string>,
    blocked: ReadonlySet<string> | null | undefined,
): T[] {
    if (!blocked || blocked.size === 0 || ownerOf.size === 0) return listings;
    // uuid 는 대소문자를 가리지 않는다 — DB 가 준 값끼리라 보통 같지만, 어긋나서 조용히 새는 일이 없게 맞춰 놓고 본다.
    const peers = new Set<string>();
    for (const id of blocked) peers.add(String(id).toLowerCase());
    const kept = listings.filter((l) => {
        const owner = ownerOf.get(l.id);
        return !owner || !peers.has(owner.toLowerCase());
    });
    return kept.length === listings.length ? listings : kept;
}

/**
 * 요약 한 벌을 보는 사람에게 맞춘다 — 글 목록만 거른 **새 객체**를 준다(공용 캐시는 그대로다).
 * 글 수·'n건'·다음 티타임 같은 숫자는 모두 이 목록에서 다시 세므로, 목록과 숫자가 어긋나지 않는다.
 * 뺄 글이 없으면 받은 객체 그대로.
 */
export function summaryForViewer<L extends { id: string }, S extends { listings: L[]; ownerOf: ReadonlyMap<string, string> }>(
    summary: S,
    blocked: ReadonlySet<string> | null | undefined,
): S {
    const kept = withoutBlockedListings(summary.listings, summary.ownerOf, blocked);
    return kept === summary.listings ? summary : { ...summary, listings: kept };
}
