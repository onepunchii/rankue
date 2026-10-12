/**
 * 산행 등급의 조각(2026-10-13) — 휘장(GradeArt) · 지금 등급 카드(GradeCard) · 등급 사다리(GradeLadder).
 *
 * 등급은 정상에서 인증한 서로 다른 산의 수로 오른다(shared/hikingGrade): 들머리 → 숲길 → 계곡 → 능선 → 암릉 → 정상 → 운해 → 하늘금.
 * 휘장은 산봉우리를 닮은 삼각 자수 패치다 — 당구의 메달 · 방패, 골프의 볼마커와 다른 등산의 물건. 그림에는 글자가 없다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { HIKING_GRADES, type HikingGradeId, type HikingGradeState } from "@shared/hikingGrade";
import { gradeSrc } from "../theme";

export function GradeArt({ id, size, earned = true, className }: { id: HikingGradeId; size: number; earned?: boolean; className?: string }) {
    return (
        <img src={gradeSrc(id)} width={size} height={size} alt="" draggable={false} decoding="async" data-grade={id} data-earned={earned ? "1" : "0"} className={`block shrink-0 ${className ?? ""}`}
            style={{ width: size, height: size, filter: earned ? "drop-shadow(0 4px 6px rgba(0,0,0,0.5))" : "grayscale(1) brightness(0.7)", opacity: earned ? 1 : 0.36 }} />
    );
}

/** 지금 등급 — 휘장 · 이름 · 다음 등급까지 남은 산. 홈의 맨 위와 배낭에 놓인다 */
export function GradeCard({ state, heightSum, className }: { state: HikingGradeState; heightSum?: number; className?: string }) {
    const { grade, next, left, ratio, count, index } = state;
    return (
        <div className={`flex items-center gap-3.5 rounded-2xl bg-[#0B1F26CC] px-3.5 py-3 backdrop-blur-sm ${className ?? ""}`} style={{ boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="hk-grade-card" data-grade={grade.id}>
            <GradeArt id={grade.id} size={72} />
            <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-[#F4EFE399]">산행 등급 · {index + 1}/{HIKING_GRADES.length}</p>
                <p className="mt-0.5 text-[21px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{grade.name}</p>
                {next ? (
                    <>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#FFFFFF1F]" role="progressbar" aria-valuemin={grade.min} aria-valuemax={next.min} aria-valuenow={count} aria-label={`${next.name}까지`}>
                            <div className="h-full rounded-full bg-[#F28C6A]" style={{ width: `${Math.max(count > grade.min ? 6 : 0, Math.round(ratio * 100))}%` }} />
                        </div>
                        <p className="mt-1.5 text-[13px] text-[#F4EFE3CC] break-keep"><span className="font-semibold text-[#F6D9A8]">{next.name}</span>까지 산 {left}곳</p>
                    </>
                ) : (
                    <p className="mt-1.5 text-[13px] text-[#F6D9A8] break-keep">{grade.line}</p>
                )}
                {heightSum != null && heightSum > 0 && <p className="mt-0.5 text-[12.5px] tabular-nums text-[#F4EFE380]">밟은 정상의 높이를 더하면 {heightSum.toLocaleString("en-US")}m</p>}
            </div>
        </div>
    );
}

/** 등급 사다리 — 여덟 등급을 아래에서 위로. 지난 등급은 제 색, 지금 등급은 테를 두르고, 남은 등급은 흐리게(조건이 보인다) */
export function GradeLadder({ state, earnedOn, preview }: { state: HikingGradeState; earnedOn?: (id: HikingGradeId) => string | null; preview?: boolean }) {
    return (
        <ol className="grid grid-cols-4 gap-x-1 gap-y-4 rounded-2xl bg-[#FFFFFF0A] px-2 py-4" data-testid="hk-grade-ladder">
            {HIKING_GRADES.map((g, i) => {
                const got = preview || i <= state.index;
                const now = !preview && i === state.index;
                const when = earnedOn?.(g.id) ?? null;
                return (
                    <li key={g.id} className="flex flex-col items-center text-center" data-testid={`hk-grade-${g.id}`} data-got={got ? "1" : "0"} data-now={now ? "1" : "0"}>
                        <span className="rounded-full p-1" style={now ? { boxShadow: "inset 0 0 0 1.5px #F28C6A", background: "#F28C6A1F" } : undefined}>
                            <GradeArt id={g.id} size={54} earned={got} />
                        </span>
                        <span className="mt-1 text-[13.5px] font-semibold leading-tight" style={{ color: got ? "#F4EFE3" : "#F4EFE399" }}>{g.name}</span>
                        <span className="mt-0.5 text-[12px] tabular-nums leading-tight" style={{ color: now ? "#F28C6A" : got && when ? "#F6D9A8" : "#F4EFE373" }}>{now ? "지금" : got && when ? when : g.min === 0 ? "시작" : `산 ${g.min}곳`}</span>
                    </li>
                );
            })}
        </ol>
    );
}
