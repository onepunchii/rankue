/** UMB 아카이브 점검(읽기만): 사이트에 올라온 회차와 우리 DB 적재 여부를 견준다. `npx tsx scripts/umb-archive-check.ts` */
import "dotenv/config";
import { fetchArchive } from "../server/services/umbService";
import { storage } from "../server/storage/index";
const entries = await fetchArchive();
console.log("아카이브에서 읽은 회차 수:", entries.length);
const byCat = new Map<string, typeof entries>();
for (const e of entries) { if (!byCat.has(e.category)) byCat.set(e.category, [] as any); (byCat.get(e.category) as any).push(e); }
for (const [cat, list] of byCat) {
  list.sort((a, b) => b.editionDate.getTime() - a.editionDate.getTime());
  console.log(`\n[${cat}] 최신 5개`);
  for (const e of list.slice(0, 5)) {
    const has = await storage.umb.hasEdition(e.category, e.edition);
    console.log(`  ${e.editionDate.toISOString().slice(0, 10)}  ${has ? "적재됨" : "미적재 ←"}  ${e.pdfUrl.slice(-60)}`);
  }
}
process.exit(0);
