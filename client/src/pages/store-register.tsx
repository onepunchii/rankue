import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { LucideCheckCircle } from "@/lib/icons";

// 신규 매장 등록 신청 — 디렉토리(1,195곳)에 없는 매장의 사장님용.
// 제출은 승인 대기열(store_registrations)로 가고, 어드민 승인 시 매장 페이지 생성 +
// 사장님 계정·파트너 매장까지 한 번에 발급된다(admin.ts issueOwnership).
//
// 예전 흐름의 문제: "목록에 내 매장이 없나요?" 폴백이 연락처만 남기고 끝이라
// 신청해도 아무 일도 일어나지 않았다(리드 3건 방치 전력). 이 폼이 그 자리를 대체한다.

const REGIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

// 주소 첫 토큰 → 시/도 자동 추측 ("서울특별시 광진구..." → 서울)
const REGION_GUESS: Record<string, string> = {
  "서울": "서울", "서울특별시": "서울", "경기": "경기", "경기도": "경기", "인천": "인천", "인천광역시": "인천",
  "부산": "부산", "부산광역시": "부산", "대구": "대구", "대구광역시": "대구", "광주": "광주", "광주광역시": "광주",
  "대전": "대전", "대전광역시": "대전", "울산": "울산", "울산광역시": "울산", "세종": "세종", "세종특별자치시": "세종",
  "강원": "강원", "강원도": "강원", "강원특별자치도": "강원", "충북": "충북", "충청북도": "충북",
  "충남": "충남", "충청남도": "충남", "전북": "전북", "전라북도": "전북", "전북특별자치도": "전북",
  "전남": "전남", "전라남도": "전남", "경북": "경북", "경상북도": "경북", "경남": "경남", "경상남도": "경남",
  "제주": "제주", "제주특별자치도": "제주", "제주도": "제주",
};

const L: Record<Locale, Record<string, string>> = {
  ko: {
    back: "매장 찾기", title: "내 매장 등록", subtitle: "전국 당구장 목록에 없는 매장을 등록해요",
    secStore: "매장 정보", name: "매장 이름", namePh: "예: 구의 챔피언 당구클럽",
    region: "지역 (시/도)", regionPh: "선택",
    address: "주소", addressPh: "예: 서울 광진구 구의동 12-3 2층",
    phone: "매장 전화 (선택)", phonePh: "예: 02-123-4567",
    hours: "영업시간 (선택)", hoursPh: "예: 10:00 ~ 02:00",
    secTables: "테이블 (선택)", large: "대대", medium: "중대", pocket: "포켓",
    secRates: "요금 (선택)", per10: "10분당", flat: "정액", won: "원",
    secApplicant: "신청자 정보", applicantName: "성함", applicantPhone: "연락처",
    applicantPhonePh: "예: 010-1234-5678",
    notice: "확인 후 등록해 드려요. 승인되면 매장 페이지가 열리고, 영업시간·요금·소개를 직접 관리할 수 있는 사장님 권한이 함께 발급됩니다.",
    kindOwner: "사장님입니다", kindReport: "이용자 제보입니다",
    noticeReport: "확인 후 매장 찾기 목록에 올려 드려요. 제보는 사장님 권한이 발급되지 않고, 나중에 사장님이 직접 \"사장님이신가요?\"로 가져갈 수 있어요.",
    doneDescReport: "확인 후 매장 찾기에 올려 드릴게요. 제보 감사합니다!",
    submit: "등록 신청하기", submitting: "접수 중...",
    doneTitle: "신청이 접수되었습니다",
    doneDesc: "확인 후 등록해 드릴게요. 랭큐 회원이시면 승인 즉시 앱 알림으로 알려드리고, 전체 메뉴 → 내 매장 관리에서 바로 시작할 수 있습니다.",
    doneBtn: "매장 찾기로 돌아가기",
  },
  en: {
    back: "Find a venue", title: "Register my venue", subtitle: "Add a billiard hall that's not in our directory",
    secStore: "Venue info", name: "Venue name", namePh: "e.g. Champion Billiards",
    region: "Region", regionPh: "Select",
    address: "Address", addressPh: "Street address",
    phone: "Phone (optional)", phonePh: "e.g. 02-123-4567",
    hours: "Hours (optional)", hoursPh: "e.g. 10:00 ~ 02:00",
    secTables: "Tables (optional)", large: "Large", medium: "Medium", pocket: "Pocket",
    secRates: "Rates (optional)", per10: "per 10 min", flat: "Flat", won: "₩",
    secApplicant: "Applicant", applicantName: "Name", applicantPhone: "Contact number",
    applicantPhonePh: "e.g. 010-1234-5678",
    notice: "We'll review and publish your venue. Once approved, you get an owner account to manage hours, rates and the intro yourself.",
    kindOwner: "I'm the owner", kindReport: "I'm a customer (report)",
    noticeReport: "We'll review and add the venue to the directory. Reports don't create an owner account; the owner can claim it later.",
    doneDescReport: "We'll review and list it. Thanks for the report!",
    submit: "Submit", submitting: "Submitting...",
    doneTitle: "Request received",
    doneDesc: "We'll review and publish it. RANKUE members get an in-app notification the moment it's approved.",
    doneBtn: "Back to venues",
  },
  vi: {
    back: "Tìm quán", title: "Đăng ký quán của tôi", subtitle: "Thêm quán bi-a chưa có trong danh mục",
    secStore: "Thông tin quán", name: "Tên quán", namePh: "VD: Champion Billiards",
    region: "Khu vực", regionPh: "Chọn",
    address: "Địa chỉ", addressPh: "Địa chỉ quán",
    phone: "Điện thoại (tùy chọn)", phonePh: "VD: 02-123-4567",
    hours: "Giờ mở cửa (tùy chọn)", hoursPh: "VD: 10:00 ~ 02:00",
    secTables: "Bàn (tùy chọn)", large: "Lớn", medium: "Vừa", pocket: "Pocket",
    secRates: "Giá (tùy chọn)", per10: "mỗi 10 phút", flat: "Trọn gói", won: "₩",
    secApplicant: "Người đăng ký", applicantName: "Họ tên", applicantPhone: "Số liên lạc",
    applicantPhonePh: "VD: 010-1234-5678",
    notice: "Chúng tôi sẽ duyệt và đăng quán của bạn. Sau khi duyệt, bạn nhận tài khoản chủ quán để tự quản lý thông tin.",
    kindOwner: "Tôi là chủ quán", kindReport: "Tôi là khách (báo tin)",
    noticeReport: "Chúng tôi sẽ xem xét và thêm quán vào danh mục. Báo tin không tạo tài khoản chủ quán; chủ quán có thể nhận sau.",
    doneDescReport: "Chúng tôi sẽ xem xét và đăng. Cảm ơn bạn đã báo!",
    submit: "Gửi đăng ký", submitting: "Đang gửi...",
    doneTitle: "Đã nhận yêu cầu",
    doneDesc: "Chúng tôi sẽ duyệt và đăng quán. Thành viên RANKUE sẽ nhận thông báo ngay khi được duyệt.",
    doneBtn: "Về trang tìm quán",
  },
  tr: {
    back: "Salon bul", title: "Salonumu kaydet", subtitle: "Listede olmayan bilardo salonunu ekleyin",
    secStore: "Salon bilgisi", name: "Salon adı", namePh: "örn. Champion Bilardo",
    region: "Bölge", regionPh: "Seçin",
    address: "Adres", addressPh: "Salon adresi",
    phone: "Telefon (isteğe bağlı)", phonePh: "örn. 02-123-4567",
    hours: "Çalışma saatleri (isteğe bağlı)", hoursPh: "örn. 10:00 ~ 02:00",
    secTables: "Masalar (isteğe bağlı)", large: "Büyük", medium: "Orta", pocket: "Pocket",
    secRates: "Ücretler (isteğe bağlı)", per10: "10 dk başına", flat: "Sabit", won: "₩",
    secApplicant: "Başvuran", applicantName: "Ad", applicantPhone: "İletişim numarası",
    applicantPhonePh: "örn. 010-1234-5678",
    notice: "İnceleyip yayınlayacağız. Onaylanınca bilgileri kendiniz yönetebileceğiniz sahip hesabı verilir.",
    kindOwner: "Sahibiyim", kindReport: "Müşteriyim (bildirim)",
    noticeReport: "İnceleyip mekânı rehbere ekleyeceğiz. Bildirimler sahip hesabı oluşturmaz; sahibi daha sonra talep edebilir.",
    doneDescReport: "İnceleyip listeleyeceğiz. Bildirim için teşekkürler!",
    submit: "Başvur", submitting: "Gönderiliyor...",
    doneTitle: "Başvuru alındı",
    doneDesc: "İnceleyip yayınlayacağız. RANKUE üyeleri onaylanır onaylanmaz bildirim alır.",
    doneBtn: "Salon aramaya dön",
  },
  es: {
    back: "Buscar local", title: "Registrar mi local", subtitle: "Añade un billar que no esté en el directorio",
    secStore: "Datos del local", name: "Nombre", namePh: "ej. Champion Billar",
    region: "Región", regionPh: "Elegir",
    address: "Dirección", addressPh: "Dirección del local",
    phone: "Teléfono (opcional)", phonePh: "ej. 02-123-4567",
    hours: "Horario (opcional)", hoursPh: "ej. 10:00 ~ 02:00",
    secTables: "Mesas (opcional)", large: "Grande", medium: "Mediana", pocket: "Pocket",
    secRates: "Tarifas (opcional)", per10: "por 10 min", flat: "Plana", won: "₩",
    secApplicant: "Solicitante", applicantName: "Nombre", applicantPhone: "Contacto",
    applicantPhonePh: "ej. 010-1234-5678",
    notice: "Revisaremos y publicaremos tu local. Al aprobarse recibirás una cuenta de propietario para gestionarlo.",
    kindOwner: "Soy el dueño", kindReport: "Soy cliente (aviso)",
    noticeReport: "Revisaremos y añadiremos el local al directorio. Los avisos no crean cuenta de dueño; el dueño podrá reclamarlo después.",
    doneDescReport: "Lo revisaremos y lo publicaremos. ¡Gracias por el aviso!",
    submit: "Enviar", submitting: "Enviando...",
    doneTitle: "Solicitud recibida",
    doneDesc: "La revisaremos y publicaremos. Los miembros de RANKUE reciben una notificación al aprobarse.",
    doneBtn: "Volver a locales",
  },
};

const inputCls = "w-full h-11 px-3.5 rounded-tile bg-black/[0.03] border border-black/[0.09] focus:border-brand focus:bg-white text-[14.5px] font-medium text-ink-1 placeholder:text-black/35 outline-none transition-colors";
const labelCls = "text-[12px] font-bold text-black/45 mb-1.5 block";

export default function StoreRegister() {
  const [, setLocation] = useLocation();
  const { locale } = useT();
  const t = L[locale] ?? L.ko;
  const { toast } = useToast();
  const { member } = useAuth();

  const [form, setForm] = useState<Record<string, string>>({
    name: "", region: "", address: "", phone: "", openHours: "",
    tableLarge: "", tableMedium: "", tablePocket: "",
    rate10Large: "", rate10Medium: "", rate10Pocket: "",
    flatLarge: "", flatMedium: "", flatPocket: "",
    applicantName: "", applicantPhone: "",
  });
  const [done, setDone] = useState(false);
  // 사장님 신청 / 이용자 제보. 유저 건의(2026-09-03): 사장님이 아닌데 검색에 없는 당구장을
  // 올리고 싶다. 제보는 승인 시 디렉토리에만 추가되고 권한·PIN 은 발급되지 않는다.
  const [kind, setKind] = useState<"owner" | "report">("owner");
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // 로그인 회원이면 신청자 정보 자동 채움 — 소셜 가입자의 placeholder 전화는 제외
  const prefillName = form.applicantName || member?.name || "";
  const memberPhone = member?.phone && !member.phone.startsWith("social:") ? member.phone : "";
  const prefillPhone = form.applicantPhone || memberPhone;

  // 주소를 치면 시/도를 자동 추측 (선택 전일 때만)
  const onAddress = (v: string) => {
    set("address", v);
    if (!form.region) {
      const guess = REGION_GUESS[v.trim().split(/\s+/)[0] ?? ""];
      if (guess) set("region", guess);
    }
  };

  useSeo({
    title: locale === "ko" ? "내 매장 등록 | 랭큐" : "Register my venue | RANKUE",
    description: locale === "ko" ? "전국 당구장 디렉토리에 내 매장을 등록하세요." : "Add your billiard hall to the RANKUE directory.",
    path: "/stores/register",
    locale,
  });

  const submit = useMutation({
    mutationFn: async () => apiRequest("/api/hiq/listings/register", {
      method: "POST",
      body: {
        ...form,
        kind,
        applicantName: prefillName,
        applicantPhone: prefillPhone,
      },
    }),
    onSuccess: () => setDone(true),
    onError: (e: any) => toast({ title: e?.message || "오류가 발생했습니다", variant: "destructive" }),
  });

  const canSubmit = form.name.trim().length >= 2 && form.region && form.address.trim().length >= 5
    && prefillName.trim() && prefillPhone.trim().length >= 10 && !submit.isPending;

  if (done) {
    return (
      <div className="min-h-screen w-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans flex items-center justify-center px-5">
        <div className="w-full max-w-md rk-card p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-brand/[0.08] flex items-center justify-center mb-4">
            <LucideCheckCircle className="w-7 h-7 text-brand" />
          </div>
          <h1 className="text-[20px] font-bold">{t.doneTitle}</h1>
          <p className="text-[13.5px] text-black/50 mt-2 leading-relaxed">{kind === "report" ? t.doneDescReport : t.doneDesc}</p>
          <button
            onClick={() => setLocation("/stores")}
            className="w-full mt-6 h-[50px] rounded-tile bg-brand text-white text-[15px] font-bold active:scale-[0.98] transition-transform"
          >
            {t.doneBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-10 pb-16">
        <button onClick={() => setLocation("/stores")} className="text-[13.5px] font-semibold text-black/50 mb-4 hover:text-black/70">
          ← {t.back}
        </button>
        <header className="mb-6">
          <h1 className="text-[26px] font-bold tracking-tight">{t.title}</h1>
          <p className="text-[13.5px] text-black/50 mt-1">{t.subtitle}</p>
        </header>

        {/* 매장 정보 */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
          <h2 className="text-[13px] font-bold text-brand mb-4">{t.secStore}</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>{t.name} <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.name} maxLength={60} placeholder={t.namePh}
                onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <div>
                <label className={labelCls}>{t.region} <span className="text-red-500">*</span></label>
                <select className={inputCls} value={form.region} onChange={(e) => set("region", e.target.value)}>
                  <option value="">{t.regionPh}</option>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t.address} <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.address} maxLength={120} placeholder={t.addressPh}
                  onChange={(e) => onAddress(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t.phone}</label>
                <input className={inputCls} value={form.phone} maxLength={20} placeholder={t.phonePh} inputMode="tel"
                  onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t.hours}</label>
                <input className={inputCls} value={form.openHours} maxLength={40} placeholder={t.hoursPh}
                  onChange={(e) => set("openHours", e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {/* 테이블 */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
          <h2 className="text-[13px] font-bold text-brand mb-4">{t.secTables}</h2>
          <div className="grid grid-cols-3 gap-3">
            {([["tableLarge", t.large], ["tableMedium", t.medium], ["tablePocket", t.pocket]] as const).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input className={`${inputCls} text-center tabular-nums`} value={form[k]} inputMode="numeric" maxLength={2}
                  onChange={(e) => set(k, e.target.value.replace(/\D/g, ""))} />
              </div>
            ))}
          </div>
        </section>

        {/* 요금 — 종류별 10분당/정액. 열을 나눠 비교 가능하게(매장 상세 요금표와 같은 구조) */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
          <h2 className="text-[13px] font-bold text-brand mb-4">{t.secRates}</h2>
          <div className="grid grid-cols-[56px_1fr_1fr] gap-x-3 gap-y-2.5 items-center">
            <span />
            <span className="text-[11.5px] font-bold text-black/40 text-center">{t.per10} ({t.won})</span>
            <span className="text-[11.5px] font-bold text-black/40 text-center">{t.flat} ({t.won})</span>
            {([["Large", t.large], ["Medium", t.medium], ["Pocket", t.pocket]] as const).map(([k, label]) => (
              <div key={k} className="contents">
                <span className="text-[13.5px] font-semibold">{label}</span>
                <input className={`${inputCls} text-center tabular-nums`} value={form[`rate10${k}`]} inputMode="numeric" maxLength={7}
                  onChange={(e) => set(`rate10${k}`, e.target.value.replace(/\D/g, ""))} />
                <input className={`${inputCls} text-center tabular-nums`} value={form[`flat${k}`]} inputMode="numeric" maxLength={7}
                  onChange={(e) => set(`flat${k}`, e.target.value.replace(/\D/g, ""))} />
              </div>
            ))}
          </div>
        </section>

        {/* 신청자 — 사장님인지 이용자 제보인지 먼저 고른다 */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
          <h2 className="text-[13px] font-bold text-brand mb-4">{t.secApplicant}</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(["owner", "report"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`h-11 rounded-xl border text-[13px] font-semibold transition-colors ${kind === k ? "border-brand bg-brand/[0.06] text-[rgba(0,0,0,0.87)]" : "border-black/10 text-black/50"}`}>
                {k === "owner" ? t.kindOwner : t.kindReport}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t.applicantName} <span className="text-red-500">*</span></label>
              <input className={inputCls} value={prefillName} maxLength={30}
                onChange={(e) => set("applicantName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t.applicantPhone} <span className="text-red-500">*</span></label>
              <input className={inputCls} value={prefillPhone} maxLength={20} placeholder={t.applicantPhonePh} inputMode="tel"
                onChange={(e) => set("applicantPhone", e.target.value)} />
            </div>
          </div>
        </section>

        <p className="text-[12px] text-black/45 leading-relaxed px-1 mb-5">{kind === "report" ? t.noticeReport : t.notice}</p>

        <button
          disabled={!canSubmit}
          onClick={() => submit.mutate()}
          className="w-full h-[54px] rounded-tile bg-brand text-white text-[16px] font-bold active:scale-[0.98] transition-transform disabled:bg-black/[0.05] disabled:text-black/30"
        >
          {submit.isPending ? t.submitting : t.submit}
        </button>
      </div>
    </div>
  );
}
