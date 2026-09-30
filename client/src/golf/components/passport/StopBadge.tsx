/**
 * 발자국 번호 배지 — 지도 배지와 같은 색(①② 라임, 가장 최근 곳은 주황). 발자국 목록·앨범 머리가 같이 쓴다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { cn } from "@/lib/utils";
import { FOOT_COLORS } from "@shared/golfFootprints";

export function StopBadge({ n, latest, size = 28, className }: { n: number | null; latest?: boolean; size?: number; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn("shrink-0 rounded-full flex items-center justify-center font-bold tabular-nums", className)}
            style={{
                width: size, height: size, fontSize: Math.round(size * (n != null && n >= 10 ? 0.4 : 0.47)),
                background: n == null ? "#FFFFFF1F" : latest ? FOOT_COLORS.latest : FOOT_COLORS.stop,
                color: n == null ? "#FFFFFFB3" : latest ? "#FFFFFF" : FOOT_COLORS.stopInk,
            }}
        >
            {n ?? "·"}
        </span>
    );
}
