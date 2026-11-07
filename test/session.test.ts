import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileSessionManager, MemorySessionStorage } from '../src/Session.js';

describe('Session Managers', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zerogram-session-test-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('MemorySessionStorage stores and retrieves session in memory', async () => {
        const storage = new MemorySessionStorage('initial_session_data');
        assert.equal(await storage.load(), 'initial_session_data');

        await storage.save('updated_session_data');
        assert.equal(await storage.load(), 'updated_session_data');

        await storage.delete();
        assert.equal(await storage.load(), '');
    });

    test('FileSessionManager creates dir with 0o700 and atomic file with 0o600', async () => {
        const botToken = '123456789:ABCdefGHIjklMNOpqrSTU';
        const sessionsDir = path.join(tmpDir, 'sessions');
        const manager = new FileSessionManager(botToken, sessionsDir);

        // Initially empty
        const initial = await manager.load();
        assert.equal(initial, '');

        // Save session
        const sessionPayload = '1AZFxyz...MTProtoSessionData';
        await manager.save(sessionPayload);

        // Verify loaded
        const loaded = await manager.load();
        assert.equal(loaded, sessionPayload);

        // Check file permissions
        const stat = await fs.stat(manager.sessionFile);
        const mode = stat.mode & 0o777;
        assert.equal(mode, 0o600);

        // Check dir permissions
        const dirStat = await fs.stat(sessionsDir);
        const dirMode = dirStat.mode & 0o777;
        assert.equal(dirMode, 0o700);

        // Delete session
        await manager.delete();
        assert.equal(fsSync.existsSync(manager.sessionFile), false);
    });

    test('FileSessionManager sanitizes botToken against path traversal', () => {
        const maliciousToken = '../../etc/passwd:token123';
        const sessionsDir = path.join(tmpDir, 'sessions');
        const manager = new FileSessionManager(maliciousToken, sessionsDir);

        assert.ok(!manager.sessionFile.includes('../'));
        assert.ok(manager.sessionFile.startsWith(path.resolve(sessionsDir)));
    });

    test('FileSessionManager handles concurrent saves without corrupting file', async () => {
        const botToken = '987654321:XYZ';
        const sessionsDir = path.join(tmpDir, 'sessions');
        const manager = new FileSessionManager(botToken, sessionsDir);

        const saves = Array.from({ length: 20 }, (_, i) => manager.save(`session_version_${i}`));
        await Promise.all(saves);

        const finalData = await manager.load();
        assert.ok(finalData.startsWith('session_version_'));
    });
});
