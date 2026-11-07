"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
exports.executeWithFloodWait = executeWithFloodWait;
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zerogram:ratelimiter');
/**
 * Token-bucket based Rate Limiter for Telegram MTProto API calls.
 * Throttles both global request rate and per-chat request rate.
 */
class RateLimiter {
    enabled;
    globalLimit;
    chatLimit;
    maxQueueSize;
    queue = [];
    processing = false;
    lastGlobalTime = 0;
    lastChatTimes = new Map();
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.globalLimit = options.globalLimit || 30; // 30 req/s global default
        this.chatLimit = options.chatLimit || 1; // 1 req/s per chat default
        this.maxQueueSize = options.maxQueueSize || 1000;
    }
    /**
     * Enqueues a task to be executed within rate limits.
     */
    enqueue(chatId, task) {
        if (!this.enabled) {
            return task();
        }
        const chatKey = chatId != null ? String(chatId) : 'global';
        if (this.queue.length >= this.maxQueueSize) {
            return Promise.reject(new Error(`Rate limiter queue is full (max: ${this.maxQueueSize})`));
        }
        return new Promise((resolve, reject) => {
            this.queue.push({
                chatKey,
                execute: task,
                resolve,
                reject
            });
            this._scheduleNext();
        });
    }
    _scheduleNext() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        setImmediate(() => this._processLoop());
    }
    async _processLoop() {
        while (this.queue.length > 0) {
            const now = Date.now();
            const minGlobalInterval = 1000 / this.globalLimit;
            const minChatInterval = 1000 / this.chatLimit;
            // Find first item ready to be processed
            let readyIndex = -1;
            let waitTime = 0;
            for (let i = 0; i < this.queue.length; i++) {
                const item = this.queue[i];
                const lastChat = this.lastChatTimes.get(item.chatKey) || 0;
                const globalWait = Math.max(0, (this.lastGlobalTime + minGlobalInterval) - now);
                const chatWait = Math.max(0, (lastChat + minChatInterval) - now);
                const itemWait = Math.max(globalWait, chatWait);
                if (itemWait === 0) {
                    readyIndex = i;
                    waitTime = 0;
                    break;
                }
                else if (readyIndex === -1 || itemWait < waitTime) {
                    readyIndex = i;
                    waitTime = itemWait;
                }
            }
            if (readyIndex === -1) {
                break;
            }
            if (waitTime > 0) {
                await this._sleep(waitTime);
                continue;
            }
            // Pop ready item
            const item = this.queue.splice(readyIndex, 1)[0];
            const execTime = Date.now();
            this.lastGlobalTime = execTime;
            this.lastChatTimes.set(item.chatKey, execTime);
            // Clean up old chat timestamps
            if (this.lastChatTimes.size > 2000) {
                const cutoff = execTime - 10000;
                for (const [key, timestamp] of this.lastChatTimes.entries()) {
                    if (timestamp < cutoff) {
                        this.lastChatTimes.delete(key);
                    }
                }
            }
            // Execute without blocking the queue loop
            (async () => {
                try {
                    const result = await item.execute();
                    item.resolve(result);
                }
                catch (err) {
                    item.reject(err);
                }
            })();
        }
        this.processing = false;
    }
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.RateLimiter = RateLimiter;
/**
 * Executes a function, catching Telegram FLOOD_WAIT errors and retrying automatically.
 */
async function executeWithFloodWait(fn, opts = {}) {
    const autoFlood = opts.autoFloodWait !== false;
    const maxWait = opts.maxFloodWait || 60;
    while (true) {
        try {
            return await fn();
        }
        catch (error) {
            const isFlood = error?.errorMessage === 'FLOOD' ||
                (typeof error?.message === 'string' && /FLOOD_WAIT_(\d+)|A wait of (\d+) seconds is required/i.test(error.message));
            if (!isFlood || !autoFlood) {
                throw error;
            }
            // Extract seconds
            let seconds = error.seconds;
            if (!seconds && error.message) {
                const match = error.message.match(/FLOOD_WAIT_(\d+)|wait of (\d+) seconds/i);
                if (match) {
                    seconds = parseInt(match[1] || match[2], 10);
                }
            }
            if (!seconds) {
                seconds = 5;
            }
            if (seconds > maxWait) {
                throw new Error(`FloodWait exceeded max threshold of ${maxWait}s (required: ${seconds}s)`);
            }
            debug(`FloodWait intercepted: waiting ${seconds}s before retry...`);
            if (typeof opts.onFloodWait === 'function') {
                opts.onFloodWait(seconds);
            }
            await new Promise(resolve => setTimeout(resolve, (seconds + 0.5) * 1000));
        }
    }
}
//# sourceMappingURL=RateLimiter.js.map