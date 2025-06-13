import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Eye, CheckCircle, XCircle, AlertCircle, FileText, User, Mail, Phone } from 'lucide-react';

const GrievanceCommitteeNew = () => {
    const [grievances, setGrievances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGrievance, setSelectedGrievance] = useState(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showMeetingDetails, setShowMeetingDetails] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isScheduling, setIsScheduling] = useState(false); // Add loading state for scheduling
    const [isApproving, setIsApproving] = useState(false); // Add loading state for approving
    const [isRejecting, setIsRejecting] = useState(false); // Add loading state for rejecting
    const [meetingForm, setMeetingForm] = useState({
        date: '',
        time: '',
        location: '',
        details: ''
    });    useEffect(() => {
        fetchGrievances();
    }, []);

    // Helper function to parse meeting details from database format
    const parseMeetingDetails = (grievance) => {
        if (!grievance.meeting_details || !grievance.meeting_scheduled_date) {
            return null;
        }
        
        try {
            const meetingInfo = JSON.parse(grievance.meeting_details);
            return {
                date: meetingInfo.date,
                time: meetingInfo.time,
                location: meetingInfo.location,
                details: meetingInfo.details,
                datetime: grievance.meeting_scheduled_date
            };
        } catch (error) {
            console.error('Error parsing meeting details:', error);
            return null;
        }
    };const fetchGrievances = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:5000/api/grievances/committee/all', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Grievance data received:', data); // Log data to see what fields are available
                setGrievances(data);
            } else {
                console.error('Failed to fetch grievances');
            }        } catch (error) {
            console.error('Error fetching grievances:', error);
        } finally {
            setLoading(false);
        }
    };

    const getGrievanceActions = (grievance) => {        // Get current time in Pakistan timezone (UTC+5)
        const now = new Date();
        // Pakistan is UTC+5, calculate from UTC properly
        const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
        const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));
        
        // Parse meeting data from database format
        const hasMeeting = grievance.meeting_scheduled_date && grievance.meeting_scheduled_date !== 'undefined undefined';
        let meetingPassed = false;
        
        if (hasMeeting) {
            // Parse the meeting date/time from the stored format
            const meetingDateTime = new Date(grievance.meeting_scheduled_date);
            meetingPassed = pakistanTime > meetingDateTime;
        }

        // Check if decision is already made (irreversible)
        if (grievance.status === 'resolved' || grievance.status === 'rejected') {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' }
            ];
        }

        if (!hasMeeting) {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'schedule', label: 'Schedule Meeting', icon: Calendar, color: 'green' }
            ];
        } else if (!meetingPassed) {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'meeting', label: 'View Meeting Details', icon: Clock, color: 'orange' },
                { key: 'reschedule', label: 'Reschedule Meeting', icon: Calendar, color: 'blue' }
            ];
        } else {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'approve', label: 'Approve Grievance', icon: CheckCircle, color: 'green' },
                { key: 'reject', label: 'Reject Grievance', icon: XCircle, color: 'red' }
            ];
        }
    };

    const handleAction = (grievance, action) => {
        console.log('Selected grievance data:', grievance); // Add detailed logging
        setSelectedGrievance(grievance);
          switch (action) {
            case 'view':
                setShowDetailsModal(true);
                break;
            case 'schedule':
                setMeetingForm({ date: '', time: '', location: '', details: '' });
                setShowScheduleModal(true);
                break;
            case 'reschedule':
                // Pre-populate form with existing meeting details
                const meeting = parseMeetingDetails(grievance);
                if (meeting) {
                    setMeetingForm({
                        date: meeting.date,
                        time: meeting.time,
                        location: meeting.location,
                        details: meeting.details
                    });
                }
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
        // Validate all required fields
        if (!meetingForm.date || !meetingForm.time || !meetingForm.location || !meetingForm.details) {
            alert('Please fill in all required fields');
            return;
        }

        // Additional validation for location and details to ensure they're not just whitespace
        if (!meetingForm.location.trim() || !meetingForm.details.trim()) {
            alert('Please provide valid location and meeting details');
            return;
        }

        setIsScheduling(true); // Start scheduling

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:5000/api/grievances/committee/${selectedGrievance.id}/schedule-meeting`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',                },
                body: JSON.stringify({
                    meetingDate: meetingForm.date,
                    meetingTime: meetingForm.time,
                    meetingLocation: meetingForm.location,
                    meetingDetails: meetingForm.details
                })
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
        } finally {
            setIsScheduling(false); // End scheduling
        }
    };

    // Check if all meeting form fields are filled
    const isScheduleFormValid = () => {
        return meetingForm.date && 
               meetingForm.time && 
               meetingForm.location.trim() && 
               meetingForm.details.trim();
    };
    const handleApprove = async (grievanceId) => {
        if (!confirm('Are you sure you want to approve this grievance? This decision is irreversible and the company will be added to the temporary approval pool.')) {
            return;
        }

        setIsApproving(true); // Start approving

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:5000/api/grievances/committee/${grievanceId}/approve`, {
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
        } finally {
            setIsApproving(false); // End approving
        }
    };    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            alert('Please provide a rejection reason');
            return;
        }

        if (!confirm('Are you sure you want to reject this grievance? This decision is irreversible.')) {
            return;
        }

        setIsRejecting(true); // Start rejecting

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:5000/api/grievances/committee/${selectedGrievance.id}/reject`, {
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
        } finally {
            setIsRejecting(false); // End rejecting
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
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">                <div className="mb-8">
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
                                                            <span className="truncate">{grievance.contact_person}</span>                                                        </div>
                                                        {(() => {
                                                            const meeting = parseMeetingDetails(grievance);
                                                            return meeting && (
                                                                <div className="mt-1 flex items-center text-sm text-gray-500">
                                                                    <Calendar className="flex-shrink-0 mr-1.5 h-4 w-4" />
                                                                    <span>Meeting: {meeting.date} at {meeting.time}</span>
                                                                </div>
                                                            );
                                                        })()}
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

                                                        // Check if this action should be disabled due to loading state
                                                        const isActionDisabled = (action.key === 'approve' && isApproving) || 
                                                                                (action.key === 'reject' && isRejecting);

                                                        // Get the button text based on loading state
                                                        const getButtonText = () => {
                                                            if (action.key === 'approve' && isApproving) return 'Approving...';
                                                            if (action.key === 'reject' && isRejecting) return 'Rejecting...';
                                                            return action.label;
                                                        };

                                                        // Apply disabled styles when processing
                                                        const buttonClasses = isActionDisabled 
                                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                                            : colorClasses[action.color];
                                                        
                                                        return (
                                                            <button
                                                                key={action.key}
                                                                onClick={() => handleAction(grievance, action.key)}
                                                                disabled={isActionDisabled}
                                                                className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md transition-colors duration-200 ${buttonClasses}`}
                                                            >
                                                                <Icon className="w-4 h-4 mr-1.5" />
                                                                {getButtonText()}
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
                                <label className="block text-sm font-medium text-gray-700">Date *</label>
                                <input
                                    type="date"
                                    value={meetingForm.date}
                                    onChange={(e) => setMeetingForm({...meetingForm, date: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                    min={new Date().toISOString().split('T')[0]}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Time *</label>
                                <input
                                    type="time"
                                    value={meetingForm.time}
                                    onChange={(e) => setMeetingForm({...meetingForm, time: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Location *</label>
                                <input
                                    type="text"
                                    value={meetingForm.location}
                                    onChange={(e) => setMeetingForm({...meetingForm, location: e.target.value})}
                                    placeholder="Meeting room, address, or online link"
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Additional Details *</label>
                                <textarea
                                    value={meetingForm.details}
                                    onChange={(e) => setMeetingForm({...meetingForm, details: e.target.value})}
                                    placeholder="Any additional instructions or requirements..."
                                    rows={3}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                    required
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
                                disabled={!isScheduleFormValid()}
                                className={`px-4 py-2 rounded-md transition-colors ${
                                    isScheduleFormValid() 
                                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                {isScheduling ? 'Scheduling...' : 'Schedule Meeting'}
                            </button>
                        </div>
                    </div>
                </div>
            )}            {/* Meeting Details Modal */}
            {showMeetingDetails && selectedGrievance && (() => {
                const meeting = parseMeetingDetails(selectedGrievance);
                return meeting && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Meeting Details</h3>
                            <div className="space-y-3">
                                <div className="flex items-center">
                                    <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                                    <span className="font-medium">Date:</span>
                                    <span className="ml-2">{meeting.date}</span>
                                </div>
                                <div className="flex items-center">
                                    <Clock className="w-5 h-5 mr-2 text-gray-500" />
                                    <span className="font-medium">Time:</span>
                                    <span className="ml-2">{meeting.time}</span>
                                </div>
                                <div className="flex items-center">
                                    <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                                    <span className="font-medium">Location:</span>
                                    <span className="ml-2">{meeting.location}</span>
                                </div>
                                {meeting.details && (
                                    <div className="mt-4">
                                        <span className="font-medium">Additional Details:</span>
                                        <p className="mt-1 text-gray-600">{meeting.details}</p>
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
                );            })()}

            {/* Grievance Details Modal */}
            {showDetailsModal && selectedGrievance && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Grievance Details</h3>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Company Information */}
                            <div className="space-y-4">
                                <h4 className="text-md font-semibold text-gray-800 border-b pb-2">Company Information</h4>
                                
                                {/* Notice about missing data - only show if some fields are missing */}
                                {(!selectedGrievance.contact_person || !selectedGrievance.contact_number) && (
                                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md mb-2">
                                        <p className="text-sm text-yellow-700">
                                            <span className="font-medium">Note:</span> Some supplier details are missing. These fields may not have been provided during supplier registration.
                                        </p>
                                    </div>
                                )}
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Company Name:</label>
                                        <p className="text-gray-900">{selectedGrievance.company_name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Contact Person:</label>
                                        <p className="text-gray-900">{selectedGrievance.contact_person || selectedGrievance.supplier_contact_person || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Contact Email:</label>
                                        <p className="text-gray-900">{selectedGrievance.company_email || selectedGrievance.contact_email || selectedGrievance.supplier_email || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Contact Phone:</label>
                                        <p className="text-gray-900">{selectedGrievance.contact_number || selectedGrievance.contact_phone || selectedGrievance.supplier_phone || 'N/A'}</p>
                                    </div>
                                    {/* Note: company_address field doesn't exist in the database schema */}
                                </div>
                            </div>

                            {/* Grievance Information */}
                            <div className="space-y-4">
                                <h4 className="text-md font-semibold text-gray-800 border-b pb-2">Grievance Information</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Item/Service:</label>
                                        <p className="text-gray-900">{selectedGrievance.item_name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Tender Reference:</label>
                                        <p className="text-gray-900">{selectedGrievance.tender_reference || `#${selectedGrievance.tender_id}` || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Status:</label>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            selectedGrievance.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            selectedGrievance.status === 'meeting_scheduled' ? 'bg-blue-100 text-blue-800' :
                                            selectedGrievance.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                            selectedGrievance.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {selectedGrievance.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
                                        </span>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-600">Submitted:</label>
                                        <p className="text-gray-900">
                                            {selectedGrievance.created_at && isNaN(new Date(selectedGrievance.created_at).getTime()) 
                                                ? 'Date not available'
                                                : new Date(selectedGrievance.created_at).toLocaleString('en-PK', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grievance Details */}
                        <div className="mt-6">
                            <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4">Grievance Details</h4>
                            <div className="bg-gray-50 p-4 rounded-md">
                                <p className="text-gray-900 whitespace-pre-wrap">{selectedGrievance.grievance_details}</p>
                            </div>
                        </div>

                        {/* Meeting Information (if exists) */}
                        {(() => {
                            const meeting = parseMeetingDetails(selectedGrievance);
                            return meeting && (
                                <div className="mt-6">
                                    <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4">Meeting Information</h4>
                                    <div className="bg-blue-50 p-4 rounded-md space-y-2">
                                        <div className="flex items-center">
                                            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
                                            <span className="font-medium">Date:</span>
                                            <span className="ml-2">{meeting.date}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <Clock className="w-5 h-5 mr-2 text-blue-600" />
                                            <span className="font-medium">Time:</span>
                                            <span className="ml-2">{meeting.time}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                                            <span className="font-medium">Location:</span>
                                            <span className="ml-2">{meeting.location}</span>
                                        </div>
                                        {meeting.details && (
                                            <div className="mt-2">
                                                <span className="font-medium">Additional Details:</span>
                                                <p className="mt-1 text-gray-700">{meeting.details}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Rejection Reason (if rejected) */}
                        {selectedGrievance.status === 'rejected' && selectedGrievance.rejection_reason && (
                            <div className="mt-6">
                                <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4">Rejection Reason</h4>
                                <div className="bg-red-50 p-4 rounded-md">
                                    <p className="text-gray-900">{selectedGrievance.rejection_reason}</p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end mt-8">
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
                                {isRejecting ? 'Rejecting...' : 'Reject Grievance'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GrievanceCommitteeNew;