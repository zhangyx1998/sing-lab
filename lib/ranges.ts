// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { ref, watch } from "vue";
import { Pitch } from "./pitch";
import { AsyncChain, renderTicks } from "./util";

type CursorMode = "PLAYBACK" | "RECORD";
type CursorTick = {
    /** Current timestamp in seconds. */
    t1: number;
    /** Previous timestamp in seconds. */
    t0: number;
    /** Duration of the tick in seconds. */
    dt: number;
};

export class Cursor {
    #mode = ref<CursorMode | null>(null);
    get mode() {
        return this.#mode.value;
    }
    get active() {
        return this.#mode.value !== null;
    }

    /** Position of the cursor in seconds. */
    #position = ref(0.0);
    get position() {
        return this.#position.value;
    }
    set position(value: number) {
        if (!this.active) return;
        this.#position.value = Math.max(0.0, value);
    }

    /** Origin timestamp of current session in milliseconds. */
    origin: number = NaN;
    /**
     * Offset of the cursor in seconds.
     * If the cursor is not active, throws an error.
     * @param ts Timestamp to calculate offset, defaults to current time.
     * @returns
     */
    getOffset(ts?: number) {
        if (isNaN(this.origin)) throw new Error("Cursor is not active");
        ts ??= performance.now();
        return (ts - this.origin) / 1000;
    }

    start(mode: CursorMode = "PLAYBACK") {
        const { active } = this;
        this.#mode.value = mode;
        if (active) return;
        const start_position = this.#position.value;
        const origin = (this.origin = performance.now());
        (async () => {
            for await (const _ of renderTicks()) {
                if (!this.active) break;
                const dt = performance.now() - origin;
                this.#position.value = start_position + dt / 1000;
            }
            this.origin = NaN;
        }).apply(this);
    }

    stop() {
        this.#mode.value = null;
    }

    readonly ticks = new AsyncChain<CursorTick>();

    constructor() {
        const self = this;
        watch(this.#position, (t1, t0) => {
            (self.ticks as any) = self.ticks.push({ t1, t0, dt: t1 - t0 });
        });
    }
}

export class TimeRange {
    #start = ref(0.0);
    #duration = ref(30.0);
    get start() {
        return this.#start.value;
    }
    set start(value: number) {
        this.#start.value = value;
    }
    get duration() {
        return this.#duration.value;
    }
    set duration(value: number) {
        this.#duration.value = Math.max(this.minDuration, value);
    }
    get end() {
        return this.#start.value + this.#duration.value;
    }
    set end(value: number) {
        this.duration = value - this.#start.value;
    }

    constructor(
        duration: number = 30.0,
        private minDuration: number = -Infinity
    ) {
        this.duration = duration;
    }
}

export class FreqRange {
    #lower = ref<number>(0.0);
    #upper = ref<number>(0.0);

    get lower() {
        return this.#lower.value;
    }
    set lower(value: number) {
        this.#lower.value = value;
        this.upper = this.upper;
    }

    get upper() {
        return this.#upper.value;
    }
    set upper(value: number) {
        this.#upper.value = Math.max(value, this.lower + this.minGap);
    }
    get freq_range() {
        return this.#upper.value - this.#lower.value;
    }

    get frac_upper() {
        return Pitch.fractional({ frequency: this.upper });
    }
    set frac_upper(fractional: number) {
        this.upper = Pitch.frequency({ fractional });
    }
    get frac_lower() {
        return Pitch.fractional({ frequency: this.lower });
    }
    set frac_lower(fractional: number) {
        this.lower = Pitch.frequency({ fractional });
    }
    get frac_range() {
        return this.frac_upper - this.frac_lower;
    }
    set frac_range(range: number) {
        this.frac_upper = this.frac_lower + range;
    }
    shift_frac(delta: number) {
        this.frac_lower += delta;
        this.frac_upper += delta;
    }

    constructor(
        lower: number = 20.0,
        upper: number = 20000.0,
        private minGap: number = 1.0
    ) {
        this.#lower.value = lower;
        this.#upper.value = upper;
    }
}
