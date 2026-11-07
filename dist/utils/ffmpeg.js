"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FFMpegUtil = void 0;
const node_child_process_1 = require("node:child_process");
const node_stream_1 = require("node:stream");
const node_fs_1 = __importDefault(require("node:fs"));
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zerogram:ffmpeg');
/**
 * Robust utility for interacting with FFmpeg and FFprobe binaries.
 */
class FFMpegUtil {
    ffmpegPath;
    ffprobePath;
    constructor(ffmpegPath, ffprobePath) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
    }
    /**
     * Checks if a binary is available and executable.
     */
    static _detectBin(cmd, envVar) {
        if (process.env[envVar]) {
            return process.env[envVar] || null;
        }
        try {
            const result = (0, node_child_process_1.spawnSync)(cmd, ['-version'], { stdio: 'ignore' });
            return !result.error && result.status === 0 ? cmd : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Factory that auto-detects FFmpeg and FFprobe binaries from PATH or environment.
     */
    static create() {
        const ffmpegPath = FFMpegUtil._detectBin('ffmpeg', 'FFMPEG_PATH');
        const ffprobePath = FFMpegUtil._detectBin('ffprobe', 'FFPROBE_PATH');
        if (!ffmpegPath)
            debug('FFmpeg binary not found in PATH or FFMPEG_PATH');
        if (!ffprobePath)
            debug('FFprobe binary not found in PATH or FFPROBE_PATH');
        return new FFMpegUtil(ffmpegPath, ffprobePath);
    }
    /**
     * Feeds an input (Buffer, Stream, or File Path) into a child process stdin safely.
     */
    async _feedInput(childStdin, input) {
        if (typeof input === 'string') {
            const stream = node_fs_1.default.createReadStream(input);
            stream.pipe(childStdin);
            return;
        }
        if (input instanceof node_stream_1.Readable) {
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
                    await new Promise(resolve => childStdin.once('drain', () => resolve()));
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
    duration(input, timeout = 8000) {
        if (!this.ffprobePath) {
            debug('ffprobe not available, returning 0 duration');
            return Promise.resolve(0);
        }
        const isFilePath = typeof input === 'string' && node_fs_1.default.existsSync(input);
        const args = [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1'
        ];
        if (isFilePath) {
            args.push(input);
        }
        else {
            args.push('pipe:0');
        }
        return new Promise((resolve) => {
            let proc;
            try {
                proc = (0, node_child_process_1.spawn)(this.ffprobePath, args, {
                    stdio: [isFilePath ? 'ignore' : 'pipe', 'pipe', 'ignore']
                });
            }
            catch (err) {
                debug('Failed to spawn ffprobe:', err);
                return resolve(0);
            }
            let output = '';
            let timer = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                }
                catch { }
                resolve(0);
            }, timeout);
            proc.stdout.on('data', (chunk) => {
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
            proc.on('error', (err) => {
                debug('ffprobe error:', err);
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                resolve(0);
            });
            if (!isFilePath && proc.stdin) {
                proc.stdin.on('error', () => { });
                this._feedInput(proc.stdin, input).catch(() => { });
            }
        });
    }
    /**
     * Generates a video thumbnail buffer at specified timestamp.
     */
    thumbnail(input, opts = {}) {
        const { seek = 0.5, width = 320, timeout = 12000 } = opts;
        if (!this.ffmpegPath) {
            return Promise.reject(new Error('FFmpeg binary not found'));
        }
        const isFilePath = typeof input === 'string' && node_fs_1.default.existsSync(input);
        const args = [
            '-ss', `${seek}`,
            '-i', isFilePath ? input : 'pipe:0',
            '-frames:v', '1',
            '-q:v', '2',
            '-vf', `scale=${width}:-1`,
            '-f', 'image2',
            'pipe:1'
        ];
        return new Promise((resolve, reject) => {
            let proc;
            try {
                proc = (0, node_child_process_1.spawn)(this.ffmpegPath, args, {
                    stdio: [isFilePath ? 'ignore' : 'pipe', 'pipe', 'ignore']
                });
            }
            catch (err) {
                return reject(err);
            }
            const chunks = [];
            let timer = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                }
                catch { }
                reject(new Error('FFmpeg thumbnail generation timed out'));
            }, timeout);
            proc.stdout.on('data', (chunk) => {
                chunks.push(chunk);
            });
            proc.on('error', (err) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                reject(err);
            });
            proc.on('close', (code) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (code === 0 && chunks.length > 0) {
                    resolve(Buffer.concat(chunks));
                }
                else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });
            if (!isFilePath && proc.stdin) {
                proc.stdin.on('error', () => { });
                this._feedInput(proc.stdin, input).catch(() => { });
            }
        });
    }
}
exports.FFMpegUtil = FFMpegUtil;
exports.default = FFMpegUtil;
//# sourceMappingURL=ffmpeg.js.map