// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { reactive, computed } from "vue";

import AST from "@lib/ast";
import Code, { Anchor, Cursor } from "@lib/ast/code";
import { crash, clamp, getCursorOffset, getCurrentSelection } from "@lib/util";
import { Hint } from "@lib/ast/syntax";
import { Lock, Mutex } from "@lib/lock";
import Debug from "@lib/util/debug";

import History from "./history";
import handleInput from "./input";
import "./style/index.scss";

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

    private readonly handleCodeUpdate: (e: Event) => any;
    constructor(
        source: string,
        public readonly readonly = false
    ) {
        this.history = reactive(new History(new Code(source))) as History<Code>;
        this.handleCodeUpdate = (e) => {
            const { detail: next } = e as CustomEvent<Code>;
            if (!(next instanceof Code)) return;
            this.code = next;
        };
    }

    private mount(ast: AST): AST {
        const { el } = ast.root;
        const { cursor } = ast.code;
        const { code, history } = this;
        if (code !== ast.code) crash("AST code outdated", this.mount);
        // Code change may be triggered by user interaction (e.g. click) on child elements.
        code.removeEventListener("update", this.handleCodeUpdate);
        code.addEventListener("update", this.handleCodeUpdate);
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
            if (this.readonly) return;
            if (e.key === "Tab") {
                e.preventDefault();
                if (ast.autocomplete) return ast.autocomplete();
                else if (code.cursor)
                    return code
                        .insert(code.cursor?.selected.start ?? 0, "    ")
                        .commit();
            }
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
            ).commit();
            composition = "";
            // DOM may have been mangled by IME, invalidate AST cache
            AST.registry.delete(code);
            composition_lock?.release();
        });
        return ast;
    }

    private current_selection: Partial<Selection> | null = null;
    render(target: HTMLElement | null) {
        for (const _ of Debug.trace(this.render, [target?.tagName]).capture()) {
            if (!target) return;
            for (const child of target.children) target.removeChild(child);
            target.appendChild(this.ast.root.el);
            this.putCursor();
            this.current_selection = getCurrentSelection();
        }
    }

    updateCursor() {
        const { lock } = this.cursor_lock;
        if (lock) return console.log("updateCursor() blocked by", lock);
        const next_selection = getCurrentSelection();
        if (this.selectionEquals(next_selection)) return;
        const cursor = this.getCursor(next_selection as Selection);
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
    /**
     * Given a DOM node and an offset within that node, find the corresponding
     * Anchor position (offset + pseudo).
     */
    getAnchor(node: Node | null, offset: number): Anchor | null {
        const { ast } = this;
        if (!node || !ast.registry.has(node)) return null;
        const { block } = ast.get(node);
        const pos = block.start + getCursorOffset(node, offset);
        const trace = Debug.trace(this.getAnchor, {
            node: node.textContent,
            offset,
            pos,
        });
        for (const $ of trace.capture()) {
            // Fast path: quick check if cursor is inside a text node
            if (
                node.nodeType === Node.TEXT_NODE &&
                offset > 0 &&
                offset < block.length
            )
                return $(new Anchor(pos));
            // Consider pseudo elements
            const nodes = ast.getNodesAt(pos);
            if (nodes.length === 0)
                crash("Expect at least one node at this position");
            console.log(
                "Nodes at position:",
                nodes.map((n) => n.textContent)
            );
            if (nodes.length === 1) return $(new Anchor(pos));
            // Found at least 2 nodes at this position, check if cursor is at boundary
            const pseudo_nodes = nodes.slice(1, -1);
            const interactive_nodes = pseudo_nodes.filter((n) =>
                Hint.isInteractive(ast.get(n).block)
            );
            const pseudo_max = interactive_nodes.length + 1;
            if (node === nodes.at(0)) return $(new Anchor(pos, 0));
            if (node === nodes.at(-1))
                return $(new Anchor(pos, pseudo_max, pseudo_max));
            // Now we are sure that cursor is at one of the middle (pseudo) nodes
            if (node.nodeType !== Node.ELEMENT_NODE)
                crash("Expect node to be the container of pseudo elements");
            const [l, r] = [
                node.childNodes[offset - 1],
                node.childNodes[offset],
            ];
            if (r === pseudo_nodes.at(0))
                // User pressed right arrow at end of left text node
                return $(new Anchor(pos, 1));
            if (l === pseudo_nodes.at(-1))
                // User pressed left arrow at start of right text node
                return $(new Anchor(pos, pseudo_max - 1, pseudo_max));
            // Count interactive pseudo elements before the cursor
            let index = 1;
            for (const n of pseudo_nodes) {
                if (n === r) break;
                if (Hint.isInteractive(ast.get(n).block)) index++;
                if (n === l) break;
            }
            return $(new Anchor(pos, index, pseudo_max));
        }
        crash("Unreachable");
    }
    /**
     * Given an Anchor position (offset + pseudo), find the corresponding
     * DOM node and offset within that node.
     */
    setAnchor(anchor: Anchor): [Node, number | null] | null {
        const { ast } = this;
        const { pos, pseudo } = anchor;
        const nodes = ast.getNodesAt(pos).filter((n) => ast.isAnchorNode(n));
        if (nodes.length === 0) return null;
        if (nodes.length === 1) {
            (anchor as any).pseudo = null;
            return [nodes[0], pos - ast.get(nodes[0]).block.start];
        }
        console.log("nodes", ...nodes);
        if (!pseudo) {
            const hint = ast.get(nodes[1]).block;
            console.log("hint", hint);
            if (Hint.isInteractive(hint)) ast.autocomplete = hint.accept;
        }
        const node = nodes.at(clamp(pseudo ?? 0, [0, nodes.length - 1]))!;
        if (node === nodes.at(0) || node === nodes.at(-1))
            return [node, pos - ast.get(node).block.start];
        return [node, null];
    }
    getCursor(selection: Selection | null) {
        if (!selection) return null;
        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
        const start = this.getAnchor(anchorNode, anchorOffset);
        if (!start) return null;
        if (anchorNode === focusNode && anchorOffset === focusOffset)
            return new Cursor(start);
        const end = this.getAnchor(focusNode, focusOffset);
        if (!end) return null;
        return new Cursor(start, end);
    }
    putCursor(selection: Selection | null = window.getSelection()) {
        const { cursor } = this.code;
        if (!cursor || !selection) return;
        selection.removeAllRanges();
        const start = this.setAnchor(cursor.start);
        if (!start) return;
        const [start_node, start_offset] = start;
        if (cursor.start.compare(cursor.end) === 0 && start_offset === null)
            return this.focusPseudo(start_node);
        if (start_offset === null) crash("Cannot select to pseudo element");
        selection.collapse(start_node, start_offset);
        // Collapsed selection
        if (cursor.start.compare(cursor.end) === 0) return;
        // Range selection
        const end = this.setAnchor(cursor.end);
        if (!end) return;
        const [end_node, end_offset] = end;
        if (end_offset === null) crash("Cannot select to pseudo element");
        selection.extend(end_node, end_offset);
    }
    focusPseudo(node: Node) {
        const el = node instanceof HTMLElement ? node : node.parentElement;
        if (!el) crash("Pseudo element has no container");
        el.setAttribute("tabindex", "-1");
        el.focus();
        if (document.activeElement !== el)
            crash("Failed to focus pseudo element");
        return;
    }
}
