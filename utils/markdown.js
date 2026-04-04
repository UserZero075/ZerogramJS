function parseMarkdown(text) {
    // Placeholder — usa HTML directamente en telegram
    return { cleanedText: text, entities: [] };
}

/**
 * Convierte markdown a HTML
 */
function markdownToHtml(text) {
    return text
        // Links: [text](url)
        .replace(/\[(.+?)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Bold: **text** or __text__
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/__(.*?)__/g, '<i>$1</i>')
        // Italic: *text*
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>')
        // Strikethrough: ~~text~~
        .replace(/~~(.*?)~~/g, '<strike>$1</strike>')
        // Code: `text`
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Code block: ```text```
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre>$2</pre>')
        // Lists
        .replace(/^• /gm, '• ')
}

/**
 * Convierte markdown a MarkdownV2
 */
function markdownToMarkdownV2(text) {
    function escapeMarkdownV2(str) {
        return str.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
    }

    return text
        // Links: [text](url)
        .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, ($0, text, url) => `[${escapeMarkdownV2(text)}](${url})`)
        // Code block: ```text``` (process before inline code)
        .replace(/```(\w+)?\n([\s\S]*?)```/g, ($0, lang, code) => `\`${code.replace(/`/g, '')}\``)
        // Bold: **text**
        .replace(/\*\*(.*?)\*\*/g, '*$1*')
        // Italic: *text*
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_')
        // Code: `text`
        .replace(/`([^`]+)`/g, '`$1`')
        // Escape remaining special chars
        .replace(/([_\*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}

module.exports = {
    parseMarkdown,
    markdownToHtml,
    markdownToMarkdownV2
}
