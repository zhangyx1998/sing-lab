// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.

import { crash } from "@lib/util";

export default class Code extends EventTarget {
    cursor: BoundCursor | null = null;
    private initiator: WeakRef<Code>;
    constructor(
        public readonly source: string,
        cursor: Cursor | null = null,
        initiator?: WeakRef<Code>
    ) {
        super();
        if (cursor) this.cursor = cursor.bind(this);
        this.initiator = initiator ?? new WeakRef(this);
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
    update(source: string, cursor: Cursor | null = null) {
        const code = new Code(source, cursor, this.initiator);
        this.dispatchEvent(new CustomEvent("update", { detail: code }));
        return code;
    }
    insert(pos: number | null, text: string) {
        let before!: Segment, after!: Segment;
        if (pos === null) {
            const { cursor } = this;
            if (!cursor)
                crash("Code does not have an active cursor", this.insert);
            ({ before, after } = cursor);
        } else {
            [before, after] = this.segment().divide(pos);
        }
        return new Code(
            before.text + text + after.text,
            Cursor.at(before.length + text.length),
            this.initiator
        );
    }
    delete(seg: Segment | null | undefined) {
        if (!seg) return this;
        if (seg.code !== this) crash("Segment outdated", this.delete);
        return new Code(
            this.source.slice(0, seg.start) + this.source.slice(seg.end),
            Cursor.at(seg.start),
            this.initiator
        );
    }
    commit() {
        const initiator = this.initiator.deref();
        if (!initiator) crash("Code initiator has been released", this.commit);
        initiator.dispatchEvent(new CustomEvent("update", { detail: this }));
        if (initiator !== this) this.initiator = new WeakRef(initiator);
    }
}

export class Segment<T extends string = string> {
    static merge(...args: (Segment | null)[]) {
        const segments = args.filter((a) => a instanceof Segment);
        if (segments.length === 0) throw new Error("No segments to merge");
        const code_set = new Set(segments.map((s) => s.code));
        if (code_set.size !== 1)
            throw new Error("Cannot merge segments from different codes");
        const start = Math.min(...segments.map((s) => s.start));
        const end = Math.max(...segments.map((s) => s.end));
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
        if (pos < 0) pos = this.length + pos;
        return this.slice(pos, pos + 1).text;
    }
    slice<P extends string>(
        start: number,
        end: number = this.length
    ): Segment<P> {
        const { code, length } = this;
        if (start < 0) start = (length || 1) + start;
        if (end < 0) end = (length || 1) + end;
        if (start >= end) end = start;
        if (start < 0 || end < 0 || start > length || end > length) {
            throw new Error("Segment slice index out of range");
        }
        return new Segment(code, this.start + start, this.start + end);
    }
    divide(pos: number): [Segment, Segment] {
        return [this.slice(0, pos), this.slice(pos)];
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
    get focused() {
        return this.code.cursor?.intersect(this) ?? false;
    }
}
export class Anchor {
    constructor(
        public readonly pos: number,
        public readonly pseudo: number | null = null,
        public readonly pseudo_max: number | null = null,
    ) {}
    compare(other: Anchor) {
        if (this === other) return 0;
        if (this.pos < other.pos) return -1;
        if (this.pos > other.pos) return 1;
        return Math.sign((this.pseudo ?? 0) - (other.pseudo ?? 0));
    }
    toString() {
        if (this.pseudo === null) return `${this.pos}`;
        return `${this.pos}:${this.pseudo}`;
    }
}
export class Cursor {
    public readonly start: Anchor;
    public readonly end: Anchor;
    constructor(start: Anchor, end?: Anchor) {
        this.start = start;
        this.end = end ?? start;
    }
    get length() {
        return this.right.pos - this.left.pos;
    }
    get collapsed() {
        return this.length === 0;
    }
    get left() {
        return this.start.compare(this.end) <= 0 ? this.start : this.end;
    }
    get right() {
        return this.start.compare(this.end) >= 0 ? this.start : this.end;
    }
    bind(code: Code) {
        return new BoundCursor(this, code);
    }
    equal(other: Cursor | null) {
        if (!other) return false;
        return (
            this.start.compare(other.start) === 0 &&
            this.end.compare(other.end) === 0
        );
    }
    intersect(seg: Segment) {
        const { left, right } = this;
        const { start, end } = seg;
        return left.pos <= end && start <= right.pos;
    }
    move(delta_pos: number, delta_pseudo: number = 0) {
        const start = new Anchor(
            this.start.pos + delta_pos,
            this.start.pseudo !== null ? this.start.pseudo + delta_pseudo : null
        );
        if (this.start.compare(this.end) === 0) return new Cursor(start, start);
        const end = new Anchor(
            this.end.pos + delta_pos,
            this.end.pseudo !== null ? this.end.pseudo + delta_pseudo : null
        );
        return new Cursor(start, end);
    }
    toString() {
        if (this.length === 0) return `[${this.left.toString()}]`;
        return `[${this.left} - ${this.right}]`;
    }
    static fromSegment({ start, end }: Segment) {
        return new Cursor(new Anchor(start), new Anchor(end));
    }
    static at(pos: number) {
        return new Cursor(new Anchor(pos));
    }
    static equal(a: Cursor | null, b: Cursor | null) {
        if (a === b) return true;
        if (!a || !b) return false;
        return a.equal(b);
    }
}

export class BoundCursor extends Cursor {
    constructor(
        cursor: Cursor,
        public readonly code: Code,
        public readonly prev?: Cursor
    ) {
        if (code.source.length + 1 < cursor.right.pos)
            throw new Error(
                `Cursor out of range: ${[cursor.left, cursor.right]} ${code.source.length}`
            );
        super(cursor.start, cursor.end);
    }
    get before() {
        return this.code.segment(0, this.left.pos);
    }
    get selected() {
        return this.code.segment(this.left.pos, this.right.pos);
    }
    get after() {
        return this.code.segment(this.right.pos, this.code.length);
    }
}
