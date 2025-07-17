import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const DemandManagement = () => {
    const navigate = useNavigate();
    const [demands, setDemands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchDemands();
    }, []);

    const fetchDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/with-items`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch demands');
            }

            const data = await response.json();
            setDemands(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleManageFulfillment = (demand) => {
        // Navigate to the dedicated fulfillment page
        navigate(`/store/fulfillment/${demand.id}`);
    };

    const getStatusBadge = (status) => {
        const statusColors = {
            'pending': 'bg-yellow-100 text-yellow-800',
            'store_pending': 'bg-blue-100 text-blue-800',
            'available': 'bg-green-100 text-green-800',
            'not_available': 'bg-red-100 text-red-800',
            'vetting_pending': 'bg-purple-100 text-purple-800',
            'vetting_approved': 'bg-green-100 text-green-800',
            'vetting_rejected': 'bg-red-100 text-red-800',
            'purchase_pending': 'bg-indigo-100 text-indigo-800',
            'purchase_approved': 'bg-green-100 text-green-800',
            'rejected': 'bg-red-100 text-red-800'
        };

        const statusLabels = {
            'pending': 'Pending Review',
            'store_pending': 'Store Review',
            'available': 'Available',
            'not_available': 'Not Available',
            'vetting_pending': 'Vetting Review',
            'vetting_approved': 'Vetting Approved',
            'vetting_rejected': 'Vetting Rejected',
            'purchase_pending': 'Purchase Review',
            'purchase_approved': 'Purchase Approved',
            'rejected': 'Rejected'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
                {statusLabels[status] || status}
            </span>
        );
    };

    const getUrgencyBadge = (urgency) => {
        const urgencyColors = {
            'high': 'bg-red-100 text-red-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-yellow-100 text-yellow-800',
            'low': 'bg-green-100 text-green-800'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[urgency] || 'bg-gray-100 text-gray-800'}`}>
                {urgency?.charAt(0).toUpperCase() + urgency?.slice(1) || 'Normal'}
            </span>
        );
    };

    const getTotalEstimatedCost = (items) => {
        if (!items || items.length === 0) return 0;
        return items.reduce((total, item) => total + parseFloat(item.estimated_cost || 0), 0);
    };

    const canManageFulfillment = (demand) => {
        return demand.status === 'pending' || demand.status === 'store_pending';
    };

    const getItemStatusSummary = (items) => {
        if (!items || items.length === 0) return null;
        
        const statusCounts = items.reduce((acc, item) => {
            const status = item.store_status || 'pending';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        return statusCounts;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">Store Department - Demand Management</h1>
                        <p className="text-gray-600">Review and manage fulfillment for incoming demands</p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-md bg-red-50 p-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">Pending Demands</h2>
                            
                            {demands.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-gray-500">No pending demands at this time.</div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {demands.map((demand) => (
                                        <div key={demand.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-xl font-semibold text-gray-900">
                                                        Demand #{demand.id}
                                                    </h3>
                                                    <p className="text-sm text-gray-600">
                                                        Created by: {demand.created_by_name}
                                                        {demand.creator_department && ` (${demand.creator_department})`}
                                                    </p>
                                                </div>
                                                <div className="flex space-x-2">
                                                    {getStatusBadge(demand.status)}
                                                    {getUrgencyBadge(demand.urgency)}
                                                </div>
                                            </div>

                                            {/* Demand Summary */}
                                            <div className="bg-gray-50 rounded-lg p-4 mb-4">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <span className="font-medium text-gray-700">Total Items:</span>
                                                        <span className="ml-2">{demand.items?.length || 1}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-gray-700">Total Est. Cost:</span>
                                                        <span className="ml-2">Rs {demand.items ? getTotalEstimatedCost(demand.items) : demand.estimated_cost}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-gray-700">Required By:</span>
                                                        <span className="ml-2">{new Date(demand.required_by).toLocaleDateString()}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-gray-700">Created:</span>
                                                        <span className="ml-2">{new Date(demand.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                {demand.description && (
                                                    <div className="mt-3">
                                                        <span className="font-medium text-gray-700">Description:</span>
                                                        <p className="text-gray-600 mt-1">{demand.description}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Items Display */}
                                            {demand.items && demand.items.length > 0 ? (
                                                <div className="mb-4">
                                                    <h4 className="font-medium text-gray-900 mb-3">Items Requested:</h4>
                                                    <div className="space-y-3">
                                                        {demand.items.map((item, index) => (
                                                            <div key={item.id} className="bg-white border rounded-lg p-4">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                                    {item.store_status && (
                                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                            item.store_status === 'available' ? 'bg-green-100 text-green-800' :
                                                                            item.store_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                                                            item.store_status === 'not_available' ? 'bg-red-100 text-red-800' :
                                                                            'bg-gray-100 text-gray-800'
                                                                        }`}>
                                                                            {item.store_status === 'available' ? 'AVAILABLE' :
                                                                             item.store_status === 'partial' ? 'PARTIAL' :
                                                                             item.store_status === 'not_available' ? 'NOT AVAILABLE' :
                                                                             'PENDING'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                                                                    <div>
                                                                        <span className="font-medium">Quantity:</span> {item.quantity} {item.unit}
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium">Est. Cost:</span> Rs {item.estimated_cost}
                                                                    </div>
                                                                    {item.store_available_quantity !== undefined && (
                                                                        <div>
                                                                            <span className="font-medium">Available:</span> {item.store_available_quantity} {item.unit}
                                                                        </div>
                                                                    )}
                                                                    {item.unit && (
                                                                        <div>
                                                                            <span className="font-medium">Unit:</span> {item.unit}
                                                                        </div>
                                                                    )}
                                                                    {item.stock_in_hand !== undefined && (
                                                                        <div>
                                                                            <span className="font-medium">Stock in Hand:</span> {item.stock_in_hand} {item.unit}
                                                                        </div>
                                                                    )}
                                                                    {item.consumption_type && (
                                                                        <div>
                                                                            <span className="font-medium">Consumption:</span> {item.consumption_amount} {item.unit} ({item.consumption_type})
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {item.remarks && (
                                                                    <div className="mt-2 text-sm text-gray-600">
                                                                        <span className="font-medium">Remarks:</span> {item.remarks}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                // Fallback for old single-item demands
                                                <div className="mb-4">
                                                    <h4 className="font-medium text-gray-900 mb-3">Item Details:</h4>
                                                    <div className="bg-white border rounded-lg p-4">
                                                        <h5 className="font-medium text-gray-900 mb-2">{demand.item_name}</h5>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-600">
                                                            <div>
                                                                <span className="font-medium">Quantity:</span> {demand.quantity} {demand.unit || 'pcs'}
                                                            </div>
                                                            <div>
                                                                <span className="font-medium">Est. Cost:</span> Rs {demand.estimated_cost}
                                                            </div>
                                                            <div>
                                                                <span className="font-medium">Unit:</span> {demand.unit || 'pcs'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Store Response Display */}
                                            {demand.store_response && (
                                                <div className="mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                                                    <p className="text-sm font-medium text-gray-900">Store Response:</p>
                                                    <p className="text-sm text-gray-700 mt-1">{demand.store_response}</p>
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Responded by {demand.store_response_by_name} on {new Date(demand.store_response_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className="flex justify-end">
                                                {canManageFulfillment(demand) ? (
                                                    <button
                                                        onClick={() => handleManageFulfillment(demand)}
                                                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        Manage Fulfillment
                                                    </button>
                                                ) : (
                                                    <div className="text-sm text-gray-500">
                                                        Response already submitted
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DemandManagement;
