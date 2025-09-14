// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import Fractional from "@lib/fractional";

const mappings = {
    '"(前奏)"': "*",
};

function preprocess(input: string): string[] {
    for (const [k, v] of Object.entries(mappings)) {
        input = input.replaceAll(k, v);
    }
    return input
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

function processMeta(line: string, meta: Record<string, string>): boolean {
    if (line.startsWith("ｂｐｍ")) {
        meta.tempo = line.slice(3).trim();
        return true;
    }
    if (line.startsWith("/key(") && line.endsWith(")")) {
        const src = line.slice(5, -1).trim();
        const [key] = src.match(/^[A-G]/) ?? ["C"];
        const [suffix] = src.match(/(#|b)/) ?? [""];
        const [octave] = src.match(/([0-9])/g) ?? [""];
        meta.tonic = key + octave + suffix;
        return true;
    }
    return false;
}

class Group extends Array<Group | { note: string; lyric: string | null }> {
    constructor(
        public readonly T = new Fractional(4),
        public readonly div = 4,
        public readonly parent: Group | null = null
    ) {
        super();
    }
    get root(): Group {
        return this.parent ? this.parent.root : this;
    }
    get dt() {
        return this.T.div(this.div);
    }
    get filled(): boolean {
        if (this.length < this.div) return false;
        const child = this.at(-1);
        if (child instanceof Group) return child.filled;
        return true;
    }
    get current(): Group | null {
        const child = this.at(-1);
        if (child instanceof Group && !child.filled) return child.current;
        if (!this.filled) return this;
        if (this.parent) return this.parent.current;
        return null;
    }
    subGroup(div: number = 2) {
        if (this.filled) throw new Error("Cannot divide a filled group");
        const g = new Group(this.dt, div, this);
        this.push(g);
        return g;
    }
    serialize(
        key: "note" | "lyric",
        delimiter: [string, string] = ["(", ")"]
    ): string {
        const [L, R] = delimiter;
        const C = this.map((item) =>
            item instanceof Group ? item.serialize(key) : item[key]
        );
        return L + C.join(" ") + R;
    }
    toString() {
        return this.serialize("note", ["", ""]);
    }
}

class NoteToken {
    static get regex() {
        return /(?<prefix>[#b]?)(?<degree>[0-7\-])(?<octave>[',]*)(?<suffix>[_=]?)(?<extend>\.?|\-*)/g;
    }
    public readonly duration: Fractional;
    constructor(public readonly raw: MatchResult) {
        const duration = new Fractional(1, this.division);
        if (raw.extend === ".") this.duration = duration.add(duration.div(2));
        else if (raw.extend.startsWith("-"))
            this.duration = duration.mul(raw.extend.length + 1);
        else this.duration = duration;
    }
    get division() {
        if (this.raw.suffix === "_") return 2;
        if (this.raw.suffix === "=") return 4;
        return 1;
    }
    get normalized() {
        return [
            this.raw.octave.replaceAll(/'/g, "^").replace(/,/g, "_"),
            this.raw.degree.replace(".", "-"),
            this.raw.prefix,
        ].join("");
    }
    get has_lyric() {
        return !"-0".includes(this.raw.degree);
    }
    get extend_lyric() {
        return this.raw.degree === "0" ? "0" : "-";
    }
    public lyric: string | undefined = undefined;
    to(group: Group, lyrics: string[]) {
        const note = this.normalized;
        let { duration } = this;
        let lyric = this.has_lyric ? (lyrics.shift() ?? "0") : "0"; // true if still need lyric
        const updateLyric = () => {
            if (lyric !== "0") lyric = this.extend_lyric;
        };
        function place() {
            let g = group.current;
            if (!g) throw new Error("Bar already filled");
            while (duration.lt(g.dt)) g = g.subGroup(2);
            g.push({ note, lyric });
            updateLyric();
            return duration.sub(g.dt);
        }
        while (duration.gt(0)) duration = place();
    }
}

type MatchResult = {
    source: string; // Full matched string
    prefix: string; // #, b, or empty
    degree: string; // 0-7 or - or .
    octave: string; // , or ' or empty
    suffix: string; // _ or = or empty
    extend: string; // . or - or empty
};

function* tokenizeLyrics(lyrics: string) {
    function next() {
        const c = lyrics.charAt(0);
        lyrics = lyrics.slice(1).trim();
        if (c === '"') {
            let end = lyrics.indexOf('"');
            if (end === -1) end = lyrics.length;
            const token = lyrics.slice(0, end);
            lyrics = lyrics.slice(end + 1).trim();
            return token;
        }
        if (c === "_") return "-";
        if (c === "*") return "0";
        return c;
    }
    while (lyrics.length > 0) yield next();
}

function* tokenizeNotes(notes: string) {
    const bars = notes
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    for (const bar of bars) {
        const notes: NoteToken[] = [];
        for (const result of bar.matchAll(NoteToken.regex)) {
            if (!result.groups) continue;
            const groups = {
                source: result[0],
                ...result.groups,
            } as MatchResult;
            groups.source = result[0];
            notes.push(new NoteToken(groups));
        }
        yield notes; // tokens in current bar
    }
}

function serializeMeta(meta: Record<string, string>) {
    const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v ?? ""}`);
    return ["---", ...lines, "---"].join("\n") + "\n";
}

export default function transform(input: string): string {
    const meta: Record<string, string> = {
        title: undefined as any as string,
        tonic: undefined as any as string,
        meter: undefined as any as string,
        tempo: undefined as any as string,
        offset: undefined as any as string,
    };
    const lines = preprocess(input);
    let content = "";
    const lyrics: string[] = [];
    for (const line of lines) {
        if (line.length === 0) continue;
        if (processMeta(line, meta)) continue;
        if (!line.startsWith("L:")) content += line;
        else lyrics.push(...tokenizeLyrics(line.slice(2).trim()));
    }
    let score = serializeMeta(meta);
    let notes_line: string[] = [];
    let lyrics_line: string[] = [];
    let counter = 0;
    for (const notes of tokenizeNotes(content)) {
        const bar = new Group();
        for (const note of notes) note.to(bar, lyrics);
        notes_line.push(bar.serialize("note", ["", ""]));
        lyrics_line.push(bar.serialize("lyric", ["", ""]));
        if (++counter < 2) continue;
        score += "\n";
        score += "| " + notes_line.join(" | ") + " |\n";
        score += "| " + lyrics_line.join(" | ") + " |\n";
        notes_line = [];
        lyrics_line = [];
        counter = 0;
    }
    if (notes_line.length > 0) {
        score += "\n";
        score += "| " + notes_line.join(" | ") + " |\n";
        score += "| " + lyrics_line.join(" | ") + " |\n";
    }
    return score;
}
