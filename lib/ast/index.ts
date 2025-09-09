// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { crash } from "@lib/util";
import Code, { Segment } from "./code.ts";
import {
    Block,
    Token,
    Hint,
    MetaCodeBlock,
    ScoreCodeBlock,
    MicroBlock,
} from "./syntax.ts";
export default class AST {
    // Global AST cache for each Code instance
    static readonly registry = new WeakMap<Code, AST>();
    // Request autocomplete when user presses Tab key
    autocomplete?: () => void;

    readonly root!: TreeNode<HTMLDivElement>;
    readonly registry = new Map<Node, TreeNode>();
    readonly meta = new MetaCodeBlock.MetaData();
    readonly score: ScoreCodeBlock[] = [];
    // Recursive descent parser
    private parsed = new WeakSet<Block>();
    parse(block: Block, parent: TreeNode) {
        if (this.parsed.has(block)) crash("Block already parsed", this.parse);
        this.parsed.add(block);
        const node = new TreeNode.Span(parent, block, block.attrs);
        try {
            for (const element of block.parse()) {
                if (element instanceof Token)
                    node.push(new TreeNode.Span(node, element, element.attrs));
                else if (element instanceof Hint)
                    node.push(createHintNode(node, element));
                else node.push(this.parse(element, node));
            }
        } catch (error) {
            console.error("Error while parsing block:", error);
        }
        return node;
    }
    constructor(readonly code: Code) {
        if (AST.registry.has(code)) return AST.registry.get(code)!;
        AST.registry.set(code, this);
        this.root = new RootNode(code.segment());
        // Parse AST
        this.registry.clear();
        let remainder = this.code.segment();
        // Make sure caret can move to the start of the document
        this.root.push(new TreeNode.Span(this.root, remainder.slice(0, 0)));
        remainder = remainder.trimStart(true);
        const block = MetaCodeBlock.match(remainder);
        if (block) {
            this.root.push(this.parse(block, this.root));
            remainder = this.code
                .segment(block.end, remainder.end)
                .trimStart(true);
        } else {
            remainder = this.code.segment();
            const hint = new Hint(
                "meta",
                remainder.slice(0, 0),
                `---\n${this.meta.preview}\n---\n`
            );
            const value = [...Object.keys(this.meta.flat)]
                .map((k) => `${k}: `)
                .join("\n");
            hint.suggest(() => code.insert(0, `---\n${value}\n---\n`).commit());
            const block = new MicroBlock([], remainder.slice(0, 0), hint);
            this.root.push(this.parse(block, this.root));
            remainder = remainder.trimStart(true);
        }
        while (remainder.length > 0) {
            const block = ScoreCodeBlock.match(remainder);
            if (block === null) break;
            this.root.push(this.parse(block, this.root));
            remainder = this.code
                .segment(block.end, remainder.end)
                .trimStart(true);
        }
        if (remainder.length > 0) {
            this.root.push(
                new TreeNode.Span(this.root, remainder, { class: "unknown" })
            );
            remainder = remainder.slice(remainder.length);
        }
        // Make sure caret can move to the end of the document
        this.root.push(new TreeNode.Span(this.root, remainder));
    }
    /**
     * Get TreeNode according to Node, errors out if not found.
     */
    get(node: Node): TreeNode {
        const tree_node = this.registry.get(node);
        if (!tree_node)
            crash("Node not found in AST registry: " + node, this.get);
        return tree_node;
    }
    // Traverse all DOM nodes, parent first
    traverse(): Iterable<Node> {
        function* traverse(node: Node): Iterable<Node> {
            yield node;
            for (const child of node.childNodes) yield* traverse(child);
        }
        return traverse(this.root.el);
    }
    // Music Parsing
    // Selection related APIs
    *textNodes() {
        for (const node of this.traverse())
            if (node.nodeType === Node.TEXT_NODE) yield node as Text;
    }
    // Selection related APIs
    getNodesAt(pos: number) {
        let p = 0;
        const parents = new Set<Node>();
        const nodes: Node[] = [];
        for (const node of this.traverse()) {
            const { start, end } = this.get(node).segment;
            if (node.nodeType === Node.TEXT_NODE) {
                if (p !== start)
                    crash(`Text continuity error ${[p, start, end]}`, this.get);
                p = end;
            }
            if (end < pos) continue;
            if (start > pos) break;
            if (node.parentNode) parents.add(node.parentNode);
            nodes.push(node);
        }
        return nodes.filter((n) => !parents.has(n));
    }
    isAnchorNode(node: Node) {
        return (
            node.nodeType === Node.TEXT_NODE ||
            Hint.isInteractive(this.get(node).segment)
        );
    }
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

abstract class DOMTreeNode<T extends HTMLElement> extends TreeNode<T> {
    abstract tagName: string;
    get el(): T {
        if (!this.element) {
            // Create new element
            const el = document.createElement(this.tagName) as T;
            for (const [k, v] of Object.entries(this.attrs)) {
                if (v === undefined) continue;
                else if (typeof v === "boolean") el.toggleAttribute(k, v);
                else if (Array.isArray(v)) el.setAttribute(k, v.join(" "));
                else el.setAttribute(k, v);
            }
            el.classList.add(
                ...[(this.segment as any).type ?? []].flat(Infinity)
            );
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
        // Apply attributes
        const element = this.element!;
        if (this.segment.focused) element.classList.add("focus");
        else element.classList.remove("focus");
        return element;
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

class TextNode extends TreeNode<Text | HTMLElement> {
    constructor(parent: TreeNode, segment: Segment) {
        super(parent, segment);
    }
    get el(): Text | HTMLElement {
        if (this.element) return this.element;
        this.el = document.createTextNode(this.segment.text);
        return this.element!;
    }
    set el(el: Text | HTMLElement | null) {
        this.setElement(el);
    }
}
TreeNode.Text = TextNode;

class RootNode extends TreeNode.Div {
    readonly attrs = { contenteditable: true, class: "editor root" };
    constructor(segment: Segment) {
        super(null, segment);
    }
}

function createHintNode(parent: TreeNode, block: Hint) {
    const { code } = block;
    const node = new TreeNode.Span(parent, block, block.attrs);
    const el = document.createElement("span");
    el.classList = ["hint", block.type]
        .flat(Infinity)
        .filter(Boolean)
        .join(" ");
    el.contentEditable = "false";
    el.style.userSelect = "none";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("data-preview", block.hint);
    const { accept } = block;
    if (accept) {
        el.classList.add("interactive");
        el.setAttribute("data-hint", "Accept Suggestion");
        el.addEventListener("click", accept);
    } else {
        el.toggleAttribute("disabled", true);
    }
    el.addEventListener("keydown", (e) => {
        e.preventDefault();
        switch (e.key) {
            case "ArrowLeft":
                return code
                    .update(code.source, code.cursor?.move(0, -1))
                    .commit();
            case "ArrowRight":
                return code
                    .update(code.source, code.cursor?.move(0, +1))
                    .commit();
            case " ":
            case "Tab":
            case "Enter":
                return accept?.();
        }
    });
    node.el = el;
    return node;
}
