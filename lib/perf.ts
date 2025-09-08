// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

const GC = new FinalizationRegistry<string>((heldValue) => {
    console.log("Object was collected:", heldValue);
});

export function trackGC(obj: object, name: string) {
    GC.register(obj, name);
}
