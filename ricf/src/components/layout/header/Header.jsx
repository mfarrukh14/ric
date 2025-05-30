// components/layout/Header.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Header = ({ user, onLogout }) => {
  const navigate = useNavigate();

  // Get display name based on user type
  const getDisplayName = () => {
    if (user.role === 'supplier') {
      return user.companyName;
    }
    return user.name || user.username;
  };

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <span className="font-bold cursor-pointer" onClick={() => navigate('/')}>
          Tender Management System
        </span>
        <div className="flex items-center gap-4">
          <span>Welcome, {getDisplayName()}</span>
          <button 
            onClick={onLogout}
            className="bg-red-600 px-4 py-2 rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Header;
