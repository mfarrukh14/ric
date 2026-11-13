import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowsClockwise, Hourglass } from '@phosphor-icons/react';
import { toast } from 'react-toastify';
import api, { apiUrl, downloadFile } from '../../config/api';
import TenderCreationWizard from '../purchase/TenderCreationWizard';
import PreBidMeetingManagement from '../purchase/PreBidMeetingManagement';
import LetterManagement from '../purchase/LetterManagement';
import TenderVettingManagement from '../purchase/TenderVettingManagement';
import PurchaseOrdersManagement from '../purchase/PurchaseOrdersManagement';
import { useRouteTab } from '../../lib/useRouteTab';
import { setNavBadge } from '../../lib/navBadges';
import { PURCHASE_TABS } from '../../app/navigation';
import { Button, EmptyState, LoadingBlock, Modal, PageHeader, Panel } from '../../ui';
import { Countdown, TenderProgress, TenderStatus } from '../../ui/tender';

const PURCHASE_PAGES = {
    demands: { title: 'Pending demands' },
    'supply-orders': { title: 'Letters' },
    'purchase-orders': { title: 'Purchase orders' },
    'pending-tenders': { title: 'Tender opening' },
    'financial-opening': { title: 'Financial opening' },
    'grievance-management': { title: 'Grievances' },
    'pre-bid-meetings': { title: 'Pre-bid meetings' },
    'vetting-management': { title: 'Vetting' },
    'market-survey': { title: 'Market survey' },
    'tender-management': { title: 'Tender management' },
};
import { notify } from '../../lib/notify';

import { formatDate, formatDateTime, fromInputValue, inputValueFromNow, toDate, toInputValue } from '../../lib/time';
import { humanize } from '../../ui/status';
const PurchaseDepartment = () => {
    const navigate = useNavigate();
    const [demands, setDemands] = useState([]);
    const [readyTenders, setReadyTenders] = useState([]);
    const [scheduledOpenings, setScheduledOpenings] = useState([]);
    const [pendingTenders, setPendingTenders] = useState([]);
    const [pendingGrievances, setPendingGrievances] = useState([]);
    const [allGrievances, setAllGrievances] = useState([]);
    const [selectedDemand, setSelectedDemand] = useState(null);
    const [selectedTender, setSelectedTender] = useState(null);
    const [activeTab, setActiveTab] = useRouteTab(PURCHASE_TABS, 'demands');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingTenderIds, setProcessingTenderIds] = useState([]);
    const [showTenderWizard, setShowTenderWizard] = useState(false);
    const [selectedDemandForTender, setSelectedDemandForTender] = useState(null);
    
    // Tender Management States
    const [managableTenders, setManagableTenders] = useState([]);
    const [showTimeExtensionModal, setShowTimeExtensionModal] = useState(false);
    const [selectedTenderForExtension, setSelectedTenderForExtension] = useState(null);
    const [timeExtensionForm, setTimeExtensionForm] = useState({
        newBiddingEndTime: '',
        reason: ''
    });

    const [evaluationForm, setEvaluationForm] = useState({
        status: '',
        comments: '',
        biddingExpiryTime: '',
        tenderDocument: null,
        itemsList: null,
        updatedDemand: {
            description: '',
            urgency: '',
            required_by: ''
        }
    }); const [showEvaluationModal, setShowEvaluationModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showFinancialScheduleModal, setShowFinancialScheduleModal] = useState(false);
    const [showFinancialOpeningModal, setShowFinancialOpeningModal] = useState(false);
    const [financialOpeningData, setFinancialOpeningData] = useState(null);
    const [scheduleForm, setScheduleForm] = useState({
        openingDateTime: ''
    });
    const [financialGrievanceForm, setFinancialGrievanceForm] = useState({
        meetingDateTime: '',
        meetingLocation: 'Conference Room - Rawalpindi Institute of Cardiology',
        customMessage: ''
    });
    const [showFinancialGrievanceModal, setShowFinancialGrievanceModal] = useState(false);
    const [showUploadMinutesModal, setShowUploadMinutesModal] = useState(false);
    const [minutesForm, setMinutesForm] = useState({
        minutesFile: null,
        distributionMessage: ''
    });

    // Market Survey states
    const [marketSurveyTenders, setMarketSurveyTenders] = useState([]);
    const [completedSurveys, setCompletedSurveys] = useState([]);
    const [showMarketSurveyModal, setShowMarketSurveyModal] = useState(false);
    const [selectedMarketSurveyTender, setSelectedMarketSurveyTender] = useState(null);
    const [marketSurveyForm, setMarketSurveyForm] = useState({
        notes: '',
        documents: []
    });

    // Helper function to get tender display name
    const getTenderDisplayName = (tender) => {
        if (tender.tender_number) {
            return `Tender ${tender.tender_number}`;
        }
        return `Tender #${tender.id}`;
    };

    // Helper function to check if financial grievance meeting has passed
    const hasFinancialGrievanceMeetingPassed = (tender) => {
        if (!tender.financial_grievance_details?.meeting_datetime) {
            return false;
        }
        const meetingTime = toDate(tender.financial_grievance_details.meeting_datetime) || new Date(0);
        const now = new Date();
        return meetingTime <= now;
    };

    // Helper function to get financial grievance status
    const getFinancialGrievanceStatus = (tender) => {
        if (!tender.is_financially_opened) {
            return 'not_opened'; // Financial opening hasn't happened yet
        }
        
        if (!tender.financial_grievance_details) {
            return 'ready_for_grievance'; // Financial opening done, ready to initiate grievance
        }
        
        if (tender.financial_grievance_details.status === 'completed') {
            return 'completed'; // Meeting completed and minutes distributed
        }
        
        if (hasFinancialGrievanceMeetingPassed(tender)) {
            return 'meeting_passed'; // Meeting time has passed, ready to upload minutes
        }
        
        return 'grievance_initiated'; // Grievance initiated, waiting for meeting time
    }; useEffect(() => {
        fetchPurchaseDemands();
        fetchReadyTenders();
        fetchScheduledOpenings();
        fetchPendingTenders();
        fetchGrievances();
        fetchManagableTenders();
    }, []);

    // Live counts beside the sidebar's Purchase items.
    useEffect(() => {
        setNavBadge('purchase.demands', demands.length);
        setNavBadge('purchase.opening', pendingTenders.length);
        setNavBadge('purchase.financial', readyTenders.length + (scheduledOpenings.ready_to_open?.length || 0) + (scheduledOpenings.scheduled_future?.length || 0));
        setNavBadge('purchase.grievances', pendingGrievances.length);
    }, [demands, pendingTenders, readyTenders, scheduledOpenings, pendingGrievances]);

    // Auto-redirect after success modal
    useEffect(() => {
        if (showSuccessModal) {
            const timer = setTimeout(() => {
                setShowSuccessModal(false);
                setShowEvaluationModal(false);
                setSelectedDemand(null);
                setActiveTab('demands');
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [showSuccessModal]);

    // Fetch market survey tenders when market survey tab is active
    useEffect(() => {
        if (activeTab === 'market-survey') {
            fetchMarketSurveyTenders();
            fetchCompletedSurveys();
        } else if (activeTab === 'tender-management') {
            fetchManagableTenders();
        }
    }, [activeTab]);

    const fetchPurchaseDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/purchase`, {
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
    }; const fetchReadyTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/ready-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error('Failed to fetch ready tenders');
            }

            const data = await response.json();
            setReadyTenders(data);
        } catch (err) {
            console.error('Error fetching ready tenders:', err);
        }
    }; const fetchScheduledOpenings = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/scheduled`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch scheduled openings');
            }

            const data = await response.json();
            setScheduledOpenings(data);
        } catch (err) {
            console.error('Error fetching scheduled openings:', err);
        }
    };

    const fetchPendingTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/pending-opening`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch pending tenders');
            }

            const data = await response.json();
            setPendingTenders(data);
        } catch (err) {
            console.error('Error fetching pending tenders:', err);
        }
    };

    const fetchGrievances = async () => {
        try {
            const token = localStorage.getItem('token');
            const [pendingResponse, allResponse] = await Promise.all([
                fetch(`${apiUrl}/purchase-grievances/pending`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }),
                fetch(`${apiUrl}/purchase-grievances/all`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                })
            ]);

            if (pendingResponse.ok) {
                const pendingData = await pendingResponse.json();
                setPendingGrievances(pendingData.grievances || []);
            }

            if (allResponse.ok) {
                const allData = await allResponse.json();
                setAllGrievances(allData.grievances || []);
            }
        } catch (err) {
            console.error('Error fetching grievances:', err);
        }
    };

    const fetchManagableTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/managable-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setManagableTenders(data.tenders || []);
            } else {
                console.error('Failed to fetch managable tenders');
            }
        } catch (err) {
            console.error('Error fetching managable tenders:', err);
        }
    };

    const submitForFinanceApproval = async (tender) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/purchase/tenders/${tender.id}/submit-for-finance-approval`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                toast.success('Tender submitted for Finance and MS HOD approval');
                fetchManagableTenders();
            } else {
                const errorData = await response.json();
                toast.error(errorData.message || 'Failed to submit tender for approval');
            }
        } catch (error) {
            console.error('Error submitting tender for finance approval:', error);
            toast.error('Failed to submit tender for approval');
        }
    };

    const handleTimeExtension = (tender) => {
        setSelectedTenderForExtension(tender);
        setTimeExtensionForm({
            newBiddingEndTime: '',
            reason: ''
        });
        setShowTimeExtensionModal(true);
    };

    const submitTimeExtension = async () => {
        if (!timeExtensionForm.newBiddingEndTime || !timeExtensionForm.reason) {
            toast.error('Please provide both new bidding end time and reason');
            return;
        }

        if ((toDate(timeExtensionForm.newBiddingEndTime)?.getTime() ?? 0) < Date.now() + 2 * 60 * 1000) {
            toast.error('New bidding end time must be at least 2 minutes from now');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/${selectedTenderForExtension.id}/update-time`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                // The box holds Pakistan time.
                body: JSON.stringify({ ...timeExtensionForm, newBiddingEndTime: fromInputValue(timeExtensionForm.newBiddingEndTime) })
            });

            if (response.ok) {
                toast.success('Tender time updated');
                setShowTimeExtensionModal(false);
                fetchManagableTenders(); // Refresh the list
            } else {
                const errorData = await response.json();
                toast.error(errorData.message || 'Failed to update tender time');
            }
        } catch (error) {
            console.error('Error updating tender time:', error);
            toast.error('Failed to update tender time');
        }
    };

    const handleEvaluate = async (demand) => {
        try {
            // Check if a tender already exists for this demand
            const response = await api.get(`/demands/${demand.id}/tender/exists`);
            
            if (response.data.exists) {
                // Tender already exists, show a message
                toast.info(`A tender already exists for this demand (Tender ID: ${response.data.tenderId}). You can view or manage the existing tender.`);
                return;
            }
        } catch (error) {
            console.error('Error checking existing tender:', error);
            toast.error('Error checking existing tender');
            return;
        }
        
        // No existing tender found, proceed with creation
        setSelectedDemandForTender(demand);
        setShowTenderWizard(true);
    };

    // Grievance management functions
    const handleApproveGrievance = async (grievanceId, approvalComments = '') => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/purchase-grievances/${grievanceId}/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    approvalComments,
                    reviewedBy: 'Purchase Department'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to approve grievance');
            }

            toast.success('Grievance approved and notification sent to supplier');
            fetchGrievances(); // Refresh the list
        } catch (err) {
            console.error('Error approving grievance:', err);
            toast.error(err.message);
        }
    };

    const handleRejectGrievance = async (grievanceId, rejectionComments = '') => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/purchase-grievances/${grievanceId}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    rejectionComments,
                    reviewedBy: 'Purchase Department'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to reject grievance');
            }

            toast.success('Grievance rejected - supplier will not be notified');
            fetchGrievances(); // Refresh the list
        } catch (err) {
            console.error('Error rejecting grievance:', err);
            toast.error(err.message);
        }
    };

    const handleBulkApproveGrievances = async (selectedIds, approvalComments = '') => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/purchase-grievances/bulk-approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    grievanceIds: selectedIds,
                    approvalComments,
                    reviewedBy: 'Purchase Department'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to bulk approve grievances');
            }

            const result = await response.json();
            toast.success(`Bulk approval completed: ${result.summary.successful} successful, ${result.summary.failed} failed`);
            fetchGrievances(); // Refresh the list
        } catch (err) {
            console.error('Error bulk approving grievances:', err);
            toast.error(err.message);
        }
    };

    const handleTenderCreated = (tender) => {
        // Refresh the data
        fetchPurchaseDemands();
        fetchPendingTenders();
        fetchReadyTenders();
        setShowSuccessModal(true);
    };

    const handleCloseTenderWizard = () => {
        setShowTenderWizard(false);
        setSelectedDemandForTender(null);
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

        if (evaluationForm.status === 'approved' && !evaluationForm.biddingExpiryTime) {
            setError('Bidding expiry date and time is required for approval');
            return;
        }

        if (evaluationForm.status === 'approved' && !evaluationForm.tenderDocument) {
            setError('Tender document (PDF) is required for approval');
            return;
        }

        if (evaluationForm.status === 'approved' && !evaluationForm.itemsList) {
            setError('Items list (Excel/CSV) is required for approval');
            return;
        }

        // Bidding expiry must be a real future time, at least 2 minutes out.
        if (evaluationForm.status === 'approved' && evaluationForm.biddingExpiryTime) {
            const expiryTime = toDate(evaluationForm.biddingExpiryTime) || new Date(0);
            const minTime = new Date(Date.now() + 2 * 60 * 1000);

            if (expiryTime < minTime) {
                setError('Bidding expiry must be at least 2 minutes from now');
                return;
            }
        }

        try {
            const token = localStorage.getItem('token');
            let endpoint, method;

            if (evaluationForm.status === 'approved') {
                // Use FormData for file uploads
                const formData = new FormData();
                formData.append('expiryDate', evaluationForm.biddingExpiryTime);
                formData.append('tenderDocument', evaluationForm.tenderDocument);
                formData.append('itemsList', evaluationForm.itemsList);

                endpoint = `${apiUrl}/demands/${selectedDemand.id}/approve`;
                method = 'PUT';

                const response = await fetch(endpoint, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to submit evaluation');
                }
            } else {
                // Use the purchase evaluation endpoint for rejections
                endpoint = `${apiUrl}/demands/${selectedDemand.id}/purchase`;
                method = 'PUT';
                const bodyData = {
                    action: 'reject',
                    remarks: evaluationForm.comments
                };

                const response = await fetch(endpoint, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bodyData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to submit evaluation');
                }
            }

            setShowEvaluationModal(false);
            fetchPurchaseDemands(); // Refresh the list
            fetchPendingTenders(); // Refresh pending tenders

            // Show success modal
            setShowSuccessModal(true);
            setTimeout(() => {
                setShowSuccessModal(false);
            }, 2000);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleOpenTender = async (tenderId) => {
        try {
            // Add tender ID to processing list
            setProcessingTenderIds(prev => [...prev, tenderId]);

            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/${tenderId}/open`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to open tender');
            }

            const data = await response.json();
            notify(data.message);
            
            // Refresh the lists
            fetchPendingTenders();
            fetchReadyTenders();
        } catch (err) {
            setError(err.message);
            notify(`Error: ${err.message}`);
        } finally {
            // Remove tender ID from processing list when done
            setProcessingTenderIds(prev => prev.filter(id => id !== tenderId));
        }
    };


    // Financial Opening Handlers
    const handleScheduleFinancialOpening = (tender) => {
        setSelectedTender(tender);
        setScheduleForm({
            openingDateTime: ''
        });
        setShowFinancialScheduleModal(true);
    };

    // Financial Grievance Handler
    const handleInitiateFinancialGrievance = (tender) => {
        setSelectedTender(tender);
        setFinancialGrievanceForm({
            meetingDateTime: '',
            meetingLocation: 'Conference Room - Rawalpindi Institute of Cardiology',
            customMessage: ''
        });
        setShowFinancialGrievanceModal(true);
    };

    // Upload Minutes Handler
    const handleUploadMinutes = (tender) => {
        setSelectedTender(tender);
        setMinutesForm({
            minutesFile: null,
            distributionMessage: ''
        });
        setShowUploadMinutesModal(true);
    };

    const handleScheduleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!scheduleForm.openingDateTime) {
            setError('Opening date and time is required');
            return;
        }

        // Validate that opening time is in future (Pakistan time UTC+5)
        // The box holds Pakistan time; compare real instants.
        const pakistanTime = new Date();
        const scheduledTime = toDate(scheduleForm.openingDateTime) || new Date(0);

        if (scheduledTime <= pakistanTime) {
            setError('Opening time must be in the future');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/schedule/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    openingDateTime: scheduleForm.openingDateTime
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to schedule financial opening');
            }

            setShowFinancialScheduleModal(false);
            fetchReadyTenders();
            fetchScheduledOpenings();

            // Show success message
            notify('Financial opening scheduled');
        } catch (err) {
            setError(err.message);
        }
    };

    const handleFinancialGrievanceSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!financialGrievanceForm.meetingDateTime) {
            setError('Meeting date and time is required');
            return;
        }

        // Validate that meeting time is in future
        const now = new Date();
        const meetingTime = toDate(financialGrievanceForm.meetingDateTime) || new Date(0);

        if (meetingTime <= now) {
            setError('Meeting time must be in the future');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-grievance/initiate/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    meetingDateTime: financialGrievanceForm.meetingDateTime,
                    meetingLocation: financialGrievanceForm.meetingLocation,
                    customMessage: financialGrievanceForm.customMessage
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to initiate financial grievance');
            }

            const data = await response.json();
            setShowFinancialGrievanceModal(false);
            fetchReadyTenders(); // Refresh to show grievance status

            // Show success message
            toast.success(`Financial grievance initiated. Emails sent to ${data.emails_sent} approved suppliers.`);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleUploadMinutesSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!minutesForm.minutesFile) {
            setError('Meeting minutes file is required');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('minutesFile', minutesForm.minutesFile);
            formData.append('distributionMessage', minutesForm.distributionMessage);

            const response = await fetch(`${apiUrl}/financial-grievance/upload-minutes/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to upload minutes');
            }

            const data = await response.json();
            setShowUploadMinutesModal(false);
            fetchReadyTenders(); // Refresh to show completion status

            // Show success message
            toast.success(`Meeting minutes uploaded and distributed. Emails sent to ${data.emails_sent} suppliers.`);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleOpenFinancialBids = async (tenderId) => {
        try {
            // Add tender ID to processing list
            setProcessingTenderIds(prev => [...prev, tenderId]);

            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/open/${tenderId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to open financial bids');
            }

            const data = await response.json();
            setFinancialOpeningData(data);
            setShowFinancialOpeningModal(true);
            fetchScheduledOpenings();
        } catch (err) {
            setError(err.message);
            notify(`Error: ${err.message}`);
        } finally {
            // Remove tender ID from processing list when done
            setProcessingTenderIds(prev => prev.filter(id => id !== tenderId));
        }
    };

    const downloadFinancialBid = async (bidId, companyName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/bids/${bidId}/financial-document`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download financial bid');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `financial-bid-${companyName}-${bidId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            notify(`Error downloading financial bid: ${err.message}`);
        }
    };

    const downloadTechnicalBid = async (bidId, companyName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/bids/${bidId}/technical-document`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download technical bid');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `technical-bid-${companyName}-${bidId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            notify(`Error downloading technical bid: ${err.message}`);
        }
    };

    const downloadBidCdrDocument = async (bidId, companyName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/bids/${bidId}/cdr-document`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download bid CDR document');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Get file extension from content-disposition header if available
            const contentDisposition = response.headers.get('content-disposition');
            let fileName = `bid-cdr-${companyName}-${bidId}`;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/);
                if (fileNameMatch) {
                    fileName = fileNameMatch[1];
                }
            }
            
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            notify(`Error downloading bid CDR document: ${err.message}`);
        }
    };

    const downloadFinancialOpeningReport = async (fileName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/financial-opening/reports/${fileName}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download report');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            notify(`Error downloading report: ${err.message}`);
        }
    };

    // The estimate is built on the server from saved data (the same file store downloads).
    const downloadDemandReport = (demand) =>
        downloadFile(`/demands/${demand.id}/excel-report`, `Demand_${demand.id}_estimate.xlsx`).catch((err) => toast.error(err?.message || err?.error || 'Failed to download the report'));

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

    const handleFileChange = (e) => {
        const { name, files } = e.target;
        if (files && files[0]) {
            const file = files[0];

            // Validate file types
            if (name === 'tenderDocument') {
                if (file.type !== 'application/pdf') {
                    setError('Tender document must be a PDF file');
                    return;
                }
            } else if (name === 'itemsList') {
                const allowedTypes = [
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'text/csv'
                ];
                if (!allowedTypes.includes(file.type)) {
                    setError('Items list must be an Excel (.xls, .xlsx) or CSV file');
                    return;
                }
            }

            // Validate file size (10MB)
            if (file.size > 10 * 1024 * 1024) {
                setError('File size must be less than 10MB');
                return;
            }

            setEvaluationForm(prev => ({
                ...prev,
                [name]: file
            }));
            setError('');
        }
    };

    const getStatusBadge = (status) => {
        const statusColors = {
            'purchase_pending': 'bg-yellow-100 text-yellow-800',
            'available': 'bg-green-100 text-green-800',
            'purchase_approved': 'bg-green-100 text-green-800',
            'tender_created': 'bg-blue-100 text-blue-800',
            'rejected': 'bg-red-100 text-red-800'
        };

        const statusLabels = {
            'purchase_pending': 'Store Response - Pending Purchase',
            'available': 'Store Fulfilled - Available',
            'purchase_approved': 'Purchase Approved',
            'tender_created': 'Tender Created',
            'rejected': 'Rejected'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
                {statusLabels[status] || status}
            </span>
        );
    };

    const getUrgencyBadge = (urgency) => {
        const urgencyColors = {
            'high': 'bg-red-100 text-red-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-yellow-100 text-yellow-800',
            'low': 'bg-green-100 text-green-800'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[urgency] || 'bg-gray-100 text-gray-800'}`}>
                {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
            </span>
        );
    };

    const getTotalEstimatedCost = (items) => {
        if (!items || items.length === 0) return 0;
        return items.reduce((total, item) => total + parseFloat(item.estimated_cost || 0), 0);
    };


    // Market Survey Functions
    const fetchMarketSurveyTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/active-tenders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch market survey tenders');
            }
            
            const data = await response.json();
            setMarketSurveyTenders(data.data || []);
        } catch (err) {
            console.error('Error fetching market survey tenders:', err);
            setError('Failed to load market survey tenders');
        }
    };

    const fetchCompletedSurveys = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/completed-surveys`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch completed surveys');
            }
            
            const data = await response.json();
            setCompletedSurveys(data.data || []);
        } catch (err) {
            console.error('Error fetching completed surveys:', err);
            setError('Failed to load completed surveys');
        }
    };

    const handleSendForMarketSurvey = (tender) => {
        setSelectedMarketSurveyTender(tender);
        setShowMarketSurveyModal(true);
    };

    const handleMarketSurveySubmit = async (e) => {
        e.preventDefault();
        
        if (!selectedMarketSurveyTender) {
            toast.error('No tender selected');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('notes', marketSurveyForm.notes);
            
            // Add multiple documents
            if (marketSurveyForm.documents && marketSurveyForm.documents.length > 0) {
                for (let i = 0; i < marketSurveyForm.documents.length; i++) {
                    formData.append('documents', marketSurveyForm.documents[i]);
                }
            }

            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/send/${selectedMarketSurveyTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to send tender for market survey');
            }

            toast.success('Tender sent for market survey');
            
            // Reset form and close modal
            setMarketSurveyForm({ notes: '', documents: [] });
            setShowMarketSurveyModal(false);
            setSelectedMarketSurveyTender(null);
            
            // Refresh the tenders list
            fetchMarketSurveyTenders();

        } catch (err) {
            console.error('Error sending tender for market survey:', err);
            toast.error(err.message || 'Failed to send tender for market survey');
        }
    };

    const handleMarketSurveyDocumentChange = (e) => {
        const files = Array.from(e.target.files);
        setMarketSurveyForm(prev => ({
            ...prev,
            documents: files
        }));
    };

    const downloadMarketSurveyDocument = async (documentId, originalFilename) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/download/${documentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to download document');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
        } catch (err) {
            console.error('Error downloading document:', err);
            toast.error('Failed to download document');
        }
    };

    if (loading) {
        return (
            <LoadingBlock label="Loading purchase workspace…" />
        );
    }

    return (
        <div>
            {/* Show Tender Creation Wizard as integrated view */}
            {showTenderWizard && selectedDemandForTender ? (
                <TenderCreationWizard
                    demandId={selectedDemandForTender.id}
                    onClose={handleCloseTenderWizard}
                    onTenderCreated={handleTenderCreated}
                />
            ) : (
                /* Main Dashboard Content */
                <div>
                    <div>
                        <PageHeader title={PURCHASE_PAGES[activeTab]?.title || 'Purchase'} />

                        {error && (
                            <div className="ui-callout ui-callout--danger mb-4">
                                <div className="text-sm text-red-700">{error}</div>
                            </div>
                        )}

                    <div>

                        <div className="purchase-content">
                            {/* Section Content */}
                            {activeTab === 'demands' && (
                        <div className="ui-panel">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Demands for Purchase review & Excel reports</h2>

                                {demands.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No demands to review.</div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {demands.map((demand) => (
                                            <div key={demand.id} className="ui-card">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-xl font-semibold text-gray-900">
                                                            Demand #{demand.id}
                                                        </h3>
                                                        <p className="text-sm text-gray-600">
                                                            Created by: {demand.created_by_name}
                                                            {demand.creator_department && ` (${demand.creator_department})`}
                                                        </p>
                                                    </div>
                                                    <div className="flex space-x-2">
                                                        {getStatusBadge(demand.status)}
                                                        {getUrgencyBadge(demand.urgency)}
                                                    </div>
                                                </div>

                                                {/* Demand Summary */}
                                                <div className="ui-callout mb-4">
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                                        <div>
                                                            <span className="font-medium text-gray-700">Total Items:</span>
                                                            <span className="ml-2">{demand.items?.length || 1}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Total Est. Cost:</span>
                                                            <span className="ml-2">Rs {demand.items ? getTotalEstimatedCost(demand.items) : demand.estimated_cost}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Required By:</span>
                                                            <span className="ml-2">{formatDate(demand.required_by)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3">
                                                        <span className="font-medium text-gray-700">Description:</span>
                                                        <p className="text-gray-600 mt-1">{demand.description}</p>
                                                    </div>
                                                </div>

                                                {/* Items Display */}
                                                {demand.items && demand.items.length > 0 ? (
                                                    <div className="mb-4">
                                                        <h4 className="font-medium text-gray-900 mb-3">Items requested:</h4>
                                                        <div className="space-y-3">
                                                            {demand.items.map((item, index) => (
                                                                <div key={item.id} className="ui-panel ui-panel--pad">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                                        {item.store_status && (
                                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${item.store_status === 'available' ? 'bg-green-100 text-green-800' :
                                                                                    item.store_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                                                                        'bg-red-100 text-red-800'
                                                                                }`}>
                                                                                {humanize(item.store_status)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                                                                        <div>
                                                                            <span className="font-medium">Quantity:</span> {item.quantity} {item.unit}
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-medium">Est. Cost:</span> Rs {item.estimated_cost}
                                                                        </div>
                                                                        {item.store_available_quantity !== undefined && (
                                                                            <div>
                                                                                <span className="font-medium">Store Available:</span> {item.store_available_quantity} {item.unit}
                                                                            </div>
                                                                        )}
                                                                        {item.stock_in_hand !== undefined && (
                                                                            <div>
                                                                                <span className="font-medium">Stock in Hand:</span> {item.stock_in_hand} {item.unit}
                                                                            </div>
                                                                        )}
                                                                        {item.consumption_type && (
                                                                            <div className="col-span-2">
                                                                                <span className="font-medium">Consumption:</span> {item.consumption_amount} {item.unit} ({item.consumption_type})
                                                                            </div>
                                                                        )}
                                                                        {item.remarks && (
                                                                            <div className="col-span-2 md:col-span-4">
                                                                                <span className="font-medium">Remarks:</span> {item.remarks}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // Fallback for old single-item demands
                                                    <div className="mb-4">
                                                        <h4 className="font-medium text-gray-900 mb-3">Item details:</h4>
                                                        <div className="ui-panel ui-panel--pad">
                                                            <h5 className="font-medium text-gray-900 mb-2">{demand.item_name}</h5>
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-600">
                                                                <div>
                                                                    <span className="font-medium">Quantity:</span> {demand.quantity} {demand.unit || 'pcs'}
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium">Est. Cost:</span> Rs {demand.estimated_cost}
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium">Unit:</span> {demand.unit || 'pcs'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {demand.store_response && (
                                                    <div className="ui-callout mb-4">
                                                        <p className="text-sm font-medium text-gray-900">Store Response:</p>
                                                        <p className="text-sm text-gray-700 mt-1">{demand.store_response}</p>
                                                        <p className="text-xs text-gray-500 mt-2">
                                                            Responded by {demand.store_response_by_name} on {formatDateTime(demand.store_response_at)}
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="flex justify-end space-x-3">
                                                    <button
                                                        onClick={() => downloadDemandReport(demand)}
                                                        className="ui-btn ui-btn--secondary"
                                                    >
                                                        Download Excel report
                                                    </button>
                                                    <button
                                                        onClick={() => handleEvaluate(demand)}
                                                        className="ui-btn ui-btn--primary"
                                                    >
                                                        Create tender
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'pending-tenders' && (
                        <div className="ui-panel">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Tenders pending opening</h2>

                                {pendingTenders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No tenders pending opening at this time.</div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {pendingTenders.map((tender) => (
                                            <div key={tender.id} className="ui-callout ui-callout--warning">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {getTenderDisplayName(tender)}
                                                        </h3>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            {tender.description || tender.item_name}
                                                        </p>
                                                        <div className="mt-1 text-sm text-gray-600">
                                                            <span>Created by: {tender.created_by_name}</span>
                                                            <span className="mx-2">•</span>
                                                            <span>Department: {tender.creator_department}</span>
                                                        </div>
                                                        <div className="mt-2 text-sm text-gray-600">
                                                            <span>Bidding Ended: {formatDateTime(tender.bidding_end_time)}</span>
                                                            <span className="mx-2">•</span>
                                                            <span>Total Bids: {tender.bid_count}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center space-x-3">
                                                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                            Pending Opening
                                                        </span>
                                                        <button
                                                            onClick={() => navigate(`/purchase-department/tender-opening/${tender.id}`)}
                                                            className="ui-btn ui-btn--secondary"
                                                        >
                                                            View details
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenTender(tender.id)}
                                                            disabled={processingTenderIds.includes(tender.id)}
                                                            className={`px-4 py-2 ${processingTenderIds.includes(tender.id)
                                                                ? 'bg-gray-400 cursor-not-allowed' 
                                                                : 'bg-indigo-600 hover:bg-indigo-700'
                                                            } text-white rounded-md text-sm font-medium transition-colors`}
                                                        >
                                                            {processingTenderIds.includes(tender.id)
                                                                ? 'Opening...' 
                                                                : 'Quick Open'
                                                            }
                                                        </button>
                                                    </div>
                                                </div>

                                                {tender.description && (
                                                    <div className="mb-4">
                                                        <p className="text-sm text-gray-700">
                                                            <span className="font-medium">Description:</span> {tender.description}
                                                        </p>
                                                    </div>
                                                )}

                                                {tender.bid_count > 0 && (
                                                    <div className="border-t border-gray-200 pt-4">
                                                        <h4 className="text-sm font-medium text-gray-900 mb-3">
                                                            Submitted bids ({tender.bid_count})
                                                        </h4>
                                                        <div className="space-y-2">
                                                            {tender.bids.map((bid) => (
                                                                <div key={bid.id} className="ui-panel ui-panel--pad flex justify-between items-center">
                                                                    <div className="flex-1">
                                                                        <span className="font-medium text-sm">{bid.company_name}</span>
                                                                        <div className="text-xs text-gray-500">
                                                                            Quantity: {bid.proposed_quantity} | Cost: ${bid.total_cost} | Delivery: {bid.delivery_days} days
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'supply-orders' && (
                        <LetterManagement />
                    )}

                    {activeTab === 'purchase-orders' && (
                        <PurchaseOrdersManagement />
                    )}

                    {/* Financial Opening Tab */}
                    {activeTab === 'financial-opening' && (
                        <div className="space-y-6">
                            {/* Ready for Financial Opening or Financial Grievance */}
                            {readyTenders.length > 0 && (
                                <div className="ui-panel">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            Ready for financial opening
                                        </h2>

                                        <div className="space-y-4">
                                            {readyTenders.map((tender) => (
                                                <div key={tender.id} className="ui-card">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                {getTenderDisplayName(tender)}{tender.is_financially_opened ? ' · opened' : ''}
                                                            </h3>
                                                            <p className="text-sm text-gray-600 mt-1">
                                                                {tender.description || tender.item_name}
                                                            </p>
                                                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                <div>
                                                                    <span className="font-medium text-gray-700">Total Grievances:</span>
                                                                    <span className="ml-2">{tender.grievances_count}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-gray-700">Resolved:</span>
                                                                    <span className="ml-2 text-green-600">{tender.resolved_grievances_count}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-gray-700">Rejected:</span>
                                                                    <span className="ml-2 text-red-600">{tender.rejected_grievances_count}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-gray-700">Items:</span>
                                                                    <span className="ml-2">{tender.items_with_suppliers?.length || 0}</span>
                                                                </div>
                                                            </div>
                                                            {tender.financial_opening && (
                                                                <div className={`mt-2 p-2 rounded border ${
                                                                    tender.is_financially_opened 
                                                                        ? 'bg-green-50 border-green-200' 
                                                                        : 'bg-blue-50 border-blue-200'
                                                                }`}>
                                                                    <p className={`text-sm ${
                                                                        tender.is_financially_opened 
                                                                            ? 'text-green-800' 
                                                                            : 'text-blue-800'
                                                                    }`}>
                                                                        <i className={`fas ${
                                                                            tender.is_financially_opened 
                                                                                ? 'fa-check-circle' 
                                                                                : 'fa-clock'
                                                                        } mr-1`}></i>
                                                                        {tender.is_financially_opened 
                                                                            ? `Financial opening completed: ${formatDateTime(tender.financial_opening.opened_at)}`
                                                                            : `Financial opening scheduled for: ${formatDateTime(tender.financial_opening.scheduled_opening_time)}`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {tender.financial_grievance_details && (
                                                                <div className="ui-callout ui-callout--warning mt-2">
                                                                    <p className="text-sm text-yellow-800">
                                                                        <i className="fas fa-exclamation-triangle mr-1"></i>
                                                                        Financial grievance meeting scheduled: {formatDateTime(tender.financial_grievance_details.meeting_datetime)}
                                                                    </p>
                                                                    <p className="text-xs text-yellow-700 mt-1">
                                                                        Grievance period: 10 days from {formatDate(tender.financial_grievance_details.sent_at)}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="ml-4">
                                                            {(() => {
                                                                const grievanceStatus = getFinancialGrievanceStatus(tender);
                                                                
                                                                switch (grievanceStatus) {
                                                                    case 'not_opened':
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleScheduleFinancialOpening(tender)}
                                                                                className="ui-btn ui-btn--primary"
                                                                            >
                                                                                <i className="fas fa-calendar-plus mr-2"></i>
                                                                                {tender.financial_opening ? 'Reschedule' : 'Schedule'} financial opening
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'ready_for_grievance':
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleInitiateFinancialGrievance(tender)}
                                                                                className="ui-btn ui-btn--primary"
                                                                            >
                                                                                <i className="fas fa-gavel mr-2"></i>
                                                                                Initiate financial grievance
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'meeting_passed':
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleUploadMinutes(tender)}
                                                                                className="ui-btn ui-btn--primary"
                                                                            >
                                                                                <i className="fas fa-upload mr-2"></i>
                                                                                Upload minutes & distribute
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'grievance_initiated':
                                                                        return (
                                                                            <button
                                                                                disabled
                                                                                className="px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed"
                                                                            >
                                                                                <i className="fas fa-clock mr-2"></i>
                                                                                Awaiting meeting time
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'completed':
                                                                        return (
                                                                            <button
                                                                                disabled
                                                                                className="px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed"
                                                                            >
                                                                                <i className="fas fa-check-circle mr-2"></i>
                                                                                Financial complete
                                                                            </button>
                                                                        );
                                                                    
                                                                    default:
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleScheduleFinancialOpening(tender)}
                                                                                className="ui-btn ui-btn--primary"
                                                                            >
                                                                                <i className="fas fa-calendar-plus mr-2"></i>
                                                                                Schedule financial opening
                                                                            </button>
                                                                        );
                                                                }
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Scheduled Financial Openings */}
                            {scheduledOpenings.ready_to_open?.length > 0 && (
                                <div className="ui-panel">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            <i className="fas fa-folder-open mr-2 text-red-600"></i>
                                            Ready to open - time passed
                                        </h2>

                                        <div className="space-y-4">
                                            {scheduledOpenings.ready_to_open.map((opening) => (
                                                <div key={opening.id} className="ui-callout ui-callout--danger">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                {getTenderDisplayName(opening)} - {opening.description || opening.item_name}
                                                            </h3>
                                                            <p className="text-sm text-red-600 mt-1">
                                                                <i className="fas fa-exclamation-triangle mr-1"></i>
                                                                Scheduled time has passed: {formatDateTime(opening.scheduled_opening_time)}
                                                            </p>
                                                        </div>
                                                        <div className="ml-4">
                                                            <button
                                                                onClick={() => handleOpenFinancialBids(opening.tender_id)}
                                                                disabled={processingTenderIds.includes(opening.tender_id)}
                                                                className={`px-4 py-2 ${processingTenderIds.includes(opening.tender_id)
                                                                        ? 'bg-gray-400 cursor-not-allowed'
                                                                        : 'bg-red-600 hover:bg-red-700'
                                                                    } text-white rounded-md focus:outline-none focus:ring-2 focus:ring-red-500`}
                                                            >
                                                                <i className="fas fa-unlock mr-2"></i>
                                                                {processingTenderIds.includes(opening.tender_id)
                                                                    ? 'Processing...'
                                                                    : 'Open Financial Bids'
                                                                }
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Future Scheduled Openings */}
                            {scheduledOpenings.scheduled_future?.length > 0 && (
                                <div className="ui-panel">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            <i className="fas fa-clock mr-2 text-blue-600"></i>
                                            Scheduled for future
                                        </h2>

                                        <div className="space-y-4">
                                            {scheduledOpenings.scheduled_future.map((opening) => (
                                                <div key={opening.id} className="ui-callout">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                {getTenderDisplayName(opening)} - {opening.description || opening.item_name}
                                                            </h3>
                                                            <p className="text-sm text-blue-600 mt-1">
                                                                <i className="fas fa-calendar mr-1"></i>
                                                                Scheduled for: {formatDateTime(opening.scheduled_opening_time)}
                                                            </p>
                                                        </div>
                                                        <div className="ml-4">
                                                            <button
                                                                onClick={() => handleScheduleFinancialOpening({ id: opening.tender_id, ...opening })}
                                                                className="ui-btn ui-btn--primary"
                                                            >
                                                                <i className="fas fa-edit mr-2"></i>
                                                                Reschedule
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}                            {/* No Financial Openings Available */}
                            {readyTenders.length === 0 && (!scheduledOpenings.ready_to_open || scheduledOpenings.ready_to_open.length === 0) && (!scheduledOpenings.scheduled_future || scheduledOpenings.scheduled_future.length === 0) && (
                                <div className="ui-panel">
                                    <div className="px-4 py-12 text-center">
                                        <i className="fas fa-folder-open text-4xl text-gray-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No financial openings available</h3>
                                        <p className="text-gray-600">Resolve all grievances before scheduling a financial opening.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Grievance Management Tab */}
                    {activeTab === 'grievance-management' && (
                <div className="space-y-6">
                    <div className="ui-panel">
                        <div className="px-4 py-5 sm:p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-medium text-gray-900">
                                    <i className="fas fa-exclamation-triangle mr-2 text-yellow-600"></i>
                                    Pending grievance notifications ({pendingGrievances.length})
                                </h2>
                                {pendingGrievances.length > 0 && (
                                    <button
                                        onClick={() => {
                                            const selectedIds = pendingGrievances.map(g => g.id);
                                            const comments = prompt('Enter approval comments (optional):');
                                            if (comments !== null) {
                                                handleBulkApproveGrievances(selectedIds, comments);
                                            }
                                        }}
                                        className="ui-btn ui-btn--primary"
                                    >
                                        <i className="fas fa-check-double mr-2"></i>
                                        Approve all
                                    </button>
                                )}
                            </div>

                            {pendingGrievances.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-gray-500">
                                        <i className="fas fa-check-circle text-4xl text-green-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No pending grievances</h3>
                                        <p>All grievance notifications have been processed.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {pendingGrievances.map((grievance) => (
                                        <div key={grievance.id} className="ui-callout ui-callout--warning">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-gray-900">
                                                        {grievance.tender_title}
                                                    </h3>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        PPRA Reference: {grievance.ppra_reference_number}
                                                    </p>
                                                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                        <div>
                                                            <span className="font-medium text-gray-700">Supplier:</span>
                                                            <span className="ml-2">{grievance.supplier_name}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Contact:</span>
                                                            <span className="ml-2">{grievance.supplier_email}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Item:</span>
                                                            <span className="ml-2">{grievance.item_name}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Submitted:</span>
                                                            <span className="ml-2">{formatDateTime(grievance.created_at)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex space-x-3">
                                                    <button
                                                        onClick={() => {
                                                            const comments = prompt('Enter approval comments (optional):');
                                                            if (comments !== null) {
                                                                handleApproveGrievance(grievance.id, comments);
                                                            }
                                                        }}
                                                        className="ui-btn ui-btn--primary"
                                                    >
                                                        <i className="fas fa-check mr-2"></i>
                                                        Approve & send
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const comments = prompt('Enter rejection reason:');
                                                            if (comments !== null && comments.trim() !== '') {
                                                                handleRejectGrievance(grievance.id, comments);
                                                            }
                                                        }}
                                                        className="ui-btn ui-btn--danger-solid"
                                                    >
                                                        <i className="fas fa-times mr-2"></i>
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="border-t border-yellow-300 pt-3">
                                                <h4 className="font-medium text-gray-900 mb-2">Rejection reason:</h4>
                                                <p className="text-gray-700 bg-white p-3 rounded border">
                                                    {grievance.rejection_reason}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    <i className="fas fa-info-circle mr-1"></i>
                                                    Approving will send a grievance notification email to the supplier. Rejecting will prevent the notification.
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* All Grievances History */}
                    <div className="ui-panel">
                        <div className="px-4 py-5 sm:p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">
                                <i className="fas fa-history mr-2 text-blue-600"></i>
                                All grievances history
                            </h2>

                            {allGrievances.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="text-gray-500">No grievance records found.</div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="ui-table">
                                        <thead>
                                            <tr>
                                                <th className="text-left">
                                                    Tender & supplier
                                                </th>
                                                <th className="text-left">
                                                    Item & reason
                                                </th>
                                                <th className="text-left">
                                                    Status
                                                </th>
                                                <th className="text-left">
                                                    Review details
                                                </th>
                                                <th className="text-left">
                                                    Date
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allGrievances.map((grievance) => (
                                                <tr key={grievance.id} className="hover:bg-gray-50">
                                                    <td className="whitespace-nowrap">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {grievance.tender_title}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                {grievance.supplier_name}
                                                            </div>
                                                            <div className="text-xs text-gray-400">
                                                                {grievance.supplier_email}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {grievance.item_name}
                                                            </div>
                                                            <div className="text-sm text-gray-600 mt-1">
                                                                {grievance.rejection_reason}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap">
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                            grievance.status === 'pending' 
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : grievance.status === 'approved'
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {humanize(grievance.status)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {grievance.reviewed_by && (
                                                            <div className="text-sm text-gray-900">
                                                                <div>By: {grievance.reviewed_by}</div>
                                                                {grievance.reviewed_at && (
                                                                    <div className="text-xs text-gray-500">
                                                                        {formatDateTime(grievance.reviewed_at)}
                                                                    </div>
                                                                )}
                                                                {grievance.approval_comments && (
                                                                    <div className="text-xs text-gray-600 mt-1">
                                                                        {grievance.approval_comments}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="whitespace-nowrap">
                                                        {formatDate(grievance.created_at)}
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
            )}

            {/* Pre-Bid Meetings Tab */}
            {activeTab === 'pre-bid-meetings' && (
                <PreBidMeetingManagement />
            )}

            {/* Vetting Management Tab */}
            {activeTab === 'vetting-management' && (
                <TenderVettingManagement />
            )}

            {/* Market Survey Tab */}
            {activeTab === 'market-survey' && (
                <div className="ui-panel">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-medium text-gray-900">
                                <i className="fas fa-chart-line mr-2"></i>
                                Market survey management
                            </h3>
                            <button
                                onClick={() => {
                                    fetchMarketSurveyTenders();
                                    fetchCompletedSurveys();
                                }}
                                className="ui-btn ui-btn--secondary"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Refresh
                            </button>
                        </div>

                        {marketSurveyTenders.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-chart-line text-gray-400 text-4xl mb-4"></i>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No active tenders</h3>
                                <p className="text-gray-500">There are no active tenders available for market survey.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="ui-table">
                                    <thead>
                                        <tr>
                                            <th className="text-left">
                                                Tender details
                                            </th>
                                            <th className="text-left">
                                                Item information
                                            </th>
                                            <th className="text-left">
                                                Deadline
                                            </th>
                                            <th className="text-left">
                                                Survey status
                                            </th>
                                            <th className="text-left">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {marketSurveyTenders.map((tender) => (
                                            <tr key={tender.id} className="hover:bg-gray-50">
                                                <td className="whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {tender.tender_number || `Tender #${tender.id}`}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Status: {tender.status}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {tender.item_name}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Qty: {tender.quantity}
                                                    </div>
                                                    <div className="text-sm text-gray-500 max-w-xs truncate">
                                                        {tender.description}
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {formatDate(tender.bidding_end_time)}
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {tender.survey_status ? (
                                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                            tender.survey_status === 'completed' 
                                                                ? 'bg-green-100 text-green-800'
                                                                : tender.survey_status === 'pending'
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {tender.survey_status === 'completed' ? 'Completed' : 
                                                             tender.survey_status === 'pending' ? 'Pending' : 'Unknown'}
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                                            Not Sent
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {!tender.survey_status ? (
                                                        <button
                                                            onClick={() => handleSendForMarketSurvey(tender)}
                                                            className="ui-btn ui-btn--primary"
                                                        >
                                                            <i className="fas fa-paper-plane mr-1"></i>
                                                            Send for market survey
                                                        </button>
                                                    ) : tender.survey_status === 'completed' ? (
                                                        <span className="text-green-600 font-medium">
                                                            <i className="fas fa-check-circle mr-1"></i>
                                                            Survey Completed
                                                        </span>
                                                    ) : (
                                                        <span className="text-yellow-600 font-medium">
                                                            <i className="fas fa-clock mr-1"></i>
                                                            Survey Pending
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Completed Surveys Section */}
                        <div className="mt-8">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">
                                <i className="fas fa-check-circle mr-2"></i>
                                Completed market surveys
                            </h4>
                            
                            {completedSurveys.length === 0 ? (
                                <div className="ui-callout text-center">
                                    <i className="fas fa-clipboard-check text-gray-400 text-3xl mb-3"></i>
                                    <p className="text-gray-500">No completed market surveys yet.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="ui-table">
                                        <thead>
                                            <tr>
                                                <th className="text-left">
                                                    Tender details
                                                </th>
                                                <th className="text-left">
                                                    Item information
                                                </th>
                                                <th className="text-left">
                                                    Survey details
                                                </th>
                                                <th className="text-left">
                                                    Evaluation documents
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completedSurveys.map((survey) => (
                                                <tr key={survey.survey_id} className="hover:bg-gray-50">
                                                    <td className="whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            Tender #{survey.tender_id}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Sent: {formatDate(survey.sent_at)}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Completed: {formatDate(survey.completed_at)}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {survey.item_name}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Qty: {survey.quantity}
                                                        </div>
                                                        <div className="text-sm text-gray-500 max-w-xs truncate">
                                                            {survey.description}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="text-sm text-gray-900">
                                                            <strong>Sent by:</strong> {survey.sent_by_name}
                                                        </div>
                                                        {survey.completed_by_name && (
                                                            <div className="text-sm text-gray-900">
                                                                <strong>Completed by:</strong> {survey.completed_by_name}
                                                            </div>
                                                        )}
                                                        {survey.notes && (
                                                            <div className="text-sm text-gray-600 mt-1 max-w-xs">
                                                                <strong>Notes:</strong> {survey.notes}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {survey.documents && survey.documents.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {survey.documents
                                                                    .filter(doc => doc.document_type === 'evaluation')
                                                                    .map((doc) => (
                                                                    <div key={doc.id} className="flex items-center">
                                                                        <button
                                                                            onClick={() => downloadMarketSurveyDocument(doc.id, doc.original_filename)}
                                                                            className="ui-btn ui-btn--ghost ui-btn--sm"
                                                                        >
                                                                            <i className="fas fa-download mr-1"></i>
                                                                            {doc.original_filename}
                                                                        </button>
                                                                        <span className="ml-2 px-2 py-1 text-xs bg-green-100 rounded">
                                                                            Evaluation
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                                {survey.documents
                                                                    .filter(doc => doc.document_type === 'supporting')
                                                                    .map((doc) => (
                                                                    <div key={doc.id} className="flex items-center">
                                                                        <button
                                                                            onClick={() => downloadMarketSurveyDocument(doc.id, doc.original_filename)}
                                                                            className="ui-btn ui-btn--ghost ui-btn--sm"
                                                                        >
                                                                            <i className="fas fa-paperclip mr-1"></i>
                                                                            {doc.original_filename}
                                                                        </button>
                                                                        <span className="ml-2 px-2 py-1 text-xs bg-blue-100 rounded">
                                                                            Supporting
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm text-gray-400">No documents</span>
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
                </div>
            )}

            {/* Tender Management Tab: tenders still in approval or bidding */}
            {activeTab === 'tender-management' && (
                <Panel
                    title="Live tenders"
                    actions={<Button size="sm" icon={<ArrowsClockwise size={15} />} onClick={fetchManagableTenders}>Refresh</Button>}
                    flush
                >
                    {loading ? (
                        <LoadingBlock />
                    ) : managableTenders.length === 0 ? (
                        <EmptyState icon={<Hourglass size={26} />} title="No live tenders" />
                    ) : (
                        <ul className="tender-list">
                            {managableTenders.map((tender) => {
                                const bidding = ['active', 'published'].includes(tender.tender_status);
                                const canChangeDeadline = (bidding || tender.tender_status === 'pending_opening') && !tender.opened_at;
                                return (
                                    <li key={tender.id} className="tender-row">
                                        <div className="tender-row__main">
                                            <div className="tender-row__title">
                                                <h3>{tender.item_name}</h3>
                                                <TenderStatus status={tender.tender_status} />
                                            </div>
                                            <p className="tender-row__meta">
                                                {[tender.tender_number || `Tender #${tender.id}`, tender.quantity && `Qty ${tender.quantity}`, `Created ${formatDate(tender.created_at)}`].filter(Boolean).join(' · ')}
                                            </p>
                                            {tender.time_extension_reason && (
                                                <p className="tender-row__desc">
                                                    Deadline changed {formatDateTime(tender.time_extension_at)}{tender.extension_by_name ? ` by ${tender.extension_by_name}` : ''}: {tender.time_extension_reason}
                                                </p>
                                            )}
                                            <TenderProgress status={tender.tender_status} className="tender-row__progress" />
                                        </div>
                                        <div className="tender-row__side">
                                            <span className="tender-row__deadline">Closes {formatDateTime(tender.bidding_end_time)}</span>
                                            {bidding && <Countdown until={tender.bidding_end_time} />}
                                            <div className="ui-actions">
                                                {tender.tender_status === 'vetting_approved' && (
                                                    <Button size="sm" variant="primary" onClick={() => submitForFinanceApproval(tender)}>Send to Finance & MS</Button>
                                                )}
                                                {canChangeDeadline && <Button size="sm" onClick={() => handleTimeExtension(tender)}>Change deadline</Button>}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            )}

                        </div>{/* End Content Area */}
                    </div>{/* End Sidebar + Content */}
                </div>
            </div>
            )}

            {/* Bidding deadline change */}
            <Modal
                show={showTimeExtensionModal && Boolean(selectedTenderForExtension)}
                onClose={() => setShowTimeExtensionModal(false)}
                title="Change bidding deadline"
                size="sm"
                footer={(
                    <>
                        <Button onClick={() => setShowTimeExtensionModal(false)}>Cancel</Button>
                        <Button variant="primary" type="submit" form="deadline-form">Save</Button>
                    </>
                )}
            >
                <form id="deadline-form" className="ui-form" onSubmit={(e) => { e.preventDefault(); submitTimeExtension(); }}>
                    <p className="ui-hint">
                        {selectedTenderForExtension?.item_name}: closes {formatDateTime(selectedTenderForExtension?.bidding_end_time)}
                    </p>
                    <label className="ui-field">
                        <span className="ui-label">New deadline (Pakistan time)</span>
                        <input
                            type="datetime-local"
                            className="ui-input"
                            min={inputValueFromNow(2)}
                            value={timeExtensionForm.newBiddingEndTime}
                            onChange={(e) => setTimeExtensionForm((f) => ({ ...f, newBiddingEndTime: e.target.value }))}
                            required
                        />
                    </label>
                    <div className="ui-actions">
                        {[1, 3, 7].map((days) => (
                            <Button
                                key={days}
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    const base = Math.max(Date.now(), toDate(selectedTenderForExtension?.bidding_end_time)?.getTime() || 0);
                                    setTimeExtensionForm((f) => ({ ...f, newBiddingEndTime: toInputValue(base + days * 86_400_000) }));
                                }}
                            >
                                +{days} {days === 1 ? 'day' : 'days'}
                            </Button>
                        ))}
                    </div>
                    <label className="ui-field">
                        <span className="ui-label">Reason</span>
                        <textarea
                            className="ui-input ui-textarea"
                            rows={3}
                            value={timeExtensionForm.reason}
                            onChange={(e) => setTimeExtensionForm((f) => ({ ...f, reason: e.target.value }))}
                            required
                        />
                    </label>
                </form>
            </Modal>

            {/* Evaluation Modal */}
            {showEvaluationModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Purchase review: demand #{selectedDemand?.id}
                        </h3>

                        <form onSubmit={handleEvaluationSubmit}>
                            {/* Show all items in the demand */}
                            {selectedDemand?.items && selectedDemand.items.length > 0 ? (
                                <div className="mb-6">
                                    <h4 className="font-medium text-gray-900 mb-3">Items in this demand:</h4>
                                    <div className="space-y-3 max-h-60 overflow-y-auto">
                                        {selectedDemand.items.map((item, index) => (
                                            <div key={item.id} className="ui-callout">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                    {item.store_status && (
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${item.store_status === 'available' ? 'bg-green-100 text-green-800' :
                                                                item.store_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-red-100 text-red-800'
                                                            }`}>
                                                            {humanize(item.store_status)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-600">
                                                    <div>
                                                        <span className="font-medium">Requested:</span> {item.quantity} {item.unit}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Est. Cost:</span> Rs {item.estimated_cost}
                                                    </div>
                                                    {item.store_available_quantity !== undefined && (
                                                        <div>
                                                            <span className="font-medium">Store Available:</span> {item.store_available_quantity} {item.unit}
                                                        </div>
                                                    )}
                                                </div>
                                                {item.remarks && (
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        <span className="font-medium">Remarks:</span> {item.remarks}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                // Fallback for old single-item demands
                                <div className="mb-6">
                                    <h4 className="font-medium text-gray-900 mb-3">Item details:</h4>
                                    <div className="ui-callout">
                                        <h5 className="font-medium text-gray-900 mb-2">{selectedDemand?.item_name}</h5>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                                            <div>
                                                <span className="font-medium">Quantity:</span> {selectedDemand?.quantity} {selectedDemand?.unit || 'pcs'}
                                            </div>
                                            <div>
                                                <span className="font-medium">Est. Cost:</span> Rs {selectedDemand?.estimated_cost}
                                            </div>
                                            <div>
                                                <span className="font-medium">Unit:</span> {selectedDemand?.unit || 'pcs'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Demand Details (Editable) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div className="md:col-span-2">
                                    <label className="ui-label block">Description</label>
                                    <textarea
                                        name="demand_description"
                                        value={evaluationForm.updatedDemand.description}
                                        onChange={handleFormChange}
                                        rows={3}
                                        className="ui-input ui-textarea mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="ui-label block">Urgency</label>
                                    <select
                                        name="demand_urgency"
                                        value={evaluationForm.updatedDemand.urgency}
                                        onChange={handleFormChange}
                                        className="ui-input mt-1"
                                    >
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="ui-label block">Required by</label>
                                    <input
                                        type="date"
                                        name="demand_required_by"
                                        value={evaluationForm.updatedDemand.required_by}
                                        onChange={handleFormChange}
                                        className="ui-input mt-1"
                                    />
                                </div>
                            </div>

                            {/* Evaluation Decision */}
                            <div className="mb-4">
                                <label className="ui-label block">Purchase decision</label>
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
                                        <span className="ml-2 text-sm text-gray-700">Approve for Purchase</span>
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
                                        <span className="ml-2 text-sm text-gray-700">Reject Purchase</span>
                                    </label>
                                </div>
                            </div>                            {/* Bidding Expiry Time (only for approved) */}
                            {evaluationForm.status === 'approved' && (
                                <div className="mb-6">
                                    <label className="ui-label block">
                                        Bidding expiry date & time <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="biddingExpiryTime" value={evaluationForm.biddingExpiryTime}
                                        onChange={handleFormChange}
                                        min={inputValueFromNow(1)}
                                        className="ui-input mt-1"
                                        required
                                    />
                                    <p className="mt-1 text-sm text-gray-500">
                                        Pakistan time, at least 2 minutes from now.
                                    </p>
                                </div>
                            )}

                            {/* Comments */}
                            <div className="mb-6">
                                <label className="ui-label block">
                                    Comments {evaluationForm.status === 'rejected' && <span className="text-red-500">*</span>}
                                </label>
                                <textarea
                                    name="comments"
                                    value={evaluationForm.comments}
                                    onChange={handleFormChange}
                                    rows={3}
                                    placeholder={evaluationForm.status === 'rejected' ? 'Please provide reason for purchase rejection' : 'Optional comments about the purchase decision'}
                                    className="ui-input ui-textarea mt-1"
                                />
                            </div>

                            {/* File Uploads (only for approved) */}
                            {evaluationForm.status === 'approved' && (
                                <div className="mb-6">
                                    <h4 className="font-medium text-gray-900 mb-3">Required documents:</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="ui-label block">
                                                Tender document (PDF) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="file"
                                                name="tenderDocument"
                                                accept=".pdf"
                                                onChange={handleFileChange}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                required
                                            />
                                            <p className="mt-1 text-sm text-gray-500">
                                                Upload the tender document as a PDF file.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="ui-label block">
                                                Items list (Excel/CSV) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="file"
                                                name="itemsList"
                                                accept=".xls,.xlsx,.csv"
                                                onChange={handleFileChange}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                                required
                                            />
                                            <p className="mt-1 text-sm text-gray-500">
                                                Upload the items list as an Excel (.xls, .xlsx) or CSV file.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowEvaluationModal(false)}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ui-btn ui-btn--primary"
                                >
                                    Submit review
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--sm text-center">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Evaluation submitted!</h3>
                            <p className="text-gray-600 mb-4">Review submitted.</p>
                            <p className="text-sm text-gray-500">Redirecting to dashboard in 3 seconds...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Financial Opening Schedule Modal */}
            {showFinancialScheduleModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Schedule financial opening: {selectedTender?.tender_number || `tender #${selectedTender?.id}`}
                            </h3>
                            <button
                                onClick={() => setShowFinancialScheduleModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="ui-callout mb-6">
                                <h4 className="font-medium mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="font-medium text-gray-700">Total Grievances:</span> {selectedTender.grievances_count}
                                    </div>
                                    <div>
                                        <span className="font-medium text-gray-700">Resolved:</span> {selectedTender.resolved_grievances_count}
                                    </div>
                                    <div>
                                        <span className="font-medium text-gray-700">Rejected:</span> {selectedTender.rejected_grievances_count}
                                    </div>
                                    <div>
                                        <span className="font-medium text-gray-700">Items:</span> {selectedTender.items_with_suppliers?.length || 0}
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleScheduleSubmit}>
                            {error && (
                                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                    {error}
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Financial opening date & time (Pakistan time) *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={scheduleForm.openingDateTime}
                                    min={inputValueFromNow(1)}
                                    onChange={(e) => setScheduleForm({ ...scheduleForm, openingDateTime: e.target.value })}
                                    className="ui-input"
                                    required
                                />
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowFinancialScheduleModal(false)}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ui-btn ui-btn--primary"
                                >
                                    <i className="fas fa-calendar-plus mr-2"></i>
                                    Schedule opening
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financial Grievance Modal */}
            {showFinancialGrievanceModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Initiate financial grievance - {getTenderDisplayName(selectedTender)}
                            </h3>
                            <button
                                onClick={() => setShowFinancialGrievanceModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="ui-callout mb-6">
                                <h4 className="font-medium mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="font-medium">Financial Opening:</span> Completed
                                    </div>
                                    <div>
                                        <span className="font-medium">Approved Suppliers:</span> {selectedTender.approved_suppliers_count || 'Multiple'}
                                    </div>
                                </div>
                                <div className="ui-callout ui-callout--warning mt-2">
                                    <p className="text-sm text-yellow-800">
                                        <i className="fas fa-info-circle mr-1"></i>
                                        This will send financial grievance notifications to all approved suppliers with the financial opening report.
                                        The grievance period will be 10 days from the notification date.
                                    </p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleFinancialGrievanceSubmit}>
                            {error && (
                                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                    {error}
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Grievance meeting date & time (Pakistan time) *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={financialGrievanceForm.meetingDateTime}
                                    min={inputValueFromNow(1)}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingDateTime: e.target.value 
                                    })}
                                    className="ui-input"
                                    required
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    Pakistan time. Included in the email to suppliers.
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Meeting location
                                </label>
                                <input
                                    type="text"
                                    value={financialGrievanceForm.meetingLocation}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingLocation: e.target.value 
                                    })}
                                    className="ui-input"
                                    placeholder="Conference Room - Rawalpindi Institute of Cardiology"
                                />
                            </div>

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Additional message (optional)
                                </label>
                                <textarea
                                    value={financialGrievanceForm.customMessage}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        customMessage: e.target.value 
                                    })}
                                    rows={4}
                                    className="ui-input ui-textarea"
                                    placeholder="Any additional instructions or information for suppliers regarding the financial grievance..."
                                />
                            </div>

                            <div className="ui-callout mb-6">
                                <h5 className="font-medium mb-2">Email content preview:</h5>
                                <div className="text-sm">
                                    <p className="mb-2">
                                        <strong>Subject:</strong> Financial Grievance Period - {getTenderDisplayName(selectedTender)} - Rawalpindi Institute of Cardiology
                                    </p>
                                    <div className="ui-panel ui-panel--pad">
                                        <p>Dear Supplier,</p>
                                        <p className="mt-2">
                                            This is to inform you that the financial opening for {getTenderDisplayName(selectedTender)} has been completed.
                                            The financial opening report is attached for your review.
                                        </p>
                                        <p className="mt-2">
                                            <strong>Financial Grievance Period:</strong> 10 days from the date of this email<br/>
                                            <strong>Meeting Date:</strong> {financialGrievanceForm.meetingDateTime ? formatDateTime(financialGrievanceForm.meetingDateTime) : '[To be scheduled]'}<br/>
                                            <strong>Location:</strong> {financialGrievanceForm.meetingLocation || 'Conference Room - Rawalpindi Institute of Cardiology'}
                                        </p>
                                        {financialGrievanceForm.customMessage && (
                                            <p className="mt-2">
                                                <strong>Additional Information:</strong><br/>
                                                {financialGrievanceForm.customMessage}
                                            </p>
                                        )}
                                        <p className="mt-2">
                                            If you have any grievances regarding the financial evaluation, please submit them within the grievance period.
                                            After the meeting, minutes will be distributed to all suppliers.
                                        </p>
                                        <p className="mt-2">
                                            Best regards,<br/>
                                            Purchase Department<br/>
                                            Rawalpindi Institute of Cardiology
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowFinancialGrievanceModal(false)}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ui-btn ui-btn--primary"
                                >
                                    <i className="fas fa-paper-plane mr-2"></i>
                                    Send financial grievances
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financial Grievance Modal */}
            {showFinancialGrievanceModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Initiate financial grievance - {getTenderDisplayName(selectedTender)}
                            </h3>
                            <button
                                onClick={() => setShowFinancialGrievanceModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="ui-callout mb-6">
                                <h4 className="font-medium mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                <div className="text-sm">
                                    <p className="mb-2">
                                        <i className="fas fa-info-circle mr-2"></i>
                                        This will send financial grievance notifications to all approved suppliers
                                    </p>
                                    <p className="text-xs">
                                        Suppliers will have 10 days from the notification date to submit grievances before the scheduled meeting.
                                    </p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleFinancialGrievanceSubmit}>
                            {error && (
                                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                    {error}
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Grievance meeting date & time *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={financialGrievanceForm.meetingDateTime}
                                    min={inputValueFromNow(1)}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingDateTime: e.target.value 
                                    })}
                                    className="ui-input"
                                    required
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    Select when the grievance meeting should be held (must be at least 10 days from now)
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Meeting location *
                                </label>
                                <input
                                    type="text"
                                    value={financialGrievanceForm.meetingLocation}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingLocation: e.target.value 
                                    })}
                                    className="ui-input"
                                    placeholder="Conference Room - Rawalpindi Institute of Cardiology"
                                    required
                                />
                            </div>

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Additional message (optional)
                                </label>
                                <textarea
                                    value={financialGrievanceForm.customMessage}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        customMessage: e.target.value 
                                    })}
                                    rows={3}
                                    className="ui-input ui-textarea"
                                    placeholder="Any additional instructions or information for suppliers..."
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    This message will be included in the email sent to suppliers along with the financial opening report
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowFinancialGrievanceModal(false)}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ui-btn ui-btn--primary"
                                >
                                    <i className="fas fa-gavel mr-2"></i>
                                    Send financial grievances
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Upload Minutes Modal */}
            {showUploadMinutesModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Upload meeting minutes - {getTenderDisplayName(selectedTender)}
                            </h3>
                            <button
                                onClick={() => setShowUploadMinutesModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="ui-callout mb-6">
                                <h4 className="font-medium mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                {selectedTender.financial_grievance_details && (
                                    <div className="text-sm">
                                        <p className="mb-1">
                                            <i className="fas fa-calendar-check mr-2"></i>
                                            Meeting was scheduled for: {formatDateTime(selectedTender.financial_grievance_details.meeting_datetime)}
                                        </p>
                                        <p className="mb-2">
                                            <i className="fas fa-map-marker-alt mr-2"></i>
                                            Location: {selectedTender.financial_grievance_details.meeting_location}
                                        </p>
                                        <p className="text-xs">
                                            Meeting time has passed. Please upload the meeting minutes and distribute to all suppliers.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <form onSubmit={handleUploadMinutesSubmit}>
                            {error && (
                                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                    {error}
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Meeting minutes file *
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    onChange={(e) => setMinutesForm({ 
                                        ...minutesForm, 
                                        minutesFile: e.target.files[0] 
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    required
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    Upload the meeting minutes document (PDF, DOC, or DOCX format)
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="ui-label block mb-2">
                                    Distribution message (optional)
                                </label>
                                <textarea
                                    value={minutesForm.distributionMessage}
                                    onChange={(e) => setMinutesForm({ 
                                        ...minutesForm, 
                                        distributionMessage: e.target.value 
                                    })}
                                    rows={3}
                                    className="ui-input ui-textarea"
                                    placeholder="Any additional message to include with the meeting minutes distribution..."
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    This message will be included in the email sent to all suppliers along with the meeting minutes
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowUploadMinutesModal(false)}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ui-btn ui-btn--primary"
                                >
                                    <i className="fas fa-upload mr-2"></i>
                                    Upload & distribute minutes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Market Survey Modal */}
            {showMarketSurveyModal && selectedMarketSurveyTender && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">
                                <i className="fas fa-chart-line mr-2"></i>
                                Send for market survey
                            </h3>
                            <button
                                onClick={() => setShowMarketSurveyModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="ui-callout mb-4">
                            <p className="text-sm font-medium text-gray-900">
                                {selectedMarketSurveyTender.tender_number || `Tender #${selectedMarketSurveyTender.id}`}
                            </p>
                            <p className="text-sm text-gray-600">{selectedMarketSurveyTender.item_name}</p>
                            <p className="text-xs text-gray-500">Quantity: {selectedMarketSurveyTender.quantity}</p>
                        </div>

                        <form onSubmit={handleMarketSurveySubmit}>
                            <div className="mb-4">
                                <label className="ui-label block mb-2">
                                    Notes <span className="text-gray-500">(Optional)</span>
                                </label>
                                <textarea
                                    value={marketSurveyForm.notes}
                                    onChange={(e) => setMarketSurveyForm(prev => ({ ...prev, notes: e.target.value }))}
                                    rows={3}
                                    className="ui-input ui-textarea"
                                    placeholder="Add any specific instructions or requirements for the market survey..."
                                />
                            </div>

                            <div className="mb-4">
                                <label className="ui-label block mb-2">
                                    Supporting documents <span className="text-gray-500">(Optional)</span>
                                </label>
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                                    onChange={handleMarketSurveyDocumentChange}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    You can upload multiple files (PDF, Word, Excel, Images). Maximum 10 files.
                                </p>
                                {marketSurveyForm.documents.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-sm font-medium text-gray-700">Selected files:</p>
                                        <ul className="text-xs text-gray-600">
                                            {Array.from(marketSurveyForm.documents).map((file, index) => (
                                                <li key={index}>• {file.name}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowMarketSurveyModal(false);
                                        setMarketSurveyForm({ notes: '', documents: [] });
                                    }}
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="ui-btn ui-btn--primary"
                                >
                                    <i className="fas fa-paper-plane mr-2"></i>
                                    Send for market survey
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financial Opening Results Modal */}
            {showFinancialOpeningModal && financialOpeningData && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">
                                Financial opening results - tender {financialOpeningData.tender?.id}
                            </h3>
                            <button
                                onClick={() => setShowFinancialOpeningModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="mb-6">
                            <div className="ui-callout">
                                <h4 className="font-medium mb-2">
                                    <i className="fas fa-trophy mr-2"></i>
                                    Financial bids opened & tender automatically awarded!
                                </h4>
                                <p className="text-sm mb-2">
                                    Opened at: {formatDateTime(financialOpeningData.opened_at)}
                                </p>
                                {financialOpeningData.awarded && (
                                    <div className="ui-callout mt-3">
                                        <h5 className="font-medium mb-2">
                                            <i className="fas fa-check-circle mr-2"></i>
                                            Automatic award summary:
                                        </h5>
                                        <p className="text-sm mb-2">
                                            • Tender automatically awarded to optimal supplier combination (lowest cost + best delivery)
                                        </p>
                                        <p className="text-sm mb-2">
                                            • Supply orders created and emails sent to winning suppliers with PDF attachments
                                        </p>
                                        <p className="text-sm">
                                            • {financialOpeningData.supply_orders?.length || 0} supply order(s) generated - check Supply Orders tab
                                        </p>
                                    </div>
                                )}
                                {financialOpeningData.report_file && (
                                    <button
                                        onClick={() => downloadFinancialOpeningReport(financialOpeningData.report_file)}
                                        className="ui-btn ui-btn--secondary ui-btn--sm mt-3"
                                    >
                                        <i className="fas fa-download mr-1"></i>
                                        Download full report
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Optimal Combinations */}
                        <div className="mb-6">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">
                                <i className="fas fa-trophy mr-2 text-yellow-500"></i>
                                Top optimal supplier combinations ({financialOpeningData.optimal_combinations?.length || 0} total)
                            </h4>
                            <div className="space-y-3">
                                {financialOpeningData.optimal_combinations?.slice(0, 5).map((combo, index) => (
                                    <div key={index} className={`border rounded-lg p-4 ${index === 0 ? 'border-yellow-300 bg-yellow-50' :
                                            index === 1 ? 'border-gray-300 bg-gray-50' :
                                                index === 2 ? 'border-orange-300 bg-orange-50' :
                                                    'border-gray-200'
                                        }`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center mb-2">
                                                    <span className={`text-lg font-bold mr-2 ${index === 0 ? 'text-yellow-600' :
                                                            index === 1 ? 'text-gray-600' :
                                                                index === 2 ? 'text-orange-600' :
                                                                    'text-gray-500'
                                                        }`}>
                                                        #{index + 1}
                                                    </span>
                                                    {index === 0 && <i className="fas fa-crown text-yellow-500 mr-1"></i>}
                                                    <span className="font-medium">
                                                        Total Cost: Rs {combo.total_cost.toLocaleString()}
                                                    </span>
                                                    <span className="ml-4 text-sm text-gray-600">
                                                        Avg Delivery: {combo.average_delivery_time} days
                                                    </span>
                                                    <span className="ml-4 text-xs bg-blue-100 px-2 py-1 rounded">
                                                        {combo.items_count || combo.suppliers?.length || 0} items
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-700 mb-2">
                                                    <strong>Companies in this combination:</strong>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {combo.suppliers?.map((supplier, supplierIndex) => (
                                                        <div key={supplierIndex} className="ui-panel ui-panel--pad flex justify-between items-center">
                                                            <div className="flex-1">
                                                                <span className="font-medium text-gray-900">{supplier.item_name}</span>
                                                                <span className="mx-2 text-gray-500">→</span>
                                                                <span className="text-blue-600">{supplier.company_name}</span>
                                                            </div>
                                                            <div className="text-right text-sm">
                                                                <div className="font-medium">Rs {supplier.total_cost?.toLocaleString()}</div>
                                                                <div className="text-gray-500">{supplier.delivery_days} days</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {financialOpeningData.optimal_combinations?.length > 5 && (
                                    <div className="text-center text-sm text-gray-500 py-2">
                                        ... and {financialOpeningData.optimal_combinations.length - 5} more combinations available in Excel report
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Item-wise Supplier Details */}
                        <div className="mb-6">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">
                                <i className="fas fa-list mr-2 text-blue-500"></i>
                                Item-wise approved suppliers
                            </h4>
                            <div className="space-y-4">
                                {financialOpeningData.items_with_suppliers?.map((itemCombo, index) => (
                                    <div key={index} className="ui-card">
                                        <h5 className="font-medium text-gray-900 mb-3">
                                            {itemCombo.item.item_name}
                                        </h5>
                                        <div className="overflow-x-auto">
                                            <table className="ui-table">
                                                <thead>
                                                    <tr>
                                                        <th className="text-left">Company</th>
                                                        <th className="text-left">Total cost</th>
                                                        <th className="text-left">Delivery days</th>
                                                        <th className="text-left">Contact</th>
                                                        <th className="text-left">Documents</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {itemCombo.approved_suppliers.map((supplier, supplierIndex) => (
                                                        <tr key={supplierIndex} className={supplierIndex === 0 ? 'bg-green-50' : ''}>
                                                            <td>
                                                                <div>
                                                                    <div className="font-medium text-gray-900">{supplier.company_name}</div>
                                                                    {supplierIndex === 0 && (
                                                                        <span className="text-xs text-green-600 font-medium">LOWEST BID</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                Rs {(supplier.item_total_cost || supplier.total_cost).toLocaleString()}
                                                            </td>
                                                            <td>
                                                                {supplier.delivery_days} days
                                                            </td>
                                                            <td>
                                                                {supplier.company_email}
                                                            </td>
                                                            <td>
                                                                <div className="flex flex-col space-y-1">
                                                                    <button
                                                                        onClick={() => downloadTechnicalBid(supplier.bid_id, supplier.company_name)}
                                                                        className="ui-btn ui-btn--ghost ui-btn--sm"
                                                                    >
                                                                        <i className="fas fa-download mr-1"></i>
                                                                        Technical bid
                                                                    </button>
                                                                    <button
                                                                        onClick={() => downloadFinancialBid(supplier.bid_id, supplier.company_name)}
                                                                        className="ui-btn ui-btn--ghost ui-btn--sm"
                                                                    >
                                                                        <i className="fas fa-download mr-1"></i>
                                                                        Financial bid
                                                                    </button>
                                                                    <button
                                                                        onClick={() => downloadBidCdrDocument(supplier.bid_id, supplier.company_name)}
                                                                        className="ui-btn ui-btn--ghost ui-btn--sm"
                                                                    >
                                                                        <i className="fas fa-download mr-1"></i>
                                                                        Bid CDR 2%
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowFinancialOpeningModal(false)}
                                className="ui-btn ui-btn--secondary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PurchaseDepartment;
