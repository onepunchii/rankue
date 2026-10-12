/**
 * 업적 핀 조각(2026-10-12) — 핀 하나(PinPiece)와 장식장의 핀 판(PinCase).
 *
 * 볼마커(도장첩을 다 채워 받는 것)와는 다른 물건이다: 핀은 골프장을 새로 가지 않아도 라운드를 쌓으면 붙는다.
 * 못 받은 핀도 윤곽과 조건이 보인다 — 무엇을 하면 붙는지 알아야 모으고 싶어진다.
 * ⚠️ 리터럴 색만(StampParts 머리말). 글자는 12px 이상(그림 위의 숫자도).
 */
import { GOLF_PINS, type GolfPin } from "@shared/golfPins";
import { PIN_PLATE, pinSrc } from "./pinArt";

export function PinPiece({ pin, earned, size = 84 }: { pin: Pick<GolfPin, "id" | "art" | "num">; earned: boolean; size?: number }) {
    const plate = PIN_PLATE[pin.art];
    return (
        <span className="relative block shrink-0" style={{ width: size, height: size }} data-testid={`pin-${pin.id}`} data-earned={earned ? "1" : "0"}>
            <img
                src={pinSrc(pin.art)} alt="" width={size} height={size} draggable={false} decoding="async" loading="lazy"
                className="block h-full w-full"
                style={earned ? { filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))" } : { filter: "grayscale(1) brightness(0.6)", opacity: 0.5 }}
            />
            {pin.num && plate && (
                <span
                    className="absolute flex items-center justify-center font-semibold tabular-nums leading-none"
                    style={{
                        left: plate.x * size, top: plate.y * size, width: plate.w * size, height: plate.h * size,
                        fontSize: Math.max(12, plate.h * size * 0.82), letterSpacing: "-0.02em",
                        color: earned ? plate.ink : "#FFFFFF", opacity: earned ? 1 : 0.55,
                    }}
                >
                    {pin.num}
                </span>
            )}
        </span>
    );
}

/**
 * 핀 판 — 세 줄씩. 받은 핀은 제 색 + 받은 순번 · 날, 못 받은 핀은 흐린 윤곽 + 조건.
 * when 은 회원의 받은 기록에서만 온다(예시에는 날짜 · 순번을 지어내지 않는다).
 */
export function PinCase({ earned, when }: { earned: (id: string) => boolean; when?: (id: string) => string | undefined }) {
    return (
        <ul className="grid grid-cols-3 gap-x-2 gap-y-5 rounded-2xl bg-[#FFFFFF08] px-2.5 py-5" data-testid="pin-case">
            {GOLF_PINS.map((p) => {
                const got = earned(p.id);
                const at = got ? when?.(p.id) : undefined;
                return (
                    <li key={p.id} className="flex flex-col items-center text-center">
                        <PinPiece pin={p} earned={got} />
                        <span className="mt-2 text-[13.5px] font-semibold leading-tight break-keep" style={{ color: got ? "#FFFFFF" : "#FFFFFF99" }}>{p.name}</span>
                        <span className="mt-1 px-0.5 text-[12px] leading-snug break-keep" style={{ color: got && at ? "#FFD36B" : "#FFFFFF73" }}>{at ?? p.how}</span>
                    </li>
                );
            })}
        </ul>
    );
}
