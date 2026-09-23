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

/**
 * 전환 글인가 — 매니저가 팔고 남은 부킹을 그 자리에서 조인으로 바꾼 글(2026-09-23).
 * 표시는 sellerType 하나로 안다: 조인은 sellerType 이 null 이고(POST /bookings), 부킹만 STORE·PERSONAL 이 박힌다.
 * 전환 라우트가 그 값을 **지우지 않고 남겨** 두기 때문에, 조인인데 sellerType 이 있으면 부킹에서 건너온 글이다.
 *
 * 왜 갈라 봐야 하나(유령 자리): 보통 조인은 만든 사람이 첫 자리에 **실제로 앉지만**, 매장 매니저는 자기가 파는
 * 팀에서 치지 않는다. 그대로 '호스트'라고 그리면 신청자가 현장에 가서 만날 사람이 없다.
 * 이제 전환 시트는 HOST 자리를 아예 만들지 않는다(2026-09-23 자리 규칙을 넓혔다 — shared/golfJoin.normalizeSlots).
 * 다만 그 전에 전환된 **옛 글에는 HOST 가 남아 있으므로** 여기서 계속 갈라 본다 — 그 첫 칸은 '호스트'가 아니라
 * 그냥 **이미 찬 자리**로 그린다.
 */
export function isConvertedJoin(item: { listingType?: string | null; sellerType?: string | null }): boolean {
    return item.listingType === "JOIN" && !!item.sellerType;
}

/** 첫 자리 이름. 보통은 '호스트', 전환 글은 null — null 이면 그림에서 'H' 를 지우고 찬 자리로만 센다(자리에 HOST 가 없으면 아무 일도 안 한다). */
export function hostSeatLabel(item: { listingType?: string | null; sellerType?: string | null }): string | null {
    return isConvertedJoin(item) ? null : "호스트";
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
export function SlotDots({ slots, filled = 0, size = 22, className, hostLabel = "호스트" }: { slots: readonly JoinSlot[]; filled?: number; size?: number; className?: string; hostLabel?: string | null }) {
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
                        // 이름은 자리 칩(slotLegend)과 같아야 한다 — 전환 글(hostLabel=null)에는 호스트가 없고,
                        // 찬 자리는 전부 '이미 찬 자리' 다. 여기만 '동반자'라고 부르면 같은 원을 두 이름으로 읽는다.
                        title={s.role === "OPEN" ? `모집 · ${GENDER_LABEL[s.gender]}` : s.role === "HOST" ? (hostLabel ?? "이미 찬 자리") : (hostLabel === null ? "이미 찬 자리" : "동반자")}
                    >
                        {taken ? (s.role === "HOST" && hostLabel ? "H" : "") : "+"}
                    </span>
                );
            })}
        </span>
    );
}

/**
 * 자리 한 줄(나·동반자·모집)의 성별 토글. 모집 자리만 '무관'이 있다.
 * 조인 만들기 시트에서 왔다 — 부킹을 조인으로 돌리는 시트(ToJoinSheet)가 **같은 문법**을 써야 하기 때문에 여기로 옮겼다.
 * 색은 자리 점(SlotDots)과 같다: 남 #4DA3FF · 여 #FF6B9A · 무관 흰색. 두 화면이 다른 색을 쓰면 "파란 건 남자"가 안 통한다.
 */
export function GenderToggle({ value, onChange, allowAny }: { value: SlotGender; onChange: (g: SlotGender) => void; allowAny: boolean }) {
    const opts: SlotGender[] = allowAny ? ["ANY", "M", "F"] : ["M", "F"];
    return (
        <span className="inline-flex rounded-full bg-white/[0.06] border border-white/10 p-0.5">
            {opts.map((g) => (
                <button
                    key={g} type="button" onClick={() => onChange(g)}
                    className={cn(
                        "h-8 min-w-[44px] px-2.5 rounded-full text-[12.5px] font-medium transition-colors",
                        value === g ? (g === "M" ? "bg-[#4DA3FF] text-white" : g === "F" ? "bg-[#FF6B9A] text-white" : "bg-white/25 text-white") : "text-white/55",
                    )}
                >
                    {GENDER_LABEL[g]}
                </button>
            ))}
        </span>
    );
}

export function JoinTypeBadge({ type, className }: { type: JoinType; className?: string }) {
    return (
        <span className={cn(
            // shrink-0·whitespace-nowrap 이 없으면 이름이 긴 카드에서 배지가 눌려 '필'/'드' 로 접힌다(2026-09-23 오너 스크린샷).
            // 바로 옆 부킹 배지(BookingCard)에는 있었는데 여기만 빠져 있었다.
            "shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold",
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

/**
 * 자리 설명 칩: 같은 역할·성별끼리 묶는다 — "호스트 남 · 동반자 여 · 모집 무관 ×2".
 * hostLabel 이 null(전환 글)이면 첫 칸을 '이미 찬 자리'로 부르고 동반자와 **같은 묶음**으로 센다 —
 * 매장 글에서 그 둘은 신청자에게 똑같은 것이다("두 자리는 이미 팔렸다").
 */
export function slotLegend(slots: readonly JoinSlot[], hostLabel: string | null = "호스트"): string[] {
    const taken = hostLabel === null ? "이미 찬 자리" : null;
    const name = (s: JoinSlot) => (s.role === "OPEN" ? "모집" : s.role === "HOST" ? (hostLabel ?? taken!) : (taken ?? "동반자"));
    const out: { key: string; label: string; n: number }[] = [];
    for (const s of slots) {
        // 찬 자리의 '무관' 은 적지 않는다 — 모르는 성별을 굳이 말하는 것이라 "이미 찬 자리 무관 ×2" 처럼 읽힌다.
        // 모집 자리는 반대다: 무관이야말로 신청자가 알아야 할 조건이다.
        const label = s.role !== "OPEN" && s.gender === "ANY" ? name(s) : `${name(s)} ${GENDER_LABEL[s.gender]}`;
        const hit = out.find((o) => o.key === label);
        if (hit) hit.n++; else out.push({ key: label, label, n: 1 });
    }
    return out.map((o) => (o.n > 1 ? `${o.label} ×${o.n}` : o.label));
}
