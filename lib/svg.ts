// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

import { defineComponent, h } from "vue";
import { Point } from "./geometry";
import { radians } from "./util";

const { cos, sin, tan } = Math;

function cartesian(r: number, a: number) {
    return new Point(r * cos(a), r * sin(a));
}

export class Shape implements Iterable<Point> {
    [Symbol.iterator](): Iterator<Point> {
        throw new Error("Missing shape implementation");
    }

    toString() {
        let path = "";
        for (const p of this) {
            if (path.length === 0) {
                path += `M${p.x},${p.y}`;
            } else {
                path += ` L${p.x},${p.y}`;
            }
        }
        return path + " Z";
    }
}

export class StaticShape extends Shape {
    constructor(
        protected props: { size: number; angle: number; position: Point }
    ) {
        super();
    }

    static get path() {
        const cls = this as typeof StaticShape;
        return defineComponent({
            props: {
                size: { type: Number, required: true },
                angle: { type: Number, default: 0 },
                position: { type: Point, default: new Point(0, 0) },
            },
            setup(props) {
                const shape = new cls(props);
                return () => h("path", { d: shape.toString() });
            },
        });
    }
}

export class Star extends StaticShape {
    readonly ratio = 1 / cos(radians(36)) + sin(radians(36)) / tan(radians(18));
    readonly delta = radians(360 / 10);

    *[Symbol.iterator](): Iterator<Point> {
        const { size, angle, position } = this.props;
        const r0 = radians(angle);
        let a = radians(90);
        for (let i = 0; i < 5; i++) {
            yield position.add(cartesian(size, r0 + a));
            a += this.delta;
            yield position.add(cartesian(size * this.ratio, r0 + a));
            a += this.delta;
        }
    }
}

export class Arrow extends StaticShape {
    *[Symbol.iterator](): Iterator<Point> {
        const { size, angle, position } = this.props;
        yield position.add(cartesian(size * 1.0, radians(angle + 0)));
        yield position.add(cartesian(size * 0.8, radians(angle + 135)));
        yield position.add(cartesian(size * 0.2, radians(angle + 180)));
        yield position.add(cartesian(size * 0.8, radians(angle - 135)));
    }
}

export class Label extends StaticShape {
    *[Symbol.iterator](): Iterator<Point> {
        const { size, angle, position } = this.props;
        const dx = cartesian(size, radians(angle));
        const dy = cartesian(size, radians(angle + 90));
        yield position;
        yield position.add(dx.mul(-0.5)).add(dy.mul(+0.4));
        yield position.add(dx.mul(-1.0)).add(dy.mul(+0.4));
        yield position.add(dx.mul(-1.0)).add(dy.mul(-0.4));
        yield position.add(dx.mul(-0.5)).add(dy.mul(-0.4));
    }
}
