import type { RateLimiterOptions } from './types/index.js';
/**
 * Token-bucket based Rate Limiter for Telegram MTProto API calls.
 * Throttles both global request rate and per-chat request rate.
 */
export declare class RateLimiter {
    readonly enabled: boolean;
    readonly globalLimit: number;
    readonly chatLimit: number;
    readonly maxQueueSize: number;
    private queue;
    private processing;
    private lastGlobalTime;
    private lastChatTimes;
    constructor(options?: RateLimiterOptions);
    /**
     * Enqueues a task to be executed within rate limits.
     */
    enqueue<T>(chatId: string | number | null | undefined, task: () => Promise<T>): Promise<T>;
    private _scheduleNext;
    private _processLoop;
    private _sleep;
}
export interface FloodWaitOptions {
    autoFloodWait?: boolean;
    maxFloodWait?: number;
    onFloodWait?: (seconds: number) => void;
}
/**
 * Executes a function, catching Telegram FLOOD_WAIT errors and retrying automatically.
 */
export declare function executeWithFloodWait<T>(fn: () => Promise<T>, opts?: FloodWaitOptions): Promise<T>;
//# sourceMappingURL=RateLimiter.d.ts.map