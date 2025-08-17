import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api, { apiUrl } from '../../config/api';

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
        const meetingDateTime = new Date(`${scheduleForm.meetingDate}T${scheduleForm.meetingTime}`);
        const now = new Date();
        
        if (meetingDateTime <= now) {
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
                `Meeting scheduled successfully! Notifications sent to ${data.notifications.emails_sent} suppliers.`
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

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (timeString) => {
        return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
                        Published Tenders
                    </button>
                    <button
                        onClick={() => setActiveSection('scheduled-meetings')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeSection === 'scheduled-meetings'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Scheduled Meetings
                    </button>
                    <button
                        onClick={() => setActiveSection('meeting-history')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeSection === 'meeting-history'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Meeting History
                    </button>
                </nav>
            </div>

            {/* Published Tenders Section */}
            {activeSection === 'published-tenders' && (
                <div className="bg-white shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                            Published Tenders - Schedule Pre-Bid Meetings
                        </h3>
                        
                        {publishedTenders.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No published tenders available</p>
                        ) : (
                            <div className="overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Tender Details
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Meeting Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {publishedTenders.map((tender) => (
                                            <tr key={tender.id}>
                                                <td className="px-6 py-4 whitespace-nowrap">
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
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                        Published
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {tender.meeting_status ? (
                                                        <div>
                                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getMeetingStatusBadge(tender.meeting_status)}`}>
                                                                {tender.meeting_status}
                                                            </span>
                                                            {tender.meeting_date && (
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    {formatDate(tender.meeting_date)} at {formatTime(tender.meeting_time)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-500">No meeting scheduled</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    {!tender.meeting_status || tender.meeting_status === 'cancelled' ? (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedTender(tender);
                                                                setShowScheduleModal(true);
                                                            }}
                                                            className="text-blue-600 hover:text-blue-900"
                                                        >
                                                            Schedule Meeting
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
                        <div className="bg-white shadow rounded-lg">
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 text-red-600">
                                    🔥 Today's Meetings
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
                        <div className="bg-white shadow rounded-lg">
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    📅 Upcoming Meetings
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
                        <div className="bg-white shadow rounded-lg">
                            <div className="px-4 py-5 sm:p-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 text-orange-600">
                                    ⚠️ Past Meetings - Awaiting Minutes
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
                        <div className="bg-white shadow rounded-lg">
                            <div className="px-4 py-5 sm:p-6">
                                <p className="text-gray-500 text-center py-8">No scheduled meetings</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Meeting History Section */}
            {activeSection === 'meeting-history' && (
                <div className="bg-white shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                            Meeting History
                        </h3>
                        
                        {meetings.completed.length === 0 && meetings.cancelled.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No meeting history available</p>
                        ) : (
                            <div className="space-y-4">
                                {/* Completed Meetings */}
                                {meetings.completed.length > 0 && (
                                    <div>
                                        <h4 className="text-md font-medium text-green-700 mb-2">✅ Completed Meetings</h4>
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
                                        <h4 className="text-md font-medium text-red-700 mb-2">❌ Cancelled Meetings</h4>
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
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-1/2 lg:w-1/3 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Schedule Pre-Bid Meeting
                        </h3>
                        
                        {selectedTender && (
                            <div className="mb-4 p-3 bg-blue-50 rounded-md">
                                <p className="text-sm font-medium text-blue-900">
                                    {selectedTender.tender_number || `Tender #${selectedTender.id}`}
                                </p>
                                <p className="text-sm text-blue-700">{selectedTender.item_name}</p>
                            </div>
                        )}

                        <form onSubmit={handleScheduleMeeting} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Meeting Date</label>
                                    <input
                                        type="date"
                                        required
                                        min={new Date().toISOString().split('T')[0]}
                                        value={scheduleForm.meetingDate}
                                        onChange={(e) => setScheduleForm({...scheduleForm, meetingDate: e.target.value})}
                                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Meeting Time</label>
                                    <input
                                        type="time"
                                        required
                                        value={scheduleForm.meetingTime}
                                        onChange={(e) => setScheduleForm({...scheduleForm, meetingTime: e.target.value})}
                                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Location *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g., RIC Main Office"
                                    value={scheduleForm.location}
                                    onChange={(e) => setScheduleForm({...scheduleForm, location: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Venue</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Conference Room A"
                                    value={scheduleForm.venue}
                                    onChange={(e) => setScheduleForm({...scheduleForm, venue: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Agenda</label>
                                <textarea
                                    rows={3}
                                    placeholder="Meeting agenda and topics to be discussed..."
                                    value={scheduleForm.agenda}
                                    onChange={(e) => setScheduleForm({...scheduleForm, agenda: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Additional Notes</label>
                                <textarea
                                    rows={2}
                                    placeholder="Any additional information for suppliers..."
                                    value={scheduleForm.additionalNotes}
                                    onChange={(e) => setScheduleForm({...scheduleForm, additionalNotes: e.target.value})}
                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
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
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-1/2 lg:w-1/3 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Upload Meeting Minutes
                        </h3>
                        
                        {selectedMeeting && (
                            <div className="mb-4 p-3 bg-green-50 rounded-md">
                                <p className="text-sm font-medium text-green-900">
                                    {selectedMeeting.tender_number || `Tender #${selectedMeeting.tender_id}`}
                                </p>
                                <p className="text-sm text-green-700">
                                    Meeting: {formatDate(selectedMeeting.meeting_date)} at {formatTime(selectedMeeting.meeting_time)}
                                </p>
                            </div>
                        )}

                        <form onSubmit={handleUploadMinutes} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Meeting Minutes Document *
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

                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                                <p className="text-sm text-yellow-800">
                                    📧 This document will be automatically emailed to all registered suppliers.
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploadingMinutes}
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
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
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (timeString) => {
        return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

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
                            <span className="ml-1">{formatTime(meeting.meeting_time)}</span>
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
                                    className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded"
                                >
                                    Upload Minutes
                                </button>
                            )}
                            {onCancel && (
                                <button
                                    onClick={() => onCancel(meeting.id)}
                                    className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded"
                                >
                                    Cancel Meeting
                                </button>
                            )}
                        </>
                    )}

                    {meeting.status === 'completed' && onDownloadMinutes && (
                        <button
                            onClick={() => onDownloadMinutes(meeting.id)}
                            className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded"
                        >
                            Download Minutes
                        </button>
                    )}
                </div>
            </div>

            {isPastDue && (
                <div className="mt-3 p-2 bg-orange-100 border border-orange-200 rounded text-sm text-orange-800">
                    ⚠️ This meeting has passed. Please upload the meeting minutes to complete the process.
                </div>
            )}
        </div>
    );
};

export default PreBidMeetingManagement;
