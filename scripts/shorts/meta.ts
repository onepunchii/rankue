/**
 * 「이게 들어가?」 쇼츠의 제목 · 설명 · 태그 · 댓글(순수).
 *  - 제목 · 설명: 기본 한국어 + 영어 · 스페인어 · 베트남어 · 터키어 번역(앱 i18n 과 같은 언어). 화면 글자가 영어라
 *    어느 나라 시청자든 제목 · 설명만 자기 말로 보면 된다.
 *  - 댓글: 사주 채널처럼 영상 내용을 글로 풀어 준다(샷 해부) + 참여 질문 + 스토어 링크. 한국어 · 영어 한 댓글.
 *  - 링크마다 캠페인 표시(App Store ct · Play referrer)를 달아 어느 경로로 설치했는지 본다.
 *
 * 설명 끝줄 "Shot ID: <matchId>#<idx>" 는 중복 업로드 방지 기록이다(youtube.ts) — 지우지 말 것.
 */
import type { VideoMeta } from "./youtube";

const IOS = "https://apps.apple.com/app/id6760333313";
const ANDROID = "https://play.google.com/store/apps/details?id=com.rankue.app";

export function storeLinks(campaign: string) {
    return {
        ios: `${IOS}?ct=yt_${campaign}`,
        android: `${ANDROID}&referrer=${encodeURIComponent(`utm_source=youtube&utm_medium=shorts&utm_campaign=${campaign}`)}`,
    };
}

export interface ShotFacts {
    when: { iso: string; label: string };
    game: { table: string; tableId: string };
    situation: { inning: number; scoreBefore: { shooter: number; other: number }; target: number };
    shot: { cushionsBeforeSecond: number; cuePowerPct: number; tipSide: number; tipHeight: number };
    timeline: { kind: "cushion" | "contact"; n: number; ball?: string; cushion?: string }[];
    miracle: { trials: number; hits: number };
}

const BALL = { ko: { red: "빨간 공", yellow: "노란 공", white: "흰 공" }, en: { red: "red", yellow: "yellow", white: "white" } } as const;
// 테이블 좌표: left/right(x=0, x=폭) 가 긴 쿠션, top/bottom 이 짧은 쿠션
const RAIL = { ko: (c: string) => (c === "left" || c === "right" ? "장" : "단"), en: (c: string) => (c === "left" || c === "right" ? "L" : "S") };

function describe(f: ShotFacts) {
    const n = f.shot.cushionsBeforeSecond;
    const { trials, hits } = f.miracle;
    const pct = (hits / trials * 100).toFixed(1);
    const first = f.timeline.find((x) => x.kind === "contact" && x.n === 1)?.ball ?? "red";
    const second = f.timeline.find((x) => x.kind === "contact" && x.n === 2)?.ball ?? "yellow";
    const rails = f.timeline.filter((x) => x.kind === "cushion").map((x) => x.cushion ?? "");
    const side = f.shot.tipSide > 0.08 ? 1 : f.shot.tipSide < -0.08 ? -1 : 0;
    const vert = f.shot.tipHeight > 0.15 ? 1 : f.shot.tipHeight < -0.15 ? -1 : 0;
    const k = new Date(new Date(f.when.iso).getTime() + 9 * 3600_000);
    const enDate = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][k.getUTCMonth()]} ${k.getUTCDate()}`;
    const sb = f.situation.scoreBefore;
    return {
        n, hits, trials, pct, rare: hits / trials < 0.1,
        ko: {
            when: f.when.label,
            table: `${f.game.table} 3쿠션`,
            state: `${f.situation.inning}이닝 · ${sb.shooter}:${sb.other} (목표 ${f.situation.target})`,
            cue: `세기 ${f.shot.cuePowerPct}% · ${side > 0 ? "오른쪽 회전" : side < 0 ? "왼쪽 회전" : "무회전"} · ${vert > 0 ? "밀어치기" : vert < 0 ? "끌어치기" : "중단"}`,
            path: `${BALL.ko[first as keyof typeof BALL.ko] ?? first} → ${rails.map(RAIL.ko).join("·")} (${n}쿠션) → ${BALL.ko[second as keyof typeof BALL.ko] ?? second}`,
        },
        en: {
            when: `${enDate} (KST)`,
            table: `3-cushion · ${f.game.tableId === "DAEDAE" ? "full-size table" : "mid-size table"}`,
            state: `Inning ${f.situation.inning} · ${sb.shooter}:${sb.other} (race to ${f.situation.target})`,
            cue: `Power ${f.shot.cuePowerPct}% · ${side > 0 ? "right english" : side < 0 ? "left english" : "no english"} · ${vert > 0 ? "follow" : vert < 0 ? "draw" : "center ball"}`,
            path: `${BALL.en[first as keyof typeof BALL.en] ?? first} → ${rails.map(RAIL.en).join("·")} (${n} rails) → ${BALL.en[second as keyof typeof BALL.en] ?? second}`,
        },
    };
}

export function buildMeta(f: ShotFacts, matchId: string, idx: number): VideoMeta {
    const d = describe(f);
    const links = storeLinks("desc");
    const store = `🍎 App Store: ${links.ios}\n🤖 Google Play: ${links.android}`;
    const shotLine = `Shot ID: ${matchId}#${idx}`;
    const music = "🎵 Music: 랭큐! 랭큐! (RANKUE original)";

    const ko = {
        title: d.hits === 0 ? `${d.n}쿠션 들어간 이 샷, 1,000번 다시 쳐도 한 번도 안 들어갔다 😳 | 랭큐 3쿠션`
            : d.rare ? `${d.n}쿠션 돌아서 들어간다고? 😳 1,000번 쳐서 ${d.hits}번뿐 | 랭큐 3쿠션` : `${d.n}쿠션 돌아서 들어간다고? 😳 1,000번 다시 쳐 봤다 | 랭큐 3쿠션`,
        description: [
            `랭큐 3쿠션 시뮬레이터 실제 대전에서 나온 ${d.n}쿠션 득점이에요.`,
            d.hits === 0 ? "같은 자리에서 손 떨림만큼 각도·세기·당점을 바꿔 1,000번 다시 쳐 봤는데, 한 번도 안 들어갔어요."
                : `같은 자리에서 손 떨림만큼 각도·세기·당점을 바꿔 1,000번 다시 쳐 보니 ${d.hits}번 성공(${d.pct}%).`,
            "",
            "📋 이 샷",
            `• ${d.ko.when} · ${d.ko.table}`,
            `• ${d.ko.state}`,
            `• ${d.ko.cue}`,
            `• ${d.ko.path}`,
            "",
            "🎱 랭큐는 실제 물리로 계산하는 당구 시뮬레이터예요. 같은 배치에 직접 도전하고, 친구와 실시간 대전도 할 수 있어요.",
            store,
            "",
            music,
            "",
            "#Shorts #당구 #3쿠션 #쓰리쿠션 #billiards #랭큐 #RANKUE",
        ].join("\n"),
    };
    const en = {
        title: d.hits === 0 ? `${d.n} cushions… we re-shot it 1,000 times. Not a single one went in 😳 | RANKUE`
            : `${d.n} cushions… and it goes in?! 😳 We re-shot it 1,000 times | RANKUE 3-Cushion`,
        description: [
            `A real ${d.n}-cushion point from a RANKUE 3-cushion simulator match.`,
            d.hits === 0 ? "We re-shot it 1,000 times from the same spot with tiny human errors in aim, power and spin. Not a single one went in."
                : `We re-shot it 1,000 times from the same spot with tiny human errors in aim, power and spin: ${d.hits} made it (${d.pct}%).`,
            "",
            "📋 The shot",
            `• ${d.en.when} · ${d.en.table}`,
            `• ${d.en.state}`,
            `• ${d.en.cue}`,
            `• ${d.en.path}`,
            "",
            "🎱 RANKUE is a physics-based billiards simulator. Try the exact same layout and play live 3-cushion matches.",
            store,
            "",
            music,
            "",
            "#Shorts #billiards #3cushion #carom #RANKUE",
        ].join("\n"),
    };
    const short = (title: string, lines: string[], tags: string) => ({ title, description: [...lines, "", store, "", music, "", tags].join("\n") });
    const loc: Record<string, { title: string; description: string }> = {
        en,
        es: short(`¿${d.n} bandas… y entra?! 😳 La repetimos 1.000 veces | RANKUE`, [
            `Un punto real a ${d.n} bandas en una partida del simulador RANKUE.`,
            `La repetimos 1.000 veces con pequeños errores humanos: entraron ${d.hits} (${d.pct}%).`,
            "", `• ${d.en.cue}`, `• ${d.en.path}`,
            "", "🎱 Prueba la misma posición en RANKUE:",
        ], "#Shorts #billar #3bandas #RANKUE"),
        vi: short(`${d.n} băng… mà vẫn vào?! 😳 Đánh lại 1.000 lần | RANKUE`, [
            `Một điểm ${d.n} băng thật trong trận đấu trên RANKUE.`,
            `Đánh lại 1.000 lần với sai số nhỏ như tay người: vào ${d.hits} lần (${d.pct}%).`,
            "", `• ${d.en.cue}`, `• ${d.en.path}`,
            "", "🎱 Thử ngay thế bi này trên RANKUE:",
        ], "#Shorts #bida #3bang #RANKUE"),
        tr: short(`${d.n} bant… ve giriyor mu?! 😳 1.000 kez yeniden vurduk | RANKUE`, [
            `RANKUE simülatöründe gerçek bir ${d.n} bantlı sayı.`,
            `Küçük insan hatalarıyla 1.000 kez yeniden vurduk: ${d.hits} sayı (${d.pct}%).`,
            "", `• ${d.en.cue}`, `• ${d.en.path}`,
            "", "🎱 Aynı dizilişi RANKUE'da dene:",
        ], "#Shorts #bilardo #3bant #RANKUE"),
    };
    for (const v of [ko, ...Object.values(loc)]) v.description += `\n\n${shotLine}`;
    return {
        title: ko.title, description: ko.description, defaultLanguage: "ko", localizations: loc,
        tags: ["랭큐", "RANKUE", "당구", "3쿠션", "쓰리쿠션", "당구 시뮬레이터", "billiards", "3 cushion", "carom billiards", "billiards simulator", "shorts"],
    };
}

/** 업로드 직후 채널 이름으로 다는 댓글 — 샷 해부 + 참여 질문 + 링크(한국어 · 영어). */
export function commentText(f: ShotFacts): string {
    const d = describe(f);
    const l = storeLinks("comment");
    return [
        "🎱 샷 해부 | Shot breakdown",
        `📅 ${d.ko.when} · ${d.ko.table}`,
        `📊 ${d.ko.state}`,
        `🎯 ${d.ko.cue}`,
        `🔁 ${d.ko.path}`,
        d.hits === 0 ? "🎲 1,000번 다시 쳐서 0번 — 한 번도 안 들어감 · 0 out of 1,000" : `🎲 1,000번 다시 쳐서 ${d.hits}번 성공 (${d.pct}%)`,
        "",
        "여러분은 몇 번 만에 넣을 것 같아요? 👇",
        "How many tries would YOU need? 👇",
        "",
        "📲 같은 배치로 도전 · Try this exact layout",
        `🍎 ${l.ios}`,
        `🤖 ${l.android}`,
    ].join("\n");
}
