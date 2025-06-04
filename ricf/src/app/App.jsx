import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import '../index.css';
import Login from '../components/auth/Login';
import AdminDashboard from '../components/admin/AdminDashboard';
import UserDashboard from '../components/user/UserDashboard';
import SupplierDashboard from '../components/supplier/SupplierDashboard';
import TechnicalEvaluation from '../components/committee/TechnicalEvaluation';
import ItemWiseEvaluation from '../components/committee/ItemWiseEvaluation';
import Header from '../components/layout/header/Header';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = JSON.parse(localStorage.getItem('user'));

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <Router>
      <div>
        {user && <Header user={user} onLogout={handleLogout} />} 

        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <Login onLogin={setUser} /> 
              )
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['superadmin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <UserDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/committee/technical-evaluation"
            element={
              <ProtectedRoute>
                <TechnicalEvaluation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/committee/technical-evaluation/:tenderId/evaluate"
            element={
              <ProtectedRoute>
                <ItemWiseEvaluation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier-dashboard"
            element={
              <ProtectedRoute allowedRoles={['supplier']}>
                <SupplierDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              user ? (
                user.role === 'superadmin' ? (
                  <Navigate to="/admin" replace />
                ) : user.role === 'supplier' ? (
                  <Navigate to="/supplier-dashboard" replace />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
