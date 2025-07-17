const { getDatabase } = require('../config/database');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Generate 2FA secret and QR code for setup
exports.setup2FA = async (req, res) => {
    const userId = req.user.id;
    const db = getDatabase();

    try {
        // Check if user already has 2FA enabled
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (user.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is already enabled for this account' });
        }

        // Generate a new secret
        const secret = speakeasy.generateSecret({
            name: `RIC Tender (${req.user.username})`,
            issuer: 'RIC Tender Automation',
            length: 32
        });

        // Store the temporary secret (not yet enabled)
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET two_factor_secret = ? WHERE id = ?',
                [secret.base32, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Generate QR code
        const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

        res.json({
            secret: secret.base32,
            qrCode: qrCodeDataURL,
            manualEntryKey: secret.base32
        });

    } catch (err) {
        console.error('2FA setup error:', err);
        res.status(500).json({ error: 'Error setting up 2FA' });
    }
};

// Verify and enable 2FA
exports.enable2FA = async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }

    try {
        // Get the user's secret
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user.two_factor_secret) {
            return res.status(400).json({ error: 'No 2FA setup found. Please setup 2FA first.' });
        }

        if (user.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is already enabled' });
        }

        // Verify the token
        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 2 // Allow 2 time steps for clock drift
        });

        if (!verified) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Generate backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Enable 2FA and store backup codes
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET two_factor_enabled = 1, backup_codes = ? WHERE id = ?',
                [JSON.stringify(backupCodes), userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            message: '2FA enabled successfully',
            backupCodes: backupCodes
        });

    } catch (err) {
        console.error('2FA enable error:', err);
        res.status(500).json({ error: 'Error enabling 2FA' });
    }
};

// Verify 2FA token during login
exports.verify2FA = async (req, res) => {
    const { userId, token, isBackupCode } = req.body;
    const db = getDatabase();

    if (!userId || !token) {
        return res.status(400).json({ error: 'User ID and token are required' });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT two_factor_secret, two_factor_enabled, backup_codes FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user || !user.two_factor_enabled) {
            return res.status(400).json({ error: 'User not found or 2FA not enabled' });
        }

        let verified = false;

        if (isBackupCode) {
            // Verify backup code
            const backupCodes = JSON.parse(user.backup_codes || '[]');
            const codeIndex = backupCodes.indexOf(token.toUpperCase());
            
            if (codeIndex !== -1) {
                verified = true;
                // Remove used backup code
                backupCodes.splice(codeIndex, 1);
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET backup_codes = ? WHERE id = ?',
                        [JSON.stringify(backupCodes), userId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        } else {
            // Verify TOTP token
            verified = speakeasy.totp.verify({
                secret: user.two_factor_secret,
                encoding: 'base32',
                token: token,
                window: 2
            });
        }

        if (!verified) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        res.json({ verified: true });

    } catch (err) {
        console.error('2FA verification error:', err);
        res.status(500).json({ error: 'Error verifying 2FA' });
    }
};

// Disable 2FA
exports.disable2FA = async (req, res) => {
    const { token, isBackupCode } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT two_factor_secret, two_factor_enabled, backup_codes FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is not enabled' });
        }

        let verified = false;

        if (isBackupCode) {
            const backupCodes = JSON.parse(user.backup_codes || '[]');
            verified = backupCodes.includes(token.toUpperCase());
        } else {
            verified = speakeasy.totp.verify({
                secret: user.two_factor_secret,
                encoding: 'base32',
                token: token,
                window: 2
            });
        }

        if (!verified) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Disable 2FA and clear secrets
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, backup_codes = NULL WHERE id = ?',
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ message: '2FA disabled successfully' });

    } catch (err) {
        console.error('2FA disable error:', err);
        res.status(500).json({ error: 'Error disabling 2FA' });
    }
};

// Get 2FA status
exports.get2FAStatus = async (req, res) => {
    const userId = req.user.id;
    const db = getDatabase();

    try {
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT two_factor_enabled, backup_codes FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const backupCodes = user.backup_codes ? JSON.parse(user.backup_codes) : [];

        res.json({
            enabled: !!user.two_factor_enabled,
            backupCodesCount: backupCodes.length
        });

    } catch (err) {
        console.error('2FA status error:', err);
        res.status(500).json({ error: 'Error getting 2FA status' });
    }
};

// Regenerate backup codes
exports.regenerateBackupCodes = async (req, res) => {
    const { token, isBackupCode } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get(
                'SELECT two_factor_secret, two_factor_enabled, backup_codes FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!user.two_factor_enabled) {
            return res.status(400).json({ error: '2FA is not enabled' });
        }

        let verified = false;

        if (isBackupCode) {
            const backupCodes = JSON.parse(user.backup_codes || '[]');
            verified = backupCodes.includes(token.toUpperCase());
        } else {
            verified = speakeasy.totp.verify({
                secret: user.two_factor_secret,
                encoding: 'base32',
                token: token,
                window: 2
            });
        }

        if (!verified) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Generate new backup codes
        const newBackupCodes = [];
        for (let i = 0; i < 10; i++) {
            newBackupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET backup_codes = ? WHERE id = ?',
                [JSON.stringify(newBackupCodes), userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            message: 'Backup codes regenerated successfully',
            backupCodes: newBackupCodes
        });

    } catch (err) {
        console.error('Backup codes regeneration error:', err);
        res.status(500).json({ error: 'Error regenerating backup codes' });
    }
};
