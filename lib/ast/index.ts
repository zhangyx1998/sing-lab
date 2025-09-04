// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import Code, { Segment, Cursor } from "./code.ts";
import { Block, Token, Hint, TOP_LEVEL_BLOCKS } from "./syntax.ts";

export default class AST {
    static readonly registry = new WeakMap<Code, AST>();
    readonly root!: TreeNode<HTMLDivElement>;
    readonly registry = new Map<Node, TreeNode>();
    constructor(readonly code: Code) {
        if (AST.registry.has(code)) return AST.registry.get(code)!;
        AST.registry.set(code, this);
        this.root = new TreeNode.Div(null, code.segment(), {
            class: "root",
            contenteditable: true,
        });
        return this.parse();
    }
    get ctx() {
        const ctx = ParserContext.registry.get(this);
        if (!ctx) throw new Error("Code not running under parser context");
        return ctx;
    }
    public readonly meta: Record<string, Block & { val: string }> = {};
    private parse(cursor?: Segment) {
        const ctx = new ParserContext(this, cursor ?? this.code.segment(0, 0));
        this.registry.clear();
        let remainder = this.code.segment();
        match_block_loop: while (remainder.length > 0) {
            for (const BLK of TOP_LEVEL_BLOCKS) {
                const block = BLK.match(remainder);
                if (block === null) continue;
                this.root.push(parseAST.call(ctx, block, this.root));
                remainder = this.code
                    .segment(block.end, remainder.end)
                    .trimStart(true);
                continue match_block_loop;
            }
            break;
        }
        if (remainder.length > 0) {
            this.root.push(
                new TreeNode.Span(this.root, remainder, { class: "unknown" })
            );
        }
        return this;
    }
    getCursor(selection: Selection) {
        const { registry } = this;
        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
        if (!anchorNode || !registry.has(anchorNode)) return null;
        if (!focusNode || !registry.has(focusNode)) return null;
        return new Cursor(
            registry.get(anchorNode)!.segment.start + anchorOffset,
            registry.get(focusNode)!.segment.start + focusOffset
        );
    }
}

class ParserContext {
    static registry = new Map<AST, ParserContext>();
    public last_block: Segment | null = null;
    public nest: number = 0;
    constructor(
        ast: AST,
        public cursor: Segment
    ) {
        ParserContext.registry.set(ast, this);
    }
}

function parseAST(this: ParserContext, block: Block, parent: TreeNode) {
    // if (this.last_block?.is(block)) throw new Error("Endless loop detected");
    this.last_block = block;
    const node = new TreeNode.Span(parent, block);
    try {
        for (const element of block.parse()) {
            if (element instanceof Token) {
                const token = new TreeNode.Span(node, element, element.attrs);
                node.push(token);
            } else if (element instanceof Hint) {
                const hint = new TreeNode.Span(node, element, element.attrs);
                hint.el = document.createElement("span");
                hint.el.classList = ["hint", element.type]
                    .flat(Infinity)
                    .filter(Boolean)
                    .join(" ");
                hint.el.setAttribute("data-hint", element.hint);
                hint.el.setAttribute("aria-hidden", "true");
                hint.el.style.userSelect = "none";
                hint.el.contentEditable = "false";
                node.push(hint);
            } else node.push(parseAST.call(this, element, node));
        }
    } catch (error) {
        console.error("Error while parsing block:", error);
    }
    return node;
}

export abstract class TreeNode<
    T extends HTMLElement | Text = HTMLElement | Text,
> extends Array<TreeNode> {
    static Div: typeof DivNode;
    static Span: typeof SpanNode;
    static Text: typeof TextNode;

    get ast() {
        return AST.registry.get(this.code)!;
    }
    get code() {
        return this.segment.code;
    }
    get root() {
        return this.ast.root;
    }
    constructor(
        public readonly parent: TreeNode | null,
        public readonly segment: Segment | Block | Token | Hint,
        public readonly attrs: Record<string, boolean | string | string[]> = {},
        ...children: TreeNode[]
    ) {
        // Append children
        super(...children);
        // Check tree integrity
        if (parent && parent.root !== this.root)
            throw new Error("Mismatched tree root");
    }

    *walk(): Iterable<TreeNode> {
        yield this;
        for (const child of this) {
            yield* child.walk();
        }
    }

    protected element: T | null = null;
    abstract get el(): T;
    abstract set el(el: T | null);
    setElement(el: T | null) {
        const { registry } = this.ast;
        if (this.element) registry.delete(this.element);
        this.element = el;
        if (el) registry.set(el, this);
    }
}

abstract class DOMTreeNode<
    T extends HTMLElement = HTMLElement,
> extends TreeNode<T> {
    abstract tagName: string;
    get el(): T {
        if (!this.element) {
            // Create new element
            const el = document.createElement(this.tagName) as T;
            for (const [k, v] of Object.entries({
                class: (this.segment as any).type,
                ...this.attrs,
            })) {
                if (v === undefined) continue;
                else if (typeof v === "boolean") el.toggleAttribute(k, v);
                else if (Array.isArray(v)) el.setAttribute(k, v.join(" "));
                else el.setAttribute(k, v);
            }
            // Append children
            let { code, segment } = this;
            const insertions: [number, TreeNode][] = [];
            for (const [index, child] of this.entries()) {
                // Check for skipped segments
                const skipped = code.segment(
                    segment.start,
                    child.segment.start
                );
                segment = code.segment(child.segment.end, segment.end);
                if (skipped.length > 0) {
                    const node = new TreeNode.Text(this, skipped);
                    el.appendChild(node.el);
                    insertions.push([index, node]);
                }
                el.appendChild(child.el);
            }
            if (segment.length) {
                const node = new TreeNode.Text(this, segment);
                el.appendChild(node.el);
                insertions.push([this.length, node]);
            }
            // Execute insertions in reverse order to keep indices valid
            while (insertions.length > 0) {
                const [index, child] = insertions.pop()!;
                this.splice(index, 0, child);
            }
            // Use the setter to register the new element
            this.el = el;
        }
        return this.element!;
    }
    set el(el: T | null) {
        this.setElement(el);
    }
}

class DivNode extends DOMTreeNode<HTMLDivElement> {
    tagName = "div";
}
TreeNode.Div = DivNode;

class SpanNode extends DOMTreeNode<HTMLSpanElement> {
    tagName = "span";
}
TreeNode.Span = SpanNode;

class TextNode extends TreeNode<Text> {
    constructor(parent: TreeNode, segment: Segment) {
        super(parent, segment);
    }
    get el(): Text {
        if (!this.element) {
            // Use the setter to register the new element
            this.el = document.createTextNode(this.segment.text);
        }
        return this.element!;
    }
    set el(el: Text | null) {
        this.setElement(el);
    }
}
TreeNode.Text = TextNode;
