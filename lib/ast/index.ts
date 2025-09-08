// ------------------------------------------------------
// Copyright (c) 2025 Yuxuan Zhang, sing-lab@z-yx.cc
// This source code is licensed under the MIT license.
// You may find the full license in project root directory.
// -------------------------------------------------------
import { crash, clamp, getCursorOffset } from "@lib/util.ts";
import Code, { Segment, Anchor, Cursor } from "./code.ts";
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
            hint.suggest(() => code.insert(0, `---\n${value}\n---\n`));
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
            nodes.push(node);
        }
        return nodes;
    }
    isAnchorNode(node: Node) {
        return (
            node.nodeType === Node.TEXT_NODE ||
            Hint.isInteractive(this.get(node).segment)
        );
    }
    /**
     * Given a DOM node and an offset within that node, find the corresponding
     * Anchor position (offset + pseudo).
     */
    getAnchor(node: Node | null, offset: number): Anchor | null {
        if (!node || !this.registry.has(node)) return null;
        const block = this.get(node);
        const pos = block.segment.start + getCursorOffset(node, offset);
        if (node.nodeType === Node.ELEMENT_NODE) {
            const [left, right] = [
                node.childNodes[offset - 1],
                node.childNodes[offset],
            ];
            if (this.registry.get(left)?.segment instanceof Hint) node = left;
            else if (this.registry.get(right)?.segment instanceof Hint)
                node = right;
            else crash("Cursor at non-anchor element node");
            offset = 0;
        }
        // Fast path: quick check if cursor is inside a text node
        if (offset > 0 && offset < block.segment.length)
            // Cursor is inside a text node (not at boundary)
            return new Anchor(pos);
        // Cursor is at the boundary of a text node
        // May need to consider pseudo elements
        const nodes = this.getNodesAt(pos).filter((n) => this.isAnchorNode(n));
        console.log({ offset }, ...nodes);
        if (nodes.length === 0)
            crash("Expect at least one node at this position");
        if (nodes.length === 1) return new Anchor(pos);
        // Found at least 2 nodes at this position
        if (!nodes.includes(node)) crash("Node not found at this position");
        const index = nodes.indexOf(node);
        if (index < 0) return new Anchor(pos + index);
        if (index >= nodes.length)
            return new Anchor(pos + index - nodes.length + 1);
        return new Anchor(pos, index);
    }
    /**
     * Given an Anchor position (offset + pseudo), find the corresponding
     * DOM node and offset within that node.
     */
    setAnchor(anchor: Anchor): [Node, number | null] | null {
        // delete this.autocomplete;
        const { pos, pseudo } = anchor;
        const nodes = this.getNodesAt(pos).filter((n) => this.isAnchorNode(n));
        if (nodes.length === 0) return null;
        if (nodes.length === 1) {
            (anchor as any).pseudo = null;
            return [nodes[0], pos - this.get(nodes[0]).segment.start];
        }
        console.log("nodes", ...nodes);
        if (!pseudo) {
            const hint = this.get(nodes[1]).segment;
            console.log("hint", hint);
            if (Hint.isInteractive(hint)) this.autocomplete = hint.accept;
        }
        const node = nodes.at(clamp(pseudo ?? 0, [0, nodes.length - 1]))!;
        if (node === nodes.at(0) || node === nodes.at(-1))
            return [node, pos - this.get(node).segment.start];
        return [node, null];
    }
    getCursor(selection: Selection | null) {
        if (!selection) return null;
        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
        const start = this.getAnchor(anchorNode, anchorOffset);
        if (!start) return null;
        const end = this.getAnchor(focusNode, focusOffset);
        if (!end) return null;
        return new Cursor(start, end);
    }
    putCursor(selection: Selection | null = window.getSelection()) {
        const { cursor } = this.code;
        if (!cursor || !selection) return;
        selection.removeAllRanges();
        const start = this.setAnchor(cursor.start);
        if (!start) return;
        const [start_node, start_offset] = start;
        if (cursor.start.compare(cursor.end) === 0 && start_offset === null)
            return this.focusPseudo(start_node);
        if (start_offset === null) crash("Cannot select to pseudo element");
        selection.collapse(start_node, start_offset);
        // Collapsed selection
        if (cursor.start.compare(cursor.end) === 0) return;
        // Range selection
        const end = this.setAnchor(cursor.end);
        if (!end) return;
        const [end_node, end_offset] = end;
        if (end_offset === null) crash("Cannot select to pseudo element");
        selection.extend(end_node, end_offset);
    }
    focusPseudo(node: Node) {
        const el = node instanceof HTMLElement ? node : node.parentElement;
        if (!el) crash("Pseudo element has no container");
        el.setAttribute("tabindex", "-1");
        el.focus();
        if (document.activeElement !== el)
            crash("Failed to focus pseudo element");
        return;
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
                return code.update(code.source, code.cursor?.move(0, -1));
            case "ArrowRight":
                return code.update(code.source, code.cursor?.move(0, +1));
            case " ":
            case "Tab":
            case "Enter":
                return accept?.();
        }
    });
    node.el = el;
    return node;
}
