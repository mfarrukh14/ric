import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const GrievanceManagement = () => {
    const [activeTab, setActiveTab] = useState('rejected-items');
    const [rejectedItems, setRejectedItems] = useState([]);
    const [grievances, setGrievances] = useState([]);
    const [deadlineStatus, setDeadlineStatus] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showGrievanceForm, setShowGrievanceForm] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [grievanceForm, setGrievanceForm] = useState({
        grievanceReason: '',
        supportingDocuments: '',
        requestedAction: '',
        additionalComments: ''
    });

    useEffect(() => {
        if (activeTab === 'rejected-items') {
            fetchRejectedItems();
            fetchDeadlineStatus();
        } else if (activeTab === 'my-grievances') {
            fetchMyGrievances();
        }
    }, [activeTab]);

    const fetchRejectedItems = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('http://localhost:5000/api/grievances/supplier/rejected-items', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRejectedItems(response.data);
        } catch (error) {
            toast.error('Failed to fetch rejected items');
            console.error('Error fetching rejected items:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMyGrievances = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('http://localhost:5000/api/grievances/supplier/my-grievances', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setGrievances(response.data);
        } catch (error) {
            toast.error('Failed to fetch grievances');
            console.error('Error fetching grievances:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDeadlineStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('http://localhost:5000/api/grievances/supplier/deadline-status', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeadlineStatus(response.data);
        } catch (error) {
            console.error('Error fetching deadline status:', error);
        }
    };

    // Check if grievance can be applied for a specific item
    const canApplyGrievance = (item) => {
        // Find the deadline status for this item's tender
        const deadline = deadlineStatus.find(d => 
            d.items.some(i => i.tech_eval_id === item.id)
        );
        
        if (!deadline) return false;
        
        const itemDeadline = deadline.items.find(i => i.tech_eval_id === item.id);
        return itemDeadline ? itemDeadline.can_apply : false;
    };

    // Get deadline information for display
    const getDeadlineInfo = (item) => {
        const deadline = deadlineStatus.find(d => 
            d.items.some(i => i.tech_eval_id === item.id)
        );
        
        if (!deadline) return null;
        
        const itemDeadline = deadline.items.find(i => i.tech_eval_id === item.id);
        if (!itemDeadline) return null;
        
        return {
            deadline_end: deadline.deadline_end,
            has_expired: deadline.has_expired,
            grievance_submitted: itemDeadline.grievance_submitted
        };
    };

    // Format deadline time remaining
    const getTimeRemaining = (deadlineEnd) => {
        const now = new Date();
        const deadline = new Date(deadlineEnd);
        const diff = deadline.getTime() - now.getTime();
        
        if (diff <= 0) return 'Expired';
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} day${days > 1 ? 's' : ''} remaining`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        } else {
            return `${minutes}m remaining`;
        }
    };

    const handleApplyGrievance = (item) => {
        const deadlineInfo = getDeadlineInfo(item);
        
        if (!canApplyGrievance(item)) {
            if (deadlineInfo?.has_expired) {
                toast.error('The grievance application deadline has expired for this item.');
            } else if (deadlineInfo?.grievance_submitted) {
                toast.error('You have already submitted a grievance for this item.');
            } else {
                toast.error('Grievance application is not available for this item.');
            }
            return;
        }
        
        setSelectedItem(item);
        setShowGrievanceForm(true);
        setGrievanceForm({
            grievanceReason: '',
            supportingDocuments: '',
            requestedAction: '',
            additionalComments: ''
        });
    };

    const handleSubmitGrievance = async (e) => {
        e.preventDefault();
        
        if (!grievanceForm.grievanceReason.trim() || !grievanceForm.requestedAction.trim()) {
            toast.error('Please fill in all required fields');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('http://localhost:5000/api/grievances/supplier/submit', {
                technicalEvaluationId: selectedItem.id,
                ...grievanceForm
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            toast.success('Grievance application submitted successfully');
            setShowGrievanceForm(false);
            setSelectedItem(null);
            fetchRejectedItems();
            setActiveTab('my-grievances');
            fetchMyGrievances();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit grievance');
            console.error('Error submitting grievance:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending Review' },
            under_review: { color: 'bg-blue-100 text-blue-800', text: 'Under Review' },
            meeting_scheduled: { color: 'bg-purple-100 text-purple-800', text: 'Meeting Scheduled' },
            resolved: { color: 'bg-green-100 text-green-800', text: 'Resolved' },
            rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected' }
        };
        
        const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', text: status };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                {config.text}
            </span>
        );
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderMeetingDetails = (grievance) => {
        if (grievance.status !== 'meeting_scheduled' || !grievance.meeting_details) {
            return null;
        }

        try {
            const meetingInfo = JSON.parse(grievance.meeting_details);
            return (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <h6 className="text-sm font-medium text-yellow-800 mb-3 flex items-center">
                        <i className="fas fa-calendar-alt mr-2"></i> 
                        Meeting Details
                    </h6>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <span className="font-medium text-yellow-800">Date:</span>
                            <span className="text-yellow-700 ml-1">{meetingInfo.date}</span>
                        </div>
                        <div>
                            <span className="font-medium text-yellow-800">Time:</span>
                            <span className="text-yellow-700 ml-1">{meetingInfo.time}</span>
                        </div>
                        <div>
                            <span className="font-medium text-yellow-800">Location:</span>
                            <span className="text-yellow-700 ml-1">{meetingInfo.location}</span>
                        </div>
                    </div>
                    {meetingInfo.details && (
                        <div className="mt-3 pt-3 border-t border-yellow-200">
                            <span className="font-medium text-yellow-800">Additional Details:</span>
                            <p className="text-yellow-700 mt-1">{meetingInfo.details}</p>
                        </div>
                    )}
                </div>
            );
        } catch (error) {
            return null;
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                    <i className="fas fa-balance-scale mr-3"></i> 
                    Grievance Management
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                    Review rejected items and manage your grievance applications
                </p>
            </div>

            <div className="mb-6">
                <nav className="flex space-x-8" aria-label="Tabs">
                    <button 
                        className={`${
                            activeTab === 'rejected-items'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
                        onClick={() => setActiveTab('rejected-items')}
                    >
                        <i className="fas fa-exclamation-triangle mr-2"></i> 
                        Rejected Items
                    </button>
                    <button 
                        className={`${
                            activeTab === 'my-grievances'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
                        onClick={() => setActiveTab('my-grievances')}
                    >
                        <i className="fas fa-file-alt mr-2"></i> 
                        My Grievances
                    </button>
                </nav>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    <p className="ml-3 text-gray-600">Loading...</p>
                </div>
            )}

            {activeTab === 'rejected-items' && !loading && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:px-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                            Items Rejected in Technical Evaluation
                        </h3>
                    </div>
                    {rejectedItems.length === 0 ? (
                        <div className="px-4 py-12 text-center">
                            <i className="fas fa-check-circle text-4xl text-green-500 mb-4"></i>
                            <h4 className="text-lg font-medium text-gray-900 mb-2">No Rejected Items</h4>
                            <p className="text-gray-500">You don't have any rejected items at the moment.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                            {rejectedItems.map((item) => (
                                <div key={item.id} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <h4 className="text-lg font-semibold text-gray-900">{item.item_name}</h4>
                                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                                                REJECTED
                                            </span>
                                        </div>
                                        
                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between">
                                                <span className="text-sm text-gray-600">Quantity Proposed:</span>
                                                <span className="text-sm font-medium">{item.proposed_quantity}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm text-gray-600">Total Cost:</span>
                                                <span className="text-sm font-medium">Rs {item.total_cost?.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-sm text-gray-600">Delivery Days:</span>
                                                <span className="text-sm font-medium">{item.delivery_days} days</span>
                                            </div>
                                        </div>

                                        <div className="mb-4 p-3 bg-red-50 rounded-md">
                                            <h6 className="text-sm font-medium text-red-800 mb-1">Rejection Reason:</h6>
                                            <p className="text-sm text-red-700">{item.rejection_reason}</p>
                                        </div>

                                        {/* Deadline Status Display */}
                                        {(() => {
                                            const deadlineInfo = getDeadlineInfo(item);
                                            const canApply = canApplyGrievance(item);
                                            
                                            if (deadlineInfo) {
                                                if (deadlineInfo.grievance_submitted) {
                                                    return (
                                                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                                            <div className="flex items-center">
                                                                <i className="fas fa-check-circle text-blue-600 mr-2"></i>
                                                                <span className="text-sm font-medium text-blue-800">Grievance Already Submitted</span>
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (deadlineInfo.has_expired) {
                                                    return (
                                                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                                                            <div className="flex items-center">
                                                                <i className="fas fa-clock text-red-600 mr-2"></i>
                                                                <span className="text-sm font-medium text-red-800">Grievance Deadline Expired</span>
                                                            </div>
                                                            <p className="text-xs text-red-600 mt-1">
                                                                The deadline for submitting grievance has passed
                                                            </p>
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center">
                                                                    <i className="fas fa-hourglass-half text-green-600 mr-2"></i>
                                                                    <span className="text-sm font-medium text-green-800">Grievance Available</span>
                                                                </div>
                                                                <span className="text-xs text-green-600 font-medium">
                                                                    {getTimeRemaining(deadlineInfo.deadline_end)}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-green-600 mt-1">
                                                                You can submit a grievance application for this rejection
                                                            </p>
                                                        </div>
                                                    );
                                                }
                                            }
                                            return null;
                                        })()}

                                        {(() => {
                                            const deadlineInfo = getDeadlineInfo(item);
                                            const canApply = canApplyGrievance(item);
                                            
                                            if (deadlineInfo?.grievance_submitted) {
                                                return (
                                                    <button 
                                                        className="w-full bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed flex items-center justify-center"
                                                        disabled
                                                    >
                                                        <i className="fas fa-check mr-2"></i>
                                                        Grievance Submitted
                                                    </button>
                                                );
                                            } else if (deadlineInfo?.has_expired) {
                                                return (
                                                    <button 
                                                        className="w-full bg-red-400 text-white px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed flex items-center justify-center"
                                                        disabled
                                                    >
                                                        <i className="fas fa-clock mr-2"></i>
                                                        Deadline Expired
                                                    </button>
                                                );
                                            } else if (canApply) {
                                                return (
                                                    <button 
                                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center"
                                                        onClick={() => handleApplyGrievance(item)}
                                                    >
                                                        <i className="fas fa-file-signature mr-2"></i>
                                                        Apply for Grievance
                                                    </button>
                                                );
                                            } else {
                                                return (
                                                    <button 
                                                        className="w-full bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed flex items-center justify-center"
                                                        disabled
                                                    >
                                                        <i className="fas fa-ban mr-2"></i>
                                                        Grievance Not Available
                                                    </button>
                                                );
                                            }
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'my-grievances' && !loading && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:px-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                            My Grievance Applications
                        </h3>
                    </div>
                    {grievances.length === 0 ? (
                        <div className="px-4 py-12 text-center">
                            <i className="fas fa-inbox text-4xl text-gray-400 mb-4"></i>
                            <h4 className="text-lg font-medium text-gray-900 mb-2">No Grievances Submitted</h4>
                            <p className="text-gray-500">You haven't submitted any grievance applications yet.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {grievances.map((grievance) => (
                                <div key={grievance.id} className="p-6 hover:bg-gray-50">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="text-lg font-medium text-gray-900">{grievance.item_name}</h4>
                                            <p className="text-sm text-gray-500">
                                                Submitted on {formatDate(grievance.submitted_at)}
                                            </p>
                                        </div>
                                        {getStatusBadge(grievance.status)}
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-3 bg-red-50 rounded-md">
                                            <h6 className="text-sm font-medium text-red-800 mb-1">Original Rejection Reason:</h6>
                                            <p className="text-sm text-red-700">{grievance.rejection_reason}</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="p-3 bg-blue-50 rounded-md">
                                                <h6 className="text-sm font-medium text-blue-800 mb-1">Your Grievance Reason:</h6>
                                                <p className="text-sm text-blue-700">{grievance.grievance_reason}</p>
                                            </div>

                                            <div className="p-3 bg-green-50 rounded-md">
                                                <h6 className="text-sm font-medium text-green-800 mb-1">Requested Action:</h6>
                                                <p className="text-sm text-green-700">{grievance.requested_action}</p>
                                            </div>
                                        </div>

                                        {grievance.additional_comments && (
                                            <div className="p-3 bg-gray-50 rounded-md">
                                                <h6 className="text-sm font-medium text-gray-800 mb-1">Additional Comments:</h6>
                                                <p className="text-sm text-gray-700">{grievance.additional_comments}</p>
                                            </div>
                                        )}

                                        {renderMeetingDetails(grievance)}

                                        {grievance.resolution && (
                                            <div className="p-3 bg-purple-50 rounded-md">
                                                <h6 className="text-sm font-medium text-purple-800 mb-1">Committee Resolution:</h6>
                                                <p className="text-sm text-purple-700">{grievance.resolution}</p>
                                                {grievance.reviewed_by_name && (
                                                    <small className="text-purple-600">Reviewed by: {grievance.reviewed_by_name}</small>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Grievance Application Modal */}
            {showGrievanceForm && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900 flex items-center">
                                <i className="fas fa-file-signature mr-2"></i> 
                                Submit Grievance Application
                            </h3>
                            <button 
                                className="text-gray-400 hover:text-gray-600"
                                onClick={() => setShowGrievanceForm(false)}
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedItem && (
                            <div className="mb-6 p-4 bg-blue-50 rounded-md">
                                <h4 className="text-md font-medium text-blue-900">Item: {selectedItem.item_name}</h4>
                                <p className="text-sm text-blue-700 mt-1">
                                    <strong>Rejection Reason:</strong> {selectedItem.rejection_reason}
                                </p>
                            </div>
                        )}

                        <form onSubmit={handleSubmitGrievance} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Grievance Reason <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={grievanceForm.grievanceReason}
                                    onChange={(e) => setGrievanceForm({
                                        ...grievanceForm,
                                        grievanceReason: e.target.value
                                    })}
                                    placeholder="Explain why you believe the rejection was unfair or incorrect..."
                                    rows="4"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Supporting Documents/Evidence
                                </label>
                                <textarea
                                    value={grievanceForm.supportingDocuments}
                                    onChange={(e) => setGrievanceForm({
                                        ...grievanceForm,
                                        supportingDocuments: e.target.value
                                    })}
                                    placeholder="List any supporting documents or evidence you have..."
                                    rows="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Requested Action <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={grievanceForm.requestedAction}
                                    onChange={(e) => setGrievanceForm({
                                        ...grievanceForm,
                                        requestedAction: e.target.value
                                    })}
                                    placeholder="What action would you like the committee to take?"
                                    rows="3"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Additional Comments
                                </label>
                                <textarea
                                    value={grievanceForm.additionalComments}
                                    onChange={(e) => setGrievanceForm({
                                        ...grievanceForm,
                                        additionalComments: e.target.value
                                    })}
                                    placeholder="Any additional information you'd like to provide..."
                                    rows="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-4">
                                <button 
                                    type="button" 
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                    onClick={() => setShowGrievanceForm(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                                    disabled={loading}
                                >
                                    {loading ? 'Submitting...' : 'Submit Grievance'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrievanceManagement;