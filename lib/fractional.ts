// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

function isInt(n: number): boolean {
    return n % 1 === 0;
}

export default class Fractional {
    public readonly dividend!: number;
    public readonly divisor!: number;
    constructor(dividend: number | Fractional, divisor: number = 1) {
        if (dividend instanceof Fractional) return dividend;
        if (!isInt(dividend) || !isInt(divisor))
            throw new Error(`Bad value for fractional: ${dividend}/${divisor}`);
        if (divisor === 0) throw new Error("Divisor cannot be zero");
        if (Math.abs(divisor) !== 1) {
            const div = gcd(Math.abs(dividend), Math.abs(divisor));
            if (div !== 1)
                [dividend, divisor] = [dividend / div, divisor / div];
        }
        const sign = Math.sign(dividend * divisor);
        [this.dividend, this.divisor] = [
            // Keep sign only in dividend
            sign * Math.abs(dividend),
            // When dividend is 0, make divisor 1
            sign === 0 ? 1 : Math.abs(divisor),
        ];
        return Object.freeze(this);
    }
    add(other: Fractional | number): Fractional {
        const that = new Fractional(other);
        return new Fractional(
            this.dividend * that.divisor + that.dividend * this.divisor,
            this.divisor * that.divisor
        );
    }
    sub(other: Fractional | number): Fractional {
        const that = new Fractional(other);
        return new Fractional(
            this.dividend * that.divisor - that.dividend * this.divisor,
            this.divisor * that.divisor
        );
    }
    mul(other: Fractional | number): Fractional {
        const that = new Fractional(other);
        return new Fractional(
            this.dividend * that.dividend,
            this.divisor * that.divisor
        );
    }
    div(other: Fractional | number): Fractional {
        const that = new Fractional(other);
        return new Fractional(
            this.dividend * that.divisor,
            this.divisor * that.dividend
        );
    }
    eq(other: Fractional | number): boolean {
        const that = new Fractional(other);
        return this.dividend === that.dividend && this.divisor === that.divisor;
    }
}
