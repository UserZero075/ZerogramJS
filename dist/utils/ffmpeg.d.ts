import { Readable } from 'node:stream';
import type { ThumbnailOptions } from '../types/index.js';
/**
 * Robust utility for interacting with FFmpeg and FFprobe binaries.
 */
export declare class FFMpegUtil {
    readonly ffmpegPath: string | null;
    readonly ffprobePath: string | null;
    constructor(ffmpegPath: string | null, ffprobePath: string | null);
    /**
     * Checks if a binary is available and executable.
     */
    private static _detectBin;
    /**
     * Factory that auto-detects FFmpeg and FFprobe binaries from PATH or environment.
     */
    static create(): FFMpegUtil;
    /**
     * Feeds an input (Buffer, Stream, or File Path) into a child process stdin safely.
     */
    private _feedInput;
    /**
     * Calculates the duration of a video or audio file in seconds.
     */
    duration(input: Buffer | Readable | string, timeout?: number): Promise<number>;
    /**
     * Generates a video thumbnail buffer at specified timestamp.
     */
    thumbnail(input: Buffer | Readable | string, opts?: ThumbnailOptions): Promise<Buffer>;
}
export default FFMpegUtil;
//# sourceMappingURL=ffmpeg.d.ts.map