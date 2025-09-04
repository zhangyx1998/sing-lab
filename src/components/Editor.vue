<!-- ---------------------------------------------------
Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
This source code is licensed under the MIT license.
You may find the full license in project root directory.
---------------------------------------------------- -->

<template>
    <div class="editor" ref="editor">
    </div>
</template>

<style scoped lang="scss">
.editor>:deep(div) {
    position: absolute;
    width: 100%;
    height: 100%;
    padding: 1em;
    overflow: scroll;
    text-wrap: nowrap;
    white-space: nowrap;
    font-family: 'Cascadia Code', 'Courier New', Courier, 'Consolas', monospace;
    white-space: pre;
    caret-color: white;

    * {
        user-select: text;
    }

    &:focus-within {
        z-index: 999;
        outline: 1px solid #6AF;
    }
}
</style>

<script setup lang="ts">
import "./highlight.scss";
import AST from "@lib/ast";
import Code, { Cursor } from "@lib/ast/code";
import { ref, watch, computed, useTemplateRef, onMounted, onUnmounted } from "vue";
const editor = useTemplateRef<HTMLDivElement>('editor');
function render(container: HTMLDivElement | null, ...contents: HTMLDivElement[]) {
    if (container) {
        for (const child of Array.from(container.childNodes)) {
            container.removeChild(child);
        }
        for (const content of contents) {
            container.appendChild(content);
        }
    }
}

const code = ref(new Code(`
---
title: 永不失联的爱
tonic: Bb4
piece: 4/4
tempo: 85
offset: 0.0
---

| (0 5) (Bb5 ^2) (^3 ^1) (^1 ^7) | (6 ^2) ^2 - - |
| (0 亲) (爱 的) (你 躲) (在 哪)  | (里 发) 呆 - - |

| (0 5) (7 ^1) (^2 ^1) (7 5)   | (3 ^1) ^1 - - |
| (0 有) (什 么) (心 事) (还 无) | (法 释) 怀 - - |

| (0 5) (^1 ^2) (^3 ^1) (^1 ^7) | (6 ^2) ^2 - - |
| (0 我) (们 总) (把 人) (生 想)  | (的 太) 坏 - - |

| (0 ^1) (^2 ^1) (^2 ^1) (^2 ^1) | (^2 ^5) ^5 - (- |
| (0 像) (旁 人) (不 允) (许 我)   | (们 的) 怪 - -  |
`.trim()));
const ast = computed(() => new AST(code.value));
const selection = window.getSelection();

class History<T> extends Array<T> {
    index = 0;
    get current() {
        return this[this.index];
    }
    advance(c: T) {
        while (this.length - 1 > this.index)
            this.pop();
        super.push(c);
        this.index = this.length - 1;
        return this.current;
    }
    undo() {
        if (this.index > 0)
            this.index--;
        return this.current;
    }
    redo() {
        if (this.index < this.length - 1)
            this.index++;
        return this.current;
    }
}
const history = new History<Code>();

watch(ast, (ast) => {
    if (ast) {
        const { root: { el }, code: { cursor }, registry } = ast;
        el.addEventListener("keydown", (e) => {
            if (e.key !== 'z') return;
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            if (e.shiftKey) code.value = history.redo();
            else code.value = history.undo();
        })
        el.addEventListener("beforeinput", (e) => {
            e.preventDefault();
            console.log("Before input:", e, cursor);
            const { inputType, isComposing, data } = e;
            if (isComposing || !cursor) return;
            const { before, selected, after } = cursor;
            switch (inputType) {
                case "insertText":
                case "insertFromPaste":
                    if (data) {
                        const content = before + data + after;
                        code.value = history.advance(new Code(content, new Cursor(before.length + data.length)));
                    }
                    break;
                case "insertParagraph":
                case "insertLineBreak":
                    code.value = history.advance(new Code(before + '\n' + after, new Cursor(before.length + 1)));
                    break;
                case "deleteContentBackward":
                    if (selected.length > 0)
                        code.value = history.advance(new Code(before + after, new Cursor(before.length)));
                    else
                        code.value = history.advance(new Code(before.slice(0, -1) + after, new Cursor(before.length - 1)));
                    break;
            }
        }, { capture: true });
        render(editor.value, el);
        requestAnimationFrame(() => {
            // Restore selection
            if (!selection || !cursor) return;
            const range = new Range();
            range.setStart(el, 0);
            range.setEnd(el, 0);
            const { start, end } = cursor;
            let left = 0;
            for (const { el } of registry.values()) {
                if (!(el instanceof Text)) continue;
                let right = left + el.textContent.length;
                if (start >= left && start <= right) {
                    range.setStart(el, start - left);
                }
                if (end >= left && end <= right) {
                    range.setEnd(el, end - left);
                }
                left = right;
            }
            selection.removeAllRanges();
            selection.addRange(range);
        })
    }
}, { immediate: true });
watch(editor, el => render(el, ast.value.root.el), { immediate: true });

function updateCursor() {
    if (!selection) return;
    const cursor = ast.value.getCursor(selection);
    if (!cursor?.equal(ast.value.code.cursor))
        code.value = new Code(code.value.source, cursor);
}
onMounted(() => document.addEventListener("selectionchange", updateCursor));
onUnmounted(() => document.removeEventListener("selectionchange", updateCursor));
</script>
