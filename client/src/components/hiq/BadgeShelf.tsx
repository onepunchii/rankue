import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 큐 컬렉션 — 기록 기반 뱃지 진열장 (마이페이지).
// 순위가 아니라 '순간'을 수집한다: 하위권도 개근·이닝 계열로 채울 게 항상 있다.
// 등급: 1 나무큐 → 2 카본큐 → 3 금장큐 → 4 명인큐 (서버 계산, 소급 자동).

interface Badge { id: string; value: number; tier: number; next: number | null }

const TIER_STYLE = [
    "bg-black/[0.03] text-black/35",                 // 0 미획득
    "bg-brand/[0.07] text-brand",                    // 1 나무 — 시그니처 그린 연톤
    "bg-black/[0.08] text-black/70",                 // 2 카본
    "bg-[#cba258]/15 text-[#8a6a2a]",                // 3 금장
    "bg-brand text-white",                           // 4 명인 — 꽉 찬 브랜드 그린
];

// 등급 게이지 세그먼트 색 — 획득한 칸은 해당 등급의 큐 색 (연그린→카본→금장→딥그린)
const TIER_FILL = ["#7fb89a", "#3a3a3c", "#cba258", "#006241"];

// 랜딩·데스크탑 프레임과 같은 획으로 그린 당구 뱃지 아이콘 (currentColor 상속 — 등급 색이 곧 아이콘 색)
const Ico = ({ children }: { children: React.ReactNode }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]" aria-hidden>
        {children}
    </svg>
);
const BADGE_ICON: Record<string, React.ReactNode> = {
    // 3쿠션 하이런 — 당구대 위 쿠션을 세 번 도는 궤적 + 수구
    hr3c: (
        <Ico>
            <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
            <path d="M5.5 16.5 9 7.5l4.5 9 4.5-9" strokeDasharray="0" />
            <circle cx="5.5" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
        </Ico>
    ),
    // 4구 하이런 — 공 네 개
    hr4c: (
        <Ico>
            <circle cx="8" cy="8" r="3.4" />
            <circle cx="16" cy="8" r="3.4" />
            <circle cx="8" cy="16" r="3.4" />
            <circle cx="16" cy="16" r="3.4" fill="currentColor" stroke="none" />
        </Ico>
    ),
    // 이닝 클럽 — 이닝을 세는 초크 큐브 (당구의 시간 단위)
    innings: (
        <Ico>
            <path d="M5 9.5 12 6l7 3.5v6L12 19l-7-3.5z" />
            <path d="M5 9.5 12 13l7-3.5M12 13v6" />
        </Ico>
    ),
    // 경기 수 — 점수판 (상하 점수 + 구분선)
    games: (
        <Ico>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="M3 12h18M8.5 8.5h.01M8.5 15.5h.01" />
            <path d="M12.5 8.5H16M12.5 15.5H16" />
        </Ico>
    ),
    // 승리 — 세워진 큐 두 자루 교차 + 공 (트로피 대신 당구답게)
    wins: (
        <Ico>
            <path d="M6 20 16.5 4.5M18 20 7.5 4.5" />
            <circle cx="12" cy="19" r="2.2" fill="currentColor" stroke="none" />
        </Ico>
    ),
    // 출석 — 당구대 다이아(포인트) 마크
    visits: (
        <Ico>
            <path d="M12 3.5 19 12l-7 8.5L5 12z" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </Ico>
    ),
};

// 등급 게이지 — 큐 스틱 4마디: 채워진 마디 수 = 달성한 등급
const TierGauge = ({ tier, label }: { tier: number; label: string }) => (
    <div className="flex items-center gap-[3px] mt-1.5" aria-label={label}>
        {[0, 1, 2, 3].map((i) => (
            <span
                key={i}
                className="h-[4px] flex-1 rounded-full"
                // 명인(꽉 찬 그린 카드)에서는 등급색이 배경에 묻혀 흰색 게이지로 전환
                style={{
                    background: i < tier
                        ? (tier === 4 ? "rgba(255,255,255,0.92)" : TIER_FILL[i])
                        : (tier === 4 ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.08)"),
                }}
            />
        ))}
    </div>
);

export const BadgeShelf = () => {
    const { t } = useT();
    const tierName = (tier: number) => t(`badgeShelf.tier${tier}`);
    const badgeName = (id: string) => t(`badgeShelf.name.${id}`);
    const { data } = useQuery<{ badges: Badge[] }>({
        queryKey: ["/api/hiq/me/badges"],
        staleTime: 10 * 60 * 1000,
    });
    const badges = data?.badges ?? [];
    // 획득 전이라도 진행도(value>0)가 있으면 그리드를 보여준다 — "다음 등급까지 N"이 동기부여다
    const hasProgress = badges.some((b) => b.value > 0);

    return (
        <div className="rk-card p-5">
            <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[15px] font-bold text-ink-1">{t("badgeShelf.title")}</h3>
                <span className="text-[11.5px] font-medium text-black/40">{t("badgeShelf.subtitle")}</span>
            </div>
            {!hasProgress ? (
                <p className="text-[13px] text-black/45 text-center py-4">{t("badgeShelf.empty")}</p>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {badges.map((b) => (
                        <div key={b.id} className={cn("rounded-2xl p-3", TIER_STYLE[b.tier])}>
                            <div className="flex items-start gap-2.5">
                                <span className={cn("shrink-0 mt-0.5", b.tier === 0 && "opacity-45")}>{BADGE_ICON[b.id]}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12.5px] font-bold leading-tight">{badgeName(b.id)}</p>
                                    <p className="text-[12px] font-semibold mt-0.5 tabular-nums">
                                        {b.tier > 0 ? `${tierName(b.tier)} · ${b.value.toLocaleString()}` : (b.next != null ? t("badgeShelf.next").replace("{n}", (b.next - b.value).toLocaleString()) : "")}
                                    </p>
                                </div>
                            </div>
                            <TierGauge tier={b.tier} label={t("badgeShelf.tierLabel").replace("{n}", String(b.tier))} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
