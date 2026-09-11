/**
 * 옛 건의 답장 이관(일회성, 2026-09-11).
 *
 * suggestion_replies 가 생기기 전 답장은 회원 알림(hiq_notifications type 'suggestion_reply')으로만 남아,
 * 어느 건의에 대한 답인지 기록이 없다. 알림 → 받은 회원의 프로필 → 그 프로필이 알림보다 **먼저** 쓴 건의 중
 * 가장 최근 것에 짝짓는다(lib/suggestionBox matchReplyToSuggestion). 짝이 없거나 애매하면 건너뛴다.
 *
 *   npx tsx scripts/backfill-suggestion-replies.ts           # 미리보기(기본) — 아무것도 쓰지 않는다
 *   npx tsx scripts/backfill-suggestion-replies.ts --apply   # 실제로 넣는다(한 트랜잭션)
 *
 * 여러 번 돌려도 같다: 같은 (건의, 내용, 시각) 답장이 이미 있으면 넣지 않는다. 답장 시각은 알림 시각 그대로,
 * 보낸 운영자(admin_profile_id)는 알 수 없어 비워 둔다.
 * params.suggestionId 가 실린 알림은 새 답장 경로(admin.ts reply)가 이미 suggestion_replies 에 적은 것이라 보지 않는다.
 *
 * 배포 직후 한 번 더 돌린다(미리보기 → --apply). 테이블·이관은 배포 전에 적용했으므로, 배포 전까지 옛 코드로 보낸
 * 답장은 suggestionId 없이 알림에만 남는다. 다시 돌려도 이미 넣은 것은 건너뛰니 안전하다.
 *
 * server/db.ts 를 쓰지 않는다 — 그쪽은 접속 문자열 앞부분을 로그로 찍는다. 시각은 DB 에서 epoch 로 뽑아 비교한다
 * (timestamp without time zone 을 JS Date 로 읽으면 이 프로세스의 시간대로 해석된다).
 */
import dotenv from "dotenv";
dotenv.config({ quiet: true });
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { matchReplyToSuggestion, suggestionPreview, SUGGESTION_REPLY_TYPE } from "../server/lib/suggestionBox.js";

neonConfig.webSocketConstructor = ws;
const APPLY = process.argv.includes("--apply");

type NoteRow = { id: string; body: string; profile_id: string | null; sent_at: number; sent_at_text: string };
type SuggRow = { id: string; user_id: string; type: string; content: string; created_at: number; created_at_text: string };
type Planned = { note: NoteRow; sugg: SuggRow; exists: boolean };

async function main() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 이 없습니다(.env)");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const hasTable = !!(await pool.query(`SELECT to_regclass('public.suggestion_replies') IS NOT NULL AS ok`)).rows[0]?.ok;
        if (APPLY && !hasTable) throw new Error("suggestion_replies 테이블이 없습니다 — migrations/suggestion_replies.sql 을 먼저 적용하세요");

        const notes: NoteRow[] = (await pool.query(`
            SELECT n.id, n.body, m.profile_id,
                   (extract(epoch FROM n.created_at) * 1000)::float8 AS sent_at,
                   n.created_at::text AS sent_at_text
              FROM hiq_notifications n
              LEFT JOIN hiq_members m ON m.id = n.member_id
             WHERE n.type = $1 AND (n.params IS NULL OR n.params->>'suggestionId' IS NULL)
             ORDER BY n.created_at`, [SUGGESTION_REPLY_TYPE])).rows;
        const suggs: SuggRow[] = (await pool.query(`
            SELECT id, user_id, type, content,
                   (extract(epoch FROM created_at) * 1000)::float8 AS created_at,
                   created_at::text AS created_at_text
              FROM suggestions
             WHERE user_id IS NOT NULL`)).rows;
        const existing = new Set<string>(hasTable
            ? (await pool.query(`SELECT suggestion_id, message, created_at::text AS t FROM suggestion_replies`)).rows
                .map((r: any) => `${r.suggestion_id}|${r.t}|${r.message}`)
            : []);

        const byProfile = new Map<string, SuggRow[]>();
        for (const s of suggs) byProfile.set(s.user_id, [...(byProfile.get(s.user_id) ?? []), s]);
        const suggById = new Map(suggs.map((s) => [s.id, s]));

        const planned: Planned[] = [];
        const noProfile: NoteRow[] = [];
        const unmatched: NoteRow[] = [];
        const ambiguous: { note: NoteRow; ids: string[] }[] = [];
        for (const note of notes) {
            if (!note.profile_id) { noProfile.push(note); continue; }
            const r = matchReplyToSuggestion(note.sent_at, (byProfile.get(note.profile_id) ?? []).map((s) => ({ id: s.id, createdAt: s.created_at })));
            if (r.kind === "unmatched") unmatched.push(note);
            else if (r.kind === "ambiguous") ambiguous.push({ note, ids: r.suggestionIds });
            else {
                const sugg = suggById.get(r.suggestionId)!;
                planned.push({ note, sugg, exists: existing.has(`${sugg.id}|${note.sent_at_text}|${note.body}`) });
            }
        }

        const toInsert = planned.filter((p) => !p.exists);
        const perSuggestion = new Map<string, number>();
        for (const p of planned) perSuggestion.set(p.sugg.id, (perSuggestion.get(p.sugg.id) ?? 0) + 1);
        const hours = (p: Planned) => ((p.note.sent_at - p.sugg.created_at) / 3_600_000).toFixed(1);

        console.log(`[${APPLY ? "적용" : "미리보기"}] 옛 답장 알림 ${notes.length}건 (params.suggestionId 없는 '${SUGGESTION_REPLY_TYPE}')`);
        console.log(`  짝지음 ${planned.length}건 → 새로 넣을 것 ${toInsert.length}, 이미 있음 ${planned.length - toInsert.length}`);
        console.log(`  건너뜀: 회원-프로필 연결 없음 ${noProfile.length}, 먼저 쓴 건의 없음 ${unmatched.length}, 애매(같은 시각 건의 여럿) ${ambiguous.length}`);
        console.log(`  답장이 둘 이상 붙는 건의 ${[...perSuggestion.values()].filter((n) => n > 1).length}개, 건의→답장 최장 간격 ${planned.length ? Math.max(...planned.map((p) => Number(hours(p)))) : 0}시간`);
        console.log(`  예시(최대 ${Math.min(planned.length, 12)}건):`);
        for (const p of planned.slice(0, 12)) {
            console.log(`   - 답장 ${p.note.sent_at_text.slice(0, 16)} "${suggestionPreview(p.note.body, 30)}"`);
            console.log(`     ← 건의 ${p.sugg.created_at_text.slice(0, 16)} [${p.sugg.type}] "${suggestionPreview(p.sugg.content, 30)}" (+${hours(p)}h)${p.exists ? " · 이미 있음" : ""}`);
        }
        for (const n of [...noProfile, ...unmatched]) console.log(`   · 건너뜀 ${n.sent_at_text.slice(0, 16)} "${suggestionPreview(n.body, 30)}"`);
        for (const a of ambiguous) console.log(`   · 애매 ${a.note.sent_at_text.slice(0, 16)} 후보 ${a.ids.length}개`);

        if (!APPLY) {
            console.log(hasTable ? "\n미리보기만 했습니다. 넣으려면 --apply" : "\n미리보기만 했습니다(suggestion_replies 테이블 아직 없음).");
            return;
        }

        const client = await pool.connect();
        let inserted = 0;
        try {
            await client.query("BEGIN");
            for (const p of toInsert) {
                // 시각·내용은 알림 행에서 SQL 로 그대로 옮긴다 — JS 를 거치며 시간대·정밀도가 바뀌지 않게.
                const r = await client.query(`
                    INSERT INTO suggestion_replies (suggestion_id, message, created_at)
                    SELECT $1::uuid, n.body, n.created_at FROM hiq_notifications n
                     WHERE n.id = $2::uuid
                       AND NOT EXISTS (SELECT 1 FROM suggestion_replies r
                                        WHERE r.suggestion_id = $1::uuid AND r.message = n.body AND r.created_at = n.created_at)`,
                    [p.sugg.id, p.note.id]);
                inserted += r.rowCount ?? 0;
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
        console.log(`\n넣었습니다: ${inserted}건`);
    } finally {
        await pool.end();
    }
}

main().catch((e) => {
    console.error("실패:", e instanceof Error ? e.message : e);
    process.exit(1);
});
