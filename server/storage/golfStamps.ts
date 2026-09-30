/**
 * 도장깨기 도장 규칙 — 여권(golf.repo getGolfPassportStats)과 발자국(golfFootprints)이 **같은 함수**를 쓴다(2026-09-30).
 * 규칙이 두 벌이면 "도장 3개인데 발자국 2개"가 된다. 다른 모듈을 끌어오지 않는 잎 모듈이라 순환 임포트가 없다.
 */
export interface StampClub { id: string; name: string; region: string | null; address: string | null }
export interface StampHit<C> { key: string; club: C | null; name: string }

/**
 * 기록 한 줄 → 어느 골프장 도장인가. 모르면 null(라운드 수에만 들어가고 도장은 없다).
 * 2026-09-11 여권 규칙 그대로: 골프장 번호가 먼저, 없으면 공백·대소문자를 무시한 이름. '알 수 없는 구장'은 도장이 아니다.
 * 같은 이름이 둘이면 먼저 나온 골프장(원장 순서)이 이긴다.
 */
export function makeStampResolver<C extends StampClub>(clubs: readonly C[]) {
    const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
    const byId = new Map(clubs.map((c) => [c.id, c]));
    const byName = new Map<string, C>();
    for (const c of clubs) if (!byName.has(squash(c.name))) byName.set(squash(c.name), c);
    return (h: { golfClubId: string | null; locationName: string | null }): StampHit<C> | null => {
        const club = (h.golfClubId && byId.get(h.golfClubId)) || (h.locationName ? byName.get(squash(h.locationName)) : undefined);
        if (!club && (!h.locationName || h.locationName === "알 수 없는 구장")) return null;
        return { key: club?.id ?? `name:${squash(h.locationName!)}`, club: club ?? null, name: club?.name ?? h.locationName! };
    };
}
