// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { TimeRange, FreqRange, Cursor } from "@lib/ranges";
import { absolute_scale } from "./pitch";

export const cursor = new Cursor();

export const viewPortTimeRange = new TimeRange(10);
export const viewPortFreqRange = new FreqRange(
    absolute_scale.get("C3").frequency,
    absolute_scale.get("C5").frequency
);

export const recordingTimeRange = new TimeRange(0);
export const recordingFreqRange = new FreqRange(
    absolute_scale.get("C2").frequency,
    absolute_scale.get("C8").frequency
);
