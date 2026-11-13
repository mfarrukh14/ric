import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Eye, CheckCircle, XCircle, WarningCircle as AlertCircle, FileText, User, EnvelopeSimple as Mail, Phone } from '@phosphor-icons/react';
import { apiUrl } from '../../config/api';
import { notify } from '../../lib/notify';
import { confirmDialog } from '../../lib/confirm';

import { formatClockTime, formatDate, formatDateAndTime, formatDateTime, isPast, toDate, todayInPakistan } from '../../lib/time';
import { humanize } from '../../ui/status';
const GrievanceCommitteeNew = () => {
    const [grievances, setGrievances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGrievance, setSelectedGrievance] = useState(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showBulkScheduleModal, setShowBulkScheduleModal] = useState(false);
    const [showMeetingDetails, setShowMeetingDetails] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isScheduling, setIsScheduling] = useState(false); // Add loading state for scheduling
    const [isApproving, setIsApproving] = useState(false); // Add loading state for approving
    const [isRejecting, setIsRejecting] = useState(false); // Add loading state for rejecting
    const [minutesOfMeeting, setMinutesOfMeeting] = useState(null);
    const [minutesUploaded, setMinutesUploaded] = useState(false);
    // Server-side name of the uploaded minutes, sent back with each decision so the right file is attached.
    const [minutesFile, setMinutesFile] = useState(null);
    const [isUploadingMinutes, setIsUploadingMinutes] = useState(false);
    const [meetingForm, setMeetingForm] = useState({
        date: '',
        time: '',
        location: '',
        details: '',
        grievanceLetter: null
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
            const response = await fetch(`${apiUrl}/grievances/committee/all`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                const data = await response.json();
                 // Log data to see what fields are available
                setGrievances(data);
            } else {
                console.error('Failed to fetch grievances');
            }        } catch (error) {
            console.error('Error fetching grievances:', error);
        } finally {
            setLoading(false);
        }
    };

    const getGrievanceActions = (grievance) => {
        // Old rows can hold unreadable text (e.g. "undefined undefined"); toDate treats that as no meeting.
        const hasMeeting = Boolean(toDate(grievance.meeting_scheduled_date));
        const meetingPassed = hasMeeting && isPast(grievance.meeting_scheduled_date);

        // Check if decision is already made (irreversible)
        if (grievance.status === 'resolved' || grievance.status === 'rejected') {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' }
            ];
        }

        if (!hasMeeting) {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' }
            ];
        } else if (!meetingPassed) {
            return [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' },
                { key: 'meeting', label: 'View Meeting Details', icon: Clock, color: 'orange' }
            ];
        } else {
            // Only show approve/reject if minutes of meeting are uploaded
            const actions = [
                { key: 'view', label: 'View Details', icon: Eye, color: 'blue' }
            ];
            
            if (minutesUploaded) {
                actions.push(
                    { key: 'approve', label: 'Approve Grievance', icon: CheckCircle, color: 'green' },
                    { key: 'reject', label: 'Reject Grievance', icon: XCircle, color: 'red' }
                );
            } else {
                actions.push({
                    key: 'minutes-required',
                    label: 'Upload Minutes Required',
                    icon: AlertCircle,
                    color: 'gray',
                    disabled: true
                });
            }
            
            return actions;
        }
    };

    const handleAction = (grievance, action) => {
         // Add detailed logging
        setSelectedGrievance(grievance);
          switch (action) {
            case 'view':
                setShowDetailsModal(true);
                break;
            case 'schedule':
                setMeetingForm({ date: '', time: '', location: '', details: '' });
                setShowScheduleModal(true);
                break;
            case 'reschedule': {
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
                setSelectedGrievance(grievance);
                setShowScheduleModal(true);
                break; }
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
            notify('Please fill in all required fields');
            return;
        }

        // Additional validation for location and details to ensure they're not just whitespace
        if (!meetingForm.location.trim() || !meetingForm.details.trim()) {
            notify('Please provide valid location and meeting details');
            return;
        }

        setIsScheduling(true); // Start scheduling

        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            
            formData.append('meetingDate', meetingForm.date);
            formData.append('meetingTime', meetingForm.time);
            formData.append('meetingLocation', meetingForm.location);
            formData.append('meetingDetails', meetingForm.details);
            
            if (meetingForm.grievanceLetter) {
                formData.append('grievanceLetter', meetingForm.grievanceLetter);
            }

            const response = await fetch(`${apiUrl}/grievances/committee/${selectedGrievance.id}/schedule-meeting`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData
            });

            if (response.ok) {
                setShowScheduleModal(false);
                setMeetingForm({ date: '', time: '', location: '', details: '', grievanceLetter: null });
                fetchGrievances(); // Refresh the list
                notify('Meeting scheduled and supplier notified');
            } else {
                const error = await response.json();
                notify(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error scheduling meeting:', error);
            notify('Failed to schedule meeting');
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

    // Handle bulk meeting scheduling for all pending grievances
    const handleBulkScheduleMeeting = async () => {
        // Validate all required fields
        if (!meetingForm.date || !meetingForm.time || !meetingForm.location || !meetingForm.details) {
            notify('Please fill in all required fields');
            return;
        }

        // Additional validation for location and details to ensure they're not just whitespace
        if (!meetingForm.location.trim() || !meetingForm.details.trim()) {
            notify('Please provide valid location and meeting details');
            return;
        }

        const pendingGrievances = grievances.filter(g => g.status === 'pending');
        
        if (pendingGrievances.length === 0) {
            notify('No pending grievances to schedule meetings for');
            return;
        }

        const confirmMessage = `Are you sure you want to schedule a meeting for all ${pendingGrievances.length} pending grievances? This will send notifications to all suppliers.`;
        if (!(await confirmDialog(confirmMessage))) {
            return;
        }

        setIsScheduling(true);

        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            
            formData.append('meetingDate', meetingForm.date);
            formData.append('meetingTime', meetingForm.time);
            formData.append('meetingLocation', meetingForm.location);
            formData.append('meetingDetails', meetingForm.details);
            
            if (meetingForm.grievanceLetter) {
                formData.append('grievanceLetter', meetingForm.grievanceLetter);
            }

            const response = await fetch(`${apiUrl}/grievances/committee/schedule-bulk-meeting`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData
            });

            if (response.ok) {
                setShowBulkScheduleModal(false);
                setMeetingForm({ date: '', time: '', location: '', details: '', grievanceLetter: null });
                fetchGrievances(); // Refresh the list
                notify(`Meeting scheduled for ${pendingGrievances.length} grievances; suppliers notified`);
            } else {
                const error = await response.json();
                notify(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error scheduling bulk meeting:', error);
            notify('Failed to schedule bulk meeting');
        } finally {
            setIsScheduling(false);
        }
    };
    const handleApprove = async (grievanceId) => {
        if (!(await confirmDialog('Are you sure you want to approve this grievance? This decision is irreversible and the company will be added to the temporary approval pool.'))) {
            return;
        }

        setIsApproving(true); // Start approving

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/grievances/committee/${grievanceId}/approve`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ minutesFile })
            });

            if (response.ok) {
                fetchGrievances(); // Refresh the list
                notify('Grievance approved; supplier added to the approval pool and notified');
            } else {
                const error = await response.json();
                notify(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error approving grievance:', error);
            notify('Failed to approve grievance');
        } finally {
            setIsApproving(false); // End approving
        }
    };    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            notify('Please provide a rejection reason');
            return;
        }

        if (!(await confirmDialog('Are you sure you want to reject this grievance? This decision is irreversible.'))) {
            return;
        }

        setIsRejecting(true); // Start rejecting

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/grievances/committee/${selectedGrievance.id}/reject`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rejectionReason, minutesFile })
            });

            if (response.ok) {
                setShowRejectModal(false);
                setRejectionReason('');
                fetchGrievances(); // Refresh the list
                notify('Grievance rejected; supplier notified');
            } else {
                const error = await response.json();
                notify(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error rejecting grievance:', error);
            notify('Failed to reject grievance');
        } finally {
            setIsRejecting(false); // End rejecting
        }
    };

    const handleMinutesUpload = async (file) => {
        if (!file) return;

        setIsUploadingMinutes(true);
        try {
            const formData = new FormData();
            formData.append('minutesOfMeeting', file);
            formData.append('uploadedBy', 'Grievance Committee'); // You can get this from user context

            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/grievances/committee/upload-minutes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                setMinutesOfMeeting(file);
                setMinutesFile(result.minutesFile || null);
                setMinutesUploaded(true);
                notify('Minutes uploaded');
            } else {
                const error = await response.json();
                notify(`Error: ${error.message}`);
            }
        } catch (error) {
            console.error('Error uploading minutes:', error);
            notify('Failed to upload minutes of meeting');
        } finally {
            setIsUploadingMinutes(false);
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
                {humanize(status)}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="ui-spin"></div>
            </div>
        );
    }

    return (
        <div>
            <div>
                <div className="mb-6 flex flex-wrap justify-between items-end gap-4">
                    <div className="page-heading page-heading--flush">
                        <h1 className="ui-page-header__title">Grievances</h1>
                    </div>
                    <div>
                        {grievances.filter(g => g.status === 'pending').length > 0 && (
                            <button
                                onClick={() => {
                                    setMeetingForm({ date: '', time: '', location: '', details: '', grievanceLetter: null });
                                    setShowBulkScheduleModal(true);
                                }}
                                className="ui-btn ui-btn--primary"
                            >
                                <Calendar className="w-4 h-4 mr-2" />
                                Schedule meeting for all
                            </button>
                        )}
                    </div>
                </div>

                {/* Minutes of Meeting Upload Section */}
                {grievances.length > 0 && (
                    <div className="ui-panel ui-panel--pad mb-6">
                        <div className="border-l-4 border-blue-500 pl-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                Minutes of meeting required
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Upload the meeting minutes (PDF) before deciding; they are attached to the emails sent to suppliers.
                            </p>
                            
                            {!minutesUploaded ? (
                                <div className="flex items-center space-x-4">
                                    <div className="flex-1">
                                        <label className="ui-label block mb-2">
                                            Upload minutes of meeting (PDF only)
                                        </label>
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            onChange={(e) => handleMinutesUpload(e.target.files[0])}
                                            disabled={isUploadingMinutes}
                                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        />
                                    </div>
                                    {isUploadingMinutes && (
                                        <div className="flex items-center text-blue-600">
                                            <div className="ui-spin mr-2"></div>
                                            Uploading...
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center space-x-4">
                                    <div className="flex items-center text-green-600">
                                        <CheckCircle className="w-5 h-5 mr-2" />
                                        <span className="font-medium">Minutes uploaded</span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        File: {minutesOfMeeting?.name}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setMinutesUploaded(false);
                                            setMinutesOfMeeting(null);
                                        }}
                                        className="ui-btn ui-btn--ghost ui-btn--sm"
                                    >
                                        Upload different file
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {grievances.length === 0 ? (
                    <div className="ui-panel ui-panel--pad text-center">
                        <FileText className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No grievances</h3>
                        <p className="mt-1 text-sm text-gray-500">No grievance applications to review at this time.</p>
                    </div>
                ) : (
                    <div className="ui-panel">
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
                                                                    <span>Meeting: {formatDateAndTime(meeting.date, meeting.time)}</span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex flex-col items-end space-y-2">
                                                        {getStatusBadge(grievance.status)}
                                                        <p className="text-sm text-gray-500">
                                                            {formatDate(grievance.created_at)}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {actions.map((action) => {
                                                        const Icon = action.icon;
                                                        const colorClasses = {
                                                            blue: 'bg-blue-600 hover:bg-blue-700 text-white',
                                                            green: 'bg-blue-600 hover:bg-blue-700 text-white',
                                                            orange: 'bg-blue-600 hover:bg-blue-700 text-white',
                                                            red: 'bg-red-600 hover:bg-red-700 text-white',
                                                            gray: 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                                        };

                                                        // Check if this action should be disabled due to loading state or requirements
                                                        const isActionDisabled = (action.key === 'approve' && isApproving) || 
                                                                                (action.key === 'reject' && isRejecting) ||
                                                                                action.disabled;

                                                        // Get the button text based on loading state
                                                        const getButtonText = () => {
                                                            if (action.key === 'approve' && isApproving) return 'Approving...';
                                                            if (action.key === 'reject' && isRejecting) return 'Rejecting...';
                                                            return action.label;
                                                        };

                                                        // Apply disabled styles when processing or disabled
                                                        const buttonClasses = isActionDisabled 
                                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                                            : colorClasses[action.color];
                                                        
                                                        return (
                                                            <button
                                                                key={action.key}
                                                                onClick={() => action.key !== 'minutes-required' && handleAction(grievance, action.key)}
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
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Schedule meeting</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="ui-label block">Date *</label>
                                <input
                                    type="date"
                                    value={meetingForm.date}
                                    onChange={(e) => setMeetingForm({...meetingForm, date: e.target.value})}
                                    className="ui-input mt-1"
                                    min={todayInPakistan()}
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Time *</label>
                                <input
                                    type="time"
                                    value={meetingForm.time}
                                    onChange={(e) => setMeetingForm({...meetingForm, time: e.target.value})}
                                    className="ui-input mt-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Location *</label>
                                <input
                                    type="text"
                                    value={meetingForm.location}
                                    onChange={(e) => setMeetingForm({...meetingForm, location: e.target.value})}
                                    placeholder="Meeting room, address, or online link"
                                    className="ui-input mt-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Additional details *</label>
                                <textarea
                                    value={meetingForm.details}
                                    onChange={(e) => setMeetingForm({...meetingForm, details: e.target.value})}
                                    placeholder="Any additional instructions or requirements..."
                                    rows={3}
                                    className="ui-input ui-textarea mt-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Grievance letter (optional)</label>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setMeetingForm({...meetingForm, grievanceLetter: e.target.files[0]})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                                <p className="text-xs text-gray-500 mt-1">Upload a PDF document to be sent with the meeting notification (optional)</p>
                                {meetingForm.grievanceLetter && (
                                    <p className="text-sm text-green-600 mt-1">{meetingForm.grievanceLetter.name}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2 mt-6">
                            <button
                                onClick={() => setShowScheduleModal(false)}
                                className="ui-btn ui-btn--secondary"
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
                    <div className="ui-scrim">
                        <div className="ui-dialog ui-dialog--legacy ui-dialog--sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Meeting details</h3>
                            <div className="space-y-3">
                                <div className="flex items-center">
                                    <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                                    <span className="font-medium">Date:</span>
                                    <span className="ml-2">{formatDate(meeting.date)}</span>
                                </div>
                                <div className="flex items-center">
                                    <Clock className="w-5 h-5 mr-2 text-gray-500" />
                                    <span className="font-medium">Time:</span>
                                    <span className="ml-2">{formatClockTime(meeting.time)}</span>
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
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                );            })()}

            {/* Bulk Schedule Meeting Modal */}
            {showBulkScheduleModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Schedule meeting for all pending grievances</h3>
                        <div className="ui-callout mb-4">
                            <p className="text-sm">
                                This will schedule a meeting and send notifications to all suppliers with pending grievances 
                                ({grievances.filter(g => g.status === 'pending').length} suppliers).
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="ui-label block">Date *</label>
                                <input
                                    type="date"
                                    value={meetingForm.date}
                                    onChange={(e) => setMeetingForm({...meetingForm, date: e.target.value})}
                                    className="ui-input mt-1"
                                    min={todayInPakistan()}
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Time *</label>
                                <input
                                    type="time"
                                    value={meetingForm.time}
                                    onChange={(e) => setMeetingForm({...meetingForm, time: e.target.value})}
                                    className="ui-input mt-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Location *</label>
                                <input
                                    type="text"
                                    value={meetingForm.location}
                                    onChange={(e) => setMeetingForm({...meetingForm, location: e.target.value})}
                                    placeholder="Meeting room, address, or online link"
                                    className="ui-input mt-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Additional details *</label>
                                <textarea
                                    value={meetingForm.details}
                                    onChange={(e) => setMeetingForm({...meetingForm, details: e.target.value})}
                                    placeholder="Any additional instructions or requirements..."
                                    rows={3}
                                    className="ui-input ui-textarea mt-1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="ui-label block">Grievance letter (optional)</label>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setMeetingForm({...meetingForm, grievanceLetter: e.target.files[0]})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                                <p className="text-xs text-gray-500 mt-1">PDF sent to all suppliers with the meeting notice</p>
                                {meetingForm.grievanceLetter && (
                                    <p className="text-sm text-green-600 mt-1">{meetingForm.grievanceLetter.name}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2 mt-6">
                            <button
                                onClick={() => setShowBulkScheduleModal(false)}
                                className="ui-btn ui-btn--secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkScheduleMeeting}
                                disabled={!isScheduleFormValid()}
                                className={`px-4 py-2 rounded-md transition-colors ${
                                    isScheduleFormValid() 
                                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                {isScheduling ? 'Scheduling...' : 'Schedule Meeting for All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Grievance Details Modal */}
            {showDetailsModal && selectedGrievance && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Grievance details</h3>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Company Information */}
                            <div className="space-y-4">
                                <h4 className="text-md font-semibold text-gray-800 border-b pb-2">Company information</h4>
                                
                                {/* Notice about missing data - only show if some fields are missing */}
                                {(!selectedGrievance.contact_person || !selectedGrievance.contact_number) && (
                                    <div className="ui-callout ui-callout--warning mb-2">
                                        <p className="text-sm text-yellow-700">
                                            <span className="font-medium">Note:</span> Some supplier details are missing. These fields may not have been provided during supplier registration.
                                        </p>
                                    </div>
                                )}
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="ui-label">Company name:</label>
                                        <p className="text-gray-900">{selectedGrievance.company_name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="ui-label">Contact person:</label>
                                        <p className="text-gray-900">{selectedGrievance.contact_person || selectedGrievance.supplier_contact_person || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="ui-label">Contact email:</label>
                                        <p className="text-gray-900">{selectedGrievance.company_email || selectedGrievance.contact_email || selectedGrievance.supplier_email || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="ui-label">Contact phone:</label>
                                        <p className="text-gray-900">{selectedGrievance.contact_number || selectedGrievance.contact_phone || selectedGrievance.supplier_phone || 'N/A'}</p>
                                    </div>
                                    {/* Note: company_address field doesn't exist in the database schema */}
                                </div>
                            </div>

                            {/* Grievance Information */}
                            <div className="space-y-4">
                                <h4 className="text-md font-semibold text-gray-800 border-b pb-2">Grievance information</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="ui-label">Item/service:</label>
                                        <p className="text-gray-900">{selectedGrievance.item_name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="ui-label">Tender reference:</label>
                                        <p className="text-gray-900">{selectedGrievance.tender_reference || `#${selectedGrievance.tender_id}` || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="ui-label">Status:</label>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            selectedGrievance.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            selectedGrievance.status === 'meeting_scheduled' ? 'bg-blue-100 text-blue-800' :
                                            selectedGrievance.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                            selectedGrievance.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {humanize(selectedGrievance.status || 'pending')}
                                        </span>
                                    </div>
                                    <div>
                                        <label className="ui-label">Submitted:</label>
                                        <p className="text-gray-900">
                                            {selectedGrievance.created_at && isNaN(new Date(selectedGrievance.created_at).getTime()) 
                                                ? 'Date not available'
                                                : formatDateTime(selectedGrievance.created_at)
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grievance Details */}
                        <div className="mt-6">
                            <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4">Grievance details</h4>
                            <div className="ui-callout">
                                <p className="text-gray-900 whitespace-pre-wrap">{selectedGrievance.grievance_details}</p>
                            </div>
                        </div>

                        {/* Meeting Information (if exists) */}
                        {(() => {
                            const meeting = parseMeetingDetails(selectedGrievance);
                            return meeting && (
                                <div className="mt-6">
                                    <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4">Meeting information</h4>
                                    <div className="ui-callout space-y-2">
                                        <div className="flex items-center">
                                            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
                                            <span className="font-medium">Date:</span>
                                            <span className="ml-2">{formatDate(meeting.date)}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <Clock className="w-5 h-5 mr-2 text-blue-600" />
                                            <span className="font-medium">Time:</span>
                                            <span className="ml-2">{formatClockTime(meeting.time)}</span>
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
                                <h4 className="text-md font-semibold text-gray-800 border-b pb-2 mb-4">Rejection reason</h4>
                                <div className="ui-callout ui-callout--danger">
                                    <p className="text-gray-900">{selectedGrievance.rejection_reason}</p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end mt-8">
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="ui-btn ui-btn--secondary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {showRejectModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Reject grievance</h3>
                        <div className="mb-4">
                            <label className="ui-label block mb-2">
                                Reason for rejection *
                            </label>
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Please provide a detailed reason for rejecting this grievance..."
                                rows={4}
                                className="ui-input ui-textarea"
                                required
                            />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setShowRejectModal(false)}
                                className="ui-btn ui-btn--secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                className="ui-btn ui-btn--danger-solid"
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