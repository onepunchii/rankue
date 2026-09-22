/**
 * 채팅 + → "랭큐매치 핀 만들기"(2026-09-23). 코스명 한 칸만 받는다 — 세션(stroke·group)은 서버 카드 라우트가 만들고
 * 핀을 카드에 실어 방 사람들이 바로 참가한다. 조인·부킹 방이면 그 글의 코스명이 기본값으로 들어온다(defaultCourseName).
 * 1~80자(서버와 같은 상한).
 */
import { useEffect, useState } from "react";
import { LucideFlag } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";

export function GolfMatchCreateSheet({ open, onOpenChange, defaultCourseName, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; defaultCourseName?: string; onCreate: (courseName: string) => void }) {
    const { t } = useT();
    const [name, setName] = useState(defaultCourseName ?? "");
    // 열리는 순간에만 기본값을 다시 채운다 — 열어 둔 채 기본값이 바뀌어도 쓰던 글자가 날아가면 안 된다.
    useEffect(() => { if (open) setName(defaultCourseName ?? ""); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const trimmed = name.trim().slice(0, 80);
    const submit = () => { if (!trimmed) return; onCreate(trimmed); onOpenChange(false); };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center"><LucideFlag className="w-4 h-4 text-brand" /></span>
                        {t("chat.attach.golfMatch.title")}
                    </SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.attach.golfMatch.desc")}</SheetDescription>
                </SheetHeader>
                <form className="px-5 space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                    <input
                        value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" enterKeyHint="done"
                        placeholder={t("chat.attach.golfMatch.coursePlaceholder")}
                        className="w-full h-12 px-4 rounded-xl bg-surface-2 text-[15px] text-ink-1 placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-brand/40"
                    />
                    <button type="submit" disabled={!trimmed} className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-40">
                        {t("chat.attach.golfMatch.create")}
                    </button>
                </form>
            </SheetContent>
        </Sheet>
    );
}
