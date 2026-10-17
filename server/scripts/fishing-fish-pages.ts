/**
 * 낚시 어종 공개 페이지의 검색용 글 — 오너가 준 도감 · 금어기 표(client/public/fishing/guide)에서 우리 22종 몫만 서버 자산으로 옮긴다(2026-10-18).
 *
 *   npx tsx server/scripts/fishing-fish-pages.ts
 *
 * 왜 따로: 화면은 정적 파일을 받아 읽지만, 서버리스 함수에는 client/public 이 실리지 않는다(vercel.json includeFiles 는 server/assets/**).
 * 글은 받은 그대로(고치지 않는다). 도감 글은 위키백과 CC BY-SA 를 다시 쓴 것 — 출처 · 라이선스를 같이 옮긴다. 사진은 옮기지 않는다(화면만 쓴다).
 * 도감 · 금어기 표를 다시 만들었으면(server/scripts/fishing-build-guides.ts) 이것도 다시 돌린다 — shared/fishingFishPages.test 가 어긋남을 잡는다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FISH } from "../../shared/fishingFish.js";
import { FISH_GUIDE_NAME, FISH_REG_NAMES } from "../../shared/fishingFishInfo.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const G = join(ROOT, "client/public/fishing/guide");
const read = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const index = read<{ key: string; name: string }[]>(join(G, "index.json"));
const regs = read<{ basis: string; titles: Record<string, string>; rows: { kind: string; group: string; name: string; rule: string }[] }>(join(G, "regs.json"));

const fish: Record<string, unknown> = {};
for (const f of FISH) {
    const gname = FISH_GUIDE_NAME[f.id];
    const key = gname ? index.find((g) => g.name === gname)?.key ?? null : null;
    const g = key ? read<{ key: string; name: string; intro: string; sections: { h: string; b: string }[]; sources: unknown[] }>(join(G, "g", `${key}.json`)) : null;
    const names = FISH_REG_NAMES[f.id] ?? [];
    fish[f.id] = {
        guide: g ? { key: g.key, name: g.name, intro: g.intro, sections: g.sections, sources: g.sources } : null,
        regs: regs.rows.filter((r) => names.includes(r.name)),
    };
}
const out = join(ROOT, "server/assets/fishing/fish-pages.json");
writeFileSync(out, JSON.stringify({ basis: regs.basis, fish }) + "\n");
console.log(`fish-pages.json — ${Object.keys(fish).length}종 · 도감 ${Object.values(fish).filter((x: any) => x.guide).length} · 금어기 줄 ${Object.values(fish).reduce((a: number, x: any) => a + x.regs.length, 0)}`);
