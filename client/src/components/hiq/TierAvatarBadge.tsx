/**
 * 프로필 사진 오른쪽 아래의 **온라인 대전 등급 배지**(2026-10-12 오너: "우리가 만든 티어를 채팅 사진 프로필이나 친구 프로필에 적용하고 싶은데").
 * 남이 내 배지를 본다는 것이 '갖고 싶게'의 가장 큰 힘이다.
 *
 * 지키는 것(기획 docs/01-plan/features/online-game-monthly-tournament-badges.md 12-3 ②)
 *  - **등급이 있는 사람만**(배치 3판 뒤). 없는 사람에게는 아무것도 그리지 않는다 — 자리도 차지하지 않는다.
 *  - **골프 화면에서는 그리지 않는다** — 당구 온라인게임의 등급이다. 등산 화면에서도 같다(2026-10-13) —
 *    등산일 때 currentSport 는 당구로 보고되므로(SportContext) isHiking 을 따로 본다.
 *  - 실전 실력(다마 · RP)과 헷갈리지 않게 읽어 주는 이름은 "온라인 대전 골드"다(글자가 없는 배지라 이름으로 밝힌다).
 *  - 사진 상자가 overflow-hidden 이면 그 **바깥의 relative 상자**에 넣어야 잘리지 않는다.
 * 등급은 sim/rank/simTiers 의 표 하나에서 읽는다 — 화면마다 서버 응답에 등급을 싣지 않는다.
 */
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSport } from "@/contexts/SportContext";
import { TIERS } from "@shared/sim/rank";
import { useSimTier } from "@/sim/rank/simTiers";
import { TierEmblem } from "@/sim/rank/TierEmblem";

export function TierAvatarBadge({ memberId, size = 20, className }: {
    memberId: string | null | undefined;
    /** 한 변(px). 사진의 3분의 1 남짓이 알맞다 */
    size?: number;
    /** 자리 — 기본은 오른쪽 아래 모서리에 살짝 걸친다 */
    className?: string;
}) {
    const { t } = useT();
    const { currentSport, isHiking: hikingOnly, isFishing } = useSport();
    const isHiking = hikingOnly || isFishing; // 낚시에도 당구의 등급 배지를 붙이지 않는다
    const tier = useSimTier(memberId);
    if (isHiking) return null;
    if (!tier || currentSport === "GOLF") return null;
    const name = t("sim.rank.badgeAria").replace("{tier}", t(TIERS.find((x) => x.id === tier)!.nameKey));
    return (
        <span className={cn("absolute -bottom-1 -right-1 pointer-events-none", className)} title={name} data-testid="tier-avatar-badge">
            <TierEmblem tier={tier} size={size} label={name} />
        </span>
    );
}

/**
 * 프로필 창의 **글자 한 줄** — "온라인 대전 골드". 사진 위 배지에는 글자가 없어 무엇의 등급인지 알 수 없다:
 * 한 사람을 크게 보여 주는 창에서는 이름으로 밝힌다(실전 다마 · RP 와 헷갈리지 않게). 등급이 없거나 골프 화면이면 그리지 않는다.
 */
export function TierNameChip({ memberId, className }: { memberId: string | null | undefined; className?: string }) {
    const { t } = useT();
    const { currentSport, isHiking: hikingOnly, isFishing } = useSport();
    const isHiking = hikingOnly || isFishing; // 낚시에도 당구의 등급 배지를 붙이지 않는다
    const tier = useSimTier(memberId);
    if (isHiking) return null;
    if (!tier || currentSport === "GOLF") return null;
    const name = t("sim.rank.badgeAria").replace("{tier}", t(TIERS.find((x) => x.id === tier)!.nameKey));
    return (
        <span className={cn("inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 rounded-pill bg-[#1e1812] text-white text-[12px] font-bold", className)} data-testid="tier-name-chip">
            <TierEmblem tier={tier} size={20} />
            {name}
        </span>
    );
}

export default TierAvatarBadge;
