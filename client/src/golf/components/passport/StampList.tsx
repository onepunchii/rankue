import { motion } from "framer-motion";
import { Stamp } from "@/golf/hooks/usePassportData";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

/**
 * 도장 보기. 인증 도장(현장 인증 + 이 규칙 전 옛 기록)은 지금까지처럼, 현장 인증 없이 적은 골프장은 그 뒤에
 * 흐린 '기록 도장'으로(2026-09-30 오너 결정 — 점수·평균은 남고 도장만 흐리다. 정복·지역·Elite 60 에는 안 센다).
 */
export const StampList = ({ stamps, records = [] }: { stamps: Stamp[]; records?: Stamp[] }) => {
    const [, setLocation] = useLocation();
    // 예전엔 비어 있으면 가짜 '88 CC' 도장을 보여 줬다. 비었으면 비었다고, 어떻게 받는지 말한다.
    if (stamps.length === 0 && records.length === 0) {
        return (
            <div className="py-16 px-6 text-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] mb-8">
                <p className="text-base font-black text-white/80">아직 찍힌 도장이 없어요</p>
                <p className="mt-2 text-[12px] font-bold text-white/50 break-keep">
                    골프장에서 랭큐매치로 18홀을 끝까지 적고 라운드를 끝내면, 그 골프장 도장이 여기 찍혀요. 같은 곳은 한 번만 찍혀요.
                </p>
                <button
                    onClick={() => setLocation('/golf/game/new?mode=match')}
                    className="mt-6 h-11 px-6 rounded-full bg-[#64DD17] text-[#051907] text-sm font-black"
                >
                    라운드 시작
                </button>
            </div>
        );
    }
    return (
        <>
        {stamps.length === 0 && (
            <p className="mb-4 px-2 text-[13px] text-[#FFFFFF8C] break-keep">아직 현장 인증 도장이 없어요. 골프장에서 라운드를 적으면 또렷한 도장이 찍혀요.</p>
        )}
        <motion.div
            key="stamp"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-3 gap-3 p-2"
        >
            {stamps.map((stamp, i) => {
                // 회전 각도 (약간의 랜덤성)
                const rotation = ((i * 13) % 12) - 6;

                return (
                    <div
                        key={stamp.id}
                        className="relative aspect-[4/5] bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-center overflow-hidden group hover:bg-white/[0.04] transition-colors"
                    >
                        {/* 여권 페이지의 은은한 가이드라인 (선택사항) */}
                        <div className="absolute inset-2 border border-dashed border-white/5 rounded-lg opacity-50" />

                        <motion.div
                            initial={{ opacity: 0, scale: 1.5, rotate: rotation, filter: "blur(5px)" }}
                            animate={{ opacity: 1, scale: 0.9, rotate: rotation, filter: "blur(0px)" }}
                            transition={{
                                default: { type: "spring", stiffness: 200, damping: 18, delay: i * 0.05 },
                                filter: { duration: 0.5, ease: "easeOut", delay: i * 0.05 }
                            }}
                            className="relative w-[90%] aspect-square flex items-center justify-center"
                        >
                            {/* 스탬프 본체 (원형) */}
                            <div
                                className={cn(
                                    "w-full h-full rounded-full border-[2px] border-double flex flex-col items-center justify-center text-center p-1 backdrop-blur-[1px] transition-transform duration-300 hover:scale-105",
                                )}
                                style={{
                                    borderColor: stamp.color,
                                    backgroundColor: `${stamp.color}05`,
                                    boxShadow: `0 0 10px ${stamp.color}10, inset 0 0 10px ${stamp.color}05`
                                }}
                            >
                                {/* 날짜 */}
                                <span className="text-[7px] font-bold tracking-tight opacity-70 font-mono mb-0.5" style={{ color: stamp.color }}>
                                    {stamp.date}
                                </span>

                                {/* 구장명 (줄바꿈 허용, 글자 크기 조정) */}
                                <h4
                                    className="text-[10px] font-black leading-tight mb-1 break-keep w-full px-1 drop-shadow-md line-clamp-2"
                                    style={{ color: stamp.color, textShadow: `0 0 5px ${stamp.color}30` }}
                                >
                                    {stamp.name}
                                </h4>

                                {/* 구분선 */}
                                <div className="w-1/2 h-[0.5px] mb-1 opacity-40 mx-auto" style={{ backgroundColor: stamp.color }} />

                                {/* 점수 */}
                                <div className="flex items-baseline gap-0.5 mb-1">
                                    <span
                                        className="text-2xl font-black italic tracking-tighter leading-none"
                                        style={{ color: stamp.color, textShadow: `0 0 8px ${stamp.color}40` }}
                                    >
                                        {stamp.score}
                                    </span>
                                    <span
                                        className="text-[6px] font-bold uppercase tracking-wide opacity-70"
                                        style={{ color: stamp.color }}
                                    >
                                        BEST
                                    </span>
                                </div>

                                {stamp.rounds > 1 && (
                                    <span className="text-[7px] font-black mb-0.5" style={{ color: stamp.color }}>{stamp.rounds}회 라운드</span>
                                )}
                                {/* 지역 */}
                                <span
                                    className="text-[6px] font-bold uppercase tracking-[0.15em] opacity-50"
                                    style={{ color: stamp.color }}
                                >
                                    {stamp.region}
                                </span>
                            </div>
                        </motion.div>
                    </div>
                );
            })}
        </motion.div>
        {records.length > 0 && <RecordStamps records={records} />}
        </>
    );
};

/**
 * 기록 도장 — 현장 인증 없이 적은 골프장. 흐린 회색 점선 도장 + 작은 '기록' 표지. 누를 것도, 빛나는 것도 없다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
function RecordStamps({ records }: { records: Stamp[] }) {
    return (
        <section className="mt-6 mb-2" aria-label="기록 도장">
            <div className="px-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-[#FFFFFF99]">기록 도장 <span className="text-[#FFFFFF59] tabular-nums">{records.length}</span></h3>
                <span className="text-[12px] text-[#FFFFFF59]">정복 수에 안 들어가요</span>
            </div>
            <p className="mt-1 px-2 text-[12.5px] leading-relaxed text-[#FFFFFF73] break-keep">
                현장 인증 없이 적은 라운드예요. 점수·평균은 그대로 남고, 그 골프장에서 다시 치면 또렷한 도장이 돼요.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 p-2">
                {records.map((stamp, i) => {
                    const rotation = ((i * 13) % 12) - 6;
                    return (
                        <div key={stamp.id} className="relative aspect-[4/5] bg-[#FFFFFF03] border border-[#FFFFFF0A] rounded-xl flex items-center justify-center overflow-hidden">
                            <span className="absolute top-1.5 right-1.5 h-[18px] px-1.5 rounded-md bg-[#FFFFFF0F] text-[10.5px] font-semibold leading-[18px] text-[#FFFFFF8C]">기록</span>
                            <div
                                className="relative w-[84%] aspect-square rounded-full border-[1.5px] border-dashed border-[#FFFFFF33] flex flex-col items-center justify-center text-center p-1 opacity-70"
                                style={{ transform: `rotate(${rotation}deg)` }}
                            >
                                <span className="text-[8px] font-medium tabular-nums text-[#FFFFFF66] mb-0.5">{stamp.date}</span>
                                <h4 className="text-[10px] font-semibold leading-tight mb-1 break-keep w-full px-1 line-clamp-2 text-[#FFFFFF8C]">{stamp.name}</h4>
                                <div className="w-1/2 h-px mb-1 bg-[#FFFFFF1F]" />
                                {stamp.score != null && (
                                    <span className="text-[18px] font-semibold leading-none tabular-nums text-[#FFFFFF8C]">{stamp.score}</span>
                                )}
                                {stamp.rounds > 1 && <span className="mt-0.5 text-[8px] font-medium text-[#FFFFFF59]">{stamp.rounds}회 라운드</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
