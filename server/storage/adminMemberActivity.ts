/**
 * 어드민 · 회원 한 명의 '활동 기록'(2026-10-12 오너: "일자별로 어떠한 클릭을 했고 활동을 했는지") — 규칙·글은 shared/memberActivity.
 *
 * 새로 모으는 것은 없다. 이미 남는 기록을 한 사람 기준으로 읽어 날짜로 접는다. 질의 넷(회원 확인 · 접속 · 발자국 · 그 밖의 기록)을 동시에 보낸다.
 * 회원 목록에 싣지 않고 창을 열 때만 부른다(storage/adminMemberGolf 와 같은 이유).
 *
 *  · **채팅은 건수만 센다 — 내용(message)은 읽지 않는다.** 댓글도 개수만.
 *  · 시각은 SQL 에서 한국 시각 글자로 바꿔 준다. 표들의 created_at 은 시간대 없는 UTC(+9시간), ui_events 만 timestamptz 다.
 *    raw SQL 로 Date 를 받으면 드라이버가 기기 시각으로 읽어 9시간 어긋난다(adminMemberGolf 머리말) — 글자로만 주고받는다.
 *  · 기간의 시작도 글자(UTC ISO)로 넣어 SQL 이 바꾼다.
 *  · 하루에 수십~수백 줄이 되는 것(온라인 연습 판·닫은 방·과제 시도·현장 인증·사진·댓글·채팅)은 SQL 에서 하루 한 줄로 접는다.
 *
 * 관리자 라우트(checkSuperAdmin, GET)만 부른다 — 보기 전용 관리자도 본다.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import {
    ACTIVITY_LIMITS, activityFromDay, activitySinceIso, buildMemberActivity,
    type ActivityDays, type ActivityRecordRow, type ActivitySessionRow, type ActivityTrailRow, type MemberActivity,
} from "../../shared/memberActivity.js";

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] })?.rows ?? []);
const FMT = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS'`);
/** 시간대 없는 UTC 칸 → 한국 시각 글자 */
const KST = (col: SQL) => sql`to_char(${col} + interval '9 hours', ${FMT})`;
/** 시간대 없는 UTC 칸 → 한국 날짜(하루로 접을 때) */
const KDAY = (col: SQL) => sql`(${col} + interval '9 hours')::date`;
const NT = sql.raw("null::text"), NI = sql.raw("null::int"), NB = sql.raw("null::boolean");

/** 그 밖의 기록 한 줄 — 모든 가지가 같은 칸 모양이어야 union 이 된다. 어느 칸이 무엇인지는 shared/memberActivity 의 RECORD */
const row = (kind: string, at: SQL, c: { a?: SQL; b?: SQL; c?: SQL; d?: SQL; n?: SQL; m?: SQL; f?: SQL; g?: SQL } = {}) => sql`
    select ${at} as at, ${sql.raw(`'${kind}'`)}::text as kind,
           (${c.a ?? NT})::text as a, (${c.b ?? NT})::text as b, (${c.c ?? NT})::text as c, (${c.d ?? NT})::text as d,
           (${c.n ?? NI})::int as n, (${c.m ?? NI})::int as m, (${c.f ?? NB})::boolean as f, (${c.g ?? NB})::boolean as g`;

/** 회원 한 명의 활동 기록. 없는 회원이면 null. */
export async function getMemberActivityForAdmin(memberId: string, days: ActivityDays, now: Date = new Date()): Promise<MemberActivity | null> {
    const sinceIso = activitySinceIso(now, days);
    const id = sql`${memberId}::uuid`;
    /** 기간의 시작 — 시간대 없는 UTC 칸과 견줄 값 */
    const since = sql`(${sinceIso}::timestamptz at time zone 'UTC')`;

    const records = [
        // 당구 경기·골프 라운드 기록 — 골프는 상대 칸에 골프장, d 에 코스, g 에 현장 인증
        sql`${row("game", KST(sql`h.created_at`), {
            a: sql`h.game_type`, b: sql`h.game_mode`,
            c: sql`case when h.sport_category = 'GOLF' then h.location_name else h.opponent_name end`,
            d: sql`case when h.sport_category = 'GOLF' then h.sub_type end`,
            n: sql`h.score`, m: sql`h.innings`, f: sql`h.is_winner`,
            g: sql`case when h.sport_category = 'GOLF' then (h.on_site is true) else h.is_ranked end`,
        })} from hiq_game_history h where h.member_id = ${id} and h.created_at >= ${since}`,
        // 온라인 연습 — 하루·종목별 한 줄(하루 수십 판, 대부분 치다 닫는다)
        sql`${row("sim", KST(sql`min(s.started_at)`), { a: sql`s.game_type`, n: sql`count(*)`, m: sql`count(*) filter (where s.status = 'finished')` })}
            from hiq_sim_sessions s where s.member_id = ${id} and s.started_at >= ${since} group by ${KDAY(sql`s.started_at`)}, s.game_type`,
        // 온라인 대전 — 끝난 판만 한 줄씩
        sql`${row("simMatch", KST(sql`coalesce(x.started_at, x.created_at)`), {
            a: sql`x.game_type`, b: sql`x.end_reason`, c: sql`o.name`,
            f: sql`case when x.winner_id is null then null else (x.winner_id = ${id}) end`, g: sql`(x.host_id = ${id})`,
        })} from hiq_sim_matches x
            left join hiq_members o on o.id = case when x.host_id = ${id} then x.guest_id else x.host_id end
            where (x.host_id = ${id} or x.guest_id = ${id}) and x.status = 'finished' and x.created_at >= ${since}`,
        // 만들었다가 닫은 방 — 하루 한 줄
        sql`${row("simRoom", KST(sql`min(x.created_at)`), { n: sql`count(*)` })}
            from hiq_sim_matches x where x.host_id = ${id} and x.status = 'canceled' and x.created_at >= ${since} group by ${KDAY(sql`x.created_at`)}`,
        // 이번 주 과제 — 하루 한 줄
        sql`${row("drill", KST(sql`min(d.created_at)`), { n: sql`count(*)`, m: sql`count(*) filter (where d.success)` })}
            from hiq_sim_drill_attempts d where d.member_id = ${id} and d.created_at >= ${since} group by ${KDAY(sql`d.created_at`)}`,
        // 골프 라운드 시작(방을 만든 사람)
        sql`${row("golfStart", KST(sql`g.created_at`), { a: sql`g.status`, c: sql`g.course_name` })}
            from golf_match_sessions g where g.host_id = ${id} and g.created_at >= ${since}`,
        // 조인·부킹 글
        sql`${row("golfPost", KST(sql`b.created_at`), { a: sql`b.listing_type`, c: sql`b.course_name`, f: sql`b.is_blinded` })}
            from golf_bookings b where b.owner_id = ${id} and b.created_at >= ${since}`,
        // 조인·부킹 신청 — 상태는 지금 값
        sql`${row("golfApply", KST(sql`r.created_at`), { a: sql`r.status`, c: sql`b.course_name` })}
            from golf_join_requests r join golf_bookings b on b.id = r.booking_id where r.member_id = ${id} and r.created_at >= ${since}`,
        // 관심 골프장
        sql`${row("golfWatch", KST(sql`w.created_at`), { c: sql`coalesce(p.name, w.slug)` })}
            from golf_course_watches w left join golf_course_pages p on p.slug = w.slug where w.member_id = ${id} and w.created_at >= ${since}`,
        // 현장 인증·라운드 사진 — 하루 한 줄
        sql`${row("golfCheckin", KST(sql`min(k.created_at)`), { n: sql`count(*)`, m: sql`count(*) filter (where k.verified)` })}
            from golf_round_checkins k where k.member_id = ${id} and k.created_at >= ${since} group by ${KDAY(sql`k.created_at`)}`,
        sql`${row("golfPhoto", KST(sql`min(ph.created_at)`), { n: sql`count(*)` })}
            from golf_round_photos ph where ph.member_id = ${id} and ph.created_at >= ${since} group by ${KDAY(sql`ph.created_at`)}`,
        // 커뮤니티 글(제목) · 댓글(하루 개수 — 내용은 읽지 않는다)
        sql`${row("post", KST(sql`cp.created_at`), { a: sql`cp.board`, c: sql`cp.title`, f: sql`cp.is_blinded` })}
            from hiq_community_posts cp where cp.author_id = ${id} and cp.created_at >= ${since}`,
        sql`${row("comment", KST(sql`min(cc.created_at)`), { n: sql`count(*)` })}
            from hiq_community_comments cc where cc.author_id = ${id} and cc.created_at >= ${since} group by ${KDAY(sql`cc.created_at`)}`,
        // 크루 글 · 크루 가입
        sql`${row("crewPost", KST(sql`wp.created_at`), { c: sql`wp.title` })}
            from hiq_crew_posts wp where wp.author_id = ${id} and wp.created_at >= ${since}`,
        sql`${row("crewJoin", KST(sql`cm.joined_at`), { c: sql`cr.name` })}
            from hiq_crew_members cm join hiq_crews cr on cr.id = cm.crew_id where cm.member_id = ${id} and cm.joined_at >= ${since}`,
        // 채팅 — (하루, 방 종류)별 **건수만**. message 칸은 고르지 않는다
        sql`${row("chat", KST(sql`min(ch.created_at)`), { a: sql`split_part(ch.room_key, ':', 1)`, n: sql`count(*)` })}
            from hiq_chat_messages ch where ch.sender_id = ${id} and ch.type <> 'system' and ch.created_at >= ${since}
            group by ${KDAY(sql`ch.created_at`)}, split_part(ch.room_key, ':', 1)`,
        // 친구(이 회원이 건 쪽) · 선수 팔로우 · 응원 글
        sql`${row("friend", KST(sql`fr.created_at`), { c: sql`fo.name` })}
            from hiq_friendships fr left join hiq_members fo on fo.id = fr.receiver_id where fr.requester_id = ${id} and fr.created_at >= ${since}`,
        sql`${row("follow", KST(sql`pf.created_at`), { a: sql`pf.category` })}
            from hiq_player_follows pf where pf.member_id = ${id} and pf.created_at >= ${since}`,
        sql`${row("cheer", KST(sql`pc.created_at`))}
            from hiq_player_cheers pc where pc.author_id = ${id} and pc.created_at >= ${since}`,
        // 신고 · 건의(건의는 프로필 id 로 남는다) · 가입
        sql`${row("report", KST(sql`rp.created_at`), { a: sql`rp.target_type` })}
            from hiq_reports rp where rp.reporter_id = ${id} and rp.created_at >= ${since}`,
        sql`${row("suggest", KST(sql`sg.created_at`), { a: sql`sg.type` })}
            from suggestions sg where sg.user_id = (select profile_id from hiq_members where id = ${id}) and sg.created_at >= ${since}`,
        sql`${row("signup", KST(sql`me.created_at`))}
            from hiq_members me where me.id = ${id} and me.created_at >= ${since}`,
    ];

    const [who, sessionRes, trailRes, recordRes] = await Promise.all([
        db.execute(sql`select 1 from hiq_members where id = ${id}`),
        db.execute(sql`
            select ${KST(sql`opened_at`)} as "open", ${KST(sql`coalesce(closed_at, last_seen_at)`)} as "end", platform
            from hiq_app_sessions where member_id = ${id} and opened_at >= ${since}
            order by opened_at desc limit ${ACTIVITY_LIMITS.sessions}`),
        // 발자국 — 로그인한 채 웹에서 쓴 것만 회원 id 가 붙는다(앱 안은 모으지 않는다). 스크롤 깊이는 읽지 않는다
        db.execute(sql`
            select to_char(created_at at time zone 'Asia/Seoul', ${FMT}) as at, name, path,
                   meta->>'l' as l, meta->>'h' as h, meta->>'ref' as ref
            from ui_events where member_id = ${id} and created_at >= ${sinceIso}::timestamptz and name in ('page', 'click', 'open')
            order by created_at desc, id desc limit ${ACTIVITY_LIMITS.trail}`),
        db.execute(sql`select * from (${sql.join(records, sql` union all `)}) e order by e.at desc limit ${ACTIVITY_LIMITS.records}`),
    ]);
    if (rowsOf(who).length === 0) return null;

    return buildMemberActivity({
        days, from: activityFromDay(sinceIso),
        sessions: rowsOf<ActivitySessionRow>(sessionRes),
        // 최근부터 읽었다 — 같은 초의 줄(화면 → 누름)이 남긴 순서대로 보이게 뒤집는다
        trail: rowsOf<ActivityTrailRow>(trailRes).reverse(),
        records: rowsOf<ActivityRecordRow>(recordRes).reverse(),
    });
}
