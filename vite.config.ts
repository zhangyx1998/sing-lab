// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// --------------------------------------------------------
// This is the entry point of the single page application.
// -------------------------------------------------------

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { fileURLToPath } from "url";
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..");

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    build: {
        outDir: resolve(PROJECT_ROOT, "dist"),
    },
    resolve: {
        alias: {
            "@": resolve(PROJECT_ROOT, "src"),
            "@lib": resolve(PROJECT_ROOT, "lib"),
            "@src": resolve(PROJECT_ROOT, "src"),
        },
    },
});
