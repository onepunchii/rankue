/**
 * 골프 발자국(2026-09-30) — 도장깨기 도장을 **처음 간 순서**로 줄 세운다.
 *
 * 도장의 출처는 여권과 같다: 18홀을 끝까지 적은 실제 회원의 랭큐매치 기록(hiq_game_history, GOLF).
 * 게스트·중도 종료는 기록 자체가 없다(finishGolfMatchSession 이 거른다). 골프장은 기록의 golf_club_id,
 * 옛 기록은 이름으로 잇는다 — 이 규칙은 golfStamps.ts 의 makeStampResolver 하나로 여권(getGolfPassportStats)과 나눠 쓴다.
 * 여기서 규칙이 갈라지면 "도장 3개인데 발자국 2개" 가 된다.
 *
 * 연도는 **한국 시각**으로 자른다(서버는 UTC — 1월 1일 새벽 라운드가 전년도로 가면 안 된다).
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db.js";
import { hiqGameHistory, rankueGolfClubs } from "../../shared/schema.js";
import { passportRegionGroup, resolveGolfRegionCode } from "../../shared/golfRegions.js";
import { courseNameKey } from "../../shared/golfCourse.js";
import { parseLatLng } from "../../shared/golfNearby.js";
import { kstYear, type FootprintStop, type FootprintsResponse } from "../../shared/golfFootprints.js";
import { clubPageIndex } from "./golf.repo.js";
import { makeStampResolver } from "./golfStamps.js";

type Acc = { stop: Omit<FootprintStop, "firstVisitedAt" | "lastVisitedAt">; first: Date; last: Date };

/** 내 발자국. year 가 null 이면 전체. 남의 것은 없다 — 라우트가 로그인한 본인 번호만 넘긴다. */
export async function getGolfFootprints(memberId: string, year: number | null): Promise<FootprintsResponse> {
    const [history, clubs, pages] = await Promise.all([
        db.select({
            locationName: hiqGameHistory.locationName,
            golfClubId: hiqGameHistory.golfClubId,
            score: hiqGameHistory.score,
            createdAt: hiqGameHistory.createdAt,
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
    const years = new Set<number>();
    let rounds = 0;
    const acc = new Map<string, Acc>();
    for (const h of history) {
        const y = kstYear(h.createdAt);
        const hit = resolve(h);
        if (hit) years.add(y);
        if (year != null && y !== year) continue;
        rounds++;
        if (!hit) continue;
        const cur = acc.get(hit.key);
        const score = h.score > 0 ? h.score : null;
        if (!cur) {
            const page = pages.get(courseNameKey(hit.name));
            // 좌표: 원장(rankue_golf_clubs) → 없으면 골프장 페이지(이름 열쇠). 목록(getGolfClubs)과 같은 순서.
            const at = (hit.club && parseLatLng(hit.club.latitude, hit.club.longitude)) || (page ? parseLatLng(page.lat, page.lng) : null);
            acc.set(hit.key, {
                stop: {
                    clubId: hit.club?.id ?? null,
                    name: hit.name,
                    slug: page?.slug ?? null,
                    region: hit.club ? passportRegionGroup(resolveGolfRegionCode(hit.club.region, hit.club.address)) : null,
                    lat: at?.lat ?? null,
                    lng: at?.lng ?? null,
                    visits: 1,
                    bestScore: score,
                },
                first: h.createdAt, last: h.createdAt,
            });
        } else {
            cur.stop.visits++;
            if (h.createdAt > cur.last) cur.last = h.createdAt;
            if (score != null && (cur.stop.bestScore == null || score < cur.stop.bestScore)) cur.stop.bestScore = score;
        }
    }

    // 처음 간 순서. 같은 시각(한 번에 적힌 옛 기록)이면 이름순으로 고정 — 새로고침마다 번호가 바뀌지 않게.
    const stops: FootprintStop[] = [...acc.values()]
        .sort((a, b) => a.first.getTime() - b.first.getTime() || a.stop.name.localeCompare(b.stop.name, "ko"))
        .map((a) => ({ ...a.stop, firstVisitedAt: a.first.toISOString(), lastVisitedAt: a.last.toISOString() }));

    return { year, years: [...years].sort((a, b) => b - a), rounds, stops };
}
