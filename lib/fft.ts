// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { Sequence } from "@lib/types";

type ComplexVector = {
    R: Float32Array;
    I: Float32Array;
};

function isPowerOfTwo(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
}

export default class FFT {
    src: Sequence<number>;
    // Amplitude and Frequency
    A: Float32Array;
    F: Float32Array;

    constructor(
        src: Sequence<number>,
        private sampleRate: number
    ) {
        const N = src.length;
        if (!isPowerOfTwo(N))
            throw new Error(`Buffer length (${N}) is not a power of 2`);
        this.src = src;
        FFT.compute({
            R: Float32Array.from(src),
            I: new Float32Array(N).fill(0),
        });
        // Convert to magnitude and frequency
        this.A = new Float32Array(N / 2);
        this.F = new Float32Array(N / 2);
        const f = this.sampleRate / N;
        for (let k = 0; k < N / 2; k++) {
            const R = this.src[k * 2];
            const I = this.src[k * 2 + 1];
            this.A[k] = Math.sqrt(R * R + I * I);
            this.F[k] = k * f;
        }
    }

    findPeak(lower: number = 0.0, upper: number = Infinity) {
        let idx: number | null = null;
        for (let i = 0; i < this.A.length; i++) {
            if (this.F[i] < lower) continue;
            if (this.F[i] > upper) break;
            if (idx === null || this.A[i] > this.A[idx]) idx = i;
        }
        if (idx === null) return null;
        return { amp: this.A[idx], freq: this.F[idx] };
    }

    static compute(
        x: ComplexVector,
        offset: number = 0,
        step: number = 1
    ): void {
        const N = Math.round((x.R.length - offset) / step);
        if (N <= 1) return;
        // Even and odd parts
        FFT.compute(x, offset, step * 2);
        FFT.compute(x, offset + step, step * 2);
        // Combine results
        let i = offset,
            j = offset + step;
        for (let k = 0; k < N / 2; k++) {
            const angle = (-2 * Math.PI * k) / N;
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            const R = x.R[j] * cos - x.I[j] * sin;
            const I = x.R[j] * sin + x.I[j] * cos;
            x.R[i] = x.R[i] + R;
            x.I[i] = I;
            x.R[j] = x.R[i] - R;
            x.I[j] = -I;
            // Step forward
            i += step;
            j += step;
        }
    }
}
