import type { TelegramClient } from 'telegram';
import type { Readable } from 'stream';
import type bigInt from 'big-integer';

export type ZerogramStatus = 'disconnected' | 'connecting' | 'connected' | 'stopping' | 'stopped';

export interface RateLimiterOptions {
    enabled?: boolean;
    /** Max global requests per second (default: 30) */
    globalLimit?: number;
    /** Max requests per second per chat (default: 1) */
    chatLimit?: number;
    /** Max queue capacity before rejecting (default: 1000) */
    maxQueueSize?: number;
}

export interface ZerogramOptions {
    /** Enable debug logging via debug('zerogram') */
    debug?: boolean;
    /** Directory for local session files (default: 'sessions') */
    sessionsDir?: string;
    /** Custom session storage provider */
    sessionStorage?: SessionStorage;
    /** Max connection retry attempts (default: 3) */
    maxRetries?: number;
    /** Delay between retries in milliseconds (default: 2000) */
    retryDelay?: number;
    /** TelegramClient connection retries (default: 3) */
    connectionRetries?: number;
    /** Use WebSocket transport (default: true) */
    useWSS?: boolean;
    /** Max concurrent media downloads (default: 1) */
    maxConcurrentDownloads?: number;
    /** Bot username for group /command@botname routing */
    botUsername?: string;
    /** Automatically register SIGINT/SIGTERM handlers (default: false for library safety) */
    autoShutdown?: boolean;
    /** Rate limiting configuration */
    rateLimiter?: RateLimiterOptions | boolean;
    /** Auto-retry on Telegram FloodWaitError (default: true) */
    autoFloodWait?: boolean;
    /** Maximum flood wait in seconds to automatically wait for (default: 60) */
    maxFloodWait?: number;
}

export interface SessionStorage {
    load(): Promise<string>;
    save(sessionData: string): Promise<void>;
    delete(): Promise<void>;
}

export interface UserInfo {
    id: string;
    isBot?: boolean;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
}

export interface ChatInfo {
    id: string;
    type: 'private' | 'group' | 'supergroup' | 'channel' | 'unknown';
    title?: string;
    username?: string;
}

export interface NormalizedMessage {
    id: number;
    text: string;
    message?: string;
    date?: number;
    peerId?: any;
    fromId?: any;
    replyTo?: {
        replyToMsgId?: number;
        msgId?: number;
        [key: string]: any;
    };
    media?: any;
    out?: boolean;
    [key: string]: any;
}

export type ParseMode = 'html' | 'markdown' | 'markdownv2' | 'raw';

export interface SendOptions {
    parseMode?: ParseMode;
    replyTo?: number;
    buttons?: any;
    silent?: boolean;
    scheduleDate?: number;
    background?: boolean;
    clearDraft?: boolean;
    noforwards?: boolean;
    [key: string]: any;
}

export interface EditOptions {
    parseMode?: ParseMode;
    buttons?: any;
    noWebpage?: boolean;
    [key: string]: any;
}

export interface SendFileOptions extends SendOptions {
    file?: any;
    caption?: string;
    thumb?: any;
    forceDocument?: boolean;
    supportsStreaming?: boolean;
    voiceNote?: boolean;
    videoNote?: boolean;
    attributes?: any[];
}

export interface AnswerCallbackOptions {
    alert?: boolean;
    url?: string;
    cacheTime?: number;
}

export interface DownloadProgress {
    downloadedBytes: number;
    totalBytes: number;
    speed: number;
    percent: number;
    delta: number;
    elapsed: number;
}

export interface DownloadOptions {
    filePath?: string;
    controller?: AbortController;
    onProgress?: (progress: DownloadProgress) => void;
    maxBytes?: number;
}

export interface StreamOptions {
    controller?: AbortController;
    requestSize?: number;
    chunkSize?: number;
    onProgress?: (progress: Omit<DownloadProgress, 'delta'>) => void;
}

export interface ByteRange {
    start?: number;
    end?: number;
}

export interface BatchProgress extends DownloadProgress {
    index: number;
    total: number;
    fileName: string;
    overallDownloaded: number;
    overallTotal: number;
    overallPercent: number;
}

export interface BatchDownloadOptions {
    dir?: string;
    controller?: AbortController;
    concurrency?: number;
    onProgress?: (progress: BatchProgress) => void;
}

export interface BatchDownloadResult {
    filePath: string;
    buffer?: Buffer;
    error?: Error;
    message: any;
}

export interface ThumbnailOptions {
    seek?: number;
    width?: number;
    timeout?: number;
}

export type ChatAction =
    | 'typing'
    | 'upload_photo'
    | 'record_video'
    | 'upload_video'
    | 'record_audio'
    | 'upload_audio'
    | 'upload_document'
    | 'find_location'
    | 'record_round'
    | 'upload_round'
    | 'cancel';

export interface Context<SessionData = any> {
    bot: any;
    client: TelegramClient;
    update: any;
    message: NormalizedMessage;
    from: UserInfo | null;
    chat: ChatInfo | null;
    chatId: string | null;
    senderId: string | null;
    isCallback: boolean;
    callbackData: string | null;
    payload: string | null;
    match: RegExpMatchArray | null;
    session: SessionData;

    reply(text: string, opts?: SendOptions): Promise<any>;
    send(text: string, opts?: SendOptions): Promise<any>;
    sendFile(file: any, opts?: SendFileOptions): Promise<any>;
    safeEdit(newText: string, opts?: EditOptions): Promise<any>;
    editMessageText(newText: string, opts?: EditOptions): Promise<any>;
    editMessageReplyMarkup(buttons: any): Promise<any>;
    deleteMessage(messageId?: number): Promise<boolean>;
    sendChatAction(action: ChatAction): Promise<boolean>;
    answerCallback(text?: string, opts?: AnswerCallbackOptions): Promise<any>;

    getReplyMessage(): Promise<any>;
    getMessages(ids: number | number[]): Promise<any[]>;
    thumbFromVideo(bufferOrPath: Buffer | string, opts?: ThumbnailOptions): Promise<Buffer>;

    downloadMedia(msg?: any, opts?: DownloadOptions): Promise<Buffer | string>;
    downloadMediaStream(msg?: any, opts?: StreamOptions): Readable;
    downloadStream(msg?: any, range?: ByteRange | null, controller?: AbortController | null, opts?: StreamOptions): Readable;
    downloadMediaBatch(msgs: any[], opts?: BatchDownloadOptions): Promise<BatchDownloadResult[]>;
    downloadControllers: Map<string, AbortController>;
}

export type NextFunction = () => Promise<void>;
export type Middleware<S = any> = (ctx: Context<S>, next: NextFunction) => Promise<void> | void;
export type CommandHandler<S = any> = (ctx: Context<S>, args: string[]) => Promise<any> | any;
export type CallbackHandler<S = any> = (ctx: Context<S>) => Promise<any> | any;
export type HearsHandler<S = any> = (ctx: Context<S>) => Promise<any> | any;
export type EventHandler<S = any> = (ctx: Context<S>) => Promise<any> | any;
