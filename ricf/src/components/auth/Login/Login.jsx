import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../../config/api';
import SupplierAuth from '../SupplierAuth';

const Login = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState('user');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(credentials.username, credentials.password);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      if (onLogin) onLogin(response.user);

      // Redirect based on role
      if (response.user.role === 'superadmin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (activeTab === 'supplier') {
    return <SupplierAuth onBack={() => setActiveTab('user')} onLogin={onLogin} />;
  }

  return (
    <div
      className="relative min-h-screen bg-cover bg-center flex items-center justify-center"
      style={{ 
        backgroundImage: "url('/images/background.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black opacity-30"></div>

      {/* Frosted Glass Card */}
      <div
  className="
    relative
    max-w-md w-full space-y-8 p-8
    bg-gradient-to-b
      from-white/20    /* light glass at top */
      to-purple-800/10 
    backdrop-filter backdrop-blur-sm
    rounded-2xl
  "
>
  <div>
    <h2 className="mt-6 text-center text-3xl font-light text-gray-100 tracking-tight">
      RIC e-Tender Portal
    </h2>
  </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-white/10 bg-opacity-20 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('user')}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
              activeTab === 'user'
                ? 'bg-black/20 bg-opacity-30 text-gray-100 shadow-sm'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            User/Admin Login
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${
              activeTab === 'supplier'
                ? 'bg-purple-400/30 bg-opacity-30 text-gray-100 shadow-sm'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Supplier Portal
          </button>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border-none placeholder-gray-300 text-gray-100 rounded-t-md focus:outline-none focus:ring-1 focus:ring-gray-700 focus:z-10 sm:text-sm"
                placeholder="Username"
                value={credentials.username}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border-none placeholder-gray-300 text-gray-100 rounded-b-md focus:outline-none focus:ring-1 focus:ring-gray-700 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={credentials.password}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative cursor-pointer w-1/2 mx-auto flex justify-center py-2 px-4 border border-transparent text-lg font-bold rounded-full text-white bg-purple-400/30 hover:bg-purple-200/40 focus:outline-none"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
