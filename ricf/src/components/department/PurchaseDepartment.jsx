import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api, { apiUrl } from '../../config/api';
import { generateDemandReport } from '../../utils/excelReportGenerator';
import TenderCreationWizard from '../purchase/TenderCreationWizard';
import PreBidMeetingManagement from '../purchase/PreBidMeetingManagement';
import LetterManagement from '../purchase/LetterManagement';
import TenderVettingManagement from '../purchase/TenderVettingManagement';
import PurchaseOrdersManagement from '../purchase/PurchaseOrdersManagement';

const PurchaseDepartment = () => {
    const navigate = useNavigate();
    const [demands, setDemands] = useState([]);
    const [supplyOrders, setSupplyOrders] = useState([]);
    const [readyTenders, setReadyTenders] = useState([]);
    const [scheduledOpenings, setScheduledOpenings] = useState([]);
    const [pendingTenders, setPendingTenders] = useState([]);
    const [pendingGrievances, setPendingGrievances] = useState([]);
    const [allGrievances, setAllGrievances] = useState([]);
    const [selectedDemand, setSelectedDemand] = useState(null);
    const [selectedTender, setSelectedTender] = useState(null);
    const [activeTab, setActiveTab] = useState('demands');
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
        const meetingTime = new Date(tender.financial_grievance_details.meeting_datetime);
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
        fetchSupplyOrders();
        fetchReadyTenders();
        fetchScheduledOpenings();
        fetchPendingTenders();
        fetchGrievances();
        fetchManagableTenders();
    }, []);

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
    }; const fetchSupplyOrders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/supply-orders/all`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch supply orders');
            }

            const data = await response.json();
            setSupplyOrders(data);
        } catch (err) {
            console.error('Error fetching supply orders:', err);
            // Don't set error for supply orders as it's secondary functionality
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
                console.error('❌ API Error:', errorText);
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

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/${selectedTenderForExtension.id}/update-time`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(timeExtensionForm)
            });

            if (response.ok) {
                toast.success('Tender time updated successfully');
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
            toast.error('Error checking existing tender. Please try again.');
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
        console.log('Tender created successfully:', tender);
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

        // Validate that expiry time is at least 1 minute from now (for testing)
        if (evaluationForm.status === 'approved' && evaluationForm.biddingExpiryTime) {
            const expiryTime = new Date(evaluationForm.biddingExpiryTime);
            const minTime = new Date(Date.now() + 1 * 60 * 1000); // 1 minute from now

            if (expiryTime < minTime) {
                setError('Bidding expiry must be at least 1 minute from now');
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
            fetchSupplyOrders(); // Refresh supply orders in case new ones were created

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
            alert(data.message);
            
            // Refresh the lists
            fetchPendingTenders();
            fetchReadyTenders();
        } catch (err) {
            setError(err.message);
            alert(`Error: ${err.message}`);
        } finally {
            // Remove tender ID from processing list when done
            setProcessingTenderIds(prev => prev.filter(id => id !== tenderId));
        }
    };

    const downloadSupplyOrderPDF = async (orderId, itemName, supplierName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/supply-orders/${orderId}/pdf`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `supply-order-${orderId}-${itemName}-${supplierName}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError('Failed to download PDF: ' + err.message);
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
        const now = new Date();
        const utcTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000));
        const pakistanTime = new Date(utcTime.getTime() + (5 * 60 * 60 * 1000));
        const scheduledTime = new Date(scheduleForm.openingDateTime);

        if (scheduledTime <= pakistanTime) {
            setError('Opening time must be in the future (Pakistan time UTC+5)');
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
            alert('Financial opening scheduled successfully!');
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
        const meetingTime = new Date(financialGrievanceForm.meetingDateTime);

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
            toast.success(`Financial grievance initiated successfully! Emails sent to ${data.emails_sent} approved suppliers.`);
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
            toast.success(`Meeting minutes uploaded and distributed successfully! Emails sent to ${data.emails_sent} suppliers.`);
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
            fetchSupplyOrders(); // Refresh supply orders in case new ones were created
        } catch (err) {
            setError(err.message);
            alert(`Error: ${err.message}`);
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
            alert(`Error downloading financial bid: ${err.message}`);
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
            alert(`Error downloading technical bid: ${err.message}`);
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
            alert(`Error downloading bid CDR document: ${err.message}`);
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
            alert(`Error downloading report: ${err.message}`);
        }
    };

    const downloadDemandReport = async (demand) => {
        try {
            const token = localStorage.getItem('token');
            // Fetch detailed demand data with items
            const response = await fetch(`${apiUrl}/demands/${demand.id}/with-items`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch demand details');
            }
            
            const demandData = await response.json();
            
            // Generate Excel report
            const reportFilename = generateDemandReport(demandData, demandData.items || []);
            console.log('Excel report downloaded:', reportFilename);
            
        } catch (error) {
            console.error('Error downloading demand report:', error);
            setError('Failed to download demand report');
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

    const getTotalQuantity = (items) => {
        if (!items || items.length === 0) return 0;
        return items.reduce((total, item) => total + parseInt(item.quantity || 0), 0);
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

            const data = await response.json();
            toast.success('Tender sent for market survey successfully');
            
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
            
            toast.success('Document downloaded successfully');
        } catch (err) {
            console.error('Error downloading document:', err);
            toast.error('Failed to download document');
        }
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
            {/* Show Tender Creation Wizard as integrated view */}
            {showTenderWizard && selectedDemandForTender ? (
                <TenderCreationWizard
                    demandId={selectedDemandForTender.id}
                    onClose={handleCloseTenderWizard}
                    onTenderCreated={handleTenderCreated}
                />
            ) : (
                /* Main Dashboard Content */
                <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                    <div className="px-4 py-6 sm:px-0">
                        <div className="mb-6">
                            <h1 className="text-3xl font-bold text-gray-900">Purchase Department</h1>
                            <p className="text-gray-600">Review and process demands from store department</p>
                        </div>

                        {error && (
                            <div className="mb-4 rounded-md bg-red-50 p-4">
                                <div className="text-sm text-red-700">{error}</div>
                            </div>
                        )}

                    {/* Sidebar + Content */}
                    <div className="flex gap-6">
                        {/* Mobile menu */}
                        <div className="w-full md:hidden mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Menu</label>
                            <select
                                value={activeTab}
                                onChange={(e) => setActiveTab(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="demands">Pending Demands</option>
                                <option value="supply-orders">Letters</option>
                                <option value="purchase-orders">Purchase Orders</option>
                                <option value="pending-tenders">Tender Opening</option>
                                <option value="financial-opening">Financial Opening</option>
                                <option value="grievance-management">Grievance Management</option>
                                <option value="pre-bid-meetings">Pre-Bid Meetings</option>
                                <option value="vetting-management">Vetting Management</option>
                                <option value="market-survey">Market Survey</option>
                                <option value="tender-management">Tender Management</option>
                            </select>
                        </div>

                        {/* Sidebar */}
                        <aside className="hidden md:block w-64">
                            <div className="bg-white border border-gray-200 rounded-lg p-3 sticky top-24">
                                <nav className="space-y-1" aria-label="Sidebar">
                                    {[
                                        {
                                            id: 'demands',
                                            label: 'Pending Demands',
                                            icon: 'fas fa-clipboard-list',
                                            count: demands.length,
                                            badgeClass: 'bg-indigo-100 text-indigo-800'
                                        },
                                        {
                                            id: 'supply-orders',
                                            label: 'Letters',
                                            icon: 'fas fa-envelope',
                                            count: supplyOrders.length,
                                            badgeClass: 'bg-green-100 text-green-800'
                                        },
                                        {
                                            id: 'purchase-orders',
                                            label: 'Purchase Orders',
                                            icon: 'fas fa-file-invoice',
                                            badgeClass: 'bg-teal-100 text-teal-800'
                                        },
                                        {
                                            id: 'pending-tenders',
                                            label: 'Tender Opening',
                                            icon: 'fas fa-folder-open',
                                            count: pendingTenders.length,
                                            badgeClass: 'bg-yellow-100 text-yellow-800'
                                        },
                                        {
                                            id: 'financial-opening',
                                            label: 'Financial Opening',
                                            icon: 'fas fa-coins',
                                            count: (readyTenders.length + (scheduledOpenings.ready_to_open?.length || 0) + (scheduledOpenings.scheduled_future?.length || 0)),
                                            badgeClass: 'bg-orange-100 text-orange-800'
                                        },
                                        {
                                            id: 'grievance-management',
                                            label: 'Grievance Management',
                                            icon: 'fas fa-exclamation-triangle',
                                            count: pendingGrievances.length,
                                            badgeClass: 'bg-red-100 text-red-800'
                                        },
                                        { id: 'pre-bid-meetings', label: 'Pre-Bid Meetings', icon: 'fas fa-calendar-alt' },
                                        { id: 'vetting-management', label: 'Vetting Management', icon: 'fas fa-clipboard-check' },
                                        { id: 'market-survey', label: 'Market Survey', icon: 'fas fa-chart-line' },
                                        { id: 'tender-management', label: 'Tender Management', icon: 'fas fa-clock' }
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveTab(item.id)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                activeTab === item.id
                                                    ? 'bg-indigo-50 text-indigo-700'
                                                    : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            <span className="flex items-center">
                                                <i className={`${item.icon} mr-2 text-gray-500`}></i>
                                                {item.label}
                                            </span>
                                            {typeof item.count === 'number' && item.count > 0 && (
                                                <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.badgeClass}`}>
                                                    {item.count}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </nav>
                            </div>
                        </aside>

                        {/* Content Area */}
                        <div className="flex-1">
                            {/* Section Content */}
                            {activeTab === 'demands' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Demands for Purchase Review & Excel Reports</h2>

                                {demands.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No demands available for purchase review at this time. Store department will submit fulfillment reports that appear here with downloadable Excel reports.</div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {demands.map((demand) => (
                                            <div key={demand.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
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
                                                <div className="bg-gray-50 rounded-lg p-4 mb-4">
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
                                                            <span className="ml-2">{new Date(demand.required_by).toLocaleDateString()}</span>
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
                                                        <h4 className="font-medium text-gray-900 mb-3">Items Requested:</h4>
                                                        <div className="space-y-3">
                                                            {demand.items.map((item, index) => (
                                                                <div key={item.id} className="bg-white border rounded-lg p-4">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                                        {item.store_status && (
                                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${item.store_status === 'available' ? 'bg-green-100 text-green-800' :
                                                                                    item.store_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                                                                        'bg-red-100 text-red-800'
                                                                                }`}>
                                                                                {item.store_status.toUpperCase()}
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
                                                        <h4 className="font-medium text-gray-900 mb-3">Item Details:</h4>
                                                        <div className="bg-white border rounded-lg p-4">
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
                                                    <div className="mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                                                        <p className="text-sm font-medium text-gray-900">Store Response:</p>
                                                        <p className="text-sm text-gray-700 mt-1">{demand.store_response}</p>
                                                        <p className="text-xs text-gray-500 mt-2">
                                                            Responded by {demand.store_response_by_name} on {new Date(demand.store_response_at).toLocaleString()}
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="flex justify-end space-x-3">
                                                    <button
                                                        onClick={() => downloadDemandReport(demand)}
                                                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                                                    >
                                                        📊 Download Excel Report
                                                    </button>
                                                    <button
                                                        onClick={() => handleEvaluate(demand)}
                                                        className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        Create Tender
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
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Tenders Pending Opening</h2>
                                <p className="text-gray-600 mb-6">
                                    These tenders have expired and are awaiting opening by the purchase department before forwarding to technical evaluation.
                                </p>

                                {pendingTenders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No tenders pending opening at this time.</div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {pendingTenders.map((tender) => (
                                            <div key={tender.id} className="border border-gray-200 rounded-lg p-6 bg-yellow-50">
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
                                                            <span>Bidding Ended: {new Date(tender.bidding_end_time).toLocaleString()}</span>
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
                                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
                                                        >
                                                            View Details
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
                                                            Submitted Bids ({tender.bid_count})
                                                        </h4>
                                                        <div className="space-y-2">
                                                            {tender.bids.map((bid) => (
                                                                <div key={bid.id} className="flex justify-between items-center bg-white p-3 rounded border">
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
                                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            <i className="fas fa-clipboard-check mr-2 text-green-600"></i>
                                            All Suppliers Finalized - Ready for Financial Opening
                                        </h2>

                                        <div className="space-y-4">
                                            {readyTenders.map((tender) => (
                                                <div key={tender.id} className={`border rounded-lg p-4 ${
                                                    tender.is_financially_opened ? 'border-purple-200 bg-purple-50' : 'border-green-200 bg-green-50'
                                                }`}>
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                {tender.is_financially_opened 
                                                                    ? `Financial opening completed for ${getTenderDisplayName(tender)}`
                                                                    : `All suppliers for ${getTenderDisplayName(tender)} finalized`
                                                                }
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
                                                                            ? `Financial opening completed: ${new Date(tender.financial_opening.opened_at).toLocaleString('en-PK')}`
                                                                            : `Financial opening scheduled for: ${new Date(tender.financial_opening.scheduled_opening_time).toLocaleString('en-PK')}`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {tender.financial_grievance_details && (
                                                                <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                                                                    <p className="text-sm text-yellow-800">
                                                                        <i className="fas fa-exclamation-triangle mr-1"></i>
                                                                        Financial grievance meeting scheduled: {new Date(tender.financial_grievance_details.meeting_datetime).toLocaleString('en-PK')}
                                                                    </p>
                                                                    <p className="text-xs text-yellow-700 mt-1">
                                                                        Grievance period: 10 days from {new Date(tender.financial_grievance_details.sent_at).toLocaleDateString('en-PK')}
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
                                                                                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                                            >
                                                                                <i className="fas fa-calendar-plus mr-2"></i>
                                                                                {tender.financial_opening ? 'Reschedule' : 'Schedule'} Financial Opening
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'ready_for_grievance':
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleInitiateFinancialGrievance(tender)}
                                                                                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                                            >
                                                                                <i className="fas fa-gavel mr-2"></i>
                                                                                Initiate Financial Grievance
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'meeting_passed':
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleUploadMinutes(tender)}
                                                                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                                                                            >
                                                                                <i className="fas fa-upload mr-2"></i>
                                                                                Upload Minutes & Distribute
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'grievance_initiated':
                                                                        return (
                                                                            <button
                                                                                disabled
                                                                                className="px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed"
                                                                            >
                                                                                <i className="fas fa-clock mr-2"></i>
                                                                                Awaiting Meeting Time
                                                                            </button>
                                                                        );
                                                                    
                                                                    case 'completed':
                                                                        return (
                                                                            <button
                                                                                disabled
                                                                                className="px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed"
                                                                            >
                                                                                <i className="fas fa-check-circle mr-2"></i>
                                                                                Financial Complete
                                                                            </button>
                                                                        );
                                                                    
                                                                    default:
                                                                        return (
                                                                            <button
                                                                                onClick={() => handleScheduleFinancialOpening(tender)}
                                                                                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                                            >
                                                                                <i className="fas fa-calendar-plus mr-2"></i>
                                                                                Schedule Financial Opening
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
                                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            <i className="fas fa-folder-open mr-2 text-red-600"></i>
                                            Ready to Open - Time Passed
                                        </h2>

                                        <div className="space-y-4">
                                            {scheduledOpenings.ready_to_open.map((opening) => (
                                                <div key={opening.id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                {getTenderDisplayName(opening)} - {opening.description || opening.item_name}
                                                            </h3>
                                                            <p className="text-sm text-red-600 mt-1">
                                                                <i className="fas fa-exclamation-triangle mr-1"></i>
                                                                Scheduled time has passed: {new Date(opening.scheduled_opening_time).toLocaleString('en-PK')}
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
                                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            <i className="fas fa-clock mr-2 text-blue-600"></i>
                                            Scheduled for Future
                                        </h2>

                                        <div className="space-y-4">
                                            {scheduledOpenings.scheduled_future.map((opening) => (
                                                <div key={opening.id} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                {getTenderDisplayName(opening)} - {opening.description || opening.item_name}
                                                            </h3>
                                                            <p className="text-sm text-blue-600 mt-1">
                                                                <i className="fas fa-calendar mr-1"></i>
                                                                Scheduled for: {new Date(opening.scheduled_opening_time).toLocaleString('en-PK')}
                                                            </p>
                                                        </div>
                                                        <div className="ml-4">
                                                            <button
                                                                onClick={() => handleScheduleFinancialOpening({ id: opening.tender_id, ...opening })}
                                                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                                    <div className="px-4 py-12 text-center">
                                        <i className="fas fa-folder-open text-4xl text-gray-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Financial Openings Available</h3>
                                        <p className="text-gray-600">All grievances must be resolved and suppliers finalized before financial openings can be scheduled.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Grievance Management Tab */}
                    {activeTab === 'grievance-management' && (
                <div className="space-y-6">
                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-medium text-gray-900">
                                    <i className="fas fa-exclamation-triangle mr-2 text-yellow-600"></i>
                                    Pending Grievance Notifications ({pendingGrievances.length})
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
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
                                    >
                                        <i className="fas fa-check-double mr-2"></i>
                                        Approve All
                                    </button>
                                )}
                            </div>

                            {pendingGrievances.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-gray-500">
                                        <i className="fas fa-check-circle text-4xl text-green-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Grievances</h3>
                                        <p>All grievance notifications have been processed.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {pendingGrievances.map((grievance) => (
                                        <div key={grievance.id} className="border border-yellow-200 rounded-lg p-6 bg-yellow-50">
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
                                                            <span className="ml-2">{new Date(grievance.created_at).toLocaleString()}</span>
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
                                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
                                                    >
                                                        <i className="fas fa-check mr-2"></i>
                                                        Approve & Send
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const comments = prompt('Enter rejection reason:');
                                                            if (comments !== null && comments.trim() !== '') {
                                                                handleRejectGrievance(grievance.id, comments);
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium"
                                                    >
                                                        <i className="fas fa-times mr-2"></i>
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="border-t border-yellow-300 pt-3">
                                                <h4 className="font-medium text-gray-900 mb-2">Rejection Reason:</h4>
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
                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">
                                <i className="fas fa-history mr-2 text-blue-600"></i>
                                All Grievances History
                            </h2>

                            {allGrievances.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="text-gray-500">No grievance records found.</div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Tender & Supplier
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Item & Reason
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Status
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Review Details
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Date
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {allGrievances.map((grievance) => (
                                                <tr key={grievance.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
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
                                                    <td className="px-6 py-4">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {grievance.item_name}
                                                            </div>
                                                            <div className="text-sm text-gray-600 mt-1">
                                                                {grievance.rejection_reason}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                            grievance.status === 'pending' 
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : grievance.status === 'approved'
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {grievance.status.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {grievance.reviewed_by && (
                                                            <div className="text-sm text-gray-900">
                                                                <div>By: {grievance.reviewed_by}</div>
                                                                {grievance.reviewed_at && (
                                                                    <div className="text-xs text-gray-500">
                                                                        {new Date(grievance.reviewed_at).toLocaleString()}
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
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                        {new Date(grievance.created_at).toLocaleDateString()}
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
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-medium text-gray-900">
                                <i className="fas fa-chart-line mr-2"></i>
                                Market Survey Management
                            </h3>
                            <button
                                onClick={() => {
                                    fetchMarketSurveyTenders();
                                    fetchCompletedSurveys();
                                }}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Refresh
                            </button>
                        </div>

                        {marketSurveyTenders.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-chart-line text-gray-400 text-4xl mb-4"></i>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Tenders</h3>
                                <p className="text-gray-500">There are no active tenders available for market survey.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Tender Details
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Item Information
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Deadline
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Survey Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {marketSurveyTenders.map((tender) => (
                                            <tr key={tender.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        Tender #{tender.id}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Status: {tender.status}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
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
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(tender.bidding_end_time).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
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
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    {!tender.survey_status ? (
                                                        <button
                                                            onClick={() => handleSendForMarketSurvey(tender)}
                                                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                        >
                                                            <i className="fas fa-paper-plane mr-1"></i>
                                                            Send for Market Survey
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
                                Completed Market Surveys
                            </h4>
                            
                            {completedSurveys.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-lg">
                                    <i className="fas fa-clipboard-check text-gray-400 text-3xl mb-3"></i>
                                    <p className="text-gray-500">No completed market surveys yet.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Tender Details
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Item Information
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Survey Details
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Evaluation Documents
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {completedSurveys.map((survey) => (
                                                <tr key={survey.survey_id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            Tender #{survey.tender_id}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Sent: {new Date(survey.sent_at).toLocaleDateString()}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Completed: {new Date(survey.completed_at).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
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
                                                    <td className="px-6 py-4">
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
                                                    <td className="px-6 py-4">
                                                        {survey.documents && survey.documents.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {survey.documents
                                                                    .filter(doc => doc.document_type === 'evaluation')
                                                                    .map((doc) => (
                                                                    <div key={doc.id} className="flex items-center">
                                                                        <button
                                                                            onClick={() => downloadMarketSurveyDocument(doc.id, doc.original_filename)}
                                                                            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                                                                        >
                                                                            <i className="fas fa-download mr-1"></i>
                                                                            {doc.original_filename}
                                                                        </button>
                                                                        <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
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
                                                                            className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
                                                                        >
                                                                            <i className="fas fa-paperclip mr-1"></i>
                                                                            {doc.original_filename}
                                                                        </button>
                                                                        <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
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

            {/* Tender Management Tab */}
            {activeTab === 'tender-management' && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-medium text-gray-900">
                                <i className="fas fa-clock mr-2"></i>
                                Tender Time Management
                            </h3>
                            <button
                                onClick={fetchManagableTenders}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Refresh
                            </button>
                        </div>

                        {loading ? (
                            <div className="text-center py-12">
                                <i className="fas fa-spinner fa-spin text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">Loading tenders...</p>
                            </div>
                        ) : managableTenders.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-clock text-gray-400 text-4xl mb-4"></i>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No Manageable Tenders</h3>
                                <p className="text-gray-500">There are no approved tenders available for time management.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Tender Details
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Item Information
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Current Timing
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Extension History
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {managableTenders.map((tender) => (
                                            <tr key={tender.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        Tender #{tender.id}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Status: <span className={`font-medium ${
                                                            tender.status === 'hod_approved' ? 'text-green-600' :
                                                            tender.status === 'active' ? 'text-blue-600' :
                                                            'text-gray-600'
                                                        }`}>{tender.status}</span>
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Created: {new Date(tender.created_at).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
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
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        <div className="flex items-center mb-1">
                                                            <i className="fas fa-calendar-start mr-1 text-green-600"></i>
                                                            <span className="font-medium">Start:</span>
                                                        </div>
                                                        <div className="text-sm text-gray-600 mb-2">
                                                            {new Date(tender.bidding_start_time).toLocaleString()}
                                                        </div>
                                                        <div className="flex items-center mb-1">
                                                            <i className="fas fa-calendar-times mr-1 text-red-600"></i>
                                                            <span className="font-medium">End:</span>
                                                        </div>
                                                        <div className="text-sm text-gray-600">
                                                            {new Date(tender.bidding_end_time).toLocaleString()}
                                                        </div>
                                                        {new Date(tender.bidding_end_time) < new Date() ? (
                                                            <span className="mt-2 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                                                Expired
                                                            </span>
                                                        ) : new Date(tender.bidding_end_time) - new Date() < 24 * 60 * 60 * 1000 ? (
                                                            <span className="mt-2 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                                                Ending Soon
                                                            </span>
                                                        ) : (
                                                            <span className="mt-2 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {tender.time_extension_reason ? (
                                                        <div className="text-sm">
                                                            <div className="text-gray-900 font-medium mb-1">
                                                                <i className="fas fa-history mr-1 text-blue-600"></i>
                                                                Extended
                                                            </div>
                                                            <div className="text-gray-600 mb-1">
                                                                <strong>Reason:</strong> {tender.time_extension_reason}
                                                            </div>
                                                            <div className="text-gray-600 mb-1">
                                                                <strong>By:</strong> {tender.extension_by_name}
                                                            </div>
                                                            <div className="text-gray-600">
                                                                <strong>At:</strong> {new Date(tender.time_extension_at).toLocaleString()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">No extensions</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <button
                                                        onClick={() => handleTimeExtension(tender)}
                                                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                    >
                                                        <i className="fas fa-clock mr-1"></i>
                                                        Manage Time
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
            )}

                        </div>{/* End Content Area */}
                    </div>{/* End Sidebar + Content */}
                </div>
            </div>
            )}

            {/* Time Extension Modal */}
            {showTimeExtensionModal && selectedTender && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Manage Tender Time - #{selectedTender.id}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowTimeExtensionModal(false);
                                    setSelectedTender(null);
                                    setTimeExtensionForm({ action: 'extend', hours: '', reason: '' });
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <form onSubmit={submitTimeExtension}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Current End Time
                                </label>
                                <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                                    {new Date(selectedTender.bidding_end_time).toLocaleString()}
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Action
                                </label>
                                <select
                                    value={timeExtensionForm.action}
                                    onChange={(e) => setTimeExtensionForm({...timeExtensionForm, action: e.target.value})}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                >
                                    <option value="extend">Extend Time</option>
                                    <option value="reduce">Reduce Time</option>
                                </select>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Hours to {timeExtensionForm.action === 'extend' ? 'Add' : 'Subtract'}
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="168"
                                    value={timeExtensionForm.hours}
                                    onChange={(e) => setTimeExtensionForm({...timeExtensionForm, hours: e.target.value})}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Enter hours (1-168)"
                                    required
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Maximum: 168 hours (7 days)
                                </p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Reason for Time Change
                                </label>
                                <textarea
                                    value={timeExtensionForm.reason}
                                    onChange={(e) => setTimeExtensionForm({...timeExtensionForm, reason: e.target.value})}
                                    rows="3"
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Explain why you need to change the tender time..."
                                    required
                                />
                            </div>

                            {timeExtensionForm.hours && (
                                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                    <div className="text-sm font-medium text-blue-800 mb-1">
                                        Preview New End Time:
                                    </div>
                                    <div className="text-sm text-blue-700">
                                        {(() => {
                                            const currentEnd = new Date(selectedTender.bidding_end_time);
                                            const hoursToChange = parseInt(timeExtensionForm.hours) || 0;
                                            const newEnd = new Date(currentEnd);
                                            
                                            if (timeExtensionForm.action === 'extend') {
                                                newEnd.setHours(newEnd.getHours() + hoursToChange);
                                            } else {
                                                newEnd.setHours(newEnd.getHours() - hoursToChange);
                                            }
                                            
                                            return newEnd.toLocaleString();
                                        })()}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowTimeExtensionModal(false);
                                        setSelectedTender(null);
                                        setTimeExtensionForm({ action: 'extend', hours: '', reason: '' });
                                    }}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                                        timeExtensionForm.action === 'extend' 
                                            ? 'bg-green-600 hover:bg-green-700' 
                                            : 'bg-orange-600 hover:bg-orange-700'
                                    }`}
                                >
                                    <i className={`fas ${timeExtensionForm.action === 'extend' ? 'fa-plus' : 'fa-minus'} mr-2`}></i>
                                    {timeExtensionForm.action === 'extend' ? 'Extend' : 'Reduce'} Time
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Evaluation Modal */}
            {showEvaluationModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Purchase Review: Demand #{selectedDemand?.id}
                        </h3>

                        <form onSubmit={handleEvaluationSubmit}>
                            {/* Show all items in the demand */}
                            {selectedDemand?.items && selectedDemand.items.length > 0 ? (
                                <div className="mb-6">
                                    <h4 className="font-medium text-gray-900 mb-3">Items in this Demand:</h4>
                                    <div className="space-y-3 max-h-60 overflow-y-auto">
                                        {selectedDemand.items.map((item, index) => (
                                            <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                    {item.store_status && (
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${item.store_status === 'available' ? 'bg-green-100 text-green-800' :
                                                                item.store_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-red-100 text-red-800'
                                                            }`}>
                                                            {item.store_status.toUpperCase()}
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
                                    <h4 className="font-medium text-gray-900 mb-3">Item Details:</h4>
                                    <div className="bg-gray-50 rounded-lg p-4">
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
                                <label className="block text-sm font-medium text-gray-700">Purchase Decision</label>
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
                                    <label className="block text-sm font-medium text-gray-700">
                                        Bidding Expiry Date & Time <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="biddingExpiryTime" value={evaluationForm.biddingExpiryTime}
                                        onChange={handleFormChange}
                                        min={new Date(Date.now() + 1 * 60 * 1000).toISOString().slice(0, 16)} // Minimum 1 minute from now
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        required
                                    />
                                    <p className="mt-1 text-sm text-gray-500">
                                        Set the deadline for suppliers to submit their bids. Minimum 1 minute required (for testing).
                                    </p>
                                </div>
                            )}

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
                                    placeholder={evaluationForm.status === 'rejected' ? 'Please provide reason for purchase rejection' : 'Optional comments about the purchase decision'}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>

                            {/* File Uploads (only for approved) */}
                            {evaluationForm.status === 'approved' && (
                                <div className="mb-6">
                                    <h4 className="font-medium text-gray-900 mb-3">Required Documents:</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">
                                                Tender Document (PDF) <span className="text-red-500">*</span>
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
                                            <label className="block text-sm font-medium text-gray-700">
                                                Items List (Excel/CSV) <span className="text-red-500">*</span>
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    Submit Review
                                </button>
                            </div>
                        </form>
                    </div>
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
                            <p className="text-gray-600 mb-4">Your purchase review has been successfully submitted.</p>
                            <p className="text-sm text-gray-500">Redirecting to dashboard in 3 seconds...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Financial Opening Schedule Modal */}
            {showFinancialScheduleModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Schedule Financial Opening - Tender {selectedTender?.id}
                            </h3>
                            <button
                                onClick={() => setShowFinancialScheduleModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                                <h4 className="font-medium text-blue-900 mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm text-blue-800 mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                <div className="grid grid-cols-2 gap-4 text-sm text-blue-800">
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Financial Opening Date & Time (Pakistan Time UTC+5) *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={scheduleForm.openingDateTime}
                                    onChange={(e) => setScheduleForm({ ...scheduleForm, openingDateTime: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    Select when the financial bids should be opened. This must be a future date and time.
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowFinancialScheduleModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
                                >
                                    <i className="fas fa-calendar-plus mr-2"></i>
                                    Schedule Opening
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financial Grievance Modal */}
            {showFinancialGrievanceModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Initiate Financial Grievance - {getTenderDisplayName(selectedTender)}
                            </h3>
                            <button
                                onClick={() => setShowFinancialGrievanceModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
                                <h4 className="font-medium text-purple-900 mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm text-purple-800 mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                <div className="grid grid-cols-2 gap-4 text-sm text-purple-800">
                                    <div>
                                        <span className="font-medium">Financial Opening:</span> Completed
                                    </div>
                                    <div>
                                        <span className="font-medium">Approved Suppliers:</span> {selectedTender.approved_suppliers_count || 'Multiple'}
                                    </div>
                                </div>
                                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Grievance Meeting Date & Time (Pakistan Time UTC+5) *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={financialGrievanceForm.meetingDateTime}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingDateTime: e.target.value 
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    required
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    Select when the grievance meeting should be held. This will be included in the email to suppliers.
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Meeting Location
                                </label>
                                <input
                                    type="text"
                                    value={financialGrievanceForm.meetingLocation}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingLocation: e.target.value 
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    placeholder="Conference Room - Rawalpindi Institute of Cardiology"
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Additional Message (Optional)
                                </label>
                                <textarea
                                    value={financialGrievanceForm.customMessage}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        customMessage: e.target.value 
                                    })}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    placeholder="Any additional instructions or information for suppliers regarding the financial grievance..."
                                />
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                <h5 className="font-medium text-blue-900 mb-2">Email Content Preview:</h5>
                                <div className="text-sm text-blue-800">
                                    <p className="mb-2">
                                        <strong>Subject:</strong> Financial Grievance Period - {getTenderDisplayName(selectedTender)} - Rawalpindi Institute of Cardiology
                                    </p>
                                    <div className="bg-white p-3 rounded border text-gray-700">
                                        <p>Dear Supplier,</p>
                                        <p className="mt-2">
                                            This is to inform you that the financial opening for {getTenderDisplayName(selectedTender)} has been completed.
                                            The financial opening report is attached for your review.
                                        </p>
                                        <p className="mt-2">
                                            <strong>Financial Grievance Period:</strong> 10 days from the date of this email<br/>
                                            <strong>Meeting Date:</strong> {financialGrievanceForm.meetingDateTime ? new Date(financialGrievanceForm.meetingDateTime).toLocaleString('en-PK') : '[To be scheduled]'}<br/>
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
                                >
                                    <i className="fas fa-paper-plane mr-2"></i>
                                    Send Financial Grievances
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financial Grievance Modal */}
            {showFinancialGrievanceModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Initiate Financial Grievance - {getTenderDisplayName(selectedTender)}
                            </h3>
                            <button
                                onClick={() => setShowFinancialGrievanceModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                                <h4 className="font-medium text-purple-900 mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm text-purple-800 mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                <div className="text-sm text-purple-700">
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Grievance Meeting Date & Time *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={financialGrievanceForm.meetingDateTime}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingDateTime: e.target.value 
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    required
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                    Select when the grievance meeting should be held (must be at least 10 days from now)
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Meeting Location *
                                </label>
                                <input
                                    type="text"
                                    value={financialGrievanceForm.meetingLocation}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        meetingLocation: e.target.value 
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    placeholder="Conference Room - Rawalpindi Institute of Cardiology"
                                    required
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Additional Message (Optional)
                                </label>
                                <textarea
                                    value={financialGrievanceForm.customMessage}
                                    onChange={(e) => setFinancialGrievanceForm({ 
                                        ...financialGrievanceForm, 
                                        customMessage: e.target.value 
                                    })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
                                >
                                    <i className="fas fa-gavel mr-2"></i>
                                    Send Financial Grievances
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Upload Minutes Modal */}
            {showUploadMinutesModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                Upload Meeting Minutes - {getTenderDisplayName(selectedTender)}
                            </h3>
                            <button
                                onClick={() => setShowUploadMinutesModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        {selectedTender && (
                            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                                <h4 className="font-medium text-green-900 mb-2">{getTenderDisplayName(selectedTender)}</h4>
                                <p className="text-sm text-green-800 mb-2">{selectedTender.description || selectedTender.item_name}</p>
                                {selectedTender.financial_grievance_details && (
                                    <div className="text-sm text-green-700">
                                        <p className="mb-1">
                                            <i className="fas fa-calendar-check mr-2"></i>
                                            Meeting was scheduled for: {new Date(selectedTender.financial_grievance_details.meeting_datetime).toLocaleString('en-PK')}
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Meeting Minutes File *
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
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Distribution Message (Optional)
                                </label>
                                <textarea
                                    value={minutesForm.distributionMessage}
                                    onChange={(e) => setMinutesForm({ 
                                        ...minutesForm, 
                                        distributionMessage: e.target.value 
                                    })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                                >
                                    <i className="fas fa-upload mr-2"></i>
                                    Upload & Distribute Minutes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Market Survey Modal */}
            {showMarketSurveyModal && selectedMarketSurveyTender && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">
                                <i className="fas fa-chart-line mr-2"></i>
                                Send for Market Survey
                            </h3>
                            <button
                                onClick={() => setShowMarketSurveyModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="mb-4 p-3 bg-gray-50 rounded">
                            <p className="text-sm font-medium text-gray-900">
                                Tender #{selectedMarketSurveyTender.id}
                            </p>
                            <p className="text-sm text-gray-600">{selectedMarketSurveyTender.item_name}</p>
                            <p className="text-xs text-gray-500">Quantity: {selectedMarketSurveyTender.quantity}</p>
                        </div>

                        <form onSubmit={handleMarketSurveySubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Notes <span className="text-gray-500">(Optional)</span>
                                </label>
                                <textarea
                                    value={marketSurveyForm.notes}
                                    onChange={(e) => setMarketSurveyForm(prev => ({ ...prev, notes: e.target.value }))}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Add any specific instructions or requirements for the market survey..."
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Supporting Documents <span className="text-gray-500">(Optional)</span>
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
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <i className="fas fa-paper-plane mr-2"></i>
                                    Send for Market Survey
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Financial Opening Results Modal */}
            {showFinancialOpeningModal && financialOpeningData && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-5/6 lg:w-4/5 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">
                                Financial Opening Results - Tender {financialOpeningData.tender?.id}
                            </h3>
                            <button
                                onClick={() => setShowFinancialOpeningModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="mb-6">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h4 className="text-green-800 font-medium mb-2">
                                    <i className="fas fa-trophy mr-2"></i>
                                    Financial Bids Opened & Tender Automatically Awarded!
                                </h4>
                                <p className="text-green-700 text-sm mb-2">
                                    Opened at: {new Date(financialOpeningData.opened_at).toLocaleString('en-PK')}
                                </p>
                                {financialOpeningData.awarded && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                                        <h5 className="text-blue-800 font-medium mb-2">
                                            <i className="fas fa-check-circle mr-2"></i>
                                            Automatic Award Summary:
                                        </h5>
                                        <p className="text-blue-700 text-sm mb-2">
                                            • Tender automatically awarded to optimal supplier combination (lowest cost + best delivery)
                                        </p>
                                        <p className="text-blue-700 text-sm mb-2">
                                            • Supply orders created and emails sent to winning suppliers with PDF attachments
                                        </p>
                                        <p className="text-blue-700 text-sm">
                                            • {financialOpeningData.supply_orders?.length || 0} supply order(s) generated - check Supply Orders tab
                                        </p>
                                    </div>
                                )}
                                {financialOpeningData.report_file && (
                                    <button
                                        onClick={() => downloadFinancialOpeningReport(financialOpeningData.report_file)}
                                        className="mt-3 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                    >
                                        <i className="fas fa-download mr-1"></i>
                                        Download Full Report
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Optimal Combinations */}
                        <div className="mb-6">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">
                                <i className="fas fa-trophy mr-2 text-yellow-500"></i>
                                Top Optimal Supplier Combinations ({financialOpeningData.optimal_combinations?.length || 0} total)
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
                                                    <span className="ml-4 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                        {combo.items_count || combo.suppliers?.length || 0} items
                                                    </span>
                                                </div>
                                                <div className="text-sm text-gray-700 mb-2">
                                                    <strong>Companies in this combination:</strong>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {combo.suppliers?.map((supplier, supplierIndex) => (
                                                        <div key={supplierIndex} className="flex justify-between items-center bg-white p-2 rounded border">
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
                                Item-wise Approved Suppliers
                            </h4>
                            <div className="space-y-4">
                                {financialOpeningData.items_with_suppliers?.map((itemCombo, index) => (
                                    <div key={index} className="border rounded-lg p-4">
                                        <h5 className="font-medium text-gray-900 mb-3">
                                            {itemCombo.item.item_name}
                                        </h5>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivery Days</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Documents</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {itemCombo.approved_suppliers.map((supplier, supplierIndex) => (
                                                        <tr key={supplierIndex} className={supplierIndex === 0 ? 'bg-green-50' : ''}>
                                                            <td className="px-4 py-2 text-sm">
                                                                <div>
                                                                    <div className="font-medium text-gray-900">{supplier.company_name}</div>
                                                                    {supplierIndex === 0 && (
                                                                        <span className="text-xs text-green-600 font-medium">LOWEST BID</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">
                                                                Rs {(supplier.item_total_cost || supplier.total_cost).toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">
                                                                {supplier.delivery_days} days
                                                            </td>
                                                            <td className="px-4 py-2 text-sm text-gray-900">
                                                                {supplier.company_email}
                                                            </td>
                                                            <td className="px-4 py-2 text-sm">
                                                                <div className="flex flex-col space-y-1">
                                                                    <button
                                                                        onClick={() => downloadTechnicalBid(supplier.bid_id, supplier.company_name)}
                                                                        className="text-blue-600 hover:text-blue-800 text-xs"
                                                                    >
                                                                        <i className="fas fa-download mr-1"></i>
                                                                        Technical Bid
                                                                    </button>
                                                                    <button
                                                                        onClick={() => downloadFinancialBid(supplier.bid_id, supplier.company_name)}
                                                                        className="text-green-600 hover:text-green-800 text-xs"
                                                                    >
                                                                        <i className="fas fa-download mr-1"></i>
                                                                        Financial Bid
                                                                    </button>
                                                                    <button
                                                                        onClick={() => downloadBidCdrDocument(supplier.bid_id, supplier.company_name)}
                                                                        className="text-purple-600 hover:text-purple-800 text-xs"
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
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
