// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { Pitch, absolute_scale, RelativeScale } from "@lib/pitch.ts";
import { parseFloatStrict } from "@lib/util.ts";
import { Segment } from "./code.ts";
import { brackets } from "./delimiter.ts";
import AST from "./index.ts";

export interface Block extends Segment {
    readonly type: string | string[];
    readonly attrs?: Record<string, boolean | string | string[]>;
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
    accept?: () => any;
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
    suggest(accept: () => any) {
        this.accept = accept;
        return this;
    }
    static isInteractive<T>(el: T): el is T & Hint & { accept: () => any } {
        return el instanceof Hint && typeof el.accept === "function";
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
    get ast() {
        const ast = AST.registry.get(this.code);
        if (!ast) throw new Error("AST not found");
        return ast;
    }
}

export class MicroBlock extends CodeBlock {
    public readonly elements: (Block | Token | Hint)[] = [];
    constructor(
        public readonly type: string | string[],
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
    static match(segment: Segment): UnknownCodeBlock | null {
        return new this(segment);
    }
}

type MetaDataHandler = (
    s: Segment,
    m: MetaData,
    LF?: string
) => [boolean, ...(Token | Hint | Block)[]];

class MetaData {
    title = "New Music";
    #tonic: Pitch = absolute_scale.get("C4");
    #scale: RelativeScale = new RelativeScale(this.#tonic);
    meter = [4, 4];
    tempo = 120.0;
    offset = 0.0;
    static units = {
        tempo: "Beats per Minute",
        offset: "Seconds",
    };
    get flat() {
        return {
            title: this.title,
            tonic: absolute_scale.absoluteNameOf(this.tonic),
            meter: this.meter.join("/"),
            tempo: this.tempo,
            offset: this.offset,
        };
    }
    toString() {
        const lines: string[] = [];
        for (const [k, v] of Object.entries(this.flat)) {
            lines.push(`${k}: ${v}`);
        }
        return lines.join("\n");
    }
    get preview() {
        const lines: string[] = [];
        for (const [k, v] of Object.entries(this.flat)) {
            const unit = (MetaData.units as any)[k];
            lines.push(`${k}\t: ${v}${unit ? "\t" + unit : ""}`);
        }
        return lines.join("\n");
    }
    get scale() {
        return this.#scale;
    }
    get tonic() {
        return this.#tonic;
    }
    set tonic(p: Pitch) {
        this.#tonic = p;
        this.#scale = new RelativeScale(p);
    }
    static readonly handler: Record<string, MetaDataHandler> = {
        title(s, m, LF) {
            if (s.text.length > 0) {
                m.title = s.text;
                return [true, new Token(["val", "string"], s)];
            } else {
                const { code } = s;
                const action = () => code.insert(s.start, m.title + LF);
                const hint = new Hint("string", s.slice(s.length), m.title);
                return [false, hint.suggest(action)];
            }
        },
        tonic(s, m, LF) {
            const valid = absolute_scale.has(s.text);
            if (valid) m.tonic = absolute_scale.get(s.text);
            const ret = [new MicroBlock("val", s, new Note(s)) as Hint | Block];
            if (s.length === 0) {
                const val = absolute_scale.absoluteNameOf(m.tonic);
                const hint = new Hint(["val", "note"], s.slice(0, 0), val);
                ret.push(hint.suggest(() => s.code.insert(s.start, val + LF)));
            }
            return [valid, ...ret];
        },
        meter(s, m, LF) {
            const res = s.text.match(/^(\d+)\s*\/\s*(\d+)$/);
            if (res) {
                const [_, num, den] = res;
                m.meter = [parseInt(num), parseInt(den)];
            }
            const ret = [new Token(["val", "meter"], s)];
            if (s.length === 0) {
                const val = m.meter.join("/");
                const hint = new Hint(["val", "meter"], s.slice(0, 0), val);
                ret.push(hint.suggest(() => s.code.insert(s.start, val + LF)));
            }
            return [!!res, ...ret];
        },
        tempo(s, m, LF) {
            const t = parseFloatStrict(s.text);
            const valid = t !== null && t > 0;
            if (valid) m.tempo = t;
            const ret = [new Token(["val", "number"], s)];
            if (s.length === 0) {
                const val = m.tempo.toString();
                const hint = new Hint(["val", "number"], s.slice(0, 0), val);
                ret.push(hint.suggest(() => s.code.insert(s.start, val + LF)));
            }
            ret.push(new Hint("unit", s.slice(s.length), `\tBeats per Minute`));
            return [valid, ...ret];
        },
        offset(s, m, LF) {
            const t = parseFloatStrict(s.text);
            const valid = t !== null;
            if (valid) m.offset = t;
            const ret = [new Token(["val", "number"], s)];
            if (s.length === 0) {
                const val = m.offset.toString();
                const hint = new Hint(["val", "number"], s.slice(0, 0), val);
                ret.push(hint.suggest(() => s.code.insert(s.start, val + LF)));
            }
            ret.push(new Hint("unit", s.slice(s.length), `\tSeconds`));
            return [valid, ...ret];
        },
    };
}

export class MetaCodeBlock extends CodeBlock {
    static MetaData = MetaData;
    public readonly type: string = "meta";
    static match(segment: Segment): MetaCodeBlock | null {
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
    parse() {
        const { code } = this;
        const lines = [...this.lines];
        const [delim_start, delim_end] = [lines.at(0)!, lines.at(-1)!];
        const existing_keys = new Set<string>(
            lines
                .slice(1, -1)
                .map((l) => l.text.split(":")[0].trim())
                .filter((k) => k in MetaData.handler)
        );
        const remaining_keys = new Set<string>(
            Object.keys(MetaData.handler).filter((k) => !existing_keys.has(k))
        );
        console.log({ existing_keys });
        function* infer(t: string) {
            for (const k in MetaData.handler) {
                if (existing_keys.has(k)) continue;
                if (!k.startsWith(t)) continue;
                yield k.slice(t.length);
            }
        }
        const contents: (Block | Hint | Token)[] = lines
            .slice(1, -1)
            .map((line, i, lines) => {
                const LF =
                    i === lines.length - 1 && remaining_keys.size > 0
                        ? "\n"
                        : "";
                const index = line.text.indexOf(":");
                if (index >= 0) {
                    const [key, sep, val] = [
                        line.slice(0, index).trim(),
                        line.slice(index, index + 1),
                        line.slice(index + 1).trim(),
                    ];
                    if (key.text in MetaData.handler) {
                        const handler = MetaData.handler[key.text];
                        const [valid, ...blocks] = handler(
                            val,
                            this.ast.meta,
                            LF
                        );
                        const type = ["entry", valid ? "valid" : "invalid"];
                        return new MicroBlock(type, line).push(
                            new Token("key", key),
                            new Hint("indent", key.slice(key.length), `\t`),
                            new Token("sep", sep),
                            ...blocks
                        );
                    } else {
                        const ret: (Token | Hint)[] = [new Token("key", key)];
                        // for (const k of infer(key.text)) {
                        //     const loc = key.slice(key.length, key.length);
                        //     const hint = new Hint("key", loc, k);
                        //     const action = () =>
                        //         code.insert(key.start, k.slice(key.text.length));
                        //     ret.push(hint.suggest(action));
                        //     break;
                        // }
                        ret.push(
                            new Hint("indent", key.slice(key.length), `\t`)
                        );
                        ret.push(new Token("sep", sep));
                        ret.push(new Token("val", val));
                        return new MicroBlock(["entry", "unused"], line).push(
                            new Token("key", key),
                            new Hint("indent", key.slice(key.length), `\t`),
                            new Token("sep", sep),
                            new Token("val", val)
                        );
                    }
                } else {
                    const t = line.text.trim();
                    for (const k of infer(t)) {
                        const entry = new MicroBlock(
                            ["entry", "incomplete"],
                            line
                        );
                        const token = line.trim();
                        entry.push(new Token("key", token));
                        const pos = token.slice(token.length, token.length);
                        const hint = new Hint("key", pos, k + "\t: ");
                        return entry.push(
                            hint.suggest(() =>
                                code.insert(line.trim().end, k + ": ")
                            )
                        );
                    }
                    if (!/\s|(^$)/.test(t)) {
                        const loc = line.slice(
                            line.trimEnd().length,
                            line.trimEnd().length
                        );
                        const block = new MicroBlock(
                            ["entry", "incomplete", "unused"],
                            line
                        );
                        const action = () => code.insert(line.trim().end, ": ");
                        return block.push(
                            new Token("key", line),
                            new Hint("sep", loc, "\t: ").suggest(action)
                        );
                    }
                    return new UnknownCodeBlock(line);
                }
            });
        if (contents.length === 0) {
            const { meta } = this.ast;
            const hint = new Hint(
                "meta",
                delim_end.slice(0, 0),
                `${meta.preview}\n`
            );
            const action = () => code.insert(delim_end.start, `${meta}\n`);
            contents.push(hint.suggest(action));
        }
        return [
            new Token(["delimiter", "lv-0"], delim_start),
            ...contents,
            new Token(["delimiter", "lv-0"], delim_end),
        ];
    }
}

export class ScoreCodeBlock extends CodeBlock {
    public readonly type: string = "score";
    static match(segment: Segment): ScoreCodeBlock | null {
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
                const notes = bars.map(
                    (bar) => new TokenGroup("notes", bar, (s, _) => new Note(s))
                );
                yield new MicroBlock("notes", line, ...notes);
            } else {
                const tokenizer = TokenGroup.createTokenizer("lyric");
                const lyrics = bars.map(
                    (b) => new TokenGroup("lyrics", b, tokenizer)
                );
                yield new MicroBlock("lyrics", line, ...lyrics);
            }
            flag_first_line = false;
        }
    }
}

class TokenGroup extends CodeBlock {
    static createTokenizer(name: string = "token", ...classes: string[]) {
        return function tokenizer(seg: Segment, tg: TokenGroup): Block | Token {
            return new Token([name, tg.lv, ...classes], seg);
        };
    }
    public readonly type: string[];
    public readonly content: Segment;
    get attrs() {
        return {
            style: [
                `--lv: ${this.level};`,
                `--delim-color: var(--delim-color-${((this.level - 1) % 3) + 1})`,
            ],
        };
    }
    get lv() {
        return `lv-${this.level}`;
    }
    get lv_next() {
        return `lv-${this.level + 1}`;
    }
    constructor(
        public readonly group_type: string,
        range: Segment,
        public readonly tokenizer = TokenGroup.createTokenizer(),
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
        let { content } = this;
        if (this.delim_left) {
            yield this.delim_left;
        }
        const contents = [] as (Block | Token | Hint)[];
        while (content.length > 0) {
            const whitespace = content.text.match(/^\s*/)?.[0] ?? "";
            if (whitespace.length > 0) {
                content = content.slice(whitespace.length);
                if (content.length === 0) break;
            }
            while (content.length && /\s/.test(content.at(0)))
                content = content.slice(1);
            if (content.length === 0) break;
            const res = brackets.match(content);
            if (res) {
                content = res.remainder;
                const { open: l, content: c, close: r } = res;
                const type = ["delimiter", this.lv_next];
                const { code } = this;
                function handleDelimiter(pos: number, delim: string | Segment) {
                    if (delim instanceof Segment) return new Token(type, delim);
                    return new Hint(type, c.slice(pos, pos), delim).suggest(
                        () => code.insert(c.start + pos, delim)
                    );
                }
                contents.push(
                    this.createSubGroup(
                        handleDelimiter(0, l),
                        c,
                        handleDelimiter(c.length, r)
                    )
                );
            } else {
                // Consume next token
                let token = content.slice(0, 0);
                while (
                    content.length > 0 &&
                    !/\s/.test(content.at(0)) &&
                    !brackets.matchOpen(content)[0]
                ) {
                    token = token.merge(content.slice(0, 1));
                    content = content.slice(1);
                }
                if (token.length) {
                    contents.push(this.tokenizer(token, this));
                } else {
                    contents.push(new Token(["unknown", this.lv], content));
                    break;
                }
            }
        }
        yield new MicroBlock("group-content", this.content, ...contents);
        if (this.delim_right) {
            yield this.delim_right;
        }
    }
}

class Note extends CodeBlock {
    readonly children: (Token | Hint)[];
    readonly pitch: Pitch | null;
    get type() {
        if (this.pitch) return ["note", "pitch"];
        if (this.text === "-") return ["note", "tie"];
        if (this.content.text === "0") return ["note", "rest"];
        return ["note", "invalid"];
    }
    readonly prefix: Segment;
    readonly content: Segment;
    readonly suffix: Segment;
    readonly octave: Segment;
    constructor(segment: Segment) {
        super(segment.trim());
        const scale = this.ast.meta.scale ?? absolute_scale;
        this.pitch = scale.has(this.text) ? scale.get(this.text) : null;
        this.children = [];
        // Parse immediately
        let prefix = this.slice(0, 0),
            suffix = this.slice(this.length),
            content = this as Segment;
        while (content.length && ["^", "_"].includes(content.at(0))) {
            prefix = prefix.merge(content.slice(0, 1));
            content = content.slice(1);
        }
        if (content.length && ["#", "b"].includes(content.at(-1))) {
            suffix = content.slice(-1);
            content = content.slice(0, -1);
        }
        let octave = content.slice(content.length);
        if (
            content.length &&
            /[A-G]/.test(content.at(0)) &&
            /^\d$/.test(content.at(-1))
        ) {
            octave = content.slice(-1);
            content = content.slice(0, -1);
        }
        const attrs = {} as Record<string, string>;
        if (this.pitch)
            attrs["data-absolute"] = scale.absoluteNameOf(this.pitch);
        if (prefix.length) {
            let delta = 0;
            for (const c of prefix.text) {
                delta += { "^": 1, _: -1 }[c] ?? 0;
            }
            if (delta > 0) attrs["data-above"] = "•".repeat(delta);
            if (delta < 0) attrs["data-below"] = "•".repeat(-delta);
        }
        if (prefix.length) this.children.push(new Token("prefix", prefix));
        if (content.length)
            this.children.push(new Token("pitch", content, attrs));
        if (octave.length) this.children.push(new Token("octave", octave));
        if (suffix.length) this.children.push(new Token("suffix", suffix));
        Object.freeze(this.children);
        this.prefix = prefix;
        this.content = content;
        this.suffix = suffix;
        this.octave = octave;
    }
    parse() {
        return this.children;
    }
}
