const fs = require('fs');
const path = require('path');
const debug = require('debug')('zerogram:loader');

/**
 * Carga módulos automáticamente desde un directorio
 * @param {string} dir - Directorio a escanear
 * @param {string} mode - 'command' o 'callback'
 * @param {Function} inject - Función para registrar el módulo
 */
async function loadModules(dir, mode, inject) {
    if (!fs.existsSync(dir)) {
        debug(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    debug(`Loading ${files.length} modules from ${dir}`);

    for (const file of files) {
        const modulePath = path.join(dir, file);
        const moduleName = file.replace(/\.js$/, '');

        try {
            const mod = require(modulePath);

            if (mode === 'command') {
                loadCommand(moduleName, mod, inject);
            } else if (mode === 'callback') {
                loadCallbacks(file, mod, inject);
            }
        } catch (error) {
            console.error(`❌ Error loading ${file}:`, error.message);
        }
    }
}

/**
 * Carga un módulo de comando
 * @private
 */
function loadCommand(name, mod, inject) {
    if (typeof mod === 'function') {
        inject(name, mod);
        debug(`✅ Command loaded: ${name}`);
    } else if (typeof mod.default === 'function') {
        inject(name, mod.default);
        debug(`✅ Command loaded: ${name} (default export)`);
    } else {
        debug(`⚠️  Skipped ${name}: not a function`);
    }
}

/**
 * Carga callbacks de un módulo
 * @private
 */
function loadCallbacks(fileName, mod, inject) {
    debug(`📂 Loading callbacks from ${fileName}:`);

    Object.entries(mod).forEach(([key, fn]) => {
        if (typeof fn === 'function') {
            inject(key, fn);
            debug(`  ✅ Callback registered: ${key}`);
        } else {
            debug(`  ⚠️  Skipped ${key}: not a function`);
        }
    });
}

module.exports = { loadModules };