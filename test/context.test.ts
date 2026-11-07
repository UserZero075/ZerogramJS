import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ContextFactory } from '../src/Context.js';

function createMockBot() {
    return {
        client: {
            sendMessage: async (peer: any, params: any) => ({
                id: 101,
                peer,
                message: params.message
            }),
            editMessage: async (peer: any, params: any) => {
                if (params.text === 'same') {
                    const err = new Error('MESSAGE_NOT_MODIFIED');
                    (err as any).errorMessage = 'MESSAGE_NOT_MODIFIED';
                    throw err;
                }
                return { id: params.message, text: params.text };
            },
            deleteMessages: async (peer: any, ids: number[]) => true,
            invoke: async (request: any) => true
        },
        ffutil: {
            thumbnail: async () => Buffer.from('thumb')
        },
        rateLimiter: null
    };
}

describe('Context & ContextFactory', () => {
    test('extracts peer and normalizes message from update', () => {
        const bot = createMockBot() as any;
        const factory = new ContextFactory(bot);

        const update = {
            className: 'UpdateNewMessage',
            message: {
                id: 55,
                message: 'Hello World',
                peerId: { userId: 12345678 }
            }
        };

        const ctx = factory.create(update);
        assert.equal(ctx.message.id, 55);
        assert.equal(ctx.message.text, 'Hello World');
        assert.equal(ctx.chatId, '12345678');
        assert.equal(ctx.isCallback, false);
    });

    test('reply converts markdown to HTML and exposes safeEdit', async () => {
        const bot = createMockBot() as any;
        const factory = new ContextFactory(bot);

        const update = {
            message: {
                id: 10,
                message: '/test',
                peerId: { userId: 999 }
            }
        };

        const ctx = factory.create(update);
        const msg = await ctx.reply('**Bold Title** and `inline_code`');

        assert.equal(msg.id, 101);
        assert.ok(msg.message.includes('<b>Bold Title</b>'));
        assert.ok(msg.message.includes('<code>inline_code</code>'));

        // Test safeEdit with MESSAGE_NOT_MODIFIED suppression
        const editResult = await msg.safeEdit('same');
        assert.notEqual(editResult, null, 'safeEdit should suppress MESSAGE_NOT_MODIFIED without throwing');
    });

    test('answerCallback safely converts queryId to BigInt', async () => {
        const bot = createMockBot() as any;
        const factory = new ContextFactory(bot);

        const update = {
            className: 'UpdateBotCallbackQuery',
            queryId: '1234567890123456',
            data: Buffer.from('action:data'),
            userId: 555
        };

        const ctx = factory.create(update);
        assert.equal(ctx.isCallback, true);
        assert.equal(ctx.callbackData, 'action:data');
        assert.equal(ctx.payload, 'data');

        // Should execute invoke without throwing
        const answered = await ctx.answerCallback('Done', { alert: false });
        assert.equal(answered, true);
    });
});
