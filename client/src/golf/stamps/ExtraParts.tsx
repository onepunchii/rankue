/**
 * 장식장의 조각 — 시즌 태그 · 한정 볼마커(2026-10-12). 규칙은 shared/golfStampExtras · golfStampDepth.
 *
 * 볼마커(도장첩을 다 채워 받는 것) · 업적 핀과는 다른 물건이다:
 *   시즌 태그   해마다 하나. 그해의 인증 라운드 수로 가죽이 바뀐다(브라운 → 네이비 → 버건디). 지난 해의 태그는 남는다.
 *   한정 볼마커 철마다 · 특별한 날에만 받는 것. 숨은 볼마커는 받기 전에 '?'로만 보인다.
 * 그림에는 글자가 없다 — 태그 이름판의 해(2026)는 코드가 얹는다(자리 bookArt.TAG_PLATE).
 * ⚠️ 리터럴 색만(StampParts 머리말). 글자는 12px 이상.
 */
import { SEASON_TAG_TIERS, SPECIAL_MARKERS, specialKey, type SeasonTagTier, type SeasonTagYear } from "@shared/golfStampExtras";
import { SHELF_HIDDEN_HOW, SHELF_HIDDEN_NAME } from "@shared/golfStampGuide";
import { TAG_PLATE, extraSrc } from "./bookArt";
import { StampBar } from "./StampParts";
import { awardWhen } from "./useStampAwards";
import type { StampDepthView } from "./useStampDepth";

/** 태그 하나 — 이름판에 해를 얹는다. 작은 태그는 두 자리("26") */
export function SeasonTagPiece({ tier, year, size, earned }: { tier: SeasonTagTier; year: number; size: number; earned: boolean }) {
    const plate = TAG_PLATE[tier.art];
    const short = size < 100;
    return (
        <span className="relative block shrink-0" style={{ width: size, height: size }} data-testid={`tag-${year}`} data-tier={earned ? tier.id : "none"}>
            <img
                src={extraSrc(tier.art)} alt="" width={size} height={size} draggable={false} decoding="async" loading="lazy" className="block h-full w-full"
                style={earned ? { filter: "drop-shadow(0 5px 7px rgba(0,0,0,0.55))" } : { filter: "grayscale(1) brightness(0.65)", opacity: 0.45 }}
            />
            {plate && (
                <span
                    className="absolute flex items-center justify-center font-semibold tabular-nums leading-none"
                    style={{
                        left: plate.x * size, top: plate.y * size, width: plate.w * size, height: plate.h * size,
                        fontSize: Math.max(12, Math.round(plate.w * size * (short ? 0.46 : 0.33))), letterSpacing: "-0.02em",
                        color: earned ? plate.ink : "#FFFFFF", opacity: earned ? 0.92 : 0.5,
                    }}
                >
                    {short ? String(year).slice(2) : year}
                </span>
            )}
        </span>
    );
}

/** 시즌 태그 구역 — 올해의 태그(크게) + 다음 가죽까지 + 지난 해의 태그들 */
export function SeasonTagShelf({ tags }: { tags: readonly SeasonTagYear[] }) {
    const [now, ...past] = tags;
    if (!now) return null;
    const shown = now.tier ?? SEASON_TAG_TIERS[0];
    const kept = past.filter((t) => t.tier);
    return (
        <div className="rounded-2xl bg-[#FFFFFF08] px-3.5 py-4" data-testid="tag-shelf">
            <div className="flex items-center gap-3.5">
                <SeasonTagPiece tier={shown} year={now.year} size={118} earned={!!now.tier} />
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[#FFD36B]">{now.year} 시즌 태그</p>
                    <p className="mt-0.5 text-[17px] font-semibold text-[#FFFFFF] break-keep" data-testid="tag-now">
                        {now.tier ? `${now.tier.name} 태그` : "아직 없어요"}
                        {now.rounds > 0 && <span className="ml-1.5 text-[13px] font-normal text-[#FFFFFF99]">올해 {now.rounds}번</span>}
                    </p>
                    {now.next ? (
                        <>
                            <p className="mt-1.5 text-[13px] leading-snug text-[#FFFFFFB3] break-keep" data-testid="tag-next">
                                {now.tier ? `${now.next.tier.name}까지 ${now.next.left}번 남았어요` : "올해 골프장에서 첫 라운드를 끝내면 태그가 생겨요"}
                            </p>
                            <StampBar got={now.rounds} total={now.next.tier.at} className="mt-2" />
                        </>
                    ) : (
                        <p className="mt-1.5 text-[13px] text-[#FFD36B] break-keep">올해 가장 높은 태그예요.</p>
                    )}
                </div>
            </div>
            {/* 가죽 세 가지 — 몇 번이면 바뀌는지 */}
            <ul className="mt-3.5 flex gap-1.5" aria-label="태그의 가죽">
                {SEASON_TAG_TIERS.map((t) => {
                    const on = now.rounds >= t.at;
                    return (
                        <li key={t.id} className="flex-1 rounded-xl px-2 py-1.5 text-center" style={{ background: on ? "#E9B94924" : "#FFFFFF0A", boxShadow: on ? "inset 0 0 0 1px #E9B94959" : undefined }}>
                            <span className="block text-[13px] font-medium" style={{ color: on ? "#FFD36B" : "#FFFFFFB3" }}>{t.name}</span>
                            <span className="block text-[12px] tabular-nums text-[#FFFFFF80]">{t.at}번</span>
                        </li>
                    );
                })}
            </ul>
            {kept.length > 0 && (
                <div className="mt-4 border-t border-[#FFFFFF0F] pt-3.5" data-testid="tag-past">
                    <p className="text-[12.5px] text-[#FFFFFF8C]">지난 해의 태그</p>
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-3">
                        {kept.map((t) => (
                            <li key={t.year} className="flex w-[72px] flex-col items-center text-center">
                                <SeasonTagPiece tier={t.tier!} year={t.year} size={68} earned />
                                <span className="mt-1 text-[12px] leading-tight text-[#FFFFFFB3]">{t.year}<span className="block tabular-nums text-[#FFFFFF73]">{t.rounds}번</span></span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** 한정 볼마커 판 — 네 줄씩. 숨은 볼마커는 받기 전에 '?' */
export function SpecialCase({ depth }: { depth: StampDepthView }) {
    return (
        <ul className="grid grid-cols-4 gap-x-1.5 gap-y-5 rounded-2xl bg-[#FFFFFF08] px-2 py-5" data-testid="special-case">
            {SPECIAL_MARKERS.map((m) => {
                const key = specialKey(m.id, depth.year);
                const got = depth.hasSpecial(key);
                const award = got ? depth.specialAward(key) : undefined;
                const secret = !!m.hidden && !got;
                return (
                    <li key={m.id} className="flex flex-col items-center text-center" data-testid={`special-${m.id}`} data-earned={got ? "1" : "0"}>
                        {secret ? (
                            <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full text-[24px] font-semibold text-[#FFFFFF66]" style={{ background: "radial-gradient(circle at 50% 35%,#FFFFFF14,#FFFFFF05)", boxShadow: "inset 0 0 0 1.5px #FFFFFF26" }} aria-hidden>?</span>
                        ) : (
                            <img
                                src={extraSrc(m.art)} alt="" width={62} height={62} draggable={false} decoding="async" loading="lazy" className="block h-[62px] w-[62px]"
                                style={got ? { filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.5))" } : { filter: "grayscale(1) brightness(0.7)", opacity: 0.42 }}
                            />
                        )}
                        <span className="mt-1.5 text-[13px] font-semibold leading-tight break-keep" style={{ color: got ? "#FFFFFF" : "#FFFFFF99" }}>
                            {secret ? SHELF_HIDDEN_NAME : m.yearly ? `${depth.year} ${m.name.replace(" 볼마커", "")}` : m.name}
                        </span>
                        <span className="mt-0.5 px-0.5 text-[12px] leading-snug break-keep" style={{ color: award ? "#FFD36B" : "#FFFFFF73" }}>
                            {award ? awardWhen(award) : secret ? SHELF_HIDDEN_HOW : m.how}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
