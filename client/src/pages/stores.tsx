import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";

interface PublicStore {
  slug: string;
  name: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
}

const L: Record<Locale, { title: string; subtitle: string; metaTitle: string; metaDesc: string; search: string; empty: string; count: (n: number) => string }> = {
  ko: {
    title: "매장 찾기",
    subtitle: "랭큐 파트너 당구장을 찾아보세요",
    metaTitle: "매장 찾기 · 랭큐 당구장 디렉토리",
    metaDesc: "랭큐와 함께하는 당구장을 지역·이름으로 찾아보세요. 매장 랭킹, 매칭, 크루 활동이 가능한 파트너 당구장 목록.",
    search: "매장명 또는 지역 검색",
    empty: "표시할 매장이 없습니다.",
    count: (n) => `총 ${n}개 매장`,
  },
  en: {
    title: "Find a venue",
    subtitle: "Discover RANKUE partner billiards halls",
    metaTitle: "Find a Venue · RANKUE Billiards Hall Directory",
    metaDesc: "Find billiards halls on RANKUE by region or name. Partner venues with store rankings, matchmaking, and crew activities.",
    search: "Search by name or region",
    empty: "No venues to show.",
    count: (n) => `${n} venues`,
  },
  vi: {
    title: "Tìm quán",
    subtitle: "Khám phá các quán bi-a đối tác của RANKUE",
    metaTitle: "Tìm quán · Danh bạ quán bi-a RANKUE",
    metaDesc: "Tìm quán bi-a trên RANKUE theo khu vực hoặc tên. Các quán đối tác có xếp hạng, ghép trận và hoạt động crew.",
    search: "Tìm theo tên hoặc khu vực",
    empty: "Không có quán nào.",
    count: (n) => `${n} quán`,
  },
  tr: {
    title: "Salon bul",
    subtitle: "RANKUE partneri bilardo salonlarını keşfedin",
    metaTitle: "Salon Bul · RANKUE Bilardo Salonu Rehberi",
    metaDesc: "RANKUE'deki bilardo salonlarını bölge veya ada göre bulun. Sıralama, eşleştirme ve ekip etkinlikleri olan partner salonlar.",
    search: "Ad veya bölgeye göre ara",
    empty: "Gösterilecek salon yok.",
    count: (n) => `${n} salon`,
  },
  es: {
    title: "Buscar local",
    subtitle: "Descubre los billares asociados de RANKUE",
    metaTitle: "Buscar local · Directorio de billares RANKUE",
    metaDesc: "Encuentra billares en RANKUE por región o nombre. Locales asociados con rankings, emparejamiento y actividades de club.",
    search: "Buscar por nombre o región",
    empty: "No hay locales para mostrar.",
    count: (n) => `${n} locales`,
  },
};

export default function Stores() {
  const { locale } = useT();
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const t = L[locale] ?? L.ko;

  const { data: stores = [], isLoading } = useQuery<PublicStore[]>({ queryKey: ["/api/hiq/public-stores"] });

  const filtered = stores.filter(
    (s) => !q || s.name?.toLowerCase().includes(q.toLowerCase()) || (s.region ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  useSeo({
    title: t.metaTitle,
    description: t.metaDesc,
    path: "/stores",
    locale,
    image: "https://www.rankue.co.kr/og.png",
    jsonLd: stores.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t.metaTitle,
          numberOfItems: stores.length,
          itemListElement: stores.slice(0, 100).map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `https://www.rankue.co.kr/store/${encodeURIComponent(s.slug)}`,
            name: s.name,
          })),
        }
      : null,
  });

  return (
    <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <header className="mb-6">
          <h1 className="text-[28px] font-bold tracking-tight">{t.title}</h1>
          <p className="text-[14px] text-black/55 mt-1">{t.subtitle}</p>
        </header>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search}
          className="w-full h-12 px-4 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[15px] outline-none focus:ring-2 focus:ring-brand/25 mb-3"
        />
        <p className="text-[12.5px] font-semibold text-black/45 mb-4">{t.count(filtered.length)}</p>

        {isLoading ? (
          <div className="h-40 bg-black/[0.04] rounded-2xl animate-pulse" />
        ) : filtered.length === 0 ? (
          <p className="text-center text-black/45 py-16 text-[14px]">{t.empty}</p>
        ) : (
          <div className="grid gap-3">
            {filtered.map((s) => (
              <button
                key={s.slug}
                onClick={() => setLocation(`/store/${encodeURIComponent(s.slug)}`)}
                className="text-left bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-transform"
              >
                <h2 className="text-[16px] font-bold text-ink-1">{s.name}</h2>
                {s.region && <p className="text-[13px] text-brand font-semibold mt-1">{s.region}</p>}
                {s.address && <p className="text-[13px] text-black/55 mt-1">{s.address}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
