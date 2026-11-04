/**
 * 물때 지점 목록 만들기(2026-11-04 — shared/fishingTidePoints) → server/assets/fishing/tide-points.json.
 *
 * 국립해양조사원 조석예보(고, 저조) API 는 지점 목록을 주지 않는다 — 코드(SO_0001 …)를 차례로 물어 답이 오는 곳을 모은다.
 * 초당 요청 수를 막으므로 한 번에 하나씩 0.35초 사이를 둔다(1,600곳이면 10분 남짓). 운영의 항구 브리핑과 키를 같이 쓴다 — 밤에 돌릴 것.
 *
 *   npx tsx server/scripts/fishing-tide-points.ts --scan 1600          훑고 쓴다
 *   npx tsx server/scripts/fishing-tide-points.ts --from <훑은 json>   이미 훑은 것([{code,name,lat,lng}])으로 쓴다
 *
 * 거르는 것: 항구 쉰한 곳(shared/fishingStations)과 같은 이름 · 밑줄 이름(옛 관측소 '_구' · 기준점 '_기점') · 좌표가 없거나 나라 밖. 이름이 겹치면 가까운 항구 이름을 붙인다.
 * 지점마다 가장 가까운 항구(그 항구의 바다가 이 지점의 바다)와 거리를 적는다.
 */
import fs from "node:fs";
import path from "node:path";
import { FISHING_PORTS } from "../../shared/fishingStations.js";
import type { TidePointDef } from "../../shared/fishingTidePoints.js";

const args = process.argv.slice(2);
const flag = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.join(process.cwd(), "server/assets/fishing/tide-points.json");
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);

type Raw = { code: string; name: string; lat: number; lng: number };

async function scan(max: number): Promise<Raw[]> {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) throw new Error("DATA_GO_KR_KEY 가 없다");
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replace(/-/g, "");
    const out: Raw[] = [];
    for (let i = 1; i <= max; i++) {
        const code = `SO_${String(i).padStart(4, "0")}`;
        for (let t = 0; t < 6; t++) {
            const u = new URL("https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService");
            for (const [k, v] of Object.entries({ type: "json", obsCode: code, reqDate: day, numOfRows: "10", pageNo: "1" })) u.searchParams.set(k, v);
            const j: any = await fetch(`${u}&serviceKey=${/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
            const rc = j?.header?.resultCode;
            if (rc === "00") { const it = [].concat(j.body?.items?.item ?? []) as any[]; if (it[0]) out.push({ code, name: String(it[0].obsvtrNm), lat: Number(it[0].lat), lng: Number(it[0].lot) }); break; }
            if (rc) break;                                   // 없는 코드(10) · 자료 없음(03)
            await new Promise((r) => setTimeout(r, 2500));   // 초당 제한 — 쉬었다 다시
        }
        await new Promise((r) => setTimeout(r, 350));
        if (i % 100 === 0) console.log(code, "모은 곳", out.length);
    }
    return out;
}

export function buildPoints(raw: readonly Raw[]): TidePointDef[] {
    const portNames = new Set(FISHING_PORTS.map((p) => p.name));
    const seen = new Set<string>();
    const kept = raw.filter((r) => {
        if (seen.has(r.code)) return false;
        seen.add(r.code);
        const name = r.name.normalize("NFC").trim();
        // '_구'(옛 관측소) · '_기점'(기준점) 같은 밑줄 이름은 장소가 아니다
        return name && !name.includes("_") && !portNames.has(name) && Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.lat > 32 && r.lat < 39 && r.lng > 124 && r.lng < 132;
    }).map((r) => {
        const near = FISHING_PORTS.map((p) => ({ p, d: km(r, p) })).sort((a, b) => a.d - b.d)[0];
        return { code: r.code, name: r.name.normalize("NFC").trim(), lat: Math.round(r.lat * 1e5) / 1e5, lng: Math.round(r.lng * 1e5) / 1e5, area: near.p.area, port: { code: near.p.code, name: near.p.name, km: Math.round(near.d) } };
    });
    // 같은 이름이 둘 이상이면 가까운 항구 이름을 붙인다(주소가 지점 이름이라 겹치면 안 된다)
    const count = new Map<string, number>();
    for (const p of kept) count.set(p.name, (count.get(p.name) ?? 0) + 1);
    const out = kept.map((p) => (count.get(p.name)! > 1 ? { ...p, name: `${p.name}(${p.port.name})` } : p));
    const names = new Set<string>();
    return out.filter((p) => (names.has(p.name) ? false : (names.add(p.name), true))).sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

async function main() {
    const from = flag("--from");
    const raw: Raw[] = from ? JSON.parse(fs.readFileSync(from, "utf8")) : await scan(Number(flag("--scan") ?? 1600));
    const pts = buildPoints(raw);
    fs.writeFileSync(OUT, JSON.stringify(pts, null, 0) + "\n");
    console.log(`물때 지점 ${pts.length}곳 → ${path.relative(process.cwd(), OUT)} (받은 ${raw.length}곳)`);
}
if (process.argv[1] && /fishing-tide-points\.ts$/.test(process.argv[1])) void main();
