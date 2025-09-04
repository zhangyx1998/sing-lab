// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { ref } from "vue";
import { defer, AsyncChain, cachedRef, Shared, renderTicks } from "./util";

interface AudioFrame {
    timestamp: number;
    sampleRate: number;
    buffer: Float32Array;
}

class CaptureLoop extends Shared {
    readonly chain!: AsyncChain<AudioFrame>;
    readonly worklet: AudioWorkletNode;

    constructor(
        context: AudioContext,
        stream: MediaStream,
        destroy: () => void
    ) {
        super(destroy);
        this.chain = new AsyncChain<AudioFrame>();
        this.worklet = new AudioWorkletNode(context, "echo-raw");
        this.worklet.port.onmessage = (e) => {
            const { timestamp, sampleRate, buffer } = e.data;
            (this.chain as any) = this.chain.push({
                timestamp,
                sampleRate,
                buffer,
            });
        };
        this.worklet.port.start();
        context.createMediaStreamSource(stream).connect(this.worklet);
    }

    cleanup(): void {
        this.worklet.port.close();
        this.chain.terminate();
    }

    async *[Symbol.asyncIterator]() {
        const unref = this.ref();
        try {
            yield* this.chain;
        } finally {
            unref();
        }
    }
}

interface AnalysisFrame {
    timestamp: number;
    sampleRate: number;
    wave: Float32Array;
    freq: Float32Array;
}

class AnalyzeLoop extends Shared {
    readonly chain: AsyncChain<AnalysisFrame>;
    readonly analyser: AnalyserNode;

    constructor(
        context: AudioContext,
        stream: MediaStream,
        destroy: () => void,
        fft_size: number = 8192
    ) {
        super(destroy);
        this.chain = new AsyncChain<AnalysisFrame>();
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = fft_size;
        context.createMediaStreamSource(stream).connect(this.analyser);
        let flag_term = false;
        (async () => {
            for await (const _ of renderTicks()) {
                if (flag_term) break;
                const { frequencyBinCount } = this.analyser;
                const timestamp = performance.now();
                const { sampleRate } = context;
                const wave = new Float32Array(this.analyser.fftSize);
                const freq = new Float32Array(frequencyBinCount);
                this.analyser.getFloatTimeDomainData(wave);
                this.analyser.getFloatFrequencyData(freq);
                (this.chain as any) = this.chain.push({
                    timestamp,
                    sampleRate,
                    wave,
                    freq,
                });
            }
            this.analyser.disconnect();
            this.chain.terminate();
        }).apply(this);
        this.cleanup = () => (flag_term = true);
    }

    async *[Symbol.asyncIterator]() {
        const unref = this.ref();
        try {
            yield* this.chain;
        } finally {
            unref();
        }
    }
}

export default class Audio extends AudioContext {
    static async enumerateDevices(): Promise<Record<string, string>> {
        const info_list = await navigator.mediaDevices.enumerateDevices();
        const devices = info_list.filter(({ kind }) => kind === "audioinput");
        return Object.fromEntries(
            devices.map(({ deviceId, label }, index) => [
                deviceId,
                label ?? `Microphone ${index + 1}`,
            ])
        );
    }

    #device = cachedRef<string | undefined>("audio.device", undefined);
    get device() {
        return this.#device.value;
    }
    set device(device: string | undefined) {
        const prev = this.#device.value;
        this.#device.value = device;
        if (prev !== device) this.reset();
    }

    #flag_initialized = false;
    #active = ref(false);
    get active() {
        return this.#active.value;
    }
    async activate() {
        if (this.state === "suspended") {
            this.#active.value = false;
            const { promise, resolve } = defer();
            window.addEventListener("click", resolve, { once: true });
            await promise;
            this.resume();
        }
        if (!this.#flag_initialized) {
            this.#flag_initialized = true;
            await this.audioWorklet.addModule("audio/echo-raw.js");
        }
        this.#active.value = true;
    }

    async reset() {
        const stream = await this.#stream;
        this.#stream = null;
        this.#capture_loop = null;
        this.#analyze_loop = null;
        stream?.getTracks().forEach((track) => track.stop());
    }

    #stream: Promise<MediaStream> | null = null;
    get stream() {
        if (this.#stream === null) {
            this.#stream = (async () => {
                const options: MediaStreamConstraints = this.device
                    ? {
                          audio: {
                              deviceId: { exact: this.device },
                          },
                      }
                    : { audio: true };
                return await navigator.mediaDevices.getUserMedia(options);
            })();
        }
        return this.#stream;
    }

    #capture_loop: Promise<CaptureLoop> | null = null;
    get capture_loop() {
        if (this.#capture_loop === null) {
            this.#capture_loop = (async () => {
                const stream = await this.stream;
                const destroy = () => (this.#capture_loop = null);
                return new CaptureLoop(this, stream, destroy);
            })();
        }
        return this.#capture_loop;
    }

    async *capture() {
        await this.activate();
        while (true) {
            const loop = this.capture_loop;
            if (loop === null) break;
            for await (const frame of await loop) {
                yield frame;
                if (loop !== this.capture_loop) break;
            }
        }
    }

    #analyze_loop: Promise<AnalyzeLoop> | null = null;
    get analyze_loop() {
        if (this.#analyze_loop === null) {
            this.#analyze_loop = (async () => {
                const stream = await this.stream;
                const destroy = () => (this.#analyze_loop = null);
                return new AnalyzeLoop(this, stream, destroy, 8192);
            })();
        }
        return this.#analyze_loop;
    }

    async *analyze() {
        await this.activate();
        while (true) {
            const loop = this.analyze_loop;
            for await (const frame of await loop) {
                yield frame;
                if (loop !== this.analyze_loop) break;
            }
        }
    }

    #fft_size = ref<number>(8192);
    get fft_size() {
        return this.#fft_size.value;
    }
    set fft_size(size: number) {
        this.#fft_size.value = size;
        (async () => ((await this.analyze_loop).analyser.fftSize = size))();
    }
}

// Audio input device singleton
export const audio = new Audio();
(window as any).audio = audio;
