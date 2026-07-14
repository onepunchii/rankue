
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from "@/components/ui/form";
import { LucideArrowLeft, LucideSave, LucideStore } from "lucide-react";
import { HiqStore } from "../../../../shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

// Schema for the form
const formSchema = z.object({
    name: z.string().min(1, "매장명은 필수입니다"),
    intro: z.string().optional(),
    notice: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),

    // Price
    priceLarge: z.coerce.number().min(0, "0원 이상 입력"),
    priceMedium: z.coerce.number().min(0, "0원 이상 입력"),

    // Tables
    tableLarge: z.coerce.number().min(0, "0개 이상"),
    tableMedium: z.coerce.number().min(0, "0개 이상"),

    // Time
    openTime: z.string().optional(),
    closeTime: z.string().optional(),

    // Facilities
    parkingDescription: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function PartnerSettings() {
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // 1. Fetch Store
    const { data: store, isLoading } = useQuery<HiqStore>({
        queryKey: ["/api/hiq/partner/store"],
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            intro: "",
            notice: "",
            phone: "",
            address: "",
            priceLarge: 2000,
            priceMedium: 1500,
            tableLarge: 0,
            tableMedium: 0,
            openTime: "",
            closeTime: "",
            parkingDescription: ""
        }
    });

    // Load initial values
    useEffect(() => {
        if (store) {
            form.reset({
                name: store.name || "",
                intro: store.description || "",
                notice: store.notice || "",
                phone: store.phone || "",
                address: store.address || "",
                priceLarge: store.priceLarge || 2000,
                priceMedium: store.priceMedium || 1500,
                tableLarge: store.tableLarge || 0,
                tableMedium: store.tableMedium || 0,
                openTime: store.openTime || "",
                closeTime: store.closeTime || "",
                parkingDescription: store.parkingDescription || (store.hasParking ? "주차 가능" : ""),
            });
        }
    }, [store, form]);

    const mutation = useMutation({
        mutationFn: async (values: FormValues) => {
            // Map form values to schema fields if needed
            const payload = {
                ...values,
                description: values.intro, // Map intro to description
            };
            // apiRequest already parses JSON and unwraps the {success,data} envelope,
            // returning the plain store object — do NOT call res.json() on it.
            return apiRequest("/api/hiq/partner/store", { method: "PATCH", body: payload });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/partner/store"] });
            toast({
                title: "저장 완료",
                description: "매장 정보가 성공적으로 수정되었습니다.",
            });
            setLocation("/partner/dashboard");
        },
        onError: () => {
            toast({
                title: "오류 발생",
                description: "저장에 실패했습니다.",
                variant: "destructive"
            });
        }
    });

    const onSubmit = (values: FormValues) => {
        mutation.mutate(values);
    };

    if (isLoading) return <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center text-black/55">Loading...</div>;

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans pb-24">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-black/10 bg-[#f2f0eb] sticky top-0 z-10">
                <Button variant="ghost" className="text-[rgba(0,0,0,0.87)] p-0 hover:bg-transparent" onClick={() => setLocation("/partner/dashboard")}>
                    <LucideArrowLeft className="w-6 h-6" />
                </Button>
                <h1 className="text-lg font-bold">매장 정보 수정</h1>
                <div className="w-6" />
            </div>

            <div className="p-6">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                        {/* 1. 기본 정보 */}
                        <div className="space-y-4">
                            <h2 className="text-[#006241] font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                                <LucideStore size={14} /> 기본 정보
                            </h2>
                            <div className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>매장명</FormLabel>
                                            <FormControl>
                                                <Input {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="intro"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>한줄 소개</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder="예: 깔끔하고 쾌적한 랭큐 당구장입니다." className="bg-black/[0.04] border-black/[0.08]" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="notice"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>공지사항</FormLabel>
                                            <FormControl>
                                                <Textarea {...field} placeholder="회원들에게 알릴 공지사항을 입력하세요." className="bg-black/[0.04] border-black/[0.08] min-h-[80px]" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        {/* 2. 요금 및 시설 */}
                        <div className="space-y-4">
                            <h2 className="text-[#006241] font-bold text-sm uppercase tracking-wider">요금 및 테이블</h2>
                            <div className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="priceLarge"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-black/60">대대 요금 (10분)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="tableLarge"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-black/60">대대 수량</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="priceMedium"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-black/60">중대 요금 (10분)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="tableMedium"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs text-black/60">중대 수량</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 3. 운영 정보 */}
                        <div className="space-y-4">
                            <h2 className="text-[#006241] font-bold text-sm uppercase tracking-wider">운영 정보</h2>
                            <div className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="openTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>오픈 시간</FormLabel>
                                                <FormControl>
                                                    <Input type="time" {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="closeTime"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>마감 시간</FormLabel>
                                                <FormControl>
                                                    <Input type="time" {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>매장 전화번호</FormLabel>
                                            <FormControl>
                                                <Input {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="address"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>주소</FormLabel>
                                            <FormControl>
                                                <Input {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="parkingDescription"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>주차 안내</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder="예: 건물 지하주차장 무료 이용" className="bg-black/[0.04] border-black/[0.08]" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-14 bg-[#006241] hover:bg-[#00553a] text-white font-bold text-lg rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? "저장 중..." : "저장하기"}
                        </Button>
                    </form>
                </Form>
            </div>
        </div>
    );
}
