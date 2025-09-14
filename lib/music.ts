// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import AST from "@lib/ast";
import type {
    Note as NoteBlock,
    Lyric as LyricBlock,
    Block,
} from "@lib/ast/syntax";
import { Group } from "@lib/ast/syntax";
import { markRaw } from "vue";
import Fractional from "./fractional";
import * as Tone from "tone";
import { defer } from "./util";

export abstract class MusicElement<T extends Block = Block> {
    constructor(
        public readonly block: T,
        public readonly t0: Fractional, // In beats
        public readonly dt: Fractional // In beats
    ) {}

    private readonly extensions: T[] = []; // Extension marks `-`
    public extend(block: T, dt: Fractional) {
        this.extensions.push(block);
        (this.dt as Fractional) = this.dt.add(dt);
    }
    public get blocks() {
        return [this.block, ...this.extensions];
    }
}

class Note extends MusicElement<NoteBlock> {
    get pitch() {
        return this.block.pitch;
    }
}

class Lyric extends MusicElement<LyricBlock> {
    get text() {
        return this.block.text;
    }
}

function* recurse<T extends Block>(
    group: Group<T>,
    t0: Fractional,
    dt: Fractional,
    count: number
): Generator<readonly [T, Fractional, Fractional]> {
    let t = t0;
    const { contents, Element } = group;
    while (contents.length < count) {
        if (contents.length === 0)
            contents.push(new Element(group.slice(0, 0), group) as T);
        else contents.push(new Element(group.slice(group.length), group) as T);
    }
    for (const child of contents.slice(0, count)) {
        if (child instanceof Group) {
            const { length } = child.contents;
            if (length <= 2)
                yield* recurse(child, t, dt.div(2), 2); // Duplet
            else yield* recurse(child, t, dt.div(3), 3); // Triplet
        } else {
            yield [child, t, dt] as const;
        }
        t = t.add(dt);
    }
    for (const child of contents.slice(count)) {
        // Invalid notes
        console.warn("Ignoring invalid element", child);
    }
}

export default class Music {
    public readonly notes: Note[] = [];
    public readonly lyrics: Lyric[] = [];
    get meta() {
        return this.ast.meta;
    }
    readonly beat_duration: number;
    constructor(public readonly ast: AST) {
        this.beat_duration = 60.0 / this.meta.tempo;
        const beats_per_bar = this.meta.meter[0];
        let t_blk = new Fractional(0),
            t_bar: Fractional,
            t_note: Fractional;
        let t_next_blk: Fractional;
        for (const { notes, lyrics } of ast.score) {
            t_bar = t_blk;
            for (const bar of notes[0] ?? []) {
                [t_note, t_bar] = [t_bar, t_bar.add(beats_per_bar)];
                for (const [block, t0, dt] of recurse(
                    bar,
                    t_note,
                    new Fractional(1),
                    ast.meta.meter[0]
                ))
                    this.notes.push(new Note(block, t0, dt));
            }
            t_next_blk = t_bar;
            t_bar = t_blk;
            for (const bar of lyrics[0] ?? []) {
                [t_note, t_bar] = [t_bar, t_bar.add(beats_per_bar)];
                for (const [block, t0, dt] of recurse(
                    bar,
                    t_note,
                    new Fractional(1),
                    ast.meta.meter[0]
                ))
                    this.lyrics.push(new Lyric(block, t0, dt));
            }
            t_blk = t_next_blk;
        }
        return markRaw(this);
    }
    pos({ t0, dt }: MusicElement) {
        const k = this.beat_duration;
        const s = t0.float * k;
        const d = dt.float * k;
        const e = s + d;
        return [s, d, e]; // [start time, end time]
    }
    async play(abort_signal?: AbortSignal) {
        await tone_started;
        const t0 = Tone.now() + 0.1;
        for (const note of this.notes) {
            if (abort_signal?.aborted) break;
            const [start, duration] = this.pos(note);
            const freq = note.pitch?.frequency;
            if (freq) sampler.triggerAttackRelease(freq, duration, t0 + start);
        }
    }
}

const tone_started = (async () => {
    const { promise, resolve } = defer<void>();
    window.addEventListener(
        "click",
        () => {
            Tone.start();
            resolve();
        },
        { once: true }
    );
    return promise;
})();

const urls = (await import("@sound-samples:piano")).default;
const sampler = new Tone.Sampler({ urls });
const reverb = new Tone.Reverb({
    decay: 2.8,
    preDelay: 0.02,
    wet: 0.18,
}).toDestination();
const eq = new Tone.EQ3({ low: -1, mid: 0, high: +0.5 }).connect(reverb);
sampler.connect(eq);
