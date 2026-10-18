/**
 * 정상 인증(2026-10-13) — 산 화면에서 '정상 인증'을 누르면 지금 위치가 그 산의 정상 가까이인지 서버가 확인하고 도장을 찍는다.
 *
 * **좌표는 저장되지 않는다.** 화면이 위치를 한 번 보내면 서버가 정상까지의 거리를 재고 인증 여부와 거친 거리 구간만 남긴다
 * (골프의 현장 인증과 같은 원칙 — shared/hikingStamps.judgeSummit · server/routes/modules/hiking).
 * 인증이 안 되면 까닭을 한 줄로 알려 준다(정상이 가깝다 · 위치가 흐리다 …). 인증 없이 '다녀왔어요'로 적어 둘 수도 있다 — 흐린 도장이 된다.
 *
 * 등산을 쓸 수 있는 회원에게만 그린다(부르는 쪽이 가른다). ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getDevicePosition } from "@/hooks/useNativeBridge";
import { hikingGradeById } from "@shared/hikingGrade";
import { HIKING_SEASON_NAME, hikingPin, type MountainStamp } from "@shared/hikingStamps";
import { stampDate } from "../lib/date";
import { GradeArt } from "./GradeParts";
import { MountainPatch } from "./MountainPatch";
import { PatchArt, PinArt } from "./StampParts";
import { MY_STAMPS_KEY, type MyAward } from "./useHikingStamps";

interface CheckinResult { verified: boolean; reason: string; hint: string | null; added: boolean; awards: MyAward[] }

export function SummitCheckin({ mountainId, name, stamp, hasSummit, region, patch }: {
    mountainId: string; name: string; stamp?: MountainStamp; hasSummit: boolean;
    region?: string | null;
    /** 이 산에 산 와펜이 있는가(산림청 100대 명산) — 인증한 순간 같이 보여 준다 */
    patch?: boolean;
}) {
    const qc = useQueryClient();
    const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
    const [fresh, setFresh] = useState<MyAward[]>([]);
    // 방금 이 화면에서 새 도장을 찍었는가 — 받은 것을 그림으로 늘어놓는다
    const [justNow, setJustNow] = useState(false);

    const checkin = useMutation({
        mutationFn: async (): Promise<CheckinResult | { denied: true }> => {
            const pos = await getDevicePosition({ prompt: true, highAccuracy: true, timeoutMs: 15000, maximumAgeMs: 0 });
            if (pos.status !== "granted") return { denied: true };
            return apiRequest("/api/hiq/hiking/summits", { method: "POST", body: JSON.stringify({ mountainId, lat: pos.fix.lat, lng: pos.fix.lng, accuracy: pos.fix.accuracy }) });
        },
        onSuccess: (r) => {
            if ("denied" in r) { setMsg({ tone: "warn", text: "위치를 쓸 수 없어요. 설정에서 위치를 허용한 뒤 다시 눌러 주세요." }); return; }
            if (!r.verified) { setMsg({ tone: "warn", text: r.hint ?? "정상 가까이에서 다시 눌러 주세요." }); return; }
            setMsg({ tone: "ok", text: r.added ? `${name} 정상 도장이 찍혔어요.` : "오늘은 이미 인증했어요." });
            setFresh(r.awards ?? []);
            setJustNow(r.added);
            qc.invalidateQueries({ queryKey: MY_STAMPS_KEY });
        },
        onError: () => setMsg({ tone: "warn", text: "지금은 인증하지 못했어요. 통신이 되는 곳에서 다시 눌러 주세요." }),
    });
    const record = useMutation({
        mutationFn: (): Promise<{ added: boolean }> => apiRequest("/api/hiq/hiking/summits/record", { method: "POST", body: JSON.stringify({ mountainId }) }),
        onSuccess: (r) => { setMsg({ tone: "ok", text: r.added ? "기록해 두었어요. 정상에서 인증하면 또렷한 도장으로 바뀌어요." : "오늘은 이미 적었어요." }); qc.invalidateQueries({ queryKey: MY_STAMPS_KEY }); },
        onError: () => setMsg({ tone: "warn", text: "지금은 적지 못했어요." }),
    });

    const done = !!stamp?.verified;
    return (
        <div className="mt-3 border-t border-[#0E2A331A] pt-3" data-testid="summit-checkin" data-done={done ? "1" : "0"}>
            {done && (
                <p className="mb-2 text-[13px] text-[#8A5E00]" data-testid="summit-mine">
                    {stampDate(new Date(stamp!.firstAt))}에 올랐어요 · {stamp!.seasons.map((k) => HIKING_SEASON_NAME[k]).join(" · ")}{stamp!.count > 1 ? ` · ${stamp!.count}번` : ""}
                </p>
            )}
            <div className="flex gap-2">
                <button type="button" disabled={checkin.isPending || !hasSummit} onClick={() => { setMsg(null); checkin.mutate(); }} data-track-as="hiking-summit-checkin" data-testid="summit-checkin-btn"
                    className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#0E2A33] text-[15px] font-semibold text-[#F4EFE3] active:bg-[#16404D] disabled:opacity-50">
                    {checkin.isPending ? "위치를 확인하는 중…" : done ? "다시 올랐어요 — 정상 인증" : "정상 인증"}
                </button>
                {!done && !stamp && (
                    <button type="button" disabled={record.isPending} onClick={() => { setMsg(null); record.mutate(); }} data-track-as="hiking-summit-record" data-testid="summit-record-btn"
                        className="h-12 shrink-0 rounded-xl bg-[#0E2A3314] px-3.5 text-[14px] text-[#0E2A33] active:bg-[#0E2A3324] disabled:opacity-50">
                        다녀왔어요
                    </button>
                )}
            </div>
            {!hasSummit && <p className="mt-2 text-[12.5px] text-[#0E2A33B3] break-keep">이 산은 정상의 자리를 아직 몰라 인증할 수 없어요.</p>}
            {msg && <p className="mt-2 text-[13.5px] leading-snug break-keep" style={{ color: msg.tone === "ok" ? "#2F6A0C" : "#A14A1E" }} role="status" data-testid="summit-msg">{msg.text}</p>}
            {/* 방금 받은 것 — 산 와펜 · 오른 등급 · 핀 · 다 채운 도장첩의 와펜 */}
            {justNow && (fresh.length > 0 || patch) && (
                <div className="mt-3 rounded-2xl bg-[#0E2A33] px-2 py-3.5 text-[#F4EFE3]" data-testid="summit-fresh">
                    <p className="text-center text-[13px] text-[#F6D9A8]">새로 받았어요</p>
                    <ul className="mt-2.5 flex flex-wrap items-end justify-center gap-x-3 gap-y-3">
                        {patch && (
                            <li className="flex w-[64px] flex-col items-center text-center">
                                <MountainPatch id={mountainId} region={region} size={50} earned />
                                <span className="mt-1.5 text-[12px] leading-tight break-keep">{name} 와펜</span>
                            </li>
                        )}
                        {fresh.map((a) => {
                            const grade = a.kind === "grade" ? hikingGradeById(a.key) : undefined;
                            const label = grade ? `등급 ${grade.name}` : a.kind === "pin" ? `${hikingPin(a.key)?.name ?? ""} 핀` : "도장첩 와펜";
                            return (
                                <li key={a.id} className="flex w-[64px] flex-col items-center text-center" data-fresh={a.id}>
                                    {grade ? <GradeArt id={grade.id} size={52} /> : a.kind === "pin" ? <PinArt art={hikingPin(a.key)?.art ?? "pin-boot"} size={50} earned /> : <PatchArt art={a.key} size={52} earned />}
                                    <span className="mt-1.5 text-[12px] leading-tight break-keep">{label}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            <p className="mt-2 text-[12px] leading-snug text-[#0E2A33A6] break-keep">위치는 정상까지의 거리를 재는 데만 쓰고 저장하지 않아요.</p>
        </div>
    );
}
