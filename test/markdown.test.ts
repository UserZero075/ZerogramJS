import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    escapeMarkdownV2,
    markdownToHtml,
    markdownToMarkdownV2
} from '../src/utils/markdown.js';

describe('Markdown & HTML Utilities', () => {
    test('escapeHtml escapes dangerous HTML characters', () => {
        assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert("xss")&lt;/script&gt;');
        assert.equal(escapeHtml('Tom & Jerry <tom@example.com>'), 'Tom &amp; Jerry &lt;tom@example.com&gt;');
    });

    test('markdownToHtml converts bold, italic, strikethrough, spoiler', () => {
        const input = '**bold** and *italic* and ~~strike~~ and ||secret||';
        const expected = '<b>bold</b> and <i>italic</i> and <s>strike</s> and <tg-spoiler>secret</tg-spoiler>';
        assert.equal(markdownToHtml(input), expected);
    });

    test('markdownToHtml handles code blocks with language and inline code safely', () => {
        const input = 'Here is `const x = 1 < 2 & 3 > 0;` and:\n```typescript\nfunction test() {\n  return 1 < 2;\n}\n```';
        const output = markdownToHtml(input);
        assert.ok(output.includes('<code>const x = 1 &lt; 2 &amp; 3 &gt; 0;</code>'));
        assert.ok(output.includes('<pre><code class="language-typescript">'));
        assert.ok(output.includes('return 1 &lt; 2;'));
    });

    test('markdownToHtml escapes raw HTML tags while formatting markdown', () => {
        const input = 'Hello <world> and **bold & strong**';
        const output = markdownToHtml(input);
        assert.equal(output, 'Hello &lt;world&gt; and <b>bold &amp; strong</b>');
    });

    test('markdownToHtml handles links properly', () => {
        const input = 'Visit [Google](https://google.com?a=1&b=2)';
        const output = markdownToHtml(input);
        assert.equal(output, 'Visit <a href="https://google.com?a=1&amp;b=2">Google</a>');
    });

    test('escapeMarkdownV2 escapes all Telegram special characters', () => {
        const input = 'Hello_world *test* [link] (parens) ~strike~ `code` >quote #hash +plus -minus =eq |pipe {brace} .dot !excl';
        const escaped = escapeMarkdownV2(input);
        assert.ok(!unescapedSpecialChars(escaped));
    });

    test('markdownToMarkdownV2 preserves valid MarkdownV2 syntax', () => {
        const input = 'Hello **world** and `const x = 1;`';
        const output = markdownToMarkdownV2(input);
        assert.ok(output.includes('*world*'));
        assert.ok(output.includes('`const x = 1;`'));
    });
});

function unescapedSpecialChars(str: string): boolean {
    const specialChars = /[_*[\]()~`>#+\-=|{}.!]/;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '\\') {
            i++; // skip escaped char
            continue;
        }
        if (specialChars.test(str[i])) {
            return true;
        }
    }
    return false;
}
