import { memo } from "react";
import { HiqCrew } from "@shared/schema";
import { CrewRow } from "./CrewRow";

/**
 * 둘러보기 한 줄 — 모양은 CrewRow(내 크루와 같은 줄)가 그린다(2026-09-26).
 * 예전 카드는 종목을 FIELD·SCREEN 같은 원문 코드로 찍고, 누를 수 있는데 <div> 라 키보드로 열 수 없었다.
 * 커버가 없으면 외부 스톡 사진 대신 이니셜 타일 — 그 결정은 CrewRow 가 그대로 잇는다.
 */

interface CrewDiscoveryCardProps {
    crew: HiqCrew & { memberCount?: number; distance?: number };
    /** 내 역할(가입한 크루면) — 가입됨·승인 대기 표시용 */
    myRole?: string | null;
    onClick: () => void;
}

export const CrewDiscoveryCard = memo(({ crew, myRole, onClick }: CrewDiscoveryCardProps) => (
    <CrewRow
        crew={crew}
        role={myRole === "pending" || myRole === "leader" || myRole === "manage" ? myRole : null}
        joined={!!myRole && myRole !== "pending"}
        variant="discover"
        onClick={onClick}
    />
));

CrewDiscoveryCard.displayName = "CrewDiscoveryCard";
