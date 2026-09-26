import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface CrewSheetAction {
    key: string;
    label: string;
    icon?: ReactNode;
    /** 되돌리기 어려운 동작(내보내기·나가기)은 빨간 글씨 */
    tone?: "default" | "danger";
    onSelect: () => void;
    disabled?: boolean;
}

/**
 * 아래에서 올라오는 동작 목록(2026-09-26). 멤버 관리의 '운영진 임명·크루장 넘기기·내보내기'와 크루 머리의 '더보기'가 쓴다.
 * 예전엔 멤버 줄마다 버튼 두세 개를 붙여 375px 에서 이름이 밀려 나갔다 — 줄은 누르기만 하고 동작은 여기 모은다.
 * 줄 하나 = 56px(44px 이상), 아이콘 + 글. 고르면 시트를 닫고 동작을 부른다(확인 창은 부르는 쪽이 띄운다).
 */
export function CrewActionSheet({ open, onOpenChange, title, subtitle, header, actions }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    /** 제목 위에 그릴 것(예: 멤버 아바타) */
    header?: ReactNode;
    actions: CrewSheetAction[];
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                hideClose
                className="max-w-md mx-auto rounded-t-card bg-surface-1 border-surface-line p-0 pb-[calc(env(safe-area-inset-bottom)+8px)]"
            >
                <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
                    <span className="w-10 h-1 rounded-full bg-surface-3" />
                </div>
                <div className="px-4 pt-2 pb-3 flex items-center gap-3 border-b border-surface-line">
                    {header}
                    <div className="min-w-0">
                        <SheetTitle className="text-[17px] font-semibold text-ink-1 truncate">{title}</SheetTitle>
                        <SheetDescription className={cn("text-[13px] font-medium text-ink-3 truncate", !subtitle && "sr-only")}>
                            {subtitle || title}
                        </SheetDescription>
                    </div>
                </div>
                <ul className="py-1">
                    {actions.map((a) => (
                        <li key={a.key}>
                            <button
                                type="button"
                                disabled={a.disabled}
                                onClick={() => { onOpenChange(false); a.onSelect(); }}
                                className={cn(
                                    "w-full h-14 px-4 flex items-center gap-3 text-left text-[15px] font-medium active:bg-surface-3 disabled:opacity-40 [&_svg]:w-5 [&_svg]:h-5",
                                    a.tone === "danger" ? "text-destructive" : "text-ink-1",
                                )}
                            >
                                {a.icon && <span className={a.tone === "danger" ? "text-destructive" : "text-ink-3"}>{a.icon}</span>}
                                {a.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </SheetContent>
        </Sheet>
    );
}
