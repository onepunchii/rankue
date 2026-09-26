import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { LucideCheck, LucideChevronDown, LucideMapPin } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FIELD_INPUT } from "./formKit";

/**
 * 주 활동 지역 칸 — 크루 만들기와 크루 설정이 같이 쓴다(2026-09-26: 예전엔 만든 뒤 지역을 바꿀 수 없었다).
 *
 * ko: 한국 행정동 검색(/api/hiq/regions/search) / 그 외 언어: 도시명 자유 입력
 * (지역 DB가 한국 전용이라 글로벌 유저는 검색 결과가 항상 비어 못 만들게 된다).
 * 검색 패널은 인라인이다 — Popover(포털+fixed 좌표)는 모바일에서 키보드가 뷰포트를 줄이는 순간
 * 앵커 계산이 깨져 (0,0)으로 튄다. 문서 흐름 안에 그리면 구조적으로 어긋날 수 없다.
 */
export function RegionField({ value, onChange, disabled, id }: {
    value: string;
    onChange: (region: string) => void;
    disabled?: boolean;
    id?: string;
}) {
    const { t, locale } = useT();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const { data: results } = useQuery<any[]>({
        queryKey: ["/api/hiq/regions/search", query],
        // 검색어는 반드시 인코딩한다 — "서울 강남" 의 공백·'&' 가 쿼리 문자열을 깨뜨렸다.
        queryFn: async () => (query.length < 1 ? [] : await apiRequest(`/api/hiq/regions/search?q=${encodeURIComponent(query)}`)),
        enabled: open && query.length > 0,
    });

    if (locale !== "ko") {
        return (
            <Input
                id={id}
                value={value}
                disabled={disabled}
                maxLength={60}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t("createClub.regionFreeformPlaceholder")}
                className={FIELD_INPUT}
            />
        );
    }

    return (
        <div>
            <button
                id={id}
                type="button"
                role="combobox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((v) => !v)}
                className={cn(FIELD_INPUT, "flex items-center gap-2 text-left", !value && "text-ink-4")}
            >
                <LucideMapPin className="w-4 h-4 shrink-0 text-ink-3" />
                <span className="flex-1 min-w-0 truncate">{value || t("createClub.regionPlaceholder")}</span>
                <LucideChevronDown className={cn("w-4 h-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="mt-2 rk-card overflow-hidden border border-surface-line">
                    <Command shouldFilter={false} className="bg-transparent text-ink-1 rounded-tile">
                        <CommandInput
                            autoFocus
                            placeholder={t("createClub.regionSearchPlaceholder")}
                            className="h-11 text-[15px] text-ink-1 placeholder:text-ink-4"
                            value={query}
                            onValueChange={setQuery}
                        />
                        <CommandList className="max-h-[240px] overflow-y-auto overscroll-contain">
                            <CommandEmpty className="py-8 text-center text-[13px] font-medium text-ink-3">
                                {query ? t("createClub.noResults") : t("createClub.regionSearchPrompt")}
                            </CommandEmpty>
                            <CommandGroup>
                                {(results ?? []).map((region: any) => (
                                    <CommandItem
                                        key={region.code}
                                        value={region.fullName}
                                        onSelect={() => {
                                            onChange(region.fullName);
                                            setQuery(region.fullName);
                                            setOpen(false);
                                        }}
                                        className="min-h-11 text-[15px] font-medium text-ink-2 rounded-tile cursor-pointer data-[selected=true]:bg-brand/10 data-[selected=true]:text-ink-1"
                                    >
                                        <LucideCheck className={cn("mr-2 h-4 w-4 text-brand", value === region.fullName ? "opacity-100" : "opacity-0")} />
                                        {region.fullName}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </div>
            )}
        </div>
    );
}
