// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { reactive, computed } from "vue";
import History from "./history";
import handleInput from "./input";
import AST from "@lib/ast";
import Code, { Cursor } from "@lib/ast/code";
import { getCurrentSelection } from "@lib/util";
import { Lock, Mutex } from "@lib/lock";
import "./index.scss";

export default class Editor {
    private cursor_lock = new Mutex();
    public readonly history: History<Code>;

    #code = computed(() => this.history.current);
    get code() {
        return this.#code.value;
    }
    set code(code: Code) {
        const diff = code.source !== this.code.source;
        if (this.readonly && diff) return;
        diff ? this.history.advance(code) : this.history.mutate(code);
    }

    #ast = computed(() => this.mount(new AST(this.code)));
    get ast() {
        return this.#ast.value;
    }

    constructor(
        source: string,
        public readonly readonly = false
    ) {
        this.history = reactive(new History(new Code(source))) as History<Code>;
    }

    private mount(ast: AST): AST {
        const { el } = ast.root;
        const { cursor } = ast.code;
        const { code, history } = this;
        // Code change may be triggered by user interaction (e.g. click) on child elements.
        ast.code.addEventListener("update", (e) => {
            const { detail: next } = e as CustomEvent<Code>;
            if (!(next instanceof Code)) return;
            this.code = next;
        });
        // Implement undo/redo with [Ctrl|Cmd]-Z / [Ctrl|Cmd]-Shift-Z
        el.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                if (cursor?.length)
                    return history.mutate(
                        new Code(code.source, new Cursor(cursor.end))
                    );
                else return history.mutate(new Code(code.source, null));
            }
            if (e.key === "Tab") {
                e.preventDefault();
                return ast.autocomplete?.();
            }
            if (this.readonly) return;
            if (e.key !== "z") return;
            if (!e.ctrlKey && !e.metaKey) return;
            if (e.shiftKey) history.redo();
            else history.undo();
            e.preventDefault();
        });
        // Implement normal typing interaction
        if (!cursor) return ast;
        let composition = "";
        el.addEventListener("beforeinput", (event) => {
            const { isComposing, data } = event;
            if (isComposing) {
                composition = data ?? "";
            } else {
                handleInput(code, event);
            }
        });
        let composition_lock: Lock | null = null;
        el.addEventListener("compositionstart", () => {
            const lock = this.cursor_lock.acquire(false);
            if (!lock)
                console.warn("composition lock failed:", this.cursor_lock.lock);
            else composition_lock = lock;
        });
        el.addEventListener("compositionend", () => {
            if (!composition || !code.cursor) return;
            const { before, after } = code.cursor;
            code.update(
                before + composition + after,
                Cursor.at(before.length + composition.length)
            );
            composition = "";
            // DOM may have been mangled by IME, invalidate AST cache
            AST.registry.delete(code);
            composition_lock?.release();
        });
        return ast;
    }

    private current_selection: Partial<Selection> | null = null;
    render(target: HTMLElement | null) {
        if (!target) return;
        for (const child of target.children) target.removeChild(child);
        target.appendChild(this.ast.root.el);
        this.ast.putCursor();
        this.current_selection = getCurrentSelection();
    }

    updateCursor() {
        const { lock } = this.cursor_lock;
        if (lock) return console.log("updateCursor() blocked by", lock);
        const next_selection = getCurrentSelection();
        if (this.selectionEquals(next_selection)) return;
        const cursor = this.ast.getCursor(next_selection as Selection);
        if (Cursor.equal(cursor, this.code.cursor)) return;
        this.history.mutate(new Code(this.code.source, cursor));
    }

    selectionEquals(next_selection: Partial<Selection> | null) {
        const { current_selection } = this;
        if (current_selection === next_selection) return true;
        if (!current_selection || !next_selection) return false;
        const keys = new Set([
            ...Object.keys(current_selection),
            ...Object.keys(next_selection),
        ]) as Set<keyof Selection>;
        for (const k of keys)
            if (current_selection?.[k] !== next_selection?.[k]) return false;
        return true;
    }
}
