import { LucideMapPin, LucideFlag, LucideLeaf, LucideCalendarDays, LucideUsers, LucideGlobe, LucideBuilding, LucideUserCheck } from "lucide-react";
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
                {data.category === 'Golf' ? (
                    <>
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
                    </>
                ) : data.category === 'Condo' ? (
                    <>
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideBuilding className="w-3 h-3 text-[#64DD17]" /> 평형</span>
                            <span className="text-sm font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px]">
                                {data.spec?.roomType || '-'}
                            </span>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideUserCheck className="w-3 h-3 text-[#64DD17]" /> 구분</span>
                            <span className="text-sm font-bold text-white">
                                {data.spec?.ownership === 'Membership' ? '회원제' : (data.spec?.ownership === 'Ownership' ? '등기제' : '-')}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex-[2] flex flex-col items-center gap-1 justify-center opacity-0">
                        {/* Spacer for alignment */}
                    </div>
                )}
            </div>

            {/* Introduction Section (Rich Content) */}
            {(data.intro?.desc || data.intro?.features) && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {data.intro?.desc && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                                    <div className="w-1 h-4 bg-white/50" />
                                    클럽 소개
                                </h3>
                            </div>
                            <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
                                <div className="absolute top-0 right-0 p-10 bg-[#64DD17]/5 rounded-full blur-3xl group-hover:bg-[#64DD17]/10 transition-colors" />
                                <p className="text-sm sm:text-base text-white/80 leading-loose break-keep relative z-10 font-medium whitespace-pre-line">
                                    {data.intro.desc}
                                </p>
                            </div>
                        </div>
                    )}

                    {data.intro?.features && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                                    <div className="w-1 h-4 bg-amber-400" />
                                    회원권 특징
                                </h3>
                            </div>
                            <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/0 p-6 rounded-2xl border border-amber-500/10 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/20" />
                                <p className="text-sm sm:text-base text-amber-100/90 leading-loose font-medium break-keep whitespace-pre-line pl-2">
                                    {data.intro.features}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

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

            {/* Analysis Chart - Golf Only */}
            {data.category === 'Golf' && (
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
            )}

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
                    <ReviewCard key={review.id} review={review} category={data.category} />
                ))}
            </div>
        </div>
    );
}
