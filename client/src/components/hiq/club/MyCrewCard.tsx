import { memo } from "react";
import { HiqCrew } from "@shared/schema";
import type { CrewPulseLite } from "@shared/crewBrand";
import { CrewRow } from "./CrewRow";

/**
 * 내 크루 한 줄 — 모양은 CrewRow(둘러보기와 같은 줄)가 그린다(2026-09-26).
 *
 * 2026-09-23 재작성의 결정은 그대로 이어 간다: 왕관 없음, 역할 배지는 이름 옆, 지역을 인원보다 앞에,
 * 인원은 누를 수 있는 칸(멤버 목록으로). 달라진 점은 인원 칸이 카드 안의 중첩 버튼(24px)이 아니라
 * 카드 옆의 44px 형제 버튼이 됐다는 것과, 역할 배지가 크루장·운영진·승인 대기를 모두 말한다는 것이다
 * (예전엔 운영진도 '멤버', 가입 신청 중인 크루도 '멤버'로 보였다).
 */

interface MyCrewCardProps {
    crew: HiqCrew & { memberCount?: number; pulse?: CrewPulseLite | null };
    role: string;
    onClick: () => void;
    /** 인원 칸을 눌렀을 때 — 멤버 목록으로. 없으면 인원은 줄 안의 글자로만 보인다. */
    onMembers?: () => void;
}

export const MyCrewCard = memo(({ crew, role, onClick, onMembers }: MyCrewCardProps) => (
    <CrewRow crew={crew} role={role} variant="mine" onClick={onClick} onMembers={onMembers} />
));

MyCrewCard.displayName = "MyCrewCard";
