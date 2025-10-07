/**
 * Estado compartido para controladores de descarga
 * Permite cancelar descargas en curso
 */
const downloadControllers = new Map();

module.exports = {
    downloadControllers
};