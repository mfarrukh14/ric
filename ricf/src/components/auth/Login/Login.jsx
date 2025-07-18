import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../../config/api';
import { apiUrl } from '../../../config/api';
import TwoFactorVerification from '../TwoFactorVerification/TwoFactorVerification';
import SupplierRegistrationProcess from '../SupplierRegistrationProcess';

const Login = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState('user');
  const [supplierMode, setSupplierMode] = useState('login'); // 'login' or 'register'
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [supplierCredentials, setSupplierCredentials] = useState({ usernameOrEmail: '', password: '' });
  const [supplierRegisterData, setSupplierRegisterData] = useState({
    username: '',
    businessEmail: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [showRegistrationProcess, setShowRegistrationProcess] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState(null);
  const [isResubmission, setIsResubmission] = useState(false);
  
  const navigate = useNavigate();

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const handleSupplierChange = (e) => {
    const { name, value } = e.target;
    setSupplierCredentials(prev => ({ ...prev, [name]: value }));
  };

  const handleSupplierRegisterChange = (e) => {
    const { name, value } = e.target;
    setSupplierRegisterData(prev => ({ ...prev, [name]: value }));
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(credentials.username, credentials.password);
      
      if (response.requires2FA) {
        setRequires2FA(true);
        setPendingUserId(response.userId);
      } else {
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));

        if (onLogin) onLogin(response.user);

        if (response.user.role === 'superadmin') {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      setError(err.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/suppliers/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(supplierCredentials),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      // Check if supplier needs to complete registration process
      if (data.requiresRegistration) {
        localStorage.setItem('supplierToken', data.token);
        localStorage.setItem('supplier', JSON.stringify(data.supplier));
        setNewSupplierId(data.supplier.id);
        setIsResubmission(data.isResubmission || false);
        setShowRegistrationProcess(true);
        return;
      }

      // Check if email verification is required
      if (data.requiresEmailVerification) {
        localStorage.setItem('supplierToken', data.token);
        localStorage.setItem('supplier', JSON.stringify(data.supplier));
        setNewSupplierId(data.supplier.id);
        setIsResubmission(data.isResubmission || false);
        setShowRegistrationProcess(true);
        return;
      }

      localStorage.setItem('supplierToken', data.token);
      localStorage.setItem('supplier', JSON.stringify(data.supplier));

      if (onLogin) onLogin(data.supplier);

      navigate('/supplier-dashboard');
    } catch (err) {
      setError(err.message || 'Supplier login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (supplierRegisterData.password !== supplierRegisterData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (supplierRegisterData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/suppliers/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: supplierRegisterData.username,
          businessEmail: supplierRegisterData.businessEmail,
          password: supplierRegisterData.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      // Store token and supplier data
      localStorage.setItem('supplierToken', data.token);
      localStorage.setItem('supplier', JSON.stringify(data.supplier));
      
      // Set supplier ID and show registration process
      setNewSupplierId(data.supplier.id);
      setShowRegistrationProcess(true);

    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASuccess = (user) => {
    if (onLogin) onLogin(user);

    if (user.role === 'superadmin') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  };

  const handleBack2FA = () => {
    setRequires2FA(false);
    setPendingUserId(null);
    setCredentials({ username: '', password: '' });
  };

  const handleRegistrationComplete = () => {
    setShowRegistrationProcess(false);
    navigate('/supplier-dashboard');
  };

  // Show registration process if supplier needs to complete registration
  if (showRegistrationProcess && newSupplierId) {
    return (
      <SupplierRegistrationProcess 
        supplierId={newSupplierId} 
        onComplete={handleRegistrationComplete}
        isResubmission={isResubmission}
      />
    );
  }

  if (requires2FA && pendingUserId) {
    return (
      <div className="min-h-screen flex">
        {/* Left Half - White with Logo */}
        <div className="flex-1 bg-white flex items-center justify-center p-8">
          <div className="text-left max-w-lg w-full">
            <img 
              src="/images/logo.jpg" 
              alt="RIC Logo" 
              className="h-48 w-auto mb-12"
            />
            <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
              RIC e-Tender Portal
            </h1>
            <p className="text-2xl text-gray-600 font-medium">
              Rawalpindi Institute of Cardiology
            </p>
          </div>
        </div>

        {/* Right Half - Black with 2FA Form */}
        <div className="flex-1 bg-black flex items-center justify-center p-8">
          <div className="max-w-md w-full space-y-8">
            <TwoFactorVerification
              userId={pendingUserId}
              onVerificationSuccess={handle2FASuccess}
              onBack={handleBack2FA}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Decorative left-side element protruding from top-left */}
      <img
        src="/images/leftSideElement1.png"
        alt="Left Decorative Element"
        className="absolute -top-64 -left-64 w-[600px] h-auto z-30 pointer-events-none select-none"
        style={{ objectFit: 'contain' }}
      />
      {/* Left Half - White with Logo */}
      <div className="flex-1 bg-white flex items-center justify-center p-8 relative z-20">
        <div className="text-left max-w-lg w-full">
          <img 
            src="/images/logo.jpg" 
            alt="RIC Logo" 
            className="h-48 w-auto mb-12"
          />
          <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
            RIC e-Tender Portal
          </h1>
          <p className="text-2xl text-gray-600 font-medium">
            Rawalpindi Institute of Cardiology
          </p>
        </div>
      </div>

      {/* Right Half - Black with Login Form and decorative element */}
      <div className="flex-1 bg-black flex items-center justify-center p-8 relative z-20">
        {/* Decorative right-side element protruding from bottom-right of black part only */}
        <img
          src="/images/rightSideElement.png"
          alt="Right Decorative Element"
          className="absolute -bottom-24 -right-24 w-[600px] h-auto z-30 pointer-events-none select-none"
          style={{ objectFit: 'contain' }}
        />
        <div className="max-w-md w-full space-y-8 rounded-3xl border border-gray-800 bg-black/90 p-8" style={{ boxShadow: '0 24px 48px 12px rgba(255,255,255,0.22), 24px 0 48px 12px rgba(255,255,255,0.22)' }}>
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => {
                setActiveTab('user');
                setError('');
                setSupplierMode('login');
              }}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                activeTab === 'user'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              User Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('supplier');
                setError('');
                setSupplierMode('login');
              }}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                activeTab === 'supplier'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Supplier Portal
            </button>
          </div>

          {/* Form Content */}
          <div className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-500 bg-opacity-20 border border-red-500 p-4">
                <div className="text-sm text-red-300">{error}</div>
              </div>
            )}

            {/* User Login Form */}
            {activeTab === 'user' && (
              <form className="space-y-6" onSubmit={handleUserSubmit}>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">Welcome Back</h2>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                      Username
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Enter your username"
                      value={credentials.username}
                      onChange={handleUserChange}
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Enter your password"
                      value={credentials.password}
                      onChange={handleUserChange}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 border border-transparent rounded-full cursor-pointer shadow-sm text-sm font-medium text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* Supplier Login/Register */}
            {activeTab === 'supplier' && supplierMode === 'login' && (
              <form className="space-y-6" onSubmit={handleSupplierSubmit}>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">Supplier Portal</h2>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="supplierUsernameOrEmail" className="block text-sm font-medium text-gray-300 mb-2">
                      Username or Email
                    </label>
                    <input
                      id="supplierUsernameOrEmail"
                      name="usernameOrEmail"
                      type="text"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Enter your username or email"
                      value={supplierCredentials.usernameOrEmail}
                      onChange={handleSupplierChange}
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="supplierPassword" className="block text-sm font-medium text-gray-300 mb-2">
                      Password
                    </label>
                    <input
                      id="supplierPassword"
                      name="password"
                      type="password"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Enter your password"
                      value={supplierCredentials.password}
                      onChange={handleSupplierChange}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="text-center">
                  <p className="text-gray-400 text-sm">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierMode('register');
                        setError('');
                      }}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      Register
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* Supplier Registration */}
            {activeTab === 'supplier' && supplierMode === 'register' && (
              <form className="space-y-6" onSubmit={handleSupplierRegisterSubmit}>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">Supplier Registration</h2>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="registerUsername" className="block text-sm font-medium text-gray-300 mb-2">
                      Username *
                    </label>
                    <input
                      id="registerUsername"
                      name="username"
                      type="text"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Choose a username"
                      value={supplierRegisterData.username}
                      onChange={handleSupplierRegisterChange}
                    />
                  </div>

                  <div>
                    <label htmlFor="registerBusinessEmail" className="block text-sm font-medium text-gray-300 mb-2">
                      Business Email *
                    </label>
                    <input
                      id="registerBusinessEmail"
                      name="businessEmail"
                      type="email"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Enter your business email"
                      value={supplierRegisterData.businessEmail}
                      onChange={handleSupplierRegisterChange}
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="registerPassword" className="block text-sm font-medium text-gray-300 mb-2">
                      Password *
                    </label>
                    <input
                      id="registerPassword"
                      name="password"
                      type="password"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Create a password (min. 8 characters)"
                      value={supplierRegisterData.password}
                      onChange={handleSupplierRegisterChange}
                    />
                  </div>

                  <div>
                    <label htmlFor="registerConfirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                      Confirm Password *
                    </label>
                    <input
                      id="registerConfirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      className="w-full px-4 py-3 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-700"
                      placeholder="Confirm your password"
                      value={supplierRegisterData.confirmPassword}
                      onChange={handleSupplierRegisterChange}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Registering...' : 'Register'}
                </button>

                <div className="text-center">
                  <p className="text-gray-400 text-sm">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierMode('login');
                        setError('');
                      }}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      Sign In
                    </button>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
