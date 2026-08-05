import { useT } from "@/lib/i18n";
import type { CommunitySkillBadge } from "./types";

// 실력 뱃지 — 다마수(핸디)·에버리지. hideSkillBadge인 작성자는 badge가 null로 와서 안 그린다.
// 4구 기록이 있으면 4구, 없으면 3구를 보여준다.
export const SkillBadge = ({ badge }: { badge: CommunitySkillBadge | null }) => {
    const { t } = useT();
    if (!badge) return null;

    const is4c = badge.handi4c != null || (badge.avg4c ?? 0) > 0;
    const handi = is4c ? badge.handi4c : badge.handi3c;
    const avg = is4c ? badge.avg4c : badge.avg3c;
    if (handi == null && !avg) return null;

    const parts: string[] = [];
    if (handi != null) parts.push(`${is4c ? t("community.fourBall") : t("community.threeBall")} ${handi}`);
    if (avg) parts.push(`${t("community.avg")} ${avg.toFixed(2)}`);

    return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-brand/10 text-[10.5px] font-semibold text-brand leading-none">
            {parts.join(" · ")}
        </span>
    );
};
