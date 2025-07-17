import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const SupplierAuth = ({ onBack, onLogin }) => {
    const [activeTab, setActiveTab] = useState('login');
    const [showOTPVerification, setShowOTPVerification] = useState(false);
    const [otpEmail, setOtpEmail] = useState('');
    const [otpPhoneNumber, setOtpPhoneNumber] = useState('');
    const [emailOTP, setEmailOTP] = useState('');
    const [smsOTP, setSmsOTP] = useState('');
    const [emailVerified, setEmailVerified] = useState(false);
    const [smsVerified, setSmsVerified] = useState(false);
    const [otpExpiryTime, setOtpExpiryTime] = useState(null);
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [loginData, setLoginData] = useState({ email: '', password: '' });
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
    const navigate = useNavigate();

    // OTP countdown timer
    useEffect(() => {
        let interval = null;
        if (otpExpiryTime && timeRemaining > 0) {
            interval = setInterval(() => {
                const now = new Date().getTime();
                const expiry = new Date(otpExpiryTime).getTime();
                const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
                setTimeRemaining(remaining);
                
                if (remaining === 0) {
                    clearInterval(interval);
                }
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [otpExpiryTime, timeRemaining]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const handleLoginChange = (e) => {
        const { name, value } = e.target;
        setLoginData(prev => ({ ...prev, [name]: value }));
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

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${apiUrl}/suppliers/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(loginData),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.supplier));
            
            // ✅ Update user state in App immediately
            if (onLogin) onLogin(data.supplier);
            
            navigate('/supplier-dashboard');

        } catch (err) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            // Validate form
            if (registerData.password !== registerData.confirmPassword) {
                throw new Error('Passwords do not match');
            }

            const requiredFiles = ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument'];
            const missingFiles = requiredFiles.filter(field => !files[field]);
            
            if (missingFiles.length > 0) {
                throw new Error(`Please upload all required documents: ${missingFiles.join(', ')}`);
            }

            // Create form data
            const formData = new FormData();
            
            // Add text fields
            Object.keys(registerData).forEach(key => {
                formData.append(key, registerData[key]);
            });
            
            // Add files
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

            // Show OTP verification form
            setOtpEmail(data.email);
            setOtpPhoneNumber(data.phoneNumber);
            setOtpExpiryTime(new Date(Date.now() + 15 * 60 * 1000)); // 15 minutes from now
            setTimeRemaining(15 * 60); // 15 minutes in seconds
            setEmailVerified(false);
            setSmsVerified(false);
            setShowOTPVerification(true);
            setMessage('Verification codes sent to your email and mobile number. Please verify both to complete registration.');

        } catch (err) {
            setError(err.message || 'Failed to send OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyEmailOTP = async () => {
        setError('');
        setLoading(true);

        try {
            if (!emailOTP || emailOTP.length !== 6) {
                throw new Error('Please enter a valid 6-digit email OTP');
            }

            const response = await fetch(`${apiUrl}/suppliers/register/verify-email-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: otpEmail,
                    emailOTP: emailOTP
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            setEmailVerified(true);
            setMessage('Email verified successfully!');

        } catch (err) {
            setError(err.message || 'Email verification failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifySMSOTP = async () => {
        setError('');
        setLoading(true);

        try {
            if (!smsOTP || smsOTP.length !== 6) {
                throw new Error('Please enter a valid 6-digit SMS OTP');
            }

            const response = await fetch(`${apiUrl}/suppliers/register/verify-sms-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: otpEmail,
                    smsOTP: smsOTP
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            setSmsVerified(true);
            setMessage('Mobile number verified successfully!');

        } catch (err) {
            setError(err.message || 'SMS verification failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteRegistration = async () => {
        setError('');
        setLoading(true);

        try {
            if (!emailVerified || !smsVerified) {
                throw new Error('Both email and mobile number must be verified');
            }

            const response = await fetch(`${apiUrl}/suppliers/register/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: otpEmail
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            // Success - registration completed
            setMessage('Registration completed successfully! Your application has been submitted to the evaluation committee.');
            setShowOTPVerification(false);
            setRegisterData({
                companyName: '',
                companyEmail: '',
                password: '',
                confirmPassword: '',
                companyStatement: '',
                companyMission: '',
                contactPerson: '',
                contactNumber: ''
            });
            setFiles({});
            setEmailOTP('');
            setSmsOTP('');
            setEmailVerified(false);
            setSmsVerified(false);
            setActiveTab('login');

        } catch (err) {
            setError(err.message || 'Registration completion failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${apiUrl}/suppliers/register/resend-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: otpEmail
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            // Reset timer and verification status
            setOtpExpiryTime(new Date(Date.now() + 15 * 60 * 1000));
            setTimeRemaining(15 * 60);
            setEmailVerified(false);
            setSmsVerified(false);
            setEmailOTP('');
            setSmsOTP('');
            setMessage('New verification codes sent to your email and mobile number.');

        } catch (err) {
            setError(err.message || 'Failed to resend OTP. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl w-full space-y-8">
                <div className="flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="text-indigo-600 hover:text-indigo-500 font-medium"
                    >
                        ← Back to Main Login
                    </button>
                    <h2 className="text-3xl font-thin text-gray-700">
                        Supplier Portal
                    </h2>
                    <div></div>
                </div>

                {/* Tab Navigation */}
                <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('login')}
                        className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                            activeTab === 'login'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => setActiveTab('register')}
                        className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
                            activeTab === 'register'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        Register
                    </button>
                </div>

                {/* Login Form */}
                {activeTab === 'login' && (
                    <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="text-sm text-red-700">{error}</div>
                            </div>
                        )}
                        
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                    Company Email
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={loginData.email}
                                    onChange={handleLoginChange}
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={loginData.password}
                                    onChange={handleLoginChange}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                {loading ? 'Signing in...' : 'Sign in'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Registration Form */}
                {activeTab === 'register' && (
                    <form className="mt-8 space-y-6" onSubmit={handleRegister}>
                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="text-sm text-red-700">{error}</div>
                            </div>
                        )}
                        
                        {message && (
                            <div className="rounded-md bg-green-50 p-4">
                                <div className="text-sm text-green-700">{message}</div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                                    Company Name *
                                </label>
                                <input
                                    id="companyName"
                                    name="companyName"
                                    type="text"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={registerData.companyName}
                                    onChange={handleRegisterChange}
                                />
                            </div>
                            
                            <div>
                                <label htmlFor="companyEmail" className="block text-sm font-medium text-gray-700">
                                    Company Email *
                                </label>
                                <input
                                    id="companyEmail"
                                    name="companyEmail"
                                    type="email"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={registerData.companyEmail}
                                    onChange={handleRegisterChange}
                                />
                            </div>
                            
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    Password *
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={registerData.password}
                                    onChange={handleRegisterChange}
                                />
                            </div>
                            
                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                                    Confirm Password *
                                </label>
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={registerData.confirmPassword}
                                    onChange={handleRegisterChange}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="companyStatement" className="block text-sm font-medium text-gray-700">
                                Company Statement *
                            </label>
                            <textarea
                                id="companyStatement"
                                name="companyStatement"
                                required
                                rows={3}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                value={registerData.companyStatement}
                                onChange={handleRegisterChange}
                            />
                        </div>

                        <div>
                            <label htmlFor="companyMission" className="block text-sm font-medium text-gray-700">
                                Company Mission *
                            </label>
                            <textarea
                                id="companyMission"
                                name="companyMission"
                                required
                                rows={3}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                value={registerData.companyMission}
                                onChange={handleRegisterChange}
                            />
                        </div>

                        <div>
                            <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700">
                                Contact Person *
                            </label>
                            <input
                                id="contactPerson"
                                name="contactPerson"
                                type="text"
                                required
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                value={registerData.contactPerson}
                                onChange={handleRegisterChange}
                            />
                        </div>

                        <div>
                            <label htmlFor="contactNumber" className="block text-sm font-medium text-gray-700">
                                Contact Number (Pakistani Mobile) *
                            </label>
                            <div className="mt-1 flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                    +92
                                </span>
                                <input
                                    id="contactNumber"
                                    name="contactNumber"
                                    type="tel"
                                    required
                                    placeholder="3XXXXXXXXX"
                                    maxLength="10"
                                    className="flex-1 block w-full px-3 py-2 border border-gray-300 rounded-none rounded-r-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    value={registerData.contactNumber}
                                    onChange={handleRegisterChange}
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                                Enter 10-digit mobile number starting with 3 (e.g., 3001234567)
                            </p>
                        </div>

                        {/* Document Uploads */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-medium text-gray-900">Required Documents</h3>
                            <p className="text-sm text-gray-600">Please upload all required documents in PDF or DOCX format (max 10MB each)</p>
                            
                            {[
                                { name: 'professionalTaxCert', label: 'Professional Tax Certificate' },
                                { name: 'ntnDocument', label: 'NTN Document' },
                                { name: 'drugSaleLicense', label: 'Drug Sale License' },
                                { name: 'pecDocument', label: 'PEC Document' },
                                { name: 'gstDocument', label: 'GST Document' }
                            ].map((doc) => (
                                <div key={doc.name}>
                                    <label htmlFor={doc.name} className="block text-sm font-medium text-gray-700">
                                        {doc.label} *
                                    </label>
                                    <input
                                        id={doc.name}
                                        name={doc.name}
                                        type="file"
                                        accept=".pdf,.docx"
                                        required
                                        className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                        onChange={handleFileChange}
                                    />
                                    {files[doc.name] && (
                                        <p className="mt-1 text-sm text-green-600">
                                            ✓ {files[doc.name].name}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                {loading ? 'Submitting...' : 'Submit Registration'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Dual OTP Verification Form */}
                {showOTPVerification && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Dual Verification Required</h3>
                            <p className="text-gray-600 mb-4">
                                We've sent verification codes to your email <strong>{otpEmail}</strong> and mobile <strong>{otpPhoneNumber}</strong>
                            </p>
                            {timeRemaining > 0 ? (
                                <p className="text-sm text-gray-500">
                                    Codes expire in: <span className="font-mono text-red-600">{formatTime(timeRemaining)}</span>
                                </p>
                            ) : (
                                <p className="text-sm text-red-600">
                                    Codes have expired. Please request new ones.
                                </p>
                            )}
                        </div>

                        {/* Email Verification */}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                                <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                                Email Verification
                                {emailVerified && (
                                    <svg className="w-5 h-5 text-green-600 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </h4>
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    placeholder="000000"
                                    maxLength="6"
                                    className="flex-1 px-3 py-2 text-center text-lg tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                    value={emailOTP}
                                    onChange={(e) => setEmailOTP(e.target.value.replace(/\D/g, ''))}
                                    disabled={emailVerified}
                                />
                                <button
                                    type="button"
                                    onClick={handleVerifyEmailOTP}
                                    disabled={loading || emailOTP.length !== 6 || emailVerified}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
                                >
                                    {emailVerified ? 'Verified' : 'Verify'}
                                </button>
                            </div>
                        </div>

                        {/* SMS Verification */}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                                <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                Mobile Verification
                                {smsVerified && (
                                    <svg className="w-5 h-5 text-green-600 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </h4>
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    placeholder="000000"
                                    maxLength="6"
                                    className="flex-1 px-3 py-2 text-center text-lg tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
                                    value={smsOTP}
                                    onChange={(e) => setSmsOTP(e.target.value.replace(/\D/g, ''))}
                                    disabled={smsVerified}
                                />
                                <button
                                    type="button"
                                    onClick={handleVerifySMSOTP}
                                    disabled={loading || smsOTP.length !== 6 || smsVerified}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
                                >
                                    {smsVerified ? 'Verified' : 'Verify'}
                                </button>
                            </div>
                        </div>

                        {/* Complete Registration Button */}
                        {emailVerified && smsVerified && (
                            <button
                                type="button"
                                onClick={handleCompleteRegistration}
                                disabled={loading}
                                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-lg font-semibold"
                            >
                                {loading ? (
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                        Completing Registration...
                                    </div>
                                ) : (
                                    'Complete Registration'
                                )}
                            </button>
                        )}

                        {/* Action Buttons */}
                        <div className="flex space-x-3">
                            {timeRemaining > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setShowOTPVerification(false)}
                                    className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition duration-200"
                                >
                                    Back to Registration
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={loading}
                                    className="flex-1 bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition duration-200"
                                >
                                    {loading ? 'Sending...' : 'Resend Codes'}
                                </button>
                            )}
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex">
                                <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <h4 className="text-yellow-800 font-medium">Important</h4>
                                    <p className="text-yellow-700 text-sm mt-1">
                                        Please check your email inbox and SMS messages for the verification codes. Both codes must be verified to complete registration. Codes are valid for 15 minutes only.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SupplierAuth;
