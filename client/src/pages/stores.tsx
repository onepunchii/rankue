import { useEffect, useState } from "react";
import { STORES_COVER } from "@shared/pageCovers";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { regionTitleKo, regionDescKo, cityTitleKo, cityDescKo, cityHubPath, listingCityOf, isNewlyLicensed, licenseSinceKo } from "@shared/storeMeta";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { StoreTableMap } from "@/components/hiq/stores/StoreTableMap";

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
  /** 인허가 자료(2026-10-19~) — 옛 답엔 없다 */
  source?: string | null; licenseDate?: string | null; govStatus?: string | null;
}
interface ListingsResponse { total: number; rows: Listing[]; regions: Array<{ region: string; count: number }>; cities?: Array<{ city: string; count: number }> }

const L: Record<Locale, { title: string; subtitle: string; metaTitle: string; metaDesc: string; search: string; empty: string; count: (n: number) => string; partner: string; directory: string; all: string; tables: (l: number, m: number, p: number) => string; more: string; verified: string; ownerBannerTitle: string; ownerBannerDesc: string; registerCta: string; nearby: string; nearbyOn: string; mapAll: (n: number) => string; mapIn: (r: string, n: number) => string; mapLegend: string; mapHint: string; mapByRegion: string; mapOthers: (n: number) => string; mapByCity: (r: string) => string; mapBackAll: string; newOpen: string; paused: string; licensed: (ymd: string) => string }> = {
  ko: {
    title: "매장 찾기",
    subtitle: "전국 당구장을 지역·이름으로 찾아보세요",
    metaTitle: "당구장 찾기 · 전국 당구장 디렉토리 | 랭큐",
    metaDesc: "전국 1만 5천여 개 당구장을 지역·이름으로 검색하세요. 주소·영업시간·테이블 구성, 랭큐 파트너 매장의 랭킹·매칭까지.",
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
    registerCta: "내 매장 등록하기",
    nearby: "내 주변",
    nearbyOn: "거리순",
    mapAll: (n) => `전국 ${n.toLocaleString()}곳`,
    mapIn: (r, n) => `${r} ${n.toLocaleString()}곳`,
    mapLegend: "공 하나가 당구장 한 곳",
    mapHint: "지도나 지역을 누르면 그 지역만",
    mapByRegion: "지역별",
    mapOthers: (n) => `그 밖 ${n.toLocaleString()}곳`,
    mapByCity: (r) => `${r} 시군구별`,
    mapBackAll: "전국",
    newOpen: "새로 연 곳", paused: "휴업",
    licensed: (d) => `${licenseSinceKo(d) ?? d.slice(0, 4)} · 인허가`,
  },
  en: {
    title: "Find a venue",
    subtitle: "Search billiards halls across Korea by region or name",
    metaTitle: "Find a Billiards Hall · Korea Directory | RANKUE",
    metaDesc: "Search 15,000+ billiards halls in Korea by region or name — address, hours, and tables, plus RANKUE partner venues.",
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
    registerCta: "Register my venue",
    nearby: "Near me",
    nearbyOn: "By distance",
    mapAll: (n) => `${n.toLocaleString()} halls`,
    mapIn: (r, n) => `${r} · ${n.toLocaleString()}`,
    mapLegend: "Each ball is a hall",
    mapHint: "Tap a region to see only its halls",
    mapByRegion: "By region",
    mapOthers: (n) => `${n.toLocaleString()} elsewhere`,
    mapByCity: (r) => `${r} by district`,
    mapBackAll: "All",
    newOpen: "New", paused: "Paused",
    licensed: (d) => `Licensed ${d.slice(0, 7)}`,
  },
  vi: {
    title: "Tìm quán",
    subtitle: "Tìm quán bi-a khắp Hàn Quốc theo khu vực hoặc tên",
    metaTitle: "Tìm quán bi-a · Danh bạ Hàn Quốc | RANKUE",
    metaDesc: "Tìm hơn 15.000 quán bi-a tại Hàn Quốc theo khu vực hoặc tên — địa chỉ, giờ mở cửa, số bàn.",
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
    registerCta: "Đăng ký quán của tôi",
    nearby: "Gần tôi",
    nearbyOn: "Theo khoảng cách",
    mapAll: (n) => `${n.toLocaleString()} quán`,
    mapIn: (r, n) => `${r} · ${n.toLocaleString()}`,
    mapLegend: "Mỗi bi là một quán",
    mapHint: "Chạm vào một vùng để chỉ xem quán ở đó",
    mapByRegion: "Theo vùng",
    mapOthers: (n) => `${n.toLocaleString()} nơi khác`,
    mapByCity: (r) => `${r} theo quận`,
    mapBackAll: "Toàn quốc",
    newOpen: "Mới mở", paused: "Tạm nghỉ",
    licensed: (d) => `Cấp phép ${d.slice(0, 7)}`,
  },
  tr: {
    title: "Salon bul",
    subtitle: "Kore'deki bilardo salonlarını bölge veya ada göre ara",
    metaTitle: "Bilardo Salonu Bul · Kore Rehberi | RANKUE",
    metaDesc: "Kore'de 15.000'den fazla bilardo salonunu bölge veya ada göre arayın — adres, çalışma saatleri, masa sayısı.",
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
    registerCta: "Salonumu kaydet",
    nearby: "Yakınımda",
    nearbyOn: "Mesafeye göre",
    mapAll: (n) => `${n.toLocaleString()} salon`,
    mapIn: (r, n) => `${r} · ${n.toLocaleString()}`,
    mapLegend: "Her top bir salon",
    mapHint: "Yalnızca o bölgeyi görmek için bölgeye dokun",
    mapByRegion: "Bölgeye göre",
    mapOthers: (n) => `Diğer ${n.toLocaleString()}`,
    mapByCity: (r) => `${r} ilçeye göre`,
    mapBackAll: "Tümü",
    newOpen: "Yeni", paused: "Ara verdi",
    licensed: (d) => `Ruhsat ${d.slice(0, 7)}`,
  },
  es: {
    title: "Buscar local",
    subtitle: "Busca billares en Corea por región o nombre",
    metaTitle: "Buscar billar · Directorio de Corea | RANKUE",
    metaDesc: "Busca más de 15.000 billares en Corea por región o nombre: dirección, horario y mesas.",
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
    registerCta: "Registrar mi local",
    nearby: "Cerca de mí",
    nearbyOn: "Por distancia",
    mapAll: (n) => `${n.toLocaleString()} salones`,
    mapIn: (r, n) => `${r} · ${n.toLocaleString()}`,
    mapLegend: "Cada bola es una sala",
    mapHint: "Toca una región para ver solo sus salas",
    mapByRegion: "Por región",
    mapOthers: (n) => `${n.toLocaleString()} en otras`,
    mapByCity: (r) => `${r} por distrito`,
    mapBackAll: "Todo",
    newOpen: "Nuevo", paused: "Pausado",
    licensed: (d) => `Licencia ${d.slice(0, 7)}`,
  },
};

const PAGE_SIZE = 30;

export default function Stores() {
  const { locale } = useT();
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  // 지역은 URL(?region=서울)과 동기화 — 지역 허브가 공유·색인 가능한 고정 URL 이 된다
  // (프리렌더 /stores?region= 와 같은 주소). 칩을 누르면 URL 도 함께 바뀐다.
  const [region, setRegionState] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("region")?.slice(0, 10) ?? ""; } catch { return ""; }
  });
  // 시군구(2026-10-19 — 인허가 자료로 1만 5천 곳) — ?region=서울&city=강남구, 시도를 바꾸면 비운다
  const [city, setCityState] = useState(() => {
    try { const c = new URLSearchParams(window.location.search).get("city") ?? ""; return /^[가-힣]{1,6}(시|군|구)$/.test(c) ? c : ""; } catch { return ""; }
  });
  const syncUrl = (r: string, c: string) => {
    try { window.history.replaceState(null, "", r ? (c ? cityHubPath(r, c) : `/stores?region=${encodeURIComponent(r)}`) : "/stores"); } catch { /* 히스토리 갱신 실패는 무시 — 필터는 그대로 동작 */ }
  };
  const setRegion = (r: string) => {
    setRegionState(r);
    setCityState("");
    syncUrl(r, "");
  };
  const setCity = (c: string) => { setCityState(c); syncUrl(region, c); };
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
  useEffect(() => { setOlder([]); }, [dq, region, city, nearbyOn, gps?.lat]);

  const { data: partners = [] } = useQuery<PublicStore[]>({ queryKey: ["/api/hiq/public-stores"] });

  const coords = nearbyOn && gps ? `lat=${gps.lat}&lng=${gps.lng}&` : "";
  const params = `${region ? `region=${encodeURIComponent(region)}&` : ""}${region && city ? `city=${encodeURIComponent(city)}&` : ""}${dq ? `q=${encodeURIComponent(dq)}&` : ""}${coords}limit=${PAGE_SIZE}`;
  const { data, isLoading } = useQuery<ListingsResponse>({
    queryKey: ["/api/hiq/listings", region, city, dq, nearbyOn && gps ? `${gps.lat},${gps.lng}` : ""],
    queryFn: async () => apiRequest(`/api/hiq/listings?${params}`),
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const first = data?.rows || [];
  const seen = new Set(first.map(r => r.code));
  const listings = [...first, ...older.filter(r => !seen.has(r.code))];
  const total = data?.total ?? 0;
  const regions = data?.regions || [];
  const cities = data?.cities || [];

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

  // 파트너 매장은 검색어·지역·시군구 필터에 맞을 때만 상단 노출.
  // 2026-10-20 화면 확인: 시군구(?city=)를 안 봐서 '서울 강남구' 목록 맨 위에 광진구 파트너가 떴다(총 수도 하나 많았다).
  // 시군구는 목록 API 와 같은 뜻 — 주소의 둘째 낱말(listingCityOf)
  const filteredPartners = partners.filter(
    (s) => (!dq || s.name?.toLowerCase().includes(dq.toLowerCase()) || (s.address ?? "").includes(dq))
      && (!region || (s.region ?? "").includes(region))
      && (!region || !city || listingCityOf(s.address) === city),
  );

  // 지역 허브(?region=)는 서버 프리렌더(server/prerender.ts /stores)와 문자 단위로 같은 제목·설명 — shared/storeMeta.ts 공유.
  const regionSeo = region && locale === "ko" && regions.some((r) => r.region === region);
  const citySeo = regionSeo && !!city && cities.some((c) => c.city === city);
  useSeo({
    title: citySeo ? cityTitleKo(region, city) : regionSeo ? regionTitleKo(region) : t.metaTitle,
    description: citySeo ? cityDescKo(region, city, total) : regionSeo ? regionDescKo(region, total) : t.metaDesc,
    path: citySeo ? cityHubPath(region, city) : regionSeo ? `/stores?region=${encodeURIComponent(region)}` : "/stores",
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
    <div className="min-h-screen w-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12 pb-28 md:pb-12">
        {/* 표지 그림(2026-10-12) — 당구장 한 장. 좁은 화면에서는 양 끝까지, 넓은 화면에서는 둥근 판 */}
        <header className="relative -mx-5 -mt-12 mb-6 h-[208px] overflow-hidden md:mx-0 md:mt-0 md:rounded-3xl" data-testid="stores-cover">
          <img src={STORES_COVER} alt="" aria-hidden width={880} height={440} draggable={false} decoding="async" className="absolute inset-0 h-full w-full select-none object-cover" />
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(6,42,30,0.86) 100%)" }} />
          <div className="absolute inset-x-5 bottom-4">
            <h1 className="text-[28px] font-bold tracking-tight text-[#FFFFFF]">{t.title}</h1>
            <p className="text-[14px] text-[#FFFFFFD9] mt-1">{t.subtitle}</p>
          </div>
        </header>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search}
          className="w-full h-12 px-4 rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[15px] outline-none focus:ring-2 focus:ring-brand/25 mb-3"
        />

        {/* 전국 당구장 지도(2026-10-17) — 위에서 본 당구대 위의 공. 시도를 누르면 아래 칩과 같은 지역 고르기 */}
        {!dq && !nearbyOn && (
          <StoreTableMap region={region} city={city} onPick={(r) => setRegion(r)} onPickCity={setCity} copy={{ all: t.mapAll, inRegion: t.mapIn, legend: t.mapLegend, hint: t.mapHint, byRegion: t.mapByRegion, others: t.mapOthers, byCity: t.mapByCity, backAll: t.mapBackAll }} />
        )}

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

        {/* 시군구 칩 — 시도를 골랐을 때(2026-10-19) */}
        {region && cities.length > 1 && !nearbyOn && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 mb-3" data-testid="stores-city-chips">
            {cities.map((c) => (
              <button
                key={c.city}
                onClick={() => setCity(city === c.city ? "" : c.city)}
                className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors ${city === c.city ? "bg-brand text-white" : "bg-white text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}
              >
                {c.city} <span className="opacity-60 tabular-nums">{c.count}</span>
              </button>
            ))}
          </div>
        )}

        <p className="text-[12.5px] font-semibold text-black/55 mb-4">{t.count(total + filteredPartners.length)}</p>

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
                  <span className="px-1.5 py-0.5 rounded-full bg-brand/10 text-[12px] font-bold text-brand leading-none shrink-0">{t.partner}</span>
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
          <div className="text-center py-14">
            <p className="text-black/55 text-[14px]">{t.empty}</p>
            {/* 검색해도 없다 = 신규 등록의 가장 자연스러운 순간 */}
            <button
              onClick={() => setLocation("/stores/register")}
              className="mt-4 h-11 px-5 rounded-full bg-brand text-white text-[13.5px] font-bold active:scale-[0.98] transition-transform"
            >
              {t.registerCta} →
            </button>
          </div>
        ) : (
          <div className="grid gap-2">
            {listings.map((s) => (
              <button
                key={s.code}
                onClick={() => setLocation(`/stores/${s.code}`)}
                className="min-w-0 text-left bg-white rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-[15px] font-bold text-ink-1 truncate">{s.name}</h2>
                  {s.claimed && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand/10 text-[12px] font-bold text-brand leading-none">✓ {t.verified}</span>}
                  {/* 새로 연 곳 · 휴업(2026-10-21) — 인허가 자료의 인허가일 · 영업 상태. 매장 페이지와 같은 셈(shared/storeMeta) */}
                  {!s.claimed && s.govStatus === "paused" && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#FFF4DC] text-[12px] font-bold text-[#7A5208] leading-none" data-testid="stores-row-paused">{t.paused}</span>}
                  {s.govStatus !== "paused" && isNewlyLicensed(s.licenseDate, Date.now()) && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#F4C542] text-[12px] font-bold text-[#3A2A05] leading-none" data-testid="stores-row-new">{t.newOpen}</span>}
                </div>
                <p className="text-[12.5px] text-black/55 mt-1 truncate">{s.distanceKm != null && <span className="text-brand font-bold">{s.distanceKm}km · </span>}{s.address}</p>
                {(s.tableLarge || s.tableMedium || s.tablePocket || s.rate10Large || s.rate10Medium) && (
                  <p className="text-[12px] text-black/55 mt-0.5 tabular-nums truncate">
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
                {/* 요금 · 테이블이 없는 줄(인허가 자료로만 들어온 곳)은 빈 줄 대신 인허가 해 — 몇 년째 이 자리인지라도(2026-10-21) */}
                {!(s.tableLarge || s.tableMedium || s.tablePocket || s.rate10Large || s.rate10Medium) && s.licenseDate && (
                  <p className="text-[12px] text-black/45 mt-0.5 truncate" data-testid="stores-row-license">{t.licensed(s.licenseDate)}</p>
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
              {/* 목록에 없는 매장 — 신규 등록 신청 (승인 시 매장 페이지+사장님 권한 발급) */}
              <button
                onClick={() => setLocation("/stores/register")}
                className="mt-3 h-10 px-4 rounded-full bg-brand text-white text-[13px] font-bold active:scale-[0.98] transition-transform"
              >
                {t.registerCta} →
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 모바일 하단 네비 — 앱에서 넘어온 사용자가 돌아갈 길, 검색 유입에는 제품 진입로.
          데스크톱은 넓은 공개 레이아웃이라 앱 탭바가 어울리지 않아 감춘다. */}
      <div className="md:hidden"><HiqNavigation /></div>
    </div>
  );
}
