/** 카드·설정 창 모티프: 우리 공(크림 백구 + 빨간 점 둘 / 백구 + 노란 공 / 멀티방은 세 공 / 길 찾기는 백구에서 뻗는 길). 색은 공 토큰(ball-*), 그라데이션 없음. */
export function BallMotif({ kind, size = 52 }: { kind: "single" | "multi" | "rooms" | "path"; size?: number }) {
    const edge = "rgba(0,0,0,0.14)";
    if (kind === "path") {
        // 백구에서 나가 쿠션을 돌아 적구로 가는 길(점선) — 3쿠션 전용 카드
        return (
            <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
                <path d="M14 36 L46 22 L8 14 L40 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3" opacity="0.6" />
                <circle cx="40" cy="8" r="6.5" className="fill-ball-red" stroke={edge} strokeWidth="1" />
                <circle cx="44" cy="34" r="6.5" className="fill-ball-yellow" stroke={edge} strokeWidth="1" />
                <circle cx="14" cy="36" r="9" className="fill-ball-white" stroke={edge} strokeWidth="1" />
                <circle cx="12" cy="34" r="1.8" className="fill-ball-red" />
            </svg>
        );
    }
    if (kind === "rooms") {
        return (
            <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
                <circle cx="16" cy="17" r="12" className="fill-ball-red" stroke={edge} strokeWidth="1" />
                <circle cx="36" cy="17" r="12" className="fill-ball-yellow" stroke={edge} strokeWidth="1" />
                <circle cx="26" cy="35" r="13" className="fill-ball-white" stroke={edge} strokeWidth="1" />
                <circle cx="22" cy="32" r="2" className="fill-ball-red" />
            </svg>
        );
    }
    return (
        <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" className="shrink-0">
            {kind === "multi" && <circle cx="33" cy="20" r="15" className="fill-ball-yellow" stroke={edge} strokeWidth="1" />}
            <circle cx={kind === "multi" ? 20 : 26} cy={kind === "multi" ? 31 : 26} r={kind === "multi" ? 15 : 19} className="fill-ball-white" stroke={edge} strokeWidth="1" />
            {kind === "single" ? (
                <>
                    <circle cx="20" cy="19" r="2.3" className="fill-ball-red" />
                    <circle cx="31" cy="32" r="2.3" className="fill-ball-red" />
                </>
            ) : (
                <circle cx="16" cy="27" r="2" className="fill-ball-red" />
            )}
        </svg>
    );
}
