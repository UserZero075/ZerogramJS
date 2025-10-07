const { spawn, spawnSync } = require('child_process');
const debug = require('debug')('zerogram:ffmpeg');

/**
 * Utilidades para trabajar con FFmpeg
 */
class FFMpegUtil {
    constructor(ffmpegPath, ffprobePath) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
    }

    /**
     * Detecta si un binario existe
     * @private
     */
    static _bin(cmd, env) {
        if (process.env[env]) {
            return process.env[env];
        }

        try {
            const result = spawnSync(cmd, ['-version'], { stdio: 'ignore' });
            return !result.error && result.status === 0 ? cmd : null;
        } catch {
            return null;
        }
    }

    /**
     * Crea una instancia auto-detectando binarios
     * @static
     */
    static create() {
        const ffmpegPath = FFMpegUtil._bin('ffmpeg', 'FFMPEG_PATH');
        const ffprobePath = FFMpegUtil._bin('ffprobe', 'FFPROBE_PATH');

        if (!ffmpegPath) {
            debug('FFmpeg not found in PATH');
        }
        if (!ffprobePath) {
            debug('FFprobe not found in PATH');
        }

        return new FFMpegUtil(ffmpegPath, ffprobePath);
    }

    /**
     * Obtiene la duración de un video
     * @param {Buffer} buffer - Buffer del video
     * @param {number} timeout - Timeout en ms
     * @returns {Promise<number>} Duración en segundos
     */
    duration(buffer, timeout = 8000) {
        if (!this.ffprobePath) {
            debug('ffprobe not available');
            return Promise.resolve(0);
        }

        return new Promise((resolve) => {
            const process = spawn(this.ffprobePath, [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=nw=1:nk=1',
                'pipe:0'
            ]);

            let output = '';
            const timer = setTimeout(() => {
                process.kill('SIGKILL');
                resolve(0);
            }, timeout);

            process.stdout.on('data', (chunk) => {
                output += chunk.toString();
            });

            process.on('close', () => {
                clearTimeout(timer);
                const duration = parseFloat(output.trim());
                resolve(Number.isFinite(duration) ? duration : 0);
            });

            process.on('error', (err) => {
                debug('ffprobe error:', err);
                clearTimeout(timer);
                resolve(0);
            });

            process.stdin.write(buffer);
            process.stdin.end();
        });
    }

    /**
     * Genera un thumbnail de un video
     * @param {Buffer} buffer - Buffer del video
     * @param {Object} opts - Opciones
     * @param {number} opts.seek - Posición en segundos
     * @param {number} opts.width - Ancho del thumbnail
     * @param {number} opts.timeout - Timeout en ms
     * @returns {Promise<Buffer>} Buffer de la imagen
     */
    thumbnail(buffer, opts = {}) {
        const { seek = 0.5, width = 320, timeout = 12000 } = opts;

        if (!this.ffmpegPath) {
            throw new Error('FFmpeg binary not found');
        }

        return new Promise((resolve, reject) => {
            const process = spawn(this.ffmpegPath, [
                '-i', 'pipe:0',
                '-ss', `${seek}`,
                '-frames:v', '1',
                '-q:v', '2',
                '-vf', `scale=${width}:-1`,
                '-f', 'image2',
                'pipe:1'
            ]);

            const chunks = [];
            const timer = setTimeout(() => {
                process.kill('SIGKILL');
                reject(new Error('FFmpeg timeout'));
            }, timeout);

            process.stdout.on('data', (chunk) => {
                chunks.push(chunk);
            });

            process.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });

            process.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            process.stdin.write(buffer);
            process.stdin.end();
        });
    }
}

module.exports = { FFMpegUtil };