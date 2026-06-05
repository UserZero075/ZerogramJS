const path = require('path');
const { PassThrough } = require('stream');
const debug = require('debug')('zerogram:downloader');
const { downloadControllers } = require('../shared/downloadState');

/**
 * Maneja descargas de medios con streaming real
 */
class Downloader {
    constructor(client, ffutil) {
        this.client = client;
        this.ffutil = ffutil;
        this.controllers = downloadControllers;
    }

    /**
     * Descarga un medio con progreso
     */
    async downloadMedia(msg, opts = {}) {
        const { filePath, onProgress, controller } = opts;

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
                progressCallback: (downloadedBytes, totalBytes) => {
                    if (controller?.signal?.aborted) {
                        throw new Error('DOWNLOAD_CANCELLED');
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

            return buffer;
        } catch (error) {
            if (error.message === 'DOWNLOAD_CANCELLED') {
                debug('Download cancelled by user');
            }
            throw error;
        }
    }

    /**
     * Descarga con streaming real - ¡NUEVO!
     * Retorna un stream que empieza a emitir datos inmediatamente
     */
    downloadMediaStream(msg, opts = {}) {
        const { onProgress, controller } = opts;

        if (!msg) {
            throw new Error('Message is required for downloadMediaStream');
        }

        const stream = new PassThrough();
        const startTime = Date.now();
        let downloadedBytes = 0;
        let totalBytes = 0;

        // Obtener el tamaño total del archivo
        if (msg.media?.document) {
            totalBytes = msg.media.document.size || 0;
        } else if (msg.media?.photo) {
            const sizes = msg.media.photo.sizes || [];
            const largest = sizes[sizes.length - 1];
            totalBytes = largest?.size || 0;
        }

        // Iniciar descarga asíncrona
        (async () => {
            try {
                // Verificar cancelación inicial
                if (controller?.signal?.aborted) {
                    stream.destroy(new Error('DOWNLOAD_CANCELLED'));
                    return;
                }

                // Usar iterDownload para streaming real
                for await (const chunk of this.client.iterDownload({
                    file: msg.media,
                    requestSize: 512 * 1024, // 512KB chunks
                })) {
                    // Verificar cancelación en cada chunk
                    if (controller?.signal?.aborted) {
                        stream.destroy(new Error('DOWNLOAD_CANCELLED'));
                        return;
                    }

                    downloadedBytes += chunk.length;

                    // Escribir chunk al stream inmediatamente
                    if (!stream.write(chunk)) {
                        // Esperar si el buffer está lleno
                        await new Promise(resolve => stream.once('drain', resolve));
                    }

                    // Callback de progreso
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

                // Terminar el stream
                stream.end();
                debug('Stream completed successfully');

            } catch (error) {
                debug('Stream error:', error);
                stream.destroy(error);
            }
        })();

        return stream;
    }

    /**
     * Stream a media file with HTTP Range support (byte offsets).
     *
     * Unlike downloadMediaStream which downloads the full file, this method
     * accepts a byte range { start, end } to support HTTP Range requests,
     * resumable downloads, and video seeking.
     *
     * GramJS iterDownload expects big-integer offsets internally; this method
     * handles the conversion so callers can pass plain numbers.
     *
     * @param {object}   msg        - Telegram message with media
     * @param {object}   [range]    - Optional byte range { start, end }
     * @param {number}   range.start - Starting byte offset
     * @param {number}   range.end   - Ending byte offset (inclusive)
     * @param {AbortController} [controller] - Optional abort controller
     * @param {object}   [opts]     - { requestSize, chunkSize }
     * @returns {stream.Readable} PassThrough stream
     */
    downloadStream(msg, range = null, controller = null, opts = {}) {
        if (!msg) {
            throw new Error('Message is required for downloadStream');
        }

        const stream = new PassThrough();
        const bigInt = require('big-integer');

        const iterParams = {
            file: msg.media,
            requestSize: opts.requestSize || 512 * 1024,
            chunkSize: opts.chunkSize || 512 * 1024,
        };

        if (range) {
            if (range.start != null) {
                iterParams.offset = bigInt(range.start);
            }
            if (range.end != null) {
                iterParams.limit = range.end - (range.start || 0) + 1;
            }
        }

        (async () => {
            try {
                if (controller?.signal?.aborted) {
                    stream.destroy(Object.assign(new Error('DOWNLOAD_CANCELLED'), { code: 'ABORT_ERR' }));
                    return;
                }

                for await (const chunk of this.client.iterDownload(iterParams)) {
                    if (controller?.signal?.aborted) {
                        stream.destroy(Object.assign(new Error('DOWNLOAD_CANCELLED'), { code: 'ABORT_ERR' }));
                        return;
                    }
                    if (!stream.write(chunk)) {
                        await new Promise((resolve) => stream.once('drain', resolve));
                    }
                }
                stream.end();
            } catch (e) {
                stream.destroy(e);
            }
        })();

        return stream;
    }

    /**
     * Descarga múltiples medios en lote
     */
    async downloadMediaBatch(messages, opts = {}) {
        const { dir = '.', onProgress, controller } = opts;

        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('messages[] is required and must not be empty');
        }

        if (controller?.signal?.aborted) {
            throw new Error('DOWNLOAD_CANCELLED');
        }

        const totalBytes = messages.reduce((acc, msg) => {
            return acc + (msg.media?.document?.size || 0);
        }, 0);

        let overallDownloaded = 0;
        const results = [];

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (controller?.signal?.aborted) {
                throw new Error('DOWNLOAD_CANCELLED');
            }

            const fileName = this._extractFileName(msg, i);
            const filePath = path.join(dir, fileName);

            try {
                const buffer = await this.downloadMedia(msg, {
                    filePath,
                    controller,
                    onProgress: (progress) => {
                        overallDownloaded += progress.delta;

                        if (typeof onProgress === 'function') {
                            onProgress({
                                index: i + 1,
                                total: messages.length,
                                fileName,
                                ...progress,
                                overallDownloaded,
                                overallTotal: totalBytes,
                                overallPercent: totalBytes > 0
                                    ? (overallDownloaded / totalBytes) * 100
                                    : 0
                            });
                        }
                    }
                });

                results.push({ filePath, buffer, message: msg });
            } catch (error) {
                if (error.message === 'DOWNLOAD_CANCELLED') {
                    throw error;
                }

                debug(`Error downloading file ${i + 1}:`, error);
                results.push({ filePath, error, message: msg });
            }
        }

        return results;
    }

    /**
     * Extrae el nombre de archivo de un mensaje
     * @private
     */
    _extractFileName(msg, index) {
        const attrs = msg.media?.document?.attributes;
        if (attrs) {
            const fileAttr = attrs.find(a => a.fileName);
            if (fileAttr?.fileName) {
                return fileAttr.fileName;
            }
        }
        return `file_${msg.id || index}`;
    }
}

module.exports = Downloader;