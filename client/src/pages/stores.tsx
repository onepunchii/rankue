import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { apiRequest } from "@/lib/queryClient";
import { useNativeBridge } from "@/hooks/useNativeBridge";

interface PublicStore {
  slug: string;
  name: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
}

interface Listing {
  code: string; name: string; region: string; address: string; phone: string | null;
  openHours: string | null; tableLarge: number | null; tableMedium: number | null; tablePocket: number | null;
  rate10Large: number | null; rate10Medium: number | null;
  distanceKm: number | null;
  claimed: boolean;
}
interface ListingsResponse { total: number; rows: Listing[]; regions: Array<{ region: string; count: number }> }

const L: Record<Locale, { title: string; subtitle: string; metaTitle: string; metaDesc: string; search: string; empty: string; count: (n: number) => string; partner: string; directory: string; all: string; tables: (l: number, m: number, p: number) => string; more: string; verified: string; ownerBannerTitle: string; ownerBannerDesc: string; nearby: string; nearbyOn: string }> = {
  ko: {
    title: "매장 찾기",
    subtitle: "전국 당구장을 지역·이름으로 찾아보세요",
    metaTitle: "당구장 찾기 · 전국 당구장 디렉토리 | 랭큐",
    metaDesc: "전국 1,200여 개 당구장을 지역·이름으로 검색하세요. 주소·영업시간·테이블 구성, 랭큐 파트너 매장의 랭킹·매칭까지.",
    search: "매장명 또는 주소 검색",
    empty: "표시할 매장이 없습니다.",
    count: (n) => `총 ${n.toLocaleString()}개 매장`,
    partner: "랭큐 파트너",
    directory: "전국 당구장",
    all: "전체",
    tables: (l, m, p) => [l ? `대대 ${l}` : null, m ? `중대 ${m}` : null, p ? `포켓 ${p}` : null].filter(Boolean).join(" · "),
    more: "더 보기",
    verified: "사장님 인증",
    ownerBannerTitle: "사장님이신가요?",
    ownerBannerDesc: "목록에서 내 매장을 찾아 상세 페이지의 '내 매장 정보 관리 신청'을 눌러주세요. 승인되면 소개·요금을 직접 관리할 수 있습니다.",
    nearby: "내 주변",
    nearbyOn: "거리순",
  },
  en: {
    title: "Find a venue",
    subtitle: "Search billiards halls across Korea by region or name",
    metaTitle: "Find a Billiards Hall · Korea Directory | RANKUE",
    metaDesc: "Search 1,200+ billiards halls in Korea by region or name — address, hours, and tables, plus RANKUE partner venues.",
    search: "Search by name or address",
    empty: "No venues to show.",
    count: (n) => `${n.toLocaleString()} venues`,
    partner: "RANKUE partner",
    directory: "All halls",
    all: "All",
    tables: (l, m, p) => [l ? `L ${l}` : null, m ? `M ${m}` : null, p ? `Pocket ${p}` : null].filter(Boolean).join(" · "),
    more: "Load more",
    verified: "Owner verified",
    ownerBannerTitle: "Own a billiards hall?",
    ownerBannerDesc: "Find your venue in the list and tap 'Claim your listing' on its page to manage your info.",
    nearby: "Near me",
    nearbyOn: "By distance",
  },
  vi: {
    title: "Tìm quán",
    subtitle: "Tìm quán bi-a khắp Hàn Quốc theo khu vực hoặc tên",
    metaTitle: "Tìm quán bi-a · Danh bạ Hàn Quốc | RANKUE",
    metaDesc: "Tìm hơn 1.200 quán bi-a tại Hàn Quốc theo khu vực hoặc tên — địa chỉ, giờ mở cửa, số bàn.",
    search: "Tìm theo tên hoặc địa chỉ",
    empty: "Không có quán nào.",
    count: (n) => `${n.toLocaleString()} quán`,
    partner: "Đối tác RANKUE",
    directory: "Tất cả quán",
    all: "Tất cả",
    tables: (l, m, p) => [l ? `Lớn ${l}` : null, m ? `Vừa ${m}` : null, p ? `Pocket ${p}` : null].filter(Boolean).join(" · "),
    more: "Xem thêm",
    verified: "Chủ quán xác nhận",
    ownerBannerTitle: "Bạn là chủ quán?",
    ownerBannerDesc: "Tìm quán của bạn trong danh sách và nhấn 'Nhận quản lý trang' để tự quản lý thông tin.",
    nearby: "Gần tôi",
    nearbyOn: "Theo khoảng cách",
  },
  tr: {
    title: "Salon bul",
    subtitle: "Kore'deki bilardo salonlarını bölge veya ada göre ara",
    metaTitle: "Bilardo Salonu Bul · Kore Rehberi | RANKUE",
    metaDesc: "Kore'de 1.200'den fazla bilardo salonunu bölge veya ada göre arayın — adres, çalışma saatleri, masa sayısı.",
    search: "Ad veya adrese göre ara",
    empty: "Gösterilecek salon yok.",
    count: (n) => `${n.toLocaleString()} salon`,
    partner: "RANKUE partneri",
    directory: "Tüm salonlar",
    all: "Tümü",
    tables: (l, m, p) => [l ? `Büyük ${l}` : null, m ? `Orta ${m}` : null, p ? `Pocket ${p}` : null].filter(Boolean).join(" · "),
    more: "Daha fazla",
    verified: "Sahibi onaylı",
    ownerBannerTitle: "Salon sahibi misiniz?",
    ownerBannerDesc: "Listede salonunuzu bulun ve sayfasında 'Kaydınızı sahiplenin'e dokunun.",
    nearby: "Yakınımda",
    nearbyOn: "Mesafeye göre",
  },
  es: {
    title: "Buscar local",
    subtitle: "Busca billares en Corea por región o nombre",
    metaTitle: "Buscar billar · Directorio de Corea | RANKUE",
    metaDesc: "Busca más de 1.200 billares en Corea por región o nombre: dirección, horario y mesas.",
    search: "Buscar por nombre o dirección",
    empty: "No hay locales para mostrar.",
    count: (n) => `${n.toLocaleString()} locales`,
    partner: "Socio RANKUE",
    directory: "Todos los locales",
    all: "Todos",
    tables: (l, m, p) => [l ? `G ${l}` : null, m ? `M ${m}` : null, p ? `Pocket ${p}` : null].filter(Boolean).join(" · "),
    more: "Ver más",
    verified: "Verificado",
    ownerBannerTitle: "¿Tienes un salón?",
    ownerBannerDesc: "Encuentra tu local en la lista y pulsa 'Reclama tu ficha' para gestionar tu información.",
    nearby: "Cerca de mí",
    nearbyOn: "Por distancia",
  },
};

const PAGE_SIZE = 30;

export default function Stores() {
  const { locale } = useT();
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [older, setOlder] = useState<Listing[]>([]);
  const [nearbyOn, setNearbyOn] = useState(false);
  const { location: gps, requestLocation } = useNativeBridge();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const t = L[locale] ?? L.ko;

  // 검색 디바운스 — 타이핑마다 쏘지 않는다
  const [dq, setDq] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => { setOlder([]); }, [dq, region, nearbyOn, gps?.lat]);

  const { data: partners = [] } = useQuery<PublicStore[]>({ queryKey: ["/api/hiq/public-stores"] });

  const coords = nearbyOn && gps ? `lat=${gps.lat}&lng=${gps.lng}&` : "";
  const params = `${region ? `region=${encodeURIComponent(region)}&` : ""}${dq ? `q=${encodeURIComponent(dq)}&` : ""}${coords}limit=${PAGE_SIZE}`;
  const { data, isLoading } = useQuery<ListingsResponse>({
    queryKey: ["/api/hiq/listings", region, dq, nearbyOn && gps ? `${gps.lat},${gps.lng}` : ""],
    queryFn: async () => apiRequest(`/api/hiq/listings?${params}`),
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const first = data?.rows || [];
  const seen = new Set(first.map(r => r.code));
  const listings = [...first, ...older.filter(r => !seen.has(r.code))];
  const total = data?.total ?? 0;
  const regions = data?.regions || [];

  const loadMore = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const more: ListingsResponse = await apiRequest(`/api/hiq/listings?${params}&offset=${listings.length}`);
      setOlder(prev => {
        const have = new Set([...first, ...prev].map(r => r.code));
        return [...prev, ...more.rows.filter(r => !have.has(r.code))];
      });
    } catch { /* 재시도 가능 */ } finally {
      setIsLoadingMore(false);
    }
  };

  // 파트너 매장은 검색어·지역 필터에 맞을 때만 상단 노출
  const filteredPartners = partners.filter(
    (s) => (!dq || s.name?.toLowerCase().includes(dq.toLowerCase()) || (s.address ?? "").includes(dq))
      && (!region || (s.region ?? "").includes(region)),
  );

  useSeo({
    title: t.metaTitle,
    description: t.metaDesc,
    path: "/stores",
    locale,
    image: "https://www.rankue.co.kr/og.png",
    jsonLd: total
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: t.metaTitle,
          numberOfItems: total,
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

        {/* 지역 칩 */}
        {regions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 mb-3">
            <button
              onClick={() => {
                if (!nearbyOn) requestLocation();
                setNearbyOn(v => !v);
              }}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${nearbyOn ? "bg-brand text-white" : "bg-white text-brand shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}
            >
              📍 {nearbyOn ? t.nearbyOn : t.nearby}
            </button>
            <button
              onClick={() => setRegion("")}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${!region ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}
            >
              {t.all}
            </button>
            {regions.map(r => (
              <button
                key={r.region}
                onClick={() => setRegion(region === r.region ? "" : r.region)}
                className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${region === r.region ? "bg-ink-1 text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}
              >
                {r.region} <span className="opacity-50 tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        <p className="text-[12.5px] font-semibold text-black/45 mb-4">{t.count(total + filteredPartners.length)}</p>

        {/* 파트너 매장 — 상단 고정 */}
        {filteredPartners.length > 0 && (
          <div className="grid gap-3 mb-3">
            {filteredPartners.map((s) => (
              <button
                key={s.slug}
                onClick={() => setLocation(`/store/${encodeURIComponent(s.slug)}`)}
                className="text-left bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-brand/25 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-ink-1">{s.name}</h2>
                  <span className="px-1.5 py-0.5 rounded-full bg-brand/10 text-[10.5px] font-bold text-brand leading-none">{t.partner}</span>
                </div>
                {s.address && <p className="text-[13px] text-black/55 mt-1">{s.address}</p>}
              </button>
            ))}
          </div>
        )}

        {/* 디렉터리 */}
        {isLoading && listings.length === 0 ? (
          <div className="h-40 bg-black/[0.04] rounded-2xl animate-pulse" />
        ) : listings.length === 0 && filteredPartners.length === 0 ? (
          <p className="text-center text-black/45 py-16 text-[14px]">{t.empty}</p>
        ) : (
          <div className="grid gap-2">
            {listings.map((s) => (
              <button
                key={s.code}
                onClick={() => setLocation(`/stores/${s.code}`)}
                className="text-left bg-white rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-[15px] font-bold text-ink-1 truncate">{s.name}</h2>
                  {s.claimed && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand/10 text-[10px] font-bold text-brand leading-none">✓ {t.verified}</span>}
                </div>
                <p className="text-[12.5px] text-black/55 mt-1 truncate">{s.distanceKm != null && <span className="text-brand font-bold">{s.distanceKm}km · </span>}{s.address}</p>
                {(s.tableLarge || s.tableMedium || s.tablePocket || s.rate10Large || s.rate10Medium) && (
                  <p className="text-[12px] text-black/40 mt-0.5 tabular-nums truncate">
                    {t.tables(s.tableLarge ?? 0, s.tableMedium ?? 0, s.tablePocket ?? 0)}
                    {/* 10분당 요금 — 대대 우선, 없으면 중대 */}
                    {(s.rate10Large || s.rate10Medium) && (
                      <span className="text-brand font-semibold">
                        {(s.tableLarge || s.tableMedium || s.tablePocket) ? " · " : ""}
                        10{locale === "ko" ? "분" : "min"} {((s.rate10Large ?? s.rate10Medium) as number).toLocaleString("ko-KR")}{locale === "ko" ? "원" : "₩"}
                      </span>
                    )}
                  </p>
                )}
              </button>
            ))}
            {listings.length < total && (
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="h-12 mt-1 rounded-2xl bg-white text-[14px] font-semibold text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50"
              >
                {t.more}
              </button>
            )}
            {/* 사장님 안내 배너 — 매장주 신청의 발견 지점 (신청 자체는 각 매장 상세에서) */}
            <div className="mt-4 rounded-2xl bg-brand/[0.06] p-5 text-center">
              <p className="text-[14px] font-bold text-brand">{t.ownerBannerTitle}</p>
              <p className="text-[12.5px] text-black/55 mt-1 leading-relaxed">{t.ownerBannerDesc}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
