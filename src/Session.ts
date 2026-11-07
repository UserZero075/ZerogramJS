import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import createDebug from 'debug';
import type { SessionStorage } from './types/index.js';

const debug = createDebug('zerogram:session');

/**
 * In-Memory session storage (ideal for ephemeral bots, testing, or serverless).
 */
export class MemorySessionStorage implements SessionStorage {
    private data: string;

    constructor(initialData: string = '') {
        this.data = initialData;
    }

    async load(): Promise<string> {
        return this.data;
    }

    async save(sessionData: string): Promise<void> {
        this.data = sessionData;
    }

    async delete(): Promise<void> {
        this.data = '';
    }
}

/**
 * File-based session manager with atomic writes and secure permissions (0o600 / 0o700).
 */
export class FileSessionManager implements SessionStorage {
    public readonly sessionsDir: string;
    public readonly sessionFile: string;

    constructor(botToken: string, sessionsDir: string = 'sessions') {
        this.sessionsDir = path.resolve(sessionsDir);
        // Sanitize bot id to prevent path traversal
        const rawId = botToken ? botToken.split(':')[0] : 'default';
        const sanitizedId = rawId.replace(/[^a-zA-Z0-9_-]/g, '') || 'session';
        this.sessionFile = path.join(this.sessionsDir, `${sanitizedId}.session`);
    }

    /**
     * Ensures session directory exists with restrictive permissions (0o700).
     */
    private async _ensureDir(): Promise<void> {
        try {
            if (!fsSync.existsSync(this.sessionsDir)) {
                await fs.mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
                debug(`Sessions directory created at ${this.sessionsDir}`);
            } else {
                // Ensure existing dir has restrictive permissions on POSIX
                try {
                    await fs.chmod(this.sessionsDir, 0o700);
                } catch {
                    // Ignore on non-POSIX / Windows
                }
            }
        } catch (error) {
            debug('Error ensuring sessions directory:', error);
            throw error;
        }
    }

    /**
     * Loads existing session from file.
     */
    async load(): Promise<string> {
        try {
            await this._ensureDir();

            if (fsSync.existsSync(this.sessionFile)) {
                const data = await fs.readFile(this.sessionFile, 'utf8');
                debug(`Session loaded from ${this.sessionFile}`);
                return data.trim();
            }

            debug('No existing session file found');
            return '';
        } catch (error) {
            debug('Error loading session:', error);
            return '';
        }
    }

    /**
     * Atomically saves session data using temporary file and atomic rename.
     * Guarantees zero file corruption on crashes.
     */
    async save(sessionData: string): Promise<void> {
        try {
            await this._ensureDir();

            const tempFile = `${this.sessionFile}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

            // Write with restrictive 0o600 permissions
            await fs.writeFile(tempFile, sessionData, { encoding: 'utf8', mode: 0o600 });

            // Atomic rename
            await fs.rename(tempFile, this.sessionFile);

            debug(`Session saved atomically to ${this.sessionFile}`);
        } catch (error) {
            debug('Error saving session atomically:', error);
            throw error;
        }
    }

    /**
     * Deletes the session file safely.
     */
    async delete(): Promise<void> {
        try {
            if (fsSync.existsSync(this.sessionFile)) {
                await fs.unlink(this.sessionFile);
                debug(`Session deleted: ${this.sessionFile}`);
            }
        } catch (error) {
            debug('Error deleting session:', error);
            throw error;
        }
    }
}

// Backward compatibility default export
export default FileSessionManager;
