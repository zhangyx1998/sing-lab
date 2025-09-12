// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { Pitch, absolute_scale, RelativeScale } from "@lib/pitch.ts";
import { parseFloatStrict } from "@lib/util/string.ts";
import Code, { Segment } from "./code.ts";
import { brackets } from "./delimiter.ts";
import AST from "./index.ts";
import Debug from "@lib/util/debug.ts";

export interface Block extends Segment {
    readonly type?: string | string[];
    readonly attrs?: Record<string, boolean | string | string[]>;
    readonly children?: Iterable<Block>;
}

export class Token extends Segment implements Block {
    constructor(
        public readonly type: string | string[],
        segment: Segment,
        public readonly attrs: Record<string, boolean | string | string[]> = {}
    ) {
        super(segment);
    }
}

export class Hint extends Segment implements Block {
    constructor(
        public readonly type: string | string[],
        segment: Segment,
        public readonly hint: string,
        public readonly attrs: Record<string, boolean | string | string[]> = {},
        public readonly accept?: () => any
    ) {
        if (segment.length !== 0)
            throw new Error("Hint segment must be collapsed");
        super(segment);
    }
    suggest(accept: () => any) {
        return new Hint(this.type, this, this.hint, this.attrs, accept);
    }
    static isInteractive<T>(el: T): el is T & Hint & { accept: () => any } {
        return el instanceof Hint && typeof el.accept === "function";
    }
}

abstract class CodeBlock extends Segment implements Block {
    static match(_: Segment): CodeBlock | null {
        throw new Error("Not implemented");
    }
    abstract readonly type: string | string[];
    abstract readonly children: Iterable<Block>;
    get ast() {
        const ast = AST.registry.get(this.code);
        if (!ast) throw new Error("AST not found");
        return ast;
    }
}

export class MicroBlock extends CodeBlock {
    public readonly children: Block[] = [];
    constructor(
        public readonly type: string | string[],
        segment: Segment,
        ...children: Block[]
    ) {
        super(segment);
        this.children = children;
    }
    push(...children: Block[]) {
        this.children.push(...children);
        return this;
    }
}

class UnknownCodeBlock extends CodeBlock {
    public readonly type: string = "unknown";
    static match(segment: Segment): UnknownCodeBlock | null {
        return new this(segment);
    }
    get children() {
        return [new Token("unknown", this)];
    }
}

type MetaDataHandler = (
    s: Segment,
    m: MetaData,
    LF?: string
) => [boolean, ...Block[]];

function insert(el: Segment | Code, pos: number, text: string) {
    const trace = Debug.trace(insert, { el, pos, text });
    const code = el instanceof Code ? el : el.code;
    return () => {
        code.insert(pos, text).commit();
        trace.print();
    };
}

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
                const action = insert(s, s.start, m.title + LF);
                const hint = new Hint("string", s.slice(s.length), m.title);
                return [false, hint.suggest(action)];
            }
        },
        tonic(s, m, LF) {
            const valid = absolute_scale.has(s.text);
            if (valid) m.tonic = absolute_scale.get(s.text);
            const ret: Block[] = [new MicroBlock("val", s, new Note(s))];
            if (s.length === 0) {
                const val = absolute_scale.absoluteNameOf(m.tonic);
                const hint = new Hint(["val", "note"], s.slice(0, 0), val);
                ret.push(hint.suggest(insert(s, s.start, val + LF)));
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
                ret.push(hint.suggest(insert(s, s.start, val + LF)));
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
                ret.push(hint.suggest(insert(s, s.start, val + LF)));
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
                ret.push(hint.suggest(insert(s, s.start, val + LF)));
            }
            ret.push(new Hint("unit", s.slice(s.length), `\tSeconds`));
            return [valid, ...ret];
        },
    };
}

export class MetaCodeBlock extends CodeBlock {
    static MetaData = MetaData;
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
    public readonly type: string = "meta";
    public readonly children: Readonly<Block[]>;
    constructor(segment: Segment) {
        super(segment);
        this.children = Object.freeze(this.parse());
    }
    parse(): Block[] {
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
        function* infer(t: string) {
            for (const k in MetaData.handler) {
                if (existing_keys.has(k)) continue;
                if (!k.startsWith(t)) continue;
                yield k.slice(t.length);
            }
        }
        const contents: Block[] = lines.slice(1, -1).map((line, i, lines) => {
            const LF =
                i === lines.length - 1 && remaining_keys.size > 0 ? "\n" : "";
            const index = line.text.indexOf(":");
            if (index >= 0) {
                const [key, sep, val] = [
                    line.slice(0, index).trim(),
                    line.slice(index, index + 1),
                    line.slice(index + 1).trim(),
                ];
                if (key.text in MetaData.handler) {
                    const handler = MetaData.handler[key.text];
                    const [valid, ...blocks] = handler(val, this.ast.meta, LF);
                    const type = ["entry", valid ? "valid" : "invalid"];
                    return new MicroBlock(type, line).push(
                        new Token("key", key),
                        new Hint("indent", key.slice(key.length), `\t`),
                        new Token("sep", sep),
                        ...blocks
                    );
                } else {
                    const ret: Block[] = [new Token("key", key)];
                    for (const k of infer(key.text)) {
                        const loc = key.slice(key.length, key.length);
                        const hint = new Hint("key", loc, k);
                        const action = insert(
                            code,
                            key.start,
                            k.slice(key.text.length)
                        );
                        ret.push(hint.suggest(action));
                        break;
                    }
                    ret.push(new Hint("indent", key.slice(key.length), `\t`));
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
                    const entry = new MicroBlock(["entry", "incomplete"], line);
                    const token = line.trim();
                    entry.push(new Token("key", token));
                    const pos = token.slice(token.length, token.length);
                    const hint = new Hint("key", pos, k + "\t: ");
                    return entry.push(
                        hint.suggest(insert(code, line.trim().end, k + ": "))
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
                    const action = insert(code, line.trim().end, ": ");
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
            const action = insert(code, delim_end.start, `${meta}\n`);
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
    public readonly children: Readonly<Block[]>;
    constructor(segment: Segment) {
        super(segment);
        this.children = Object.freeze([...this.parse()]);
    }
    public readonly notes: Readonly<Group<Note>[][]> = [];
    public readonly lyrics: Readonly<Group<Lyric>[][]> = [];
    *parse() {
        let flag_first_line = true;
        for (const line of this.lines) {
            if (line.text.trimStart().startsWith("#")) {
                yield new Token("comment", line);
                continue;
            }
            const bars = [...line.split("|")].filter(
                (b) => b.text.trim() !== ""
            );
            if (flag_first_line) {
                const notes = bars.map((bar) => new Group<Note>(Note, bar));
                (this.notes as Group<Note>[][]).push(notes);
                yield new MicroBlock("notes", line, ...notes);
            } else {
                const lyrics = bars.map((b) => new Group<Lyric>(Lyric, b));
                (this.lyrics as Group<Lyric>[][]).push(lyrics);
                yield new MicroBlock("lyrics", line, ...lyrics);
            }
            flag_first_line = false;
        }
        Object.freeze(this.notes);
        Object.freeze(this.lyrics);
    }
}

export class Group<T extends Block = Block> extends CodeBlock {
    get attrs() {
        return {
            style: [
                `--lv: ${this.level};`,
                `--color-delim: var(--color-delim-${((this.level - 1) % 3) + 1})`,
            ],
        };
    }
    get lv() {
        return `lv-${this.level}`;
    }
    get lv_next() {
        return `lv-${this.level + 1}`;
    }
    get type() {
        return ["group", this.lv, this.Element.group_type ?? []].flat();
    }
    public readonly level: number;
    public readonly content: Segment;
    public readonly contents: (T | Group<T>)[] = [];
    public readonly children: Readonly<Block[]>;
    constructor(
        public readonly Element: GroupElementClass = GroupToken,
        segment: Segment, // Includes delimiters
        public readonly parent: Group | null = null,
        public readonly delim_l: Token | Hint | null = null,
        public readonly delim_r: Token | Hint | null = null
    ) {
        super(segment);
        const [start, end] = [
            delim_l?.end ?? segment.start,
            delim_r?.start ?? segment.end,
        ];
        this.content = segment.code.segment(start, end);
        this.level = parent === null ? 0 : parent.level + 1;
        this.children = Object.freeze([...this.parse()]);
    }
    group(
        delim_l: Token | Hint | null,
        content: Segment,
        delim_r: Token | Hint | null
    ) {
        const segment = Segment.merge(delim_l, content, delim_r);
        return new Group<T>(this.Element, segment, this, delim_l, delim_r);
    }
    *parse() {
        if (this.delim_l) {
            yield this.delim_l;
        }
        // Parse group contents
        let { content } = this;
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
                // Consume bracketed group
                content = res.remainder;
                const { open: l, content: c, close: r } = res;
                const type = ["delimiter", this.lv_next];
                const { code } = this;
                function handleDelimiter(pos: number, delim: string | Segment) {
                    if (delim instanceof Segment) return new Token(type, delim);
                    const hint = new Hint(type, c.slice(pos, pos), delim);
                    return hint.suggest(insert(code, c.start + pos, delim));
                }
                const delim_l = handleDelimiter(0, l);
                const delim_r = handleDelimiter(c.length, r);
                this.contents.push(this.group(delim_l, c, delim_r));
            } else {
                // Consume next token
                let seg = content.slice(0, 0);
                while (
                    content.length > 0 &&
                    !/\s/.test(content.at(0)) &&
                    !brackets.matchOpen(content)[0]
                ) {
                    seg = seg.merge(content.slice(0, 1));
                    content = content.slice(1);
                }
                if (seg.length) {
                    this.contents.push(new this.Element(seg, this) as T);
                } else {
                    // Skip unrecognized contents
                    console.warn("Unrecognized content:", content.text);
                    break;
                }
            }
        }
        yield new MicroBlock("group-content", this.content, ...this.contents);
        if (this.delim_r) {
            yield this.delim_r;
        }
    }
}

type GroupElement = Block & { parent?: Group };
interface GroupElementClass {
    readonly group_type?: string | string[];
    new (segment: Segment, parent?: Group): GroupElement;
}

const GroupToken: GroupElementClass = class GroupToken extends Token {
    static readonly group_type = [];
    constructor(
        segment: Segment,
        public readonly parent?: Group
    ) {
        super("token", segment);
    }
};

export class Note extends CodeBlock {
    static readonly group_type = [];
    static readonly type = "note";
    readonly children: Readonly<(Token | Hint)[]>;
    readonly pitch: Pitch | null;
    get type() {
        if (this.pitch) return ["note", "pitch"];
        if (this.text === "-") return ["note", "tie"];
        if (this.is_rest) return ["note", "rest"];
        return ["note", "invalid"];
    }
    get is_rest() {
        if (this.length === 0) return true;
        if (this.content.text === "0") return true;
        return false;
    }
    get scale() {
        return this.ast.meta.scale ?? absolute_scale;
    }
    readonly prefix!: Segment;
    readonly content!: Segment;
    readonly suffix!: Segment;
    readonly octave!: Segment;
    constructor(
        segment: Segment,
        public readonly parent?: Group
    ) {
        super(segment.trim());
        const { scale } = this;
        this.pitch = scale.has(this.text) ? scale.get(this.text) : null;
        if (this.length) this.children = Object.freeze([...this.parse()]);
        else this.children = Object.freeze([new Hint("note", this, "0")]);
    }
    *parse() {
        const { scale } = this;
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
        (this.prefix as Segment) = prefix;
        (this.content as Segment) = content;
        (this.suffix as Segment) = suffix;
        (this.octave as Segment) = octave;
        if (prefix.length) yield new Token("prefix", prefix);
        if (content.length) yield new Token("pitch", content, attrs);
        if (octave.length) yield new Token("octave", octave);
        if (suffix.length) yield new Token("suffix", suffix);
    }
}

export class Lyric extends Token {
    static readonly group_type = "lyrics";
    constructor(
        segment: Segment,
        public readonly parent?: Group
    ) {
        const type = ["lyric"];
        if (segment.text === "-") type.push("tie");
        if (segment.text === "0") type.push("rest");
        super(type, segment);
    }
}
