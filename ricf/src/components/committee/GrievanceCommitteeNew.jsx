import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Eye, CheckCircle, XCircle, AlertCircle, FileText, User, Mail, Phone } from 'lucide-react';

const GrievanceCommitteeNew = () => {
    const [grievances, setGrievances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGrievance, setSelectedGrievance] = useState(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showMeetingDetails, setShowMeetingDetails] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [meetingForm, setMeetingForm] = useState({
        date: '',
        time: '',
        location: '',
        details: ''
    });

    useEffect(() => {
        fetchGrievances();
    }, []);

    const fetchGrievances = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/grievances/committee/all', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                setGrievances(data);
            } else {
                console.error('Failed to fetch grievances');
            }
        } catch (error) {
            console.error('Error fetching grievances:', error);
        } finally {
            setLoading(false);
        }
    };

    const getGrievanceActions = (grievance) => {
        const now = new Date();
        const meetingDate = grievance.meeting_date ? new Date(grievance.meeting_date + ' ' + grievance.meeting_time) : null;
        const hasMeeting = grievance.meeting_date && grievance.meeting_time;
        const meetingPassed = meetingDate && now > meetingDate;

        if (!hasMeeting) {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'schedule', label: 'Schedule Meeting', icon: Calendar, color: 'green' }
            ];
        } else if (!meetingPassed) {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'meeting', label: 'View Meeting Details', icon: Clock, color: 'orange' }
            ];
        } else {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'approve', label: 'Approve', icon: CheckCircle, color: 'green' },
                { key: 'reject', label: 'Reject', icon: XCircle, color: 'red' }
            ];
        }
    };

    const handleAction = (grievance, action) => {
        setSelectedGrievance(grievance);
        
        switch (action) {
            case 'view':
                // Show grievance details modal or navigate to details page
                break;
            case 'schedule':
                setShowScheduleModal(true);
                break;
            case 'meeting':
                setShowMeetingDetails(true);
                break;
            case 'approve':
                handleApprove(grievance.id);
                break;
            case 'reject':
                setShowRejectModal(true);
                break;
        }
    };

    const handleScheduleMeeting = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/grievances/committee/${selectedGrievance.id}/schedule-meeting`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(meetingForm)
            });

            if (response.ok) {
                setShowScheduleModal(false);
                setMeetingForm({ date: '', time: '', location: '', details: '' });
                fetchGrievances(); // Refresh the list
                alert('Meeting scheduled successfully and notification sent to supplier!');
            } else {
                const error = await response.json();
                alert(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error scheduling meeting:', error);
            alert('Failed to schedule meeting');
        }
    };

    const handleApprove = async (grievanceId) => {
        if (!confirm('Are you sure you want to approve this grievance? The company will be added to the temporary approval pool.')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/grievances/committee/${grievanceId}/approve`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                fetchGrievances(); // Refresh the list
                alert('Grievance approved successfully! Company added to temporary approval pool and email notification sent.');
            } else {
                const error = await response.json();
                alert(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error approving grievance:', error);
            alert('Failed to approve grievance');
        }
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            alert('Please provide a rejection reason');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/grievances/committee/${selectedGrievance.id}/reject`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rejectionReason })
            });

            if (response.ok) {
                setShowRejectModal(false);
                setRejectionReason('');
                fetchGrievances(); // Refresh the list
                alert('Grievance rejected successfully and email notification sent to supplier!');
            } else {
                const error = await response.json();
                alert(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error rejecting grievance:', error);
            alert('Failed to reject grievance');
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            pending: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
            under_review: { color: 'bg-blue-100 text-blue-800', icon: Clock },
            meeting_scheduled: { color: 'bg-purple-100 text-purple-800', icon: Calendar },
            resolved: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
            rejected: { color: 'bg-red-100 text-red-800', icon: XCircle }
        };

        const config = statusConfig[status] || statusConfig.pending;
        const Icon = config.icon;

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                <Icon className="w-3 h-3 mr-1" />
                {status.replace('_', ' ').toUpperCase()}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Grievance Committee Dashboard</h1>
                    <p className="mt-2 text-gray-600">Review and manage supplier grievance applications</p>
                </div>

                {grievances.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-8 text-center">
                        <FileText className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No grievances</h3>
                        <p className="mt-1 text-sm text-gray-500">No grievance applications to review at this time.</p>
                    </div>
                ) : (
                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <ul className="divide-y divide-gray-200">
                            {grievances.map((grievance) => {
                                const actions = getGrievanceActions(grievance);
                                
                                return (
                                    <li key={grievance.id} className="px-6 py-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <h3 className="text-lg font-medium text-gray-900 truncate">
                                                            {grievance.company_name}
                                                        </h3>
                                                        <div className="mt-1 flex items-center text-sm text-gray-500">
                                                            <FileText className="flex-shrink-0 mr-1.5 h-4 w-4" />
                                                            <span className="truncate">{grievance.item_name}</span>
                                                        </div>
                                                        <div className="mt-1 flex items-center text-sm text-gray-500">
                                                            <User className="flex-shrink-0 mr-1.5 h-4 w-4" />
                                                            <span className="truncate">{grievance.contact_person}</span>
                                                        </div>
                                                        {grievance.meeting_date && (
                                                            <div className="mt-1 flex items-center text-sm text-gray-500">
                                                                <Calendar className="flex-shrink-0 mr-1.5 h-4 w-4" />
                                                                <span>Meeting: {grievance.meeting_date} at {grievance.meeting_time}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end space-y-2">
                                                        {getStatusBadge(grievance.status)}
                                                        <p className="text-sm text-gray-500">
                                                            {new Date(grievance.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {actions.map((action) => {
                                                        const Icon = action.icon;
                                                        const colorClasses = {
                                                            blue: 'bg-blue-600 hover:bg-blue-700 text-white',
                                                            green: 'bg-green-600 hover:bg-green-700 text-white',
                                                            orange: 'bg-orange-600 hover:bg-orange-700 text-white',
                                                            red: 'bg-red-600 hover:bg-red-700 text-white'
                                                        };
                                                        
                                                        return (
                                                            <button
                                                                key={action.key}
                                                                onClick={() => handleAction(grievance, action.key)}
                                                                className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md transition-colors duration-200 ${colorClasses[action.color]}`}
                                                            >
                                                                <Icon className="w-4 h-4 mr-1.5" />
                                                                {action.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {/* Schedule Meeting Modal */}
            {showScheduleModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Schedule Meeting</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Date</label>
                                <input
                                    type="date"
                                    value={meetingForm.date}
                                    onChange={(e) => setMeetingForm({...meetingForm, date: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Time</label>
                                <input
                                    type="time"
                                    value={meetingForm.time}
                                    onChange={(e) => setMeetingForm({...meetingForm, time: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Location</label>
                                <input
                                    type="text"
                                    value={meetingForm.location}
                                    onChange={(e) => setMeetingForm({...meetingForm, location: e.target.value})}
                                    placeholder="Meeting room, address, or online link"
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Additional Details</label>
                                <textarea
                                    value={meetingForm.details}
                                    onChange={(e) => setMeetingForm({...meetingForm, details: e.target.value})}
                                    placeholder="Any additional instructions or requirements..."
                                    rows={3}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2 mt-6">
                            <button
                                onClick={() => setShowScheduleModal(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleScheduleMeeting}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                Schedule Meeting
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Meeting Details Modal */}
            {showMeetingDetails && selectedGrievance && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Meeting Details</h3>
                        <div className="space-y-3">
                            <div className="flex items-center">
                                <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                                <span className="font-medium">Date:</span>
                                <span className="ml-2">{selectedGrievance.meeting_date}</span>
                            </div>
                            <div className="flex items-center">
                                <Clock className="w-5 h-5 mr-2 text-gray-500" />
                                <span className="font-medium">Time:</span>
                                <span className="ml-2">{selectedGrievance.meeting_time}</span>
                            </div>
                            <div className="flex items-center">
                                <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                                <span className="font-medium">Location:</span>
                                <span className="ml-2">{selectedGrievance.meeting_location}</span>
                            </div>
                            {selectedGrievance.meeting_details && (
                                <div className="mt-4">
                                    <span className="font-medium">Additional Details:</span>
                                    <p className="mt-1 text-gray-600">{selectedGrievance.meeting_details}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setShowMeetingDetails(false)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Grievance</h3>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Reason for Rejection *
                            </label>
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Please provide a detailed reason for rejecting this grievance..."
                                rows={4}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                required
                            />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                            >
                                Reject Grievance
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrievanceCommitteeNew;