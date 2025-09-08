// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { crash } from "@lib/util";

export default class History<T> extends Array<T> {
    private index: number;
    get current() {
        return this[this.index];
    }
    constructor(...initial: T[]) {
        super(...initial);
        if (this.length === 0)
            crash("History requires at least one initial state", History);
        this.index = this.length - 1;
    }
    mutate(c: T) {
        // Replace current with c without popping future states
        this[this.index] = c;
    }
    advance(c: T) {
        while (this.length > this.index + 1) this.pop();
        this.push(c);
        this.index++;
    }
    undo() {
        if (this.index > 0) this.index--;
    }
    redo() {
        if (this.index < this.length - 1) this.index++;
    }
}
