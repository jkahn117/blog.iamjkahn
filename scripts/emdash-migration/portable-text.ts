import { toHtml } from "hast-util-to-html";
import type {
  Definition,
  FootnoteDefinition,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
} from "mdast";
import { toHast } from "mdast-util-to-hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  MigrationIssue,
  PortableTextBlock,
  PortableTextMarkDef,
  PortableTextSpan,
} from "./types.ts";

type ConversionResult = {
  blocks: PortableTextBlock[];
  issues: MigrationIssue[];
};

type InlineResult = {
  spans: PortableTextSpan[];
  markDefs: PortableTextMarkDef[];
};

type Context = {
  source: string;
  root: Root;
  sourcePath: string;
  definitions: Map<string, Definition>;
  issues: MigrationIssue[];
  nextKey: () => string;
};

export function markdownToPortableText(
  source: string,
  sourcePath = "<markdown>",
): ConversionResult {
  const root = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  let keyIndex = 0;
  const context: Context = {
    source,
    root,
    sourcePath,
    definitions: new Map(
      root.children
        .filter((node): node is Definition => node.type === "definition")
        .map((definition) => [definition.identifier.toLowerCase(), definition]),
    ),
    issues: [],
    nextKey: () => `m${(keyIndex++).toString(36)}`,
  };

  const blocks = convertNodes(root.children, context);
  return { blocks, issues: context.issues };
}

export function collectMarkdownAssetReferences(source: string): string[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  const definitions = new Map(
    root.children
      .filter((node): node is Definition => node.type === "definition")
      .map((definition) => [definition.identifier.toLowerCase(), definition]),
  );
  const references = new Set<string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "code" || record.type === "inlineCode") return;
    if (record.type === "image" && typeof record.url === "string") {
      references.add(record.url);
    } else if (
      record.type === "imageReference" &&
      typeof record.identifier === "string"
    ) {
      const definition = definitions.get(record.identifier.toLowerCase());
      if (definition) references.add(definition.url);
    } else if (record.type === "html" && typeof record.value === "string") {
      const htmlImages = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
      for (const match of record.value.matchAll(htmlImages))
        references.add(match[1]!);
    }
    if (Array.isArray(record.children)) {
      for (const child of record.children) visit(child);
    }
  };

  visit(root);
  return [...references].sort();
}

function convertNodes(
  nodes: RootContent[],
  context: Context,
): PortableTextBlock[] {
  const blocks: PortableTextBlock[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    if (node.type === "html") {
      let depth = divBalance(node.value);
      if (depth > 0) {
        const group: RootContent[] = [node];
        while (depth > 0 && index + 1 < nodes.length) {
          const next = nodes[++index]!;
          group.push(next);
          depth += nestedDivBalance(next);
        }
        if (depth !== 0) {
          context.issues.push({
            severity: "error",
            code: "UNBALANCED_HTML",
            message: "HTML div wrapper has no matching closing tag.",
            sourcePath: context.sourcePath,
          });
        }
        blocks.push(
          htmlFallback(
            { type: "blockquote", children: [] },
            context,
            "HTML_WRAPPER",
          ),
        );
        blocks[blocks.length - 1]!.html = toHtml(
          toHast(
            { type: "root", children: group },
            { allowDangerousHtml: true },
          ),
          { allowDangerousHtml: true },
        );
        continue;
      }
    }
    blocks.push(...convertBlock(node, context));
  }
  return blocks;
}

function nestedDivBalance(node: RootContent): number {
  if (node.type === "html") return divBalance(node.value);
  if ("children" in node)
    return node.children.reduce(
      (count, child) => count + nestedDivBalance(child as RootContent),
      0,
    );
  return 0;
}

function divBalance(html: string): number {
  return [...html.matchAll(/<\/?div\b[^>]*>/gi)].reduce(
    (count, match) => count + (match[0].startsWith("</") ? -1 : 1),
    0,
  );
}

function convertBlock(
  node: RootContent,
  context: Context,
): PortableTextBlock[] {
  switch (node.type) {
    case "paragraph":
      return convertParagraph(node.children, context);
    case "heading": {
      if (needsHtmlInline(node.children))
        return [htmlFallback(node, context, "COMPLEX_HEADING")];
      const inline = convertInline(node.children, context);
      return [textBlock(`h${node.depth}`, inline, context)];
    }
    case "blockquote":
      if (
        node.children.some(
          (child) =>
            child.type !== "paragraph" || needsHtmlInline(child.children),
        )
      ) {
        return [htmlFallback(node, context, "COMPLEX_BLOCKQUOTE")];
      }
      return node.children.flatMap((child) =>
        convertBlockquoteChild(child, context),
      );
    case "list":
      if (hasComplexListItem(node))
        return [htmlFallback(node, context, "COMPLEX_LIST_ITEM")];
      return convertList(node, context, 1);
    case "code":
      return [
        {
          _type: "code",
          _key: context.nextKey(),
          code: node.value,
          ...(node.lang ? { language: node.lang } : {}),
          ...(node.meta ? { migrationFenceMeta: node.meta } : {}),
        },
      ];
    case "html":
      context.issues.push({
        severity: "warning",
        code: "HTML_BLOCK",
        message:
          "Converted raw HTML to an EmDash htmlBlock. Review its sanitized rendering.",
        sourcePath: context.sourcePath,
      });
      return [
        {
          _type: "htmlBlock",
          _key: context.nextKey(),
          html: node.value,
          isolated: false,
        },
      ];
    case "table":
      if (
        node.children.some((row) =>
          row.children.some((cell) => needsHtmlInline(cell.children)),
        )
      )
        return [htmlFallback(node, context, "COMPLEX_TABLE")];
      return [convertTable(node, context)];
    case "thematicBreak":
      return [
        {
          _type: "htmlBlock",
          _key: context.nextKey(),
          html: "<hr>",
          isolated: false,
        },
      ];
    case "footnoteDefinition":
      return convertFootnoteDefinition(node, context);
    case "definition":
      return [];
    default:
      context.issues.push({
        severity: "error",
        code: "UNSUPPORTED_BLOCK",
        message: `Unsupported Markdown block: ${node.type}`,
        sourcePath: context.sourcePath,
      });
      return [];
  }
}

function convertParagraph(
  children: PhrasingContent[],
  context: Context,
): PortableTextBlock[] {
  if (
    containsInlineHtml(children) ||
    children.some(
      (child) =>
        "children" in child &&
        child.children.some(
          (nested) =>
            nested.type === "image" || nested.type === "imageReference",
        ),
    )
  ) {
    return [
      htmlFallback({ type: "paragraph", children }, context, "INLINE_HTML"),
    ];
  }
  const blocks: PortableTextBlock[] = [];
  let inlineNodes: PhrasingContent[] = [];

  const flushInline = () => {
    if (inlineNodes.length === 0) return;
    blocks.push(
      textBlock("normal", convertInline(inlineNodes, context), context),
    );
    inlineNodes = [];
  };

  for (const child of children) {
    if (child.type === "image") {
      flushInline();
      blocks.push(imageBlock(child.url, child.alt ?? "", child.title, context));
    } else if (child.type === "imageReference") {
      flushInline();
      const definition = context.definitions.get(
        child.identifier.toLowerCase(),
      );
      if (definition) {
        blocks.push(
          imageBlock(
            definition.url,
            child.alt ?? "",
            definition.title,
            context,
          ),
        );
      } else {
        context.issues.push({
          severity: "error",
          code: "MISSING_IMAGE_DEFINITION",
          message: `Missing image definition: ${child.identifier}`,
          sourcePath: context.sourcePath,
        });
      }
    } else {
      inlineNodes.push(child);
    }
  }
  flushInline();
  return blocks;
}

function convertBlockquoteChild(
  node: RootContent,
  context: Context,
): PortableTextBlock[] {
  if (node.type === "paragraph") {
    return [
      textBlock("blockquote", convertInline(node.children, context), context),
    ];
  }

  context.issues.push({
    severity: "warning",
    code: "COMPLEX_BLOCKQUOTE",
    message: `A ${node.type} inside a blockquote was converted without the quote wrapper.`,
    sourcePath: context.sourcePath,
  });
  return convertBlock(node, context);
}

function convertList(
  node: List,
  context: Context,
  level: number,
): PortableTextBlock[] {
  const listItem = node.ordered ? "number" : "bullet";
  const listId = context.nextKey();
  const blocks: PortableTextBlock[] = [];

  node.children.forEach((item) => {
    blocks.push(
      ...convertListItem(
        item,
        context,
        level,
        listItem,
        node.start ?? 1,
        listId,
      ),
    );
  });

  return blocks;
}

function convertListItem(
  item: ListItem,
  context: Context,
  level: number,
  listItem: "bullet" | "number",
  start: number,
  listId: string,
): PortableTextBlock[] {
  const blocks: PortableTextBlock[] = [];
  let emittedPrimary = false;

  for (const child of item.children) {
    if (child.type === "paragraph") {
      const inline = convertInline(child.children, context);
      if (!emittedPrimary) {
        blocks.push({
          ...textBlock("normal", inline, context),
          listItem,
          level,
          ...(listItem === "number" ? { listStart: start, listId } : {}),
        });
        emittedPrimary = true;
      } else {
        blocks.push(textBlock("normal", inline, context));
      }
    } else if (child.type === "list") {
      blocks.push(...convertList(child, context, level + 1));
    } else {
      context.issues.push({
        severity: "warning",
        code: "COMPLEX_LIST_ITEM",
        message: `A ${child.type} inside a list item was converted as a separate block.`,
        sourcePath: context.sourcePath,
      });
      blocks.push(...convertBlock(child, context));
    }
  }

  return blocks;
}

function convertInline(
  children: PhrasingContent[],
  context: Context,
): InlineResult {
  const spans: PortableTextSpan[] = [];
  const markDefs: PortableTextMarkDef[] = [];

  const append = (text: string, marks: string[] = []) => {
    if (!text) return;
    const previous = spans.at(-1);
    if (previous && sameMarks(previous.marks, marks)) {
      previous.text += text;
      return;
    }
    spans.push({
      _type: "span",
      _key: context.nextKey(),
      text,
      ...(marks.length > 0 ? { marks } : {}),
    });
  };

  const walk = (nodes: PhrasingContent[], activeMarks: string[] = []) => {
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          append(node.value.replace(/\r?\n/g, " "), activeMarks);
          break;
        case "strong":
          walk(node.children, [...activeMarks, "strong"]);
          break;
        case "emphasis":
          walk(node.children, [...activeMarks, "em"]);
          break;
        case "delete":
          walk(node.children, [...activeMarks, "strike-through"]);
          break;
        case "inlineCode":
          append(node.value, [...activeMarks, "code"]);
          break;
        case "break":
          append("\n", activeMarks);
          break;
        case "link": {
          const key = context.nextKey();
          markDefs.push({ _type: "link", _key: key, href: node.url });
          walk(node.children, [...activeMarks, key]);
          break;
        }
        case "linkReference": {
          const definition = context.definitions.get(
            node.identifier.toLowerCase(),
          );
          if (!definition) {
            append(
              `[${inlineText(node.children)}][${node.label ?? node.identifier}]`,
              activeMarks,
            );
            context.issues.push({
              severity: "error",
              code: "MISSING_LINK_DEFINITION",
              message: `Missing link definition: ${node.identifier}`,
              sourcePath: context.sourcePath,
            });
            break;
          }
          const key = context.nextKey();
          markDefs.push({ _type: "link", _key: key, href: definition.url });
          walk(node.children, [...activeMarks, key]);
          break;
        }
        case "image":
          append(
            node.alt ? `[${node.alt}](${node.url})` : node.url,
            activeMarks,
          );
          context.issues.push({
            severity: "warning",
            code: "INLINE_IMAGE",
            message:
              "An inline image was preserved as linked text because Portable Text images are block-level.",
            sourcePath: context.sourcePath,
          });
          break;
        case "imageReference": {
          const definition = context.definitions.get(
            node.identifier.toLowerCase(),
          );
          const url = definition?.url ?? node.identifier;
          append(node.alt ? `[${node.alt}](${url})` : url, activeMarks);
          context.issues.push({
            severity: definition ? "warning" : "error",
            code: definition
              ? "INLINE_IMAGE_REFERENCE"
              : "MISSING_IMAGE_DEFINITION",
            message: definition
              ? "An inline image reference was preserved as linked text."
              : `Missing image definition: ${node.identifier}`,
            sourcePath: context.sourcePath,
          });
          break;
        }
        case "footnoteReference": {
          const key = context.nextKey();
          markDefs.push({
            _type: "link",
            _key: key,
            href: `#fn-${encodeURIComponent(node.identifier)}`,
          });
          append(`[${node.label ?? node.identifier}]`, [
            ...activeMarks,
            "superscript",
            key,
          ]);
          break;
        }
        case "html":
          append(node.value, activeMarks);
          context.issues.push({
            severity: "warning",
            code: "INLINE_HTML",
            message:
              "Inline HTML was preserved as literal text. Review the converted article.",
            sourcePath: context.sourcePath,
          });
          break;
        default:
          context.issues.push({
            severity: "error",
            code: "UNSUPPORTED_INLINE",
            message: `Unsupported inline Markdown: ${(node as { type: string }).type}`,
            sourcePath: context.sourcePath,
          });
      }
    }
  };

  walk(children);
  if (spans.length === 0) append("");
  return { spans, markDefs };
}

function textBlock(
  style: string,
  inline: InlineResult,
  context: Context,
): PortableTextBlock {
  return {
    _type: "block",
    _key: context.nextKey(),
    style,
    children:
      inline.spans.length > 0
        ? inline.spans
        : [{ _type: "span", _key: context.nextKey(), text: "" }],
    ...(inline.markDefs.length > 0 ? { markDefs: inline.markDefs } : {}),
  };
}

function imageBlock(
  url: string,
  alt: string,
  title: string | null | undefined,
  context: Context,
): PortableTextBlock {
  return {
    _type: "image",
    _key: context.nextKey(),
    asset: { url },
    ...(alt ? { alt } : {}),
    ...(title ? { title } : {}),
  };
}

function convertTable(table: Table, context: Context): PortableTextBlock {
  return {
    _type: "table",
    _key: context.nextKey(),
    hasHeaderRow: true,
    rows: table.children.map((row, rowIndex) => ({
      _type: "tableRow",
      _key: context.nextKey(),
      cells: row.children.map((cell, columnIndex) => ({
        ...convertTableCell(cell, rowIndex === 0, context),
        ...(table.align?.[columnIndex]
          ? { textAlign: table.align[columnIndex] }
          : {}),
      })),
    })),
  };
}

function convertTableCell(
  cell: TableCell,
  isHeader: boolean,
  context: Context,
): Record<string, unknown> {
  const inline = convertInline(cell.children, context);
  return {
    _type: "tableCell",
    _key: context.nextKey(),
    content: inline.spans,
    ...(inline.markDefs.length > 0 ? { markDefs: inline.markDefs } : {}),
    ...(isHeader ? { isHeader: true } : {}),
  };
}

function convertFootnoteDefinition(
  node: FootnoteDefinition,
  context: Context,
): PortableTextBlock[] {
  const tree: Root = {
    type: "root",
    children: [...node.children, ...context.definitions.values()],
  };
  const body = toHtml(toHast(tree, { allowDangerousHtml: true }), {
    allowDangerousHtml: true,
  });
  context.issues.push({
    severity: "warning",
    code: "FOOTNOTE",
    message:
      "Footnote definition preserved as HTML with a matching reference anchor. Review editor round trips.",
    sourcePath: context.sourcePath,
  });
  return [
    {
      _type: "htmlBlock",
      _key: context.nextKey(),
      html: `<div id="fn-${encodeURIComponent(node.identifier)}"><sup>${escapeHtml(node.label ?? node.identifier)}</sup>${body}</div>`,
      isolated: false,
    },
  ];
}

function hasComplexListItem(list: List): boolean {
  return list.children.some(
    (item) =>
      item.checked != null ||
      item.children.filter((child) => child.type === "paragraph").length !==
        1 ||
      item.children.some((child) =>
        child.type === "list"
          ? hasComplexListItem(child)
          : child.type !== "paragraph" || needsHtmlInline(child.children),
      ),
  );
}

function needsHtmlInline(children: PhrasingContent[]): boolean {
  return children.some(
    (node) =>
      node.type === "image" ||
      node.type === "imageReference" ||
      node.type === "html" ||
      ("children" in node && needsHtmlInline(node.children)),
  );
}

function containsInlineHtml(children: PhrasingContent[]): boolean {
  return children.some(
    (node) =>
      node.type === "html" ||
      ("children" in node && containsInlineHtml(node.children)),
  );
}

function htmlFallback(
  node: RootContent,
  context: Context,
  code: string,
): PortableTextBlock {
  const tree: Root = {
    type: "root",
    children: [node, ...context.definitions.values()],
  };
  context.issues.push({
    severity: "warning",
    code,
    message:
      "Preserved exceptional Markdown as an HTML block rather than flattening its structure. Review sanitized rendering and editor round trips.",
    sourcePath: context.sourcePath,
  });
  return {
    _type: "htmlBlock",
    _key: context.nextKey(),
    html: toHtml(toHast(tree, { allowDangerousHtml: true }), {
      allowDangerousHtml: true,
    }),
    isolated: false,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineText(children: PhrasingContent[]): string {
  return children
    .map((node) => {
      if ("value" in node && typeof node.value === "string") return node.value;
      if ("children" in node && Array.isArray(node.children)) {
        return inlineText(node.children as PhrasingContent[]);
      }
      return "";
    })
    .join("");
}

function sameMarks(left: string[] | undefined, right: string[]): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right);
}
