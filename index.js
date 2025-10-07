/**
 * Zerogram 2.1 - Modern Telegram Bot Framework
 * @module zerogram
 */

const Zerogram = require('./lib/Zerogram');
const { parseMarkdown, markdownToHtml, markdownToMarkdownV2 } = require('./utils/markdown');
const { FFMpegUtil } = require('./utils/ffmpeg');
const { loadModules } = require('./utils/loader');

// Exportaciones principales
module.exports = Zerogram;
module.exports.Zerogram = Zerogram;
module.exports.parseMarkdown = parseMarkdown;
module.exports.markdownToHtml = markdownToHtml;
module.exports.markdownToMarkdownV2 = markdownToMarkdownV2;
module.exports.FFMpegUtil = FFMpegUtil;
module.exports.loadModules = loadModules;