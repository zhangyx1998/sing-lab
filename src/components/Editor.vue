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
import { onMounted, onUnmounted, useTemplateRef, watch } from "vue";

const source = `
---
title: 永不失联的爱
tonic: B4b
meter: 4/4
tempo: 85
offset: 0.0
unused: xxx
---

| ((_0# ^0b) _0) 0 0# 0b | 0 0 - - |

| (0 5) (^1 ^2) (^3 ^1) (^1 ^7) | (6 ^2) ^2 - - |
| (0 亲) (爱 的) (你 躲) (在 哪) | (里 发) 呆 - - |

| (0 5) (7 ^1) (^2 ^1) (7 5) | (3 ^1) ^1 - - |
| (0 有) (什 么) (心 事) (还 无) | (法 释) 怀 - - |

| (0 5) (^1 ^2) (^3 ^1) (^1 ^7) | (6 ^2) ^2 - - |
| (0 我) (们 总) (把 人) (生 想) | (的 太) 坏 - - |

| (0 ^1) (^2 ^1) (^2 ^1) (^2 ^1) | (^2 ^5) ^5 - - |
| (0 像) (旁 人) (不 允) (许 我) | (们 的) 怪 - - |

| (0 3) (3 4) (5 4) (3 1) | (_6 4) 4 - 0 |
| (0 每) (一 片) (与 众) (不 同) | (的 云) 彩 - - |
`;
const container = useTemplateRef<HTMLElement>("container");
const editor = new Editor(source.trim());
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
</script>
