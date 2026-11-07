"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSessionManager = exports.MemorySessionStorage = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zerogram:session');
/**
 * In-Memory session storage (ideal for ephemeral bots, testing, or serverless).
 */
class MemorySessionStorage {
    data;
    constructor(initialData = '') {
        this.data = initialData;
    }
    async load() {
        return this.data;
    }
    async save(sessionData) {
        this.data = sessionData;
    }
    async delete() {
        this.data = '';
    }
}
exports.MemorySessionStorage = MemorySessionStorage;
/**
 * File-based session manager with atomic writes and secure permissions (0o600 / 0o700).
 */
class FileSessionManager {
    sessionsDir;
    sessionFile;
    constructor(botToken, sessionsDir = 'sessions') {
        this.sessionsDir = node_path_1.default.resolve(sessionsDir);
        // Sanitize bot id to prevent path traversal
        const rawId = botToken ? botToken.split(':')[0] : 'default';
        const sanitizedId = rawId.replace(/[^a-zA-Z0-9_-]/g, '') || 'session';
        this.sessionFile = node_path_1.default.join(this.sessionsDir, `${sanitizedId}.session`);
    }
    /**
     * Ensures session directory exists with restrictive permissions (0o700).
     */
    async _ensureDir() {
        try {
            if (!node_fs_1.default.existsSync(this.sessionsDir)) {
                await promises_1.default.mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
                debug(`Sessions directory created at ${this.sessionsDir}`);
            }
            else {
                // Ensure existing dir has restrictive permissions on POSIX
                try {
                    await promises_1.default.chmod(this.sessionsDir, 0o700);
                }
                catch {
                    // Ignore on non-POSIX / Windows
                }
            }
        }
        catch (error) {
            debug('Error ensuring sessions directory:', error);
            throw error;
        }
    }
    /**
     * Loads existing session from file.
     */
    async load() {
        try {
            await this._ensureDir();
            if (node_fs_1.default.existsSync(this.sessionFile)) {
                const data = await promises_1.default.readFile(this.sessionFile, 'utf8');
                debug(`Session loaded from ${this.sessionFile}`);
                return data.trim();
            }
            debug('No existing session file found');
            return '';
        }
        catch (error) {
            debug('Error loading session:', error);
            return '';
        }
    }
    /**
     * Atomically saves session data using temporary file and atomic rename.
     * Guarantees zero file corruption on crashes.
     */
    async save(sessionData) {
        try {
            await this._ensureDir();
            const tempFile = `${this.sessionFile}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
            // Write with restrictive 0o600 permissions
            await promises_1.default.writeFile(tempFile, sessionData, { encoding: 'utf8', mode: 0o600 });
            // Atomic rename
            await promises_1.default.rename(tempFile, this.sessionFile);
            debug(`Session saved atomically to ${this.sessionFile}`);
        }
        catch (error) {
            debug('Error saving session atomically:', error);
            throw error;
        }
    }
    /**
     * Deletes the session file safely.
     */
    async delete() {
        try {
            if (node_fs_1.default.existsSync(this.sessionFile)) {
                await promises_1.default.unlink(this.sessionFile);
                debug(`Session deleted: ${this.sessionFile}`);
            }
        }
        catch (error) {
            debug('Error deleting session:', error);
            throw error;
        }
    }
}
exports.FileSessionManager = FileSessionManager;
// Backward compatibility default export
exports.default = FileSessionManager;
//# sourceMappingURL=Session.js.map