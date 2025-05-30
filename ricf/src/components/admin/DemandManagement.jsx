import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const DemandManagement = () => {
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedDemand, setSelectedDemand] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [showResponseModal, setShowResponseModal] = useState(false);

  useEffect(() => {
    fetchDemands();
  }, []);

  const fetchDemands = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/demands/all`, {
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

  const handleStatusUpdate = async (demandId, status) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/demands/${demandId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, response: responseText })
      });
      
      if (response.ok) {
        fetchDemands();
        setShowResponseModal(false);
        setResponseText('');
        setSelectedDemand(null);
      }
    } catch (error) {
      console.error('Error updating demand status:', error);
    }
  };

  const openResponseModal = (demand, status) => {
    setSelectedDemand(demand);
    setShowResponseModal(true);
    // If marking as not available, prompt for response
    if (status === 'not_available') {
      setResponseText('');
    } else {
      setResponseText('Item is available and will be processed.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'available': return 'bg-green-100 text-green-800 border-green-300';
      case 'not_available': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'normal': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const filteredDemands = demands.filter(demand => {
    if (filter === 'all') return true;
    return demand.status === filter;
  });
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canViewDemands = user.role === 'superadmin' || 
                         (user.departmentName && user.departmentName.toLowerCase() === 'store');
  const canUpdateStatus = user.departmentName && user.departmentName.toLowerCase() === 'store';
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Demand Management</h2>
        <div className="flex space-x-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Demands</option>
            <option value="pending">Pending</option>
            <option value="available">Available</option>
            <option value="not_available">Not Available</option>
          </select>        </div>
      </div>

      {/* Access Control Information */}
      {user.role === 'superadmin' && !canUpdateStatus && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800">
            <strong>Note:</strong> As a superadmin, you can view all demands but only Store department members can mark them as Available/Not Available.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading demands...</p>
        </div>
      ) : filteredDemands.length > 0 ? (
        <div className="space-y-4">
          {filteredDemands.map((demand) => (
            <div key={demand.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg text-gray-900">{demand.item_name}</h3>
                  <p className="text-sm text-gray-600">
                    Created by: {demand.created_by_name} 
                    {demand.creator_department && ` (${demand.creator_department})`}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(demand.status)}`}>
                    {demand.status.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(demand.urgency)}`}>
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
              
              <p className="text-gray-700 text-sm mb-4">{demand.description}</p>
              
              {demand.store_response && (
                <div className="mb-4 p-3 bg-gray-50 rounded border-l-4 border-blue-500">
                  <p className="text-sm font-medium text-gray-900">Store Response:</p>
                  <p className="text-sm text-gray-700">{demand.store_response}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Responded by {demand.store_response_by_name} on {new Date(demand.store_response_at).toLocaleString()}
                  </p>
                </div>
              )}
              
              {canUpdateStatus && demand.status === 'pending' && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => openResponseModal(demand, 'available')}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    Mark Available
                  </button>
                  <button
                    onClick={() => openResponseModal(demand, 'not_available')}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Mark Not Available
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No demands found for the selected filter.</p>
        </div>
      )}

      {/* Response Modal */}
      {showResponseModal && selectedDemand && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Update Demand Status: {selectedDemand.item_name}
            </h3>
            
            <div className="mb-4">
              <label htmlFor="response" className="block text-sm font-medium text-gray-700 mb-2">
                Response Message:
              </label>
              <textarea
                id="response"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                rows="4"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your response..."
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowResponseModal(false);
                  setResponseText('');
                  setSelectedDemand(null);
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const status = responseText.includes('available') ? 'available' : 'not_available';
                  handleStatusUpdate(selectedDemand.id, status);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemandManagement;
