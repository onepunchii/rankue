/**
 * 매일 한 편 — 샷 고르기 → facts → render → 유튜브 업로드 → 댓글. GitHub Actions(daily-shorts.yml)가 부른다.
 *
 *   npx tsx scripts/shorts/daily.ts [--channel main|vn] [--dry] [--private] [--days 3]
 *     --channel  main = 본 채널(@rrankue, 영어 화면) · vn = 베트남 채널(@rankue_vn, 베트남어 화면). 채널마다 올린 샷을 따로 센다
 *     --dry      영상까지만 만들고 올리지 않는다
 *     --private  비공개로 올린다(시험용, 댓글 생략)
 *
 * 고르는 법(3쿠션 · 공개 방 · 끝난 경기의 득점 샷, 채널에 이미 올린 샷은 제외):
 *   1) 최근 --days 일 안의 샷 중 쿠션 MIN_RECENT 이상 → 쿠션 많은 순, 같으면 경기 점수(score.ts — 레이팅 높고 비슷한 대결) 순
 *   2) 없으면 지금까지 쌓인 전체에서 같은 기준(쿠션 MIN_BACKLOG 이상)
 * 고른 샷이 재시뮬 해시가 안 맞으면(엔진이 바뀐 옛 샷) 다음 후보로 넘어간다.
 */
import { readOnlyDb } from "./db";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { matchScore } from "./score";
import { accessToken, assertRankueChannel, postedShots, uploadVideo, postComment, CHANNELS, type ChannelKey } from "./youtube";
import { buildMeta, commentText } from "./meta";

const dry = process.argv.includes("--dry");
const chArg = process.argv.indexOf("--channel");
const channel = (chArg > 0 ? process.argv[chArg + 1] : "main") as ChannelKey;
if (!CHANNELS[channel]) throw new Error(`모르는 채널: ${channel}`);
const lang = CHANNELS[channel].lang;
const privateRun = process.argv.includes("--private");
const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 3;
const MIN_RECENT = 5;
const MIN_BACKLOG = 4;

// ── 채널에 이미 올린 샷 ────────────────────────────────
const token = dry ? null : await accessToken(channel);
const uploads = token ? await assertRankueChannel(token, channel) : null;
const posted = token && uploads ? await postedShots(token, uploads) : new Set<string>();
console.log(`채널에 올린 샷 ${posted.size}개`);

// ── 후보 ─────────────────────────────────────────────
const db = await readOnlyDb();
const rows = (await db.query(`
  with m as (
    select m.id, m.last_shot_at, coalesce(ra.rating, 1000) ra, coalesce(rb.rating, 1000) rb,
      (select coalesce(sum(points) filter (where player_index = 0), 0) from hiq_sim_match_shots x where x.match_id = m.id) a,
      (select coalesce(sum(points) filter (where player_index = 1), 0) from hiq_sim_match_shots x where x.match_id = m.id) b
    from hiq_sim_matches m
    left join hiq_sim_match_ratings ra on ra.member_id = m.host_id and ra.game_type = m.game_type
    left join hiq_sim_match_ratings rb on rb.member_id = m.guest_id and rb.game_type = m.game_type
    where m.status = 'finished' and m.is_public and m.guest_id is not null and m.game_type = '3c'
  )
  select s.match_id, s.idx, s.cushions, s.created_at, m.ra, m.rb, m.a, m.b
  from hiq_sim_match_shots s join m on m.id = s.match_id
  where s.points > 0 and s.cushions >= $1`, [MIN_BACKLOG])).rows;
await db.end();

const since = Date.now() - DAYS * 86400_000;
const ranked = rows
    .filter((r) => !posted.has(`${r.match_id}#${r.idx}`))
    .map((r) => ({ ...r, recent: new Date(r.created_at).getTime() >= since && r.cushions >= MIN_RECENT, ms: matchScore(r.ra, r.rb, Number(r.a), Number(r.b)) }))
    .sort((x, y) => Number(y.recent) - Number(x.recent) || y.cushions - x.cushions || y.ms - x.ms);
if (!ranked.length) { console.log("올릴 샷이 없다 — 끝"); process.exit(0); }

// ── 만들기 ────────────────────────────────────────────
const run = (script: string, args: string[]) => execFileSync("npx", ["tsx", script, ...args], { stdio: "inherit", env: process.env });
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
let pick: (typeof ranked)[number] | null = null;
let slug = "";
for (const c of ranked.slice(0, 5)) {
    slug = `${today}-${c.match_id.slice(0, 8)}-${c.idx}${channel === "main" ? "" : `-${channel}`}`;
    console.log(`\n▶ 후보 ${c.match_id}#${c.idx} · ${c.cushions}쿠션 · ${c.recent ? "최근" : "지난 경기"} · 경기 점수 ${Math.round(c.ms)}`);
    try { run("scripts/shorts/facts.ts", [c.match_id, String(c.idx), slug]); pick = c; break; }
    catch { console.warn("  facts 실패(재시뮬 불일치 등) — 다음 후보"); }
}
if (!pick) throw new Error("후보 5개 모두 실패");
run("scripts/shorts/render.ts", [slug, "--lang", lang]);

const dir = `scripts/shorts/out/${slug}`;
const facts = JSON.parse(readFileSync(`${dir}/facts.json`, "utf8"));
const meta = buildMeta(facts, pick.match_id, pick.idx, lang);
writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 2));
console.log(`\n제목: ${meta.title}`);
if (dry || !token) { console.log(`--dry: 올리지 않음 → ${dir}/output.mp4`); process.exit(0); }

// ── 올리기 · 댓글 ──────────────────────────────────────
const videoId = await uploadVideo(token, `${dir}/output.mp4`, meta, privateRun ? "private" : "public");
console.log(`✓ 업로드 https://youtube.com/shorts/${videoId} (${privateRun ? "비공개" : "공개"})`);
if (!privateRun) {
    // 막 올린 영상은 댓글이 바로 안 붙을 때가 있어 몇 번 기다렸다 다시 해 본다
    for (let i = 0; i < 6; i++) {
        try { await postComment(token, videoId, commentText(facts, lang), channel); console.log("✓ 댓글"); break; }
        catch (e) { if (i === 5) console.warn(`댓글 실패(영상은 올라감): ${(e as Error).message}`); else await new Promise((r) => setTimeout(r, 20_000)); }
    }
}
writeFileSync(`${dir}/upload.json`, JSON.stringify({ videoId, matchId: pick.match_id, idx: pick.idx, at: new Date().toISOString() }, null, 2));
