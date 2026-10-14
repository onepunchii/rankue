/**
 * 어류 도감 · 금어기/금지체장 표 · 낚시 규칙 Q&A — 오너가 준 자료를 화면이 읽는 정적 파일로(2026-10-14).
 *
 *   npx tsx server/scripts/fishing-build-guides.ts [자료 폴더 — 기본 ~/Desktop/Antigravity/_content]
 *
 * 받는 것: out/fishing/fish_guides.json(374종 — 한국어 위키백과 CC BY-SA 4.0 를 주 자료로 다시 쓴 글) ·
 *         pipeline/fs_regs.json(수산자원관리법 시행령 별표 1·2) · out/fishing/fishing_rules_qa.json(74).
 * 내는 것: client/public/fishing/guide/ — index.json(목록) · g/<key>.json(한 종) · regs.json · rules.json.
 * 글은 받은 그대로 싣는다(다듬지 않는다 — 줄바꿈 · 공백만). **사진 주소는 버린다**(위키백과 파일마다 라이선스가 달라 확인 전에는 안 쓴다).
 * 출처(위키백과 문서 주소 · 라이선스)는 종마다 남긴다 — CC BY-SA 는 출처와 라이선스를 밝혀야 한다.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(process.argv[2] ?? join(homedir(), "Desktop/Antigravity/_content"));
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/public/fishing/guide");

interface RawGuide { id: string; name: string; intro: string; sections: { heading: string; body: string }[]; identification: string[]; faq: { q: string; a: string }[]; thin: boolean; sources: { name: string; title?: string; url?: string; license?: string | null }[] }
interface RawReg { group: string; nameKo: string; scientificName?: string; rule: string }
interface RawQa { slug: string; question: string; shortAnswer: string; body: string; needsReview: string[]; legal: string[]; articles: string[] }

// 받은 표의 오타 하나("센터미터")만 고친다 — 그 밖의 글은 그대로
const clean = (s: unknown): string => String(s ?? "").replace(/센터미터/g, "센티미터").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const keyOf = (id: string) => (/^\d+$/.test(id) ? id : `w${createHash("sha1").update(id).digest("hex").slice(0, 10)}`);
const https = (u: unknown) => (typeof u === "string" && /^https:\/\/[^\s]+$/.test(u) ? u : undefined);

const guides = JSON.parse(readFileSync(join(SRC, "out/fishing/fish_guides.json"), "utf8")) as RawGuide[];
const regsRaw = JSON.parse(readFileSync(join(SRC, "pipeline/fs_regs.json"), "utf8")) as Record<"closedSeason" | "minimumSize", { title: string; source: string; rows: RawReg[] }>;
const qa = JSON.parse(readFileSync(join(SRC, "out/fishing/fishing_rules_qa.json"), "utf8")) as RawQa[];

// 금어기 · 금지체장 — 종 이름으로 도감과 잇는다
const regs = (["closedSeason", "minimumSize"] as const).flatMap((k) => regsRaw[k].rows.map((r) => ({ kind: k === "closedSeason" ? "closed" : "min", group: clean(r.group), name: clean(r.nameKo), rule: clean(r.rule) })));
const regNames = new Set(regs.map((r) => r.name));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "g"), { recursive: true });
const keys = new Set<string>();
const index = guides.map((g) => {
    const key = keyOf(g.id);
    if (keys.has(key)) throw new Error(`겹친 키 ${key}`);
    keys.add(key);
    const one = {
        key, name: clean(g.name), intro: clean(g.intro),
        sections: g.sections.map((s) => ({ h: clean(s.heading), b: clean(s.body) })).filter((s) => s.h && s.b),
        id: g.identification.map(clean).filter(Boolean),
        faq: g.faq.map((f) => ({ q: clean(f.q), a: clean(f.a) })).filter((f) => f.q && f.a),
        thin: !!g.thin,
        sources: g.sources.map((s) => ({ name: clean(s.name), title: s.title ? clean(s.title) : undefined, url: https(s.url), license: s.license ? clean(s.license) : undefined })),
    };
    writeFileSync(join(OUT, "g", `${key}.json`), JSON.stringify(one));
    const first = one.intro.split(/(?<=다\.)\s/)[0] ?? one.intro;
    return { key, name: one.name, line: first.length > 70 ? `${first.slice(0, 68)}…` : first, thin: one.thin, reg: regNames.has(one.name) };
}).sort((a, b) => a.name.localeCompare(b.name, "ko"));
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
writeFileSync(join(OUT, "regs.json"), JSON.stringify({
    basis: "수산자원관리법 시행령 별표 1 · 2(2026년 6월 23일 개정본 기준)",
    titles: { closed: clean(regsRaw.closedSeason.title), min: clean(regsRaw.minimumSize.title) },
    rows: regs,
}));

// 규칙 Q&A — 낚시하는 사람의 것과 사업자의 것을 가른다(사업자 것은 접어 둔다)
const BUSINESS = /낚시터업|낚시어선업|신고확인증|출입항 신고|사고가 나면 어떻게 보고|안전운항|보험에 가입|원상회복|손실보상|수면 이용 협의|휴업이나 폐업|행위허가를 받는|관리 이용 규정|어떤 기준으로 지정|유해물질 허용기준|제조나 판매|2중 이상 자망|특정어구|방류명령|유해어법과 사용허가|과태료 부과 기준|교육과 홍보/;
const rules = qa.map((x) => ({ slug: clean(x.slug), q: clean(x.question), short: clean(x.shortAnswer), body: clean(x.body), review: x.needsReview.map(clean).filter(Boolean), laws: x.legal.map(clean), who: BUSINESS.test(x.question) ? "business" : "angler" }));
writeFileSync(join(OUT, "rules.json"), JSON.stringify(rules));

console.log(`도감 ${index.length}종(얇은 글 ${index.filter((x) => x.thin).length}) · 금어기/금지체장 ${regs.length}줄(도감과 이어진 종 ${index.filter((x) => x.reg).length}) · 규칙 ${rules.length}(낚시인 ${rules.filter((r) => r.who === "angler").length} · 사업자 ${rules.filter((r) => r.who === "business").length}) → ${OUT}`);
for (const r of rules.filter((r) => r.who === "angler")) console.log("  낚시인:", r.q);
