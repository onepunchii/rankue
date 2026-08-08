// PBA 투어 데이터 수집 — pbatour.org 가 노출하는 비인증 JSON AJAX API 사용.
// (robots.txt 차단 없음, 2026-08-07 실측. 사실 정보(순위·상금·전적)만 수집하고
//  선수 사진·로고는 초상권/저작권 문제로 수집하지 않는다.)
//
// 실측한 응답 형태:
// - 랭킹: /ko/stats/ranking_prize/ajax/list?leagueCode=PBA1&pbaType=PBA&league=1&season=2025&tourCode=0
//   → { list: [{ Rank, PrizeRank, RankingPoint, RankingPointRank, Prize, MemCode,
//                PlayerNameKO, PlayerNameEN, NationCode, Gender, tcnt }] }
// - 선수: /ko/player/search/ajax/detail?memCode=M0022424
//   → { resultCode: "000", data: { Average, BankShotRate, HR, Win, Lose, Draw,
//        BirthDay, Prize(통산), LeagueCode, PlayerNameKO/EN, NationCode } }
//   (통산 기준 검증: 김가영 Prize 9.72억 — 시즌 상금 합산과 부합)

const ORIGIN = "https://www.pbatour.org";
const UA = "Mozilla/5.0 (compatible; RankueBot/1.0; +https://www.rankue.co.kr)";

// pbatour.org 는 TLS 핸드셰이크에서 리프 인증서만 보내고 중간 CA 를 누락한다(서버 설정 오류).
// 브라우저·curl 은 AIA 추적으로 통과하지만 Node fetch 는 UNABLE_TO_VERIFY_LEAF_SIGNATURE 로 실패.
// 검증을 끄는 대신(금지) GlobalSign 공개 인증서 체인을 고정해 undici Agent 로 검증한다.
// 출처: http://secure.globalsign.com/cacert/{gsgccr6alphasslca2025,root-r6}.crt (공개 배포 인증서)
// ⚠️ 중간 CA "AlphaSSL CA 2025" 는 2027-05-21 만료. pbatour 가 리프를 다른 중간 CA 로
//    재발급하면 여기 검증이 실패해 동기화가 멈춘다(fail-closed, 기존 데이터는 보존됨).
//    그때는 위 출처에서 새 중간 CA 를 받아 이 체인을 갱신할 것.
const GLOBALSIGN_CHAIN = `-----BEGIN CERTIFICATE-----
MIIFjTCCA3WgAwIBAgIRAIN9TriekS/nLK07x2kt3CAwDQYJKoZIhvcNAQELBQAw
TDEgMB4GA1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjYxEzARBgNVBAoTCkds
b2JhbFNpZ24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMjUwNTIxMDIzNjUyWhcN
MjcwNTIxMDAwMDAwWjBVMQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2ln
biBudi1zYTErMCkGA1UEAxMiR2xvYmFsU2lnbiBHQ0MgUjYgQWxwaGFTU0wgQ0Eg
MjAyNTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJ/oiu0Bviq52UUE
ADbFWmgu3rC7KDSMoorLN1Wd03McG3Z1aP71DlPCE33838r72Dfuj5M9LXfiQLJp
Au6MwNExmKOzothw4x0zGf5oBYyrCMGm3fBpLPafwYQ3MchBOWMTbf83rKUPLH48
KCJ0MnU8GUl8oA/J81wIvbbKPuNrFf6hvJDccjzc4NyxLz3A89zjV2g5whCg5O0u
9YX4Zxk9JHuc/LvllOJO4waAYLjbWBJkz3rV3ts1SmSYnJqmyRTIjXwQgRvhEYqt
DbRskt0W7M6cPwCze3GTBN2UHNpHkMs3YmVxku68I0aOQn5+uz//fDROP3z1Z/7I
APteRtECAwEAAaOCAV8wggFbMA4GA1UdDwEB/wQEAwIBhjAdBgNVHSUEFjAUBggr
BgEFBQcDAQYIKwYBBQUHAwIwEgYDVR0TAQH/BAgwBgEB/wIBADAdBgNVHQ4EFgQU
xbSTj28r3B5Iv7cQMIXO0bK7SC0wHwYDVR0jBBgwFoAUrmwFo5MT4qLn4tcc1sfw
f8hnU6AwewYIKwYBBQUHAQEEbzBtMC4GCCsGAQUFBzABhiJodHRwOi8vb2NzcDIu
Z2xvYmFsc2lnbi5jb20vcm9vdHI2MDsGCCsGAQUFBzAChi9odHRwOi8vc2VjdXJl
Lmdsb2JhbHNpZ24uY29tL2NhY2VydC9yb290LXI2LmNydDA2BgNVHR8ELzAtMCug
KaAnhiVodHRwOi8vY3JsLmdsb2JhbHNpZ24uY29tL3Jvb3QtcjYuY3JsMCEGA1Ud
IAQaMBgwCAYGZ4EMAQIBMAwGCisGAQQBoDIKAQMwDQYJKoZIhvcNAQELBQADggIB
AB/uvBuZf4CiuSahwiXn4geF52roAH+6jxsEPTXTfb7bbeMDXsYgRRsOTNA70ruZ
Tnz5DfFMuBhNoFhIFb0qR1izdy6VkdKOqFPNF2dOFI1EcnY9l2ory9mrzHqVbrL4
vzUd17FLUVyjTVU7PAv4nxyhnO1GTeT83YlrdRF31NyR6bvZVTEERHmpbWSgeveJ
LRtaMzlGWiLZ8IwkH7o6GH3jp/KPtDW4Npu8w64HrRZdN2pqQhi7+YKwfHM7H+2U
dM1BGN0sjOWMVbMSB9MtCsleS2Mb7TRZEbOHxECJLLIluQypZr7Pol3+hAqrhyKI
k+6y+Da0NeDuWxW59Ku4NvClqW1UFX1SpfNGhzVfp/CH+vPM1tySomx2jE0EnYZu
GwVucXPBsp5nUWqUV9+143glVuS7GTg9hFPjNBInn17HbCoIIQIOzj5Vd9bK3A9U
GxXNpwenDHEalCsD/4eQYDHPhFE7sNe0D/OXu+FAM02VZkARx37Jp4bDdujvgL9P
vZPR3wThvDN1CTU8Bc3xea3yKFAraKcPZLkhReQUAm2VpR+HSJRPlUpYizlF9WkL
h3KcAVCBJWvnOkVwxyU5QJMcnwW95JlOtx+9100GL99jHE5rs3gXp7F4bg8H01QT
9jVOhBBmQ7nQoXuwI0tqal2QUqZz3eeu62CU7xBwtfYR
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFgzCCA2ugAwIBAgIORea7A4Mzw4VlSOb/RVEwDQYJKoZIhvcNAQEMBQAwTDEg
MB4GA1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjYxEzARBgNVBAoTCkdsb2Jh
bFNpZ24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMTQxMjEwMDAwMDAwWhcNMzQx
MjEwMDAwMDAwWjBMMSAwHgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSNjET
MBEGA1UEChMKR2xvYmFsU2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjCCAiIwDQYJ
KoZIhvcNAQEBBQADggIPADCCAgoCggIBAJUH6HPKZvnsFMp7PPcNCPG0RQssgrRI
xutbPK6DuEGSMxSkb3/pKszGsIhrxbaJ0cay/xTOURQh7ErdG1rG1ofuTToVBu1k
ZguSgMpE3nOUTvOniX9PeGMIyBJQbUJmL025eShNUhqKGoC3GYEOfsSKvGRMIRxD
aNc9PIrFsmbVkJq3MQbFvuJtMgamHvm566qjuL++gmNQ0PAYid/kD3n16qIfKtJw
LnvnvJO7bVPiSHyMEAc4/2ayd2F+4OqMPKq0pPbzlUoSB239jLKJz9CgYXfIWHSw
1CM69106yqLbnQneXUQtkPGBzVeS+n68UARjNN9rkxi+azayOeSsJDa38O+2HBNX
k7besvjihbdzorg1qkXy4J02oW9UivFyVm4uiMVRQkQVlO6jxTiWm05OWgtH8wY2
SXcwvHE35absIQh1/OZhFj931dmRl4QKbNQCTXTAFO39OfuD8l4UoQSwC+n+7o/h
bguyCLNhZglqsQY6ZZZZwPA1/cnaKI0aEYdwgQqomnUdnjqGBQCe24DWJfncBZ4n
WUx2OVvq+aWh2IMP0f/fMBH5hc8zSPXKbWQULHpYT9NLCEnFlWQaYw55PfWzjMpY
rZxCRXluDocZXFSxZba/jJvcE+kNb7gu3GduyYsRtYQUigAZcIN5kZeR1Bonvzce
MgfYFGM8KEyvAgMBAAGjYzBhMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTAD
AQH/MB0GA1UdDgQWBBSubAWjkxPioufi1xzWx/B/yGdToDAfBgNVHSMEGDAWgBSu
bAWjkxPioufi1xzWx/B/yGdToDANBgkqhkiG9w0BAQwFAAOCAgEAgyXt6NH9lVLN
nsAEoJFp5lzQhN7craJP6Ed41mWYqVuoPId8AorRbrcWc+ZfwFSY1XS+wc3iEZGt
Ixg93eFyRJa0lV7Ae46ZeBZDE1ZXs6KzO7V33EByrKPrmzU+sQghoefEQzd5Mr61
55wsTLxDKZmOMNOsIeDjHfrYBzN2VAAiKrlNIC5waNrlU/yDXNOd8v9EDERm8tLj
vUYAGm0CuiVdjaExUd1URhxN25mW7xocBFymFe944Hn+Xds+qkxV/ZoVqW/hpvvf
cDDpw+5CRu3CkwWJ+n1jez/QcYF8AOiYrg54NMMl+68KnyBr3TsTjxKM4kEaSHpz
oHdpx7Zcf4LIHv5YGygrqGytXm3ABdJ7t+uA/iU3/gKbaKxCXcPu9czc8FB10jZp
nOZ7BN9uBmm23goJSFmH63sUYHpkqmlD75HHTOwY3WzvUy2MmeFe8nI+z1TIvWfs
pA9MRf/TuTAjB0yPEL+GltmZWrSZVxykzLsViVO6LAUP5MSeGbEYNNVMnbrt9x+v
JJUEeKgDu+6B5dpffItKoZB0JaezPkvILFa9x8jvOOJckvB595yEunQtYQEgfn7R
8k8HWV+LLUNS60YMlOH1Zkd5d9VUWx+tJDfLRVpOoERIyNiwmcUVhAn21klJwGW4
5hpxbqCo8YLoRT5s1gLXCmeDBVrJpBA=
-----END CERTIFICATE-----`;

export const PBA_FIRST_SEASON = 2019; // PBA 출범 시즌 (2019-20)
export type PbaLeague = "PBA" | "LPBA";

export interface PbaRankRow {
    memCode: string;
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    prizeRank: number | null;
    pointRank: number | null;
    prize: number;
    rankingPoint: number;
}

export interface PbaDetail {
    memCode: string;
    nameKo: string;
    nameEn: string | null;
    nationCode: string | null;
    birthday: string | null;
    average: number | null;
    bankShotRate: number | null;
    highRun: number | null;
    win: number | null;
    lose: number | null;
    draw: number | null;
    careerPrize: number | null;
    leagueCode: string | null;
}

// Node 내장 fetch 는 내장 undici 버전과 npm undici Agent 가 호환되지 않으므로
// (onRequestStart 핸들러 인터페이스 차이) npm undici 의 fetch 를 일관되게 사용한다.
let undiciPair: { fetch: typeof fetch; dispatcher: any } | null = null;
async function getUndici() {
    if (!undiciPair) {
        const { Agent, fetch: uFetch } = await import("undici");
        undiciPair = { fetch: uFetch as unknown as typeof fetch, dispatcher: new Agent({ connect: { ca: GLOBALSIGN_CHAIN } }) };
    }
    return undiciPair;
}

async function fetchJson(path: string): Promise<any> {
    const { fetch: uFetch, dispatcher } = await getUndici();
    const res = await uFetch(`${ORIGIN}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        dispatcher,
        // 상대 서버가 매달리면 크론 함수가 인질이 된다 — 요청당 15초 상한
        signal: AbortSignal.timeout(15_000),
    } as any);
    if (!res.ok) throw new Error(`PBA API ${res.status}: ${path}`);
    return res.json();
}

const num = (v: unknown): number | null => {
    // null·빈 문자열이 Number() 로 0 이 되면 "0위"가 목록 최상단에 올라간다 — null 유지
    if (v == null || (typeof v === "string" && v.trim() === "")) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// 읽기 경로(API·프리렌더·사이트맵)의 검증과 같은 형식 계약 — 수집 시점에 원천 차단
const MEM_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;
const capStr = (v: unknown, max: number): string | null => {
    const s = v ? String(v).trim() : "";
    return s ? s.slice(0, max) : null;
};

// 시즌 랭킹 목록. 시즌이 없으면 빈 배열.
export async function fetchSeasonRanking(league: PbaLeague, season: number): Promise<PbaRankRow[]> {
    const json = await fetchJson(
        `/ko/stats/ranking_prize/ajax/list?leagueCode=${league}1&pbaType=PBA&league=1&season=${season}&tourCode=0`,
    );
    const list = Array.isArray(json?.list) ? json.list : [];
    return list
        .filter((r: any) => typeof r?.MemCode === "string" && MEM_CODE_RE.test(r.MemCode) && r?.PlayerNameKO)
        .map((r: any): PbaRankRow => ({
            memCode: r.MemCode,
            nameKo: capStr(r.PlayerNameKO, 100)!,
            nameEn: capStr(r.PlayerNameEN, 100),
            nationCode: capStr(r.NationCode, 3)?.toUpperCase() ?? null,
            // 목록 정렬 기준(RankBy)과 무관하게 두 순위를 모두 보존
            prizeRank: num(r.PrizeRank) ?? num(r.Rank),
            pointRank: num(r.RankingPointRank),
            prize: num(r.Prize) ?? 0,
            rankingPoint: num(r.RankingPoint) ?? 0,
        }));
}

// 선수 통산 프로필. 없거나 응답 이상이면 null.
export async function fetchPlayerDetail(memCode: string): Promise<PbaDetail | null> {
    const json = await fetchJson(`/ko/player/search/ajax/detail?memCode=${encodeURIComponent(memCode)}`);
    const d = json?.data;
    if (json?.resultCode !== "000" || !d?.MemCode || !MEM_CODE_RE.test(d.MemCode) || !d?.PlayerNameKO) return null;
    return {
        memCode: d.MemCode,
        nameKo: capStr(d.PlayerNameKO, 100)!,
        nameEn: capStr(d.PlayerNameEN, 100),
        nationCode: capStr(d.NationCode, 3)?.toUpperCase() ?? null,
        birthday: typeof d.BirthDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.BirthDay) ? d.BirthDay : null,
        average: num(d.Average),
        bankShotRate: num(d.BankShotRate),
        highRun: num(d.HR),
        win: num(d.Win),
        lose: num(d.Lose),
        draw: num(d.Draw),
        careerPrize: num(d.Prize),
        leagueCode: d.LeagueCode ? String(d.LeagueCode) : null,
    };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 시즌 대회 일정 — /ko/tournament/schedule/ajax/list (2026-08-09 실측).
// MATCH_START_DATE 가 {year, monthValue, dayOfMonth} 객체 형태라 ISO 로 정규화한다.
export interface PbaEvent {
    title: string;
    league: string; // PBA1·LPBA1·PBA2(드림투어)·TLG(팀리그)
    startDate: string; // YYYY-MM-DD
    endDate: string;
    place: string | null;
}
export async function fetchSchedule(season: number): Promise<PbaEvent[]> {
    const json = await fetchJson(`/ko/tournament/schedule/ajax/list?leagueCode=&season=${season}`);
    const list = Array.isArray(json?.list) ? json.list : [];
    const iso = (d: any): string | null =>
        d?.year && d?.monthValue && d?.dayOfMonth
            ? `${d.year}-${String(d.monthValue).padStart(2, "0")}-${String(d.dayOfMonth).padStart(2, "0")}`
            : null;
    return list
        .map((r: any): PbaEvent | null => {
            const startDate = iso(r.MATCH_START_DATE);
            const endDate = iso(r.MATCH_END_DATE) ?? startDate;
            const title = capStr(r.TITLE, 80);
            if (!startDate || !endDate || !title) return null;
            return {
                title,
                league: capStr(r.LEAGUE_GUBUN, 10) ?? "PBA1",
                startDate, endDate,
                place: r.PLACE && r.PLACE !== "미정" ? capStr(r.PLACE, 60) : null,
            };
        })
        .filter(Boolean) as PbaEvent[];
}
