/**
 * 종목 아이콘(2026-09-09 오너: "3쿠션은 공 3개, 4구는 공 4개"). 글자보다 빨리 읽힌다.
 * 색은 우리 공 토큰 — 3쿠션은 흰·노랑·빨강, 4구는 거기에 빨강 하나 더(실제 구성과 같다).
 */
export function GameBalls({ gameType, size = 26 }: { gameType: "3c" | "4c"; size?: number }) {
    const four = gameType === "4c";
    const edge = "rgba(0,0,0,0.22)";
    return (
        <svg width={four ? size + 6 : size} height={size * 0.62} viewBox={four ? "0 0 46 26" : "0 0 38 26"} aria-hidden="true" className="shrink-0">
            <circle cx="9" cy="13" r="8" className="fill-ball-white" stroke={edge} strokeWidth="1" />
            <circle cx="21" cy="13" r="8" className="fill-ball-yellow" stroke={edge} strokeWidth="1" />
            <circle cx="33" cy="13" r="8" className="fill-ball-red" stroke={edge} strokeWidth="1" />
            {four && <circle cx="43" cy="13" r="8" className="fill-ball-red" stroke={edge} strokeWidth="1" />}
        </svg>
    );
}

export default GameBalls;
