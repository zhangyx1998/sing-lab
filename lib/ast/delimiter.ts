// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { reverse } from "@lib/util.ts";
import { Segment } from "./code.ts";

type MatchResult<L extends string, R extends string> = {
    open: Segment<L> | L;
    content: Segment;
    close: Segment<R> | R;
};

export default class Delimiter<
    L extends string,
    R extends string,
> extends Array<[L, R]> {
    readonly left: Map<L, R> = new Map();
    readonly right: Map<R, L> = new Map();

    constructor(...pairs: [L, R][]) {
        super(...pairs);
        for (const [l, r] of pairs) {
            this.left.set(l, r);
            this.right.set(r, l);
        }
        return Object.freeze(this);
    }

    check(segment: Segment) {
        for (const l of this.left.keys()) if (segment.startsWith(l)) return l;
        for (const r of this.right.keys()) if (segment.startsWith(r)) return r;
        return null;
    }

    matchOpen(segment: Segment): [Segment<L> | null, Segment] {
        for (const l of this.left.keys())
            if (segment.startsWith(l))
                return [segment.slice<L>(0, l.length), segment.slice(l.length)];
        return [null, segment];
    }

    matchClose(segment: Segment): [Segment<R> | null, Segment] {
        for (const r of this.right.keys())
            if (segment.startsWith(r))
                return [segment.slice<R>(0, r.length), segment.slice(r.length)];
        return [null, segment];
    }

    match(segment: Segment): MatchResult<L, R> | null {
        let l: Segment<L> | null, r: Segment<R> | null;
        [l, segment] = this.matchOpen(segment);
        if (l === null) return null;
        const stack = [l];
        while (stack.length > 0 && segment.length > 0) {
            [l, segment] = this.matchOpen(segment);
            if (l !== null) {
                stack.push(l);
                continue;
            }
            [r, segment] = this.matchClose(segment);
            if (r !== null) {
                const expect = this.right.get(r.text);
                for (const [index, open] of reverse(stack).entries()) {
                    if (open.text === expect) {
                        l = open;
                        stack.splice(index);
                        break;
                    }
                }
                continue;
            }
            // Not a delimiter, consume one character
            segment = segment.slice(1);
        }
        if (stack.length === 0) {
            return {
                open: l!,
                content: new Segment(segment.code, l!.end, r!.start),
                close: r!,
            };
        } else {
            return {
                open: stack[0],
                content: new Segment(segment.code, stack[0].end, segment.end),
                close: this.left.get(stack[0].text) as R,
            };
        }
    }
}

export const brackets = new Delimiter(
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["<", ">"]
);
