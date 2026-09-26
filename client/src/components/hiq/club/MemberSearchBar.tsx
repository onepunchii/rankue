import { LucideSearch, LucideX } from "@/lib/icons";
import { CrewChip, CrewChipRow, IconButton } from "@/components/hiq/crew-ui";
import type { MemberSort } from "@shared/crewManage";
import { useT } from "@/lib/i18n";

const SORTS: Array<{ id: MemberSort; label: string }> = [
    { id: "role", label: "crewMgmt.sortRole" },
    { id: "name", label: "crewMgmt.sortName" },
    { id: "joined", label: "crewMgmt.sortJoined" },
];

/**
 * 멤버 이름 검색 + 정렬(역할순·이름순·최근 가입순) — 크루 홈 멤버 목록과 설정의 멤버 관리가 쓴다(2026-09-26).
 * 화면 안에서만 거른다(서버는 이미 전원을 내려 준다). 거르기·정렬 규칙은 shared/crewManage.filterSortMembers.
 */
export function MemberSearchBar({ query, onQuery, sort, onSort }: {
    query: string;
    onQuery: (q: string) => void;
    sort: MemberSort;
    onSort: (s: MemberSort) => void;
}) {
    const { t } = useT();
    return (
        <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 h-11 pl-3.5 rounded-tile bg-surface-1 border border-surface-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                <LucideSearch className="w-4 h-4 shrink-0 text-ink-3" aria-hidden="true" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder={t("crewMgmt.memberSearchPlaceholder")}
                    aria-label={t("crewMgmt.memberSearchPlaceholder")}
                    className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-medium text-ink-1 placeholder:text-ink-4 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                    <IconButton label={t("crewMgmt.clearSearch")} onClick={() => onQuery("")} className="[&_svg]:w-4 [&_svg]:h-4">
                        <LucideX />
                    </IconButton>
                )}
            </label>
            <CrewChipRow label={t("crewMgmt.sortLabel")}>
                {SORTS.map((s) => (
                    <CrewChip key={s.id} selected={sort === s.id} onClick={() => onSort(s.id)}>
                        {t(s.label)}
                    </CrewChip>
                ))}
            </CrewChipRow>
        </div>
    );
}
