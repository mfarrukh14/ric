import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../../config/api';
import TwoFactorSetup from '../TwoFactorSetup/TwoFactorSetup';

const TwoFactorEnforcementPopup = ({ onCompliance }) => {
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetup2FA = () => {
    setShowSetup(true);
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    // Notify parent component that user is now compliant
    if (onCompliance) {
      onCompliance();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <>
      {/* Full screen overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Header */}
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-100 rounded-full p-3 mr-4">
              <svg 
                className="w-8 h-8 text-red-600" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                2FA Required
              </h2>
              <p className="text-sm text-gray-600">
                Security Enhancement
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <p className="text-gray-700 mb-4">
              Your organization now requires Two-Factor Authentication (2FA) for all users. 
              You must set up 2FA to continue using the system.
            </p>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-sm text-yellow-800">
                  <strong>Important:</strong> You cannot perform any actions until 2FA is set up.
                </p>
              </div>
            </div>

            <ul className="text-left text-sm text-gray-600 mb-4 space-y-2">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Enhanced security for your account
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Protection against unauthorized access
              </li>
              <li className="flex items-start">
                <span className="text-green-500 mr-2">✓</span>
                Backup codes for emergency access
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col space-y-3">
            <button
              onClick={handleSetup2FA}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Setting up...
                </div>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Set Up 2FA Now
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="w-full bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-400"
            >
              Logout Instead
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* 2FA Setup Modal */}
      {showSetup && (
        <TwoFactorSetup 
          onClose={() => setShowSetup(false)} 
          onComplete={handleSetupComplete}
          mandatory={true}
        />
      )}
    </>
  );
};

export default TwoFactorEnforcementPopup;
