import { LucideMapPin, LucideFlag, LucideCalendarDays, LucideUsers, LucideGlobe, LucideBuilding, LucideUserCheck } from "lucide-react";

interface MembershipCourseTabProps {
    data: any;
}

export function MembershipCourseTab({ data }: MembershipCourseTabProps) {
    return (
        <div className="space-y-10">
            {/* Spec Bar */}
            <div className="flex justify-between items-center py-4 relative bg-[#1A1A1A] rounded-2xl px-2 border border-white/5">
                {/* 칸 사이 세로줄 — 골프는 두 칸(위치 · 홀수)이라 가운데 한 줄, 그 밖은 세 칸 기준 두 줄 */}
                {data.category === 'Golf' ? (
                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-8 bg-[#FFFFFF1A]" />
                ) : (
                    <>
                        <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                        <div className="absolute right-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                    </>
                )}

                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideMapPin className="w-3 h-3 text-[#64DD17]" /> 위치</span>
                    <span className="text-sm font-bold text-white">{data.originalRegion}</span>
                </div>
                {data.category === 'Golf' ? (
                    // 잔디 칸은 두지 않는다(2026-10-06) — 자료에 잔디 값이 없는데 골프장마다 같은 잔디 이름을 박아 두었다
                    // (소개 글에 양잔디라고 적힌 골프장도 다른 잔디로 나왔다). 값이 생기면 그때 자료에서 받아 그린다.
                    <div className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-white/40 font-bold flex items-center gap-1"><LucideFlag className="w-3 h-3 text-[#64DD17]" /> 홀수</span>
                        <span className="text-sm font-bold text-white">
                            {String(data.holes).endsWith('홀') ? data.holes : `${data.holes}홀`}
                        </span>
                    </div>
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

            {/* '코스 분석' 구역은 두지 않는다(2026-10-06) — 난이도 자료가 없는데 반쯤 찬 막대를 그렸고(보통 난이도로 읽힌다),
                골프 회원권은 태그가 전부 비어 있어 훅이 채워 넣은 같은 태그 하나가 모든 골프장에 붙어 있었다. */}

            {/* 회원 평가 구역은 두지 않는다(2026-10-06) — 받은 평가가 없는데 고정 점수와 예시 글을 실제처럼 보여 주고 있었다.
                실제로 받은 글이 생기면 그때 서버에서 받아 그린다. */}
        </div>
    );
}
