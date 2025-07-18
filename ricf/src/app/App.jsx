import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { useState, useEffect, useCallback } from 'react';
import '../index.css';
import Login from '../components/auth/Login/Login';
import SupplierRegister from '../components/auth/SupplierRegister';
import AdminDashboard from '../components/admin/AdminDashboard';
import UserDashboard from '../components/user/UserDashboard';
import SupplierDashboard from '../components/supplier/SupplierDashboard';
import BidApplication from '../components/supplier/BidApplication';
import TechnicalEvaluation from '../components/committee/TechnicalEvaluation';
import ItemWiseEvaluation from '../components/committee/ItemWiseEvaluation';
import GrievanceCommitteeNew from '../components/committee/GrievanceCommitteeNew';
import CreateDemandForm from '../components/demand/CreateDemandForm';
import FulfillmentPage from '../components/store/FulfillmentPage';
import Header from '../components/layout/header/Header';

const ProtectedRoute = ({ children, allowedRoles, currentUser }) => {
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error parsing user data:', error);
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependency array to prevent infinite loops

  const handleLogin = useCallback((newUser) => {
    setUser(newUser);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

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
                <Login onLogin={handleLogin} /> 
              )
            }
          />
          <Route
            path="/supplier-register"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <SupplierRegister />
              )
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['superadmin']} currentUser={user}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute currentUser={user}>
                <UserDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/committee/technical-evaluation"
            element={
              <ProtectedRoute currentUser={user}>
                <TechnicalEvaluation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/committee/technical-evaluation/:tenderId/evaluate"
            element={
              <ProtectedRoute currentUser={user}>
                <ItemWiseEvaluation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/committee/grievance"
            element={
              <ProtectedRoute currentUser={user}>
                <GrievanceCommitteeNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier-dashboard"
            element={
              <ProtectedRoute allowedRoles={['supplier']} currentUser={user}>
                <SupplierDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier/apply-bid/:tenderId"
            element={
              <ProtectedRoute allowedRoles={['supplier']} currentUser={user}>
                <BidApplication />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-demand"
            element={
              <ProtectedRoute currentUser={user}>
                <CreateDemandForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/store/fulfillment/:demandId"
            element={
              <ProtectedRoute currentUser={user}>
                <FulfillmentPage />
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
