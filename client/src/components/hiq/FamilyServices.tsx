import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { isNativeApp } from "@/lib/nativeBridge";
import { useSport } from "@/contexts/SportContext";
import { LucideArrowUpRight } from "@/lib/icons";
import {
    familyOthers,
    familyTarget,
    familyIsStore,
    withFamilyAttribution,
    type FamilyId,
    type FamilyPlatform,
} from "@shared/familyServices";

// 패밀리 서비스 카드 — 형제 서비스 상호 홍보.
//
// 데이터(어느 스토어에 있나)는 shared/familyServices.ts 가 갖고, 문구와 모양은 여기서
// 랭큐의 디자인 언어(rk-card / rk-chip / ink-1)로 그린다. 다른 사이트에 이식할 때는
// 레지스트리만 복사하고 이 컴포넌트는 그 사이트 컴포넌트로 새로 그리는 것이 맞다.
//
// 문구 키 규칙: menu.<id>Chip / menu.<id>Title / menu.<id>Desc
//   (기존 menu.tohkChip 등이 이미 쓰던 규칙을 그대로 이어간다)

const SELF: FamilyId = "rankue";

// 모양(2026-10-07 오너: "패밀리 서비스 디자인도 변경 — 깔끔하지만 눈에 띄게"): 서비스마다 큰 카드 한 장씩(다섯 장이 화면 두 쪽을 차지했다)이던 것을
// **한 상자 안의 줄 목록**으로 바꿨다 — 줄마다 색 타일(이모지) · 분류(서비스 색) · 제목 · 설명, 줄 사이는 가는 선.
// 서비스별 강조색 — 줄이 한 덩어리로 안 보이게 구분해 준다. 색은 리터럴로 둔다: 골프 테마(어두운 화면)는 유틸리티 색을 바꿔 끼우고,
// 어두운 상자 위에서는 700 단계 글자가 안 읽힌다 → 밝은 화면용(ink) · 어두운 화면용(inkDark) 두 벌. tile 은 같은 색의 옅은 바탕이다.
const ACCENT: Record<FamilyId, { emoji: string; ink: string; inkDark: string; tile: string; tileDark: string }> = {
    mapix: { emoji: "📍", ink: "#047857", inkDark: "#6EE7B7", tile: "#10B9811F", tileDark: "#10B98133" },
    rankue: { emoji: "🎱", ink: "#006241", inkDark: "#64DD17", tile: "#0062411F", tileDark: "#64DD1733" },
    xong: { emoji: "🎤", ink: "#BE185D", inkDark: "#F9A8D4", tile: "#EC48991F", tileDark: "#EC489933" },
    onp: { emoji: "🌱", ink: "#B45309", inkDark: "#FCD34D", tile: "#F59E0B24", tileDark: "#F59E0B33" },
    tohk: { emoji: "💌", ink: "#7E22CE", inkDark: "#D8B4FE", tile: "#A855F71F", tileDark: "#A855F733" },
    mudangk: { emoji: "🔮", ink: "#4338CA", inkDark: "#A5B4FC", tile: "#6366F11F", tileDark: "#6366F133" },
};

// 훅과 착지점이 어긋나는 서비스가 있으면 여기서 웹 URL 로 고정한다. 지금은 비어 있다.
//
// (이력) tohk 카드는 한때 "무료 운세 · 꿈해몽" 훅이었고, 그때는 스토어(=손편지로 브랜딩된
//   앱 페이지)로 보내면 훅과 화면이 어긋나서 /saju 로 우회시켰다. 그런데 tohk 의 운세 기능은
//   애플 심사 대응으로 숨겨졌고(tohk 레포 커밋 2f21961) /saju 는 현재 본문 25자짜리 빈
//   페이지다. 그래서 훅을 앱의 정체인 **손편지·기념일**로 바꿨고, 이제 훅과 스토어 페이지가
//   맞으므로 예외 없이 다른 서비스와 똑같이 기기별 스토어로 보낸다.
const WEB_ONLY: Partial<Record<FamilyId, string>> = {};

function detectPlatform(): FamilyPlatform {
    if (typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent.toLowerCase();
    // iPadOS 13+ 는 UA 에 iPad 가 없고 Mac 으로 위장한다 → 터치 포인트로 가른다.
    const iPadOS = /macintosh/.test(ua) && typeof document !== "undefined" && navigator.maxTouchPoints > 1;
    if (/iphone|ipad|ipod/.test(ua) || iPadOS) return "ios";
    if (/android/.test(ua)) return "android";
    return "other";
}

export function FamilyServices() {
    const { t } = useT();
    const { currentSport } = useSport();
    // 골프 모드는 어두운 화면이다 — 서비스 색을 밝은 쪽으로 쓴다
    const dark = currentSport === "GOLF";

    // 네이티브 앱 안에서도 형제 서비스는 보여준다(자기 앱 설치 배너와 달리 홍보 대상이
    // 다른 앱이므로 "이미 쓰는 사람에게 받으라고 한다"는 사고가 아니다).
    // 다만 기기 판별은 그대로 적용해 애플 기기에 Play 링크가 나가지 않게 한다 —
    // 애플 심사 지침이 앱 내 타 플랫폼 언급을 막는다.
    const platform = useMemo(() => {
        const p = detectPlatform();
        // 네이티브 앱은 UA 로 플랫폼이 확정된다. 웹과 같은 규칙이면 충분하다.
        void isNativeApp;
        return p;
    }, []);

    const items = useMemo(() => familyOthers(SELF), []);
    if (!items.length) return null;

    return (
        <div className="relative z-10 mb-12">
            <h3 className="text-[15px] font-semibold text-black/55 mb-3 px-1">{t("menu.familyServices")}</h3>
            <div className="rk-card overflow-hidden divide-y divide-surface-line">
                {items.map((s) => {
                    const a = ACCENT[s.id];
                    const override = WEB_ONLY[s.id];
                    const href = withFamilyAttribution(override ?? familyTarget(s, platform), SELF);
                    const isStore = !override && familyIsStore(s, platform);
                    return (
                        <a
                            key={s.id}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2 transition-colors"
                        >
                            <span
                                aria-hidden
                                className="w-11 h-11 rounded-tile flex items-center justify-center shrink-0 text-[21px] leading-none"
                                style={{ backgroundColor: dark ? a.tileDark : a.tile }}
                            >
                                {a.emoji}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[12px] font-semibold" style={{ color: dark ? a.inkDark : a.ink }}>{t(`menu.${s.id}Chip`)}</span>
                                <span className="block text-[15px] font-semibold text-ink-1 leading-snug mt-0.5 break-keep">{t(`menu.${s.id}Title`)}</span>
                                <span className="block text-[12.5px] text-black/45 font-medium mt-0.5 break-keep">
                                    {t(`menu.${s.id}Desc`)}
                                    {/* 착지점이 스토어면 그렇다고 알린다. 스토어인 줄 모르고 눌렀다가
                                        스토어가 뜨면 배신감이 들고, 반대로 "설치"라 써놓고 웹이 뜨면 더 나쁘다. */}
                                    <span className="text-black/35"> · {isStore ? t("menu.familyGetApp") : t("menu.familyOpenWeb")}</span>
                                </span>
                            </span>
                            <LucideArrowUpRight aria-hidden className="w-4 h-4 shrink-0 text-black/30" />
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
