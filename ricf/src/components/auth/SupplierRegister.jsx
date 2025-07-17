import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const SupplierRegister = () => {
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
  const [showOTPVerification, setShowOTPVerification] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [emailOTP, setEmailOTP] = useState('');
  const [smsOTP, setSmsOTP] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [smsVerified, setSmsVerified] = useState(false);
  const [otpExpiryTime, setOtpExpiryTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  
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

  const handleEmailOTPVerification = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/suppliers/register/verify-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: otpEmail,
          otp: emailOTP
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setEmailVerified(true);
      setMessage('Email verified successfully!');

    } catch (err) {
      setError(err.message || 'Email OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSMSOTPVerification = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/suppliers/register/verify-sms-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: otpEmail,
          otp: smsOTP
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setSmsVerified(true);
      setMessage('SMS verified successfully!');

    } catch (err) {
      setError(err.message || 'SMS OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    setError('');
    setLoading(true);

    try {
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
      
      // Reset form
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
      setShowOTPVerification(false);
      setEmailVerified(false);
      setSmsVerified(false);
      setEmailOTP('');
      setSmsOTP('');

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);

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
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img 
            src="/images/logo.jpg" 
            alt="RIC Logo" 
            className="mx-auto h-24 w-auto mb-6"
          />
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Supplier Registration
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            Join RIC e-Tender Portal Network
          </p>
          <p className="text-gray-500">
            Rawalpindi Institute of Cardiology
          </p>
          <div className="mt-6">
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Login
            </button>
          </div>
        </div>

        {!showOTPVerification ? (
          /* Registration Form */
          <div className="bg-white rounded-lg shadow-lg p-8">
            <form className="space-y-8" onSubmit={handleRegisterSubmit}>
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              {message && (
                <div className="rounded-md bg-green-50 border border-green-200 p-4">
                  <div className="text-sm text-green-700">{message}</div>
                </div>
              )}

              {/* Company Information Section */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Company Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      name="companyName"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter your company name"
                      value={registerData.companyName}
                      onChange={handleRegisterChange}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Email *
                    </label>
                    <input
                      type="email"
                      name="companyEmail"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter your company email"
                      value={registerData.companyEmail}
                      onChange={handleRegisterChange}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact Person *
                    </label>
                    <input
                      type="text"
                      name="contactPerson"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Contact person name"
                      value={registerData.contactPerson}
                      onChange={handleRegisterChange}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contact Number *
                    </label>
                    <input
                      type="tel"
                      name="contactNumber"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="+92 XXX XXXXXXX"
                      value={registerData.contactNumber}
                      onChange={handleRegisterChange}
                    />
                  </div>
                </div>
              </div>

              {/* Account Security Section */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Security</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Create a strong password"
                      value={registerData.password}
                      onChange={handleRegisterChange}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Confirm your password"
                      value={registerData.confirmPassword}
                      onChange={handleRegisterChange}
                    />
                  </div>
                </div>
              </div>

              {/* Company Profile Section */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Company Profile</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Statement *
                    </label>
                    <textarea
                      name="companyStatement"
                      required
                      rows="4"
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Describe your company's background, expertise, and experience in the healthcare/medical sector..."
                      value={registerData.companyStatement}
                      onChange={handleRegisterChange}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Mission *
                    </label>
                    <textarea
                      name="companyMission"
                      required
                      rows="4"
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Describe your company's mission, values, and commitment to quality healthcare services..."
                      value={registerData.companyMission}
                      onChange={handleRegisterChange}
                    />
                  </div>
                </div>
              </div>

              {/* Required Documents Section */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Required Documents</h2>
                <p className="text-gray-600 mb-6">
                  Please upload all required documents to complete your registration. All files must be in PDF or DOCX format and not exceed 10MB each.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { key: 'drugSaleLicense', label: 'Drug Sale License', description: 'Valid drug sale license from relevant authorities' },
                    { key: 'gstDocument', label: 'GST Registration Document', description: 'General Sales Tax registration certificate' },
                    { key: 'ntnDocument', label: 'NTN Document', description: 'National Tax Number registration document' },
                    { key: 'pecDocument', label: 'PEC Document', description: 'Pakistan Engineering Council certificate (if applicable)' },
                    { key: 'professionalTaxCert', label: 'Professional Tax Certificate', description: 'Valid professional tax certificate' }
                  ].map(({ key, label, description }) => (
                    <div key={key} className="border border-gray-200 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {label} *
                      </label>
                      <p className="text-xs text-gray-500 mb-3">{description}</p>
                      <input
                        type="file"
                        name={key}
                        required
                        accept=".pdf,.docx"
                        onChange={handleFileChange}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {files[key] && (
                        <div className="mt-2 flex items-center text-green-600">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-sm">{files[key].name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Terms and Conditions</h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>• All information provided must be accurate and up-to-date.</p>
                  <p>• Your application will be reviewed by the RIC evaluation committee.</p>
                  <p>• Approval may take 3-5 business days after successful verification.</p>
                  <p>• You will be notified via email about your application status.</p>
                  <p>• RIC reserves the right to reject applications that don't meet requirements.</p>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="px-6 py-3 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : 'Submit Registration'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* OTP Verification */
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Verify Your Registration</h2>
              <p className="text-gray-600 mb-2">
                We've sent verification codes to:
              </p>
              <p className="text-blue-600 font-medium mb-2">{otpEmail}</p>
              <p className="text-gray-600 mb-6">
                Please enter both codes below to complete your registration.
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-4 mb-6">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {message && (
              <div className="rounded-md bg-green-50 border border-green-200 p-4 mb-6">
                <div className="text-sm text-green-700">{message}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Email OTP */}
              <div className="text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Email Verification</h3>
                  <input
                    type="text"
                    value={emailOTP}
                    onChange={(e) => setEmailOTP(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono"
                    placeholder="Enter email OTP"
                    disabled={emailVerified}
                    maxLength="6"
                  />
                  <button
                    type="button"
                    onClick={handleEmailOTPVerification}
                    disabled={loading || emailVerified || !emailOTP.trim()}
                    className="w-full mt-4 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailVerified ? '✓ Email Verified' : 'Verify Email'}
                  </button>
                </div>
              </div>

              {/* SMS OTP */}
              <div className="text-center">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">SMS Verification</h3>
                  <input
                    type="text"
                    value={smsOTP}
                    onChange={(e) => setSmsOTP(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-lg font-mono"
                    placeholder="Enter SMS OTP"
                    disabled={smsVerified}
                    maxLength="6"
                  />
                  <button
                    type="button"
                    onClick={handleSMSOTPVerification}
                    disabled={loading || smsVerified || !smsOTP.trim()}
                    className="w-full mt-4 py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {smsVerified ? '✓ SMS Verified' : 'Verify SMS'}
                  </button>
                </div>
              </div>
            </div>

            {timeRemaining > 0 && (
              <div className="text-center mb-6">
                <div className="inline-flex items-center px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-yellow-800 font-medium">
                    Codes expire in: {formatTime(timeRemaining)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-center space-x-4">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading || timeRemaining > 0}
                className="px-6 py-3 text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Resend Codes
              </button>
              
              <button
                type="button"
                onClick={handleCompleteRegistration}
                disabled={loading || !emailVerified || !smsVerified}
                className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Completing...' : 'Complete Registration'}
              </button>
            </div>

            <div className="text-center mt-8">
              <button
                onClick={() => {
                  setShowOTPVerification(false);
                  navigate('/login');
                }}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                ← Back to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierRegister;
