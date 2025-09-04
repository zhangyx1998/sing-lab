// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { Segment } from "./code.ts";
import { brackets } from "./delimiter.ts";

export interface Block extends Segment {
    readonly type: string | string[];
    parse(): Iterable<Block | Token | Hint>;
}

export class Token extends Segment {
    constructor(
        public readonly type: string | string[],
        segment: Segment,
        public readonly attrs: Record<string, boolean | string | string[]> = {}
    ) {
        super(segment);
    }
}

export class Hint extends Segment {
    constructor(
        public readonly type: string | string[],
        segment: Segment,
        public readonly hint: string,
        public readonly attrs: Record<string, boolean | string | string[]> = {}
    ) {
        if (segment.length !== 0)
            throw new Error("Hint segment must be collapsed");
        super(segment);
    }
}

abstract class CodeBlock extends Segment implements Block {
    abstract readonly type: string | string[];
    static match(_: Segment): CodeBlock | null {
        throw new Error("Not implemented");
    }
    parse(): Iterable<Block | Token | Hint> {
        return [new Token(this.type, this)];
    }
}

class MicroBlock extends CodeBlock {
    public readonly elements: (Block | Token | Hint)[] = [];
    constructor(
        public readonly type: string,
        segment: Segment,
        ...elements: (Block | Token | Hint)[]
    ) {
        super(segment);
        this.elements = elements;
    }
    push(...elements: (Block | Token | Hint)[]) {
        this.elements.push(...elements);
        return this;
    }
    parse() {
        return this.elements;
    }
}

class UnknownCodeBlock extends CodeBlock {
    public readonly type: string = "unknown";
    static match(segment: Segment): CodeBlock | null {
        return new this(segment);
    }
}

class MetaCodeBlock extends CodeBlock {
    public readonly type: string = "meta";
    static match(segment: Segment): CodeBlock | null {
        const { code } = segment;
        let block = code.segment(segment.start, segment.start);
        let flag_open = false;
        for (const line of segment.lines) {
            const { text } = line;
            if (!flag_open && text.trim() !== "---") return null;
            block = block.merge(line);
            if (flag_open && text.trim() === "---") break;
            flag_open = true;
        }
        return block.length > 0 ? new this(block) : null;
    }
    readonly meta: Record<string, string> = Object.freeze({});
    parse() {
        const meta: Record<string, string> = {};
        const lines = [...this.lines];
        const [delim_start, delim_end] = [lines.at(0)!, lines.at(-1)!];
        const contents = lines.slice(1, -1).map((line) => {
            const index = line.text.indexOf(":");
            if (index >= 0) {
                const [key, sep, val] = [
                    line.slice(0, index).trim(),
                    line.slice(index, index + 1),
                    line.slice(index + 1).trim(),
                ];
                meta[key.text] = val.text;
                return new MicroBlock("entry", line).push(
                    new Token("key", key),
                    new Token("sep", sep),
                    new Token("val", val)
                );
            } else {
                return new UnknownCodeBlock(line);
            }
        });
        (this.meta as Record<string, string>) = meta;
        return [
            new Token(["delimiter", "lv-0"], delim_start),
            ...contents,
            new Token(["delimiter", "lv-0"], delim_end),
        ];
    }
}

class ScoreCodeBlock extends CodeBlock {
    public readonly type: string = "score";
    static match(segment: Segment): CodeBlock | null {
        let block = segment.slice(0, 0);
        for (const line of segment.lines) {
            if (line.text.trim() === "") break;
            block = block.merge(line);
        }
        return block.length > 0 ? new this(block) : null;
    }
    *parse() {
        let flag_first_line = true;
        for (const line of this.lines) {
            const bars = [...line.split("|")].filter(
                (b) => b.text.trim() !== ""
            );
            if (flag_first_line) {
                yield new MicroBlock(
                    "notes",
                    line,
                    ...bars.map((bar) => new TokenGroup("notes", bar))
                );
            } else {
                yield new MicroBlock(
                    "lyric",
                    line,
                    ...bars.map((bar) => new TokenGroup("lyric", bar))
                );
            }
            flag_first_line = false;
        }
    }
}

export const TOP_LEVEL_BLOCKS = [MetaCodeBlock, ScoreCodeBlock];

class TokenGroup extends CodeBlock {
    static createGenericTokenizer(name: string = "token") {
        return function tokenizer(seg: Segment, tg: TokenGroup): Block | Token {
            const type = ["0", "-"].includes(seg.text.trim())
                ? [name, tg.lv, "placeholder"]
                : [name, tg.lv, "literal"];
            return new Token(type, seg);
        };
    }
    public readonly type: string[];
    public readonly content: Segment;
    get lv() {
        return `lv-${this.level}`;
    }
    get lv_next() {
        return `lv-${this.level + 1}`;
    }
    constructor(
        public readonly group_type: string,
        range: Segment,
        public readonly tokenizer = TokenGroup.createGenericTokenizer(),
        public readonly level: number = 0,
        content?: Segment,
        public readonly delim_left: Token | Hint | null = null,
        public readonly delim_right: Token | Hint | null = null
    ) {
        super(range);
        this.content = content ?? range;
        this.type = ["group", this.lv, this.group_type];
    }
    createSubGroup(
        delim_left: Token | Hint | null,
        content: Segment,
        delim_right: Token | Hint | null
    ) {
        return new TokenGroup(
            this.group_type,
            Segment.merge(delim_left, content, delim_right),
            this.tokenizer,
            this.level + 1,
            content,
            delim_left,
            delim_right
        );
    }
    *parse() {
        const stack = new Array<string>();
        let { content } = this;
        let l = 0,
            r = 0;
        if (this.delim_left) {
            yield this.delim_left;
        }
        while (r < content.length) {
            const char = content.at(r);
            if ((l === r || stack.length > 0) && char in DELIM) {
                stack.push(DELIM[char as keyof typeof DELIM]);
            } else if (stack.length > 0 && stack.at(-1)! === char) {
                stack.pop();
                if (stack.length === 0) {
                    yield this.createSubGroup(
                        new Token(
                            ["delimiter", this.lv_next],
                            content.slice(l, l + 1)
                        ),
                        content.slice(l + 1, r),
                        new Token(
                            ["delimiter", this.lv_next],
                            content.slice(r, r + 1)
                        )
                    );
                    l = r + 1;
                }
            } else if (stack.length === 0) {
                if (/\s/g.test(char)) {
                    if (l < r) yield this.tokenizer(content.slice(l, r), this);
                    l = r + 1;
                }
            }
            r++;
        }
        if (l < r) {
            if (stack.length) {
                yield this.createSubGroup(
                    new Token(
                        ["delimiter", this.lv_next],
                        content.slice(l, ++l)
                    ),
                    content.slice(l, r),
                    new Hint(
                        ["delimiter", this.lv_next],
                        content.slice(r, r),
                        stack.pop()!
                    )
                );
            } else {
                yield this.tokenizer(content.slice(l, r), this);
            }
        }
        if (this.delim_right) {
            yield this.delim_right;
        }
    }
}

// class Note extends CodeBlock {
//     constructor(segment: Segment) {
//         super(segment.trim());
//     }
//     parse() {
//         let p = 0;
//         while (p <= this.length) {
//             if (["^", "_"].includes(this.at(p))) p++;
//             else break;
//         }
//         const [prefix, rest] = [this.slice(0, p), this.slice(p)];
//     }
// }
