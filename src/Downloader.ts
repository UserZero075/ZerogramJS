import path from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import bigInt from 'big-integer';
import createDebug from 'debug';
import type { TelegramClient } from 'telegram';
import type {
    DownloadOptions,
    StreamOptions,
    ByteRange,
    BatchDownloadOptions,
    BatchDownloadResult
} from './types/index.js';

const debug = createDebug('zerogram:downloader');

export const downloadControllers = new Map<string, AbortController>();

/**
 * Handles resilient media downloads, streaming and batch operations.
 */
export class Downloader {
    public readonly client: TelegramClient;
    public readonly ffutil?: any;
    public readonly controllers: Map<string, AbortController>;

    constructor(client: TelegramClient, ffutil?: any) {
        this.client = client;
        this.ffutil = ffutil;
        this.controllers = downloadControllers;
    }

    /**
     * Downloads Telegram media with granular progress callbacks and abort support.
     */
    async downloadMedia(msg: any, opts: DownloadOptions = {}): Promise<Buffer | string> {
        const { filePath, onProgress, controller, maxBytes } = opts;

        if (!msg) {
            throw new Error('Message is required for downloadMedia');
        }

        if (controller?.signal?.aborted) {
            throw new Error('DOWNLOAD_CANCELLED');
        }

        const startTime = Date.now();
        let lastBytes = 0;

        try {
            const buffer = await this.client.downloadMedia(msg, {
                outputFile: filePath,
                progressCallback: (downloaded: any, total: any) => {
                    const downloadedBytes = typeof downloaded === 'object' && downloaded?.toJSNumber ? downloaded.toJSNumber() : Number(downloaded);
                    const totalBytes = typeof total === 'object' && total?.toJSNumber ? total.toJSNumber() : Number(total);
                    if (controller?.signal?.aborted) {
                        throw new Error('DOWNLOAD_CANCELLED');
                    }

                    if (maxBytes && downloadedBytes > maxBytes) {
                        throw new Error(`DOWNLOAD_EXCEEDED_MAX_BYTES: ${downloadedBytes} > ${maxBytes}`);
                    }

                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
                    const delta = downloadedBytes - lastBytes;

                    if (typeof onProgress === 'function') {
                        onProgress({
                            downloadedBytes,
                            totalBytes,
                            speed,
                            percent: totalBytes ? (downloadedBytes / totalBytes) * 100 : 0,
                            delta,
                            elapsed
                        });
                    }

                    lastBytes = downloadedBytes;
                }
            });

            return buffer as any;
        } catch (error: any) {
            if (error.message === 'DOWNLOAD_CANCELLED') {
                debug('Download cancelled by user signal');
            }
            throw error;
        }
    }

    /**
     * Downloads Telegram media as a continuous PassThrough stream.
     * Guaranteed non-blocking backpressure and immediate disconnection cleanup.
     */
    downloadMediaStream(msg: any, opts: StreamOptions = {}): Readable {
        const { onProgress, controller, requestSize = 512 * 1024 } = opts;

        if (!msg) {
            throw new Error('Message is required for downloadMediaStream');
        }

        const stream = new PassThrough();
        const startTime = Date.now();
        let downloadedBytes = 0;
        let totalBytes = 0;
        let isClosed = false;

        // Cleanup on consumer close or error
        const markClosed = () => {
            isClosed = true;
        };
        stream.once('close', markClosed);
        stream.once('error', markClosed);

        // Determine total media size
        if (msg.media?.document) {
            totalBytes = msg.media.document.size || 0;
        } else if (msg.media?.photo) {
            const sizes = msg.media.photo.sizes || [];
            const largest = sizes[sizes.length - 1];
            totalBytes = largest?.size || 0;
        }

        // Asynchronous stream pipeline
        (async () => {
            try {
                if (controller?.signal?.aborted || isClosed) {
                    stream.destroy(new Error('DOWNLOAD_CANCELLED'));
                    return;
                }

                for await (const chunk of this.client.iterDownload({
                    file: msg.media,
                    requestSize
                })) {
                    if (controller?.signal?.aborted || isClosed) {
                        stream.destroy(new Error('DOWNLOAD_CANCELLED'));
                        return;
                    }

                    downloadedBytes += chunk.length;

                    // Handle stream backpressure
                    if (!stream.write(chunk)) {
                        await new Promise<void>(resolve => stream.once('drain', () => resolve()));
                    }

                    if (typeof onProgress === 'function') {
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;
                        onProgress({
                            downloadedBytes,
                            totalBytes,
                            speed,
                            percent: totalBytes ? (downloadedBytes / totalBytes) * 100 : 0,
                            elapsed
                        });
                    }
                }

                stream.end();
                debug('Media stream finished successfully');
            } catch (error: any) {
                debug('Media stream error:', error);
                stream.destroy(error);
            }
        })();

        return stream;
    }

    /**
     * Streams media with HTTP Range support (byte offsets) for video seeking and resumable downloads.
     */
    downloadStream(
        msg: any,
        range: ByteRange | null = null,
        controller: AbortController | null = null,
        opts: StreamOptions = {}
    ): Readable {
        if (!msg) {
            throw new Error('Message is required for downloadStream');
        }

        const stream = new PassThrough();
        const requestSize = opts.requestSize || 512 * 1024;
        const chunkSize = opts.chunkSize || 512 * 1024;

        const iterParams: any = {
            file: msg.media,
            requestSize,
            chunkSize
        };

        if (range) {
            if (range.start != null) {
                iterParams.offset = bigInt(range.start);
            }
            if (range.end != null) {
                iterParams.limit = range.end - (range.start || 0) + 1;
            }
        }

        let isClosed = false;
        const markClosed = () => {
            isClosed = true;
        };
        stream.once('close', markClosed);
        stream.once('error', markClosed);

        (async () => {
            try {
                if (controller?.signal?.aborted || isClosed) {
                    stream.destroy(Object.assign(new Error('DOWNLOAD_CANCELLED'), { code: 'ABORT_ERR' }));
                    return;
                }

                for await (const chunk of this.client.iterDownload(iterParams)) {
                    if (controller?.signal?.aborted || isClosed) {
                        stream.destroy(Object.assign(new Error('DOWNLOAD_CANCELLED'), { code: 'ABORT_ERR' }));
                        return;
                    }

                    if (!stream.write(chunk)) {
                        await new Promise<void>(resolve => stream.once('drain', () => resolve()));
                    }
                }

                stream.end();
            } catch (e: any) {
                debug('Ranged download stream error:', e);
                stream.destroy(e);
            }
        })();

        return stream;
    }

    /**
     * Downloads multiple media files in batch with concurrency control and overall progress tracking.
     */
    async downloadMediaBatch(messages: any[], opts: BatchDownloadOptions = {}): Promise<BatchDownloadResult[]> {
        const { dir = '.', onProgress, controller, concurrency = 2 } = opts;

        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('messages[] is required and must not be empty');
        }

        if (controller?.signal?.aborted) {
            throw new Error('DOWNLOAD_CANCELLED');
        }

        const totalBytes = messages.reduce((acc, msg) => {
            return acc + (msg?.media?.document?.size || msg?.media?.photo?.sizes?.slice(-1)[0]?.size || 0);
        }, 0);

        let overallDownloaded = 0;
        const results: BatchDownloadResult[] = new Array(messages.length);

        // Worker pool for concurrency control
        let currentIdx = 0;
        const worker = async () => {
            while (currentIdx < messages.length) {
                if (controller?.signal?.aborted) {
                    throw new Error('DOWNLOAD_CANCELLED');
                }

                const i = currentIdx++;
                const msg = messages[i];
                const fileName = this._extractFileName(msg, i);
                const filePath = path.join(dir, fileName);

                try {
                    const buffer = await this.downloadMedia(msg, {
                        filePath,
                        controller,
                        onProgress: (p) => {
                            overallDownloaded += p.delta;
                            if (typeof onProgress === 'function') {
                                onProgress({
                                    index: i + 1,
                                    total: messages.length,
                                    fileName,
                                    ...p,
                                    overallDownloaded,
                                    overallTotal: totalBytes,
                                    overallPercent: totalBytes > 0 ? (overallDownloaded / totalBytes) * 100 : 0
                                });
                            }
                        }
                    });

                    results[i] = {
                        filePath,
                        buffer: Buffer.isBuffer(buffer) ? buffer : undefined,
                        message: msg
                    };
                } catch (error: any) {
                    if (error.message === 'DOWNLOAD_CANCELLED') {
                        throw error;
                    }
                    debug(`Error downloading file ${i + 1}:`, error);
                    results[i] = { filePath, error, message: msg };
                }
            }
        };

        const workers = Array.from({ length: Math.min(concurrency, messages.length) }, () => worker());
        await Promise.all(workers);

        return results;
    }

    private _extractFileName(msg: any, index: number): string {
        const attrs = msg?.media?.document?.attributes;
        if (attrs && Array.isArray(attrs)) {
            const fileAttr = attrs.find((a: any) => a.fileName);
            if (fileAttr?.fileName) {
                return fileAttr.fileName;
            }
        }
        return `file_${msg?.id || index}`;
    }
}

export default Downloader;
