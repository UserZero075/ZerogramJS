/**
 * Escapes characters that have special meaning in HTML for Telegram.
 */
export declare function escapeHtml(str: string): string;
/**
 * Escapes characters that have special meaning in MarkdownV2 for Telegram.
 * Inside pre and code entities, all '`' and '\' must be escaped.
 * In all other places, characters '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!' must be escaped.
 */
export declare function escapeMarkdownV2(str: string): string;
/**
 * Parses markdown text into Telegram-compliant HTML.
 * Escapes raw HTML and protects code blocks, inline code, links, spoilers, and formatting.
 */
export declare function markdownToHtml(text: string): string;
/**
 * Converts markdown text into Telegram MarkdownV2 format safely.
 */
export declare function markdownToMarkdownV2(text: string): string;
export declare function parseMarkdown(text: string): {
    cleanedText: string;
    entities: never[];
};
//# sourceMappingURL=markdown.d.ts.map