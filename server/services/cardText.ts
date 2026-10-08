/**
 * 카드의 이름 글자 — 칸에 꽉 채우기(2026-10-08 썸네일 다시 만들기: 골프장 로고 판 · 당구장 당구대 그림).
 *
 * 썸네일은 검색 결과에서 90~110px 로 줄어든다. 예전 카드는 이름이 100px 글자(→ 9px)라 안 읽혔다.
 * 이름을 한두 줄로 나눠 칸 너비에 맞는 가장 큰 글자로 그린다.
 *
 * 글자 너비는 어림이다(satori 는 그리기 전에 너비를 알려 주지 않는다) — Pretendard ExtraBold 실측에 여유를 둔 값.
 * 작게 잡으면 satori 가 줄을 접어 버린다(시안에서 한글 0.87em 으로 잡았다가 '설해원 / CC' 로 접혔다). 줄마다 nowrap 을 같이 건다.
 */

/** 글자열의 너비(em) 어림 */
export const emOf = (s: string): number => [...s].reduce((a, c) =>
    a + (/[가-힣]/.test(c) ? 0.93 : /[A-Z]/.test(c) ? 0.75 : /[a-z]/.test(c) ? 0.6 : /[0-9]/.test(c) ? 0.64 : c === " " ? 0.28 : 0.55), 0);

/** 가장 긴 줄이 maxW 에 들어가는 가장 큰 글자 크기(maxSize 까지) */
export const fitSize = (lines: readonly string[], maxW: number, maxSize: number): number =>
    Math.max(24, Math.min(maxSize, Math.floor(maxW / Math.max(0.1, ...lines.map(emOf)))));

const flat = (raw: string) => raw.replace(/-/g, " ").replace(/\s+/g, " ").trim();

/** 두 줄로 — 띄어쓰기에서(두 줄 길이가 가장 비슷한 곳), 없으면 'CC·컨트리클럽·당구클럽' 앞에서, 그래도 길면 반으로 */
export function splitName(raw: string): string[] {
    const n = flat(raw);
    if (n.includes(" ")) {
        const parts = n.split(" "); let best = 1, gap = Infinity;
        for (let i = 1; i < parts.length; i++) {
            const g = Math.abs(emOf(parts.slice(0, i).join(" ")) - emOf(parts.slice(i).join(" ")));
            if (g < gap) { gap = g; best = i; }
        }
        return [parts.slice(0, best).join(" "), parts.slice(best).join(" ")];
    }
    const m = n.match(/^(.{2,}?)(컨트리클럽|골프클럽|골프링크스|골프앤리조트|리조트|당구클럽|당구장|빌리어드|CC|GC)$/i);
    if (m) return [m[1], m[2]];
    const chars = [...n];
    if (chars.length < 4) return [n];
    const mid = Math.ceil(chars.length / 2);
    return [chars.slice(0, mid).join(""), chars.slice(mid).join("")];
}

/**
 * 이름을 한 줄 또는 두 줄로, 글자 크기와 함께.
 *  · 한 줄로 충분히 크면 한 줄(붙여 쓴 이름은 max 의 66%, 띄어 쓴 이름은 85% — 띄어 쓴 이름은 두 줄이 더 크게 읽힌다)
 *  · 아니면 두 줄(두 줄일 때의 최대 크기는 max2)
 */
export function nameLines(raw: string, maxW: number, max: number, max2 = max): { lines: string[]; size: number } {
    const n = flat(raw);
    const one = fitSize([n], maxW, max);
    if (one >= max * (n.includes(" ") ? 0.85 : 0.66)) return { lines: [n], size: one };
    const lines = splitName(n);
    if (lines.length < 2) return { lines: [n], size: one };
    const two = fitSize(lines, maxW, max2);
    // 두 줄로 나눴는데 한 줄보다 작으면(아주 짧은 이름) 한 줄이 낫다
    return two > one ? { lines, size: two } : { lines: [n], size: one };
}
