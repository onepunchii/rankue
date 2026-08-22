import { cn } from "@/lib/utils";

// 종목을 색으로 말하는 당구공 점. 랭큐의 시각 언어 — 4구=노란 공, 3쿠션=빨간 공.
// (초록은 라사=배경/브랜드이므로 공 색으로 쓰지 않는다.)
//
// 아이콘 대신 이걸 쓰는 이유: 그래프 아이콘·과녁 아이콘은 종목과 아무 관계가 없어서
// 매번 글자를 읽어야 했다. 공 색은 당구 치는 사람이면 즉시 아는 코드다.
// 의미가 있는 자리에만 쓴다 — 장식으로 아무 데나 뿌리지 않는다.

export type BallType = "3c" | "4c" | "all";

const COLOR: Record<Exclude<BallType, "all">, string> = {
    "4c": "var(--ball-yellow)",
    "3c": "var(--ball-red)",
};

export function BallDot({ type, size = 14, active = true, className }: {
    type: BallType;
    size?: number;
    /** false 면 회색 공 — '기록 없음' 같은 빈 상태에만 쓴다.
     *  탭에서는 쓰지 말 것: 색이 곧 종목의 의미라 선택 여부와 무관하게 항상 보여야
     *  사용자가 노랑=4구, 빨강=3쿠션을 익힌다(선택은 배경 알약이 말한다). */
    active?: boolean;
    className?: string;
}) {
    // '전체'는 두 공이 겹친 모양으로 표현한다 — 종목을 합친다는 뜻이 그대로 보인다.
    if (type === "all") {
        return (
            <span className={cn("relative inline-block shrink-0", className)} style={{ width: size * 1.55, height: size }}>
                <Ball color={COLOR["4c"]} size={size} active={active} style={{ position: "absolute", left: 0, top: 0 }} />
                <Ball color={COLOR["3c"]} size={size} active={active} style={{ position: "absolute", left: size * 0.55, top: 0 }} />
            </span>
        );
    }
    return <Ball color={COLOR[type]} size={size} active={active} className={cn("shrink-0", className)} />;
}

function Ball({ color, size, active, className, style }: {
    color: string; size: number; active: boolean; className?: string; style?: React.CSSProperties;
}) {
    return (
        <span
            className={cn("relative inline-block rounded-full", className)}
            style={{
                width: size, height: size,
                background: active ? color : "rgba(0,0,0,0.16)",
                boxShadow: active ? "inset 0 -1px 2px rgba(0,0,0,0.18)" : "none",
                ...style,
            } as React.CSSProperties}
        >
            {/* 반사광 한 점 — 공처럼 보이게 하는 최소한의 장치 */}
            <span
                className="absolute rounded-full bg-white/45"
                style={{ width: size * 0.28, height: size * 0.2, left: size * 0.22, top: size * 0.16 }}
            />
        </span>
    );
}
