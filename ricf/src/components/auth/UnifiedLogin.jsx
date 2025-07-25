import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../config/api';
import { apiUrl } from '../../config/api';
import TwoFactorVerification from './TwoFactorVerification/TwoFactorVerification';

const UnifiedLogin = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState('user');
  const [showRegister, setShowRegister] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [supplierCredentials, setSupplierCredentials] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({
    companyName: '',
    companyEmail: '',
    password: '',
    confirmPassword: '',
    companyStatement: '',
    companyMission: '',
    contactPerson: '',
    contactNumber: ''
  });
  const [files, setFiles] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [emailOTP, setEmailOTP] = useState('');
  const [smsOTP, setSmsOTP] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [smsVerified, setSmsVerified] = useState(false);
  const [otpExpiryTime, setOtpExpiryTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  
  const navigate = useNavigate();

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const handleSupplierChange = (e) => {
    const { name, value } = e.target;
    setSupplierCredentials(prev => ({ ...prev, [name]: value }));
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setRegisterData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    if (selectedFiles && selectedFiles[0]) {
      const file = selectedFiles[0];
      
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        setError('Only PDF and DOCX files are allowed');
        return;
      }
      
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      
      setFiles(prev => ({ ...prev, [name]: file }));
      setError('');
    }
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
        body: JSON.stringify({
          usernameOrEmail: supplierCredentials.email,
          password: supplierCredentials.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
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

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (registerData.password !== registerData.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const requiredFiles = ['drugSaleLicense', 'gstDocument', 'ntnDocument', 'pecDocument', 'professionalTaxCert'];
      for (const fileKey of requiredFiles) {
        if (!files[fileKey]) {
          throw new Error(`Please upload ${fileKey.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        }
      }

      const formData = new FormData();
      Object.keys(registerData).forEach(key => {
        formData.append(key, registerData[key]);
      });

      Object.keys(files).forEach(key => {
        formData.append(key, files[key]);
      });

      const response = await fetch(`${apiUrl}/suppliers/register/send-otp`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setOtpEmail(registerData.companyEmail);
      setOtpExpiryTime(new Date(Date.now() + 15 * 60 * 1000));
      setTimeRemaining(15 * 60);
      setShowOTPVerification(true);
      setEmailVerified(false);
      setSmsVerified(false);
      setEmailOTP('');
      setSmsOTP('');
      setMessage('Verification codes sent to your email and mobile number. Please verify both to complete registration.');

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

  if (requires2FA && pendingUserId) {
    return (
      <TwoFactorVerification
        userId={pendingUserId}
        onVerificationSuccess={handle2FASuccess}
        onBack={handleBack2FA}
      />
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Half - White with Logo */}
      <div className="flex-1 bg-white flex items-center justify-center">
        <div className="text-center">
          <img 
            src="/images/logo.jpg" 
            alt="RIC Logo" 
            className="mx-auto h-32 w-auto mb-8"
          />
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            RIC e-Tender Portal
          </h1>
          <p className="text-xl text-gray-600">
            Regional Institute of Cardiology
          </p>
        </div>
      </div>

      {/* Right Half - Black with Login Form */}
      <div className="flex-1 bg-black flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8">
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => {
                setActiveTab('user');
                setShowRegister(false);
                setError('');
                setMessage('');
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
                setShowRegister(false);
                setError('');
                setMessage('');
              }}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all ${
                activeTab === 'supplier'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Supplier Sign In
            </button>
          </div>

          {/* Form Content */}
          <div className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-500 bg-opacity-20 border border-red-500 p-4">
                <div className="text-sm text-red-300">{error}</div>
              </div>
            )}

            {message && (
              <div className="rounded-md bg-green-500 bg-opacity-20 border border-green-500 p-4">
                <div className="text-sm text-green-300">{message}</div>
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
                      className="w-full px-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full px-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your password"
                      value={credentials.password}
                      onChange={handleUserChange}
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
              </form>
            )}

            {/* Supplier Login/Register */}
            {activeTab === 'supplier' && !showRegister && !showOTPVerification && (
              <form className="space-y-6" onSubmit={handleSupplierSubmit}>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">Supplier Portal</h2>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="supplierEmail" className="block text-sm font-medium text-gray-300 mb-2">
                      Company Email
                    </label>
                    <input
                      id="supplierEmail"
                      name="email"
                      type="email"
                      required
                      className="w-full px-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your company email"
                      value={supplierCredentials.email}
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
                      className="w-full px-4 py-3 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      onClick={() => setShowRegister(true)}
                      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      Register
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* Supplier Registration Form */}
            {activeTab === 'supplier' && showRegister && !showOTPVerification && (
              <form className="space-y-6" onSubmit={handleRegisterSubmit}>
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">Supplier Registration</h2>
                  <button
                    type="button"
                    onClick={() => setShowRegister(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    ← Back to Login
                  </button>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {/* Company Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Company Name *
                      </label>
                      <input
                        type="text"
                        name="companyName"
                        required
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={registerData.companyName}
                        onChange={handleRegisterChange}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Company Email *
                      </label>
                      <input
                        type="email"
                        name="companyEmail"
                        required
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={registerData.companyEmail}
                        onChange={handleRegisterChange}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Password *
                      </label>
                      <input
                        type="password"
                        name="password"
                        required
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={registerData.password}
                        onChange={handleRegisterChange}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Confirm Password *
                      </label>
                      <input
                        type="password"
                        name="confirmPassword"
                        required
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={registerData.confirmPassword}
                        onChange={handleRegisterChange}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Contact Person *
                      </label>
                      <input
                        type="text"
                        name="contactPerson"
                        required
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={registerData.contactPerson}
                        onChange={handleRegisterChange}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Contact Number *
                      </label>
                      <input
                        type="tel"
                        name="contactNumber"
                        required
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        value={registerData.contactNumber}
                        onChange={handleRegisterChange}
                      />
                    </div>
                  </div>

                  {/* Company Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Company Statement *
                    </label>
                    <textarea
                      name="companyStatement"
                      required
                      rows="3"
                      className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={registerData.companyStatement}
                      onChange={handleRegisterChange}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Company Mission *
                    </label>
                    <textarea
                      name="companyMission"
                      required
                      rows="3"
                      className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={registerData.companyMission}
                      onChange={handleRegisterChange}
                    />
                  </div>

                  {/* File Uploads */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-medium text-white">Required Documents</h3>
                    
                    {[
                      { key: 'drugSaleLicense', label: 'Drug Sale License' },
                      { key: 'gstDocument', label: 'GST Document' },
                      { key: 'ntnDocument', label: 'NTN Document' },
                      { key: 'pecDocument', label: 'PEC Document' },
                      { key: 'professionalTaxCert', label: 'Professional Tax Certificate' }
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          {label} *
                        </label>
                        <input
                          type="file"
                          name={key}
                          required
                          accept=".pdf,.docx"
                          onChange={handleFileChange}
                          className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {files[key] && (
                          <p className="text-green-400 text-xs mt-1">✓ {files[key].name}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-white hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Registering...' : 'Register Company'}
                </button>
              </form>
            )}

            {/* OTP Verification would go here if needed */}
            {showOTPVerification && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white">Verify Your Registration</h2>
                <p className="text-gray-300">Please check your email and SMS for verification codes.</p>
                
                {/* OTP verification form would go here */}
                <div className="text-center">
                  <button
                    onClick={() => {
                      setShowOTPVerification(false);
                      setShowRegister(false);
                    }}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    ← Back to Login
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedLogin;
