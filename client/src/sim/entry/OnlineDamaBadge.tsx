/**
 * 온라인 다마 배지(2026-10-12 오너: 홈 '내 온라인 실력'의 내 다마수 줄을 가리키며 "이것도 배지로").
 * 육각 초록 판 가운데에 **온라인 다마수**(온라인 대전 에버리지로 서버가 매긴 목표 — shared/sim/handicap)를 얹는다.
 *
 * 실전의 다마 메달(components/hiq/RealMedal — 리본 달린 둥근 메달, 등급마다 색이 다르다)과 **일부러 다르게** 그린다:
 * 온라인 다마수와 실전 다마는 눈금이 다르다(온라인은 에버리지 × 18이닝, 4구는 1득점 = 10점 / 실전은 점수판의 다마 표).
 * 같은 메달에 얹으면 온라인 12점이 '실전 브론즈'로 읽힌다. 그래서 등급 색이 없는 한 가지 판이다 —
 * 온라인의 등급은 레이팅으로 매기는 방패(rank/TierEmblem)가 따로 있다.
 *
 * 그림은 client/public/sim/rank/dama-online.svg(가운데가 빈 판, 벡터 — 그림 모델이 가운데를 채우지 못해 직접 그렸다). 숫자는 그림에 없다 — 여기서 얹는다.
 * 다마수를 아직 모르면(불러오는 중) 흐린 판만 그린다.
 */
import { cn } from "@/lib/utils";

export const ONLINE_DAMA_SRC = "/sim/rank/dama-online.svg";

export function OnlineDamaBadge({ target, size, label, className }: {
    /** 온라인 다마수(점). 3쿠션은 12~, 4구는 80 같은 세 자리도 온다 */
    target: number | null | undefined;
    /** 한 변(px) */
    size: number;
    /** 읽어 줄 이름("내 다마수 12점"). 옆에 같은 글자가 있으면 비워 둔다 */
    label?: string;
    className?: string;
}) {
    const has = typeof target === "number" && Number.isFinite(target) && target > 0;
    const digits = has ? String(target).length : 1;
    return (
        <span
            className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}
            role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
            data-testid="online-dama" data-target={has ? String(target) : ""}
        >
            <img
                src={ONLINE_DAMA_SRC} width={size} height={size} alt="" decoding="async" draggable={false} className="block w-full h-full object-contain"
                style={{ filter: has ? "drop-shadow(0 2px 3px rgba(0,0,0,0.28))" : "grayscale(1) opacity(0.4)" }}
            />
            {has && (
                <span
                    className="rk-num absolute left-0 right-0 text-center font-black text-white"
                    style={{ top: "50%", transform: "translateY(-50%)", fontSize: Math.round(size * (digits >= 3 ? 0.27 : 0.36)), lineHeight: 1, letterSpacing: "-0.03em", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                >
                    {target}
                </span>
            )}
        </span>
    );
}

export default OnlineDamaBadge;
