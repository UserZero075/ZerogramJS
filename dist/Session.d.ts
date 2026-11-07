import type { SessionStorage } from './types/index.js';
/**
 * In-Memory session storage (ideal for ephemeral bots, testing, or serverless).
 */
export declare class MemorySessionStorage implements SessionStorage {
    private data;
    constructor(initialData?: string);
    load(): Promise<string>;
    save(sessionData: string): Promise<void>;
    delete(): Promise<void>;
}
/**
 * File-based session manager with atomic writes and secure permissions (0o600 / 0o700).
 */
export declare class FileSessionManager implements SessionStorage {
    readonly sessionsDir: string;
    readonly sessionFile: string;
    constructor(botToken: string, sessionsDir?: string);
    /**
     * Ensures session directory exists with restrictive permissions (0o700).
     */
    private _ensureDir;
    /**
     * Loads existing session from file.
     */
    load(): Promise<string>;
    /**
     * Atomically saves session data using temporary file and atomic rename.
     * Guarantees zero file corruption on crashes.
     */
    save(sessionData: string): Promise<void>;
    /**
     * Deletes the session file safely.
     */
    delete(): Promise<void>;
}
export default FileSessionManager;
//# sourceMappingURL=Session.d.ts.map