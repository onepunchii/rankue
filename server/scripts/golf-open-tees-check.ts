/**
 * 남은 티를 받는 곳 점검(2026-10-13) — shared/golfOpenTee 의 목록을 하나씩 받아 보고 줄 수를 센다. 아무것도 쓰지 않는다.
 *
 *   npx tsx server/scripts/golf-open-tees-check.ts [<며칠 뒤, 기본 3>]
 *
 * 한 곳에 요청 둘(robots.txt · 그 날의 시간표). 목록에 새 곳을 넣기 전, 그리고 받는 값이 이상해 보일 때 돌린다.
 */
import { GOLF_TEE_SOURCES, golfResRequest, kstDay, parseGolfResTimes } from "../../shared/golfOpenTee";
import { fetchOpenTees, robotsAllows } from "../services/golfOpenTeeFetch";

async function main() {
    const day = kstDay(Date.now(), Number(process.argv[2] ?? 3));
    let ok = 0;
    for (const s of GOLF_TEE_SOURCES) {
        const path = new URL(golfResRequest(s, day).url).pathname;
        const allowed = await robotsAllows(s.origin, path);
        if (!allowed) { console.log("✗ robots 가 막음 |", s.slug); continue; }
        const r = await fetchOpenTees(s, day);
        if (!r.ok) { console.log("✗", r.note, "|", s.slug); continue; }
        ok++;
        const first = r.tees[0];
        console.log(`✓ ${s.slug} | ${day} 남은 티 ${r.tees.length}${first ? ` | ${first.time} ${first.course} ${first.holes ?? "?"}홀 ${first.listPrice ?? "-"} → ${first.price ?? "-"}` : ""}`);
    }
    console.log(`받아진 곳 ${ok} / ${GOLF_TEE_SOURCES.length}`);
    void parseGolfResTimes;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
