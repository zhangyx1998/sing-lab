// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { DefineComponent, Reactive, reactive } from "vue";
import { absolute_scale, Pitch, RelativeScale } from "./pitch";
import { parse } from "yaml";
import { hasNext, RecursiveArray, RecursiveGenerator, consume } from "./util";

class ScoreMeta {
    title?: string;
    tonic?: string;
    piece?: string;
    tempo?: string;
    offset?: string;
}

class Note {
    constructor(
        readonly pitch: Pitch,
        readonly t0: number,
        readonly dt: number = 1.0
    ) {}
}

class Lyric {
    constructor(
        readonly text: string,
        readonly t0: number,
        readonly dt: number = 1.0
    ) {}
}

export class Score {
    readonly meta: Reactive<ScoreMeta>;
    constructor(meta: ScoreMeta = {}) {
        this.meta = reactive(meta);
    }

    get title() {
        return this.meta.title;
    }
    get tonic() {
        try {
            const pitch = absolute_scale.get(this.meta.tonic ?? "");
            return new RelativeScale(pitch);
        } catch (e) {
            return absolute_scale;
        }
    }
    get piece() {
        const [a, b] = this.meta.piece?.split("/").map(parseInt) ?? [];
        if (isNaN(a) || isNaN(b) || b <= 0 || a <= 0) return null;
        return {
            beats_per_bar: a,
            divisions: b,
        };
    }
    get tempo() {
        const value = parseFloat(this.meta.tempo ?? "");
        if (isNaN(value) || value <= 0) return null;
        return value;
    }
    get offset() {
        const value = parseFloat(this.meta.offset ?? "");
        if (isNaN(value)) return 0;
        return value;
    }
    // static parse(text: string): Score {}
}

class Block {
    get src(): string {
        return this.parent instanceof Block ? this.parent.src : this.parent;
    }
    public readonly range: [number, number];
    get slice(): string {
        return this.src.slice(this.range[0], this.range[1]);
    }
    get length(): number {
        return this.range[1] - this.range[0];
    }
    readonly children?: Block[];
    readonly el: DefineComponent;

    constructor(
        public readonly parent: Block | string,
        private parser: Parser | null = null,
        range: [number, number] | null = null
    ) {
        this.range = range ?? [0, this.src.length];
    }
}

export class Parser {
    #handlers: Map<string, Parser> = new Map();
    use(handlers: Record<string, Parser>) {
        for (const [k, v] of Object.entries(handlers)) {
            this.#handlers.set(k, v);
        }
        return this;
    }
}

export function parseScore(text: string) {
    let lines = text.split("\n");
    // Strip Front Matter
    const frontMatterLines: string[] = [];
    let isInsideFrontMatter = false;
    lines = lines.filter((line) => {
        if (line.trimEnd() === "---") {
            isInsideFrontMatter = !isInsideFrontMatter;
            return false;
        }
        if (isInsideFrontMatter) {
            frontMatterLines.push(line);
            return false;
        }
        return true;
    });
    const frontmatter = parse(frontMatterLines.join("\n"));
    // Remove comments and space
    lines = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
    // Split into groups
    let current_group: string[] | null = null;
    const groups: string[][] = [];
    for (const line of lines) {
        if (line.length === 0) {
            current_group = null;
            continue;
        }
        if (!current_group) {
            current_group = [];
            groups.push(current_group);
        }
        current_group.push(line);
    }
    // Parse each group
    let t = 0.0,
        t_note = 0.0,
        t_lyric = 0.0; // Current time in beats

    // Callback function to advance time per note
    function advanceNote(dt: number) {
        const t0 = t_note;
        t_note += dt;
        return t0;
    }

    function advanceLyric(dt: number) {
        const t0 = t_lyric;
        t_lyric += dt;
        return t0;
    }

    const notes: Note[] = [];
    const lyrics: Lyric[] = [];
    for (const [l1, l2] of groups) {
        for (const bar of bars(l1)) {
            const tokens_gen = tokens(bar);
            const el = consume(elements(tokens_gen)) as Array<
                RecursiveArray<string, { type: ParenName }>
            >;
            if (hasNext(tokens_gen))
                console.warn(`Extra right paren encountered:\n${bar}`);
            notes.push(...createNotes(el, advanceNote));
        }
        for (const bar of bars(l2)) {
            const tokens_gen = tokens(bar);
            const el = consume(elements(tokens_gen)) as Array<
                RecursiveArray<string, { type: ParenName }>
            >;
            if (hasNext(tokens_gen))
                console.warn(`Extra right paren encountered:\n${bar}`);
            lyrics.push(...createLyrics(el, advanceLyric));
        }
        t = Math.max(t_note, t_lyric);
        t_note = t;
        t_lyric = t;
    }
    return { frontmatter, notes, lyrics };
}

function createNotes(
    elements: Array<RecursiveArray<string, { type: ParenName }>>,
    advance: (t: number) => number,
    scale = new RelativeScale(absolute_scale.get("C4")),
    dt: number = 1.0
): Note[] {
    const notes: Note[] = [];
    dt /= elements.length;
    for (const element of elements) {
        if (typeof element === "string") {
            notes.push(new Note(scale.get(element), advance(dt), dt));
        } else if (element.type === "ROUND") {
            notes.push(
                ...createNotes(element, advance, scale, dt / element.length)
            );
        } else {
            throw new Error(`Unsupported element type: ${element.type}`);
        }
    }
    return notes;
}

function createLyrics(
    elements: Array<RecursiveArray<string, { type: ParenName }>>,
    advance: (t: number) => number,
    dt: number = 1.0
): Lyric[] {
    const lyrics: Lyric[] = [];
    dt /= elements.length;
    for (const element of elements) {
        if (typeof element === "string") {
            lyrics.push(new Lyric(element, advance(dt), dt));
        } else if (element.type === "ROUND") {
            lyrics.push(...createLyrics(element, advance, dt / element.length));
        } else {
            throw new Error(`Unsupported element type: ${element.type}`);
        }
    }
    return lyrics;
}

type ParenName = keyof typeof PARENS;
const PARENS = Object.freeze({
    ROUND: { L: "(", R: ")" },
    BRACKET: { L: "[", R: "]" },
    BRACE: { L: "{", R: "}" },
    ANGLE: { L: "<", R: ">" },
});

const paren_tokens = Object.values(PARENS)
    .map(({ L, R }) => [L, R])
    .flat();

function* tokens(src: string) {
    const segments = src.trim().split(/\s+/);
    for (const seg of segments) {
        let l = 0,
            r = 0;
        search_tokens: while (r < seg.length) {
            const rest = seg.slice(r);
            for (const p of paren_tokens) {
                if (rest.startsWith(p)) {
                    if (l < r) yield seg.slice(l, r);
                    yield p;
                    l = r + p.length;
                    r = l;
                    continue search_tokens;
                }
            }
            r++;
        }
        if (l < r) yield seg.slice(l, r);
    }
}

type ElementsGen = RecursiveGenerator<string, { type?: ParenName }>;

function* elements(tokens: Generator<string>): Generator<ElementsGen> {
    for (const token of tokens) {
        // Check if token is a left paren
        for (const [type, { L, R }] of Object.entries(PARENS)) {
            if (token === L) {
                const group = elements(tokens) as Generator<ElementsGen> & {
                    type: ParenName;
                };
                group.type = type as ParenName;
                yield group;
                // group must be drained
                if (hasNext(group)) throw new Error("Unconsumed group");
                // Check for matching right paren
                const next = tokens.next();
                if (next.done || next.value !== R) {
                    throw new Error(`Expected closing paren: ${R}`);
                }
            } else if (token === R) {
                return;
            } else {
                yield token;
            }
        }
    }
}

function bars(line: string): string[] {
    return line.replace(/(^\s*\|)|(\|\s+$)/gm, "").split("|");
}
