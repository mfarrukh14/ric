import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const SupplierAuth = ({ onBack, onLogin }) => {
    const [activeTab, setActiveTab] = useState('login');
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [registerData, setRegisterData] = useState({
        companyName: '',
        companyEmail: '',
        password: '',
        confirmPassword: '',
        companyStatement: '',
        companyMission: ''
    });
    const [files, setFiles] = useState({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

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

            const response = await fetch(`${apiUrl}/suppliers/register`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            setMessage('Registration submitted successfully! Your application is under evaluation.');
            setRegisterData({
                companyName: '',
                companyEmail: '',
                password: '',
                confirmPassword: '',
                companyStatement: '',
                companyMission: ''
            });
            setFiles({});

        } catch (err) {
            setError(err.message || 'Registration failed. Please try again.');
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
                    <h2 className="text-3xl font-extrabold text-gray-900">
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
            </div>
        </div>
    );
};

export default SupplierAuth;
