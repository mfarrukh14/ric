import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Eye, AlertCircle } from 'lucide-react';
import Modal from '../modals/Modal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const HodDashboard = () => {
    const [pendingDemands, setPendingDemands] = useState([]);
    const [selectedDemand, setSelectedDemand] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalAction, setApprovalAction] = useState(''); // 'approve' or 'reject'
    const [rejectionReason, setRejectionReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchPendingDemands();
    }, []);

    const fetchPendingDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/demands/hod/pending`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPendingDemands(data);
            } else {
                throw new Error('Failed to fetch pending demands');
            }
        } catch (error) {
            setError('Error fetching pending demands: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchDemandDetails = async (demandId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/demands/${demandId}/with-items`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSelectedDemand(data);
                setShowDetailsModal(true);
            } else {
                throw new Error('Failed to fetch demand details');
            }
        } catch (error) {
            setError('Error fetching demand details: ' + error.message);
        }
    };

    const handleApprovalAction = async () => {
        if (approvalAction === 'reject' && !rejectionReason.trim()) {
            setError('Rejection reason is required');
            return;
        }

        setProcessing(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/demands/hod/approve-reject`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    demandId: selectedDemand.id,
                    action: approvalAction,
                    rejectionReason: rejectionReason.trim()
                })
            });

            if (response.ok) {
                await fetchPendingDemands(); // Refresh the list
                setShowApprovalModal(false);
                setShowDetailsModal(false);
                setRejectionReason('');
                setError('');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process approval');
            }
        } catch (error) {
            setError('Error processing approval: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const openApprovalModal = (action) => {
        setApprovalAction(action);
        setRejectionReason('');
        setError('');
        setShowApprovalModal(true);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending_hod_approval':
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending HOD Approval
                </span>;
            default:
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {status}
                </span>;
        }
    };

    const getUrgencyBadge = (urgency) => {
        const urgencyColors = {
            urgent: 'bg-red-100 text-red-800',
            high: 'bg-orange-100 text-orange-800',
            normal: 'bg-green-100 text-green-800',
            low: 'bg-blue-100 text-blue-800'
        };

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[urgency] || urgencyColors.normal}`}>
                {urgency || 'normal'}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">HOD Dashboard</h1>
                <p className="text-gray-600">Review and approve demands from your department</p>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    <div className="flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        {error}
                    </div>
                </div>
            )}

            {pendingDemands.length === 0 ? (
                <div className="text-center py-12">
                    <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No pending demands</h3>
                    <p className="mt-1 text-sm text-gray-500">All demands from your department have been reviewed.</p>
                </div>
            ) : (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200">
                        {pendingDemands.map((demand) => (
                            <li key={demand.id} className="px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-medium text-gray-900">
                                                {demand.item_name}
                                            </h3>
                                            <div className="flex space-x-2">
                                                {getStatusBadge(demand.status)}
                                                {getUrgencyBadge(demand.urgency)}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm text-gray-600">
                                            <p><strong>Description:</strong> {demand.description}</p>
                                            <p><strong>Quantity:</strong> {demand.quantity}</p>
                                            <p><strong>Estimated Cost:</strong> PKR{Number(demand.estimated_cost).toLocaleString()}</p>
                                            <p><strong>Required By:</strong> {new Date(demand.required_by).toLocaleDateString()}</p>
                                            <p><strong>Requested By:</strong> {demand.creator_name}</p>
                                            <p><strong>Department:</strong> {demand.department_name}</p>
                                            <p><strong>Created:</strong> {new Date(demand.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="ml-6 flex space-x-2">
                                        <button
                                            onClick={() => fetchDemandDetails(demand.id)}
                                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            View Details
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedDemand(demand);
                                                openApprovalModal('approve');
                                            }}
                                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                        >
                                            <CheckCircle className="w-4 h-4 mr-1" />
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedDemand(demand);
                                                openApprovalModal('reject');
                                            }}
                                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                        >
                                            <XCircle className="w-4 h-4 mr-1" />
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Demand Details Modal */}
            <Modal 
                show={showDetailsModal} 
                onClose={() => setShowDetailsModal(false)} 
                title="Demand Details"
                size="lg"
            >
                {selectedDemand && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="font-medium text-gray-900 mb-2">Basic Information</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><strong>Item:</strong> {selectedDemand.item_name}</div>
                                <div><strong>Quantity:</strong> {selectedDemand.quantity}</div>
                                <div><strong>Cost:</strong> PKR{Number(selectedDemand.estimated_cost).toLocaleString()}</div>
                                <div><strong>Urgency:</strong> {selectedDemand.urgency}</div>
                                <div><strong>Required By:</strong> {new Date(selectedDemand.required_by).toLocaleDateString()}</div>
                                <div><strong>Requested By:</strong> {selectedDemand.creator_name}</div>
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{selectedDemand.description}</p>
                        </div>

                        {selectedDemand.items && selectedDemand.items.length > 0 && (
                            <div>
                                <h4 className="font-medium text-gray-900 mb-2">Items Breakdown</h4>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost (Current Year)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {selectedDemand.items.map((item, index) => (
                                                <tr key={index}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {item.item_name || item.drug_name || item.equipment_type_name || 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.unit}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        PKR{Number(item.current_year_cost || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    openApprovalModal('approve');
                                }}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                            </button>
                            <button
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    openApprovalModal('reject');
                                }}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Approval/Rejection Modal */}
            <Modal 
                show={showApprovalModal} 
                onClose={() => setShowApprovalModal(false)} 
                title={`${approvalAction === 'approve' ? 'Approve' : 'Reject'} Demand`}
            >
                {selectedDemand && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="font-medium text-gray-900 mb-2">Demand Summary</h4>
                            <p><strong>Item:</strong> {selectedDemand.item_name}</p>
                            <p><strong>Requested By:</strong> {selectedDemand.creator_name}</p>
                            <p><strong>Cost:</strong> PKR{Number(selectedDemand.estimated_cost).toLocaleString()}</p>
                        </div>

                        {approvalAction === 'reject' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Rejection Reason *
                                </label>
                                <textarea
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    rows={4}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Please provide a reason for rejecting this demand..."
                                />
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowApprovalModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                                disabled={processing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApprovalAction}
                                disabled={processing || (approvalAction === 'reject' && !rejectionReason.trim())}
                                className={`px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white ${
                                    approvalAction === 'approve' 
                                        ? 'bg-green-600 hover:bg-green-700' 
                                        : 'bg-red-600 hover:bg-red-700'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {processing ? (
                                    <div className="flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        Processing...
                                    </div>
                                ) : (
                                    approvalAction === 'approve' ? 'Approve Demand' : 'Reject Demand'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default HodDashboard;
