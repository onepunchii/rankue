import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { isNativeApp } from "@/lib/nativeBridge";
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

// 서비스별 강조색 — 카드가 한 덩어리로 안 보이게 구분해 준다.
const ACCENT: Record<FamilyId, { chip: string; hover: string }> = {
    mapix: { chip: "bg-emerald-500/[0.10] text-emerald-700", hover: "group-hover:text-emerald-700/80" },
    rankue: { chip: "bg-brand/[0.12] text-brand", hover: "group-hover:text-brand/80" },
    xong: { chip: "bg-pink-500/[0.10] text-pink-700", hover: "group-hover:text-pink-700/80" },
    onp: { chip: "bg-amber-500/[0.12] text-amber-700", hover: "group-hover:text-amber-700/80" },
    tohk: { chip: "bg-purple-500/[0.10] text-purple-700", hover: "group-hover:text-purple-700/80" },
    mudangk: { chip: "bg-indigo-500/[0.10] text-indigo-700", hover: "group-hover:text-indigo-700/80" },
};

// 훅과 착지점을 일치시키기 위한 사이트별 예외.
//
// tohk: 랭큐의 카드 문구는 "무료 운세 · 꿈해몽 / 어젯밤 그 꿈, 혹시 태몽? 흉몽?" 이다.
//   그런데 tohk 의 앱은 스토어에 **"현경이에게 - 마음을 전하는 손편지"** 로 올라가 있고
//   (한 사이트에 손편지 + 사주 + 특별한 날이 같이 있다), 홈도 손편지 화면이다.
//   운세 훅을 누른 사람에게 손편지 스토어 페이지를 보여주면 "잘못 눌렀나" 하고 되돌아간다.
//   → 이 카드만은 스토어로 보내지 않고 운세 화면(/saju)으로 보낸다.
//   문구를 손편지 쪽으로 바꾸기로 하면 이 예외를 지우면 된다(그때는 스토어로 간다).
const WEB_ONLY: Partial<Record<FamilyId, string>> = {
    tohk: "https://www.tohk.co.kr/saju",
};

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
            <div className="flex flex-col gap-2.5">
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
                            className="block rk-card p-5 hover:bg-surface-2 transition-colors group"
                        >
                            <span className={`rk-chip mb-2.5 ${a.chip}`}>{t(`menu.${s.id}Chip`)}</span>
                            <h3 className="text-[16px] font-semibold text-ink-1 leading-tight mt-1.5">
                                {t(`menu.${s.id}Title`)}
                            </h3>
                            <p className={`text-[12.5px] text-black/40 font-medium mt-1 transition-colors ${a.hover}`}>
                                {t(`menu.${s.id}Desc`)}
                                {/* 착지점이 스토어면 그렇다고 알린다. 스토어인 줄 모르고 눌렀다가
                                    스토어가 뜨면 배신감이 들고, 반대로 "설치"라 써놓고 웹이 뜨면 더 나쁘다. */}
                                <span className="text-black/30"> · {isStore ? t("menu.familyGetApp") : t("menu.familyOpenWeb")}</span>
                            </p>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
