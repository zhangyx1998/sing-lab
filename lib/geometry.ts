// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

export class Point {
    constructor(
        public x: number,
        public y: number
    ) {}

    get len() {
        return Math.sqrt(this.dot(this));
    }

    get values() {
        return [this.x, this.y];
    }

    zip(other: Point | number): [number, number][] {
        let values: number[];
        if (typeof other === "number") values = [other, other];
        else values = other.values;
        return this.values.map((a, i) => [a, values[i]]);
    }

    add(other: Point | number) {
        const [x, y] = this.zip(other).map(([a, b]) => a + b);
        return new Point(x, y);
    }

    sub(other: Point | number) {
        const [x, y] = this.zip(other).map(([a, b]) => a - b);
        return new Point(x, y);
    }

    eq(other: Point | number) {
        return this.zip(other).every(([a, b]) => a === b);
    }

    mul(other: Point | number) {
        const [x, y] = this.zip(other).map(([a, b]) => a * b);
        return new Point(x, y);
    }

    div(other: Point | number) {
        const [x, y] = this.zip(other).map(([a, b]) => a / b);
        return new Point(x, y);
    }

    dot(other: Point) {
        return this.mul(other).values.reduce((a, b) => a + b, 0);
    }

    det(other: Point) {
        return this.x * other.y - this.y * other.x;
    }

    angle(other: Point) {
        const dot = this.dot(other);
        const [l1, l2] = [this.len, other.len];
        if (l1 === 0 || l2 === 0) return NaN;
        const acos = Math.acos(dot / (this.len * other.len)),
            det = this.det(other);
        return det < 0 ? -acos : acos;
    }

    [Symbol.toStringTag]() {
        return `Point(${this.x}, ${this.y})`;
    }
}

export class Line {
    constructor(
        public A: Point,
        public B: Point
    ) {}

    get reverse() {
        return new Line(this.B, this.A);
    }

    eq(other: Line) {
        return this.A.eq(other.A) && this.B.eq(other.B);
    }

    get delta() {
        return this.B.sub(this.A);
    }

    angle(other: Line | Point) {
        if (other instanceof Line) other = other.delta;
        if (other instanceof Line) other = other.delta;
        return this.delta.angle(other);
    }
}
