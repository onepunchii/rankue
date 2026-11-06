import { useEffect } from "react";
import { rememberJoinStore } from "@/lib/joinStore";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { rememberVenue } from "@/lib/venue";
import { askScoreboardSignup } from "@/components/hiq/GuestCtaBar";
import { SCOREBOARD_START_PATH } from "@shared/guestConversion";
import { tableFromSearch } from "@shared/storeVenue";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";

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
  listingCode?: string | null;
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

  // 이 주소(/store/<slug>)가 **매장 QR 이 가리키는 곳**이다(사장님 화면의 홍보 탭 · 포스터). 여기로 들어온 기기에 '가입 매장' 표시를 남긴다 —
  // 이 기기에서 새 계정이 만들어지면 이 매장의 회원이 된다(2026-10-07 오너: "매장 QR 을 통해 유저가 가입하면 해당 매장 고객으로" — shared/joinStore).
  // 아래에서 정본 페이지(/stores/:code)로 넘기기 **전에** 남긴다. 매장 찾기 목록에서 들어온 사람(/stores/:code 직접)에게는 남기지 않는다.
  useEffect(() => {
    if (store?.slug) rememberJoinStore(store.slug, store.listingCode ?? null);
  }, [store?.slug, store?.listingCode]);

  // 테이블 QR(2026-11-06 — shared/storeVenue): ?table=N 이면 이 기기에 '지금 이 매장 N번 테이블'을 적고,
  // 회원은 바로 점수판 만들기로(그 경기에 이 매장 · 테이블이 같이 적힌다), 방문자는 아래의 짧은 안내(가입하면 바로 점수판).
  // 매장 페이지(/stores/:code)로 넘기지 않는다 — 치려고 찍은 사람이다.
  const search = useSearch();
  const table = tableFromSearch(search);
  const { member, isLoading: authLoading } = useAuth();
  useEffect(() => {
    if (!store?.slug || table == null) return;
    rememberVenue({ slug: store.slug, name: store.name, table });
    if (!authLoading && member) setLocation(SCOREBOARD_START_PATH, { replace: true });
  }, [store?.slug, store?.name, table, member, authLoading, setLocation]);

  // 디렉토리에 연결된 매장은 /stores/:code 가 정본(요금표·명예의전당·클레임까지 있는 페이지).
  // 이 구형 페이지는 주소만 있어서 같은 매장이 두 얼굴로 보였다(2026-08-28 오너 제보).
  useEffect(() => {
    if (table != null) return;
    if (store?.listingCode) setLocation(`/stores/${store.listingCode}`, { replace: true });
  }, [store?.listingCode, setLocation, table]);

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

  // 테이블 QR 로 온 방문자 — 이 테이블에서 랭큐 점수판으로 치기(가입하면 바로 점수판이 열린다)
  if (table != null && store && !authLoading && !member) {
    return (
      <div className="min-h-[100dvh] w-full bg-surface-0 px-5 py-14 font-sans text-ink-1" data-testid="table-qr-guest">
        <div className="mx-auto max-w-[420px] text-center">
          <p className="text-[13px] font-bold text-brand">{store.name}</p>
          <h1 className="mt-1 text-[30px] font-black tracking-tight">{table}번 테이블</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2 break-keep">랭큐 점수판으로 치면 점수 · 이닝 · 에버리지가 자동으로 쌓이고, 상대와 전적도 남아요.</p>
          <button type="button" onClick={() => askScoreboardSignup(setLocation)} data-track-as="table-qr-start" data-testid="table-qr-start"
            className="mt-7 h-14 w-full rounded-2xl bg-brand text-[16px] font-bold text-brand-fg active:scale-[0.99]">
            점수판 열기
          </button>
          <p className="mt-3 text-[12.5px] text-ink-3 break-keep">처음이면 가입부터 — 카카오로 3초면 돼요. 가입하면 {store.name} 회원이 돼요.</p>
        </div>
      </div>
    );
  }
  if (table != null && (isLoading || authLoading || member)) {
    return <div className="min-h-[100dvh] bg-surface-0" aria-busy="true" />;
  }

  return (
    <div className="min-h-screen w-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans">
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
      </div>
    </div>
  );
}
