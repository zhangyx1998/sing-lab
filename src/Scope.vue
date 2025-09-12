<!-- ---------------------------------------------------
Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
This source code is licensed under the MIT license.
You may find the full license in project root directory.
---------------------------------------------------- -->

<template>
    <div class="scope" ref="el" @wheel="handleScroll" style="outline: 0.5px solid gray;">
        <svg :width="size.width" :height="size.height" :view-box="`0 0 ${size.width} ${size.height}`">
            <!-- Pitch Bars -->
            <g class="pitch-bar" v-for="{ id, fundamental, x1, x2, y } of horizontal_lines" :key="id"
                :transform="`translate(0, ${y})`" @drag.left="dragCursor">
                <rect class="handle" :x="scale_width" :y="-vertical_step / 2" :width="w" :height="vertical_step" />
                <line :x1="x1" :x2="x2" :stroke="`#fff${fundamental ? '6' : '3'}`" stroke-width="1" />
            </g>
            <!-- Play head (cursor) -->
            <g class="play-head" :class="{ active: props.cursor.active }"
                :transform="`translate(${Pos.X(props.cursor.position)}, 0)`" style="cursor:ew-resize">
                <Label.path :size="12" :position="new Point(0, 12)" :angle="+90" v-bind="cursorElement.label" />
                <Label.path :size="12" :position="new Point(0, size.height - 12)" :angle="-90"
                    v-bind="cursorElement.label" />
                <line class="bar" :x1="0" :y1="12" :x2="0" :y2="size.height - 12" v-bind="cursorElement.line" />
                <!-- Visually Hidden Grabber -->
                <line :x1="0" :y1="0" :x2="0" :y2="size.height" v-bind="cursorElement.label" stroke-width="6"
                    stroke="transparent" />
            </g>
            <!-- Music Representation -->
            <g v-if="music">
                <g v-for="({ x1, x2, lx1, lx2, y, y1, y2, focused }, i) in displayProps(music.notes)" :key="i">
                    <rect v-if="focused" class="note" :x="x1" :width="x2 - x1" :y="y1" :height="y2 - y1" fill="#FFF2"
                        style="pointer-events: none;">
                    </rect>
                    <g v-if="y !== null">
                        <line class="note" :x1="lx1" :y1="y" :x2="lx2" :y2="y" stroke="cyan" stroke-width="4"
                            stroke-linecap="round" />
                    </g>
                </g>
            </g>
            <!-- Tone Scale Backgrounds -->
            <rect class="pitch-scale" :x="0" :y="0" :width="scale_width" :height="size.height" fill="#222" />
            <rect class="pitch-scale" :x="w" :y="0" :width="scale_width" :height="size.height" fill="#222" />
            <!-- Tone Scale -->
            <g class="pitch-scale-label" v-for="{ id, note, fundamental, x1, x2, y } of horizontal_lines" :key="id"
                :transform="`translate(0, ${y})`" @drag.left="dragCursor">
                <g v-if="(!note.endsWith('b') && !note.endsWith('#')) || fundamental">
                    <text :x="x1 - 6" font-size="14" font-weight="bold" alignment-baseline="middle" text-anchor="end"
                        :fill="`#fff${fundamental ? 'A' : '4'}`">{{ note }}</text>
                    <text :x="x2 + 6" font-size="14" font-weight="bold" alignment-baseline="middle" text-anchor="start"
                        :fill="`#fff${fundamental ? 'A' : '4'}`">{{ note }}</text>
                </g>
            </g>
        </svg>
    </div>
</template>

<style scoped lang="scss">
.scope {
    flex-grow: 1;
    position: relative;
}

.scope>* {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.pitch-bar {
    cursor: crosshair;

    .handle {
        fill: transparent;
    }

    &:hover .handle {
        fill: #FFF1;
    }
}

.pitch-scale {
    cursor: ns-resize;
}

.pitch-scale-label {
    pointer-events: none;
}

g.play-head {
    opacity: 0.6;

    &:hover {
        opacity: 0.8;
    }

    .bar {
        stroke-dasharray: 8 4;
    }

    &.active .bar,
    &:active .bar {
        stroke-dasharray: none;
    }

    &:active {
        opacity: 1.0;
    }
}
</style>

<script lang="ts" setup>
import { Pitch, AnalogPitch, AbsoluteScale, RelativeScale, absolute_scale } from '@lib/pitch';
import { Cursor, TimeRange, FreqRange } from '@lib/ranges';
import { cursor, viewPortFreqRange, viewPortTimeRange } from '@lib/store';
import { ElementSize } from '@lib/util';
import { computed, ref } from 'vue';
import { Label } from '@lib/svg';
import { Point } from '@lib/geometry';
import { RTI } from '@lib/types';
import Music, { MusicElement } from '@lib/music';

const props = defineProps({
    freeze: { type: Boolean, default: false },
    cursor: { type: Cursor, default: cursor },
    viewPortTimeRange: { type: TimeRange, default: viewPortTimeRange },
    viewPortFreqRange: { type: FreqRange, default: viewPortFreqRange },
    scale: {
        type: [AbsoluteScale, RelativeScale],
        default: absolute_scale,
    },
    music: {
        type: Music,
        optional: true,
        default: null,
    },
    // bps: { type: Number, default: 120 },
    // tempo: { type: String, default: '4/4' },
    /** Real-time input monitor */
    rti: { type: RTI, optional: true },
});

const el = ref<HTMLElement | null>(null);
const size = new ElementSize(el);
const scale_width = 32; // pixels

// const h = computed(() => size.height);
const w = computed(() => Math.max(0.0, size.width - scale_width));
const vertical_step = computed(() => size.height / (props.viewPortFreqRange.frac_range * 12))

class Pos {
    static X(t1: number, t0: number = 0.0): number {
        const range = props.viewPortTimeRange;
        const k = (size.width - 2 * scale_width) / range.duration;
        return (t1 - t0 - range.start) * k + scale_width;
    }
    static Y(f1: Pitch | AnalogPitch, f0: Pitch | AnalogPitch = { fractional: 0.0 }): number {
        const range = props.viewPortFreqRange;
        const k = size.height / range.frac_range;
        return size.height - (Pitch.fractional(f1) - Pitch.fractional(f0) - range.frac_lower) * k;
    }
}

function isFundamentalPitch(pitch: Pitch) {
    const { scale } = props;
    if (scale instanceof RelativeScale) {
        return scale.central.diff(pitch).pitch === 0;
    } else {
        return pitch.pitch === 0;
    }
}

function handleScroll(event: WheelEvent) {
    if (props.freeze) return;
    const { deltaX: dX, deltaY: dY, ctrlKey, metaKey, shiftKey, altKey } = event;
    if (ctrlKey || metaKey) {
        if (!shiftKey) {
            // Zoom Horizontally (time domain)
            const kf = Math.pow(2, (dX || dY) / size.height);
            props.viewPortFreqRange.frac_range *= kf;
        }
        if (!altKey) {
            // Zoom Vertically (frequency domain)
            const kt = Math.pow(2, (dY || dX) / size.width);
            props.viewPortTimeRange.duration *= kt;
        }
    } else {
        // Pan X and Y
        const dt = props.viewPortTimeRange.duration * dX / size.width;
        const df = props.viewPortFreqRange.frac_range * -dY / size.height;
        props.viewPortTimeRange.start += dt;
        props.viewPortFreqRange.shift_frac(Math.min(df));
    }
}

function dragCursor(event: DragEvent) {
    if (props.freeze) return;
    event.preventDefault();
    const rect = (el.value as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left - scale_width;
    const t = props.viewPortTimeRange.start + (x / (size.width - 2 * scale_width)) * props.viewPortTimeRange.duration;
    props.cursor.position = Math.max(props.viewPortTimeRange.start, Math.min(props.viewPortTimeRange.end, t));
}

const cursorElement = computed(() => {
    return {
        label: {
            fill: props.cursor.active ? '#600' : '#222',
            stroke: props.cursor.active ? '#F00' : '#AAA',
        },
        line: {
            stroke: props.cursor.active ? '#F00' : '#AAA',
        }
    }
});

const horizontal_lines = computed(() => Pitch.range(props.viewPortFreqRange).filter(pitch => absolute_scale.pitches.includes(pitch)).map(pitch => {
    const res = {
        id: pitch.id,
        note: props.scale.absoluteNameOf(pitch),
        fundamental: isFundamentalPitch(pitch),
        x1: scale_width,
        x2: size.width - scale_width,
        y: Pos.Y(pitch),
        pitch: Pitch.fractional(pitch),
    };
    return res;
}))

function displayProps<T extends MusicElement & { pitch?: Pitch | null }>(arr: T[], w: number = 4) {
    const top = Pos.Y({ fractional: props.viewPortFreqRange.frac_upper });
    const bottom = Pos.Y({ fractional: props.viewPortFreqRange.frac_lower });
    return arr.map(el => {
        const [s, e] = props.music.pos(el);
        const y = el.pitch && Pos.Y(el.pitch);
        const [x1, x2] = [Pos.X(s), Pos.X(e)];
        return {
            ...el,
            x1,
            x2,
            lx1: Math.min(x1 + w / 2, (x1 + x2) / 2),
            lx2: Math.max(x2 - w / 2, (x1 + x2) / 2),
            y: y ?? null,
            y1: top,
            y2: bottom,
            focused: el.block.focused
        }
    });
}
</script>
