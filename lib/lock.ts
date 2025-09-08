// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { nextTick } from "./util";

export class Lock extends Error {
    constructor(
        public readonly release: () => any,
        capture?: Function
    ) {
        super("Lock");
        Error.captureStackTrace?.(this, capture ?? Lock);
    }

    capture(fn: Function) {
        try {
            Error.captureStackTrace?.(this, fn);
        } catch {}
        return this;
    }

    toString() {
        return "Lock";
    }

    [Symbol.toStringTag]() {
        return "Lock";
    }
}

export class Mutex {
    static Lock = Lock;
    #lock: Lock | undefined = undefined;
    get lock() {
        return this.#lock;
    }

    #atomicAcquire() {
        const lock = new Lock(() => this.release(lock));
        this.#lock = lock;
        return lock;
    }
    async #asyncAcquire() {
        while (this.#lock) await nextTick();
        return this.#atomicAcquire().capture(this.acquire);
    }

    acquire(wait?: false): Lock | undefined;
    acquire(wait: true): Promise<Lock>;
    acquire(wait: boolean = false): Lock | undefined | Promise<Lock> {
        if (this.#lock) return wait ? this.#asyncAcquire() : undefined;
        // Acquire lock ASAP even if `wait === true`
        const lock = this.#atomicAcquire().capture(this.acquire);
        return wait ? new Promise<Lock>((r) => r(lock)) : lock;
    }

    release(lock: Lock) {
        if (this.#lock && this.#lock !== lock) {
            console.info("Active lock:", this.#lock);
            console.info("Given lock:", lock);
            throw new Error("Lock not owned by caller");
        }
        this.#lock = undefined;
    }

    forceRelease() {
        this.#lock = undefined;
    }

    *#syncGuard() {
        const lock = this.acquire();
        if (lock === undefined) throw new Error("Unable to acquire lock");
        lock.capture(this.guard);
        try {
            yield;
        } finally {
            this.release(lock);
        }
    }

    async *#asyncGuard() {
        const lock = await this.acquire(true);
        lock.capture(this.guard);
        try {
            yield;
        } finally {
            this.release(lock);
        }
    }

    guard(wait?: false): Generator<void, void, unknown>;
    guard(wait: true): AsyncGenerator<void, void, unknown>;
    guard(
        wait: boolean = false
    ): Generator<void, void, unknown> | AsyncGenerator<void, void, unknown> {
        if (wait) return this.#asyncGuard();
        else return this.#syncGuard();
    }
}
