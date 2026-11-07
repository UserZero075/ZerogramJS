import { Zerogram } from './Zerogram.js';
import { Router } from './Router.js';
import { ContextFactory } from './Context.js';
import { FileSessionManager, MemorySessionStorage } from './Session.js';
import { Downloader, downloadControllers } from './Downloader.js';
import { RateLimiter, executeWithFloodWait } from './RateLimiter.js';
import {
    markdownToHtml,
    markdownToMarkdownV2,
    escapeHtml,
    escapeMarkdownV2,
    parseMarkdown
} from './utils/markdown.js';
import { FFMpegUtil } from './utils/ffmpeg.js';
import { loadModules } from './utils/loader.js';

// Re-export types
export * from './types/index.js';

// Explicit static assignments for CJS-ESM static analysis
const ExportTarget: any = Zerogram;
ExportTarget.Zerogram = Zerogram;
ExportTarget.default = Zerogram;
ExportTarget.Router = Router;
ExportTarget.ContextFactory = ContextFactory;
ExportTarget.FileSessionManager = FileSessionManager;
ExportTarget.MemorySessionStorage = MemorySessionStorage;
ExportTarget.Downloader = Downloader;
ExportTarget.downloadControllers = downloadControllers;
ExportTarget.RateLimiter = RateLimiter;
ExportTarget.executeWithFloodWait = executeWithFloodWait;
ExportTarget.markdownToHtml = markdownToHtml;
ExportTarget.markdownToMarkdownV2 = markdownToMarkdownV2;
ExportTarget.escapeHtml = escapeHtml;
ExportTarget.escapeMarkdownV2 = escapeMarkdownV2;
ExportTarget.parseMarkdown = parseMarkdown;
ExportTarget.FFMpegUtil = FFMpegUtil;
ExportTarget.loadModules = loadModules;

// Set module.exports properties for Node.js static lexer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportTarget;
    module.exports.default = Zerogram;
    module.exports.Zerogram = Zerogram;
    module.exports.Router = Router;
    module.exports.ContextFactory = ContextFactory;
    module.exports.FileSessionManager = FileSessionManager;
    module.exports.MemorySessionStorage = MemorySessionStorage;
    module.exports.Downloader = Downloader;
    module.exports.downloadControllers = downloadControllers;
    module.exports.RateLimiter = RateLimiter;
    module.exports.executeWithFloodWait = executeWithFloodWait;
    module.exports.markdownToHtml = markdownToHtml;
    module.exports.markdownToMarkdownV2 = markdownToMarkdownV2;
    module.exports.escapeHtml = escapeHtml;
    module.exports.escapeMarkdownV2 = escapeMarkdownV2;
    module.exports.parseMarkdown = parseMarkdown;
    module.exports.FFMpegUtil = FFMpegUtil;
    module.exports.loadModules = loadModules;
}

// @ts-ignore
export = ExportTarget;
