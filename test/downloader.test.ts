import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Downloader } from '../src/Downloader.js';

function createMockClient(chunks: Buffer[] = [Buffer.from('chunk1'), Buffer.from('chunk2')]) {
    return {
        downloadMedia: async (msg: any, opts: any) => {
            let total = 0;
            for (const c of chunks) total += c.length;
            if (opts.progressCallback) {
                opts.progressCallback(total, total);
            }
            return Buffer.concat(chunks);
        },
        iterDownload: async function* (params: any) {
            for (const c of chunks) {
                yield c;
            }
        }
    } as any;
}

describe('Downloader Module', () => {
    test('downloadMedia returns buffer and reports progress', async () => {
        const client = createMockClient([Buffer.from('hello '), Buffer.from('world')]);
        const downloader = new Downloader(client);

        let progressReported = false;
        const buffer = await downloader.downloadMedia({ media: { document: { size: 11 } } }, {
            onProgress: (p) => {
                progressReported = true;
                assert.equal(p.downloadedBytes, 11);
            }
        });

        assert.equal(buffer.toString(), 'hello world');
        assert.equal(progressReported, true);
    });

    test('downloadMedia cancels when controller is aborted', async () => {
        const client = createMockClient();
        const downloader = new Downloader(client);

        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
            async () => downloader.downloadMedia({ media: {} }, { controller }),
            /DOWNLOAD_CANCELLED/
        );
    });

    test('downloadMediaStream stops reading if stream is destroyed by consumer', async () => {
        let chunksIterated = 0;
        const fakeClient = {
            iterDownload: async function* () {
                while (true) {
                    chunksIterated++;
                    yield Buffer.from('data');
                    await new Promise(r => setTimeout(r, 10));
                }
            }
        } as any;

        const downloader = new Downloader(fakeClient);
        const stream = downloader.downloadMediaStream({ media: { document: { size: 1000 } } });

        // Read one chunk then destroy stream
        await new Promise<void>((resolve) => {
            stream.once('data', () => {
                stream.destroy();
                resolve();
            });
        });

        const snapshot = chunksIterated;
        await new Promise(r => setTimeout(r, 50));
        assert.ok(chunksIterated <= snapshot + 1, 'Stream iteration should halt after stream destruction');
    });

    test('downloadStream converts byte range with big-integer', async () => {
        let passedParams: any = null;
        const fakeClient = {
            iterDownload: async function* (params: any) {
                passedParams = params;
                yield Buffer.from('ranged_data');
            }
        } as any;

        const downloader = new Downloader(fakeClient);
        const stream = downloader.downloadStream({ media: {} }, { start: 1024, end: 2047 });

        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        assert.equal(Buffer.concat(chunks).toString(), 'ranged_data');
        assert.ok(passedParams != null);
        assert.equal(passedParams.limit, 1024);
        assert.equal(passedParams.offset.toString(), '1024');
    });
});
