import { useState } from "react";
import { LucideMoreVertical } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ReportDialog, useBlockMember, blockConfirmText, type ReportTargetType } from "./ReportDialog";

// 남의 콘텐츠 옆 ⋯ 메뉴 — [신고] [차단] 두 줄. 크루 게시판·댓글·사진·사진 댓글·채팅·회원 프로필이 같이 쓴다.
// 신고 다이얼로그 안에도 차단 버튼이 있지만 메뉴에 차단을 바로 두는 이유: 심사관이 "차단"을
// 한 번에 찾을 수 있어야 하고(Apple 1.2), 사유를 고르지 않고 그냥 안 보고 싶은 사람이 더 많다.
interface UgcActionMenuProps {
    targetType: ReportTargetType;
    targetId: string;
    crewId?: string;
    authorId: string;
    authorName?: string;
    onBlocked?: () => void;
    align?: "left" | "right";   // 메뉴가 버튼의 어느 쪽 끝에 맞춰 펼쳐지는지
    side?: "bottom" | "top";    // 채팅처럼 입력창 위에 붙는 곳은 위로 연다
    // 채팅 우클릭처럼 버튼 밖에서 메뉴를 열 때
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;         // 트리거 버튼
    iconClassName?: string;
    wrapperClassName?: string;
}

export function UgcActionMenu({
    targetType, targetId, crewId, authorId, authorName, onBlocked,
    align = "right", side = "bottom", open, onOpenChange, className, iconClassName, wrapperClassName,
}: UgcActionMenuProps) {
    const { t } = useT();
    const [innerOpen, setInnerOpen] = useState(false);
    const menuOpen = open ?? innerOpen;
    const setMenuOpen = (o: boolean) => { setInnerOpen(o); onOpenChange?.(o); };
    const [reportOpen, setReportOpen] = useState(false);
    const block = useBlockMember(onBlocked);

    return (
        // 카드·말풍선의 클릭 동작(상세 열기 등)으로 번지지 않게 막는다. 포털로 뜬 신고 다이얼로그의
        // 클릭도 React 트리를 따라 여기까지 올라오므로 같이 막힌다.
        <div className={cn("relative shrink-0", wrapperClassName)} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label={t("community.more")}
                title={t("community.more")}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn("flex items-center justify-center text-black/40 hover:text-ink-2 transition-colors", className ?? "p-1.5")}
            >
                <LucideMoreVertical className={cn("w-4 h-4", iconClassName)} />
            </button>
            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div
                        role="menu"
                        className={cn(
                            "absolute z-50 w-40 rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-black/[0.06] overflow-hidden",
                            align === "left" ? "left-0" : "right-0",
                            side === "top" ? "bottom-9" : "top-9",
                        )}
                    >
                        <button
                            role="menuitem"
                            onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                            className="w-full h-11 px-4 text-left text-[13.5px] font-semibold text-ink-2 hover:bg-black/[0.04] transition-colors"
                        >
                            {t("community.report")}
                        </button>
                        <button
                            role="menuitem"
                            disabled={block.isPending}
                            onClick={() => {
                                setMenuOpen(false);
                                if (window.confirm(blockConfirmText(t, targetType, authorName))) block.mutate(authorId);
                            }}
                            className="w-full h-11 px-4 text-left text-[13.5px] font-semibold text-red-600/80 hover:bg-red-50 transition-colors"
                        >
                            {t("community.blockMenu")}
                        </button>
                    </div>
                </>
            )}
            <ReportDialog
                open={reportOpen}
                onOpenChange={setReportOpen}
                targetType={targetType}
                targetId={targetId}
                targetAuthorId={authorId}
                targetAuthorName={authorName}
                crewId={crewId}
                onBlocked={onBlocked}
            />
        </div>
    );
}
