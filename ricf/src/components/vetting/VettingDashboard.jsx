import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../config/api';

const VettingDashboard = () => {
    const [activeTab, setActiveTab] = useState('pending-tenders');
    const [loading, setLoading] = useState(false);
    
    // Tender vetting states
    const [pendingTenders, setPendingTenders] = useState([]);
    const [allTenders, setAllTenders] = useState([]);
    const [selectedTender, setSelectedTender] = useState(null);
    const [tenderDetails, setTenderDetails] = useState(null);
    const [showTenderModal, setShowTenderModal] = useState(false);
    const [evaluationForm, setEvaluationForm] = useState({
        decision: '',
        comments: ''
    });

    useEffect(() => {
        if (activeTab === 'pending-tenders') {
            fetchPendingTenders();
        } else if (activeTab === 'all-tenders') {
            fetchAllTenders();
        }
    }, [activeTab]);

    const fetchPendingTenders = async () => {
        try {
            setLoading(true);
            const response = await api.get('/vetting/tenders/pending');
            setPendingTenders(response.data);
        } catch (error) {
            console.error('Error fetching pending tenders:', error);
            toast.error('Failed to fetch pending tenders');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllTenders = async () => {
        try {
            setLoading(true);
            const response = await api.get('/vetting/tenders/all');
            setAllTenders(response.data);
        } catch (error) {
            console.error('Error fetching all tenders:', error);
            toast.error('Failed to fetch all tenders');
        } finally {
            setLoading(false);
        }
    };

    const fetchTenderDetails = async (tenderId) => {
        try {
            setLoading(true);
            const response = await api.get(`/vetting/tenders/${tenderId}`);
            setTenderDetails(response.data);
            setSelectedTender(tenderId);
            setShowTenderModal(true);
        } catch (error) {
            console.error('Error fetching tender details:', error);
            toast.error('Failed to fetch tender details');
        } finally {
            setLoading(false);
        }
    };

    const submitEvaluation = async () => {
        if (!evaluationForm.decision) {
            toast.error('Please select a decision');
            return;
        }

        try {
            setLoading(true);
            await api.post(`/vetting/tenders/${selectedTender}/evaluate`, evaluationForm);
            toast.success('Evaluation submitted successfully');
            setShowTenderModal(false);
            setSelectedTender(null);
            setTenderDetails(null);
            setEvaluationForm({ decision: '', comments: '' });
            
            // Refresh both lists
            fetchPendingTenders();
            if (activeTab === 'all-tenders') {
                fetchAllTenders();
            }
        } catch (error) {
            console.error('Error submitting evaluation:', error);
            const errorMessage = error.response?.data?.message || 'Failed to submit evaluation';
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const renderEvaluatedTenderCard = (tender) => {
        const getStatusBadge = () => {
            if (tender.my_decision) {
                return tender.my_decision === 'approve' 
                    ? <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Approved by You</span>
                    : <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Rejected by You</span>;
            } else if (tender.tender_status === 'vetting_approved') {
                return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">Committee Approved</span>;
            } else if (tender.tender_status === 'vetting_rejected') {
                return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">Committee Rejected</span>;
            } else {
                return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Pending</span>;
            }
        };

        return (
            <div key={tender.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{tender.tender_number}</h3>
                        <p className="text-sm text-gray-600">{tender.item_names || 'Multiple Items'}</p>
                        {tender.item_count > 1 && (
                            <p className="text-xs text-blue-600">{tender.item_count} items in this tender</p>
                        )}
                    </div>
                    {getStatusBadge()}
                </div>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p><span className="font-medium">Created by:</span> {tender.created_by_name} ({tender.created_by_department})</p>
                    <p><span className="font-medium">Total Estimated Cost:</span> PKR {tender.total_estimated_cost?.toLocaleString() || '0'}</p>
                    <p><span className="font-medium">Bidding End:</span> {new Date(tender.bidding_end_time).toLocaleString()}</p>
                    {tender.my_decision && (
                        <p><span className="font-medium">Your Decision:</span> {tender.my_decision} 
                        {tender.my_evaluation_date && (
                            <span className="text-xs text-gray-500"> on {new Date(tender.my_evaluation_date).toLocaleDateString()}</span>
                        )}
                        </p>
                    )}
                    {tender.my_comments && (
                        <p><span className="font-medium">Your Comments:</span> {tender.my_comments}</p>
                    )}
                </div>
                
                <button
                    onClick={() => fetchTenderDetails(tender.id)}
                    className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
                >
                    View Details
                </button>
            </div>
        );
    };

    const renderTenderCard = (tender) => {
        return (
            <div key={tender.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{tender.tender_number}</h3>
                        <p className="text-sm text-gray-600">{tender.item_names || 'Multiple Items'}</p>
                        {tender.item_count > 1 && (
                            <p className="text-xs text-blue-600">{tender.item_count} items in this tender</p>
                        )}
                    </div>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                        Pending Vetting
                    </span>
                </div>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p><span className="font-medium">Created by:</span> {tender.created_by_name} ({tender.created_by_department})</p>
                    <p><span className="font-medium">Total Estimated Cost:</span> PKR {tender.total_estimated_cost?.toLocaleString() || '0'}</p>
                    <p><span className="font-medium">Bidding End:</span> {new Date(tender.bidding_end_time).toLocaleString()}</p>
                    <p><span className="font-medium">Minimum Suppliers:</span> {tender.minimum_suppliers}</p>
                </div>
                
                <button
                    onClick={() => fetchTenderDetails(tender.id)}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                    Review Tender
                </button>
            </div>
        );
    };

    const renderTenderDetailsModal = () => {
        if (!tenderDetails) return null;

        const { tender, items, evaluationCriteria, existingEvaluations } = tenderDetails;

        return (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg max-w-4xl w-full max-h-full overflow-y-auto">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Tender Review</h2>
                            <button
                                onClick={() => setShowTenderModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {/* Tender Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Tender Details</h3>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-medium">Number:</span> {tender.tender_number}</p>
                                    <p><span className="font-medium">Description:</span> {tender.demand_description}</p>
                                    <p><span className="font-medium">Total Estimated Cost:</span> PKR {tender.total_estimated_cost?.toLocaleString() || '0'}</p>
                                    <p><span className="font-medium">Total Items:</span> {tender.item_count} item(s)</p>
                                    <p><span className="font-medium">Urgency:</span> {tender.urgency}</p>
                                    <p><span className="font-medium">Required By:</span> {new Date(tender.required_by).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Bidding Details</h3>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-medium">Bidding End:</span> {new Date(tender.bidding_end_time).toLocaleString()}</p>
                                    <p><span className="font-medium">Minimum Suppliers:</span> {tender.minimum_suppliers}</p>
                                    <p><span className="font-medium">Created by:</span> {tender.created_by_name}</p>
                                    <p><span className="font-medium">Department:</span> {tender.created_by_department}</p>
                                </div>
                            </div>
                        </div>

                        {/* Demand Items */}
                        {items && items.length > 0 && (
                            <div className="mb-6">
                                <h3 className="font-semibold text-gray-900 mb-3">Demand Items</h3>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full">
                                            <thead>
                                                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    <th className="py-2">Item</th>
                                                    <th className="py-2">Quantity</th>
                                                    <th className="py-2">Unit</th>
                                                    <th className="py-2">Estimated Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-sm">
                                                {items.map((item, index) => (
                                                    <tr key={index} className="border-t border-gray-200">
                                                        <td className="py-2">{item.item_name_full || item.item_name || item.custom_item_name}</td>
                                                        <td className="py-2">{item.quantity}</td>
                                                        <td className="py-2">{item.unit}</td>
                                                        <td className="py-2">PKR {(item.store_estimated_cost || (item.estimated_cost * item.quantity))?.toLocaleString() || '0'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Evaluation Criteria */}
                        {evaluationCriteria && evaluationCriteria.length > 0 && (
                            <div className="mb-6">
                                <h3 className="font-semibold text-gray-900 mb-3">Evaluation Criteria</h3>
                                <div className="space-y-3">
                                    {evaluationCriteria.map((criteria, index) => (
                                        <div key={index} className="bg-gray-50 rounded-lg p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <h4 className="font-medium text-gray-900">{criteria.criteria_title}</h4>
                                                    <p className="text-sm text-gray-600 mt-1">{criteria.criteria_description}</p>
                                                </div>
                                                <div className="flex items-center space-x-2 ml-4">
                                                    {criteria.is_knockout ? (
                                                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                                                            Knockout
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                                            Scoring ({criteria.weightage}%)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Existing Evaluations */}
                        {existingEvaluations && existingEvaluations.length > 0 && (
                            <div className="mb-6">
                                <h3 className="font-semibold text-gray-900 mb-3">Committee Evaluations</h3>
                                <div className="space-y-2">
                                    {existingEvaluations.map((evaluation, index) => (
                                        <div key={index} className="bg-gray-50 rounded-lg p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-gray-900">{evaluation.member_name}</span>
                                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                                    evaluation.decision === 'approve' 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {evaluation.decision === 'approve' ? 'Approved' : 'Rejected'}
                                                </span>
                                            </div>
                                            {evaluation.comments && (
                                                <p className="text-sm text-gray-600 mt-1">{evaluation.comments}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Evaluation Form */}
                        <div className="bg-blue-50 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-900 mb-3">Your Evaluation</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                                    <div className="flex space-x-4">
                                        <label className="flex items-center">
                                            <input
                                                type="radio"
                                                name="decision"
                                                value="approve"
                                                checked={evaluationForm.decision === 'approve'}
                                                onChange={(e) => setEvaluationForm(prev => ({ ...prev, decision: e.target.value }))}
                                                className="mr-2"
                                            />
                                            <span className="text-green-700 font-medium">Approve</span>
                                        </label>
                                        <label className="flex items-center">
                                            <input
                                                type="radio"
                                                name="decision"
                                                value="reject"
                                                checked={evaluationForm.decision === 'reject'}
                                                onChange={(e) => setEvaluationForm(prev => ({ ...prev, decision: e.target.value }))}
                                                className="mr-2"
                                            />
                                            <span className="text-red-700 font-medium">Reject</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                                    <textarea
                                        value={evaluationForm.comments}
                                        onChange={(e) => setEvaluationForm(prev => ({ ...prev, comments: e.target.value }))}
                                        rows={3}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your comments (optional)"
                                    />
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        onClick={() => setShowTenderModal(false)}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitEvaluation}
                                        disabled={loading || !evaluationForm.decision}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Submitting...' : 'Submit Evaluation'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Vetting Committee Dashboard</h1>
                    <p className="text-gray-600">Review and evaluate tenders submitted for vetting approval</p>
                </div>

                {/* Tab Navigation */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('pending-tenders')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'pending-tenders'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Pending Tenders ({pendingTenders.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('all-tenders')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'all-tenders'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            All Tenders ({allTenders.length})
                        </button>
                    </nav>
                </div>

                {/* Content */}
                {loading && !showTenderModal ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div>
                        {activeTab === 'pending-tenders' && (
                            <div>
                                {pendingTenders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <i className="fas fa-clipboard-check text-4xl text-gray-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Tenders</h3>
                                        <p className="text-gray-500">There are no tenders currently pending vetting approval.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {pendingTenders.map(renderTenderCard)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Tender Details Modal */}
                {showTenderModal && renderTenderDetailsModal()}
            </div>
        </div>
    );
};

export default VettingDashboard;
