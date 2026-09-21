/**
 * 조인 화면 공용 조각(2026-09-21): 자리 점(🔵🔴＋), 종류 배지, 비용 표기.
 * 목록 카드·만들기 시트·상세가 같은 그림을 쓴다 — 자리 색이 화면마다 다르면 "파란 건 남자" 가 안 통한다.
 * 글자는 굵기 600 을 넘기지 않는다(오너: "텍스트 두께가 두꺼운 것들이 있어 답답하다").
 */
import { cn } from "@/lib/utils";
import { JOIN_TYPE_LABEL, slotsFromLegacy, type JoinSlot, type JoinType, type SlotGender } from "@shared/golfJoin";

/** 글 한 건에서 자리 목록을 꺼낸다(옛 글은 만들어 준다). */
export function slotsOf(item: { slots?: unknown; joinHeadcount?: number | null; joinCondition?: string | null }): JoinSlot[] {
    const s = item.slots;
    if (Array.isArray(s) && s.length >= 2) return s as JoinSlot[];
    return slotsFromLegacy(item.joinHeadcount, item.joinCondition);
}

export function joinTypeOf(item: { joinType?: string | null }): JoinType {
    return item.joinType === "SCREEN" || item.joinType === "PARK" ? item.joinType : "FIELD";
}

const GENDER_DOT: Record<SlotGender, string> = {
    M: "bg-[#4DA3FF]",
    F: "bg-[#FF6B9A]",
    ANY: "bg-white/25",
};
export const GENDER_LABEL: Record<SlotGender, string> = { M: "남", F: "여", ANY: "무관" };

/**
 * 자리 점. 채워진 자리(호스트·동반자)는 성별 색 원, 모집 자리는 ＋(받고 싶은 성별 색 테두리),
 * 승인된 사람 수만큼 모집 자리를 앞에서부터 채운다.
 */
export function SlotDots({ slots, filled = 0, size = 22, className }: { slots: readonly JoinSlot[]; filled?: number; size?: number; className?: string }) {
    let toFill = filled;
    return (
        <span className={cn("inline-flex items-center gap-1", className)} aria-label={`자리 ${slots.length}개`}>
            {slots.map((s, i) => {
                const taken = s.role !== "OPEN" || (toFill > 0 && (toFill--, true));
                return (
                    <span
                        key={i}
                        style={{ width: size, height: size }}
                        className={cn(
                            "rounded-full inline-flex items-center justify-center text-[11px] font-semibold leading-none",
                            taken ? cn(GENDER_DOT[s.gender], s.gender === "ANY" ? "text-white/80" : "text-white") : "border border-dashed text-white/50",
                            !taken && (s.gender === "M" ? "border-[#4DA3FF]/70" : s.gender === "F" ? "border-[#FF6B9A]/70" : "border-white/30"),
                        )}
                        title={s.role === "HOST" ? "호스트" : s.role === "GUEST" ? "동반자" : `모집 · ${GENDER_LABEL[s.gender]}`}
                    >
                        {taken ? (s.role === "HOST" ? "H" : "") : "+"}
                    </span>
                );
            })}
        </span>
    );
}

export function JoinTypeBadge({ type, className }: { type: JoinType; className?: string }) {
    return (
        <span className={cn(
            "px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold",
            type === "SCREEN" ? "bg-[#4DA3FF]/15 text-[#7CBBFF]" : type === "PARK" ? "bg-[#64DD17]/15 text-[#8BE84A]" : "bg-[#FF6B00]/15 text-[#FF8A33]",
            className,
        )}>
            {JOIN_TYPE_LABEL[type]}
        </span>
    );
}

/** 비용 글자: 1/N 이면 "1/N", 아니면 원 단위. */
export function costText(item: { costMode?: string | null; greenFee?: number | null }): string {
    if (item.costMode === "SPLIT") return "1/N";
    const fee = Number(item.greenFee ?? 0);
    return fee > 0 ? `${fee.toLocaleString()}원` : "비용 미정";
}
