import * as React from "react";
import { Check, ChevronsUpDown, Search, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { HiqMember } from "@shared/schema";

interface OpponentSelectorProps {
    onSelect: (member: HiqMember) => void;
    gameType: "3c" | "4c";
    selectedOpponentIds?: string[];
    compact?: boolean;
}

export function OpponentSelector({ onSelect, gameType, selectedOpponentIds = [], compact = false }: OpponentSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState("");
    const [selectedMember, setSelectedMember] = React.useState<HiqMember | null>(null);

    const { data: opponents, isLoading } = useQuery<HiqMember[]>({
        queryKey: ["/api/hiq/opponents"],
    });

    const isRecentlyVisited = (updatedAt: string | Date) => {
        const lastVisit = new Date(updatedAt);
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        return lastVisit >= threeHoursAgo;
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={`w-full justify-between bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl ${compact ? "h-10 px-3" : "h-14 rounded-2xl"}`}
                >
                    {selectedMember ? (
                        <div className="flex items-center gap-2">
                            <span className={`font-bold ${compact ? "text-xs" : ""}`}>{selectedMember.name}</span>
                            <span className={`text-[#ffd700] ${compact ? "text-[10px]" : "text-xs"}`}>
                                {gameType === "4c" ? `4구 ${selectedMember.handi4c}` : `3구 ${selectedMember.handi3c}`}
                            </span>
                        </div>
                    ) : (
                        <span className={`text-gray-500 ${compact ? "text-xs" : ""}`}>상대 선택</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#111] border-[#222]">
                <Command className="bg-transparent text-white">
                    <CommandInput placeholder="회원 이름 검색..." className="h-10 text-sm" />
                    <CommandList>
                        <CommandEmpty>결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                            {opponents?.filter(op => !selectedOpponentIds.includes(op.id)).map((opponent) => (
                                <CommandItem
                                    key={opponent.id}
                                    value={opponent.name}
                                    onSelect={() => {
                                        setSelectedMember(opponent);
                                        onSelect(opponent);
                                        setOpen(false);
                                    }}
                                    className="aria-selected:bg-white/10 hover:bg-white/5 cursor-pointer py-3"
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                    <User className="w-4 h-4 text-gray-400" />
                                                </div>
                                                {isRecentlyVisited(opponent.updatedAt) && (
                                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#111]" />
                                                )}
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-sm text-white">{opponent.name}</span>
                                                    {isRecentlyVisited(opponent.updatedAt) && (
                                                        <span className="text-[10px] text-green-500 font-bold px-1 py-0.5 bg-green-500/10 rounded tracking-tighter">접속중</span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-500">에버리지 {opponent.average || "0.00"}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-black text-[#ffd700]">
                                                {gameType === "4c" ? `4구 ${opponent.handi4c}` : `3구 ${opponent.handi3c}`}
                                            </div>
                                        </div>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
