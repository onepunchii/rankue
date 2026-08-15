import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { SiteFooter } from "@/components/hiq/SiteFooter";

interface PublicStore {
  slug: string;
  name: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  notice: string | null;
  latitude: number | null;
  longitude: number | null;
}

const L: Record<Locale, { back: string; address: string; phone: string; notice: string; notFound: string; suffix: string }> = {
  ko: { back: "매장 목록", address: "주소", phone: "전화", notice: "공지", notFound: "매장을 찾을 수 없습니다.", suffix: "당구장 · 랭큐" },
  en: { back: "All venues", address: "Address", phone: "Phone", notice: "Notice", notFound: "Venue not found.", suffix: "Billiards Hall · RANKUE" },
  vi: { back: "Danh sách quán", address: "Địa chỉ", phone: "Điện thoại", notice: "Thông báo", notFound: "Không tìm thấy quán.", suffix: "Quán bi-a · RANKUE" },
  tr: { back: "Tüm salonlar", address: "Adres", phone: "Telefon", notice: "Duyuru", notFound: "Salon bulunamadı.", suffix: "Bilardo Salonu · RANKUE" },
  es: { back: "Todos los locales", address: "Dirección", phone: "Teléfono", notice: "Aviso", notFound: "Local no encontrado.", suffix: "Billar · RANKUE" },
};

export default function StoreDetail() {
  const { locale } = useT();
  const [, params] = useRoute("/store/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug;
  const t = L[locale] ?? L.ko;

  const { data: store, isLoading } = useQuery<PublicStore>({
    queryKey: ["/api/hiq/public-stores", slug],
    enabled: !!slug,
  });

  useSeo({
    title: store ? `${store.name} · ${store.region ?? ""} ${t.suffix}`.replace(/\s+/g, " ").trim() : `${t.suffix}`,
    description: store
      ? (store.description || `${store.name}${store.region ? " (" + store.region + ")" : ""} — 랭큐 파트너 당구장. 매장 랭킹·매칭·크루.`)
      : "랭큐 파트너 당구장 정보.",
    path: `/store/${slug ?? ""}`,
    locale,
    image: "https://www.rankue.co.kr/og.png",
    jsonLd: store
      ? {
          "@context": "https://schema.org",
          "@type": "SportsActivityLocation",
          name: store.name,
          url: `https://www.rankue.co.kr/store/${encodeURIComponent(store.slug)}`,
          ...(store.description ? { description: store.description } : {}),
          ...(store.phone ? { telephone: store.phone } : {}),
          ...(store.address || store.region
            ? {
                address: {
                  "@type": "PostalAddress",
                  ...(store.address ? { streetAddress: store.address } : {}),
                  ...(store.region ? { addressLocality: store.region } : {}),
                  addressCountry: "KR",
                },
              }
            : {}),
          ...(store.latitude && store.longitude
            ? { geo: { "@type": "GeoCoordinates", latitude: store.latitude, longitude: store.longitude } }
            : {}),
        }
      : null,
  });

  return (
    <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <button onClick={() => setLocation("/stores")} className="text-[13px] font-semibold text-brand mb-6">
          ← {t.back}
        </button>

        {isLoading ? (
          <div className="h-40 bg-black/[0.04] rounded-2xl animate-pulse" />
        ) : !store ? (
          <p className="text-center text-black/45 py-16 text-[14px]">{t.notFound}</p>
        ) : (
          <article>
            <h1 className="text-[28px] font-bold tracking-tight">{store.name}</h1>
            {store.region && <p className="text-[15px] font-semibold text-brand mt-1.5">{store.region}</p>}
            {store.description && <p className="text-[15px] text-black/70 leading-relaxed mt-4">{store.description}</p>}

            <dl className="mt-6 bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-3">
              {store.address && (
                <div>
                  <dt className="text-[12px] font-semibold text-black/45">{t.address}</dt>
                  <dd className="text-[14px] text-ink-1 mt-0.5">{store.address}</dd>
                </div>
              )}
              {store.phone && (
                <div>
                  <dt className="text-[12px] font-semibold text-black/45">{t.phone}</dt>
                  <dd className="text-[14px] text-ink-1 mt-0.5">
                    <a href={`tel:${store.phone}`} className="text-brand">{store.phone}</a>
                  </dd>
                </div>
              )}
              {store.notice && (
                <div>
                  <dt className="text-[12px] font-semibold text-black/45">{t.notice}</dt>
                  <dd className="text-[14px] text-ink-1 mt-0.5 whitespace-pre-line">{store.notice}</dd>
                </div>
              )}
            </dl>
          </article>
        )}

        <SiteFooter />
      </div>
    </div>
  );
}
