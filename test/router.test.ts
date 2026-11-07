import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/Router.js';
import type { Context } from '../src/types/index.js';

function createMockContext(text = '', updateObj: any = {}): Context {
    const bot = {
        options: { botUsername: 'TestBot' },
        emit: (_event: string, _data?: any) => {}
    };

    const update = {
        message: { text, id: 1, peerId: { userId: 12345 } },
        ...updateObj
    };

    return {
        bot,
        client: {} as any,
        update,
        message: update.message,
        from: { id: '12345', firstName: 'Marlon' },
        chat: { id: '12345', type: 'private' },
        chatId: '12345',
        senderId: '12345',
        isCallback: false,
        callbackData: null,
        payload: null,
        match: null,
        session: {},
        reply: async () => {},
        send: async () => {},
        sendFile: async () => {},
        safeEdit: async () => {},
        editMessageText: async () => {},
        editMessageReplyMarkup: async () => {},
        deleteMessage: async () => true,
        sendChatAction: async () => true,
        answerCallback: async () => {},
        getReplyMessage: async () => null,
        getMessages: async () => [],
        thumbFromVideo: async () => Buffer.from(''),
        downloadMedia: async () => Buffer.from(''),
        downloadMediaStream: () => (null as any),
        downloadStream: () => (null as any),
        downloadMediaBatch: async () => [],
        downloadControllers: new Map()
    };
}

describe('Router & Middleware Pipeline', () => {
    test('routes commands case-insensitively and parses arguments', async () => {
        const router = new Router();
        let executed = false;
        let receivedArgs: string[] = [];

        router.addCommand('echo', (ctx, args) => {
            executed = true;
            receivedArgs = args;
        });

        const ctx = createMockContext('/ECHO hello world 123');
        await router.route(ctx, ctx.update);

        assert.equal(executed, true);
        assert.deepEqual(receivedArgs, ['hello', 'world', '123']);
    });

    test('routes group command with bot username /start@TestBot', async () => {
        const router = new Router();
        let executed = false;

        router.addCommand('start', () => {
            executed = true;
        });

        const ctx = createMockContext('/start@TestBot param1');
        await router.route(ctx, ctx.update);

        assert.equal(executed, true);
    });

    test('supports array of command aliases', async () => {
        const router = new Router();
        let hits = 0;

        router.addCommand(['help', 'ayuda'], () => {
            hits++;
        });

        await router.route(createMockContext('/help'), {});
        await router.route(createMockContext('/ayuda'), {});

        assert.equal(hits, 2);
    });

    test('hears text matching RegExp', async () => {
        const router = new Router();
        let matchedParam = '';

        router.addHears(/order:(\d+)/i, (ctx) => {
            if (ctx.match) {
                matchedParam = ctx.match[1];
            }
        });

        const ctx = createMockContext('Please check ORDER:9942 thanks!');
        await router.route(ctx, ctx.update);

        assert.equal(matchedParam, '9942');
    });

    test('routes callback queries with exact, prefix and regex matching', async () => {
        const router = new Router();
        let result = '';

        router.addCallback('settings', (ctx) => {
            result = 'settings_hit';
        });

        router.addCallback(/^page:(\d+)$/, (ctx) => {
            result = `page_${ctx.match?.[1]}`;
        });

        const cbCtx1 = createMockContext('', {
            className: 'UpdateBotCallbackQuery',
            data: Buffer.from('settings')
        });
        cbCtx1.isCallback = true;
        cbCtx1.callbackData = 'settings';
        await router.route(cbCtx1, cbCtx1.update);
        assert.equal(result, 'settings_hit');

        const cbCtx2 = createMockContext('', {
            className: 'UpdateBotCallbackQuery',
            data: Buffer.from('page:42')
        });
        cbCtx2.isCallback = true;
        cbCtx2.callbackData = 'page:42';
        await router.route(cbCtx2, cbCtx2.update);
        assert.equal(result, 'page_42');
    });

    test('executes middleware chain in onion order', async () => {
        const router = new Router();
        const executionOrder: number[] = [];

        router.addMiddleware(async (ctx, next) => {
            executionOrder.push(1);
            await next();
            executionOrder.push(4);
        });

        router.addMiddleware(async (ctx, next) => {
            executionOrder.push(2);
            await next();
            executionOrder.push(3);
        });

        router.addCommand('test', () => {
            executionOrder.push(2.5);
        });

        await router.route(createMockContext('/test'), {});

        assert.deepEqual(executionOrder, [1, 2, 2.5, 3, 4]);
    });

    test('prevents multiple next() calls in middleware', async () => {
        const router = new Router();

        router.addMiddleware(async (ctx, next) => {
            await next();
            await next();
        });

        await assert.rejects(
            async () => router.route(createMockContext('/test'), {}),
            /next\(\) called multiple times/
        );
    });
});
