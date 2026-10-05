import { motion } from "framer-motion";
import { SampleBadge } from "@/components/hiq/GuestGate";

interface HandicapCardProps {
    member: any;
    avgScore?: string | number;
    /**
     * 예시 숫자를 그리는 중인가(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다").
     * 비로그인 골프 홈이 shared/guestSample 의 숫자를 넣을 때 true 로 준다 — 숫자 위에 "예시" 표시가 붙는다.
     * 예시가 진짜 기록처럼 읽히면 안 된다. 회원은 이 값을 주지 않으므로 화면이 그대로다.
     */
    sample?: boolean;
}

export function HandicapCard({ member, avgScore, sample = false }: HandicapCardProps) {
    // Priority: DB Average Score (Master) -> '-'
    const displayScore = (avgScore && avgScore !== "0" && avgScore !== 0 && avgScore !== "-")
        ? (typeof avgScore === 'number' ? avgScore.toFixed(1) : avgScore)
        : (member?.golfAvgScore ? Number(member.golfAvgScore).toFixed(1) : '0.0');

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            // 예시일 때는 바로 아래에 가입 안내 한 줄이 붙는다 — 사이가 벌어지지 않게 아래 여백만 줄인다
            className={sample ? "mb-3 relative z-10" : "mb-8 relative z-10"}
        >
            {/* 윗줄 "GOLF HANDICAP" 은 뺐다(2026-09-23 오너) — 바로 아래 큰 숫자 옆 HDCP 가 같은 말을 한다. */}
            <div className="flex flex-col items-center justify-center py-6">
                {sample && <SampleBadge tone="dark" className="mb-3" />}
                <div className="flex items-baseline gap-2">
                    <span className="text-8xl font-black text-white tracking-tighter drop-shadow-2xl">
                        {displayScore}
                    </span>
                    <span className="text-xl font-black text-[#64DD17] italic tracking-tighter">HDCP</span>
                </div>


            </div>
        </motion.div>
    );
}
