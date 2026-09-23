/**
 * 한 팀 네 자리 그림(2026-09-23 오너: "차라리 선택 시 팝업창 띄워서 이미지 들어가게 이해되게 편하게").
 *
 * 출신: 부킹 올리기 시트의 '앱에서 채울 자리'(SeatsField). 같은 날 오너가 **올릴 때는 자리를 묻지 않기로**
 * 정하면서 그 칸은 사라졌지만(BookingCreateSheet 머리말 참고), 그림은 남겼다 — 매니저가 확인해야 하는 것이
 * "네 자리 중 몇 자리가 남았나" 라는 점은 전환 시트(ToJoinSheet)에서도 똑같기 때문이다. 말로는 안 되고 그림이라야 된다.
 *
 * 인라인 SVG 다 — 고른 값이 바뀌면 그림이 바뀐다. 정적인 한 장은 "그래서 내가 고른 게 뭔데"를 답해 주지 못한다.
 * 강조색은 쓰는 쪽이 정한다(부킹 라임 #64DD17 · 조인 주황 #FF6B00). 색을 둘 다 칠하지 않는다 — 한 그림에 강조색은 하나다.
 */
import { MAX_SLOTS } from "@shared/golfJoin";

/** 자리 넷 그림. open = 앱이 채울(모집) 자리 수. 찬 자리를 왼쪽, 모집 자리를 오른쪽에 둔다. */
export function SeatDiagram({ open, accent = "#64DD17", openLabel = "앱이 채움" }: { open: number; accent?: string; openLabel?: string }) {
    const taken = MAX_SLOTS - open;
    // rgba 를 문자열로 만들지 않고 hex 에 투명도를 붙인다 — 어느 강조색이 와도 같은 농도가 나온다.
    const fill = `${accent}1A`;   // 10%
    const dot = `${accent}29`;    // 16%
    return (
        <svg viewBox="0 0 300 86" className="w-full h-auto" role="img" aria-label={`네 자리 중 ${taken}자리는 찼고 ${open}자리가 남았어요`}>
            {Array.from({ length: MAX_SLOTS }, (_, i) => {
                const isOpen = i >= taken;
                const x = i * 78;
                const cx = x + 33;
                return (
                    <g key={i}>
                        <rect
                            x={x + 0.75} y={0.75} width={64.5} height={84.5 - 4} rx={14}
                            fill={isOpen ? fill : "#242629"}
                            stroke={isOpen ? accent : "#34373c"}
                            strokeWidth={1.25}
                            strokeDasharray={isOpen ? "5 4" : undefined}
                        />
                        {isOpen ? (
                            <>
                                <circle cx={cx} cy={36} r={15} fill={dot} />
                                <path d={`M ${cx - 7} 36 H ${cx + 7} M ${cx} 29 V 43`} stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
                            </>
                        ) : (
                            <>
                                <circle cx={cx} cy={28} r={8.5} fill="#8b9099" />
                                <path d={`M ${cx - 13} 54 a 13 13 0 0 1 26 0 z`} fill="#8b9099" />
                            </>
                        )}
                        <text x={cx} y={70} textAnchor="middle" fontSize={10.5} fill="#8b9099">
                            {isOpen ? openLabel : "찬 자리"}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}
