import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LucideInfo, LucideBriefcase, LucideTrophy, LucideTrendingUp, LucideInfo as LucideInfoSmall } from "lucide-react";
import { cn } from "@/lib/utils";

export type InfoModalType = "announcement" | "guide" | "ranking";

interface InfoModalProps {
    type: InfoModalType | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sport?: "BILLIARDS" | "GOLF";
}

export function InfoModal({ type, open, onOpenChange, sport = "BILLIARDS" }: InfoModalProps) {
    if (!type) return null;

    const isGolf = sport === "GOLF";
    const themeColor = isGolf ? "text-[#64DD17]" : "text-[#10B981]";
    const themeBg = isGolf ? "bg-[#64DD17]" : "bg-[#10B981]";
    const themeBorder = isGolf ? "border-[#64DD17]" : "border-[#10B981]";

    // 공통 공지사항
    const announcementContent = (
        <div className="space-y-3">
            <div className="bg-[#1a1a1a] border border-white/5 p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-black text-black", themeBg)}>NOTICE</span>
                    <span className="text-[10px] text-white/30 font-mono">2026.02.01</span>
                </div>
                <h3 className="font-bold text-sm text-white mb-1">랭큐(Rankue) 정식 서비스 런칭</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                    당구와 골프를 아우르는 프리미엄 점수 관리 플랫폼, 랭큐가 정식 런칭되었습니다.
                </p>
            </div>
            <div className="bg-[#1a1a1a] border border-white/5 p-4 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500 text-black">UPDATE</span>
                    <span className="text-[10px] text-white/30 font-mono">2026.01.25</span>
                </div>
                <h3 className="font-bold text-sm text-white mb-1">골프 모드 및 크루 기능 업데이트</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                    나만의 골프 기록 관리와 함께, 동호회 활동을 위한 '크루' 기능이 추가되었습니다.
                </p>
            </div>
        </div>
    );

    // 이용안내 (분기)
    const guideContent = isGolf ? (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-black text-sm", themeBg + "/10", themeColor)}>1</div>
                    <div className={cn("w-0.5 h-full", themeBg + "/10")} />
                </div>
                <div className="pb-6">
                    <h3 className="font-bold text-white text-sm">라운딩 및 스코어 기록</h3>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                        필드, 스크린, 연습장 어디서든 게임을 즐기시고 스코어를 기록하세요.
                    </p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-black text-sm", themeBg + "/10", themeColor)}>2</div>
                    <div className={cn("w-0.5 h-full", themeBg + "/10")} />
                </div>
                <div className="pb-6">
                    <h3 className="font-bold text-white text-sm">핸디캡 관리</h3>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                        입력된 스코어를 바탕으로 공식 핸디캡(Handicap)이 자동으로 계산됩니다.
                    </p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-black text-sm", themeBg + "/10", themeColor)}>3</div>
                </div>
                <div>
                    <h3 className="font-bold text-white text-sm">회원권 거래소</h3>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                        전국 골프장 회원권 시세를 확인하고 안전하게 거래할 수 있습니다.
                    </p>
                </div>
            </div>
        </div>
    ) : (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-black text-sm", themeBg + "/10", themeColor)}>1</div>
                    <div className={cn("w-0.5 h-full", themeBg + "/10")} />
                </div>
                <div className="pb-6">
                    <h3 className="font-bold text-white text-sm">매장 방문 및 체크인</h3>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                        제휴 매장에 방문하여 QR 코드를 스캔하세요. 자동으로 로그인이 완료됩니다.
                    </p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-black text-sm", themeBg + "/10", themeColor)}>2</div>
                </div>
                <div>
                    <h3 className="font-bold text-white text-sm">게임 기록 및 분석</h3>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                        디지털 점수판으로 게임을 즐기면 경기 결과와 영상이 자동으로 저장됩니다.
                    </p>
                </div>
            </div>
        </div>
    );

    // 랭킹 시스템 (분기)
    const rankingContent = isGolf ? (
        <div className="space-y-4">
            <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5">
                <h3 className="font-bold text-white text-sm mb-3">티어 시스템 (Tier)</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[#e5e4e2] font-bold flex items-center gap-1">💎 PLATINUM</span>
                        <span className="text-white/40">핸디캡 0 ~ 5</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-full h-full bg-[#e5e4e2]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#ffd700] font-bold flex items-center gap-1">🥇 GOLD</span>
                        <span className="text-white/40">핸디캡 6 ~ 12</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-[70%] h-full bg-[#ffd700]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#c0c0c0] font-bold flex items-center gap-1">🥈 SILVER</span>
                        <span className="text-white/40">핸디캡 13 ~ 18</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-[50%] h-full bg-[#c0c0c0]" />
                    </div>
                </div>
            </div>

            <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5">
                <h3 className="font-bold text-white text-sm mb-2">RANKUE ELITE 60</h3>
                <ul className="text-xs text-white/50 space-y-1.5 list-disc pl-4">
                    <li>전국 상위 60명의 골퍼를 위한 명예의 전당입니다.</li>
                    <li>공식 핸디캡과 대회 성적을 종합하여 선정됩니다.</li>
                </ul>
            </div>
        </div>
    ) : (
        <div className="space-y-4">
            <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5">
                <h3 className="font-bold text-white text-sm mb-3">티어 시스템 (Tier)</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[#e5e4e2] font-bold flex items-center gap-1">💎 PLATINUM</span>
                        <span className="text-white/40">상위 10%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-[15%] h-full bg-[#e5e4e2]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#ffd700] font-bold flex items-center gap-1">🥇 GOLD</span>
                        <span className="text-white/40">상위 30%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-[30%] h-full bg-[#ffd700]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#c0c0c0] font-bold flex items-center gap-1">🥈 SILVER</span>
                        <span className="text-white/40">상위 60%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="w-[60%] h-full bg-[#c0c0c0]" />
                    </div>
                </div>
            </div>

            <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5">
                <h3 className="font-bold text-white text-sm mb-2">RP (Rank Point)</h3>
                <ul className="text-xs text-white/50 space-y-1.5 list-disc pl-4">
                    <li>승패와 상대 RP 차이를 기반으로 점수가 변동됩니다.</li>
                    <li>최근 10경기 승률이 티어 산정에 큰 영향을 미칩니다.</li>
                </ul>
            </div>
        </div>
    );

    const data = {
        announcement: { title: "공지사항", icon: LucideInfo, content: announcementContent },
        guide: { title: "이용안내", icon: LucideBriefcase, content: guideContent },
        ranking: { title: "랭킹 시스템 안내", icon: LucideTrophy, content: rankingContent }
    };

    const currentData = data[type];
    const Icon = currentData.icon;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0f0f0f] border-[#333] text-white rounded-[2rem] w-[90%] max-w-sm p-6 gap-0">
                <DialogHeader className="mb-6">
                    <DialogTitle className="flex items-center gap-3 text-lg font-black tracking-tight">
                        <div className={cn("w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-colors",
                            isGolf ? "text-[#64DD17] bg-[#64DD17]/10" : "text-[#10B981] bg-[#10B981]/10")}>
                            <Icon className="w-5 h-5" />
                        </div>
                        {currentData.title}
                    </DialogTitle>
                </DialogHeader>

                {currentData.content}

                <div className="mt-6 pt-6 border-t border-white/5">
                    <button
                        onClick={() => onOpenChange(false)}
                        className={cn("w-full h-12 rounded-xl text-black font-bold text-sm transition-colors",
                            isGolf ? "bg-[#64DD17] hover:bg-[#52c410]" : "bg-white hover:bg-white/90")}
                    >
                        확인
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
