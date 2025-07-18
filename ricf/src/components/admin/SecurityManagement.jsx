import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';
import TwoFactorSetup from '../auth/TwoFactorSetup/TwoFactorSetup';

const SecurityManagement = () => {
  const [enforcementStatus, setEnforcementStatus] = useState(null);
  const [nonCompliantUsers, setNonCompliantUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const initialize = async () => {
      await loadCurrentUser();
      fetchSecurityData();
    };
    initialize();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
        // Update localStorage with fresh user data
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        // Fallback to localStorage if API fails
        const user = localStorage.getItem('user');
        if (user) {
          setCurrentUser(JSON.parse(user));
        }
      }
    } catch (error) {
      console.error('Error loading current user:', error);
      // Fallback to localStorage if API fails
      const user = localStorage.getItem('user');
      if (user) {
        setCurrentUser(JSON.parse(user));
      }
    }
  };

  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Fetch enforcement status
      const enforcementResponse = await fetch(`${apiUrl}/2fa-enforcement/enforcement`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (enforcementResponse.ok) {
        const enforcementData = await enforcementResponse.json();
        setEnforcementStatus(enforcementData);
        
        // If enforcement is enabled, fetch non-compliant users
        if (enforcementData.enforced) {
          const nonCompliantResponse = await fetch(`${apiUrl}/2fa-enforcement/non-compliant`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (nonCompliantResponse.ok) {
            const nonCompliantData = await nonCompliantResponse.json();
            setNonCompliantUsers(nonCompliantData.nonCompliantUsers || []);
          }
        } else {
          setNonCompliantUsers([]);
        }
      }
    } catch (error) {
      console.error('Error fetching security data:', error);
      setError('Failed to load security settings');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await loadCurrentUser();
    fetchSecurityData();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const formatRole = (role) => {
    if (!role) return 'Unknown';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-600">Loading security settings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-red-700">{error}</p>
        </div>
        <button 
          onClick={refreshData}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-white border-opacity-30 rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Security Settings</h2>
        <p className="text-gray-600">Manage two-factor authentication and security policies for your organization.</p>
      </div>

      {/* 2FA Enforcement Status */}
      <div className="bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-white border-opacity-30 rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Two-Factor Authentication</h3>
          <button
            onClick={() => setShow2FASetup(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            My 2FA Settings
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Enforcement Status */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Organization Policy</h4>
            <div className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded-full ${enforcementStatus?.enforced ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-600">
                {enforcementStatus?.enforced ? 'Enforced for all users' : 'Optional for users'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {enforcementStatus?.message}
            </p>
          </div>

          {/* Your 2FA Status */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">Your 2FA Status</h4>
            <div className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded-full ${currentUser?.two_factor_enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {currentUser?.two_factor_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {enforcementStatus?.enforced ? 
                'As superadmin, your 2FA status controls the organization policy' : 
                'Enable 2FA to enforce it for all users'
              }
            </p>
          </div>
        </div>

        {/* Policy Explanation */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="font-medium text-blue-800 mb-1">How 2FA Enforcement Works</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• When you (superadmin) enable 2FA, it becomes mandatory for all users</li>
                <li>• Users without 2FA will see a persistent popup requiring setup</li>
                <li>• When you disable 2FA, it becomes optional for all users</li>
                <li>• This ensures organization-wide security compliance</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Non-Compliant Users */}
      {enforcementStatus?.enforced && (
        <div className="bg-white bg-opacity-20 backdrop-filter backdrop-blur-lg border border-white border-opacity-30 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Users Without 2FA</h3>
            <button
              onClick={refreshData}
              className="text-blue-600 hover:text-blue-700 flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {nonCompliantUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 bg-opacity-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Username</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Role</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Department</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Last Login</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {nonCompliantUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 hover:bg-opacity-50">
                      <td className="px-4 py-2 text-gray-900">{user.name}</td>
                      <td className="px-4 py-2 text-gray-600">{user.username}</td>
                      <td className="px-4 py-2 text-gray-600">{formatRole(user.role)}</td>
                      <td className="px-4 py-2 text-gray-600">{user.departmentName || 'N/A'}</td>
                      <td className="px-4 py-2 text-gray-600">{formatDate(user.last_login)}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          2FA Required
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="bg-green-100 rounded-full p-3 mx-auto mb-4 w-12 h-12 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-gray-800 mb-2">All Users Compliant</h4>
              <p className="text-gray-600">All users have successfully set up two-factor authentication.</p>
            </div>
          )}
        </div>
      )}

      {/* 2FA Setup Modal */}
      {show2FASetup && (
        <TwoFactorSetup 
          onClose={() => setShow2FASetup(false)} 
          onComplete={() => {
            setShow2FASetup(false);
            refreshData(); // Refresh user data after 2FA setup
          }}
        />
      )}
    </div>
  );
};

export default SecurityManagement;
