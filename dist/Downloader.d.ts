import { type Readable } from 'node:stream';
import type { TelegramClient } from 'telegram';
import type { DownloadOptions, StreamOptions, ByteRange, BatchDownloadOptions, BatchDownloadResult } from './types/index.js';
export declare const downloadControllers: Map<string, AbortController>;
/**
 * Handles resilient media downloads, streaming and batch operations.
 */
export declare class Downloader {
    readonly client: TelegramClient;
    readonly ffutil?: any;
    readonly controllers: Map<string, AbortController>;
    constructor(client: TelegramClient, ffutil?: any);
    /**
     * Downloads Telegram media with granular progress callbacks and abort support.
     */
    downloadMedia(msg: any, opts?: DownloadOptions): Promise<Buffer | string>;
    /**
     * Downloads Telegram media as a continuous PassThrough stream.
     * Guaranteed non-blocking backpressure and immediate disconnection cleanup.
     */
    downloadMediaStream(msg: any, opts?: StreamOptions): Readable;
    /**
     * Streams media with HTTP Range support (byte offsets) for video seeking and resumable downloads.
     */
    downloadStream(msg: any, range?: ByteRange | null, controller?: AbortController | null, opts?: StreamOptions): Readable;
    /**
     * Downloads multiple media files in batch with concurrency control and overall progress tracking.
     */
    downloadMediaBatch(messages: any[], opts?: BatchDownloadOptions): Promise<BatchDownloadResult[]>;
    private _extractFileName;
}
export default Downloader;
//# sourceMappingURL=Downloader.d.ts.map