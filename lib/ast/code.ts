// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

export default class Code {
    cursor: BoundCursor | null = null;
    constructor(
        public readonly source: string,
        cursor: Cursor | null = null
    ) {
        if (cursor) this.cursor = cursor.bind(this);
    }
    get start() {
        return 0;
    }
    get end() {
        return this.source.length;
    }
    get length() {
        return this.source.length;
    }
    segment(start: number = 0, end?: number) {
        return new Segment(this, start, end);
    }
}

export class Segment<T extends string = string> {
    static merge(...args: (Segment | null)[]) {
        const segments = args.filter(a => a instanceof Segment);
        if (segments.length === 0) throw new Error("No segments to merge");
        const code_set = new Set(segments.map(s => s.code));
        if (code_set.size !== 1) throw new Error("Cannot merge segments from different codes");
        const start = Math.min(...segments.map(s => s.start));
        const end = Math.max(...segments.map(s => s.end));
        return new Segment(segments[0].code, start, end);
    }
    toString(): T {
        return this.text;
    }
    get [Symbol.toStringTag]() {
        return `Segment ${this.start}..${this.end}: "${this.text}"`;
    }
    /**
     * Unmodified, full original source code.
     */
    get source() {
        return this.code.source;
    }
    /**
     * Slice of the original source code represented by this view.
     */
    get text(): T {
        return this.code.source.slice(this.start, this.end) as T;
    }
    /**
     * Length of current view.
     */
    get length() {
        return this.end - this.start;
    }
    /**
     * Split current view into lines (as sub-Segment).
     * Line-feeds are included if present.
     */
    get lines() {
        return this.split("\n");
    }
    /**
     * Check strict equality
     */
    is(other: Segment) {
        return (
            this.code === other.code &&
            this.start === other.start &&
            this.end === other.end
        );
    }
    /**
     * String APIs
     */
    startsWith(prefix: string, pos: number = 0) {
        return this.text.startsWith(prefix, pos);
    }
    endsWith(suffix: string, pos?: number) {
        return this.text.endsWith(suffix, pos);
    }
    includes(substring: string, pos: number = 0) {
        return this.text.includes(substring, pos);
    }
    indexOf(substring: string, pos: number = 0) {
        const index = this.text.indexOf(substring, pos);
        return index >= 0 ? this.start + index : -1;
    }
    lastIndexOf(substring: string, pos?: number) {
        const index = this.text.lastIndexOf(substring, pos);
        return index >= 0 ? this.start + index : -1;
    }
    /**
     * Split current view into sub-views.
     * Separators are dropped.
     */
    *split(sep: string | RegExp, limit: number = Infinity) {
        // Snapshot for immunity from on-the-fly mutations.
        const { start, end, source } = this;
        let next: () => [number, number];
        if (typeof sep === "string") {
            next = () => [
                source.indexOf(sep as string, left),
                (sep as string).length,
            ];
        } else {
            next = () => {
                (sep as RegExp).lastIndex = left;
                const { [0]: res = "", index = -1 } =
                    (sep as RegExp).exec(source) || {};
                return [index, res.length];
            };
        }
        let left = start,
            [right, skip] = next();
        while (right >= left && right < end && limit > 0) {
            yield new Segment(this.code, left, right);
            left = right + skip;
            [right, skip] = next();
            limit--;
        }
        // Commit all remainder text as last split, if any.
        if (left < end) {
            yield new Segment(this.code, left, end);
        }
    }
    // String APIs
    trimStart(multiline = false) {
        const count =
            this.text.match(multiline ? /^\s*/gm : /^\s*/)?.[0].length ?? 0;
        return count > 0
            ? new Segment(this.code, this.start + count, this.end)
            : this;
    }
    trimEnd(multiline = false) {
        const count =
            this.text.match(multiline ? /\s*$/gm : /\s*$/)?.[0].length ?? 0;
        return count > 0
            ? new Segment(this.code, this.start, this.end - count)
            : this;
    }
    trim(multiline = false) {
        return this.trimStart(multiline).trimEnd(multiline);
    }
    at(pos: number) {
        return this.slice(pos, pos + 1).text;
    }
    slice<P extends string>(start: number, end: number = this.length): Segment<P> {
        const { code, length } = this;
        if (start < 0) start = length + start;
        if (end < 0) end = length + end;
        if (start >= end) end = start;
        if (start < 0 || end < 0 || start > length || end > length) {
            console.log(this.text, length, [start, end]);
            throw new Error("Segment slice index out of range");
        }
        return new Segment(code, this.start + start, this.start + end);
    }
    // Merge with another segment, returning a new segment.
    // Items between the two segments are included when not forcing consecutiveness.
    merge(other: Segment, force_consecutive: boolean = false) {
        if (this.code !== other.code)
            throw new Error(
                "Cannot merge segments from different code sources"
            );
        if (
            force_consecutive &&
            (this.end !== other.start || other.end !== this.start)
        )
            throw new Error("Segments are not consecutive");
        const start = Math.min(this.start, other.start);
        const end = Math.max(this.end, other.end);
        return new Segment(this.code, start, end);
    }

    public readonly code: Code;
    public readonly start: number;
    public readonly end: number;
    constructor(
        code: Code | Segment,
        start: number | undefined = undefined,
        end: number | undefined = undefined
    ) {
        this.code = code instanceof Segment ? code.code : code;
        this.start = start ?? code.start;
        this.end = end ?? code.end;
    }
    get clone() {
        return new Segment(this.code, this.start, this.end);
    }
}

export class Cursor {
    public readonly start: number;
    public readonly end: number;
    constructor(start: number, end?: number) {
        this.start = start;
        this.end = end ?? start;
    }
    get length() {
        return this.right - this.left;
    }
    get collapsed() {
        return this.length === 0;
    }
    get left() {
        return Math.min(this.start, this.end);
    }
    get right() {
        return Math.max(this.start, this.end);
    }
    bind(code: Code) {
        return new BoundCursor(this, code);
    }
    equal(other: Cursor | null) {
        if (!other) return false;
        return this.start === other.start && this.end === other.end;
    }
}

class BoundCursor extends Cursor {
    constructor(
        cursor: Cursor,
        public readonly code: Code
    ) {
        if (code.source.length + 1 < cursor.right)
            throw new Error(
                `Cursor out of range: ${[cursor.left, cursor.right]} ${code.source.length}`
            );
        super(cursor.start, cursor.end);
    }
    get before() {
        return this.code.segment(0, this.left).text;
    }
    get selected() {
        return this.code.segment(this.left, this.right).text;
    }
    get after() {
        return this.code.segment(this.right, this.code.length).text;
    }
}
