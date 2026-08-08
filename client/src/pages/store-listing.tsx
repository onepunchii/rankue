import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Listing {
  code: string; name: string; region: string; address: string; phone: string | null;
  openHours: string | null; tableLarge: number | null; tableMedium: number | null; tablePocket: number | null;
  rate10Large: number | null; rate10Medium: number | null; rate10Pocket: number | null;
  flatLarge: number | null; flatMedium: number | null; flatPocket: number | null;
  claimed: boolean; description: string | null;
  crews?: Array<{ id: string; name: string; emblem: string | null; gameType: string; memberCount: number }>;
}

// 페이지 문구 — 디렉터리는 한국 콘텐츠지만 라벨은 5개 언어 (stores.tsx와 같은 패턴)
const L: Record<Locale, Record<string, string>> = {
  ko: {
    back: "매장 찾기", unverified: "수집 정보", verified: "✓ 사장님 인증",
    address: "주소", phone: "전화", hours: "영업시간", tables: "테이블",
    large: "대대", medium: "중대", pocket: "포켓",
    rates: "요금", per10: "10분당", flat: "정액", won: "원",
    crewsTitle: "이 매장에서 활동하는 크루", crewMembers: "명",
    descEmpty: "사장님 인증 후 매장 소개가 표시됩니다.",
    claimCta: "사장님이신가요? 내 매장 정보 관리 신청",
    claimTitle: "내 매장 관리 신청",
    claimDesc: "확인 후 연락드리고, 승인되면 영업시간·소개 등을 직접 수정할 수 있습니다.",
    claimName: "성함", claimPhone: "연락처 (예: 010-1234-5678)", claimMsg: "메시지 (선택)",
    claimSubmit: "신청하기", claimDone: "신청이 접수되었습니다. 확인 후 연락드릴게요!",
    suggestCta: "정보가 다른가요? 수정 제안",
    suggestTitle: "정보 수정 제안",
    suggestDesc: "폐업·이전·영업시간 변경 등 다른 정보를 알려주세요.",
    suggestMsg: "수정할 내용", suggestContact: "회신 연락처 (선택)",
    suggestSubmit: "보내기", suggestDone: "제보 감사합니다! 확인 후 반영하겠습니다.",
    notFound: "매장을 찾을 수 없습니다", loading: "불러오는 중...", error: "문제가 발생했습니다",
    close: "닫기",
  },
  en: {
    back: "Find a venue", unverified: "Collected info", verified: "✓ Owner verified",
    address: "Address", phone: "Phone", hours: "Hours", tables: "Tables",
    large: "Large", medium: "Medium", pocket: "Pocket",
    rates: "Rates", per10: "per 10 min", flat: "Flat rate", won: "₩",
    crewsTitle: "Crews based at this venue", crewMembers: "members",
    descEmpty: "The owner's introduction will appear after verification.",
    claimCta: "Own this hall? Claim your listing",
    claimTitle: "Claim this listing",
    claimDesc: "We'll contact you to verify. Once approved you can edit hours, intro and more.",
    claimName: "Name", claimPhone: "Contact number", claimMsg: "Message (optional)",
    claimSubmit: "Submit", claimDone: "Received! We'll be in touch.",
    suggestCta: "Something wrong? Suggest an edit",
    suggestTitle: "Suggest an edit",
    suggestDesc: "Closed, moved, or different hours? Let us know.",
    suggestMsg: "What should change", suggestContact: "Reply contact (optional)",
    suggestSubmit: "Send", suggestDone: "Thanks! We'll review and update.",
    notFound: "Venue not found", loading: "Loading...", error: "Something went wrong",
    close: "Close",
  },
  vi: {
    back: "Tìm quán", unverified: "Thông tin thu thập", verified: "✓ Chủ quán xác nhận",
    address: "Địa chỉ", phone: "Điện thoại", hours: "Giờ mở cửa", tables: "Bàn",
    large: "Lớn", medium: "Vừa", pocket: "Pocket",
    rates: "Giá", per10: "mỗi 10 phút", flat: "Trọn gói", won: "₩",
    crewsTitle: "Crew hoạt động tại đây", crewMembers: "thành viên",
    descEmpty: "Phần giới thiệu sẽ hiển thị sau khi chủ quán xác nhận.",
    claimCta: "Bạn là chủ quán? Nhận quản lý trang này",
    claimTitle: "Nhận quản lý trang",
    claimDesc: "Chúng tôi sẽ liên hệ xác minh. Sau khi duyệt, bạn có thể tự sửa thông tin.",
    claimName: "Họ tên", claimPhone: "Số liên lạc", claimMsg: "Lời nhắn (tùy chọn)",
    claimSubmit: "Gửi", claimDone: "Đã nhận! Chúng tôi sẽ liên hệ.",
    suggestCta: "Thông tin sai? Đề xuất sửa",
    suggestTitle: "Đề xuất chỉnh sửa",
    suggestDesc: "Đóng cửa, chuyển địa điểm hay đổi giờ? Hãy cho chúng tôi biết.",
    suggestMsg: "Nội dung cần sửa", suggestContact: "Liên hệ phản hồi (tùy chọn)",
    suggestSubmit: "Gửi", suggestDone: "Cảm ơn! Chúng tôi sẽ kiểm tra và cập nhật.",
    notFound: "Không tìm thấy quán", loading: "Đang tải...", error: "Đã xảy ra lỗi",
    close: "Đóng",
  },
  tr: {
    back: "Salon bul", unverified: "Derlenen bilgi", verified: "✓ Sahibi onaylı",
    address: "Adres", phone: "Telefon", hours: "Çalışma saatleri", tables: "Masalar",
    large: "Büyük", medium: "Orta", pocket: "Pocket",
    rates: "Ücretler", per10: "10 dk başına", flat: "Sabit ücret", won: "₩",
    crewsTitle: "Bu salonda aktif ekipler", crewMembers: "üye",
    descEmpty: "Sahibi doğrulandıktan sonra tanıtım burada görünecek.",
    claimCta: "Salon sizin mi? Kaydınızı sahiplenin",
    claimTitle: "Kaydı sahiplen",
    claimDesc: "Doğrulama için sizinle iletişime geçeceğiz. Onay sonrası bilgileri düzenleyebilirsiniz.",
    claimName: "Ad", claimPhone: "İletişim numarası", claimMsg: "Mesaj (isteğe bağlı)",
    claimSubmit: "Gönder", claimDone: "Alındı! Sizinle iletişime geçeceğiz.",
    suggestCta: "Bilgi yanlış mı? Düzeltme öner",
    suggestTitle: "Düzeltme öner",
    suggestDesc: "Kapandı, taşındı veya saatler mi değişti? Bize bildirin.",
    suggestMsg: "Değişmesi gereken", suggestContact: "Yanıt için iletişim (isteğe bağlı)",
    suggestSubmit: "Gönder", suggestDone: "Teşekkürler! İnceleyip güncelleyeceğiz.",
    notFound: "Salon bulunamadı", loading: "Yükleniyor...", error: "Bir sorun oluştu",
    close: "Kapat",
  },
  es: {
    back: "Buscar local", unverified: "Información recopilada", verified: "✓ Verificado",
    address: "Dirección", phone: "Teléfono", hours: "Horario", tables: "Mesas",
    large: "Grande", medium: "Mediana", pocket: "Pocket",
    rates: "Tarifas", per10: "por 10 min", flat: "Tarifa plana", won: "₩",
    crewsTitle: "Crews activos en este local", crewMembers: "miembros",
    descEmpty: "La presentación aparecerá tras la verificación del propietario.",
    claimCta: "¿Es tu local? Reclama tu ficha",
    claimTitle: "Reclamar ficha",
    claimDesc: "Te contactaremos para verificar. Tras la aprobación podrás editar la información.",
    claimName: "Nombre", claimPhone: "Número de contacto", claimMsg: "Mensaje (opcional)",
    claimSubmit: "Enviar", claimDone: "¡Recibido! Te contactaremos.",
    suggestCta: "¿Información incorrecta? Sugerir cambio",
    suggestTitle: "Sugerir cambio",
    suggestDesc: "¿Cerró, se mudó o cambió el horario? Cuéntanos.",
    suggestMsg: "Qué debería cambiar", suggestContact: "Contacto de respuesta (opcional)",
    suggestSubmit: "Enviar", suggestDone: "¡Gracias! Lo revisaremos.",
    notFound: "Local no encontrado", loading: "Cargando...", error: "Algo salió mal",
    close: "Cerrar",
  },
};

export default function StoreListingPage() {
  const { locale } = useT();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/stores/:code");
  const code = params?.code || "";
  const { toast } = useToast();
  const t = L[locale] ?? L.ko;

  const [claimOpen, setClaimOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cMsg, setCMsg] = useState("");
  const [sMsg, setSMsg] = useState("");
  const [sContact, setSContact] = useState("");

  const { data: s, isLoading } = useQuery<Listing>({
    queryKey: [`/api/hiq/listings/${code}`],
    queryFn: async () => apiRequest(`/api/hiq/listings/${code}`),
    enabled: !!code,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/hiq/listings/${code}/claim`, {
      method: "POST",
      body: { applicantName: cName, applicantPhone: cPhone, message: cMsg },
    }),
    onSuccess: () => { toast({ title: t.claimDone }); setClaimOpen(false); setCName(""); setCPhone(""); setCMsg(""); },
    onError: (e: any) => toast({ title: e?.message || t.error, variant: "destructive" }),
  });

  const suggestMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/hiq/listings/${code}/suggest`, {
      method: "POST",
      body: { message: sMsg, contact: sContact },
    }),
    onSuccess: () => { toast({ title: t.suggestDone }); setSuggestOpen(false); setSMsg(""); setSContact(""); },
    onError: (e: any) => toast({ title: e?.message || t.error, variant: "destructive" }),
  });

  useSeo({
    title: s ? `${s.name} — ${s.region} 당구장 | 랭큐` : `당구장 | 랭큐`,
    description: s ? `${s.name} — ${s.address}. 영업시간·테이블 정보와 전국 당구장 디렉토리를 랭큐에서.` : "전국 당구장 디렉토리",
    path: `/stores/${code}`,
    locale,
    jsonLd: s ? {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: s.name,
      address: { "@type": "PostalAddress", streetAddress: s.address, addressCountry: "KR" },
      telephone: s.phone || undefined,
      openingHours: s.openHours || undefined,
      url: `https://www.rankue.co.kr/stores/${code}`,
    } : null,
  });

  const tableRows = s ? [
    s.tableLarge ? [t.large, s.tableLarge] : null,
    s.tableMedium ? [t.medium, s.tableMedium] : null,
    s.tablePocket ? [t.pocket, s.tablePocket] : null,
  ].filter(Boolean) as Array<[string, number]> : [];

  // 요금 행 — [종류, 10분당, 정액] (있는 값만)
  const won = (n: number) => `${n.toLocaleString("ko-KR")}${locale === "ko" ? t.won : ""}`;
  const rateRows = s ? [
    [t.large, s.rate10Large, s.flatLarge],
    [t.medium, s.rate10Medium, s.flatMedium],
    [t.pocket, s.rate10Pocket, s.flatPocket],
  ].filter(([, r, f]) => r != null || f != null) as Array<[string, number | null, number | null]> : [];

  return (
    <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <button onClick={() => setLocation("/stores")} className="text-[13.5px] font-semibold text-black/50 mb-5 hover:text-black/70">
          ← {t.back}
        </button>

        {isLoading && <div className="h-40 bg-black/[0.04] rounded-2xl animate-pulse" />}
        {!isLoading && !s && <p className="text-center text-black/45 py-16 text-[14px]">{t.notFound}</p>}

        {s && (
          <>
            <header className="mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[26px] font-bold tracking-tight">{s.name}</h1>
                <span className={`px-2 py-1 rounded-full text-[11px] font-bold leading-none ${s.claimed ? "bg-brand/10 text-brand" : "bg-black/[0.05] text-black/45"}`}>
                  {s.claimed ? t.verified : t.unverified}
                </span>
              </div>
              <p className="text-[14px] text-brand font-semibold mt-1">{s.region}</p>
            </header>

            <div className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] space-y-3 mb-4">
              <div>
                <p className="text-[11.5px] font-bold text-black/40">{t.address}</p>
                <p className="text-[14.5px] font-medium mt-0.5">{s.address}</p>
              </div>
              {s.phone && (
                <div>
                  <p className="text-[11.5px] font-bold text-black/40">{t.phone}</p>
                  <a href={`tel:${s.phone}`} className="text-[14.5px] font-semibold text-brand mt-0.5 inline-block">{s.phone}</a>
                </div>
              )}
              {s.openHours && (
                <div>
                  <p className="text-[11.5px] font-bold text-black/40">{t.hours}</p>
                  <p className="text-[14.5px] font-medium mt-0.5 tabular-nums">{s.openHours}</p>
                </div>
              )}
              {tableRows.length > 0 && (
                <div>
                  <p className="text-[11.5px] font-bold text-black/40">{t.tables}</p>
                  <div className="flex gap-2 mt-1.5">
                    {tableRows.map(([label, n]) => (
                      <span key={label} className="px-2.5 py-1.5 rounded-xl bg-black/[0.04] text-[13px] font-semibold tabular-nums">{label} {n}</span>
                    ))}
                  </div>
                </div>
              )}
              {rateRows.length > 0 && (
                <div>
                  <p className="text-[11.5px] font-bold text-black/40">{t.rates}</p>
                  <div className="mt-1.5 space-y-1">
                    {rateRows.map(([label, rate, flat]) => (
                      <div key={label} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-black/[0.03] text-[13px]">
                        <span className="font-semibold">{label}</span>
                        <span className="tabular-nums text-black/70">
                          {rate != null && <>{t.per10} <b className="text-ink-1">{won(rate)}</b></>}
                          {rate != null && flat != null && <span className="mx-1.5 text-black/25">·</span>}
                          {flat != null && <>{t.flat} <b className="text-ink-1">{won(flat)}</b></>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 활동 크루 — 매장 페이지를 살아있는 프로필로 만드는 섹션 */}
            {(s.crews?.length ?? 0) > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
                <p className="text-[11.5px] font-bold text-black/40 mb-2.5">{t.crewsTitle}</p>
                <div className="space-y-2">
                  {s.crews!.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setLocation(`/club/${c.id}`)}
                      className="w-full flex items-center gap-3 py-2 px-2.5 rounded-xl bg-black/[0.03] text-left active:scale-[0.99] transition-transform"
                    >
                      <span className="text-[20px] leading-none shrink-0">{c.emblem || "🎱"}</span>
                      <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{c.name}</span>
                      <span className="shrink-0 text-[12px] font-medium text-black/45 tabular-nums">{c.memberCount}{t.crewMembers}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 소개 — 인증 전엔 비워둔다 (수집 원문 미전재 원칙) */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
              {s.claimed && s.description
                ? <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{s.description}</p>
                : <p className="text-[13px] text-black/40">{t.descEmpty}</p>}
            </div>

            <button
              onClick={() => setClaimOpen(true)}
              className="w-full h-13 py-3.5 rounded-2xl bg-brand text-white text-[15px] font-bold active:scale-[0.99] transition-transform mb-2"
            >
              {t.claimCta}
            </button>
            <button
              onClick={() => setSuggestOpen(true)}
              className="w-full py-3 rounded-2xl text-[13.5px] font-semibold text-black/50 hover:bg-black/[0.03]"
            >
              {t.suggestCta}
            </button>
          </>
        )}

        {/* 클레임 신청 */}
        <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
          <DialogContent className="bg-white text-ink-1 max-w-md w-[92%] rounded-[28px] p-6">
            <DialogTitle className="text-[19px] font-bold">{t.claimTitle}</DialogTitle>
            <DialogDescription className="text-[12.5px] font-medium text-black/55">{t.claimDesc}</DialogDescription>
            <div className="flex flex-col gap-2.5 mt-2">
              <input value={cName} onChange={e => setCName(e.target.value)} maxLength={30} placeholder={t.claimName}
                className="h-12 px-4 rounded-2xl bg-black/[0.03] text-[14.5px] font-medium outline-none focus:bg-black/[0.05]" />
              <input value={cPhone} onChange={e => setCPhone(e.target.value)} maxLength={20} placeholder={t.claimPhone} inputMode="tel"
                className="h-12 px-4 rounded-2xl bg-black/[0.03] text-[14.5px] font-medium outline-none focus:bg-black/[0.05]" />
              <textarea value={cMsg} onChange={e => setCMsg(e.target.value)} maxLength={500} rows={3} placeholder={t.claimMsg}
                className="px-4 py-3 rounded-2xl bg-black/[0.03] text-[14.5px] font-medium outline-none focus:bg-black/[0.05] resize-none" />
              <button
                disabled={!cName.trim() || !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(cPhone.replace(/\s/g, "")) || claimMutation.isPending}
                onClick={() => claimMutation.mutate()}
                className="h-12 rounded-full bg-brand text-white text-[15px] font-bold disabled:opacity-40"
              >
                {t.claimSubmit}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 수정 제안 */}
        <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
          <DialogContent className="bg-white text-ink-1 max-w-md w-[92%] rounded-[28px] p-6">
            <DialogTitle className="text-[19px] font-bold">{t.suggestTitle}</DialogTitle>
            <DialogDescription className="text-[12.5px] font-medium text-black/55">{t.suggestDesc}</DialogDescription>
            <div className="flex flex-col gap-2.5 mt-2">
              <textarea value={sMsg} onChange={e => setSMsg(e.target.value)} maxLength={500} rows={3} placeholder={t.suggestMsg}
                className="px-4 py-3 rounded-2xl bg-black/[0.03] text-[14.5px] font-medium outline-none focus:bg-black/[0.05] resize-none" />
              <input value={sContact} onChange={e => setSContact(e.target.value)} maxLength={50} placeholder={t.suggestContact}
                className="h-12 px-4 rounded-2xl bg-black/[0.03] text-[14.5px] font-medium outline-none focus:bg-black/[0.05]" />
              <button
                disabled={sMsg.trim().length < 5 || suggestMutation.isPending}
                onClick={() => suggestMutation.mutate()}
                className="h-12 rounded-full bg-brand text-white text-[15px] font-bold disabled:opacity-40"
              >
                {t.suggestSubmit}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
