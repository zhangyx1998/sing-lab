// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import Code, { Cursor } from "@lib/ast/code";
import { delimiters } from "@lib/ast/delimiter";

export default function handleInput(
    code: Code,
    event: InputEvent,
    matchBrackets: boolean = true
) {
    event.preventDefault();
    const { inputType } = event;
    let data = event.data ?? "";
    if (!code.cursor) return;
    const { before, selected, after } = code.cursor;
    const [L, S, R] = [before.text, selected.text, after.text];
    function commit(L: string, R: string) {
        code.update(L + R, Cursor.at(L.length)).commit();
    }
    switch (inputType) {
        case "insertText":
            if (matchBrackets && S.length && delimiters.left.has(data as any)) {
                const closing = delimiters.left.get(data as any)!;
                return code
                    .update(
                        [L, data, S, closing, R].join(""),
                        code.cursor.move(data.length)
                    )
                    .commit();
            } else return commit(L + data, R);
        case "insertReplacementText":
        case "insertFromDrop":
        case "insertFromPaste":
        case "insertLink":
            return commit(L + data, R);
        case "insertParagraph":
        case "insertLineBreak":
            return commit(L + "\n", R);
        case "deleteByDrag":
            return commit(L, R);
        case "deleteContentBackward":
            if (S.length > 0) return commit(L, R);
            return commit(L.slice(0, -1), R);
        case "deleteWordBackward":
            if (S.length > 0) return commit(L, R);
            return commit(L.slice(0, countBack(L, createWordCounter())), R);
        case "deleteSoftLineBackward":
            if (S.length > 0) return commit(L, R);
            return commit(L.slice(0, countBack(L, createLineCounter())), R);
        case "deleteContentForward":
            if (S.length > 0) return commit(L, R);
            return commit(L, R.slice(1));
        case "deleteWordForward":
            if (S.length > 0) return commit(L, R);
            return commit(L, R.slice(countForward(R, createWordCounter())));
        case "deleteSoftLineForward":
            if (S.length > 0) return commit(L, R);
            return commit(L, R.slice(countForward(R, createLineCounter())));
        default:
            console.warn("Unhandled input type:", inputType, data);
    }
}

function isLetter(c: string) {
    return /^\p{L}+$/u.test(c);
}

function isSpace(c: string) {
    return /^\p{Z}+$/u.test(c);
}

function createWordCounter() {
    let cond: ((c: string) => boolean) | null = null;
    return (c: string) => {
        if (cond === null) {
            cond = isSpace(c) ? isSpace : isLetter;
            return true;
        }
        return cond(c);
    };
}

function createLineCounter() {
    return (c: string) => {
        return c !== "\n";
    };
}

function countForward(s: string, condition: (c: string) => boolean) {
    let count = 0;
    for (const c of s) {
        if (!condition(c)) break;
        count++;
    }
    return count;
}

function countBack(s: string, condition: (c: string) => boolean) {
    let count = s.length;
    while (count > 0) {
        const c = s[count - 1];
        if (!condition(c)) break;
        count--;
    }
    return count;
}
