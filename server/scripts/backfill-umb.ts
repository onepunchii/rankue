// UMB 세계랭킹 과거 회차 전체 백필 — 로컬에서 1회 실행.
//   DATABASE_URL=<unpooled> npx tsx server/scripts/backfill-umb.ts
// 아카이브의 모든 회차(부문 3개 × ~50회차)를 오래된 것부터 적재한다.
// 이미 저장된 회차는 건너뛰므로 중단 후 재실행해도 안전하다.
import { syncUmbRankings } from "../services/umbSync.js";

async function main() {
    const started = Date.now();
    const result = await syncUmbRankings({ maxPerCategory: Infinity, delayMs: 400 });
    console.log(`아카이브 항목: ${result.checked}`);
    console.log(`적재: ${result.ingested.length}회차`);
    for (const i of result.ingested) console.log(`  ✓ ${i.category} ${i.edition} (${i.rows}명)`);
    if (result.errors.length) {
        console.log(`실패: ${result.errors.length}건`);
        for (const e of result.errors) console.log(`  ✗ ${e.category} ${e.edition}: ${e.error}`);
    }
    console.log(`소요: ${Math.round((Date.now() - started) / 1000)}초`);
    process.exit(result.errors.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
