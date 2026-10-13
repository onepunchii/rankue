/**
 * 전체 메뉴(공용 화면 pages/hiq/menu)의 프로필 카드에 놓이는 등산의 한 줄(2026-10-13) — 산행 등급의 휘장 · 이름 · 오른 산의 수.
 *
 * 오너: "지금 등산 전체 메뉴는 당구 메뉴로 되어 있는데 … 등산 전체 메뉴로". 당구의 회원 등급 · 레벨 자리에 대신 놓인다.
 * 값은 등산 홈과 같다(useHikingStamps — 정상에서 인증한 서로 다른 산의 수와 그 수로 정한 등급).
 * 공용 화면이 등산 모듈을 메인 청크에 싣지 않게 lazy 로 불러 쓴다(산악회 홈의 CrewSummits 와 같은 길) — 등산일 때만 그려지므로 내 도장도 그때만 받는다.
 * 높이를 고정해 둔다(받는 동안 카드가 출렁이지 않게 — 메뉴 쪽 fallback 도 같은 높이).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { gradeSrc } from "../theme";
import { useHikingStamps } from "../stamps/useHikingStamps";

export function MenuGrade({ className }: { className?: string }) {
    const s = useHikingStamps();
    // 받는 동안에는 비워 둔다 — '들머리 · 0곳'이 먼저 보였다가 바뀌지 않게
    if (s.isLoading) return <div className={`h-7 ${className ?? ""}`} aria-busy="true" />;
    const { grade, count } = s.grade;
    return (
        <div className={`flex h-7 items-center gap-1.5 text-[13px] ${className ?? ""}`} data-testid="hk-menu-grade" data-grade={grade.id}>
            <img src={gradeSrc(grade.id)} width={28} height={28} alt="" draggable={false} decoding="async" className="block h-7 w-7 shrink-0" />
            <span className="shrink-0 font-semibold text-[#F6D9A8]">{grade.name}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-[#F4EFE352]" aria-hidden />
            <span className="truncate tabular-nums text-[#F4EFE3B3]">오른 산 {count}곳</span>
        </div>
    );
}
