<!-- ---------------------------------------------------
Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
This source code is licensed under the MIT license.
You may find the full license in project root directory.
---------------------------------------------------- -->

<template>
    <div class="editor" ref="container"></div>
</template>

<script setup lang="ts">
import Editor from "@lib/editor";
import Music from "@lib/music";
import { onMounted, onUnmounted, useTemplateRef, watch } from "vue";
import source from "@text:examples/永不失联的爱.smd";
const emit = defineEmits<{
    (e: "update:music", music: Music): void;
}>();
const container = useTemplateRef<HTMLElement>("container");
const editor = new Editor(source.trim() + "\n");
const updateCursor = editor.updateCursor.bind(editor);
onMounted(() => document.addEventListener("selectionchange", updateCursor));
onUnmounted(() => document.removeEventListener("selectionchange", updateCursor));
watch(
    [container, () => editor.ast],
    ([container]) => editor.render(container),
    { immediate: true }
);
watch(
    () => editor.code.cursor ?? "[--]",
    (current, previous) => console.log(
        "CURSOR %c%s%c => %c%s",
        "color: #F00",
        previous.toString().padStart(10),
        "",
        "color: #0F0",
        current.toString()
    )
)
watch(() => editor.ast, (ast) => emit("update:music", new Music(ast)), { immediate: true });
</script>
