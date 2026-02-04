import { LucideMapPin, LucideFlag, LucideLeaf, LucideCalendarDays, LucideUsers, LucideGlobe } from "lucide-react";
import { ReviewCard } from "./ReviewCard";
import { REVIEWS } from "../../data/membershipMock";

interface MembershipCourseTabProps {
    data: any;
}

export function MembershipCourseTab({ data }: MembershipCourseTabProps) {
    return (
        <div className="space-y-10">
            {/* Spec Bar */}
            <div className="flex justify-between items-center py-4 relative bg-[#1A1A1A] rounded-2xl px-2 border border-white/5">
                <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                <div className="absolute right-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />

                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideMapPin className="w-3 h-3 text-[#64DD17]" /> 위치</span>
                    <span className="text-sm font-bold text-white">{data.originalRegion}</span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideFlag className="w-3 h-3 text-[#64DD17]" /> 홀수</span>
                    <span className="text-sm font-bold text-white">
                        {String(data.holes).endsWith('홀') ? data.holes : `${data.holes}홀`}
                    </span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideLeaf className="w-3 h-3 text-[#64DD17]" /> 잔디</span>
                    <span className="text-sm font-bold text-center leading-tight text-white">중지</span>
                </div>
            </div>

            {/* Club Information Section */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                        <div className="w-1 h-4 bg-[#64DD17]" />
                        클럽 정보
                    </h3>
                </div>
                <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 space-y-4">
                    {data.openDate && data.openDate !== '-' && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white/40 flex items-center gap-2">
                                <LucideCalendarDays className="w-4 h-4 text-[#64DD17]" />
                                개장일
                            </span>
                            <span className="text-sm font-bold text-white">{data.openDate}</span>
                        </div>
                    )}
                    {data.address && data.address !== '-' && (
                        <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-white/40 flex items-center gap-2 shrink-0">
                                <LucideMapPin className="w-4 h-4 text-[#64DD17]" />
                                주소
                            </span>
                            <span className="text-sm font-bold text-white text-right">{data.address}</span>
                        </div>
                    )}
                    {data.clubInfo.memberCount && data.clubInfo.memberCount !== '-' && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white/40 flex items-center gap-2">
                                <LucideUsers className="w-4 h-4 text-[#64DD17]" />
                                회원수
                            </span>
                            <span className="text-sm font-bold text-white">{data.clubInfo.memberCount}명</span>
                        </div>
                    )}
                    {data.clubInfo.website && data.clubInfo.website !== '' && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-white/40 flex items-center gap-2">
                                <LucideGlobe className="w-4 h-4 text-[#64DD17]" />
                                웹사이트
                            </span>
                            <a
                                href={data.clubInfo.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                방문하기 →
                            </a>
                        </div>
                    )}
                </div>
            </div>

            {/* Analysis Chart */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                        <div className="w-1 h-4 bg-amber-400" />
                        코스 분석
                    </h3>
                </div>
                <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white/40">DIFFICULTY</span>
                        <span className="text-xs font-black text-white/50">정보 준비중</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full relative mb-3 flex items-center">
                        <div className="h-full w-[50%] bg-white/20 rounded-full" />
                    </div>
                    <p className="text-[10px] text-white/40 italic text-center">코스 상세 분석은 순차적으로 업데이트 예정입니다.</p>

                    <div className="flex flex-wrap gap-2 mt-4">
                        {data.tags.map((tag: string) => (
                            <span key={tag} className="px-2 py-1 rounded bg-white/5 text-[10px] font-bold text-white/50 border border-white/10">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Reviews Check - Rich Insight Cards */}
            <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h3 className="text-lg font-black italic tracking-widest uppercase mb-1 flex items-center gap-2">
                            ⭐ 멤버 인사이트
                        </h3>
                        <p className="text-[10px] font-bold text-white/30">핵심 데이터 요약 카드 (총 1,240개)</p>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-black text-amber-400 tracking-tighter">4.9</div>
                        <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">전체 평점</div>
                    </div>
                </div>

                {REVIEWS.map(review => (
                    <ReviewCard key={review.id} review={review} />
                ))}
            </div>
        </div>
    );
}
