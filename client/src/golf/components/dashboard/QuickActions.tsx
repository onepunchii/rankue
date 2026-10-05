import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import {
    LucideHash,
    LucideChevronRight,
    LucideFlag,
} from "lucide-react";
import { useGuestGate } from "@/components/hiq/GuestGate";

interface QuickActionsProps {
    onOpenGameMode: () => void;
    onOpenJoin: () => void;
}

/**
 * 골프 게임(필드 골프 3D · 온라인 골프) 입구를 보일지 — 2026-09-21 오너: "완성도가 떨어지고 별로다, 지우지 말고 가리자".
 *
 * 왜 지우지 않나: 지금까지 **플레이 기록이 0건**이라(방 0 · 참가자 0) 가려도 잃는 사용자가 없는데,
 * shared/golf/field 물리 엔진은 테스트가 붙은 결정론 코드라 다시 만들려면 비용이 크다. 완성도가 낮아 보이는 건
 * 엔진이 아니라 그 위에 임시로 얹은 화면이다. 그래서 **입구만 닫는다** — 라우트(/golf/play·/golf/arcade·/golf/range)는
 * 그대로라 주소를 직접 치면 열리고, 다듬어서 다시 열 땐 이 값을 true 로 되돌리면 된다.
 */
const SHOW_GOLF_GAMES = false;

export function QuickActions({ onOpenGameMode, onOpenJoin }: QuickActionsProps) {
    const [, setLocation] = useLocation();
    /**
     * 비로그인 방문자의 문(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다" —
     * 내 기록을 쌓으려 할 때 가입을 권한다).
     *
     * 네 타일은 전부 회원 전용 화면의 입구다 — 셋(라운드 기록·매치 입장·골프 여권)은 내 기록이 쌓이는 곳이고, 프로암은 아직 '준비 중' 안내 화면이다.
     * 방문자가 누르면 **입구에서** 가입 안내 시트를 연다 —
     * 번호 네 자리를 다 누른 뒤에, 또는 다음 화면으로 넘어간 뒤에 '로그인이 필요합니다'를 보는 일이 없게.
     * from 은 가려던 주소라 가입을 마치면 그 화면에서 바로 이어진다. 회원이면 guard 가 예전 동작을 그대로 실행한다.
     */
    const gate = useGuestGate("dark");

    return (
        <>
            {/* 가입 안내 시트 — 방문자가 타일을 눌렀을 때만 열린다(닫혀 있으면 아무것도 그리지 않는다) */}
            {gate.sheet}
            {/* Hero Actions (Top Row) */}
            <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
                {/* 1. Rankue Match */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => gate.guard(onOpenGameMode, {
                        title: "가입하고 라운드를 기록하세요",
                        // '골프장에서' — 홈의 핸디캡·그래프는 현장 인증된 라운드만 센다(countsOnSite). 집에서 적은 라운드로는 쌓이지 않는다
                        desc: "골프장에서 스코어를 적으면 핸디캡과 그래프가 쌓여요. 가입하면 새 라운드 화면에서 바로 이어집니다.",
                        from: "/golf/game/new?mode=match",
                    })}
                    className="aspect-[4/5] rounded-[2rem] bg-gradient-to-br from-[#64DD17] to-[#388E3C] p-6 flex flex-col justify-between items-start text-left shadow-2xl shadow-[#64DD17]/20 group relative overflow-hidden"
                >
                    <div className="w-full h-32 flex items-center justify-center -mt-2">
                        <DotLottieReact
                            src="https://lottie.host/bdd7e9d6-727e-47b6-91a7-f1480696aa8f/k5YppJ00Hq.lottie"
                            loop
                            autoplay
                            className="w-full h-full"
                        />
                    </div>
                    <div>
                        <h3 className="text-2xl font-extrabold text-[#051907] leading-none mb-1">RANKUE<br />MATCH</h3>
                        <p className="text-xs font-semibold text-[#051907]/60">스코어 기록 · 동반자 게임</p>
                    </div>
                </motion.button>

                {/* 2. Enter Code (Big) */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => gate.guard(onOpenJoin, {
                        title: "가입하고 매치에 들어가세요",
                        desc: "동반자가 알려 준 핀 번호로 같은 라운드에 들어가요. 가입하면 번호 입력 화면에서 바로 이어집니다.",
                        // 번호 입력만 있는 화면 — 가입을 마치면 홈으로 돌아와 타일을 다시 찾지 않아도 된다
                        from: "/golf/game/new?mode=join",
                    })}
                    className="aspect-[4/5] rounded-[2rem] bg-[#1a1a1a] border border-[#64DD17]/30 p-6 flex flex-col justify-between items-start text-left shadow-2xl shadow-[#64DD17]/10 group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#64DD17]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Pulsing Background Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#64DD17]/10 rounded-full blur-3xl animate-pulse" />

                    <div className="w-full h-32 flex items-center justify-center -mt-2 relative z-10">
                        <LucideHash className="w-20 h-20 text-[#64DD17] group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_15px_rgba(100,221,23,0.4)]" />
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-2xl font-extrabold text-white leading-none mb-1">ENTER<br />CODE</h3>
                        <p className="text-xs font-semibold text-[#64DD17]/80">매치 핀 번호 입력</p>
                    </div>
                </motion.button>
            </div>

            {SHOW_GOLF_GAMES && (<>
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation('/golf/play')}
                className="w-full mb-4 relative z-10 bg-white/[0.03] border border-white/5 rounded-2xl py-8 px-6 flex items-center justify-between shadow-lg backdrop-blur-sm group hover:border-[#64DD17]/30 transition-colors"
                title="3D 필드 골프 & 미니골프 플레이"
            >
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-[#64DD17]/10 flex items-center justify-center group-hover:bg-[#64DD17] transition-colors">
                        <LucideFlag className="w-7 h-7 text-[#64DD17] group-hover:text-[#051907] transition-colors" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-xl font-extrabold text-white">FIELD GOLF 3D</h3>
                        <p className="text-sm font-semibold text-white/40 group-hover:text-[#64DD17] transition-colors mt-0.5">3D 코스에서 직접 샷 & 미니골프</p>
                    </div>
                </div>
                <LucideChevronRight className="w-6 h-6 text-white/20 group-hover:text-white transition-colors" />
            </motion.button>

            {/* 온라인게임(미니골프 대전, 2026-09-14 오너: "골프 홈에 온라인게임") — 당구 온라인게임과 같은 자리 */}
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation('/golf/arcade')}
                className="w-full mb-4 rounded-[2rem] bg-[#1a1a1a] border border-[#64DD17]/30 p-5 flex items-center gap-4 text-left relative overflow-hidden shadow-xl shadow-[#64DD17]/10 group z-10"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-[#64DD17]/15 to-transparent" />
                <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#64DD17] flex items-center justify-center text-[34px] shrink-0">⛳</div>
                <div className="relative z-10 flex-1 min-w-0">
                    <h3 className="text-[20px] font-extrabold text-white leading-none">ONLINE GOLF</h3>
                    <p className="text-[12px] font-semibold text-[#64DD17]/80 mt-1.5">미니골프 9홀 · 친구와 동시 대전 · 혼자 연습</p>
                </div>
                <span className="relative z-10 text-[#64DD17] font-extrabold text-[18px] group-hover:translate-x-1 transition-transform">›</span>
            </motion.button>
            </>)}

            {/* GOLF BOOKING 배너는 2026-09-10 뺐다. 홈 맨 위 긴급티 티커가 그 자리를 맡고,
                부킹 목록은 하단 네비 '조인' 탭으로 들어간다(오너). */}

            {/* Secondary Actions (Bottom Row) */}
            <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
                {/* 3. Golf Passport */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => gate.guard(() => setLocation('/golf/passport'), {
                        title: "가입하고 골프 여권을 만드세요",
                        desc: "라운드한 골프장이 내 여권에 도장으로 쌓여요. 가입하면 여권 화면에서 바로 이어집니다.",
                        from: "/golf/passport",
                    })}
                    className="aspect-[4/5] rounded-[2rem] bg-white/[0.03] border border-white/10 p-6 flex flex-col justify-between items-start text-left hover:bg-white/[0.05] transition-colors group relative overflow-hidden backdrop-blur-sm shadow-xl"
                >
                    <div className="w-full h-32 flex items-center justify-center -mt-2">
                        <DotLottieReact
                            src="https://lottie.host/87b0804a-dfd0-402b-b2ec-185d8bb6f380/f0WSfFYjeY.lottie"
                            loop
                            autoplay
                            className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                    </div>
                    <div className="relative z-10 w-full">
                        <h3 className="text-2xl font-extrabold text-white leading-none mb-1">GOLF<br />PASSPORT</h3>
                        <p className="text-[10px] font-bold text-white/40 group-hover:text-[#64DD17] transition-colors">도장깨기 & 가이드</p>
                    </div>
                </motion.button>

                {/* 4. 랭큐 프로암 — 예전엔 회원권 거래소였다. 거래는 랭큐가 할 일이 아니고(에스크로·본인확인·분쟁),
                    프로암은 크루 성적에 이유를 준다(2026-09-09 오너). 회원권 시세 정보 자체는 남아 있다. */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => gate.guard(() => setLocation('/golf/proam'), {
                        // 프로암은 아직 응모를 열지 않았다(pages/ProAm.tsx '준비 중') — 열려 있다고도, 소식을 보내 준다고도 하지 않는다(알림 장치가 없다)
                        title: "가입하고 프로암 안내를 보세요",
                        desc: "랭큐 프로암은 준비 중이에요. 아직 응모는 열리지 않았어요. 가입하면 안내 화면에서 바로 이어집니다.",
                        from: "/golf/proam",
                    })}
                    className="aspect-[4/5] rounded-[2rem] bg-white/[0.03] border border-white/10 p-6 flex flex-col justify-between items-start text-left hover:bg-white/[0.05] transition-colors group relative overflow-hidden backdrop-blur-sm shadow-xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#64DD17]/10 to-transparent opacity-0 group-hover:opacity-30 transition-opacity" />

                    <div className="w-full h-32 flex items-center justify-center -mt-2 relative z-10 px-2">
                        <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible opacity-90 group-hover:scale-110 transition-transform duration-500">
                            <defs>
                                <linearGradient id="marketGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#64DD17" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#64DD17" stopOpacity="0" />
                                </linearGradient>
                            </defs>

                            <motion.path
                                d="M0 50 L0 30 Q25 40 50 20 T100 10 L100 50 Z"
                                fill="url(#marketGradient)"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 1.5 }}
                            />

                            <motion.path
                                d="M0 30 Q25 40 50 20 T100 10"
                                fill="none"
                                stroke="#64DD17"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", repeatDelay: 3 }}
                            />
                        </svg>
                    </div>

                    <div className="relative z-10 w-full">
                        <h3 className="text-2xl font-extrabold text-white leading-none mb-1">RANKUE<br />PRO-AM</h3>
                        <p className="text-[10px] font-bold text-[#64DD17] opacity-80">랭큐 프로암</p>
                    </div>
                </motion.button>
            </div>
        </>
    );
}
