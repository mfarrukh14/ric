import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateDemandModal from '../modals/CreateDemandModal';
import DemandManagement from '../admin/DemandManagement';
import { apiUrl } from '../../config/api';

export default function UserDashboard() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(false);  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('my-demands');

  // Check if user is Store department user
  const isStoreDepartmentUser = user?.departmentName && user.departmentName.toLowerCase() === 'store';
  // Initialize user from localStorage once
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const userData = JSON.parse(stored);
      console.log('User data loaded:', userData);
      console.log('Department name:', userData.departmentName);
      setUser(userData);
    }
  }, []);

  useEffect(() => {
    if (user?.eligibleForDemandCreation || isStoreDepartmentUser) {
      fetchUserDemands();
    }
  }, [user?.id, isStoreDepartmentUser]);

  const fetchUserDemands = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/demands/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDemands(data);
      }
    } catch (error) {
      console.error('Error fetching demands:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDemand = () => {
    setIsCreateModalOpen(true);
  };

  const handleSubmitDemand = async (demandData) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/demands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(demandData)
      });
      
      if (response.ok) {
        fetchUserDemands();
        return Promise.resolve();
      } else {
        throw new Error('Failed to create demand');
      }
    } catch (error) {
      console.error('Error creating demand:', error);
      throw error;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'available': return 'bg-green-100 text-green-800';
      case 'not_available': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          {isStoreDepartmentUser ? 'Store Department Dashboard' : 'User Dashboard'}
        </h1>
        {user?.eligibleForDemandCreation && (
          <button
            onClick={handleCreateDemand}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Create Demand
          </button>
        )}
      </div>

      {isStoreDepartmentUser && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('manage-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'manage-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Manage All Demands
              </button>
            </nav>
          </div>
        </div>
      )}

      {(!isStoreDepartmentUser || activeTab === 'my-demands') && (
        <div>
          <div className="mb-8">
            <p className="text-gray-600">Welcome back, {user?.name || 'User'}!</p>
            {user?.eligibleForDemandCreation && !isStoreDepartmentUser && (
              <p className="text-sm text-gray-500 mt-1">
                You can create demands using the button above. Your demands will be reviewed by the store department.
              </p>
            )}
            {user && !user.eligibleForDemandCreation && !isStoreDepartmentUser && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">
                  You currently don't have permission to create demands. Please contact your administrator if you need access.
                </p>
              </div>
            )}
            {isStoreDepartmentUser && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800">
                  As a Store department member, you can view and manage all demands. Use the tabs above to switch between your personal demands and demand management.
                </p>
              </div>
            )}
          </div>

          {(user?.eligibleForDemandCreation || isStoreDepartmentUser) && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">My Demands</h2>
              </div>
              
              <div className="p-6">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading demands...</p>
                  </div>
                ) : demands.length > 0 ? (
                  <div className="space-y-4">
                    {demands.map((demand) => (
                      <div key={demand.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg text-gray-900">{demand.item_name}</h3>
                          <div className="flex space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(demand.status)}`}>
                              {demand.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getUrgencyColor(demand.urgency)}`}>
                              {demand.urgency.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-3">
                          <div>
                            <span className="font-medium">Quantity:</span> {demand.quantity}
                          </div>
                          <div>
                            <span className="font-medium">Est. Cost:</span> ₹{demand.estimated_cost}
                          </div>
                          <div>
                            <span className="font-medium">Required By:</span> {new Date(demand.required_by).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span> {new Date(demand.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        
                        <p className="text-gray-700 text-sm">{demand.description}</p>
                        
                        {demand.store_response && (
                          <div className="mt-3 p-3 bg-gray-50 rounded border-l-4 border-blue-500">
                            <p className="text-sm font-medium text-gray-900">Store Response:</p>
                            <p className="text-sm text-gray-700">{demand.store_response}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Responded on {new Date(demand.store_response_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No demands created yet.</p>
                    {user?.eligibleForDemandCreation && (
                      <p className="text-sm text-gray-400 mt-1">Click "Create Demand" to get started.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isStoreDepartmentUser && activeTab === 'manage-demands' && (
        <DemandManagement />
      )}

      <CreateDemandModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleSubmitDemand}
      />
    </div>
  );
}
