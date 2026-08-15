import React, { useState } from 'react';

const TwoFactorVerification = ({ userId, onVerificationSuccess, onBack }) => {
  const [verificationCode, setVerificationCode] = useState('');
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { complete2FALogin } = await import('../../../config/api');
      const response = await complete2FALogin(userId, verificationCode, isBackupCode);
      
      // Store token and user data
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      
      onVerificationSuccess(response.user);
    } catch (err) {
      setError(err.error || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full space-y-8">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-blue-600 bg-opacity-20 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h2>
        <p className="text-gray-300">
          Enter the verification code from your authenticator app
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-500 bg-opacity-20 border border-red-500 p-4">
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {isBackupCode ? 'Backup Code' : 'Verification Code'}
          </label>
          <input
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder={isBackupCode ? "Enter 8-character backup code" : "Enter 6-digit code"}
            className="w-full px-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={isBackupCode ? 8 : 6}
            required
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="backupCode"
            checked={isBackupCode}
            onChange={(e) => {
              setIsBackupCode(e.target.checked);
              setVerificationCode('');
              setError('');
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-600 rounded bg-gray-800"
          />
          <label htmlFor="backupCode" className="ml-2 text-sm text-gray-300">
            Use backup code instead
          </label>
        </div>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={loading || !verificationCode.trim()}
            className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black mr-2"></div>
                Verifying...
              </div>
            ) : (
              'Verify & Continue'
            )}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 px-4 border border-gray-600 rounded-md text-gray-300 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </form>

      <div className="text-center">
        <p className="text-sm text-gray-400">
          Lost access to your authenticator app?{' '}
          <button
            type="button"
            onClick={() => setIsBackupCode(true)}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Use backup code
          </button>
        </p>
      </div>
    </div>
  );
};

export default TwoFactorVerification;
