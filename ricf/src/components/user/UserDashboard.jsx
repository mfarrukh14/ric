import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function UserDashboard() {
  const navigate = useNavigate();
  // Retrieve user from localStorage
  const stored = localStorage.getItem('user');
  const user = stored ? JSON.parse(stored) : null;

  const handleCreateDemand = () => {
    // Navigate to the demand creation page
    navigate('/create-demand');
  };

  return (
    <div className="container mx-auto p-8">
      {/* Top bar with Create Demand button if eligible */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">User Dashboard</h1>
        {user?.eligibleForDemandCreation && (
          <button
            onClick={handleCreateDemand}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Create Demand
          </button>
        )}
      </div>

      {/* Main dashboard content */}
      <p>Welcome back, {user?.name || 'User'}! Use the button above to create a demand if needed.</p>
    </div>
  );
}
