const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const debug = require('debug')('zerogram:session');

/**
 * Maneja la persistencia de sesiones
 */
class SessionManager {
    constructor(botToken, sessionsDir) {
        this.sessionsDir = path.resolve(sessionsDir);
        this.sessionFile = path.join(
            this.sessionsDir,
            `${botToken.split(':')[0]}.session`
        );
    }

    /**
     * Carga una sesión existente
     * @returns {Promise<string>} Session data o string vacío
     */
    async load() {
        try {
            // Crear directorio si no existe
            if (!fsSync.existsSync(this.sessionsDir)) {
                await fs.mkdir(this.sessionsDir, { recursive: true });
                debug('Sessions directory created');
            }

            // Cargar archivo de sesión
            if (fsSync.existsSync(this.sessionFile)) {
                const data = await fs.readFile(this.sessionFile, 'utf8');
                debug('Session loaded from file');
                return data;
            }

            debug('No existing session found');
            return '';
        } catch (error) {
            debug('Error loading session:', error);
            return '';
        }
    }

    /**
     * Guarda la sesión actual
     * @param {string} sessionData - Datos de sesión a guardar
     * @returns {Promise<void>}
     */
    async save(sessionData) {
        try {
            await fs.writeFile(this.sessionFile, sessionData, 'utf8');
            debug('Session saved successfully');
        } catch (error) {
            debug('Error saving session:', error);
            throw error;
        }
    }

    /**
     * Elimina la sesión
     * @returns {Promise<void>}
     */
    async delete() {
        try {
            if (fsSync.existsSync(this.sessionFile)) {
                await fs.unlink(this.sessionFile);
                debug('Session deleted');
            }
        } catch (error) {
            debug('Error deleting session:', error);
            throw error;
        }
    }
}

module.exports = SessionManager;