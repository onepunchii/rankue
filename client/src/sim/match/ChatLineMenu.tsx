import { memo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import type { ChatLine } from "../matchApi";

/**
 * 상대 말풍선을 누르면 뜨는 창(2026-10-26 오너 — 멀티방 대전에서 성적인 욕 · 패드립이 오갔는데 판 안에서 할 수 있는 게 없었다).
 * 신고(운영자 검토 큐 — 그때의 말을 증거로 남긴다) · 차단(그 사람의 말 · 방 · 글이 다 가려진다) · 상대 채팅 끄기(이 기기에서, 문구 단추는 보인다).
 * 신고 · 차단은 스토어의 사용자 콘텐츠 요건이기도 하다. ResignConfirm 과 같은 판(sim-dark).
 */
interface Props {
    line: ChatLine | null;
    onClose: () => void;
    onReport: (line: ChatLine) => void;
    onBlock: (line: ChatLine) => void;
    chatOff: boolean;
    onChatOff: (off: boolean) => void;
}

export const ChatLineMenu = memo(function ChatLineMenu(p: Props) {
    const { t } = useT();
    const row = "w-full min-h-[52px] rounded-xl px-4 py-2.5 text-left active:opacity-80";
    return (
        <Dialog open={!!p.line} onOpenChange={(o) => { if (!o) p.onClose(); }}>
            <DialogContent hideClose className="sim-dark sim-table bg-[var(--surface-1)] max-w-[360px] rounded-card p-0 gap-0 flex flex-col" data-testid="sim-chat-menu">
                <DialogHeader className="px-6 pt-6 pb-3 text-left">
                    <DialogTitle>{t("sim.chat.menu.title")}</DialogTitle>
                    <DialogDescription className="mt-1 rounded-xl bg-surface-3 px-3 py-2 text-[13px] font-medium text-ink-2 break-words">
                        {p.line?.text ?? ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2 px-6 pb-3">
                    <button type="button" onClick={() => p.line && p.onReport(p.line)} className={`${row} bg-surface-3`} data-testid="sim-chat-report">
                        <span className="block text-[15px] font-semibold text-ink-1">{t("sim.chat.menu.report")}</span>
                        <span className="block text-[12.5px] text-ink-3">{t("sim.chat.menu.reportDesc")}</span>
                    </button>
                    <button type="button" onClick={() => p.line && p.onBlock(p.line)} className={`${row} bg-surface-3`} data-testid="sim-chat-block">
                        <span className="block text-[15px] font-semibold text-[#FF8A8A]">{t("sim.chat.menu.block")}</span>
                        <span className="block text-[12.5px] text-ink-3">{t("sim.chat.menu.blockDesc")}</span>
                    </button>
                    <button type="button" onClick={() => p.onChatOff(!p.chatOff)} aria-pressed={p.chatOff} className={`${row} bg-surface-3`} data-testid="sim-chat-off">
                        <span className="block text-[15px] font-semibold text-ink-1">{t(p.chatOff ? "sim.chat.menu.on" : "sim.chat.menu.off")}</span>
                        <span className="block text-[12.5px] text-ink-3">{t("sim.chat.menu.offDesc")}</span>
                    </button>
                </div>
                <div className="px-6 pb-6">
                    <button type="button" onClick={p.onClose} className="h-12 w-full rounded-xl border border-surface-line text-[14px] font-semibold text-ink-2">{t("sim.common.close")}</button>
                </div>
            </DialogContent>
        </Dialog>
    );
});
