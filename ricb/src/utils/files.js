const fs = require('fs');
const path = require('path');

const CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.csv': 'text/csv',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Streams a file whose path was stored in the database as a download.
 * Stored paths are absolute for new uploads and relative to the server's working
 * directory for older rows; path.resolve handles both.
 * Returns false (after answering 404) when there is nothing to send.
 */
const sendStoredFile = (res, storedPath, downloadName) => {
    const filePath = storedPath ? path.resolve(storedPath) : null;
    if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found', message: 'File not found' });
        return false;
    }
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
    if (type) res.type(type);
    res.download(filePath, downloadName || path.basename(filePath));
    return true;
};

/**
 * Resolves a client-supplied file name inside a fixed directory, rejecting any
 * attempt to climb out of it (../, absolute paths, drive letters).
 */
const resolveInside = (directory, fileName) => {
    const base = path.resolve(directory);
    const target = path.resolve(base, String(fileName || ''));
    return target.startsWith(base + path.sep) ? target : null;
};

module.exports = { sendStoredFile, resolveInside };
