import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const VettingCommittee = () => {
    const [demands, setDemands] = useState([]);
    const [selectedDemand, setSelectedDemand] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [evaluationForm, setEvaluationForm] = useState({
        status: '',
        comments: '',
        updatedDemand: {
            item_name: '',
            quantity: '',
            estimated_cost: '',
            description: '',
            urgency: '',
            required_by: ''
        }
    });    const [showEvaluationModal, setShowEvaluationModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    useEffect(() => {
        fetchVettingDemands();
    }, []);

    const fetchVettingDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/vetting`, {
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

    const handleEvaluate = (demand) => {
        setSelectedDemand(demand);
        setEvaluationForm({
            status: '',
            comments: '',
            updatedDemand: {
                item_name: demand.item_name,
                quantity: demand.quantity,
                estimated_cost: demand.estimated_cost,
                description: demand.description,
                urgency: demand.urgency,
                required_by: demand.required_by
            }
        });
        setShowEvaluationModal(true);
    };

    const handleEvaluationSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!evaluationForm.status) {
            setError('Please select approval or rejection');
            return;
        }

        if (evaluationForm.status === 'rejected' && !evaluationForm.comments) {
            setError('Rejection reason is required');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/${selectedDemand.id}/evaluate-vetting`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evaluationForm)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit evaluation');
            }            setShowEvaluationModal(false);
            fetchVettingDemands(); // Refresh the list
            
            // Show success modal
            setShowSuccessModal(true);
            setTimeout(() => {
                setShowSuccessModal(false);
            }, 2000);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('demand_')) {
            const fieldName = name.replace('demand_', '');
            setEvaluationForm(prev => ({
                ...prev,
                updatedDemand: {
                    ...prev.updatedDemand,
                    [fieldName]: value
                }
            }));
        } else {
            setEvaluationForm(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const getStatusBadge = (status) => {
        const statusColors = {
            'vetting': 'bg-yellow-100 text-yellow-800',
            'rejected': 'bg-red-100 text-red-800',
            'approved': 'bg-green-100 text-green-800'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
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
                        <h1 className="text-3xl font-bold text-gray-900">Vetting Committee</h1>
                        <p className="text-gray-600">Review and evaluate demands rejected by store department</p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-md bg-red-50 p-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">Demands for Review</h2>
                            
                            {demands.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-gray-500">No demands available for vetting at this time.</div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Item Details
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Quantity & Cost
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Urgency
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Requested By
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Status
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {demands.map((demand) => (
                                                <tr key={demand.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {demand.item_name}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                {demand.description}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">
                                                            Qty: {demand.quantity}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Cost: ${demand.estimated_cost}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                            demand.urgency === 'high' ? 'bg-red-100 text-red-800' :
                                                            demand.urgency === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-green-100 text-green-800'
                                                        }`}>
                                                            {demand.urgency}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">
                                                            {demand.created_by_name}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {demand.creator_department}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {getStatusBadge(demand.status)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                        <button
                                                            onClick={() => handleEvaluate(demand)}
                                                            className="text-indigo-600 hover:text-indigo-900"
                                                        >
                                                            Evaluate
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Evaluation Modal */}
            {showEvaluationModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Evaluate Demand: {selectedDemand?.item_name}
                        </h3>

                        <form onSubmit={handleEvaluationSubmit}>
                            {/* Demand Details (Editable) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Item Name</label>
                                    <input
                                        type="text"
                                        name="demand_item_name"
                                        value={evaluationForm.updatedDemand.item_name}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Quantity</label>
                                    <input
                                        type="number"
                                        name="demand_quantity"
                                        value={evaluationForm.updatedDemand.quantity}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Estimated Cost</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="demand_estimated_cost"
                                        value={evaluationForm.updatedDemand.estimated_cost}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Urgency</label>
                                    <select
                                        name="demand_urgency"
                                        value={evaluationForm.updatedDemand.urgency}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    >
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        name="demand_description"
                                        value={evaluationForm.updatedDemand.description}
                                        onChange={handleFormChange}
                                        rows={3}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Required By</label>
                                    <input
                                        type="date"
                                        name="demand_required_by"
                                        value={evaluationForm.updatedDemand.required_by}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Evaluation Decision */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700">Decision</label>
                                <div className="mt-2 space-x-4">
                                    <label className="inline-flex items-center">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="approved"
                                            checked={evaluationForm.status === 'approved'}
                                            onChange={handleFormChange}
                                            className="form-radio h-4 w-4 text-indigo-600"
                                        />
                                        <span className="ml-2 text-sm text-gray-700">Approve</span>
                                    </label>
                                    <label className="inline-flex items-center">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="rejected"
                                            checked={evaluationForm.status === 'rejected'}
                                            onChange={handleFormChange}
                                            className="form-radio h-4 w-4 text-red-600"
                                        />
                                        <span className="ml-2 text-sm text-gray-700">Reject</span>
                                    </label>
                                </div>
                            </div>

                            {/* Comments */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700">
                                    Comments {evaluationForm.status === 'rejected' && <span className="text-red-500">*</span>}
                                </label>
                                <textarea
                                    name="comments"
                                    value={evaluationForm.comments}
                                    onChange={handleFormChange}
                                    rows={3}
                                    placeholder={evaluationForm.status === 'rejected' ? 'Please provide reason for rejection' : 'Optional comments'}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowEvaluationModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    Submit Evaluation
                                </button>
                            </div>
                        </form>                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="relative p-8 border w-96 shadow-lg rounded-md bg-white text-center">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Evaluation Submitted!</h3>
                            <p className="text-gray-600">Your evaluation has been successfully submitted.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VettingCommittee;
