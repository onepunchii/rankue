/**
 * 크루 방 + → "공지"(운영진, 2026-09-26 크루 채팅 1단계). 제목·내용을 받아 게시판에 **공지 글**(맨 위 고정)로 올리고,
 * 부르는 쪽이 그 글을 채팅 카드로 붙인다. 게시판 공지와 같은 글이라 채팅이 흘러가도 게시판에 남는다.
 * 길이 상한은 게시판 글쓰기와 같다(내용 4000자 — 서버 POST /crews/:id/posts).
 */
import { useEffect, useState } from "react";
import { LucideLoader2, LucideMegaphone } from "@/lib/icons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";

export function NoticeComposeSheet({ open, onOpenChange, busy, onSubmit }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    busy: boolean;
    onSubmit: (v: { title: string; content: string }) => void;
}) {
    const { t } = useT();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    // 닫았다 열면 비운다 — 올린 공지가 다음 공지 칸에 남지 않게.
    useEffect(() => { if (open) { setTitle(""); setContent(""); } }, [open]);
    const ok = title.trim().length > 0 && content.trim().length > 0;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom" hideClose
                // 내용 칸이 키보드 뒤로 숨지 않게 키보드 높이만큼 올린다(채팅 방 본문과 같은 변수).
                style={{ marginBottom: "var(--keyboard-height, 0px)" }}
                className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center"><LucideMegaphone className="w-4 h-4 text-brand" /></span>
                        {t("chat.notice.title")}
                    </SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("chat.notice.desc")}</SheetDescription>
                </SheetHeader>
                <form className="px-5 space-y-2.5" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onSubmit({ title: title.trim(), content: content.trim() }); }}>
                    <input
                        value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoComplete="off"
                        placeholder={t("chat.notice.titlePh")}
                        className="w-full h-12 px-4 rounded-xl bg-surface-2 text-[15px] text-ink-1 placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-brand/40"
                    />
                    <textarea
                        value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} rows={5}
                        placeholder={t("chat.notice.bodyPh")}
                        className="w-full px-4 py-3 rounded-xl bg-surface-2 text-[15px] leading-relaxed text-ink-1 placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-brand/40 resize-none"
                    />
                    <button type="submit" disabled={!ok || busy} className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                        {busy && <LucideLoader2 className="w-4 h-4 animate-spin" />}{t("chat.notice.submit")}
                    </button>
                </form>
            </SheetContent>
        </Sheet>
    );
}
