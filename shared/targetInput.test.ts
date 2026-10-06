import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { TARGET_INPUT_MAX, TARGET_INPUT_MIN, commitTargetText, sanitizeTargetText, stepTarget } from "./targetInput.js";

/**
 * 점수판 열기 — 목표 점수(다마수)를 숫자로 직접 치기(2026-10-06).
 * 오너: "우리 점수판에 이거 지금 화살표로만 내리고 올리고 하는데 숫자로 입력 가능하게" → 확정 "숫자로 변경만 가능하게".
 *
 * 지키는 것
 *  (가) 글자 → 값 규칙(shared/targetInput): 숫자만 받고, 빈 칸·0 은 치기 전 값, 범위는 1~999(서버 /game/start 가 자르는 값).
 *  (나) 화면(GameCreationModal 의 PlayerCard): 가운데 칸이 숫자 키패드를 띄우는 input 이고(type="number" 는 아니다),
 *       Enter 는 그 칸만 닫고, 화살표 두 개는 그대로 남아 있다. 치는 값은 곧바로 목표가 된다.
 *       화살표는 키보드를 닫지 않고(줄이 손가락 밑에서 튀지 않게), 키보드는 빈 곳을 눌러 내린다(아이폰 앱 숫자 패드에는 완료 키가 없다).
 *  (다) 렌더 중 되돌림(setEdit(null))은 '밖에서 값이 바뀐 때'만 걸린다 — 내가 치는 동안에는 한 번도 걸리지 않는다(치던 글자가 사라지지 않는다).
 *  (라) "숫자 입력만"이므로 목표 기본값·계산식은 그대로다 — 에버×35(3쿠션)·×20(4구), 기록 없으면 15, 게스트 15.
 *
 * 화면 코드의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는 sim·golf 만 읽는다. 소스를 읽어 검사한다.
 */
const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const parse = (name: string, text: string) =>
    ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const printer = ts.createPrinter({ removeComments: true });
/** 주석을 뺀 코드 글자(공백은 한 칸으로) — 설명에 적힌 낱말('type="number" 는 쓰지 않는다')이 검사를 통과시키거나 막지 않게 */
const bare = (node: ts.Node, sf: ts.SourceFile) => printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, " ");

/** 이름으로 찾은 const 선언 */
const decl = (sf: ts.SourceFile, name: string): ts.VariableDeclaration => {
    let found: ts.VariableDeclaration | undefined;
    const walk = (n: ts.Node) => {
        if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) found = n;
        if (!found) ts.forEachChild(n, walk);
    };
    walk(sf);
    if (!found) throw new Error(`${name} 선언을 찾지 못했다`);
    return found;
};

type Opening = ts.JsxSelfClosingElement | ts.JsxOpeningElement;
/** 태그의 속성 — 글자 값은 그대로, 식은 주석 뺀 코드로("{...}"), 값 없는 속성은 "true" */
const attrsOf = (el: Opening, sf: ts.SourceFile) => {
    const out = new Map<string, string>();
    for (const a of el.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const init = a.initializer;
        out.set(a.name.getText(sf), !init ? "true" : ts.isStringLiteral(init) ? init.text : bare(init, sf));
    }
    return out;
};
/** 어떤 노드 아래의 모든 여는 태그 */
const tagsIn = (root: ts.Node, sf: ts.SourceFile) => {
    const out: { name: string; node: Opening; attrs: Map<string, string> }[] = [];
    const walk = (n: ts.Node) => {
        if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) out.push({ name: n.tagName.getText(sf), node: n, attrs: attrsOf(n, sf) });
        ts.forEachChild(n, walk);
    };
    walk(root);
    return out;
};

const modal = parse("GameCreationModal.tsx", read("client/src/components/hiq/dashboard/GameCreationModal.tsx"));
const modalCode = bare(modal, modal);
const card = bare(decl(modal, "PlayerCard"), modal);
const hook = parse("useGameCreation.ts", read("client/src/hooks/useGameCreation.ts"));
const hookCode = bare(hook, hook);

// ─────────────────────────────────────────────────────────────────────────────
// (가) 순수 함수
// ─────────────────────────────────────────────────────────────────────────────
describe("목표 숫자 칸 — 치는 동안 보여 줄 글자(sanitizeTargetText)", () => {
    it("빈 값은 빈 칸으로 둔다(지우고 다시 치는 중)", () => {
        expect(sanitizeTargetText("")).toBe("");
        expect(sanitizeTargetText("   ")).toBe("");
        expect(sanitizeTargetText(undefined as unknown as string)).toBe("");
        expect(sanitizeTargetText(null as unknown as string)).toBe("");
    });

    it("0 하나는 남기고, 앞자리 0 은 접는다", () => {
        expect(sanitizeTargetText("0")).toBe("0");
        expect(sanitizeTargetText("00")).toBe("0");
        expect(sanitizeTargetText("000")).toBe("0");
        expect(sanitizeTargetText("05")).toBe("5");
        expect(sanitizeTargetText("007")).toBe("7");
        expect(sanitizeTargetText("0150")).toBe("150");
        // 가운데·끝의 0 은 숫자다
        expect(sanitizeTargetText("105")).toBe("105");
        expect(sanitizeTargetText("300")).toBe("300");
    });

    it("전각 숫자는 반각으로 받는다", () => {
        expect(sanitizeTargetText("２５")).toBe("25");
        expect(sanitizeTargetText("０")).toBe("0");
        expect(sanitizeTargetText("０５")).toBe("5");
        expect(sanitizeTargetText("１2３")).toBe("123");
    });

    it("한글·영문·기호·공백·부호·소수점은 버리고 숫자만 남긴다(붙여넣기도 같은 길)", () => {
        expect(sanitizeTargetText("이십5점")).toBe("5");
        expect(sanitizeTargetText("다마 30개")).toBe("30");
        expect(sanitizeTargetText("abc")).toBe("");
        expect(sanitizeTargetText("ㅁㄴㅇ")).toBe("");
        expect(sanitizeTargetText("-5")).toBe("5");
        expect(sanitizeTargetText("+12")).toBe("12");
        expect(sanitizeTargetText("1.5")).toBe("15");
        expect(sanitizeTargetText("1e2")).toBe("12");
        expect(sanitizeTargetText(" 3 0 ")).toBe("30");
        expect(sanitizeTargetText("2\n5\t")).toBe("25");
    });

    it("네 번째 자리부터는 받지 않는다 — 잘못 눌린 숫자가 값을 바꾸지 않는다", () => {
        expect(sanitizeTargetText("1234")).toBe("123");
        expect(sanitizeTargetText("99999")).toBe("999");
        expect(sanitizeTargetText("1,000")).toBe("100");
        expect(sanitizeTargetText("１２３４５")).toBe("123");
        // 앞자리 0 을 접은 뒤에 센다
        expect(sanitizeTargetText("0001234")).toBe("123");
    });

    it("자릿수는 상한의 자릿수를 따른다", () => {
        expect(sanitizeTargetText("12345", 99)).toBe("12");
        expect(sanitizeTargetText("12345", 9)).toBe("1");
        expect(sanitizeTargetText("12345", 12345)).toBe("12345");
        // 상한이 이상해도 한 자리는 받는다
        expect(sanitizeTargetText("57", 0)).toBe("5");
    });

    it("범위 안의 수는 친 그대로 보인다", () => {
        for (let n = TARGET_INPUT_MIN; n <= TARGET_INPUT_MAX; n++) {
            expect(sanitizeTargetText(String(n))).toBe(String(n));
        }
    });
});

describe("목표 숫자 칸 — 글자를 값으로(commitTargetText)", () => {
    it("빈 칸·0 은 치기 전 값을 그대로 돌려준다", () => {
        expect(commitTargetText("", 15)).toBe(15);
        expect(commitTargetText("0", 15)).toBe(15);
        expect(commitTargetText("000", 28)).toBe(28);
        expect(commitTargetText("０", 28)).toBe(28);
        expect(commitTargetText("abc", 28)).toBe(28);
        expect(commitTargetText("점", 28)).toBe(28);
        // 핀을 기다리는 회원 자리는 목표가 0 이다 — 그 자리에서 지우면 0 으로 남는다(값을 지어내지 않는다)
        expect(commitTargetText("", 0)).toBe(0);
        expect(commitTargetText("0", 0)).toBe(0);
    });

    it("정상 값은 그 수다", () => {
        expect(commitTargetText("1", 15)).toBe(1);
        expect(commitTargetText("5", 15)).toBe(5);
        expect(commitTargetText("30", 15)).toBe(30);
        expect(commitTargetText("150", 15)).toBe(150);
        expect(commitTargetText("999", 15)).toBe(999);
        expect(commitTargetText("３０", 15)).toBe(30);
        expect(commitTargetText("007", 15)).toBe(7);
    });

    it("범위 밖은 가까운 경계로 당긴다", () => {
        expect(commitTargetText("1000", 15)).toBe(999);
        expect(commitTargetText("12345", 15)).toBe(999);
        // 터무니없이 긴 숫자(Infinity)도 상한으로
        expect(commitTargetText("9".repeat(400), 15)).toBe(999);
        // 하한·상한을 따로 준 경우
        expect(commitTargetText("3", 10, 5, 50)).toBe(5);
        expect(commitTargetText("80", 10, 5, 50)).toBe(50);
        expect(commitTargetText("20", 10, 5, 50)).toBe(20);
    });

    it("숫자가 아닌 글자가 섞여도 숫자만 읽는다", () => {
        expect(commitTargetText("12abc3", 15)).toBe(123);
        expect(commitTargetText("-25", 15)).toBe(25);
        expect(commitTargetText("2.5", 15)).toBe(25);
    });

    it("칸에 보이는 수와 목표가 갈리지 않는다 — 빈 칸과 0 만 '치기 전 값'이다", () => {
        const samples = ["", "0", "7", "07", "42", "999", "1000", "１２３４", "3점", "-0", "9 9 9 9", "0000", "010"];
        for (const raw of samples) {
            const shown = sanitizeTargetText(raw);
            const value = commitTargetText(shown, 77);
            if (shown === "" || shown === "0") expect(value).toBe(77);
            else expect(String(value)).toBe(shown);
        }
        for (let n = TARGET_INPUT_MIN; n <= TARGET_INPUT_MAX; n++) {
            expect(commitTargetText(sanitizeTargetText(String(n)), 77)).toBe(n);
        }
    });
});

describe("목표 숫자 칸 — 화살표 한 번(stepTarget)", () => {
    it("범위 안에서는 예전 화살표와 똑같이 ±1 이다", () => {
        expect(stepTarget(15, 1)).toBe(16);
        expect(stepTarget(15, -1)).toBe(14);
        // 예전 식: 내리기 Math.max(1, t - 1) · 올리기 t + 1
        for (let v = TARGET_INPUT_MIN; v < TARGET_INPUT_MAX; v++) expect(stepTarget(v, 1)).toBe(v + 1);
        for (let v = TARGET_INPUT_MIN; v <= TARGET_INPUT_MAX; v++) expect(stepTarget(v, -1)).toBe(Math.max(1, v - 1));
    });

    it("1 아래로 내려가지 않고, 서버가 자르는 999 위로 올라가지 않는다", () => {
        expect(stepTarget(1, -1)).toBe(1);
        expect(stepTarget(999, 1)).toBe(999);
    });

    it("목표 0 인 자리(핀을 기다리는 회원 자리)는 어느 쪽을 눌러도 1 — 예전과 같다", () => {
        expect(stepTarget(0, 1)).toBe(1);
        expect(stepTarget(0, -1)).toBe(1);
    });

    it("범위 밖·이상한 값에서 시작해도 범위 안의 정수로 돌아온다", () => {
        for (const v of [5000, -3, 12.4, 12.6, NaN, Infinity, -Infinity]) {
            for (const dir of [-1, 1] as const) {
                const out = stepTarget(v, dir);
                expect(Number.isInteger(out)).toBe(true);
                expect(out).toBeGreaterThanOrEqual(TARGET_INPUT_MIN);
                expect(out).toBeLessThanOrEqual(TARGET_INPUT_MAX);
            }
        }
        expect(stepTarget(5000, -1)).toBe(999);
    });
});

describe("목표 숫자 칸 — 범위는 서버와 같다", () => {
    it("하한 1(0 은 승리 조건이 없다) · 상한 999", () => {
        expect(TARGET_INPUT_MIN).toBe(1);
        expect(TARGET_INPUT_MAX).toBe(999);
    });

    it("서버 /game/start 가 목표를 자르는 상한이 화면 상한과 같다 — 보이는 값과 저장되는 값이 갈리지 않는다", () => {
        const server = read("server/routes/modules/game.ts");
        const clamp = /for \(const k of \[([^\]]*)\]\)[\s\S]{0,260}?Math\.min\((\d+),\s*Math\.max\(0,\s*Math\.round\(n\)\)\)/.exec(server);
        expect(clamp).not.toBeNull();
        expect(Number(clamp![2])).toBe(TARGET_INPUT_MAX);
        for (const k of ["player1Target", "player2Target", "player3Target", "player4Target", "targetScore"]) {
            expect(clamp![1]).toContain(`"${k}"`);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (나) 화면 — 소스 검사
// ─────────────────────────────────────────────────────────────────────────────
describe("점수판 열기 화면 — 가운데 숫자 칸", () => {
    const all = tagsIn(modal, modal);
    const fields = all.filter((t) => t.name === "input" && t.attrs.get("inputMode") === "numeric");
    const field = fields[0];

    it("숫자 키패드를 띄우는 input 이 자리 카드에 하나 있다", () => {
        expect(fields.length).toBe(1);
        expect(field.attrs.get("type")).toBe("text");
        expect(field.attrs.get("pattern")).toBe("[0-9]*");
        // 자리 카드(PlayerCard) 안에 있다
        expect(card).toContain('inputMode="numeric"');
    });

    it('type="number" 는 어디에도 쓰지 않는다(휠·e·- 입력, iOS 동작 차이)', () => {
        expect(all.filter((t) => t.attrs.get("type") === "number")).toEqual([]);
        expect(modalCode).not.toMatch(/type=\{?["'`]number["'`]\}?/);
    });

    it("치는 동안은 치던 글자를, 아니면 지금 목표를 보여 준다", () => {
        expect(field.attrs.get("value")).toBe("{edit ? edit.text : String(player.target)}");
    });

    it("포커스·입력·키·blur 가 각각 제 일을 한다", () => {
        expect(field.attrs.get("onFocus")).toBe("{onTargetFocus}");
        expect(field.attrs.get("onChange")).toBe("{onTargetChange}");
        expect(field.attrs.get("onKeyDown")).toBe("{onTargetKeyDown}");
        // blur 는 입력을 닫기만 한다 — 값은 치는 순간 이미 들어갔다
        expect(field.attrs.get("onBlur")).toBe("{() => setEdit(null)}");
    });

    it("누르면 전체 선택 — 바로 덮어쓴다. 키보드가 올라온 뒤 칸을 보이는 곳으로 옮긴다", () => {
        const focus = bare(decl(modal, "onTargetFocus"), modal);
        expect(focus).toContain("el.select()");
        expect(focus).toMatch(/el\.scrollIntoView\(/);
    });

    it("Enter 는 이 칸만 닫는다 — 기본 동작을 막고(preventDefault) 키보드를 내린다", () => {
        const key = bare(decl(modal, "onTargetKeyDown"), modal);
        // Enter 가 아니면(한글 조합 중이어도) 손대지 않는다 — 지우기·숫자 키를 막지 않는다
        expect(key).toMatch(/if \(e\.key !== "Enter"[^)]*\) return;/);
        expect(key).toContain("e.nativeEvent.isComposing");
        const guard = key.indexOf('if (e.key !== "Enter"');
        const prevent = key.indexOf("e.preventDefault()");
        expect(prevent).toBeGreaterThan(guard);
        expect(key.indexOf("e.currentTarget.blur()")).toBeGreaterThan(prevent);
    });

    it("치는 값은 곧바로 목표가 된다(blur 를 기다리지 않는다) — 글자 → 값 규칙은 shared/targetInput 한 곳", () => {
        const change = bare(decl(modal, "onTargetChange"), modal);
        expect(change).toContain("const text = sanitizeTargetText(e.target.value, TARGET_INPUT_MAX);");
        expect(change).toContain("const base = edit ? edit.base : player.target;");
        expect(change).toContain("setEdit({ text, base, seat });");
        expect(change).toContain("const next = commitTargetText(text, base, TARGET_INPUT_MIN, TARGET_INPUT_MAX);");
        expect(change).toContain("if (next !== player.target) onUpdate(idx, { target: next });");
        expect(modalCode).toMatch(/import \{[^}]*\} from "@shared\/targetInput"/);
        // 화면에 따로 숫자 해석을 두지 않는다
        expect(card).not.toMatch(/\bparseInt\(|\bparseFloat\(|\bNumber\(/);
    });

    it("칸 크기·글자는 예전 그대로이고(90px·text-3xl), 새 색을 지어내지 않는다", () => {
        const cls = field.attrs.get("className") ?? "";
        expect(cls).toContain("w-[90px]");
        expect(cls).toContain("h-14");
        expect(cls).toContain("text-center");
        // 16px 보다 큰 글자 — iOS 가 포커스 때 화면을 확대하지 않는다
        expect(cls).toContain("text-3xl");
        expect(cls).toContain("${textColor}");
        expect(cls).toMatch(/focus:ring-brand(\/\d+)?/);
        expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(card).toContain('const textColor = "text-brand";');
    });

    it("읽어 주는 이름은 '누구의 · 목표 점수'다", () => {
        expect(field.attrs.get("aria-label")).toBe('{`${seatLabel} · ${t("sim.setup.target")}`}');
        expect(bare(decl(modal, "seatLabel"), modal)).toBe(
            'seatLabel = isSelf ? t("gameCreationModal.me") : `${t("gameCreationModal.opponent")} ${idx + 1}`',
        );
    });
});

describe("점수판 열기 화면 — 화살표는 그대로", () => {
    const field = tagsIn(modal, modal).find((t) => t.name === "input" && t.attrs.get("inputMode") === "numeric")!;
    const row = field.node.parent;
    const kids = ts.isJsxElement(row) ? row.children.filter((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) : [];
    const button = (kid: ts.Node | undefined) => {
        if (!kid || !ts.isJsxElement(kid)) throw new Error("단추가 아니다");
        return {
            name: kid.openingElement.tagName.getText(modal),
            attrs: attrsOf(kid.openingElement, modal),
            icons: tagsIn(kid, modal).map((t) => t.name).filter((n) => n !== "button"),
        };
    };

    it("한 줄에 내리기 · 숫자 칸 · 올리기 순서로 셋이 있다", () => {
        expect(ts.isJsxElement(row)).toBe(true);
        expect(kids.length).toBe(3);
        expect(kids[1]).toBe(field.node);
        expect(button(kids[0]).name).toBe("button");
        expect(button(kids[2]).name).toBe("button");
    });

    it("왼쪽은 1 내리기, 오른쪽은 1 올리기 — 그림도 그대로", () => {
        const down = button(kids[0]);
        const up = button(kids[2]);
        expect(down.attrs.get("onClick")).toBe("{() => bumpTarget(-1)}");
        expect(up.attrs.get("onClick")).toBe("{() => bumpTarget(1)}");
        expect(down.icons).toEqual(["ChevronDown"]);
        expect(up.icons).toEqual(["ChevronUp"]);
        expect(down.attrs.get("type")).toBe("button");
        expect(up.attrs.get("type")).toBe("button");
    });

    it("읽어 주는 이름이 단추의 뜻과 맞는다", () => {
        expect(button(kids[0]).attrs.get("aria-label")).toBe('{`${seatLabel} · ${t("chat.attach.matchInviteMinus")}`}');
        expect(button(kids[2]).attrs.get("aria-label")).toBe('{`${seatLabel} · ${t("chat.attach.matchInvitePlus")}`}');
        const ko = read("client/src/lib/i18n/ko.ts");
        expect(/"chat\.attach\.matchInviteMinus":\s*"([^"]*)"/.exec(ko)?.[1]).toContain("내리기");
        expect(/"chat\.attach\.matchInvitePlus":\s*"([^"]*)"/.exec(ko)?.[1]).toContain("올리기");
        expect(/"sim\.setup\.target":\s*"([^"]*)"/.exec(ko)?.[1]).toContain("목표 점수");
    });

    it("화살표는 치던 글자를 먼저 값으로 확정한 뒤 ±1 한다 — 식은 stepTarget 한 곳", () => {
        const bump = bare(decl(modal, "bumpTarget"), modal);
        expect(bump).toContain("onUpdate(idx, { target: stepTarget(typed, dir, TARGET_INPUT_MIN, TARGET_INPUT_MAX) });");
        expect(bump).toContain("setEdit(null);");
        expect(bare(decl(modal, "typed"), modal)).toBe(
            "typed = edit ? commitTargetText(edit.text, edit.base, TARGET_INPUT_MIN, TARGET_INPUT_MAX) : player.target",
        );
        // 예전 식이 화면에 따로 남아 있지 않다
        expect(card).not.toMatch(/player\.target\s*[-+]\s*1/);
    });

    // 키보드가 닫히면 창 높이가 한 번에 돌아와(index.css body.keyboard-open 규칙) 마지막 카드의 이 줄이 손가락 밑에서 내려간다.
    // 연달아 누른 두 번째 탭이 회원/게스트 토글에 떨어지면 방금 넣은 목표와 이름이 지워진다.
    it("화살표는 키보드를 닫지 않는다 — 포커스를 칸에 둔 채 값만 바꾼다", () => {
        const bump = bare(decl(modal, "bumpTarget"), modal);
        expect(bump).not.toMatch(/blur\(/);
        expect(card).not.toMatch(/targetRef\.current\??\.blur\(/);
        // 입력을 닫는 것(치던 글자 버리기)과 값 바꾸기는 한 번의 클릭 안에서 같이 한다 — 새 값이 다시 전체 선택된다
        expect(bump.indexOf("setEdit(null);")).toBeGreaterThan(-1);
        expect(bump.indexOf("onUpdate(idx,")).toBeGreaterThan(bump.indexOf("setEdit(null);"));
    });

    it("칸에 포커스가 있을 때만, 화살표 단추가 그 포커스를 가져가지 못하게 막는다 — 클릭은 그대로 간다", () => {
        const down = button(kids[0]);
        const up = button(kids[2]);
        expect(down.attrs.get("onMouseDown")).toBe("{keepTargetFocus}");
        expect(up.attrs.get("onMouseDown")).toBe("{keepTargetFocus}");
        const keep = bare(decl(modal, "keepTargetFocus"), modal);
        // 무조건 막지 않는다 — 키보드로 단추에 온 사람·칸을 누르지 않은 사람의 포커스는 건드리지 않는다
        expect(keep).toContain("if (document.activeElement === targetRef.current) e.preventDefault();");
        expect(keep.match(/preventDefault\(\)/g)?.length).toBe(1);
        expect(keep).not.toMatch(/stopPropagation|blur\(|focus\(/);
        // 클릭을 mousedown 으로 옮기지 않았다 — 값은 여전히 onClick 에서만 바뀐다
        expect(keep).not.toMatch(/bumpTarget|onUpdate/);
        // 포커스를 막는 단추는 화살표 둘뿐이다(토글·순서·종목 단추는 그대로)
        expect(tagsIn(modal, modal).filter((t) => t.attrs.has("onMouseDown")).length).toBe(2);
    });
});

describe("점수판 열기 화면 — 빈 곳을 누르면 키보드가 내려간다", () => {
    // 아이폰 앱: inputMode="numeric" + pattern="[0-9]*" 숫자 패드에는 완료(Enter) 키가 없고,
    // 키보드 위 '완료' 줄도 @capacitor/keyboard 가 지운다. 화살표도 키보드를 닫지 않으니 이 길이 있어야 한다.
    const scrollers = tagsIn(modal, modal).filter((t) => t.name === "div" && (t.attrs.get("className") ?? "").includes("overflow-y-auto"));
    const handlerDecl = decl(modal, "dismissKeyboardOnEmptyTap");

    it("자리 카드가 들어 있는 스크롤 영역이 pointerup 에서 처리한다", () => {
        expect(scrollers.length).toBe(1);
        expect(scrollers[0].attrs.get("onPointerUp")).toBe("{dismissKeyboardOnEmptyTap}");
        const inside = tagsIn(scrollers[0].node.parent, modal).map((t) => t.name);
        expect(inside).toContain("PlayerCard");
    });

    it("onClick·pointerdown 으로 달지 않는다 — 영역 전체가 '누를 수 있는 것'이 되지 않고, 목록을 밀기 시작할 때 키보드가 내려가지 않는다", () => {
        expect(scrollers[0].attrs.has("onClick")).toBe(false);
        expect(scrollers[0].attrs.has("onPointerDown")).toBe(false);
        expect(scrollers[0].attrs.has("onTouchStart")).toBe(false);
    });

    // 식을 떼어 실제로 돌려 본다(화면 모듈을 통째로 불러오지 않는다)
    class FakeInput {
        blurred = 0;
        blur() { this.blurred++; }
    }
    const js = ts.transpileModule(handlerDecl.parent.parent.getText(modal), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText;
    const run = (active: unknown, pointerType: string, hit: "empty" | "control") => {
        const asked: string[] = [];
        const handler = new Function("document", "HTMLInputElement", `${js}\n;return dismissKeyboardOnEmptyTap;`)(
            { activeElement: active },
            FakeInput,
        ) as (e: unknown) => void;
        handler({
            pointerType,
            target: { closest: (sel: string) => { asked.push(sel); return hit === "control" ? {} : null; } },
        });
        return asked;
    };

    it("손가락으로 빈 곳을 누르면 포커스가 있는 입력 칸을 닫는다(값은 건드리지 않는다)", () => {
        const input = new FakeInput();
        const asked = run(input, "touch", "empty");
        expect(input.blurred).toBe(1);
        // 건너뛰는 것은 입력 칸과 단추다
        expect(asked).toEqual(["input,button"]);
        const pen = new FakeInput();
        run(pen, "pen", "empty");
        expect(pen.blurred).toBe(1);
        // 값·목표에는 손대지 않는다 — blur 하나뿐이다
        const code = bare(handlerDecl, modal);
        expect(code).not.toMatch(/onUpdate|setEdit|updatePlayer|\.value\b/);
    });

    it("입력 칸·단추를 누른 것은 건너뛴다 — 화살표를 눌러도, 다른 자리 칸으로 옮겨도 키보드가 그대로다", () => {
        const input = new FakeInput();
        run(input, "touch", "control");
        expect(input.blurred).toBe(0);
    });

    it("마우스는 건너뛴다 — 이름을 끌어서 고르다 칸 밖에서 놓아도 입력이 닫히지 않는다", () => {
        const input = new FakeInput();
        const asked = run(input, "mouse", "empty");
        expect(input.blurred).toBe(0);
        expect(asked).toEqual([]);
    });

    it("포커스가 입력 칸에 없으면 아무 일도 하지 않는다", () => {
        expect(() => run(null, "touch", "empty")).not.toThrow();
        expect(() => run({ blur() { throw new Error("입력 칸이 아닌 것을 닫았다"); } }, "touch", "empty")).not.toThrow();
    });
});

describe("점수판 열기 화면 — 문구·규칙", () => {
    const LOCALES = ["ko", "en", "es", "vi", "tr"] as const;
    const keys = new Set<string>();
    const walk = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "t") {
            const a = n.arguments[0];
            if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
        }
        ts.forEachChild(n, walk);
    };
    walk(modal);

    it("숫자 칸·화살표가 쓰는 키 다섯 개가 화면에 있다", () => {
        for (const k of [
            "gameCreationModal.me",
            "gameCreationModal.opponent",
            "sim.setup.target",
            "chat.attach.matchInviteMinus",
            "chat.attach.matchInvitePlus",
        ]) {
            expect(keys.has(k), k).toBe(true);
        }
    });

    it("화면이 쓰는 문구 키는 다섯 언어에 전부 있다", () => {
        expect(keys.size).toBeGreaterThan(20);
        for (const locale of LOCALES) {
            const dict = read(`client/src/lib/i18n/${locale}.ts`);
            for (const key of keys) {
                const value = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(dict)?.[1];
                expect(value, `${locale} ${key}`).toBeTruthy();
            }
        }
    });

    it("네이티브 confirm·alert·prompt 를 쓰지 않는다", () => {
        expect(modalCode).not.toMatch(/\b(?:window\.)?(?:confirm|alert|prompt)\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (다) 렌더 중 되돌림 — 내가 치는 동안에는 걸리지 않는다
// ─────────────────────────────────────────────────────────────────────────────
/**
 * PlayerCard 의 입력 흐름을 그대로 옮긴 모형. 아래 첫 시험이 화면 소스가 이 모형과 같은 줄을 갖고 있는지 붙잡는다.
 *  - change: onTargetChange(글자 정리 → edit 저장 → 값이 달라졌으면 목표 갱신). 둘은 한 번의 이벤트 안이라 같은 렌더에 반영된다.
 *  - render: 렌더 중 되돌림 `if (edit && (player.target !== typed || seat !== edit.seat)) setEdit(null)`.
 */
function makeSeat(start: number, seatId = "guest:") {
    let target = start;
    let seat = seatId;
    let edit: { text: string; base: number; seat: string } | null = null;
    let resets = 0;
    const render = () => {
        // setEdit(null) 뒤의 다시 그리기까지 — 조건이 edit 을 요구하므로 한 번에 멎어야 한다
        for (let pass = 0; pass < 25; pass++) {
            const typed = edit ? commitTargetText(edit.text, edit.base, TARGET_INPUT_MIN, TARGET_INPUT_MAX) : target;
            if (edit && (target !== typed || seat !== edit.seat)) {
                edit = null;
                resets++;
                continue;
            }
            return pass;
        }
        throw new Error("Too many re-renders");
    };
    return {
        change(raw: string) {
            const text = sanitizeTargetText(raw, TARGET_INPUT_MAX);
            const base = edit ? edit.base : target;
            edit = { text, base, seat };
            const next = commitTargetText(text, base, TARGET_INPUT_MIN, TARGET_INPUT_MAX);
            if (next !== target) target = next;
            return render();
        },
        /** 밖에서 이 자리가 바뀐다(종목 전환 재계산·핀으로 회원이 앉음·자리 바꾸기) */
        external(next: { target?: number; seat?: string }) {
            if (next.target !== undefined) target = next.target;
            if (next.seat !== undefined) seat = next.seat;
            return render();
        },
        bump(dir: -1 | 1) {
            const typed = edit ? commitTargetText(edit.text, edit.base, TARGET_INPUT_MIN, TARGET_INPUT_MAX) : target;
            edit = null;
            target = stepTarget(typed, dir, TARGET_INPUT_MIN, TARGET_INPUT_MAX);
            return render();
        },
        blur() {
            edit = null;
            return render();
        },
        get shown() { return edit ? edit.text : String(target); },
        get target() { return target; },
        get editing() { return edit !== null; },
        get resets() { return resets; },
    };
}

describe("점수판 열기 화면 — 렌더 중 되돌림은 밖에서 바뀐 때만", () => {
    it("화면 소스가 모형과 같은 조건을 쓴다 — edit 이 있을 때만 null 로(한 번에 멎는다)", () => {
        expect(card).toContain("if (edit && (player.target !== typed || seat !== edit.seat)) setEdit(null);");
        expect(bare(decl(modal, "seat"), modal)).toBe('seat = `${player.type}:${player.member?.id ?? ""}`');
        // 치는 중에는 다시 전체 선택하지 않는다 — 그러면 두 번째 숫자가 첫 숫자를 지운다
        expect(card).toContain("if (!edit && el && document.activeElement === el) el.select();");
    });

    it("숫자를 이어 치는 동안 글자가 사라지지 않고, 목표는 친 값을 따라간다", () => {
        const s = makeSeat(15);
        expect(s.change("3")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["3", 3, true]);
        expect(s.change("30")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["30", 30, true]);
        expect(s.change("300")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["300", 300, true]);
        // 네 번째 숫자는 받지 않는다
        expect(s.change("3004")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["300", 300, true]);
        expect(s.resets).toBe(0);
        s.blur();
        expect([s.shown, s.target, s.editing]).toEqual(["300", 300, false]);
    });

    it("다 지워 빈 칸이 되면 칸은 빈 채로 남고, 목표는 그 자리에서 치기 전 값으로 돌아간다", () => {
        const s = makeSeat(15);
        s.change("3");
        expect(s.target).toBe(3); // 이때 목표는 치기 전 값(15)이 아니다
        expect(s.change("")).toBe(0);
        // 빈 칸이 15 로 튀어 돌아오지 않는다(이어서 칠 수 있다). 목표만 15 다 — 이대로 '게임 시작'을 눌러도 15.
        expect([s.shown, s.target, s.editing]).toEqual(["", 15, true]);
        expect(s.change("2")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["2", 2, true]);
        s.change("");
        s.blur();
        expect([s.shown, s.target, s.editing]).toEqual(["15", 15, false]);
        expect(s.resets).toBe(0);
    });

    it("0 을 치면 0 이 보이고 목표는 치기 전 값이다 — 이어서 치면 앞자리 0 은 접힌다", () => {
        const s = makeSeat(28);
        s.change("4");
        expect(s.change("0")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["0", 28, true]);
        expect(s.change("05")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["5", 5, true]);
        expect(s.change("0")).toBe(0);
        s.blur();
        expect([s.shown, s.target]).toEqual(["28", 28]);
        expect(s.resets).toBe(0);
    });

    it("범위 밖·숫자 아닌 글자를 쳐도 치던 글자를 잃지 않는다", () => {
        const s = makeSeat(15);
        s.change("99");
        expect(s.change("999")).toBe(0);
        expect(s.change("9999")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["999", 999, true]);
        expect(s.change("999점")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["999", 999, true]);
        expect(s.change("가")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["", 15, true]);
        expect(s.resets).toBe(0);
    });

    it("핀을 기다리는 회원 자리(목표 0)에서 치고 지워도 같다", () => {
        const s = makeSeat(0, "member:");
        expect(s.change("")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["", 0, true]);
        s.change("7");
        expect(s.target).toBe(7);
        s.change("");
        expect([s.shown, s.target, s.editing]).toEqual(["", 0, true]);
        expect(s.resets).toBe(0);
    });

    it("치는 중에 밖에서 값이 바뀌면 치던 글자를 버리고 새 값을 보여 준다 — 되돌림은 한 번에 끝난다", () => {
        const s = makeSeat(15, "member:me");
        s.change("30");
        // 종목 전환 재계산
        expect(s.external({ target: 42 })).toBe(1);
        expect([s.shown, s.target, s.editing, s.resets]).toEqual(["42", 42, false, 1]);
        // 다시 치기 시작하면 '치기 전 값'은 새 값이다
        s.change("");
        expect([s.shown, s.target, s.editing]).toEqual(["", 42, true]);
    });

    it("치는 중에 자리 주인이 바뀌면(핀으로 회원이 앉음) 값이 같아도 입력을 닫는다", () => {
        const s = makeSeat(15, "guest:");
        s.change("20");
        expect(s.external({ seat: "member:abc", target: 20 })).toBe(1);
        expect([s.shown, s.target, s.editing, s.resets]).toEqual(["20", 20, false, 1]);
    });

    it("입력 중이 아닐 때는 밖에서 무엇이 바뀌어도 되돌릴 것이 없다", () => {
        const s = makeSeat(15);
        expect(s.external({ target: 28 })).toBe(0);
        expect(s.external({ seat: "member:abc", target: 35 })).toBe(0);
        expect([s.shown, s.resets]).toEqual(["35", 0]);
    });

    it("치다가 화살표를 누르면 친 값에서 ±1, 빈 칸이었으면 치기 전 값에서 ±1", () => {
        const a = makeSeat(15);
        a.change("30");
        expect(a.bump(1)).toBe(0);
        expect([a.shown, a.target, a.editing]).toEqual(["31", 31, false]);
        const b = makeSeat(15);
        b.change("3");
        b.change("");
        b.bump(-1);
        expect([b.shown, b.target, b.editing]).toEqual(["14", 14, false]);
        expect(a.resets + b.resets).toBe(0);
    });

    it("화살표를 연달아 눌러도 한 번에 1 씩이고, 포커스가 칸에 남은 채 이어 치면 화살표로 맞춘 값이 '치기 전 값'이다", () => {
        const s = makeSeat(15);
        s.change("30");
        expect(s.bump(1)).toBe(0);
        expect(s.bump(1)).toBe(0);
        expect(s.bump(1)).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["33", 33, false]);
        // 새 값이 전체 선택돼 있어 친 숫자가 덮어쓴다
        expect(s.change("5")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["5", 5, true]);
        // 다 지우면 15(맨 처음 값)가 아니라 화살표로 맞춘 33 으로 돌아간다
        expect(s.change("")).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["", 33, true]);
        expect(s.bump(-1)).toBe(0);
        expect([s.shown, s.target, s.editing]).toEqual(["32", 32, false]);
        expect(s.resets).toBe(0);
    });

    it("아무렇게나 치고 지우고 붙여넣어도 — 되돌림 0번, 칸의 수 = 목표", () => {
        let seed = 20261006;
        const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
        const ALPHABET = [..."0123456789", ..."0123456789", ..."０５９", "가", "점", "-", ".", ",", " ", "e", "+"];
        const pick = () => ALPHABET[Math.floor(rnd() * ALPHABET.length)];

        for (const start of [15, 28, 1, 999, 0]) {
            const s = makeSeat(start);
            let base = s.target;
            for (let step = 0; step < 1500; step++) {
                const r = rnd();
                const cur = s.editing ? s.shown : "";
                let raw: string;
                if (r < 0.55) raw = cur + pick();
                else if (r < 0.8) raw = cur.slice(0, -1);
                else if (r < 0.92) raw = Array.from({ length: Math.floor(rnd() * 7) }, pick).join("");
                else if (r < 0.97) raw = "";
                else {
                    // 입력을 닫는다 — 다음 입력의 '치기 전 값'은 지금 목표다
                    s.blur();
                    expect(s.shown).toBe(String(s.target));
                    base = s.target;
                    continue;
                }

                expect(s.change(raw)).toBe(0);
                expect(s.editing).toBe(true);
                expect(s.shown).toMatch(/^(?:0|[1-9]\d{0,2})?$/);
                if (s.shown === "" || s.shown === "0") {
                    expect(s.target).toBe(base);
                } else {
                    expect(s.target).toBe(Number(s.shown));
                    expect(s.target).toBeGreaterThanOrEqual(TARGET_INPUT_MIN);
                    expect(s.target).toBeLessThanOrEqual(TARGET_INPUT_MAX);
                }
            }
            expect(s.resets).toBe(0);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (라) "숫자 입력만" — 목표 기본값·계산식은 그대로
// ─────────────────────────────────────────────────────────────────────────────
describe("목표 기본값·계산식은 손대지 않았다(오너 2026-10-06: \"숫자로 변경만 가능하게\")", () => {
    const calcDecl = decl(hook, "calculateTargetScore");
    const calcCode = bare(calcDecl, hook);
    // 훅 전체를 불러오면 화면 모듈('@/…')이 딸려 오므로, 식 하나만 떼어 실제로 돌려 본다
    const calcJs = ts.transpileModule(calcDecl.parent.parent.getText(hook), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText;
    const calc = new Function(`${calcJs}\n;return calculateTargetScore;`)() as (
        avg: string | number | null | undefined,
        type: "3c" | "4c",
    ) => number;

    it("식의 글자 — 3쿠션 ×35 · 4구 ×20 · 기록 없으면 15 · 최소 1", () => {
        expect(calcCode).toMatch(/if \(isNaN\(average\) \|\| average === 0\) return type === ['"]3c['"] \? 15 : 15;/);
        expect(calcCode).toMatch(/if \(type === ['"]3c['"]\) \{ const calculated = Math\.round\(average \* 35\); return Math\.max\(1, calculated\); \}/);
        expect(calcCode).toMatch(/else \{ const calculated = Math\.round\(average \* 20\); return Math\.max\(1, calculated\); \}/);
        // 식 안의 수는 이것뿐이다 — 상한(999) 같은 것을 식에 끼워 넣지 않았다
        expect((calcCode.match(/\b\d+(?:\.\d+)?\b/g) ?? []).sort()).toEqual(["0", "0", "1", "1", "15", "15", "20", "35"].sort());
    });

    it("식의 값 — 3쿠션은 에버리지 × 35", () => {
        expect(calc(1, "3c")).toBe(35);
        expect(calc(0.8, "3c")).toBe(28);
        expect(calc("0.800", "3c")).toBe(28);
        expect(calc(0.5, "3c")).toBe(18); // 17.5 → 반올림
        expect(calc(1.234, "3c")).toBe(43);
    });

    it("식의 값 — 4구는 에버리지 × 20", () => {
        expect(calc(1, "4c")).toBe(20);
        expect(calc(1.2, "4c")).toBe(24);
        expect(calc("7.5", "4c")).toBe(150);
        expect(calc(0.33, "4c")).toBe(7);
    });

    it("식의 값 — 기록이 없으면 종목과 상관없이 15, 아무리 낮아도 1", () => {
        for (const type of ["3c", "4c"] as const) {
            expect(calc(0, type)).toBe(15);
            expect(calc(null, type)).toBe(15);
            expect(calc(undefined, type)).toBe(15);
            expect(calc("0.000", type)).toBe(15);
            expect(calc("abc", type)).toBe(15);
            expect(calc(0.01, type)).toBe(1);
        }
    });

    it("식에는 상한이 없다 — 999 는 손으로 치는 칸과 화살표의 범위일 뿐이다", () => {
        expect(calc(40, "3c")).toBe(1400);
        expect(calc(60, "4c")).toBe(1200);
        expect(hookCode).not.toMatch(/targetInput|TARGET_INPUT_/);
    });

    it("게스트 자리 기본 목표는 15 — 처음 앉힐 때·인원을 늘릴 때·핀으로 늘어날 때 모두", () => {
        expect(bare(decl(hook, "DEFAULT_GUEST_TARGET"), hook)).toBe("DEFAULT_GUEST_TARGET = 15");
        expect(hookCode.match(/target: DEFAULT_GUEST_TARGET\b/g)?.length).toBe(3);
    });

    it("방장·회원 자리 목표는 여전히 그 식에서 나온다(카드가 정해 온 목표가 있으면 그것)", () => {
        expect(hookCode).toContain("const hostTarget = initialTarget && initialTarget > 0 ? initialTarget : calculateTargetScore(recordAvg, type);");
        expect(hookCode).toContain("return { ...p, target: calculateTargetScore(recordAvg, newType) };");
        expect(hookCode).toContain("return { ...p, target: calculateTargetScore(memberAvgForType(p.member, newType), newType) };");
        expect(hookCode).toContain("target: calculateTargetScore(memberAvgForType(guest, gameType), gameType)");
        expect(hookCode).toContain("target: calculateTargetScore(memberAvgForType(tournamentMatch.opponent, type), type)");
    });

    it("회원/게스트 토글의 기본값도 그대로 — 회원 자리 0(핀 대기), 게스트 15", () => {
        expect(card).toMatch(/onUpdate\(idx, \{ type: ['"]member['"], member: undefined, target: 0, name: ['"]{2} \}\)/);
        expect(card).toMatch(/onUpdate\(idx, \{ type: ['"]guest['"], member: undefined, target: 15, name: ['"]{2} \}\)/);
    });

    it("시작할 때 보내는 목표는 칸의 값 그대로다 — 중간에 다시 계산하지 않는다", () => {
        expect(hookCode).toContain("player1Target: players[0].target,");
        expect(hookCode).toContain("player2Target: players[1]?.target || 0,");
        expect(hookCode).toContain("player3Target: players[2]?.target || 0,");
        expect(hookCode).toContain("player4Target: players[3]?.target || 0,");
        expect(hookCode).toContain("targetScore: players[0].target,");
    });
});
