/**
 * One factory for every multer upload in the app, so storage location, naming,
 * size limits and type checks are consistent. Files land under ricb/<dir>
 * regardless of the process's working directory.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ROOT } = require('../config/env');

const MIME = {
    pdf: ['application/pdf'],
    word: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    image: ['image/jpeg', 'image/jpg', 'image/png'],
    spreadsheet: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
    ],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const uploadDir = (dir) => {
    const absolute = path.join(ROOT, dir);
    fs.mkdirSync(absolute, { recursive: true });
    return absolute;
};

const safeExtension = (name) => path.extname(name || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);

class UploadTypeError extends Error {}

/**
 * @param {object} options
 * @param {string} options.dir     folder under ricb/, e.g. 'uploads/knockout-documents'
 * @param {string|function} [options.prefix]  filename prefix, or (file) => prefix; defaults to the field name
 * @param {string[]|function} options.accept  allowed mime types, or (file) => allowed mime types
 * @param {string} [options.typeError]  message shown when a file's type is rejected
 * @param {number} [options.maxSize]    bytes per file, default 10MB
 */
const createUpload = ({ dir, prefix, accept, typeError = 'This file type is not allowed.', maxSize = MAX_FILE_SIZE }) => {
    const destination = uploadDir(dir);
    return multer({
        storage: multer.diskStorage({
            destination,
            filename: (req, file, cb) => {
                const base = typeof prefix === 'function' ? prefix(file) : prefix || file.fieldname;
                const unique = `${Date.now()}-${crypto.randomInt(1e9)}`;
                cb(null, `${base}-${unique}${safeExtension(file.originalname)}`);
            },
        }),
        limits: { fileSize: maxSize },
        fileFilter: (req, file, cb) => {
            const allowed = typeof accept === 'function' ? accept(file) : accept;
            if (allowed === null) return cb(new UploadTypeError('Unexpected file field.'));
            return allowed.includes(file.mimetype) ? cb(null, true) : cb(new UploadTypeError(typeError));
        },
    });
};

/** Turns upload failures into clear 400s instead of generic 500s. */
const uploadErrorHandler = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'File too large. Please upload a smaller file (10MB limit, 20MB for market survey documents).'
            : 'File upload error. Please try again.';
        return res.status(400).json({ error: message, message });
    }
    if (error instanceof UploadTypeError) {
        return res.status(400).json({ error: error.message, message: error.message });
    }
    next(error);
};

module.exports = { createUpload, uploadDir, uploadErrorHandler, MIME };
