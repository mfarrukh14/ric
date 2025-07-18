import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';
import TwoFactorEnforcementPopup from './TwoFactorEnforcementPopup/TwoFactorEnforcementPopup';

const TwoFactorEnforcementWrapper = ({ children }) => {
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const checkCompliance = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiUrl}/2fa-enforcement/compliance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setComplianceStatus(data);
      } else {
        console.error('Failed to check 2FA compliance');
        setError('Failed to check security requirements');
      }
    } catch (error) {
      console.error('Error checking 2FA compliance:', error);
      setError('Error checking security requirements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkCompliance();
  }, []);

  const handleComplianceAchieved = () => {
    // User has set up 2FA, recheck compliance
    checkCompliance();
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg 
            className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-gray-600">Checking security requirements...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 rounded-full p-3 mx-auto mb-4 w-12 h-12 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={checkCompliance}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show enforcement popup if user is not compliant
  if (complianceStatus && complianceStatus.enforced && !complianceStatus.compliant) {
    return (
      <div className="relative">
        {children}
        <TwoFactorEnforcementPopup onCompliance={handleComplianceAchieved} />
      </div>
    );
  }

  // User is compliant or 2FA is not enforced, show normal content
  return <>{children}</>;
};

export default TwoFactorEnforcementWrapper;
