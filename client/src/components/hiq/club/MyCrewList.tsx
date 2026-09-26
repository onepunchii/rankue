import { memo } from "react";
import { useLocation } from "wouter";
import { MyCrewCard } from "./MyCrewCard";
import { CrewRow } from "./CrewRow";
import { useMyCrews } from "./useMyCrews";
import { CrewEmpty, CrewError, CrewSkeleton, CREW_TEXT } from "@/components/hiq/crew-ui";
import { LucideUsers, LogIn } from "@/lib/icons";
import { goLogin } from "@/components/hiq/LoginGate";
import { useT } from "@/lib/i18n";

interface MyCrewListProps {
    currentSport: string;
    /** 크루 만들기 — 페이지 머리의 '만들기'와 같은 동작(게스트면 로그인으로). */
    onCreate: () => void;
}

export const MyCrewList = memo(({ currentSport, onCreate }: MyCrewListProps) => {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { data: myCrews, isLoading, isError, refetch, isGuest, authLoading } = useMyCrews(currentSport);

    // 로그인 확인 중·목록 불러오는 중 — 실제 줄 높이(80px)에 맞춘 뼈대
    if (authLoading || (!isGuest && isLoading)) return <CrewSkeleton rows={2} height={80} />;

    // 게스트 — 목록 요청(401) 대신 로그인 안내. 크루 둘러보기는 아래에서 그대로 된다.
    if (isGuest) {
        return (
            <CrewEmpty
                icon={<LogIn />}
                title={t("crewMgmt.guestTitle")}
                desc={t("crewMgmt.guestDesc")}
                action={{ label: t("crewMgmt.login"), onClick: () => goLogin(setLocation, "/club") }}
            />
        );
    }

    // 실패는 '크루가 없어요'와 다르다 — 없는 줄 알고 새로 만들게 하면 안 된다.
    if (isError) return <CrewError onRetry={() => refetch()} />;

    const rows = myCrews ?? [];
    const active = rows.filter((r) => r.role !== "pending");
    // 가입 신청 중(승인 대기)은 아직 내 크루가 아니다 — 예전엔 '멤버' 크루처럼 섞여 보였다. 아래에 따로 모은다.
    const pending = rows.filter((r) => r.role === "pending");

    return (
        <div className="flex flex-col gap-2">
            {active.length === 0 ? (
                <CrewEmpty
                    icon={<LucideUsers />}
                    title={t("myCrewList.emptyTitle")}
                    desc={t("myCrewList.emptyDesc")}
                    action={{ label: t("myCrewList.createCrew"), onClick: onCreate }}
                />
            ) : (
                active.map(({ crew, role, memberCount, pulse }) => (
                    <MyCrewCard
                        key={crew.id}
                        crew={{ ...crew, memberCount, pulse }}
                        role={role}
                        onClick={() => setLocation(`/club/${crew.id}`)}
                        // 인원 칸은 멤버 목록으로 — 크루 홈의 멤버 구역으로 스크롤한다(CrewHomeTab 이 focus 를 읽는다)
                        onMembers={() => setLocation(`/club/${crew.id}?tab=home&focus=members`)}
                    />
                ))
            )}

            {pending.length > 0 && (
                <div className="flex flex-col gap-2 mt-3">
                    <p className={CREW_TEXT.caption}>
                        {t("crewMgmt.pendingSection")} <span className="rk-num">{pending.length}</span>
                    </p>
                    {pending.map(({ crew, memberCount }) => (
                        <CrewRow
                            key={crew.id}
                            crew={{ ...crew, memberCount }}
                            role="pending"
                            variant="mine"
                            onClick={() => setLocation(`/club/${crew.id}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

MyCrewList.displayName = "MyCrewList";
