// UMB 로마자 표기 → 한글 이름 결정적 변환기.
//
// 한국 이름의 로마자 음절은 유한하다(성씨 ~80종, 이름 음절 ~150종). UMB 표기는
// "CHO Myung Woo"처럼 음절이 공백으로 나뉘어 있어 토큰 단위 매핑이 가능하다.
// 원칙: **모든 토큰이 확실히 매핑될 때만** 결과를 낸다 — 애매하면 null(미표시)이
// 틀린 한글을 내보내는 것보다 낫다.

const SURNAMES: Record<string, string> = {
    kim: "김", lee: "이", yi: "이", rhee: "이", park: "박", bak: "박", pak: "박",
    choi: "최", choe: "최", jung: "정", jeong: "정", chung: "정", jang: "장", chang: "장",
    kang: "강", gang: "강", cho: "조", jo: "조", yoon: "윤", yun: "윤", yoo: "유", yu: "유", ryu: "류", ryoo: "류",
    lim: "임", im: "임", han: "한", oh: "오", seo: "서", suh: "서", shin: "신", sin: "신",
    kwon: "권", gwon: "권", hwang: "황", ahn: "안", an: "안", song: "송", hong: "홍",
    jeon: "전", chun: "전", jun: "전", ko: "고", go: "고", koh: "고", moon: "문", mun: "문",
    yang: "양", son: "손", sohn: "손", bae: "배", pae: "배", baek: "백", paik: "백", baik: "백",
    heo: "허", hur: "허", huh: "허", nam: "남", sim: "심", shim: "심", noh: "노", no: "노", roh: "노",
    ha: "하", kwak: "곽", gwak: "곽", sung: "성", seong: "성", cha: "차", joo: "주", ju: "주", chu: "주",
    woo: "우", wu: "우", koo: "구", goo: "구", gu: "구", ku: "구", min: "민", pyo: "표",
    byun: "변", byeon: "변", gong: "공", kong: "공", bang: "방", pang: "방", do: "도", seok: "석",
    chae: "채", won: "원", cheon: "천", chon: "천", tae: "태", gil: "길", kil: "길", yeo: "여",
    eom: "엄", um: "엄", uhm: "엄", jin: "진", chin: "진", ma: "마", pi: "피", gi: "기", ki: "기",
    hyun: "현", hyeon: "현", myung: "명", myeong: "명", so: "소", seol: "설", sul: "설",
    bong: "봉", chai: "채", dong: "동", eun: "은", in: "인", ji: "지",
    na: "나", ra: "라", ok: "옥", wang: "왕", yeom: "염", youm: "염", yum: "염",
    hahm: "함", ham: "함", hyon: "현", kwack: "곽", bu: "부", boo: "부", myong: "명",
};

const SYLLABLES: Record<string, string> = {
    a: "아", ae: "애", ah: "아", an: "안", bae: "배", beom: "범", bum: "범", bin: "빈", bo: "보",
    bok: "복", bong: "봉", byung: "병", byeong: "병", byoung: "병", chan: "찬", chang: "창",
    cheol: "철", chul: "철", chol: "철", cheon: "천", chun: "천", chi: "치", dae: "대", dai: "대",
    dal: "달", deok: "덕", duk: "덕", do: "도", dong: "동", doo: "두", du: "두", eon: "언",
    eun: "은", eum: "음", ui: "의", eui: "의", ga: "가", gab: "갑", gap: "갑", gan: "간",
    geon: "건", gun: "건", kun: "건", geum: "금", keum: "금", geun: "근", keun: "근",
    gi: "기", ki: "기", gil: "길", kil: "길", gon: "곤", gu: "구", ku: "구", goo: "구", koo: "구",
    gyu: "규", kyu: "규", gwan: "관", kwan: "관", gwang: "광", kwang: "광", gyeong: "경",
    kyung: "경", kyoung: "경", kyeong: "경", gyung: "경", ha: "하", hae: "해", hak: "학",
    han: "한", hang: "항", haeng: "행", hee: "희", hui: "희", hi: "희", ho: "호", hoi: "회",
    hong: "홍", hoon: "훈", hun: "훈", hwa: "화", hwan: "환", hwang: "황", hyang: "향",
    hyuk: "혁", hyeok: "혁", hyok: "혁", hyun: "현", hyeon: "현", hyon: "현",
    hyung: "형", hyeong: "형", hyoung: "형", il: "일", in: "인", ja: "자", jae: "재", jai: "재",
    jang: "장", je: "제", jea: "제", jeong: "정", jung: "정", jong: "종", ji: "지", jik: "직",
    jin: "진", joo: "주", ju: "주", joon: "준", jun: "준", june: "준", ka: "가", kap: "갑",
    kee: "기", man: "만", mann: "만", min: "민", mo: "모", moo: "무", mu: "무", mook: "묵",
    muk: "묵", myung: "명", myeong: "명", myoung: "명", na: "나", nam: "남", nyeo: "녀",
    o: "오", oh: "오", ok: "옥", pil: "필", pyung: "평", pyeong: "평", rae: "래", rak: "락",
    ram: "람", rim: "림", rin: "린", rok: "록", ryeol: "렬", ryong: "룡", sa: "사", sang: "상",
    se: "세", sei: "세", seok: "석", suk: "석", sok: "석", seon: "선", sun: "선", seong: "성",
    sung: "성", soung: "성", seul: "슬", seung: "승", sng: "승", si: "시", shi: "시", sik: "식",
    shik: "식", sil: "실", so: "소", soo: "수", su: "수", sook: "숙", sol: "솔", tae: "태",
    taek: "택", uk: "욱", ook: "욱", wook: "욱", un: "운", woon: "운", wan: "완", wang: "왕",
    weon: "원", won: "원", woo: "우", wu: "우", u: "우", ya: "야", yeol: "열", yul: "열",
    yeon: "연", youn: "연", yon: "연", yeong: "영", young: "영", yong: "용",
    yoo: "유", yu: "유", yoon: "윤", yun: "윤", chae: "채", cheong: "청", chong: "청",
    dan: "단", deuk: "득", eok: "억", gak: "각", gang: "강", kang: "강", gwon: "권", kwon: "권",
    hyo: "효", ik: "익", im: "임", jah: "자", jeom: "점", kon: "곤", kook: "국", guk: "국",
    kuk: "국", mi: "미", nim: "님", ran: "란", ri: "리", ry: "리", sam: "삼", san: "산",
    tak: "탁", tan: "탄", teak: "택", wi: "위", yang: "양", ye: "예", yee: "예", yea: "예",
    joong: "중", jwa: "좌", keon: "건", hwi: "휘", bi: "비", hye: "혜", mun: "문", moon: "문",
    pyo: "표", gyo: "교", yeok: "역", sub: "섭", seob: "섭", sup: "섭", kyun: "균", gyun: "균",
    heon: "헌", hon: "헌", ra: "라", la: "라", reu: "르", geuk: "극", jeung: "증",
    ba: "바", bit: "빛", byeol: "별", byol: "별", cham: "참", dam: "담", eo: "어",
    gam: "감", gyeom: "겸", kyeom: "겸", hyeop: "협", jem: "젬", nae: "내", nu: "누", noo: "누",
    on: "온", roo: "루", ru: "루", sae: "새", saem: "샘", sya: "샤", wol: "월",
    yeum: "염", yim: "임", euddeum: "으뜸", areum: "아름", aram: "아람", nuri: "누리",
    seom: "섬", som: "솜", byuk: "벽", byeok: "벽", chim: "침", deul: "들", teul: "틀",
    soon: "순", yeo: "여", seo: "서", gyoo: "규", kyoo: "규", gyoung: "경", gyeon: "견", kyeon: "견", myun: "면", myeon: "면", oon: "운",
};

// 붙여 쓴 이름 토큰("Bora", "Donggeun")을 알려진 음절 2~3개로 분해한다.
// 서로 다른 한글을 내는 분해가 여럿이면(모호) null — 안전 우선.
function segment(token: string): string[] | null {
    const lower = token.toLowerCase();
    if (SYLLABLES[lower]) return [SYLLABLES[lower]];
    const results = new Set<string>();
    const walk = (rest: string, acc: string[]) => {
        if (!rest) { if (acc.length >= 2 && acc.length <= 3) results.add(acc.join("")); return; }
        if (acc.length >= 3) return;
        // 1글자 조각(o·u·a)은 분해에 쓰지 않는다 — "seo"를 se+o로 쪼개는 오분해의 주범.
        // (토큰 전체가 1글자인 경우는 위의 직접 매칭이 처리)
        for (let len = Math.min(rest.length, 6); len >= 2; len--) {
            const head = rest.slice(0, len);
            if (SYLLABLES[head]) walk(rest.slice(len), [...acc, SYLLABLES[head]]);
        }
    };
    walk(lower, []);
    if (results.size === 1) return [[...results][0]];
    return null;
}

// "CHO Myung Woo" → "조명우". 확신 없으면 null.
export function toKoreanName(latinName: string): string | null {
    let tokens = latinName.trim().split(/\s+/);
    if (tokens.length < 2 || tokens.length > 4) return null;

    // 성-이름 역순 표기("HONGSUB Sim") — 2토큰일 때만 뒤집는다.
    // 3토큰 역순("SEOUK Eun Ju")은 어순을 확정할 수 없어 포기한다.
    let surname = SURNAMES[tokens[0].toLowerCase()];
    if (!surname && tokens.length === 2 && SURNAMES[tokens[1].toLowerCase()]) {
        surname = SURNAMES[tokens[1].toLowerCase()];
        tokens = [tokens[1], tokens[0]];
    }
    if (!surname) return null;
    // 이름 부분이 공백 3토큰 이상이면 포기 — 한국 이름 로마자는 이름을 최대 2토큰으로 쓴다
    // (붙여 쓴 "Hannuri"는 1토큰이라 통과)
    if (tokens.length - 1 > 2) return null;

    const given: string[] = [];
    for (const tok of tokens.slice(1)) {
        // "Myung-Woo" 하이픈, "Donggeun" 결합 토큰 모두 처리
        for (const part of tok.split("-")) {
            if (!part) continue;
            const syls = segment(part);
            if (!syls) return null; // 불확실하면 포기 — 틀린 한글보다 미표시가 낫다
            given.push(...syls);
        }
    }
    if (!given.length || given.length > 3) return null;
    return surname + given.join("");
}
