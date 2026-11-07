import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, executeWithFloodWait } from '../src/RateLimiter.js';

describe('RateLimiter & FloodWait Handlers', () => {
    test('RateLimiter throttles execution to match rate limits', async () => {
        const limiter = new RateLimiter({
            enabled: true,
            globalLimit: 10, // 10 req/s = 100ms interval
            chatLimit: 5,
            maxQueueSize: 100
        });

        const start = Date.now();
        const results: number[] = [];

        await Promise.all([
            limiter.enqueue('chat1', async () => { results.push(1); return 1; }),
            limiter.enqueue('chat1', async () => { results.push(2); return 2; }),
            limiter.enqueue('chat1', async () => { results.push(3); return 3; })
        ]);

        const elapsed = Date.now() - start;
        assert.equal(results.length, 3);
        assert.ok(elapsed >= 150, `Expected elapsed >= 150ms, got ${elapsed}ms`);
    });

    test('RateLimiter rejects when queue is full', async () => {
        const limiter = new RateLimiter({
            enabled: true,
            globalLimit: 1,
            chatLimit: 1,
            maxQueueSize: 2
        });

        // Fill queue
        const slowFn = () => new Promise(resolve => setTimeout(resolve, 200));
        limiter.enqueue('chat', slowFn);
        limiter.enqueue('chat', slowFn);

        // Third should fail if maxQueueSize is 2
        await assert.rejects(
            async () => limiter.enqueue('chat', slowFn),
            /Rate limiter queue is full/
        );
    });

    test('executeWithFloodWait retries on FLOOD error within max wait', async () => {
        let attempts = 0;
        const fakeApiCall = async () => {
            attempts++;
            if (attempts === 1) {
                const err = new Error('A wait of 1 seconds is required (caused by SendMessage)');
                (err as any).seconds = 1;
                (err as any).errorMessage = 'FLOOD';
                throw err;
            }
            return 'success';
        };

        const result = await executeWithFloodWait(fakeApiCall, {
            autoFloodWait: true,
            maxFloodWait: 5
        });

        assert.equal(result, 'success');
        assert.equal(attempts, 2);
    });

    test('executeWithFloodWait throws when flood wait exceeds maxFloodWait', async () => {
        const fakeApiCall = async () => {
            const err = new Error('FLOOD_WAIT_300');
            (err as any).seconds = 300;
            (err as any).errorMessage = 'FLOOD';
            throw err;
        };

        await assert.rejects(
            async () => executeWithFloodWait(fakeApiCall, { autoFloodWait: true, maxFloodWait: 10 }),
            /FloodWait exceeded max threshold/
        );
    });
});
