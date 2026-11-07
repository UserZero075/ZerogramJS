const { FileSessionManager, MemorySessionStorage } = require('../dist/Session.js');
module.exports = FileSessionManager;
module.exports.FileSessionManager = FileSessionManager;
module.exports.MemorySessionStorage = MemorySessionStorage;
module.exports.default = FileSessionManager;
