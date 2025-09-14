// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { Plugin } from "vite";
import { existsSync, readFileSync } from "fs";

function load(path: string) {
    if (existsSync(path)) {
        const test = readFileSync(path, "utf-8");
        return `export default ${JSON.stringify(test)};`;
    } else {
        const msg = JSON.stringify(`File not found: ${path}`);
        return `throw new Error(${msg});`;
    }
}

export default function TextLoader(): Plugin {
    const prefix = "@text:";
    return {
        name: "load-samples",
        resolveId(id) {
            if (id.startsWith(prefix)) {
                return "\0" + id;
            }
        },
        load(id) {
            if (!id.startsWith("\0" + prefix)) return;
            const path = id.slice(1 + prefix.length);
            return load(path);
        },
    };
}
