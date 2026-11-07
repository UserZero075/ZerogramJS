import fs from 'node:fs';
import path from 'node:path';
import createDebug from 'debug';

const debug = createDebug('zerogram:loader');

export interface LoaderOptions {
    recursive?: boolean;
    extensions?: string[];
}

/**
 * Loads modules (commands or callbacks) automatically from a directory.
 */
export async function loadModules(
    dir: string,
    mode: 'command' | 'callback',
    inject: (name: string, handler: any) => void,
    opts: LoaderOptions = {}
): Promise<{ loaded: string[]; failed: string[] }> {
    const { recursive = true, extensions = ['.js', '.cjs', '.mjs', '.ts'] } = opts;
    const resolvedDir = path.resolve(dir);
    const loaded: string[] = [];
    const failed: string[] = [];

    if (!fs.existsSync(resolvedDir)) {
        debug(`Directory not found: ${resolvedDir}`);
        return { loaded, failed };
    }

    const scanDir = (currentDir: string): string[] => {
        let results: string[] = [];
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory() && recursive) {
                results = results.concat(scanDir(fullPath));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (extensions.includes(ext) && !entry.name.endsWith('.d.ts')) {
                    results.push(fullPath);
                }
            }
        }
        return results;
    };

    const files = scanDir(resolvedDir);
    debug(`Found ${files.length} module files in ${resolvedDir}`);

    for (const filePath of files) {
        const fileExt = path.extname(filePath);
        const fileName = path.basename(filePath, fileExt);

        try {
            // Support both CommonJS and ES Modules
            let mod: any;
            try {
                mod = require(filePath);
            } catch {
                mod = await import(filePath);
            }

            if (mode === 'command') {
                const handler = typeof mod === 'function' ? mod : mod.default;
                if (typeof handler === 'function') {
                    inject(fileName, handler);
                    loaded.push(fileName);
                    debug(`Command module loaded: ${fileName}`);
                } else {
                    debug(`Skipped ${fileName}: no function or default export found`);
                }
            } else if (mode === 'callback') {
                const entries = mod.default && typeof mod.default === 'object' ? mod.default : mod;
                if (typeof entries === 'object' && entries !== null) {
                    for (const [key, fn] of Object.entries(entries)) {
                        if (typeof fn === 'function') {
                            inject(key, fn);
                            loaded.push(key);
                            debug(`Callback module registered: ${key}`);
                        }
                    }
                } else if (typeof entries === 'function') {
                    inject(fileName, entries);
                    loaded.push(fileName);
                    debug(`Callback module registered: ${fileName}`);
                }
            }
        } catch (err: any) {
            debug(`Failed to load ${filePath}:`, err.message);
            failed.push(filePath);
        }
    }

    return { loaded, failed };
}

export default { loadModules };
