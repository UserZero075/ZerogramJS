/**
 * Escapes characters that have special meaning in HTML for Telegram.
 */
export function escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escapes characters that have special meaning in MarkdownV2 for Telegram.
 * Inside pre and code entities, all '`' and '\' must be escaped.
 * In all other places, characters '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!' must be escaped.
 */
export function escapeMarkdownV2(str: string): string {
    if (!str) return '';
    return str.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Parses markdown text into Telegram-compliant HTML.
 * Escapes raw HTML and protects code blocks, inline code, links, spoilers, and formatting.
 */
export function markdownToHtml(text: string): string {
    if (!text) return '';

    const placeholders: { token: string; value: string }[] = [];
    let counter = 0;

    const makeToken = (val: string) => {
        const token = `ZGMTOK${counter++}ZGM`;
        placeholders.push({ token, value: val });
        return token;
    };

    // 1. Extract and protect code blocks: ```lang\ncode``` or ```\ncode``` or ```code```
    let processed = text.replace(/```(?:([a-zA-Z0-9_-]+)?\n)?([\s\S]*?)```/g, (_match, lang, code) => {
        const safeCode = escapeHtml(code);
        if (lang) {
            return makeToken(`<pre><code class="language-${lang}">${safeCode}</code></pre>`);
        }
        return makeToken(`<pre>${safeCode}</pre>`);
    });

    // 2. Extract and protect inline code: `code`
    processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
        return makeToken(`<code>${escapeHtml(code)}</code>`);
    });

    // 3. Extract and protect markdown links: [label](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
        const safeUrl = escapeHtml(url);
        // Label will have markdown formatting parsed
        return makeToken(`<a href="${safeUrl}">${escapeHtml(label)}</a>`);
    });

    // 4. Escape remaining raw HTML characters
    processed = escapeHtml(processed);

    // 5. Apply markdown text formatting
    // Spoilers: ||text||
    processed = processed.replace(/\|\|(.*?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');

    // Bold: **text** or __text__ (only if preceded/followed by non-word or start/end)
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // Italic: *text* or _text_
    processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
    processed = processed.replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>');

    // Strikethrough: ~~text~~
    processed = processed.replace(/~~(.*?)~~/g, '<s>$1</s>');

    // Underline: --text--
    processed = processed.replace(/(?<![a-zA-Z0-9])--([^-]+)--(?![a-zA-Z0-9])/g, '<u>$1</u>');

    // Blockquotes: lines starting with >
    processed = processed.replace(/^(?:&gt;|>)[ ]?(.*)$/gm, '<blockquote>$1</blockquote>');

    // 6. Restore protected tokens
    for (let i = placeholders.length - 1; i >= 0; i--) {
        const { token, value } = placeholders[i];
        processed = processed.replace(token, value);
    }

    return processed;
}

/**
 * Converts markdown text into Telegram MarkdownV2 format safely.
 */
export function markdownToMarkdownV2(text: string): string {
    if (!text) return '';

    const placeholders: { token: string; value: string }[] = [];
    let counter = 0;

    const makeToken = (val: string) => {
        const token = `ZGMTOK${counter++}ZGM`;
        placeholders.push({ token, value: val });
        return token;
    };

    // 1. Code blocks
    let processed = text.replace(/```(?:([a-zA-Z0-9_-]+)?\n)?([\s\S]*?)```/g, (_match, lang, code) => {
        const escapedCode = code.replace(/([`\\])/g, '\\$1');
        const header = lang ? `${lang}\n` : '';
        return makeToken('```' + header + escapedCode + '```');
    });

    // 2. Inline code
    processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
        const escapedCode = code.replace(/([`\\])/g, '\\$1');
        return makeToken('`' + escapedCode + '`');
    });

    // 3. Links
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
        const escapedUrl = url.replace(/([)\\])/g, '\\$1');
        const escapedLabel = escapeMarkdownV2(label);
        return makeToken(`[${escapedLabel}](${escapedUrl})`);
    });

    // 4. Bold
    processed = processed.replace(/\*\*(.*?)\*\*/g, (_match, content) => {
        return makeToken(`*${escapeMarkdownV2(content)}*`);
    });

    // 5. Italic
    processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_match, content) => {
        return makeToken(`_${escapeMarkdownV2(content)}_`);
    });

    // 6. Strikethrough
    processed = processed.replace(/~~(.*?)~~/g, (_match, content) => {
        return makeToken(`~${escapeMarkdownV2(content)}~`);
    });

    // 7. Spoiler
    processed = processed.replace(/\|\|(.*?)\|\|/g, (_match, content) => {
        return makeToken(`||${escapeMarkdownV2(content)}||`);
    });

    // 8. Escape all remaining characters in normal text
    processed = escapeMarkdownV2(processed);

    // 9. Restore tokens
    for (let i = placeholders.length - 1; i >= 0; i--) {
        const { token, value } = placeholders[i];
        processed = processed.replace(token, value);
    }

    return processed;
}

export function parseMarkdown(text: string) {
    return { cleanedText: text, entities: [] };
}
