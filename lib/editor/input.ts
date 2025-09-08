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
    function commit(before: string, after: string) {
        code.update(before + after, Cursor.at(before.length));
    }
    switch (inputType) {
        case "insertText":
            if (
                matchBrackets &&
                selected.length &&
                delimiters.left.has(data as any)
            ) {
                const closing = delimiters.left.get(data as any)!;
                return code.update(
                    [before, data, selected, closing, after].join(""),
                    code.cursor.move(data.length)
                );
            } else return commit(before + data, after);
        case "insertReplacementText":
        case "insertFromDrop":
        case "insertFromPaste":
        case "insertLink":
            return commit(before + data, after);
        case "insertParagraph":
        case "insertLineBreak":
            return commit(before + "\n", after);
        case "deleteByDrag":
            return commit(before, after);
        case "deleteContentBackward":
            if (selected.length > 0) return commit(before, after);
            return commit(before.slice(0, -1), after);
        case "deleteWordBackward":
            if (selected.length > 0) return commit(before, after);
            return commit(
                before.slice(0, countBack(before, createWordCounter())),
                after
            );
        case "deleteSoftLineBackward":
            if (selected.length > 0) return commit(before, after);
            return commit(
                before.slice(0, countBack(before, createLineCounter())),
                after
            );
        case "deleteContentForward":
            if (selected.length > 0) return commit(before, after);
            return commit(before, after.slice(1));
        case "deleteWordForward":
            if (selected.length > 0) return commit(before, after);
            return commit(
                before,
                after.slice(countForward(after, createWordCounter()))
            );
        case "deleteSoftLineForward":
            if (selected.length > 0) return commit(before, after);
            return commit(
                before,
                after.slice(countForward(after, createLineCounter()))
            );
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
