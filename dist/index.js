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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
const Zerogram_js_1 = require("./Zerogram.js");
const Router_js_1 = require("./Router.js");
const Context_js_1 = require("./Context.js");
const Session_js_1 = require("./Session.js");
const Downloader_js_1 = require("./Downloader.js");
const RateLimiter_js_1 = require("./RateLimiter.js");
const markdown_js_1 = require("./utils/markdown.js");
const ffmpeg_js_1 = require("./utils/ffmpeg.js");
const loader_js_1 = require("./utils/loader.js");
// Re-export types
__exportStar(require("./types/index.js"), exports);
// Explicit static assignments for CJS-ESM static analysis
const ExportTarget = Zerogram_js_1.Zerogram;
ExportTarget.Zerogram = Zerogram_js_1.Zerogram;
ExportTarget.default = Zerogram_js_1.Zerogram;
ExportTarget.Router = Router_js_1.Router;
ExportTarget.ContextFactory = Context_js_1.ContextFactory;
ExportTarget.FileSessionManager = Session_js_1.FileSessionManager;
ExportTarget.MemorySessionStorage = Session_js_1.MemorySessionStorage;
ExportTarget.Downloader = Downloader_js_1.Downloader;
ExportTarget.downloadControllers = Downloader_js_1.downloadControllers;
ExportTarget.RateLimiter = RateLimiter_js_1.RateLimiter;
ExportTarget.executeWithFloodWait = RateLimiter_js_1.executeWithFloodWait;
ExportTarget.markdownToHtml = markdown_js_1.markdownToHtml;
ExportTarget.markdownToMarkdownV2 = markdown_js_1.markdownToMarkdownV2;
ExportTarget.escapeHtml = markdown_js_1.escapeHtml;
ExportTarget.escapeMarkdownV2 = markdown_js_1.escapeMarkdownV2;
ExportTarget.parseMarkdown = markdown_js_1.parseMarkdown;
ExportTarget.FFMpegUtil = ffmpeg_js_1.FFMpegUtil;
ExportTarget.loadModules = loader_js_1.loadModules;
// Set module.exports properties for Node.js static lexer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportTarget;
    module.exports.default = Zerogram_js_1.Zerogram;
    module.exports.Zerogram = Zerogram_js_1.Zerogram;
    module.exports.Router = Router_js_1.Router;
    module.exports.ContextFactory = Context_js_1.ContextFactory;
    module.exports.FileSessionManager = Session_js_1.FileSessionManager;
    module.exports.MemorySessionStorage = Session_js_1.MemorySessionStorage;
    module.exports.Downloader = Downloader_js_1.Downloader;
    module.exports.downloadControllers = Downloader_js_1.downloadControllers;
    module.exports.RateLimiter = RateLimiter_js_1.RateLimiter;
    module.exports.executeWithFloodWait = RateLimiter_js_1.executeWithFloodWait;
    module.exports.markdownToHtml = markdown_js_1.markdownToHtml;
    module.exports.markdownToMarkdownV2 = markdown_js_1.markdownToMarkdownV2;
    module.exports.escapeHtml = markdown_js_1.escapeHtml;
    module.exports.escapeMarkdownV2 = markdown_js_1.escapeMarkdownV2;
    module.exports.parseMarkdown = markdown_js_1.parseMarkdown;
    module.exports.FFMpegUtil = ffmpeg_js_1.FFMpegUtil;
    module.exports.loadModules = loader_js_1.loadModules;
}
module.exports = ExportTarget;
//# sourceMappingURL=index.js.map