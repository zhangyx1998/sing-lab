// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { Plugin } from "vite";
import { glob } from "glob";

function gatherSamples(dir: string) {
    const files = glob.sync(`${dir}/*.mp3`);
    const urls: Record<string, string> = {};
    for (const file of files) {
        const name = file.split("/").pop()?.replace(".mp3", "");
        if (name) urls[name.replace("s", "#")] = file.replace("public/", "/");
    }
    return urls;
}

export default function SoundSampleLoader(id: string, dir: string): Plugin {
    const resolvedVirtualModuleId = "\0" + id;
    return {
        name: id,
        resolveId(id) {
            if (id === id) {
                return resolvedVirtualModuleId;
            }
        },
        load(id) {
            if (id === resolvedVirtualModuleId) {
                return {
                    code:
                        "export default " + JSON.stringify(gatherSamples(dir)),
                };
            }
        },
    };
}
