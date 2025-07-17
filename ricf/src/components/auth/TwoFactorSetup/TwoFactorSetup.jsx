import React, { useState, useEffect } from 'react';
import { setup2FA, enable2FA, get2FAStatus, disable2FA, regenerateBackupCodes } from '../../../config/api';

const TwoFactorSetup = ({ onClose }) => {
  const [step, setStep] = useState(1); // 1: status, 2: setup, 3: verify, 4: backup codes
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [status, setStatus] = useState({ enabled: false, backupCodesCount: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [disableToken, setDisableToken] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [regenToken, setRegenToken] = useState('');
  const [isRegenBackupCode, setIsRegenBackupCode] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const statusData = await get2FAStatus();
      setStatus(statusData);
    } catch (err) {
      setError('Failed to fetch 2FA status');
    }
  };

  const handleSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const setupData = await setup2FA();
      setQrCode(setupData.qrCode);
      setSecret(setupData.secret);
      setStep(2);
    } catch (err) {
      setError(err.error || 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await enable2FA(verificationCode);
      setBackupCodes(result.backupCodes);
      setStatus({ enabled: true, backupCodesCount: result.backupCodes.length });
      setStep(4);
    } catch (err) {
      setError(err.error || 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await disable2FA(disableToken, isBackupCode);
      setStatus({ enabled: false, backupCodesCount: 0 });
      setDisableToken('');
      setStep(1);
      fetchStatus();
    } catch (err) {
      setError(err.error || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await regenerateBackupCodes(regenToken, isRegenBackupCode);
      setBackupCodes(result.backupCodes);
      setStatus(prev => ({ ...prev, backupCodesCount: result.backupCodes.length }));
      setRegenToken('');
      setStep(4);
    } catch (err) {
      setError(err.error || 'Failed to regenerate backup codes');
    } finally {
      setLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    const content = `RIC Tender Automation - 2FA Backup Codes\n\nGenerated: ${new Date().toLocaleDateString()}\n\nBackup Codes:\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}\n\nImportant:\n- Each backup code can only be used once\n- Store these codes in a safe place\n- Use these codes if you lose access to your authenticator app`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ric-tender-2fa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className={`mx-auto w-16 h-16 ${status.enabled ? 'bg-green-100' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-4`}>
          <svg className={`w-8 h-8 ${status.enabled ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          Two-Factor Authentication
        </h3>
        <p className="text-gray-600">
          {status.enabled 
            ? 'Your account is protected with 2FA' 
            : 'Add an extra layer of security to your account'
          }
        </p>
      </div>

      {status.enabled ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-green-800 font-medium">2FA is enabled</span>
            </div>
            <p className="text-green-700 text-sm mt-1">
              Backup codes available: {status.backupCodesCount}
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setStep(5)}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
            >
              Regenerate Backup Codes
            </button>
            <button
              onClick={() => setStep(6)}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition duration-200"
            >
              Disable 2FA
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSetup}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition duration-200"
        >
          {loading ? 'Setting up...' : 'Setup 2FA'}
        </button>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Scan QR Code</h3>
        <p className="text-gray-600 mb-6">
          Use your authenticator app (Google Authenticator, Authy, etc.) to scan this QR code:
        </p>
        
        <div className="bg-white p-4 rounded-lg border inline-block">
          <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
        </div>
        
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-2">Manual entry key:</p>
          <code className="text-sm bg-gray-200 px-2 py-1 rounded break-all">{secret}</code>
        </div>
      </div>

      <button
        onClick={() => setStep(3)}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
      >
        I've Added the Account
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Verify Setup</h3>
        <p className="text-gray-600 mb-6">
          Enter the 6-digit code from your authenticator app to verify the setup:
        </p>
      </div>

      <form onSubmit={handleVerifyAndEnable} className="space-y-4">
        <input
          type="text"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          placeholder="000000"
          className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          maxLength={6}
          required
        />

        <div className="space-y-2">
          <button
            type="submit"
            disabled={loading || verificationCode.length !== 6}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 transition duration-200"
          >
            {loading ? 'Verifying...' : 'Enable 2FA'}
          </button>
          
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition duration-200"
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-4">2FA Enabled Successfully!</h3>
        <p className="text-gray-600 mb-6">
          Here are your backup codes. Save them in a secure location:
        </p>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-2 gap-2 text-center">
          {backupCodes.map((code, index) => (
            <div key={index} className="bg-white p-2 rounded border text-sm font-mono">
              {code}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={downloadBackupCodes}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
        >
          Download Backup Codes
        </button>
        
        <button
          onClick={() => {
            setStep(1);
            fetchStatus();
          }}
          className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition duration-200"
        >
          Done
        </button>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          <strong>Important:</strong> Each backup code can only be used once. Store them safely!
        </p>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Regenerate Backup Codes</h3>
        <p className="text-gray-600 mb-6">
          Enter a verification code to generate new backup codes:
        </p>
      </div>

      <form onSubmit={handleRegenerateBackupCodes} className="space-y-4">
        <div>
          <input
            type="text"
            value={regenToken}
            onChange={(e) => setRegenToken(e.target.value)}
            placeholder={isRegenBackupCode ? "Enter backup code" : "Enter 6-digit code"}
            className="w-full px-4 py-3 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={isRegenBackupCode ? 8 : 6}
            required
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="regenBackupCode"
            checked={isRegenBackupCode}
            onChange={(e) => {
              setIsRegenBackupCode(e.target.checked);
              setRegenToken('');
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="regenBackupCode" className="ml-2 text-sm text-gray-600">
            Use backup code instead
          </label>
        </div>

        <div className="space-y-2">
          <button
            type="submit"
            disabled={loading || !regenToken.trim()}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition duration-200"
          >
            {loading ? 'Regenerating...' : 'Regenerate Codes'}
          </button>
          
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition duration-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Disable 2FA</h3>
        <p className="text-gray-600 mb-6">
          Enter a verification code to disable two-factor authentication:
        </p>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <p className="text-red-800 text-sm">
          <strong>Warning:</strong> Disabling 2FA will make your account less secure.
        </p>
      </div>

      <form onSubmit={handleDisable} className="space-y-4">
        <div>
          <input
            type="text"
            value={disableToken}
            onChange={(e) => setDisableToken(e.target.value)}
            placeholder={isBackupCode ? "Enter backup code" : "Enter 6-digit code"}
            className="w-full px-4 py-3 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={isBackupCode ? 8 : 6}
            required
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="disableBackupCode"
            checked={isBackupCode}
            onChange={(e) => {
              setIsBackupCode(e.target.checked);
              setDisableToken('');
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="disableBackupCode" className="ml-2 text-sm text-gray-600">
            Use backup code instead
          </label>
        </div>

        <div className="space-y-2">
          <button
            type="submit"
            disabled={loading || !disableToken.trim()}
            className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 transition duration-200"
          >
            {loading ? 'Disabling...' : 'Disable 2FA'}
          </button>
          
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition duration-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/15 bg-opacity-30 backdrop-filter backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="max-w-md w-full bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto border border-white border-opacity-30">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Security Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
      </div>
    </div>
  );
};

export default TwoFactorSetup;
