import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import createDebug from 'debug';
import type { ThumbnailOptions } from '../types/index.js';

const debug = createDebug('zerogram:ffmpeg');

/**
 * Robust utility for interacting with FFmpeg and FFprobe binaries.
 */
export class FFMpegUtil {
    public readonly ffmpegPath: string | null;
    public readonly ffprobePath: string | null;

    constructor(ffmpegPath: string | null, ffprobePath: string | null) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
    }

    /**
     * Checks if a binary is available and executable.
     */
    private static _detectBin(cmd: string, envVar: string): string | null {
        if (process.env[envVar]) {
            return process.env[envVar] || null;
        }

        try {
            const result = spawnSync(cmd, ['-version'], { stdio: 'ignore' });
            return !result.error && result.status === 0 ? cmd : null;
        } catch {
            return null;
        }
    }

    /**
     * Factory that auto-detects FFmpeg and FFprobe binaries from PATH or environment.
     */
    static create(): FFMpegUtil {
        const ffmpegPath = FFMpegUtil._detectBin('ffmpeg', 'FFMPEG_PATH');
        const ffprobePath = FFMpegUtil._detectBin('ffprobe', 'FFPROBE_PATH');

        if (!ffmpegPath) debug('FFmpeg binary not found in PATH or FFMPEG_PATH');
        if (!ffprobePath) debug('FFprobe binary not found in PATH or FFPROBE_PATH');

        return new FFMpegUtil(ffmpegPath, ffprobePath);
    }

    /**
     * Feeds an input (Buffer, Stream, or File Path) into a child process stdin safely.
     */
    private async _feedInput(childStdin: any, input: Buffer | Readable | string): Promise<void> {
        if (typeof input === 'string') {
            const stream = fs.createReadStream(input);
            stream.pipe(childStdin);
            return;
        }

        if (input instanceof Readable) {
            input.pipe(childStdin);
            return;
        }

        if (Buffer.isBuffer(input)) {
            const chunkSize = 64 * 1024;
            let offset = 0;

            while (offset < input.length) {
                const chunk = input.subarray(offset, offset + chunkSize);
                offset += chunkSize;

                if (!childStdin.write(chunk)) {
                    await new Promise<void>(resolve => childStdin.once('drain', () => resolve()));
                }
            }
            childStdin.end();
            return;
        }

        childStdin.end();
    }

    /**
     * Calculates the duration of a video or audio file in seconds.
     */
    duration(input: Buffer | Readable | string, timeout = 8000): Promise<number> {
        if (!this.ffprobePath) {
            debug('ffprobe not available, returning 0 duration');
            return Promise.resolve(0);
        }

        const isFilePath = typeof input === 'string' && fs.existsSync(input);
        const args = [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1'
        ];

        if (isFilePath) {
            args.push(input as string);
        } else {
            args.push('pipe:0');
        }

        return new Promise<number>((resolve) => {
            let proc: any;
            try {
                proc = spawn(this.ffprobePath!, args, {
                    stdio: [isFilePath ? 'ignore' : 'pipe', 'pipe', 'ignore']
                });
            } catch (err) {
                debug('Failed to spawn ffprobe:', err);
                return resolve(0);
            }

            let output = '';
            let timer: NodeJS.Timeout | null = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                } catch {}
                resolve(0);
            }, timeout);

            proc.stdout.on('data', (chunk: Buffer) => {
                output += chunk.toString();
            });

            proc.on('close', () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                const duration = parseFloat(output.trim());
                resolve(Number.isFinite(duration) ? duration : 0);
            });

            proc.on('error', (err: any) => {
                debug('ffprobe error:', err);
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                resolve(0);
            });

            if (!isFilePath && proc.stdin) {
                proc.stdin.on('error', () => {});
                this._feedInput(proc.stdin, input).catch(() => {});
            }
        });
    }

    /**
     * Generates a video thumbnail buffer at specified timestamp.
     */
    thumbnail(input: Buffer | Readable | string, opts: ThumbnailOptions = {}): Promise<Buffer> {
        const { seek = 0.5, width = 320, timeout = 12000 } = opts;

        if (!this.ffmpegPath) {
            return Promise.reject(new Error('FFmpeg binary not found'));
        }

        const isFilePath = typeof input === 'string' && fs.existsSync(input);
        const args = [
            '-ss', `${seek}`,
            '-i', isFilePath ? (input as string) : 'pipe:0',
            '-frames:v', '1',
            '-q:v', '2',
            '-vf', `scale=${width}:-1`,
            '-f', 'image2',
            'pipe:1'
        ];

        return new Promise<Buffer>((resolve, reject) => {
            let proc: any;
            try {
                proc = spawn(this.ffmpegPath!, args, {
                    stdio: [isFilePath ? 'ignore' : 'pipe', 'pipe', 'ignore']
                });
            } catch (err) {
                return reject(err);
            }

            const chunks: Buffer[] = [];
            let timer: NodeJS.Timeout | null = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                } catch {}
                reject(new Error('FFmpeg thumbnail generation timed out'));
            }, timeout);

            proc.stdout.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            proc.on('error', (err: any) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                reject(err);
            });

            proc.on('close', (code: number) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (code === 0 && chunks.length > 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            if (!isFilePath && proc.stdin) {
                proc.stdin.on('error', () => {});
                this._feedInput(proc.stdin, input).catch(() => {});
            }
        });
    }
}

export default FFMpegUtil;
