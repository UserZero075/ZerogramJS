"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModules = loadModules;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zerogram:loader');
/**
 * Loads modules (commands or callbacks) automatically from a directory.
 */
async function loadModules(dir, mode, inject, opts = {}) {
    const { recursive = true, extensions = ['.js', '.cjs', '.mjs', '.ts'] } = opts;
    const resolvedDir = node_path_1.default.resolve(dir);
    const loaded = [];
    const failed = [];
    if (!node_fs_1.default.existsSync(resolvedDir)) {
        debug(`Directory not found: ${resolvedDir}`);
        return { loaded, failed };
    }
    const scanDir = (currentDir) => {
        let results = [];
        const entries = node_fs_1.default.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(currentDir, entry.name);
            if (entry.isDirectory() && recursive) {
                results = results.concat(scanDir(fullPath));
            }
            else if (entry.isFile()) {
                const ext = node_path_1.default.extname(entry.name);
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
        const fileExt = node_path_1.default.extname(filePath);
        const fileName = node_path_1.default.basename(filePath, fileExt);
        try {
            // Support both CommonJS and ES Modules
            let mod;
            try {
                mod = require(filePath);
            }
            catch {
                mod = await Promise.resolve(`${filePath}`).then(s => __importStar(require(s)));
            }
            if (mode === 'command') {
                const handler = typeof mod === 'function' ? mod : mod.default;
                if (typeof handler === 'function') {
                    inject(fileName, handler);
                    loaded.push(fileName);
                    debug(`Command module loaded: ${fileName}`);
                }
                else {
                    debug(`Skipped ${fileName}: no function or default export found`);
                }
            }
            else if (mode === 'callback') {
                const entries = mod.default && typeof mod.default === 'object' ? mod.default : mod;
                if (typeof entries === 'object' && entries !== null) {
                    for (const [key, fn] of Object.entries(entries)) {
                        if (typeof fn === 'function') {
                            inject(key, fn);
                            loaded.push(key);
                            debug(`Callback module registered: ${key}`);
                        }
                    }
                }
                else if (typeof entries === 'function') {
                    inject(fileName, entries);
                    loaded.push(fileName);
                    debug(`Callback module registered: ${fileName}`);
                }
            }
        }
        catch (err) {
            debug(`Failed to load ${filePath}:`, err.message);
            failed.push(filePath);
        }
    }
    return { loaded, failed };
}
exports.default = { loadModules };
//# sourceMappingURL=loader.js.map