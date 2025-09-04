// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { FreqRange } from "./ranges";
import linspace, { isValidNumber } from "./util";

// Supported octaves: 0 - 8, pitches: 0 - 11
export const octaves = Object.freeze(new Array(9).fill(0).map((_, i) => i));
export const pitches = Object.freeze(new Array(12).fill(0).map((_, i) => i));
const registry = new Map<string, Pitch>();

interface DeltaPitch {
    octave: number;
    pitch: number;
}

export type AnalogPitch = { frequency: number } | { fractional: number };

export class Pitch {
    get id() {
        return Pitch.id(this.octave, this.pitch);
    }
    get fractional() {
        return this.octave + this.pitch / 12;
    }
    constructor(
        public readonly octave: number,
        public readonly pitch: number,
        public readonly frequency: number = NaN
    ) {
        registry.set(this.id, this);
    }
    diff(other: Pitch | AnalogPitch): DeltaPitch {
        if (other instanceof Pitch) {
            return {
                octave: this.octave - other.octave,
                pitch: this.pitch - other.pitch,
            };
        }
        const fractional = Pitch.fractional(other);
        const octave = Math.floor(fractional + 0.5 / 12);
        const pitch = Math.floor((fractional * 12 + 0.5) % 12);
        return {
            octave: this.octave - octave,
            pitch: this.pitch - pitch,
        };
    }
    shift(delta: DeltaPitch): Pitch {
        return Pitch.get(
            this.octave + delta.octave,
            (this.pitch + delta.pitch + 12) % 12
        );
    }
    static id(octave: number, pitch: number): string {
        return `${octave}:${pitch}`;
    }
    static has(octave: number, pitch: number) {
        return registry.has(Pitch.id(octave, pitch));
    }
    static get(octave: number, pitch: number) {
        if (!Pitch.has(octave, pitch)) {
            const p = new Pitch(octave, pitch);
            (p.frequency as number) =
                A4.frequency * Math.pow(2, p.fractional - A4.fractional);
            return p;
        } else {
            return registry.get(Pitch.id(octave, pitch))!;
        }
    }
    static infer(src: AnalogPitch): Pitch {
        const fractional = Pitch.fractional(src);
        const octave = Math.floor(fractional + 0.5 / 12);
        const pitch = Math.floor((fractional * 12 + 0.5) % 12);
        return Pitch.get(octave, pitch);
    }
    static range(freq_range: FreqRange): Array<Pitch>;
    static range(src: Pitch, dst: Pitch): Array<Pitch>;
    static range(src: Pitch | FreqRange, dst?: Pitch) {
        if (src instanceof FreqRange) {
            const { lower, upper } = src;
            src = Pitch.infer({ frequency: lower });
            dst = Pitch.infer({ frequency: upper });
        }
        dst ??= src;
        return linspace(src.fractional, dst.fractional, 1 / 12).map(
            (fractional) => Pitch.infer({ fractional })
        );
    }
    static fractional(data: Pitch | AnalogPitch): number {
        if (data instanceof Pitch) return data.fractional;
        const { frequency = NaN, fractional = NaN } = data as any;
        if (isValidNumber(fractional)) return fractional;
        if (isValidNumber(frequency) && frequency > 0)
            return Math.log2(frequency / A4.frequency) + A4.fractional;
        console.warn(data);
        throw new TypeError(
            "Argument must be a Pitch, or an object with frequency or fractional property"
        );
    }
    static frequency(data: Pitch | AnalogPitch): number {
        if (data instanceof Pitch) return data.frequency;
        const { frequency = NaN, fractional = NaN } = data as any;
        if (isValidNumber(frequency) && frequency > 0) return frequency;
        if (isValidNumber(fractional))
            return Math.pow(2, fractional - A4.fractional) * A4.frequency;
        console.warn(data);
        throw new TypeError(
            "Argument must be a Pitch, or an object with frequency or fractional property"
        );
    }
}

(window as any).Pitch = Pitch;

// Using A4 (octave 4, pitch 9, frequency 440.0) as the reference pitch
const A4 = new Pitch(4, 9, 440.0);

// Prohibit direct instantiation of Pitch beyond this point
Pitch.constructor = () => {
    throw new Error("Use Pitch.get() instead of new Pitch()");
};

const NOTES = {
    ABSOLUTE:
        " C | C#,Db | D | D#,Eb | E | F | F#,Gb | G | G#,Ab | A | A#,Bb | B ",
    RELATIVE:
        " 1 | 1#,2b | 2 | 2#,3b | 3 | 4 | 4#,5b | 5 | 5#,6b | 6 | 6#,7b | 7 ",
};

function rewriteAbsoluteNoteNames(
    names: string,
    octave: number,
    omissible: boolean = false
): string[] {
    const name_list = names
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
    const res = name_list.map(
        (name) => `${name.slice(0, 1)}${octave}${name.slice(1)}`
    );
    if (omissible) res.push(...name_list);
    return res;
}

function createAbsoluteOctave(octave: number) {
    const res: [string, Pitch][] = [];
    NOTES.ABSOLUTE.trim()
        .split("|")
        .forEach((line, p) => {
            const names = rewriteAbsoluteNoteNames(line, octave, octave === 4);
            const pitch = Pitch.get(octave, p);
            for (const name of names) res.push([name, pitch]);
        });
    return res;
}

class Scale extends Map<string, Pitch> {
    public readonly pitches: Pitch[];
    constructor(...args: [name: string, pitch: Pitch][]) {
        super(args);
        this.pitches = Array.from(this.values()).sort(
            (a, b) => a.frequency - b.frequency
        );
    }
}

export interface IndexableScale {
    has(note: string): boolean;
    get(note: string): Pitch;
    absoluteNameOf(pitch: Pitch): string;
    relativeNameOf?(pitch: Pitch): string;
}

// Scale is a collection of pitches with names
export class AbsoluteScale extends Scale implements IndexableScale {
    private pitch_to_name = new Map<Pitch, string>();
    constructor(...args: [name: string, pitch: Pitch][]) {
        super(...args);
        for (const [name, pitch] of args) {
            // Map the first encountered name to the pitch
            if (!this.pitch_to_name.has(pitch))
                this.pitch_to_name.set(pitch, name);
        }
    }
    get(name: string): Pitch {
        if (!this.has(name)) throw new Error(`Pitch not found: ${name}`);
        return super.get(name)!;
    }
    absoluteNameOf(pitch: Pitch): string {
        if (!this.pitch_to_name.has(pitch)) return `${pitch.id}`;
        return this.pitch_to_name.get(pitch)!;
    }
}
// AbsoluteScale singleton
export const absolute_scale = new AbsoluteScale(
    ...octaves.map(createAbsoluteOctave).flat(1)
);
(window as any).absolute_scale = absolute_scale;

const relative_names = NOTES.RELATIVE.split("|")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((notes) => notes.split(",").map((note) => note.trim()));

export class RelativeScale implements IndexableScale {
    static parseRelativeNoteName(name: string): DeltaPitch | null {
        // Matches names like "^^1", "_2b", "3#", etc.
        let octave = 0;
        while (name.length > 0) {
            if (name[0] === "^" || name[0] === "_") {
                octave += name[0] === "^" ? 1 : -1;
                name = name.slice(1);
            } else {
                break;
            }
        }
        const pitch = relative_names.findIndex((group) => group.includes(name));
        if (pitch === -1) return null;
        return { octave, pitch };
    }
    static relativeNameOf(delta: DeltaPitch): string {
        const { octave, pitch } = delta;
        const prefix =
            octave - 4 > 0
                ? "^".repeat(octave - 4)
                : "_".repeat(Math.abs(octave - 4));
        if (!(pitch in relative_names)) return "??";
        const note = relative_names[pitch][0];
        return `${prefix}${note}`;
    }
    constructor(
        public readonly central: Pitch,
        private readonly absolute: AbsoluteScale = absolute_scale
    ) {}
    relativeNameOf(pitch: Pitch): string {
        return RelativeScale.relativeNameOf(this.central.diff(pitch));
    }
    // IndexableScale interface
    has(note: string): boolean {
        const delta = RelativeScale.parseRelativeNoteName(note);
        if (delta === null) return this.absolute.has(note);
        return true;
    }
    get(note: string): Pitch {
        const delta = RelativeScale.parseRelativeNoteName(note);
        if (delta === null) return this.absolute.get(note);
        else return this.central.shift(delta);
    }
    absoluteNameOf(pitch: Pitch): string {
        return this.absolute.absoluteNameOf(pitch);
    }
}

(window as any).RelativeScale = RelativeScale;
