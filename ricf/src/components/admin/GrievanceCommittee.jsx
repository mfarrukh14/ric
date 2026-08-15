import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { apiUrl } from '../../config/api';

const GrievanceCommittee = () => {
    const [grievances, setGrievances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedGrievance, setSelectedGrievance] = useState(null);
    const [showMeetingModal, setShowMeetingModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [meetingForm, setMeetingForm] = useState({
        date: '',
        time: '',
        location: '',
        details: ''
    });
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchGrievances();
    }, []);

    const fetchGrievances = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${apiUrl}/grievances/committee/all`, {
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

    const handleScheduleMeeting = (grievance) => {
        setSelectedGrievance(grievance);
        setShowMeetingModal(true);
        
        // Set default date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        setMeetingForm({
            date: tomorrow.toISOString().split('T')[0],
            time: '10:00',
            location: 'Committee Room A',
            details: ''
        });
    };

    const handleSubmitMeeting = async (e) => {
        e.preventDefault();
        
        if (!meetingForm.date || !meetingForm.time || !meetingForm.location) {
            toast.error('Please fill in all required meeting details');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${apiUrl}/grievances/committee/${selectedGrievance.id}/schedule-meeting`,
                meetingForm,
                { headers: { Authorization: `Bearer ${token}` }}
            );
            
            toast.success('Meeting scheduled successfully and notification sent to supplier');
            setShowMeetingModal(false);
            setSelectedGrievance(null);
            fetchGrievances();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to schedule meeting');
            console.error('Error scheduling meeting:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (grievanceId, newStatus, resolution = '') => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.patch(
                `${apiUrl}/grievances/committee/${grievanceId}/status`,
                { status: newStatus, resolution },
                { headers: { Authorization: `Bearer ${token}` }}
            );
            
            toast.success('Grievance status updated successfully');
            fetchGrievances();
        } catch (error) {
            toast.error('Failed to update grievance status');
            console.error('Error updating status:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending Review', icon: 'clock' },
            under_review: { color: 'bg-blue-100 text-blue-800', text: 'Under Review', icon: 'eye' },
            meeting_scheduled: { color: 'bg-indigo-100 text-indigo-800', text: 'Meeting Scheduled', icon: 'calendar' },
            resolved: { color: 'bg-green-100 text-green-800', text: 'Resolved', icon: 'check' },
            rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected', icon: 'times' }
        };
        
        const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', text: status, icon: 'question' };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                <i className={`fas fa-${config.icon} mr-1`}></i>
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

    const getPriorityLevel = (daysOld) => {
        if (daysOld > 7) return 'high';
        if (daysOld > 3) return 'medium';
        return 'low';
    };

    const getDaysOld = (dateString) => {
        const submissionDate = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - submissionDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const filteredGrievances = grievances.filter(grievance => {
        if (filterStatus === 'all') return true;
        return grievance.status === filterStatus;
    });

    const renderMeetingDetails = (grievance) => {
        if (grievance.status !== 'meeting_scheduled' || !grievance.meeting_details) {
            return null;
        }

        try {
            const meetingInfo = JSON.parse(grievance.meeting_details);
            return (
                <div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400 mt-3">
                    <h6 className="font-medium text-blue-800 mb-2">
                        <i className="fas fa-calendar-alt mr-2"></i>
                        Scheduled Meeting
                    </h6>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <span className="text-gray-700">
                            <strong>Date:</strong> {meetingInfo.date}
                        </span>
                        <span className="text-gray-700">
                            <strong>Time:</strong> {meetingInfo.time}
                        </span>
                        <span className="text-gray-700">
                            <strong>Location:</strong> {meetingInfo.location}
                        </span>
                    </div>
                </div>
            );
        } catch (error) {
            return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                {/* Page Header */}
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 flex items-center">
                        <i className="fas fa-gavel mr-3 text-amber-600"></i>
                        Grievance Committee Dashboard
                    </h2>
                    <p className="mt-2 text-gray-600">Review and manage supplier grievance applications</p>
                </div>

                {/* Dashboard Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-clock text-yellow-600 text-xl"></i>
                                </div>
                            </div>
                            <div className="ml-4">
                                <div className="text-2xl font-bold text-gray-900">
                                    {grievances.filter(g => g.status === 'pending').length}
                                </div>
                                <div className="text-sm text-gray-600">Pending Review</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-eye text-blue-600 text-xl"></i>
                                </div>
                            </div>
                            <div className="ml-4">
                                <div className="text-2xl font-bold text-gray-900">
                                    {grievances.filter(g => g.status === 'under_review').length}
                                </div>
                                <div className="text-sm text-gray-600">Under Review</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-calendar text-indigo-600 text-xl"></i>
                                </div>
                            </div>
                            <div className="ml-4">
                                <div className="text-2xl font-bold text-gray-900">
                                    {grievances.filter(g => g.status === 'meeting_scheduled').length}
                                </div>
                                <div className="text-sm text-gray-600">Meetings Scheduled</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-check text-green-600 text-xl"></i>
                                </div>
                            </div>
                            <div className="ml-4">
                                <div className="text-2xl font-bold text-gray-900">
                                    {grievances.filter(g => g.status === 'resolved').length}
                                </div>
                                <div className="text-sm text-gray-600">Resolved</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <div className="flex items-center space-x-4">
                        <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
                        <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        >
                            <option value="all">All Grievances</option>
                            <option value="pending">Pending Review</option>
                            <option value="under_review">Under Review</option>
                            <option value="meeting_scheduled">Meeting Scheduled</option>
                            <option value="resolved">Resolved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                        <p className="text-gray-600">Loading grievances...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && filteredGrievances.length === 0 && (
                    <div className="text-center py-12">
                        <i className="fas fa-inbox text-gray-400 text-6xl mb-4"></i>
                        <h4 className="text-xl font-medium text-gray-900 mb-2">No Grievances Found</h4>
                        <p className="text-gray-600">There are no grievances matching your current filter.</p>
                    </div>
                )}

                {/* Grievances Grid */}
                {!loading && filteredGrievances.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredGrievances.map((grievance) => {
                            const daysOld = getDaysOld(grievance.submitted_at);
                            const priority = getPriorityLevel(daysOld);
                            
                            return (
                                <div key={grievance.id} className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 border-l-4 ${
                                    priority === 'high' ? 'border-red-500' :
                                    priority === 'medium' ? 'border-yellow-500' : 'border-green-500'
                                }`}>
                                    {/* Card Header */}
                                    <div className="p-6 border-b border-gray-200">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex-1">
                                                <h4 className="text-lg font-semibold text-gray-900">{grievance.company_name}</h4>
                                                <p className="text-indigo-600 font-medium">{grievance.item_name}</p>
                                                <small className="text-gray-500">
                                                    Submitted {daysOld} day{daysOld !== 1 ? 's' : ''} ago
                                                </small>
                                            </div>
                                            <div className="flex flex-col items-end space-y-2">
                                                {getStatusBadge(grievance.status)}
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    priority === 'high' ? 'bg-red-100 text-red-800' :
                                                    priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-green-100 text-green-800'
                                                }`}>
                                                    {priority.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Content */}
                                    <div className="p-6">
                                        <div className="mb-4">
                                            <h6 className="font-medium text-gray-900 mb-2">Original Rejection:</h6>
                                            <p className="text-sm text-gray-600">{grievance.rejection_reason}</p>
                                        </div>

                                        <div className="mb-4">
                                            <h6 className="font-medium text-gray-900 mb-2">Grievance Reason:</h6>
                                            <p className="text-sm text-gray-600">
                                                {grievance.grievance_reason.length > 150 
                                                    ? `${grievance.grievance_reason.substring(0, 150)}...`
                                                    : grievance.grievance_reason
                                                }
                                            </p>
                                        </div>

                                        {renderMeetingDetails(grievance)}

                                        {/* Card Actions */}
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            <button 
                                                className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                                onClick={() => {
                                                    setSelectedGrievance(grievance);
                                                    setShowDetailsModal(true);
                                                }}
                                            >
                                                <i className="fas fa-eye mr-2"></i>
                                                View Details
                                            </button>

                                            {grievance.status === 'pending' && (
                                                <button 
                                                    className="flex items-center px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                                                    onClick={() => handleUpdateStatus(grievance.id, 'under_review')}
                                                >
                                                    <i className="fas fa-eye mr-2"></i>
                                                    Start Review
                                                </button>
                                            )}

                                            {(grievance.status === 'pending' || grievance.status === 'under_review') && (
                                                <button 
                                                    className="flex items-center px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                                    onClick={() => handleScheduleMeeting(grievance)}
                                                >
                                                    <i className="fas fa-calendar-plus mr-2"></i>
                                                    Schedule Meeting
                                                </button>
                                            )}

                                            {grievance.status === 'meeting_scheduled' && (
                                                <button 
                                                    className="flex items-center px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                                                    onClick={() => handleUpdateStatus(grievance.id, 'resolved', 'Meeting completed and grievance resolved.')}
                                                >
                                                    <i className="fas fa-check mr-2"></i>
                                                    Mark Resolved
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Meeting Scheduling Modal */}
                {showMeetingModal && selectedGrievance && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-200">
                                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                                    <i className="fas fa-calendar-plus mr-2 text-indigo-600"></i>
                                    Schedule Grievance Meeting
                                </h3>
                                <button 
                                    className="text-gray-400 hover:text-gray-600"
                                    onClick={() => setShowMeetingModal(false)}
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            {/* Grievance Summary */}
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                <h4 className="font-medium text-gray-900">{selectedGrievance.company_name}</h4>
                                <p className="text-sm text-gray-600"><strong>Item:</strong> {selectedGrievance.item_name}</p>
                                <p className="text-sm text-gray-600"><strong>Contact:</strong> {selectedGrievance.email}</p>
                            </div>

                            {/* Meeting Form */}
                            <form onSubmit={handleSubmitMeeting} className="p-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Meeting Date <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={meetingForm.date}
                                            onChange={(e) => setMeetingForm({
                                                ...meetingForm,
                                                date: e.target.value
                                            })}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Meeting Time <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="time"
                                            value={meetingForm.time}
                                            onChange={(e) => setMeetingForm({
                                                ...meetingForm,
                                                time: e.target.value
                                            })}
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Meeting Location <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={meetingForm.location}
                                            onChange={(e) => setMeetingForm({
                                                ...meetingForm,
                                                location: e.target.value
                                            })}
                                            placeholder="e.g., Committee Room A, Building 1"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Additional Details
                                        </label>
                                        <textarea
                                            value={meetingForm.details}
                                            onChange={(e) => setMeetingForm({
                                                ...meetingForm,
                                                details: e.target.value
                                            })}
                                            placeholder="Any additional information for the supplier..."
                                            rows="3"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end space-x-3 mt-6">
                                    <button 
                                        type="button" 
                                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                                        onClick={() => setShowMeetingModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                        disabled={loading}
                                    >
                                        {loading ? 'Scheduling...' : 'Schedule Meeting & Send Invite'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Grievance Details Modal */}
                {showDetailsModal && selectedGrievance && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-200">
                                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                                    <i className="fas fa-file-alt mr-2 text-indigo-600"></i>
                                    Grievance Details
                                </h3>
                                <button 
                                    className="text-gray-400 hover:text-gray-600"
                                    onClick={() => setShowDetailsModal(false)}
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            {/* Details Content */}
                            <div className="p-6">
                                {/* Company Info */}
                                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                    <h4 className="text-xl font-semibold text-gray-900 mb-2">{selectedGrievance.company_name}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <p><strong>Email:</strong> {selectedGrievance.email}</p>
                                        <p><strong>Item:</strong> {selectedGrievance.item_name}</p>
                                        <p><strong>Submitted:</strong> {formatDate(selectedGrievance.submitted_at)}</p>
                                        <div>{getStatusBadge(selectedGrievance.status)}</div>
                                    </div>
                                </div>

                                {/* Original Rejection */}
                                <div className="mb-6">
                                    <h5 className="text-lg font-medium text-gray-900 mb-2">Original Rejection Reason</h5>
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                        <p className="text-gray-700">{selectedGrievance.rejection_reason}</p>
                                    </div>
                                </div>

                                {/* Grievance Details */}
                                <div className="mb-6">
                                    <h5 className="text-lg font-medium text-gray-900 mb-4">Supplier's Grievance</h5>
                                    <div className="space-y-4">
                                        <div>
                                            <h6 className="font-medium text-gray-900 mb-2">Grievance Reason:</h6>
                                            <div className="bg-gray-50 rounded-lg p-4">
                                                <p className="text-gray-700">{selectedGrievance.grievance_reason}</p>
                                            </div>
                                        </div>

                                        <div>
                                            <h6 className="font-medium text-gray-900 mb-2">Requested Action:</h6>
                                            <div className="bg-gray-50 rounded-lg p-4">
                                                <p className="text-gray-700">{selectedGrievance.requested_action}</p>
                                            </div>
                                        </div>

                                        {selectedGrievance.supporting_documents && (
                                            <div>
                                                <h6 className="font-medium text-gray-900 mb-2">Supporting Documents:</h6>
                                                <div className="bg-gray-50 rounded-lg p-4">
                                                    <p className="text-gray-700">{selectedGrievance.supporting_documents}</p>
                                                </div>
                                            </div>
                                        )}

                                        {selectedGrievance.additional_comments && (
                                            <div>
                                                <h6 className="font-medium text-gray-900 mb-2">Additional Comments:</h6>
                                                <div className="bg-gray-50 rounded-lg p-4">
                                                    <p className="text-gray-700">{selectedGrievance.additional_comments}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Meeting Details */}
                                {selectedGrievance.meeting_details && (
                                    <div className="mb-6">
                                        <h5 className="text-lg font-medium text-gray-900 mb-2">Meeting Information</h5>
                                        {(() => {
                                            try {
                                                const meetingInfo = JSON.parse(selectedGrievance.meeting_details);
                                                return (
                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <p className="text-gray-700"><strong>Date:</strong> {meetingInfo.date}</p>
                                                            <p className="text-gray-700"><strong>Time:</strong> {meetingInfo.time}</p>
                                                            <p className="text-gray-700"><strong>Location:</strong> {meetingInfo.location}</p>
                                                        </div>
                                                        {meetingInfo.details && (
                                                            <div className="mt-3 pt-3 border-t border-blue-200">
                                                                <p className="text-gray-700"><strong>Additional Details:</strong></p>
                                                                <p className="text-gray-700 mt-1">{meetingInfo.details}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } catch (error) {
                                                return <p className="text-gray-500">Meeting details unavailable</p>;
                                            }
                                        })()}
                                    </div>
                                )}

                                {/* Resolution */}
                                {selectedGrievance.resolution && (
                                    <div className="mb-6">
                                        <h5 className="text-lg font-medium text-gray-900 mb-2">Resolution</h5>
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                            <p className="text-gray-700 mb-2">{selectedGrievance.resolution}</p>
                                            {selectedGrievance.reviewed_by_name && (
                                                <small className="text-gray-600">Resolved by: {selectedGrievance.reviewed_by_name}</small>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Actions */}
                            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                                {selectedGrievance.status === 'pending' && (
                                    <button 
                                        className="flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                                        onClick={() => {
                                            handleUpdateStatus(selectedGrievance.id, 'under_review');
                                            setShowDetailsModal(false);
                                        }}
                                    >
                                        <i className="fas fa-eye mr-2"></i>
                                        Start Review
                                    </button>
                                )}

                                {(selectedGrievance.status === 'pending' || selectedGrievance.status === 'under_review') && (
                                    <button 
                                        className="flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                        onClick={() => {
                                            setShowDetailsModal(false);
                                            handleScheduleMeeting(selectedGrievance);
                                        }}
                                    >
                                        <i className="fas fa-calendar-plus mr-2"></i>
                                        Schedule Meeting
                                    </button>
                                )}

                                <button 
                                    className="flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                                    onClick={() => {
                                        handleUpdateStatus(selectedGrievance.id, 'rejected', 'Grievance reviewed and rejected by committee.');
                                        setShowDetailsModal(false);
                                    }}
                                >
                                    <i className="fas fa-times mr-2"></i>
                                    Reject Grievance
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GrievanceCommittee;