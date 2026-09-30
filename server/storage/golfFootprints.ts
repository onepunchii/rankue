/**
 * 골프 발자국(2026-09-30) — 도장깨기 도장을 **처음 간 순서**로 줄 세운다.
 *
 * 도장의 출처는 여권과 같다: 18홀을 끝까지 적은 실제 회원의 랭큐매치 기록(hiq_game_history, GOLF).
 * 게스트·중도 종료는 기록 자체가 없다(finishGolfMatchSession 이 거른다). 골프장은 기록의 golf_club_id,
 * 옛 기록은 이름으로 잇는다 — 이 규칙은 golfStamps.ts 의 makeStampResolver·collectStamps 하나로 여권(getGolfPassportStats)과 나눠 쓴다.
 * 여기서 규칙이 갈라지면 "도장 3개인데 발자국 2개" 가 된다.
 *
 * 현장 인증(2026-09-30 오너 결정): 번호·길·공유 카드는 **인증 도장만**(stops). 인증 없이 적은 골프장은 records 로 따로 —
 * 지도에 흐리게만 찍고 길에는 넣지 않는다. 옛 기록(on_site NULL)은 인증으로 센다.
 *
 * 연도는 **한국 시각**으로 자른다(서버는 UTC — 1월 1일 새벽 라운드가 전년도로 가면 안 된다).
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { hiqGameHistory, rankueGolfClubs } from "../../shared/schema.js";
import { passportRegionGroup, resolveGolfRegionCode } from "../../shared/golfRegions.js";
import { courseNameKey } from "../../shared/golfCourse.js";
import { parseLatLng } from "../../shared/golfNearby.js";
import { countsOnSite } from "../../shared/golfOnSite.js";
import { kstYear, type FootprintStop, type FootprintsResponse } from "../../shared/golfFootprints.js";
import { clubPageIndex } from "./golf.repo.js";
import { collectStamps, makeStampResolver, type StampAgg } from "./golfStamps.js";

/** 내 발자국. year 가 null 이면 전체. 남의 것은 없다 — 라우트가 로그인한 본인 번호만 넘긴다. */
export async function getGolfFootprints(memberId: string, year: number | null): Promise<FootprintsResponse> {
    const [history, clubs, pages] = await Promise.all([
        db.select({
            locationName: hiqGameHistory.locationName,
            golfClubId: hiqGameHistory.golfClubId,
            score: hiqGameHistory.score,
            createdAt: hiqGameHistory.createdAt,
            onSite: hiqGameHistory.onSite,
        })
            .from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.sportCategory, "GOLF" as any)))
            .orderBy(asc(hiqGameHistory.createdAt)),
        db.select({
            id: rankueGolfClubs.id, name: rankueGolfClubs.name, region: rankueGolfClubs.region, address: rankueGolfClubs.address,
            latitude: rankueGolfClubs.latitude, longitude: rankueGolfClubs.longitude,
        }).from(rankueGolfClubs),
        clubPageIndex(),
    ]);

    const resolve = makeStampResolver<(typeof clubs)[number]>(clubs);
    // 연도 칩: 도장(인증·기록 어느 쪽이든)이 있는 해 — 기록 도장뿐인 해도 지도에 흐린 점이 있다
    const years = new Set<number>();
    for (const h of history) if (resolve(h)) years.add(kstYear(h.createdAt));
    const inPeriod = year == null ? history : history.filter((h) => kstYear(h.createdAt) === year);

    const toStop = (s: StampAgg<(typeof clubs)[number]>): FootprintStop => {
        const page = pages.get(courseNameKey(s.name));
        // 좌표: 원장(rankue_golf_clubs) → 없으면 골프장 페이지(이름 열쇠). 목록(getGolfClubs)과 같은 순서.
        const at = (s.club && parseLatLng(s.club.latitude, s.club.longitude)) || (page ? parseLatLng(page.lat, page.lng) : null);
        return {
            clubId: s.club?.id ?? null,
            name: s.name,
            slug: page?.slug ?? null,
            region: s.club ? passportRegionGroup(resolveGolfRegionCode(s.club.region, s.club.address)) : null,
            lat: at?.lat ?? null,
            lng: at?.lng ?? null,
            // 인증 도장이면 그 기간에 처음 **인증으로 센** 날(도장을 얻은 날) — 순서가 곧 발자국 번호
            firstVisitedAt: s.first.toISOString(),
            lastVisitedAt: s.last.toISOString(),
            visits: s.rounds,
            bestScore: s.bestScore,
        };
    };
    // 처음 간 순서, 같은 시각(한 번에 적힌 옛 기록)이면 이름순 — collectStamps 가 이미 그렇게 준다
    const all = collectStamps(inPeriod, resolve);
    return {
        year,
        years: [...years].sort((a, b) => b - a),
        rounds: inPeriod.length,
        onSiteRounds: inPeriod.filter((h) => countsOnSite(h.onSite)).length,
        stops: all.filter((s) => s.onSite).map(toStop),
        records: all.filter((s) => !s.onSite).map(toStop),
    };
}
