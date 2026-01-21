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
        <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                    <div>
                        <h1 className="text-4xl font-black flex items-center gap-3">
                            <span className="p-2 bg-[#0e4d2a] rounded-xl text-[#ffd700]">HiQ</span> Admin Console
                        </h1>
                        <p className="text-gray-500 mt-2 font-medium">당구장 운영 및 회원 통합 관리 시스템</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={handleDownloadExcel}
                            className="bg-transparent border-[#222] text-gray-400 hover:text-white hover:bg-[#111]"
                        >
                            <LucideDownload className="w-4 h-4 mr-2" /> 엑셀 다운로드
                        </Button>
                        <div className="w-12 h-12 bg-[#0e4d2a]/20 rounded-full flex items-center justify-center border border-[#0e4d2a]/40">
                            <div className="w-3 h-3 bg-[#0e4d2a] rounded-full animate-pulse" />
                        </div>
                    </div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <Card className="bg-[#111] border-[#222] shadow-2xl">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-blue-500/10 rounded-2xl">
                                    <LucideUsers className="w-6 h-6 text-blue-500" />
                                </div>
                                <span className="text-xs font-black text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg">LIVE</span>
                            </div>
                            <p className="text-gray-400 text-sm font-bold">전체 회원 수</p>
                            <h3 className="text-4xl font-black mt-1">{stats?.totalMembers || 0}<span className="text-lg text-gray-600 font-normal ml-1">명</span></h3>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#111] border-[#222] shadow-2xl">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                    <LucideTrendingUp className="w-6 h-6 text-emerald-500" />
                                </div>
                                {stats && (
                                    <span className={`text-xs font-black px-2 py-1 rounded-lg ${stats.visitsToday >= stats.visitsYesterday
                                        ? "text-emerald-500 bg-emerald-500/10"
                                        : "text-red-500 bg-red-500/10"
                                        }`}>
                                        {stats.visitsToday >= stats.visitsYesterday ? "+" : "-"}
                                        {Math.abs(stats.visitsToday - stats.visitsYesterday)}명
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-400 text-sm font-bold">금일 방문자</p>
                            <div className="flex items-baseline gap-2 mt-1">
                                <h3 className="text-4xl font-black">{stats?.visitsToday || 0}</h3>
                                <span className="text-lg text-gray-600 font-normal">명</span>
                                <span className="text-[10px] text-gray-500 ml-auto">어제: {stats?.visitsYesterday || 0}명</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-[#111] border-[#222] shadow-2xl">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-[#ffd700]/10 rounded-2xl">
                                    <LucideCalendar className="w-6 h-6 text-[#ffd700]" />
                                </div>
                                <span className="text-xs font-black text-[#ffd700] bg-[#ffd700]/10 px-2 py-1 rounded-lg">TODAY</span>
                            </div>
                            <p className="text-gray-400 text-sm font-bold">금일 신규 가입</p>
                            <h3 className="text-4xl font-black mt-1">{stats?.newToday || 0}<span className="text-lg text-gray-600 font-normal ml-1">명</span></h3>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="members" className="w-full">
                    <TabsList className="bg-[#111] border border-[#222] p-1 mb-6 rounded-xl">
                        <TabsTrigger value="members" className="data-[state=active]:bg-[#0e4d2a] data-[state=active]:text-white rounded-lg px-8 py-3 font-bold">회원 관리</TabsTrigger>
                        <TabsTrigger value="messaging" className="data-[state=active]:bg-[#0e4d2a] data-[state=active]:text-white rounded-lg px-8 py-3 font-bold">마케팅 센터</TabsTrigger>
                    </TabsList>

                    <TabsContent value="members" className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#111] p-4 rounded-2xl border border-[#222]">
                            <div className="relative w-full md:w-96">
                                <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <Input
                                    placeholder="회원명 또는 전화번호 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-[#050505] border-[#252525] pl-12 h-12 rounded-xl text-lg focus:ring-1 focus:ring-[#0e4d2a]"
                                />
                            </div>
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-500 font-medium">{selectedIds.length}명 선택됨</p>
                                <Button onClick={selectAll} variant="ghost" className="text-gray-400 hover:text-white">전체 선택</Button>
                            </div>
                        </div>

                        <Card className="bg-[#111] border-[#222] overflow-hidden rounded-2xl shadow-2xl">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-[#1a1a1a] border-b border-[#222]">
                                            <th className="p-5 w-16">
                                                <div className="w-6 h-6 border-2 border-[#333] rounded cursor-pointer" onClick={selectAll} />
                                            </th>
                                            <th className="p-5 font-black text-gray-400">성함</th>
                                            <th className="p-5 font-black text-gray-400">연락처</th>
                                            <th className="p-5 font-black text-gray-400 text-center">핸디 (3/4)</th>
                                            <th className="p-5 font-black text-gray-400 text-center">방문수</th>
                                            <th className="p-5 font-black text-gray-400">가입일</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMembers.map((member) => (
                                            <tr
                                                key={member.id}
                                                className={`border-b border-[#1a1a1a] hover:bg-[#0e4d2a]/5 transition-colors cursor-pointer ${selectedIds.includes(member.id) ? "bg-[#0e4d2a]/10" : ""}`}
                                                onClick={() => toggleSelect(member.id)}
                                            >
                                                <td className="p-5">
                                                    <div className={`w-6 h-6 border-2 rounded flex items-center justify-center transition-all ${selectedIds.includes(member.id) ? "bg-[#ffd700] border-[#ffd700]" : "border-[#333]"}`}>
                                                        {selectedIds.includes(member.id) && <LucideCheckCircle2 className="w-4 h-4 text-black" />}
                                                    </div>
                                                </td>
                                                <td className="p-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full flex items-center justify-center font-bold text-sm">
                                                            {member.name[0]}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-lg">{member.name}</p>
                                                            <span className="text-xs text-blue-500 font-black uppercase">Normal</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-5 font-mono text-gray-400">{member.phone}</td>
                                                <td className="p-5 text-center">
                                                    <span className="px-3 py-1 bg-[#1a1a1a] rounded-lg font-bold text-[#ffd700]">{member.handi3c} / {member.handi4c}</span>
                                                </td>
                                                <td className="p-5 text-center font-black text-xl">{member.visitCount}</td>
                                                <td className="p-5 text-gray-500 text-sm">{new Date(member.createdAt).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredMembers.length === 0 && (
                                    <div className="py-20 text-center text-gray-600">
                                        <LucideSearch className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                        <p className="text-xl">검색 결과가 없습니다.</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </TabsContent>

                    <TabsContent value="messaging">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="bg-[#111] border-[#222] rounded-3xl p-8">
                                <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                                    <LucideMessageSquare className="w-8 h-8 text-[#ffd700]" /> 단체 메시지 발송
                                </h3>

                                <div className="space-y-6">
                                    <div>
                                        <label className="text-sm font-bold text-gray-500 block mb-2">수신 대상 ({selectedIds.length}명)</label>
                                        <div className="bg-[#050505] border border-[#222] rounded-2xl p-4 max-h-32 overflow-y-auto flex flex-wrap gap-2 italic text-gray-600 text-sm">
                                            {selectedIds.length === 0 ? "회원 관리 탭에서 수신자를 선택해주세요." : selectedIds.map(id => {
                                                const m = members?.find(x => x.id === id);
                                                return <span key={id} className="bg-[#0e4d2a]/20 text-[#0e4d2a] px-2 py-1 rounded text-xs font-bold">{m?.name}</span>
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-bold text-gray-500 block mb-2">메시지 내용</label>
                                        <Textarea
                                            placeholder="회원들에게 보낼 공지나 이벤트를 입력하세요."
                                            className="bg-[#050505] border-[#252525] rounded-2xl min-h-[200px] text-lg p-5 focus:ring-[#0e4d2a]"
                                            value={smsMessage}
                                            onChange={(e) => setSmsMessage(e.target.value)}
                                        />
                                        <p className="text-right text-xs text-gray-600 mt-2 font-mono">0 / 2,000 bytes</p>
                                    </div>

                                    <Button
                                        className="w-full h-16 rounded-2xl bg-[#ffd700] text-black hover:bg-[#ffea00] font-black text-xl shadow-[0_10px_30px_rgba(255,215,0,0.2)]"
                                        disabled={selectedIds.length === 0 || !smsMessage || smsMutation.isPending}
                                        onClick={() => smsMutation.mutate()}
                                    >
                                        {smsMutation.isPending ? "발송 중..." : "전체 발송하기"}
                                    </Button>
                                </div>
                            </Card>

                            <div className="space-y-6">
                                <Card className="bg-[#0e4d2a]/5 border-[#0e4d2a]/20 border-dashed rounded-3xl p-8">
                                    <h4 className="font-black text-[#0e4d2a] flex items-center gap-2 mb-4 uppercase tracking-widest">
                                        Notice
                                    </h4>
                                    <p className="text-gray-400 leading-relaxed font-medium">
                                        단체 메시지 발송 시 정보통신망법에 따라 <br />
                                        <span className="text-white font-bold ml-1">'(광고)' 문구 및 '무료수신거부' 번호</span>가 <br />
                                        자동으로 포함되어 발송됩니다.
                                    </p>
                                </Card>

                                <Card className="bg-[#111] border-[#222] rounded-3xl p-8">
                                    <h4 className="font-black text-gray-400 mb-6 uppercase tracking-widest">최근 발송 내역</h4>
                                    <div className="space-y-4">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="flex items-center justify-between p-4 bg-[#050505] rounded-2xl border border-[#1a1a1a]">
                                                <div>
                                                    <p className="font-bold">당구대 교체 완료 기념 이벤트...</p>
                                                    <span className="text-xs text-gray-600 font-mono">2024.01.10 14:20</span>
                                                </div>
                                                <span className="px-3 py-1 bg-[#151515] rounded-full text-xs font-bold text-gray-500">201명 발송</span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
