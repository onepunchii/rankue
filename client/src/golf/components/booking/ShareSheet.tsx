import { LucideX, LucideMessageCircle, LucideCopy, LucideMessageSquare, LucideSend } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';

interface ShareSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shareItem: any;
    onExternalShare: (item: any) => void;
    onCopyLink: (link: string) => void;
    myCrews: any[];
    onSendToCrew: (crew: any, item: any) => void;
}

export const ShareSheet = ({ open, onOpenChange, shareItem, onExternalShare, onCopyLink, myCrews, onSendToCrew }: ShareSheetProps) => {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="z-[80] bg-[#1A1A1A] border-t border-white/5 rounded-t-[2.5rem] focus:outline-none [&&>button]:hidden">
                <div className="absolute right-8 top-8 z-50">
                    <SheetClose asChild>
                        <button className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-white/40 hover:text-white transition-all active:scale-95" title="닫기">
                            <LucideX className="w-6 h-6" />
                        </button>
                    </SheetClose>
                </div>

                <SheetHeader className="mb-8 px-8 pt-8">
                    <SheetTitle className="text-xl font-black text-white">이 티타임 공유하기</SheetTitle>
                </SheetHeader>

                <div className="px-8 pb-12 space-y-8">
                    {/* 외부 공유 섹션 */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => onExternalShare(shareItem)}
                            className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-[#FAE100] hover:scale-[1.02] transition-all group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center">
                                <LucideMessageCircle className="w-6 h-6 text-[#3C1E1E]" />
                            </div>
                            <span className="text-[11px] font-black text-[#3C1E1E] uppercase tracking-widest">카카오톡</span>
                        </button>
                        <button
                            onClick={() => {
                                const link = `${window.location.origin}/golf/booking-list/${shareItem?.id}`;
                                onCopyLink(link);
                            }}
                            className="flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                                <LucideCopy className="w-6 h-6 text-white/60 group-hover:text-white" />
                            </div>
                            <span className="text-[11px] font-black text-white/40 group-hover:text-white uppercase tracking-widest">링크 복사</span>
                        </button>
                    </div>

                    {/* 구분선 */}
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/5"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-4 bg-[#1A1A1A] text-[9px] font-black text-white/10 uppercase tracking-[0.3em]">OR SEND TO CREW</span>
                        </div>
                    </div>

                    {/* 내부 크루 공유 섹션 */}
                    <div className="space-y-3">
                        <div className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1 mb-2">내 크루 채팅방에 보내기</div>
                        {myCrews.length === 0 ? (
                            <div className="p-8 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center">
                                <p className="text-xs font-bold text-white/20">가입된 크루가 없습니다.</p>
                            </div>
                        ) : (
                            myCrews.map((crew: any) => (
                                <button
                                    key={crew.id}
                                    onClick={() => onSendToCrew(crew, shareItem)}
                                    className="w-full p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-[#64DD17]/30 hover:bg-[#64DD17]/5 flex items-center justify-between group transition-all"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-[#64DD17]/20 transition-colors overflow-hidden">
                                            {crew.emblem ? (
                                                <span className="text-xl">{crew.emblem}</span>
                                            ) : (
                                                <LucideMessageSquare className="w-5 h-5 text-white/20 group-hover:text-[#64DD17]" />
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold text-white group-hover:text-[#64DD17] transition-colors">{crew.name}</div>
                                            <div className="text-[10px] font-bold text-white/20 uppercase tracking-tight">{crew.shortIntro || '크루 채팅방'}</div>
                                        </div>
                                    </div>
                                    <LucideSend className="w-4 h-4 text-white/10 group-hover:text-[#64DD17] -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
