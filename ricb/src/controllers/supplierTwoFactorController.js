const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const auditLogger = require('../utils/auditLogger');
const { dbGet, dbRun } = require('../db');

/** Checks a supplier's TOTP code or single-use backup code (consuming it). */
exports.verifySupplierSecondFactor = async (supplierId, code, isBackupCode) => {
    const supplier = await dbGet('SELECT two_factor_secret, two_factor_enabled, backup_codes FROM suppliers WHERE id = ?', [supplierId]);
    if (!supplier || !supplier.two_factor_enabled || !code) return false;
    if (!isBackupCode) {
        return speakeasy.totp.verify({ secret: supplier.two_factor_secret, encoding: 'base32', token: String(code), window: 2 });
    }
    const backupCodes = JSON.parse(supplier.backup_codes || '[]');
    const index = backupCodes.indexOf(String(code).toUpperCase());
    if (index === -1) return false;
    backupCodes.splice(index, 1);
    await dbRun('UPDATE suppliers SET backup_codes = ? WHERE id = ?', [JSON.stringify(backupCodes), supplierId]);
    return true;
};

// Generate 2FA secret and QR code for setup
exports.setup2FA = async (req, res) => {
    const supplierId = req.supplier.id;

    try {
        // Check if supplier already has 2FA enabled
        const supplier = await dbGet(
            'SELECT two_factor_enabled, two_factor_secret FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (supplier.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is already enabled for this account' });
        }

        // Generate a new secret
        const secret = speakeasy.generateSecret({
            name: `RIC Tender Supplier (${req.supplier.username})`,
            issuer: 'RIC Tender Automation',
            length: 32
        });

        // Store the temporary secret (not yet enabled)
        await dbRun(
            'UPDATE suppliers SET two_factor_secret = ? WHERE id = ?',
            [secret.base32, supplierId]
        );

        // Generate QR code
        const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

        // Log audit
        await auditLogger.record(req, 'SUPPLIER_2FA_SETUP_INITIATED', 'Supplier initiated 2FA setup');

        res.json({
            secret: secret.base32,
            qrCode: qrCodeDataURL,
            manualEntryKey: secret.base32
        });

    } catch (err) {
        console.error('Supplier 2FA setup error:', err);
        res.status(500).json({ error: 'Error setting up 2FA' });
    }
};

// Verify and enable 2FA
exports.enable2FA = async (req, res) => {
    const { token } = req.body;
    const supplierId = req.supplier.id;

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }

    try {
        // Get the supplier's secret
        const supplier = await dbGet(
            'SELECT two_factor_secret, two_factor_enabled FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (!supplier.two_factor_secret) {
            return res.status(400).json({ error: 'No 2FA setup found. Please setup 2FA first.' });
        }

        if (supplier.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is already enabled' });
        }

        // Verify the token
        const verified = speakeasy.totp.verify({
            secret: supplier.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 2 // Allow 2 time steps for clock drift
        });

        if (!verified) {
            await auditLogger.record(req, 'SUPPLIER_2FA_ENABLE_FAILED', 'Failed 2FA verification attempt during enable');
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Generate backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Enable 2FA
        await dbRun(
            'UPDATE suppliers SET two_factor_enabled = 1, backup_codes = ? WHERE id = ?',
            [JSON.stringify(backupCodes), supplierId]
        );

        // Log audit
        await auditLogger.record(req, 'SUPPLIER_2FA_ENABLED', 'Supplier successfully enabled 2FA');

        res.json({
            message: '2FA has been successfully enabled',
            backupCodes: backupCodes
        });

    } catch (err) {
        console.error('Supplier 2FA enable error:', err);
        res.status(500).json({ error: 'Error enabling 2FA' });
    }
};

// Verify 2FA token (for login or sensitive operations)
exports.verify2FA = async (req, res) => {
    const { token, backupCode } = req.body;
    const supplierId = req.supplier.id;

    if (!token && !backupCode) {
        return res.status(400).json({ error: 'Verification token or backup code is required' });
    }

    try {
        // Get supplier's 2FA settings
        const supplier = await dbGet(
            'SELECT two_factor_secret, two_factor_enabled, backup_codes FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (!supplier.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is not enabled for this account' });
        }

        let verified = false;
        let usedBackupCode = false;

        if (backupCode) {
            // Verify backup code
            const backupCodes = JSON.parse(supplier.backup_codes || '[]');
            const codeIndex = backupCodes.indexOf(backupCode.toUpperCase());
            
            if (codeIndex !== -1) {
                verified = true;
                usedBackupCode = true;
                
                // Remove used backup code
                backupCodes.splice(codeIndex, 1);
                await dbRun(
                    'UPDATE suppliers SET backup_codes = ? WHERE id = ?',
                    [JSON.stringify(backupCodes), supplierId]
                );

                await auditLogger.record(req, 'SUPPLIER_2FA_BACKUP_CODE_USED', 'Supplier used backup code for 2FA verification');
            }
        } else {
            // Verify TOTP token
            verified = speakeasy.totp.verify({
                secret: supplier.two_factor_secret,
                encoding: 'base32',
                token: token,
                window: 2
            });
        }

        if (!verified) {
            await auditLogger.record(req, 'SUPPLIER_2FA_VERIFICATION_FAILED', 'Failed 2FA verification attempt');
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        await auditLogger.record(req, 'SUPPLIER_2FA_VERIFICATION_SUCCESS', `Successful 2FA verification${usedBackupCode ? ' using backup code' : ''}`);

        res.json({ 
            message: '2FA verification successful',
            backupCodesRemaining: usedBackupCode ? JSON.parse(supplier.backup_codes || '[]').length - 1 : undefined
        });

    } catch (err) {
        console.error('Supplier 2FA verification error:', err);
        res.status(500).json({ error: 'Error verifying 2FA' });
    }
};

// Disable 2FA
exports.disable2FA = async (req, res) => {
    const { token, backupCode } = req.body;
    const supplierId = req.supplier.id;

    if (!token && !backupCode) {
        return res.status(400).json({ error: 'Verification token or backup code is required to disable 2FA' });
    }

    try {
        // Get supplier's 2FA settings
        const supplier = await dbGet(
            'SELECT two_factor_secret, two_factor_enabled, backup_codes FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (!supplier.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is not enabled for this account' });
        }

        let verified = false;

        if (backupCode) {
            // Verify backup code
            const backupCodes = JSON.parse(supplier.backup_codes || '[]');
            verified = backupCodes.includes(backupCode.toUpperCase());
        } else {
            // Verify TOTP token
            verified = speakeasy.totp.verify({
                secret: supplier.two_factor_secret,
                encoding: 'base32',
                token: token,
                window: 2
            });
        }

        if (!verified) {
            await auditLogger.record(req, 'SUPPLIER_2FA_DISABLE_FAILED', 'Failed 2FA verification attempt during disable');
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Disable 2FA
        await dbRun(
            'UPDATE suppliers SET two_factor_enabled = 0, two_factor_secret = NULL, backup_codes = NULL WHERE id = ?',
            [supplierId]
        );

        await auditLogger.record(req, 'SUPPLIER_2FA_DISABLED', 'Supplier disabled 2FA');

        res.json({ message: '2FA has been successfully disabled' });

    } catch (err) {
        console.error('Supplier 2FA disable error:', err);
        res.status(500).json({ error: 'Error disabling 2FA' });
    }
};

// Get 2FA status
exports.get2FAStatus = async (req, res) => {
    const supplierId = req.supplier.id;

    try {
        const supplier = await dbGet(
            'SELECT two_factor_enabled, backup_codes FROM suppliers WHERE id = ?',
            [supplierId]
        );

        const backupCodes = supplier.backup_codes ? JSON.parse(supplier.backup_codes) : [];

        res.json({
            enabled: !!supplier.two_factor_enabled,
            backupCodesCount: backupCodes.length
        });

    } catch (err) {
        console.error('Supplier 2FA status error:', err);
        res.status(500).json({ error: 'Error getting 2FA status' });
    }
};

// Regenerate backup codes
exports.regenerateBackupCodes = async (req, res) => {
    const { token } = req.body;
    const supplierId = req.supplier.id;

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }

    try {
        // Get supplier's 2FA settings
        const supplier = await dbGet(
            'SELECT two_factor_secret, two_factor_enabled FROM suppliers WHERE id = ?',
            [supplierId]
        );

        if (!supplier.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is not enabled for this account' });
        }

        // Verify the token
        const verified = speakeasy.totp.verify({
            secret: supplier.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 2
        });

        if (!verified) {
            await auditLogger.record(req, 'SUPPLIER_2FA_BACKUP_REGEN_FAILED', 'Failed 2FA verification attempt during backup code regeneration');
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Generate new backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Update backup codes
        await dbRun(
            'UPDATE suppliers SET backup_codes = ? WHERE id = ?',
            [JSON.stringify(backupCodes), supplierId]
        );

        await auditLogger.record(req, 'SUPPLIER_2FA_BACKUP_REGENERATED', 'Supplier regenerated backup codes');

        res.json({
            message: 'Backup codes have been regenerated',
            backupCodes: backupCodes
        });

    } catch (err) {
        console.error('Supplier 2FA backup codes regeneration error:', err);
        res.status(500).json({ error: 'Error regenerating backup codes' });
    }
};
