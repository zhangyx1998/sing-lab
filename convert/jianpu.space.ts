// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// --------------------------------------------------------
import Code from "@lib/ast/code";
import Editor from "@lib/editor";
import transform from "@lib/converter/jianpu-space";
import { watch } from "vue";
const editor = new Editor("", true);
const src = document.getElementById("src")!;
const dst = document.getElementById("dst")!;
src.addEventListener("input", () =>
    editor.history.advance(new Code(transform(src.innerText)))
);
watch(
    () => editor.ast,
    () => editor.render(dst),
    { immediate: true }
);
document.addEventListener("selectionchange", () => editor.updateCursor());
