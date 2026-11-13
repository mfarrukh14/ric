import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { apiUrl } from '../../config/api';

import { formatClockTime, formatDate, fromDateAndTime, isPast, todayInPakistan } from '../../lib/time';
const PreBidMeetingManagement = () => {
    const [publishedTenders, setPublishedTenders] = useState([]);
    const [meetings, setMeetings] = useState({
        upcoming: [],
        today: [],
        past_incomplete: [],
        completed: [],
        cancelled: []
    });
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('published-tenders');
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedTender, setSelectedTender] = useState(null);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [uploadingMinutes, setUploadingMinutes] = useState(false);

    const [scheduleForm, setScheduleForm] = useState({
        meetingDate: '',
        meetingTime: '',
        location: '',
        venue: '',
        agenda: '',
        additionalNotes: ''
    });

    const [minutesFile, setMinutesFile] = useState(null);

    useEffect(() => {
        fetchPublishedTenders();
        fetchMeetings();
    }, []);

    const fetchPublishedTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/published`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch published tenders');
            
            const data = await response.json();
            setPublishedTenders(data.tenders || []);
        } catch (error) {
            console.error('Error fetching published tenders:', error);
            toast.error('Failed to fetch published tenders');
        }
    };

    const fetchMeetings = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/pre-bid-meetings`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch meetings');
            
            const data = await response.json();
            setMeetings(data.meetings || {
                upcoming: [],
                today: [],
                past_incomplete: [],
                completed: [],
                cancelled: []
            });
        } catch (error) {
            console.error('Error fetching meetings:', error);
            toast.error('Failed to fetch meetings');
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleMeeting = async (e) => {
        e.preventDefault();
        
        if (!selectedTender) {
            toast.error('Please select a tender');
            return;
        }

        // Validate that meeting date is in the future
        // Date and time boxes hold Pakistan time.
        if (isPast(fromDateAndTime(scheduleForm.meetingDate, scheduleForm.meetingTime))) {
            toast.error('Meeting date and time must be in the future');
            return;
        }

        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/pre-bid-meetings/schedule/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scheduleForm)
            });

            if (!response.ok) throw new Error('Failed to schedule meeting');
            
            const data = await response.json();
            toast.success(
                `Meeting scheduled; ${data.notifications.emails_sent} suppliers notified`
            );
            
            if (data.notifications.emails_failed > 0) {
                toast.warning(`${data.notifications.emails_failed} email notifications failed to send.`);
            }

            setShowScheduleModal(false);
            setSelectedTender(null);
            setScheduleForm({
                meetingDate: '',
                meetingTime: '',
                location: '',
                venue: '',
                agenda: '',
                additionalNotes: ''
            });
            
            fetchMeetings();
            fetchPublishedTenders();
        } catch (error) {
            console.error('Error scheduling meeting:', error);
            toast.error('Failed to schedule meeting');
        } finally {
            setLoading(false);
        }
    };

    const handleUploadMinutes = async (e) => {
        e.preventDefault();
        
        if (!minutesFile) {
            toast.error('Please select a file');
            return;
        }

        try {
            setUploadingMinutes(true);
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('meetingMinutes', minutesFile);

            const response = await fetch(`${apiUrl}/pre-bid-meetings/minutes/${selectedMeeting.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Failed to upload minutes');
            
            const data = await response.json();
            toast.success(
                `Meeting minutes uploaded and distributed to ${data.notifications.emails_sent} suppliers!`
            );
            
            if (data.notifications.emails_failed > 0) {
                toast.warning(`${data.notifications.emails_failed} email distributions failed.`);
            }

            setShowUploadModal(false);
            setSelectedMeeting(null);
            setMinutesFile(null);
            fetchMeetings();
        } catch (error) {
            console.error('Error uploading minutes:', error);
            toast.error('Failed to upload meeting minutes');
        } finally {
            setUploadingMinutes(false);
        }
    };

    const handleCancelMeeting = async (meetingId) => {
        const reason = window.prompt('Please provide a reason for cancellation:');
        if (!reason) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/pre-bid-meetings/cancel/${meetingId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cancellationReason: reason })
            });

            if (!response.ok) throw new Error('Failed to cancel meeting');
            
            const data = await response.json();
            toast.success(`Meeting cancelled. Notifications sent to ${data.notifications.emails_sent} suppliers.`);
            fetchMeetings();
        } catch (error) {
            console.error('Error cancelling meeting:', error);
            toast.error('Failed to cancel meeting');
        }
    };

    const downloadMinutes = (meetingId) => {
        const token = localStorage.getItem('token');
        const link = document.createElement('a');
        link.href = `${apiUrl}/pre-bid-meetings/minutes/${meetingId}/download`;
        link.setAttribute('Authorization', `Bearer ${token}`);
        link.click();
    };



    const getMeetingStatusBadge = (status) => {
        const badges = {
            scheduled: 'bg-blue-100 text-blue-800',
            completed: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800'
        };
        return badges[status] || 'bg-gray-100 text-gray-800';
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-8">
                <div className="ui-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Section Navigation */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveSection('published-tenders')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeSection === 'published-tenders'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Published tenders
                    </button>
                    <button
                        onClick={() => setActiveSection('scheduled-meetings')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeSection === 'scheduled-meetings'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Scheduled meetings
                    </button>
                    <button
                        onClick={() => setActiveSection('meeting-history')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeSection === 'meeting-history'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Meeting history
                    </button>
                </nav>
            </div>

            {/* Published Tenders Section */}
            {activeSection === 'published-tenders' && (
                <div className="ui-panel">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                            Published tenders - schedule pre-bid meetings
                        </h3>
                        
                        {publishedTenders.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No published tenders available</p>
                        ) : (
                            <div className="overflow-hidden">
                                <table className="ui-table">
                                    <thead>
                                        <tr>
                                            <th className="text-left">
                                                Tender details
                                            </th>
                                            <th className="text-left">
                                                Status
                                            </th>
                                            <th className="text-left">
                                                Meeting status
                                            </th>
                                            <th className="text-left">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {publishedTenders.map((tender) => (
                                            <tr key={tender.id}>
                                                <td className="whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {tender.tender_number || `Tender #${tender.id}`}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {tender.item_name}
                                                        </div>
                                                        <div className="text-xs text-gray-400">
                                                            {tender.description}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100">
                                                        Published
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {tender.meeting_status ? (
                                                        <div>
                                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getMeetingStatusBadge(tender.meeting_status)}`}>
                                                                {tender.meeting_status}
                                                            </span>
                                                            {tender.meeting_date && (
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    {formatDate(tender.meeting_date)} at {formatClockTime(tender.meeting_time)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-500">No meeting scheduled</span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {!tender.meeting_status || tender.meeting_status === 'cancelled' ? (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedTender(tender);
                                                                setShowScheduleModal(true);
                                                            }}
                                                            className="ui-btn ui-btn--ghost ui-btn--sm"
                                                        >
                                                            Schedule meeting
                                                        </button>
                                                    ) : tender.meeting_status === 'scheduled' ? (
                                                        <span className="text-green-600">Meeting Scheduled</span>
                                                    ) : (
                                                        <span className="text-gray-500">Completed</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Scheduled Meetings Section */}
            {activeSection === 'scheduled-meetings' && (
                <div className="space-y-6">
                    {/* Today's Meetings */}
                    {meetings.today.length > 0 && (
                        <div className="ui-panel">
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 text-red-600">
                                    Today's meetings
                                </h3>
                                {meetings.today.map((meeting) => (
                                    <MeetingCard 
                                        key={meeting.id} 
                                        meeting={meeting} 
                                        onUploadMinutes={() => {
                                            setSelectedMeeting(meeting);
                                            setShowUploadModal(true);
                                        }}
                                        onCancel={handleCancelMeeting}
                                        onDownloadMinutes={downloadMinutes}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Upcoming Meetings */}
                    {meetings.upcoming.length > 0 && (
                        <div className="ui-panel">
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    Upcoming meetings
                                </h3>
                                {meetings.upcoming.map((meeting) => (
                                    <MeetingCard 
                                        key={meeting.id} 
                                        meeting={meeting} 
                                        onCancel={handleCancelMeeting}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Past Incomplete Meetings */}
                    {meetings.past_incomplete.length > 0 && (
                        <div className="ui-panel">
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 text-orange-600">
                                    Past meetings - awaiting minutes
                                </h3>
                                {meetings.past_incomplete.map((meeting) => (
                                    <MeetingCard 
                                        key={meeting.id} 
                                        meeting={meeting} 
                                        onUploadMinutes={() => {
                                            setSelectedMeeting(meeting);
                                            setShowUploadModal(true);
                                        }}
                                        onCancel={handleCancelMeeting}
                                        isPastDue={true}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {meetings.today.length === 0 && meetings.upcoming.length === 0 && meetings.past_incomplete.length === 0 && (
                        <div className="ui-panel">
                            <div className="px-4 py-5 sm:p-6">
                                <p className="text-gray-500 text-center py-8">No scheduled meetings</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Meeting History Section */}
            {activeSection === 'meeting-history' && (
                <div className="ui-panel">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                            Meeting history
                        </h3>
                        
                        {meetings.completed.length === 0 && meetings.cancelled.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No meeting history available</p>
                        ) : (
                            <div className="space-y-4">
                                {/* Completed Meetings */}
                                {meetings.completed.length > 0 && (
                                    <div>
                                        <h4 className="text-md font-medium mb-2">Completed meetings</h4>
                                        {meetings.completed.map((meeting) => (
                                            <MeetingCard 
                                                key={meeting.id} 
                                                meeting={meeting} 
                                                onDownloadMinutes={downloadMinutes}
                                                isCompleted={true}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Cancelled Meetings */}
                                {meetings.cancelled.length > 0 && (
                                    <div>
                                        <h4 className="text-md font-medium text-red-700 mb-2">Cancelled meetings</h4>
                                        {meetings.cancelled.map((meeting) => (
                                            <MeetingCard 
                                                key={meeting.id} 
                                                meeting={meeting} 
                                                isCancelled={true}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Schedule Meeting Modal */}
            {showScheduleModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Schedule pre-bid meeting
                        </h3>
                        
                        {selectedTender && (
                            <div className="ui-callout mb-4">
                                <p className="text-sm font-medium">
                                    {selectedTender.tender_number || `Tender #${selectedTender.id}`}
                                </p>
                                <p className="text-sm">{selectedTender.item_name}</p>
                            </div>
                        )}

                        <form onSubmit={handleScheduleMeeting} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="ui-label block">Meeting date</label>
                                    <input
                                        type="date"
                                        required
                                        min={todayInPakistan()}
                                        value={scheduleForm.meetingDate}
                                        onChange={(e) => setScheduleForm({...scheduleForm, meetingDate: e.target.value})}
                                        className="ui-input mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="ui-label block">Meeting time</label>
                                    <input
                                        type="time"
                                        required
                                        value={scheduleForm.meetingTime}
                                        onChange={(e) => setScheduleForm({...scheduleForm, meetingTime: e.target.value})}
                                        className="ui-input mt-1"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="ui-label block">Location *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g., RIC Main Office"
                                    value={scheduleForm.location}
                                    onChange={(e) => setScheduleForm({...scheduleForm, location: e.target.value})}
                                    className="ui-input mt-1"
                                />
                            </div>

                            <div>
                                <label className="ui-label block">Venue</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Conference Room A"
                                    value={scheduleForm.venue}
                                    onChange={(e) => setScheduleForm({...scheduleForm, venue: e.target.value})}
                                    className="ui-input mt-1"
                                />
                            </div>

                            <div>
                                <label className="ui-label block">Agenda</label>
                                <textarea
                                    rows={3}
                                    placeholder="Meeting agenda and topics to be discussed..."
                                    value={scheduleForm.agenda}
                                    onChange={(e) => setScheduleForm({...scheduleForm, agenda: e.target.value})}
                                    className="ui-input ui-textarea mt-1"
                                />
                            </div>

                            <div>
                                <label className="ui-label block">Additional notes</label>
                                <textarea
                                    rows={2}
                                    placeholder="Any additional information for suppliers..."
                                    value={scheduleForm.additionalNotes}
                                    onChange={(e) => setScheduleForm({...scheduleForm, additionalNotes: e.target.value})}
                                    className="ui-input ui-textarea mt-1"
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowScheduleModal(false);
                                        setSelectedTender(null);
                                        setScheduleForm({
                                            meetingDate: '',
                                            meetingTime: '',
                                            location: '',
                                            venue: '',
                                            agenda: '',
                                            additionalNotes: ''
                                        });
                                    }}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="ui-btn ui-btn--primary"
                                >
                                    {loading ? 'Scheduling...' : 'Schedule Meeting'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Upload Minutes Modal */}
            {showUploadModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Upload meeting minutes
                        </h3>
                        
                        {selectedMeeting && (
                            <div className="ui-callout mb-4">
                                <p className="text-sm font-medium">
                                    {selectedMeeting.tender_number || `Tender #${selectedMeeting.tender_id}`}
                                </p>
                                <p className="text-sm">
                                    Meeting: {formatDate(selectedMeeting.meeting_date)} at {formatClockTime(selectedMeeting.meeting_time)}
                                </p>
                            </div>
                        )}

                        <form onSubmit={handleUploadMinutes} className="space-y-4">
                            <div>
                                <label className="ui-label block">
                                    Meeting minutes document *
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    required
                                    onChange={(e) => setMinutesFile(e.target.files[0])}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Supported formats: PDF, DOC, DOCX (Max size: 10MB)
                                </p>
                            </div>

                            <div className="ui-callout ui-callout--warning">
                                <p className="text-sm text-yellow-800">
                                    This document will be automatically emailed to all registered suppliers.
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowUploadModal(false);
                                        setSelectedMeeting(null);
                                        setMinutesFile(null);
                                    }}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploadingMinutes}
                                    className="ui-btn ui-btn--primary"
                                >
                                    {uploadingMinutes ? 'Uploading...' : 'Upload & Distribute'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// Meeting Card Component
const MeetingCard = ({ meeting, onUploadMinutes, onCancel, onDownloadMinutes, isPastDue, isCompleted, isCancelled }) => {


    const getMeetingStatusBadge = (status) => {
        const badges = {
            scheduled: 'bg-blue-100 text-blue-800',
            completed: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800'
        };
        return badges[status] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className={`border rounded-lg p-4 mb-4 ${isPastDue ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-lg font-medium text-gray-900">
                            {meeting.tender_number || `Tender #${meeting.tender_id}`}
                        </h4>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getMeetingStatusBadge(meeting.status)}`}>
                            {meeting.status}
                        </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3">{meeting.tender_title}</p>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="font-medium text-gray-700">Date:</span>
                            <span className="ml-1">{formatDate(meeting.meeting_date)}</span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Time:</span>
                            <span className="ml-1">{formatClockTime(meeting.meeting_time)}</span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Location:</span>
                            <span className="ml-1">{meeting.location}</span>
                        </div>
                        {meeting.venue && (
                            <div>
                                <span className="font-medium text-gray-700">Venue:</span>
                                <span className="ml-1">{meeting.venue}</span>
                            </div>
                        )}
                    </div>

                    {meeting.agenda && (
                        <div className="mt-3">
                            <span className="font-medium text-gray-700">Agenda:</span>
                            <p className="text-sm text-gray-600 mt-1">{meeting.agenda}</p>
                        </div>
                    )}

                    {meeting.additional_notes && (
                        <div className="mt-2">
                            <span className="font-medium text-gray-700">Notes:</span>
                            <p className="text-sm text-gray-600 mt-1">{meeting.additional_notes}</p>
                        </div>
                    )}
                </div>

                <div className="ml-4 flex flex-col gap-2">
                    {meeting.status === 'scheduled' && !isCancelled && (
                        <>
                            {onUploadMinutes && (
                                <button
                                    onClick={() => onUploadMinutes(meeting)}
                                    className="ui-btn ui-btn--ghost ui-btn--sm"
                                >
                                    Upload minutes
                                </button>
                            )}
                            {onCancel && (
                                <button
                                    onClick={() => onCancel(meeting.id)}
                                    className="ui-btn ui-btn--ghost ui-btn--danger ui-btn--sm"
                                >
                                    Cancel meeting
                                </button>
                            )}
                        </>
                    )}

                    {meeting.status === 'completed' && onDownloadMinutes && (
                        <button
                            onClick={() => onDownloadMinutes(meeting.id)}
                            className="ui-btn ui-btn--ghost ui-btn--sm"
                        >
                            Download minutes
                        </button>
                    )}
                </div>
            </div>

            {isPastDue && (
                <div className="mt-3 p-2 bg-orange-100 border border-orange-200 rounded text-sm text-orange-800">
                    This meeting has passed. Please upload the meeting minutes to complete the process.
                </div>
            )}
        </div>
    );
};

export default PreBidMeetingManagement;
