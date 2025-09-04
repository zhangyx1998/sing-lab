<!-- ---------------------------------------------------
Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
This source code is licensed under the MIT license.
You may find the full license in project root directory.
---------------------------------------------------- -->

<template>
    <div class="monitor" ref="monitor">
        <template v-if="audio.active">
            <svg :width="size.width" height="200" :viewBox="`0 0 ${size.width} 200`">
                <rect v-if="!isNaN(tone)" :x="(tone - 4) * size.width / bars.length" y="0"
                    :width="8 * size.width / bars.length" height="200" fill="#FFF4" stroke="black"
                    style="transition: all 0.1s;" />
                <rect v-for="(amp, index) in bars" :key="index" :x="(index - 0.5) * size.width / bars.length"
                    :y="-2 * amp" :width="size.width / bars.length" :height="200 + 2 * amp"
                    :fill="`hsl(${Math.max(0, -(amp + 30) * 2)}, 100%, 50%)`" />
            </svg>
        </template>
        <template v-else>
            <div style="position: absolute; display: flex;justify-content: center; align-items: center;">
                <h3 style="color: #FFFA">Click Anywhere to Start Recording</h3>
            </div>
        </template>
        <div class="monitor-title-bar">
            <p>
                <span style="display: inline-block; min-width: 2em;"> {{ volume.toFixed(0) }} dB</span>
                <span> | </span>
                <span style="display: inline-block; min-width: 2em;">{{ note }}</span>
                <span> | </span>
                <span>{{ isNaN(frequency) ? '---.--' : frequency.toFixed(2) }} Hz</span>
            </p>
            <select v-model="audio.device" name="audio-device-select">
                <option v-for="[id, label] of Object.entries(devices)" :key="id" :value="id">{{ label }}</option>
            </select>
        </div>
    </div>
</template>

<style scoped lang="scss">
.monitor {
    position: relative;
    min-height: 200px;
    font-size: 1.2rem;
    font-family: 'Cascadia Code', 'Courier New', Courier, monospace;
}

.monitor>* {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.monitor-title-bar {
    width: 100%;
    padding: 1em;
    display: flex;
    flex-direction: row;
    align-items: top;
    justify-content: space-between;
    height: auto !important;

    p {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.monitor-title-bar>p {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin: 0;
    padding: 0;
}

.monitor-title-bar>p>* {
    margin: 0 0.2em;
}

.monitor-title-bar>select {
    font-size: 0.8em;
    display: block;
    margin: 0;
    padding: 0 0.4em;
    width: 12em;
    height: 2em;
    font-family: inherit;
    background-color: #FFF1;
    border-radius: 4px;
    outline: 1px solid #ccc;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, useTemplateRef } from 'vue';
import Audio, { audio } from '@lib/audio';
import { ElementSize } from '@lib/util';
import { absolute_scale, Pitch } from '@lib/pitch';

const monitor = useTemplateRef<HTMLElement>('monitor');
const size = new ElementSize(monitor);
const devices = ref<Record<string, string>>({});

async function enumerateAudioDevices() {
    const res = devices.value = await Audio.enumerateDevices();
    const keys = Object.keys(res);
    if (!keys.includes(audio.device!)) audio.device = keys[0];
}

enumerateAudioDevices();
const enumerateTask = setInterval(enumerateAudioDevices, 1000);

const volume = ref(0.0);
const frequency = ref(NaN);
const tone = ref(NaN);
const note = ref('---');
const bars = ref<Array<number>>([]);

let flag_term = false;
onMounted(async () => {
    flag_term = false;
    for await (const { sampleRate, freq } of audio.analyze()) {
        if (flag_term) break;
        for (let i = 0; i < freq.length; i++) {
            const f = sampleRate * i / freq.length;
            if (f > 5000) break;
            bars.value[i] = Math.max(-100, freq[i]);
        }
        volume.value = Math.max(...bars.value);
        if (volume.value < -50.0) {
            tone.value = NaN;
            frequency.value = NaN;
            note.value = '---';
        } else {
            tone.value = freq.reduce((idx, value, i, arr) => value > arr[idx] ? i : idx, 0);
            frequency.value = sampleRate * tone.value / freq.length;
            const pitch = Pitch.infer({ frequency: frequency.value });
            note.value = absolute_scale.absoluteNameOf(pitch);
        }
    }
});

onUnmounted(() => {
    flag_term = true;
    clearInterval(enumerateTask);
    size.destroy();
});
</script>
