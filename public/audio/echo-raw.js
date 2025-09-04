// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

class EchoRawAudio extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input.length > 0) {
            const samples = input[0];
            // send copy to main thread
            this.port.postMessage(samples.slice());
        }
        return true;
    }
}

registerProcessor("echo-raw", EchoRawAudio);
