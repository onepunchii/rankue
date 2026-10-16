/**
 * 어드민 · 회원 상세의 '종목' 칸(2026-10-17, shared/adminMemberSports 머리말). 시트를 열 때만 부른다 — 회원 목록에 싣지 않는다(adminMemberGolf 와 같은 까닭).
 * 질의 다섯(당구 · 골프 · 등산 · 낚시 합계 · 최근 조과)을 동시에 보낸다. 표가 없으면(42P01 · 42703) 그 칸만 비운다 — 시트는 열린다.
 * **좌표 칸(fishing_catches.lat/lng · hiking_marks.lat/lng)은 고르지 않는다.**
 * member_id 가 낚시 표는 글자(text), 나머지는 uuid 다.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import { RECENT_CATCHES, type AdminMemberFishingCatch, type AdminMemberSports } from "../../shared/adminMemberSports.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const missing = (e: any) => ["42P01", "42703"].includes(e?.code ?? e?.cause?.code);
const num = (v: unknown) => Number(v ?? 0) || 0;
// timestamp(시간대 없음)은 UTC 벽시계 — 글자로 읽어 Z 를 붙인다
const ISO = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

async function one(q: SQL): Promise<any | null> {
    try { return rowsOf(await db.execute(q))[0] ?? null; } catch (e) { if (missing(e)) return null; throw e; }
}
async function many(q: SQL): Promise<any[]> {
    try { return rowsOf(await db.execute(q)); } catch (e) { if (missing(e)) return []; throw e; }
}
const countMap = (rows: any[], key = "kind"): Record<string, number> => Object.fromEntries(rows.map((r) => [String(r[key]), num(r.n)]));

export async function getMemberSportsForAdmin(memberId: string): Promise<AdminMemberSports | null> {
    const exists = await one(sql`select 1 as ok from hiq_members where id = ${memberId}::uuid`);
    if (!exists) return null;
    const [bil, online, golfAwards, hik, hikAwards, fish, recent, grants] = await Promise.all([
        one(sql`select
            (select coalesce(json_agg(item_id order by earned_at, created_at), '[]'::json) from hiq_cue_case_awards where member_id = ${memberId}::uuid) as items,
            (select hero_item from hiq_cue_case_prefs where member_id = ${memberId}::uuid) as hero,
            (select count(*)::int from hiq_referrals where inviter_id = ${memberId}::uuid and canceled_at is null) as joined,
            (select count(*)::int from hiq_referrals where inviter_id = ${memberId}::uuid and canceled_at is not null) as canceled,
            (select m.name from hiq_referrals r join hiq_members m on m.id = r.inviter_id where r.invitee_id = ${memberId}::uuid and r.canceled_at is null) as invited_by`),
        many(sql`select game_type, rating, matches, wins from hiq_sim_match_ratings where member_id = ${memberId}::uuid order by game_type`),
        many(sql`select kind, count(*)::int as n from golf_stamp_awards where member_id = ${memberId}::uuid group by kind`),
        one(sql`select
            (select count(*)::int from hiking_summits where member_id = ${memberId}::uuid and verified) as verified,
            (select count(*)::int from hiking_summits where member_id = ${memberId}::uuid and not verified and admin_void is null) as unverified,
            (select count(*)::int from hiking_summits where member_id = ${memberId}::uuid and not verified and admin_void is not null) as voided,
            (select count(distinct mountain_id)::int from hiking_summits where member_id = ${memberId}::uuid) as mountains,
            (select count(*)::int from hiking_trips where member_id = ${memberId}::uuid) as trips,
            (select count(*) filter (where reached_summit)::int from hiking_trips where member_id = ${memberId}::uuid) as reached,
            (select coalesce(sum(km), 0)::float from hiking_trips where member_id = ${memberId}::uuid) as km,
            (select count(*)::int from hiking_photos where member_id = ${memberId}::uuid) as photos,
            (select count(*)::int from hiking_photos where member_id = ${memberId}::uuid and hidden_at is not null) as hidden_photos,
            (select count(*)::int from hiking_marks where member_id = ${memberId}::uuid) as marks,
            (select count(*)::int from hiq_crew_members cm join hiq_crews c on c.id = cm.crew_id where cm.member_id = ${memberId}::uuid and cm.role <> 'pending' and c.sport_category = 'HIKING') as crews,
            (select ${ISO("max(at)")} from hiking_summits where member_id = ${memberId}::uuid) as last_at`),
        many(sql`select kind, count(*)::int as n from hiking_awards where member_id = ${memberId}::uuid group by kind`),
        one(sql`select
            (select count(*)::int from fishing_catches where member_id = ${memberId}) as catches,
            (select count(distinct species)::int from fishing_catches where member_id = ${memberId}) as species,
            (select coalesce(sum(fish_count), 0)::int from fishing_catches where member_id = ${memberId}) as fish,
            (select count(*)::int from fishing_catches where member_id = ${memberId} and photo_url is not null) as photos,
            (select count(*)::int from fishing_catches where member_id = ${memberId} and is_public) as public,
            (select count(*)::int from fishing_catches where member_id = ${memberId} and hidden_at is not null) as hidden,
            (select count(*)::int from fishing_catches where member_id = ${memberId} and hidden_at is not null and appeal_at is not null and appeal_at >= hidden_at) as appeals,
            (select count(*)::int from fishing_catches where member_id = ${memberId} and rank_void is not null) as rank_void,
            (select count(*)::int from fishing_catches where member_id = ${memberId} and trip_id is not null) as on_trips,
            (select max(fished_on) from fishing_catches where member_id = ${memberId}) as last_day,
            (select count(*)::int from fishing_gear where member_id = ${memberId}) as gear,
            (select count(*)::int from fishing_decor_awards where member_id = ${memberId}) as decor,
            (select count(*)::int from hiq_crew_members cm join hiq_crews c on c.id = cm.crew_id where cm.member_id = ${memberId}::uuid and cm.role <> 'pending' and c.sport_category = 'FISHING') as crews`),
        many(sql`select id::text as id, fished_on, species, length_cm, fish_count, weight_kg, place, thumb_url, is_public, trip_id is not null as on_trip,
                hidden_at is not null as hidden, (hidden_at is not null and appeal_at is not null and appeal_at >= hidden_at) as appealed, rank_void is not null as rank_void
            from fishing_catches where member_id = ${memberId} order by fished_on desc, created_at desc limit ${RECENT_CATCHES}`),
        many(sql`select sport, count(*) filter (where revoked_at is null)::int as active, count(*) filter (where revoked_at is not null)::int as revoked
            from hiq_goods_grants where member_id = ${memberId}::uuid group by sport`),
    ]);
    const recentRows: AdminMemberFishingCatch[] = recent.map((r) => ({
        id: String(r.id), day: String(r.fished_on ?? ""), species: String(r.species ?? ""), lengthCm: r.length_cm == null ? null : Number(r.length_cm),
        count: num(r.fish_count) || 1, weightKg: r.weight_kg == null ? null : Number(r.weight_kg), place: String(r.place ?? ""),
        thumbUrl: r.thumb_url ?? null, isPublic: r.is_public === true, hidden: r.hidden === true, appealed: r.appealed === true, rankVoid: r.rank_void === true, onTrip: r.on_trip === true,
    }));
    return {
        billiards: {
            caseItems: Array.isArray(bil?.items) ? bil.items.map(String) : [],
            hero: bil?.hero ?? null,
            invites: { joined: num(bil?.joined), canceled: num(bil?.canceled), invitedBy: bil?.invited_by ?? null },
            online: online.map((r) => ({ gameType: String(r.game_type), rating: num(r.rating), matches: num(r.matches), wins: num(r.wins) })),
        },
        golf: { awards: countMap(golfAwards) },
        hiking: {
            verified: num(hik?.verified), unverified: num(hik?.unverified), voided: num(hik?.voided), mountains: num(hik?.mountains),
            trips: num(hik?.trips), reached: num(hik?.reached), km: Math.round(num(hik?.km) * 10) / 10, photos: num(hik?.photos), hiddenPhotos: num(hik?.hidden_photos),
            marks: num(hik?.marks), awards: countMap(hikAwards), crews: num(hik?.crews), lastAt: hik?.last_at ?? null,
        },
        fishing: {
            catches: num(fish?.catches), species: num(fish?.species), fish: num(fish?.fish), photos: num(fish?.photos), public: num(fish?.public),
            hidden: num(fish?.hidden), appeals: num(fish?.appeals), rankVoid: num(fish?.rank_void), onTrips: num(fish?.on_trips),
            gear: num(fish?.gear), decor: num(fish?.decor), crews: num(fish?.crews), lastDay: fish?.last_day ?? null, recent: recentRows,
        },
        grants: Object.fromEntries(grants.map((r) => [String(r.sport), { active: num(r.active), revoked: num(r.revoked) }])),
    };
}
