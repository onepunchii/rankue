/**
 * 남은 티 받기 — 바깥으로 나가는 요청만 모은 곳(DB 를 모른다). 규칙과 목록은 shared/golfOpenTee.
 *
 * 지키는 것: robots.txt 가 막은 길은 부르지 않는다 · 쿠키 · 로그인 없이 공개 요청 한 번 · 한 요청은 4초까지만 기다린다 ·
 *            답이 로그인 화면이거나 표가 없으면 '못 받음'으로 둔다(빈 표와 구별한다 — 못 받은 날의 줄을 지우지 않으려고).
 */
import { parseTees, teeRequests, type OpenTee, type TeeSource } from "../../shared/golfOpenTee.js";

const UA = "Mozilla/5.0 (compatible; RankueBot/1.0; +https://www.rankue.co.kr/support)";
const robotsCache = new Map<string, { at: number; rules: string[] }>();
const ROBOTS_TTL_MS = 6 * 3_600_000;

/** robots.txt 의 User-agent: * 묶음이 이 길을 막는가. 파일이 없거나 못 읽으면 막지 않은 것으로 본다 */
export async function robotsAllows(origin: string, path: string): Promise<boolean> {
    let hit = robotsCache.get(origin);
    if (!hit || Date.now() - hit.at > ROBOTS_TTL_MS) {
        const rules: string[] = [];
        try {
            const r = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(3000), redirect: "follow" });
            const t = r.ok ? await r.text() : "";
            if (t && !/<html/i.test(t.slice(0, 300))) {
                let on = false;
                for (const raw of t.split(/\r?\n/)) {
                    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, "").trim());
                    if (!m) continue;
                    const k = m[1].toLowerCase(), v = m[2].trim();
                    if (k === "user-agent") on = v === "*";
                    else if (on && k === "disallow" && v) rules.push(v.replace(/\*.*$/, ""));
                }
            }
        } catch { /* 못 읽으면 규칙 없음 */ }
        hit = { at: Date.now(), rules };
        robotsCache.set(origin, hit);
    }
    return !hit.rules.some((r) => r !== "" && path.startsWith(r));
}

export type TeeFetch = { ok: true; tees: OpenTee[] } | { ok: false; note: string };

/** 그 골프장 · 그 날의 남은 티 — 틀이 정한 요청(대부분 하나)을 차례로 보내 합친다. 하나라도 못 받으면 못 받은 것으로 둔다 */
export async function fetchOpenTees(s: TeeSource, day: string, timeoutMs = 4000): Promise<TeeFetch> {
    try {
        const all: OpenTee[] = [];
        for (const rq of teeRequests(s, day)) {
            const r = await fetch(rq.url, { method: rq.method, headers: { ...rq.headers, "user-agent": UA }, body: rq.body, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
            if (r.status !== 200) return { ok: false, note: `답 ${r.status}` };
            const buf = Buffer.from(await r.arrayBuffer());
            // golfres 틀은 EUC-KR 로 답한다(머리글에 적혀 있다). 그 밖은 머리글이 EUC-KR 이라고 할 때만
            const ct = r.headers.get("content-type") ?? "";
            const euc = /euc-kr|ks_c_5601/i.test(ct) || (s.family === "golfres" && !/utf-?8/i.test(ct));
            const text = new TextDecoder(euc ? "euc-kr" : "utf-8").decode(buf);
            // 못 읽으면 못 받은 것(로그인 화면 · 점검 화면 · 틀이 바뀜) — '남은 티 없음'과 다르다
            const tees = parseTees(s, text, day);
            if (!tees) return { ok: false, note: /로그인/.test(text.slice(0, 4000)) ? "로그인 화면" : "표 없음" };
            all.push(...tees);
        }
        const seen = new Set<string>();
        return { ok: true, tees: all.filter((t) => { const k = `${t.time}|${t.course}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "ko")) };
    } catch (e) {
        return { ok: false, note: `못 받음: ${String((e as Error)?.message ?? e).slice(0, 40)}` };
    }
}
