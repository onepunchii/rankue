import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HiqMember } from "../../../../shared/schema";
import {
    LucideUsers,
    LucideTrendingUp,
    LucideMessageSquare,
    LucideSearch,
    LucideCalendar,
    LucideLayoutDashboard,
    LucideDownload,
    LucideCheckCircle2
} from "lucide-react";

export default function HiqAdmin() {
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState("");
    const [smsMessage, setSmsMessage] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const { data: members, isLoading: membersLoading } = useQuery<HiqMember[]>({
        queryKey: ["/api/hiq/admin/members"],
    });

    const { data: stats, isLoading: statsLoading } = useQuery<{
        totalMembers: number;
        visitsToday: number;
        visitsYesterday: number;
        newToday: number;
    }>({
        queryKey: ["/api/hiq/admin/stats"],
    });

    const smsMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest("/api/hiq/admin/send-sms", {
                method: "POST",
                body: { memberIds: selectedIds, message: smsMessage },
            });
        },
        onSuccess: (data) => {
            toast({
                title: "발송 완료",
                description: `${data.sentCount}명에게 메시지를 전송했습니다.`,
            });
            setSmsMessage("");
            setSelectedIds([]);
        },
        onError: () => {
            toast({
                variant: "destructive",
                title: "오류",
                description: "메시지 발송 실패",
            });
        },
    });

    const filteredMembers = members?.filter(m =>
        m.name.includes(searchTerm) || m.phone.includes(searchTerm)
    ) || [];

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const selectAll = () => {
        if (selectedIds.length === filteredMembers.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredMembers.map(m => m.id));
        }
    };

    const handleDownloadExcel = () => {
        if (!members || members.length === 0) {
            toast({
                variant: "destructive",
                title: "오류",
                description: "다운로드할 데이터가 없습니다.",
            });
            return;
        }

        const currentYear = new Date().getFullYear();
        const data = members.map(m => ({
            "성함": m.name,
            "연락처": m.phone,
            "출생년도": m.birthYear || "-",
            "연령": m.birthYear ? (currentYear - m.birthYear + 1) : "-",
            "3구 핸디": m.handi3c || 0,
            "4구 핸디": m.handi4c || 0,
            "방문횟수": m.visitCount || 0,
            "가입일": new Date(m.createdAt).toLocaleDateString(),
            "최근방문일": m.lastVisitedAt ? new Date(m.lastVisitedAt).toLocaleDateString() : "-"
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "HiQ_Members");
        XLSX.writeFile(wb, `HiQ_Members_${new Date().toISOString().split('T')[0]}.xlsx`);

        toast({
            title: "다운로드 완료",
            description: "회원 목록 엑셀 파일이 저장되었습니다.",
        });
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                    <div>
                        <h1 className="text-[26px] font-bold tracking-tight flex items-center gap-3">
                            <span className="p-2 bg-brand rounded-tile text-brand-fg">랭큐</span> 관리자 콘솔
                        </h1>
                        <p className="text-white/55 mt-2 font-medium">당구장 운영 및 회원 통합 관리 시스템</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={handleDownloadExcel}
                            className="bg-transparent border-surface-line text-white/55 hover:text-white hover:bg-surface-2"
                        >
                            <LucideDownload className="w-4 h-4 mr-2" /> 엑셀 다운로드
                        </Button>
                        <div className="w-12 h-12 bg-brand/20 rounded-full flex items-center justify-center border border-brand/40">
                            <div className="w-3 h-3 bg-brand rounded-full animate-pulse" />
                        </div>
                    </div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <Card className="rk-card">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-blue-500/10 rounded-2xl">
                                    <LucideUsers className="w-6 h-6 text-blue-500" />
                                </div>
                                <span className="text-xs font-semibold text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg">실시간</span>
                            </div>
                            <p className="text-white/55 text-sm font-semibold">전체 회원 수</p>
                            <h3 className="text-4xl font-bold tabular-nums mt-1">{stats?.totalMembers || 0}<span className="text-lg text-white/45 font-normal ml-1">명</span></h3>
                        </CardContent>
                    </Card>

                    <Card className="rk-card">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                    <LucideTrendingUp className="w-6 h-6 text-emerald-500" />
                                </div>
                                {stats && (
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg tabular-nums ${stats.visitsToday >= stats.visitsYesterday
                                        ? "text-emerald-500 bg-emerald-500/10"
                                        : "text-red-500 bg-red-500/10"
                                        }`}>
                                        {stats.visitsToday >= stats.visitsYesterday ? "+" : "-"}
                                        {Math.abs(stats.visitsToday - stats.visitsYesterday)}명
                                    </span>
                                )}
                            </div>
                            <p className="text-white/55 text-sm font-semibold">금일 방문자</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className="text-4xl font-bold tabular-nums">{stats?.visitsToday || 0}</h3>
                                <span className="text-lg text-white/45 font-normal">명</span>
                                <span className="text-[12px] text-white/45 ml-auto tabular-nums">어제: {stats?.visitsYesterday || 0}명</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rk-card">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-brand/10 rounded-2xl">
                                    <LucideCalendar className="w-6 h-6 text-brand" />
                                </div>
                                <span className="text-xs font-semibold text-brand bg-brand/10 px-2 py-1 rounded-lg">오늘</span>
                            </div>
                            <p className="text-white/55 text-sm font-semibold">금일 신규 가입</p>
                            <h3 className="text-4xl font-bold tabular-nums mt-1">{stats?.newToday || 0}<span className="text-lg text-white/45 font-normal ml-1">명</span></h3>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="members" className="w-full">
                    <TabsList className="bg-surface-1 border border-surface-line p-1 mb-6 rounded-tile">
                        <TabsTrigger value="members" className="data-[state=active]:bg-brand data-[state=active]:text-brand-fg rounded-lg px-8 py-3 font-semibold">회원 관리</TabsTrigger>
                        <TabsTrigger value="messaging" className="data-[state=active]:bg-brand data-[state=active]:text-brand-fg rounded-lg px-8 py-3 font-semibold">마케팅 센터</TabsTrigger>
                        <TabsTrigger value="golf-orders" className="data-[state=active]:bg-brand data-[state=active]:text-brand-fg rounded-lg px-8 py-3 font-semibold">골프 회원권 접수</TabsTrigger>
                    </TabsList>

                    <TabsContent value="members" className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between rk-card p-4">
                            <div className="relative w-full md:w-96">
                                <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45 w-5 h-5" />
                                <Input
                                    placeholder="회원명 또는 전화번호 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-surface-2 border-surface-line pl-12 h-12 rounded-tile text-lg focus:ring-1 focus:ring-brand"
                                />
                            </div>
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-white/55 font-medium tabular-nums">{selectedIds.length}명 선택됨</p>
                                <Button onClick={selectAll} variant="ghost" className="text-white/55 hover:text-white">전체 선택</Button>
                            </div>
                        </div>

                        <Card className="rk-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-surface-2 border-b border-surface-line">
                                            <th className="p-5 w-16">
                                                <div className="w-6 h-6 border-2 border-white/20 rounded cursor-pointer" onClick={selectAll} />
                                            </th>
                                            <th className="p-5 font-semibold text-white/55">성함</th>
                                            <th className="p-5 font-semibold text-white/55">연락처</th>
                                            <th className="p-5 font-semibold text-white/55 text-center">핸디 (3/4)</th>
                                            <th className="p-5 font-semibold text-white/55 text-center">방문수</th>
                                            <th className="p-5 font-semibold text-white/55">가입일</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMembers.map((member) => (
                                            <tr
                                                key={member.id}
                                                className={`border-b border-surface-line hover:bg-brand/5 transition-colors cursor-pointer ${selectedIds.includes(member.id) ? "bg-brand/10" : ""}`}
                                                onClick={() => toggleSelect(member.id)}
                                            >
                                                <td className="p-5">
                                                    <div className={`w-6 h-6 border-2 rounded flex items-center justify-center transition-all ${selectedIds.includes(member.id) ? "bg-brand border-brand" : "border-white/20"}`}>
                                                        {selectedIds.includes(member.id) && <LucideCheckCircle2 className="w-4 h-4 text-brand-fg" />}
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-surface-3 rounded-full flex items-center justify-center font-bold text-sm">
                                                            {member.name[0]}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-lg">{member.name}</p>
                                                            <span className="text-xs text-blue-500 font-semibold">일반</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-5 font-mono text-white/55">{member.phone}</td>
                                                <td className="p-5 text-center">
                                                    <span className="px-3 py-1 bg-surface-2 rounded-lg font-bold text-brand tabular-nums">{member.handi3c} / {member.handi4c}</span>
                                                </td>
                                                <td className="p-5 text-center font-bold text-xl tabular-nums">{member.visitCount}</td>
                                                <td className="p-5 text-white/45 text-sm tabular-nums">{new Date(member.createdAt).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredMembers.length === 0 && (
                                    <div className="py-20 text-center text-white/45">
                                        <LucideSearch className="w-16 h-16 mx-auto mb-4 opacity-40" />
                                        <p className="text-xl">검색 결과가 없습니다.</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </TabsContent>

                    <TabsContent value="messaging">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="rk-card p-8">
                                <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                                    <LucideMessageSquare className="w-8 h-8 text-brand" /> 단체 메시지 발송
                                </h3>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-sm font-semibold text-white/55 block mb-2">수신 대상 ({selectedIds.length}명)</label>
                                        <div className="bg-surface-2 border border-surface-line rounded-2xl p-4 max-h-32 overflow-y-auto flex flex-wrap gap-2  text-white/55 text-sm">
                                            {selectedIds.length === 0 ? "회원 관리 탭에서 수신자를 선택해주세요." : selectedIds.map(id => {
                                                const m = members?.find(x => x.id === id);
                                                return <span key={id} className="bg-brand/20 text-brand px-2 py-1 rounded text-xs font-bold">{m?.name}</span>
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-white/55 block mb-2">메시지 내용</label>
                                        <Textarea
                                            placeholder="회원들에게 보낼 공지나 이벤트를 입력하세요."
                                            className="bg-surface-2 border-surface-line rounded-2xl min-h-[200px] text-lg p-5 focus:ring-brand"
                                            value={smsMessage}
                                            onChange={(e) => setSmsMessage(e.target.value)}
                                        />
                                        <p className="text-right text-xs text-white/45 mt-2 font-mono tabular-nums">
                                            {[...smsMessage].reduce((b, ch) => b + (ch.charCodeAt(0) > 127 ? 2 : 1), 0).toLocaleString()} / 2,000 bytes
                                        </p>
                                    </div>

                                    <Button
                                        className="w-full h-16 rounded-2xl rk-btn-primary text-xl"
                                        disabled={selectedIds.length === 0 || !smsMessage || smsMutation.isPending}
                                        onClick={() => smsMutation.mutate()}
                                    >
                                        {smsMutation.isPending ? "발송 중..." : "전체 발송하기"}
                                    </Button>
                                </div>
                            </Card>

                            <div className="space-y-6">
                                <Card className="bg-brand/5 border-brand/20 border-dashed rounded-2xl p-8">
                                    <h4 className="font-semibold text-brand flex items-center gap-2 mb-4">
                                        안내
                                    </h4>
                                    <p className="text-white/55 leading-relaxed font-medium">
                                        단체 메시지 발송 시 정보통신망법에 따라 <br />
                                        <span className="text-white font-bold ml-1">'(광고)' 문구 및 '무료수신거부' 번호</span>가 <br />
                                        자동으로 포함되어 발송됩니다.
                                    </p>
                                </Card>

                                <Card className="rk-card p-8">
                                    <h4 className="font-semibold text-white/55 mb-6">최근 발송 내역</h4>
                                    <div className="space-y-4">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-surface-2 rounded-2xl border border-surface-line">
                                                <div>
                                                    <p className="font-bold">당구대 교체 완료 기념 이벤트...</p>
                                                    <span className="text-xs text-white/45 font-mono tabular-nums">2024.01.10 14:20</span>
                                                </div>
                                                <span className="px-3 py-1 bg-surface-3 rounded-full text-xs font-bold text-white/55 tabular-nums">201명 발송</span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>

                    <GolfOrderTabContent />
                </Tabs>
            </div>
        </div>
    );
}

function GolfOrderTabContent() {
    const { toast } = useToast();
    const { data: orders, isLoading, refetch } = useQuery<any[]>({
        queryKey: ["/api/hiq/admin/membership/orders"],
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            return await apiRequest(`/api/hiq/admin/membership/orders/${id}/status`, {
                method: "PATCH",
                body: { status }
            });
        },
        onSuccess: () => {
            toast({ title: "상태 변경 완료" });
            refetch();
        },
        onError: () => {
            toast({ title: "오류", description: "상태 변경에 실패했습니다.", variant: "destructive" });
        }
    });

    if (isLoading) return <div className="text-center py-20 text-white/55">불러오는 중...</div>;

    const sortedOrders = orders ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

    return (
        <TabsContent value="golf-orders">
            <Card className="rk-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-surface-2 border-b border-surface-line">
                                <th className="p-5 font-semibold text-white/55">날짜</th>
                                <th className="p-5 font-semibold text-white/55">구분</th>
                                <th className="p-5 font-semibold text-white/55">회원권 / 구장</th>
                                <th className="p-5 font-semibold text-white/55 text-right">희망가격</th>
                                <th className="p-5 font-semibold text-white/55">연락처</th>
                                <th className="p-5 font-semibold text-white/55 text-center">상태</th>
                                <th className="p-5 font-semibold text-white/55 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedOrders.map((order) => (
                                <tr key={order.id} className="border-b border-surface-line hover:bg-white/5 transition-colors">
                                    <td className="p-5 text-white/45 font-mono text-sm max-w-[120px]">
                                        <div className="font-bold text-white tabular-nums">{new Date(order.createdAt).toLocaleDateString()}</div>
                                        <div className="text-xs tabular-nums">{new Date(order.createdAt).toLocaleTimeString()}</div>
                                    </td>
                                    <td className="p-5">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${order.orderType === 'BUY' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                            {order.orderType === 'BUY' ? '매수' : '매도'}
                                        </span>
                                    </td>
                                    <td className="p-5">
                                        <div className="font-bold text-lg text-white">{order.courseName}</div>
                                    </td>
                                    <td className="p-5 text-right font-mono font-bold text-white text-lg tabular-nums">
                                        {new Intl.NumberFormat('ko-KR').format(order.price)}원
                                    </td>
                                    <td className="p-5 font-mono text-blue-400 font-bold tabular-nums">{order.contact}</td>
                                    <td className="p-5 text-center">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${order.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                                            order.status === 'CONTACTED' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                                                order.status === 'COMPLETED' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                                                    'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                                            }`}>
                                            {order.status === 'PENDING' ? '대기중' :
                                                order.status === 'CONTACTED' ? '연락됨' :
                                                    order.status === 'COMPLETED' ? '완료' : '취소'}
                                        </span>
                                    </td>
                                    <td className="p-5 text-center">
                                        <select
                                            className="bg-surface-2 border border-surface-line rounded-lg px-3 py-2 text-sm outline-none focus:border-brand text-white/80 font-medium cursor-pointer hover:bg-surface-3 transition-colors"
                                            value={order.status}
                                            onChange={(e) => updateStatusMutation.mutate({ id: order.id, status: e.target.value })}
                                            title="주문 상태 변경"
                                        >
                                            <option value="PENDING">대기중</option>
                                            <option value="CONTACTED">연락됨</option>
                                            <option value="COMPLETED">거래완료</option>
                                            <option value="CANCELLED">취소</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!orders?.length && (
                        <div className="py-20 text-center text-white/45">
                            <LucideSearch className="w-12 h-12 mx-auto mb-4 opacity-40" />
                            <p className="font-bold">신규 접수된 내역이 없습니다.</p>
                        </div>
                    )}
                </div>
            </Card>
        </TabsContent>
    );
}
