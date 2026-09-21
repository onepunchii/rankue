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

/* ── 카드 공용(2026-09-21 카드 재설계): 카카오맵 링크 · D-day · 모집 성별 글자 ─────────────────────── */

/** 카카오맵 열기(공식 URL 스킴, 키 불필요). 좌표가 있으면 핀으로, 없으면 이름 검색. 앱에선 카카오맵 앱이 받는다. */
export function kakaoMapUrl(name: string, lat?: number | null, lng?: number | null): string {
    const n = encodeURIComponent(name);
    return typeof lat === "number" && typeof lng === "number" ? `https://map.kakao.com/link/map/${n},${lat},${lng}` : `https://map.kakao.com/link/search/${n}`;
}
/** 길찾기. 좌표가 없으면 길찾기가 안 되므로 검색으로 대신한다. */
export function kakaoRouteUrl(name: string, lat?: number | null, lng?: number | null): string {
    const n = encodeURIComponent(name);
    return typeof lat === "number" && typeof lng === "number" ? `https://map.kakao.com/link/to/${n},${lat},${lng}` : `https://map.kakao.com/link/search/${n}`;
}

/** 한국 날짜 열쇠(YYYY-MM-DD) 둘의 날 차이. */
function dayDiff(fromKey: string, toKey: string): number {
    const [a, b] = [fromKey, toKey].map((k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); });
    return Math.round((b - a) / 86_400_000);
}
/** 티타임까지: 오늘 · 내일 · D-n · 지남. 목록이 날짜별이라 날짜 대신 이게 더 쓸모 있다. */
export function dayLabel(dateKey: string, todayKey: string): string {
    const d = dayDiff(todayKey, dateKey);
    if (d < 0) return "지남";
    if (d === 0) return "오늘";
    if (d === 1) return "내일";
    return `D-${d}`;
}

/** 모집 자리의 성별 요약: "성별무관" · "남성" · "여성" · "남 1 · 여 1" 처럼. */
export function openGenderText(slots: readonly JoinSlot[]): string {
    const open = slots.filter((s) => s.role === "OPEN");
    if (open.length === 0) return "";
    const n = { M: 0, F: 0, ANY: 0 };
    for (const s of open) n[s.gender]++;
    if (n.M === open.length) return "남성";
    if (n.F === open.length) return "여성";
    if (n.ANY === open.length) return "성별무관";
    return (["M", "F", "ANY"] as const).filter((g) => n[g] > 0).map((g) => `${GENDER_LABEL[g]} ${n[g]}`).join(" · ");
}

/** 자리 설명 칩: 같은 역할·성별끼리 묶는다 — "호스트 남 · 동반자 여 · 모집 무관 ×2". */
export function slotLegend(slots: readonly JoinSlot[]): string[] {
    const ROLE: Record<JoinSlot["role"], string> = { HOST: "호스트", GUEST: "동반자", OPEN: "모집" };
    const out: { key: string; label: string; n: number }[] = [];
    for (const s of slots) {
        const key = `${s.role}:${s.gender}`;
        const hit = out.find((o) => o.key === key);
        if (hit) hit.n++; else out.push({ key, label: `${ROLE[s.role]} ${GENDER_LABEL[s.gender]}`, n: 1 });
    }
    return out.map((o) => (o.n > 1 ? `${o.label} ×${o.n}` : o.label));
}
