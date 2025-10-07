const { Api } = require('telegram');

/**
 * Parsea markdown personalizado a entidades de Telegram
 * @param {string} text - Texto con formato markdown
 * @returns {Object} { cleanedText, entities }
 */
function parseMarkdown(text) {
    const rules = [
        { re: /\*\*(.*?)\*\*/gs, kind: 'bold' },
        { re: /`([^`]+)`/gs, kind: 'code' },
        { re: /__(.*?)__/gs, kind: 'italic' },
        { re: /```math\n([^\n]+)\n```KATEX_INLINE_OPEN([^)]+)KATEX_INLINE_CLOSE/gs, kind: 'textUrl' }
    ];

    let clean = text;
    const entities = [];

    for (const { re, kind } of rules) {
        const matches = [];
        let match;

        re.lastIndex = 0;
        while ((match = re.exec(clean)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                full: match[0],
                inner: match[1],
                url: kind === 'textUrl' ? match[2] : undefined
            });
        }

        // Procesar de atrás hacia adelante
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            const offset = m.start;
            const length = m.inner.length;

            switch (kind) {
                case 'bold':
                    entities.push(new Api.MessageEntityBold({ offset, length }));
                    break;
                case 'code':
                    entities.push(new Api.MessageEntityCode({ offset, length }));
                    break;
                case 'italic':
                    entities.push(new Api.MessageEntityItalic({ offset, length }));
                    break;
                case 'textUrl':
                    entities.push(new Api.MessageEntityTextUrl({ 
                        offset, 
                        length, 
                        url: m.url 
                    }));
                    break;
            }

            clean = clean.substring(0, m.start) + m.inner + clean.substring(m.end);
        }
    }

    entities.sort((a, b) => a.offset - b.offset);

    return { cleanedText: clean, entities };
}

/**
 * Convierte markdown a HTML
 * @param {string} text - Texto con markdown
 * @returns {string} Texto en HTML
 */
function markdownToHtml(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/__(.*?)__/g, '<i>$1</i>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/```math\n([^\n]+)\n```KATEX_INLINE_OPEN([^)]+)KATEX_INLINE_CLOSE/g, '<a href="$2">$1</a>');
}

/**
 * Convierte markdown a MarkdownV2
 * @param {string} text - Texto con markdown
 * @returns {string} Texto en MarkdownV2
 */
function markdownToMarkdownV2(text) {
    function escapeMarkdownV2(str) {
        return str.replace(/[_*[```()~`>#+=|{}.!-]/g, '\\$&');
    }

    let result = text;
    const patterns = [];

    // Extraer y procesar patrones
    result = result.replace(/\*\*(.*?)\*\*/g, (match, content) => {
        const placeholder = `__BOLD_${patterns.length}__`;
        patterns.push(`*${content}*`);
        return placeholder;
    });

    result = result.replace(/__(.*?)__/g, (match, content) => {
        const placeholder = `__ITALIC_${patterns.length}__`;
        patterns.push(`_${content}_`);
        return placeholder;
    });

    result = result.replace(/`([^`]+)`/g, (match, content) => {
        const placeholder = `__CODE_${patterns.length}__`;
        patterns.push(`\`${content}\``);
        return placeholder;
    });

    result = result.replace(/```math\n([^\n]+)\n```KATEX_INLINE_OPEN([^)]+)KATEX_INLINE_CLOSE/g, (match, text, url) => {
        const placeholder = `__LINK_${patterns.length}__`;
        patterns.push(`[${text}](${url})`);
        return placeholder;
    });

    // Escapar texto restante
    result = escapeMarkdownV2(result);

    // Restaurar patrones
    patterns.forEach((pattern, index) => {
        result = result.replace(`__BOLD_${index}__`, pattern);
        result = result.replace(`__ITALIC_${index}__`, pattern);
        result = result.replace(`__CODE_${index}__`, pattern);
        result = result.replace(`__LINK_${index}__`, pattern);
    });

    return result;
}

module.exports = {
    parseMarkdown,
    markdownToHtml,
    markdownToMarkdownV2
};