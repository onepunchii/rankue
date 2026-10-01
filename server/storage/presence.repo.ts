/**
 * 친구·크루 접속 알림(2026-10-01) — 규칙은 shared/presence.ts.
 * '들어왔다' = 30분 넘게 비어 있다가 새로 열린 앱 세션(hiq_app_sessions.opened_at). 그 세션이 아직 살아 있어야 한다
 * (닫힘 없음 + 마지막 신호가 하트비트 5분 + 여유 안). 내 사람: 서로 친구 + 최근 30일 안에 같이 친 크루원.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { PRESENCE_COPLAY_DAYS, type PresenceArrival } from "../../shared/presence.js";

const rowsOf = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

export async function getPresencePrefs(memberId: string): Promise<{ share: boolean; receive: boolean }> {
    const [row] = rowsOf(await db.execute(sql`select share, receive from hiq_presence_prefs where member_id = ${memberId}`));
    return { share: row ? !!row.share : true, receive: row ? !!row.receive : true };
}

export async function setPresencePrefs(memberId: string, patch: { share?: boolean; receive?: boolean }): Promise<{ share: boolean; receive: boolean }> {
    const cur = await getPresencePrefs(memberId);
    const next = { share: patch.share ?? cur.share, receive: patch.receive ?? cur.receive };
    await db.execute(sql`insert into hiq_presence_prefs (member_id, share, receive, updated_at)
        values (${memberId}, ${next.share}, ${next.receive}, now())
        on conflict (member_id) do update set share = excluded.share, receive = excluded.receive, updated_at = now()`);
    return next;
}

/** since 뒤에 새로 들어와 지금도 앱에 있는 '내 사람들'. 내가 받기를 껐으면 빈 목록 */
export async function listArrivals(viewerId: string, since: Date): Promise<PresenceArrival[]> {
    const prefs = await getPresencePrefs(viewerId);
    if (!prefs.receive) return [];
    const rows = rowsOf(await db.execute(sql`
        with friends as (
            select case when f.requester_id = ${viewerId} then f.receiver_id else f.requester_id end as mid, f.sport_category as sport
            from hiq_friendships f
            where f.status = 'accepted' and (f.requester_id = ${viewerId} or f.receiver_id = ${viewerId})
        ),
        coplay as (
            select h2.member_id as mid
            from hiq_game_history h1
            join hiq_game_history h2 on h2.member_id <> h1.member_id
                and ((h1.game_id is not null and h2.game_id = h1.game_id) or (h1.golf_session_id is not null and h2.golf_session_id = h1.golf_session_id))
            where h1.member_id = ${viewerId} and h1.created_at > now() - make_interval(days => ${PRESENCE_COPLAY_DAYS})
            union
            select p2.member_id
            from hiq_crew_activity_participants p1
            join hiq_crew_activities a on a.id = p1.activity_id and a.activity_date > now() - make_interval(days => ${PRESENCE_COPLAY_DAYS}) and a.activity_date < now() + interval '1 day'
            join hiq_crew_activity_participants p2 on p2.activity_id = p1.activity_id and p2.member_id <> p1.member_id and p2.status = 'joined'
            where p1.member_id = ${viewerId} and p1.status = 'joined'
        ),
        crew_mates as (
            select cm.member_id as mid, c.id as crew_id, c.name as crew_name, c.sport_category as sport
            from hiq_crew_members me
            join hiq_crew_members cm on cm.crew_id = me.crew_id and cm.member_id <> me.member_id and cm.role <> 'pending'
            join hiq_crews c on c.id = me.crew_id
            where me.member_id = ${viewerId} and me.role <> 'pending' and cm.member_id in (select mid from coplay)
        ),
        circle as (select mid from friends union select mid from crew_mates),
        arrivals as (
            select s.member_id, max(s.opened_at) as opened_at
            from hiq_app_sessions s
            where s.member_id in (select mid from circle) and s.member_id <> ${viewerId}
              and s.opened_at > ${since} and s.opened_at > now() - interval '15 minutes'
              and s.closed_at is null and s.last_seen_at > now() - interval '7 minutes'
            group by s.member_id
        )
        select a.member_id, a.opened_at, m.name, p.profile_image_url,
               (select sport from friends where mid = a.member_id limit 1) as friend_sport,
               cmx.crew_id, cmx.crew_name, cmx.sport as crew_sport
        from arrivals a
        join hiq_members m on m.id = a.member_id
        left join profiles p on p.id = m.profile_id
        left join lateral (select crew_id, crew_name, sport from crew_mates where mid = a.member_id limit 1) cmx on true
        left join hiq_presence_prefs pp on pp.member_id = a.member_id
        where coalesce(pp.share, true) = true and m.phone not like 'del-%'
        order by a.opened_at desc
        limit 10`));
    return rows.map((r) => {
        const friend = !!r.friend_sport;
        const sport = (friend ? r.friend_sport : r.crew_sport) === "GOLF" ? "GOLF" : "BILLIARDS";
        return {
            id: String(r.member_id),
            name: String(r.name ?? ""),
            avatar: r.profile_image_url ?? null,
            relation: friend ? "friend" : "crew",
            sport,
            crewId: friend ? null : (r.crew_id ? String(r.crew_id) : null),
            crewName: friend ? null : (r.crew_name ?? null),
            openedAt: new Date(r.opened_at).toISOString(),
        } as PresenceArrival;
    });
}
