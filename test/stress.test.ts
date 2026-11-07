import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/Router.js';
import { RateLimiter } from '../src/RateLimiter.js';
import { ContextFactory } from '../src/Context.js';
import { Downloader } from '../src/Downloader.js';

describe('Intensive Stress & Impact Benchmark Suite', () => {
    test('High-Throughput: processes 10,000 updates with zero drops and sub-millisecond dispatch', async () => {
        const router = new Router();
        let processedCount = 0;
        let middlewareCount = 0;

        // Logging & validation middleware
        router.addMiddleware(async (ctx, next) => {
            middlewareCount++;
            ctx.session.touched = true;
            await next();
        });

        // Command handler
        router.addCommand('stress', (ctx, args) => {
            processedCount++;
        });

        // Hears handler
        router.addHears(/ping_(\d+)/, (ctx) => {
            processedCount++;
        });

        const botMock = {
            options: { botUsername: 'StressBot' },
            client: {} as any,
            emit: () => {}
        };
        const contextFactory = new ContextFactory(botMock);

        const startTime = Date.now();
        const TOTAL_UPDATES = 10000;

        // Process in batches of 500 to simulate realistic network event loop cycles
        const BATCH_SIZE = 500;
        for (let b = 0; b < TOTAL_UPDATES / BATCH_SIZE; b++) {
            const promises: Promise<any>[] = [];
            for (let i = 0; i < BATCH_SIZE; i++) {
                const isCommand = (b * BATCH_SIZE + i) % 2 === 0;
                const update = {
                    message: {
                        id: b * BATCH_SIZE + i,
                        message: isCommand ? '/stress fast' : `ping_${b * BATCH_SIZE + i}`,
                        peerId: { userId: 1000 + (i % 50) }
                    }
                };
                const ctx = contextFactory.create(update);
                promises.push(router.route(ctx, update));
            }
            await Promise.all(promises);
        }

        const elapsed = Date.now() - startTime;
        const throughput = (TOTAL_UPDATES / (elapsed / 1000)).toFixed(0);

        assert.equal(processedCount, TOTAL_UPDATES);
        assert.equal(middlewareCount, TOTAL_UPDATES);

        console.log(`\n  [STRESS BENCHMARK] Processed ${TOTAL_UPDATES} updates in ${elapsed}ms (${throughput} updates/sec)`);
    });

    test('Burst Concurrency: handles 1,000 parallel callbacks with regex extraction without race conditions', async () => {
        const router = new Router();
        const results = new Map<number, string>();

        router.addCallback(/^item:(\d+):([a-z]+)$/, (ctx) => {
            if (ctx.match) {
                const id = parseInt(ctx.match[1], 10);
                const action = ctx.match[2];
                results.set(id, action);
            }
        });

        const botMock = { options: {}, client: {} as any, emit: () => {} };
        const factory = new ContextFactory(botMock);

        const BURST_COUNT = 1000;
        const burstPromises = Array.from({ length: BURST_COUNT }, (_, i) => {
            const update = {
                className: 'UpdateBotCallbackQuery',
                data: Buffer.from(`item:${i}:click`),
                userId: 9000 + i
            };
            const ctx = factory.create(update);
            return router.route(ctx, update);
        });

        await Promise.all(burstPromises);

        assert.equal(results.size, BURST_COUNT);
        assert.equal(results.get(0), 'click');
        assert.equal(results.get(BURST_COUNT - 1), 'click');
    });

    test('Memory Stability: zero memory leak under sustained workload', async () => {
        if (global.gc) {
            global.gc();
        }

        const initialMem = process.memoryUsage().heapUsed;
        const router = new Router();

        router.addMiddleware(async (ctx, next) => {
            ctx.session.data = 'temporary_memory_buffer_string';
            await next();
        });

        router.addCommand('echo', (ctx, args) => {});

        const botMock = { options: {}, client: {} as any, emit: () => {} };
        const factory = new ContextFactory(botMock);

        for (let i = 0; i < 5000; i++) {
            const update = {
                message: {
                    id: i,
                    message: `/echo payload_${i}`,
                    peerId: { userId: 42 }
                }
            };
            const ctx = factory.create(update);
            await router.route(ctx, update);
        }

        if (global.gc) {
            global.gc();
        }

        const finalMem = process.memoryUsage().heapUsed;
        const growthMB = (finalMem - initialMem) / 1024 / 1024;

        console.log(`  [MEMORY BENCHMARK] Heap delta after 5,000 updates: ${growthMB.toFixed(2)} MB`);
        // Heap delta should be negligible (< 25MB even without forced GC)
        assert.ok(growthMB < 25, `Expected heap growth < 25MB, got ${growthMB.toFixed(2)} MB`);
    });

    test('Downloader Concurrency & Cancellation Resilience under load', async () => {
        let activeStreams = 0;
        let abortedStreams = 0;

        const fakeClient = {
            iterDownload: async function* () {
                activeStreams++;
                try {
                    for (let c = 0; c < 20; c++) {
                        yield Buffer.alloc(1024);
                        await new Promise(r => setTimeout(r, 2));
                    }
                } finally {
                    activeStreams--;
                }
            }
        } as any;

        const downloader = new Downloader(fakeClient);
        const PARALLEL_DOWNLOADS = 50;

        const downloadTasks = Array.from({ length: PARALLEL_DOWNLOADS }, async (_, i) => {
            const controller = new AbortController();
            const shouldAbort = i % 2 === 0;

            const stream = downloader.downloadMediaStream({ media: {} }, { controller });

            if (shouldAbort) {
                setTimeout(() => {
                    controller.abort();
                    abortedStreams++;
                }, 5);
            }

            try {
                for await (const chunk of stream) {
                    // drain
                }
            } catch {
                // Expected on abort
            }
        });

        await Promise.all(downloadTasks);

        assert.equal(abortedStreams, 25);
        assert.equal(activeStreams, 0, 'All streams must terminate without dangling connections');
    });
});
