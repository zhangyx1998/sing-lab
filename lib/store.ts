// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { TimeRange, FreqRange, Cursor } from "@lib/ranges";
import { Pitch } from "./pitch";

export const cursor = new Cursor();

export const viewPortTimeRange = new TimeRange(30);
export const viewPortFreqRange = new FreqRange(
    Pitch.get(2, 6).frequency,
    Pitch.get(5, 6).frequency
);

export const recordingTimeRange = new TimeRange(0);
export const recordingFreqRange = new FreqRange(
    Pitch.get(2, 6).frequency,
    Pitch.get(5, 6).frequency
);
