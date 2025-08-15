import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api, { apiUrl } from '../../config/api';
import { generateDemandReport } from '../../utils/excelReportGenerator';
import TenderCreationWizard from '../purchase/TenderCreationWizard';

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

    // Helper function to get tender display name
    const getTenderDisplayName = (tender) => {
        if (tender.tender_number) {
            return `Tender ${tender.tender_number}`;
        }
        return `Tender #${tender.id}`;
    }; useEffect(() => {
        fetchPurchaseDemands();
        fetchSupplyOrders();
        fetchReadyTenders();
        fetchScheduledOpenings();
        fetchPendingTenders();
        fetchGrievances();
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

                    {/* Tab Navigation */}
                    <div className="mb-6">
                        <nav className="flex space-x-8" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('demands')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'demands'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Pending Demands (Excel Reports)
                                {demands.length > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                        {demands.length}
                                    </span>
                                )}
                            </button>                            <button
                                onClick={() => setActiveTab('supply-orders')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'supply-orders'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Supply Orders
                                {supplyOrders.length > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        {supplyOrders.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('pending-tenders')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'pending-tenders'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Tender Opening
                                {pendingTenders.length > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        {pendingTenders.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('financial-opening')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'financial-opening'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Financial Opening
                                {(readyTenders.length + scheduledOpenings.ready_to_open?.length + scheduledOpenings.scheduled_future?.length) > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        {readyTenders.length + (scheduledOpenings.ready_to_open?.length || 0) + (scheduledOpenings.scheduled_future?.length || 0)}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('grievance-management')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'grievance-management'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Grievance Management
                                {pendingGrievances.length > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        {pendingGrievances.length}
                                    </span>
                                )}
                            </button>
                        </nav>
                    </div>                    {/* Tab Content */}
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
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Supply Orders</h2>

                                {supplyOrders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No supply orders available at this time.</div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {supplyOrders.map((tender) => (
                                            <div key={tender.tender_id} className="border border-gray-200 rounded-lg p-6">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {getTenderDisplayName(tender)}
                                                        </h3>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            {tender.description || tender.item_name}
                                                        </p>
                                                        <div className="mt-1 text-sm text-gray-600">
                                                            <span>Total Quantity: {tender.total_quantity}</span>
                                                            <span className="mx-2">•</span>
                                                            <span>Fulfilled: {tender.total_fulfilled_quantity} ({tender.fulfillment_percentage}%)</span>
                                                            <span className="mx-2">•</span>
                                                            <span>Total Cost: Rs {tender.total_cost}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${tender.fulfillment_percentage === 100
                                                                ? 'bg-green-100 text-green-800'
                                                                : 'bg-yellow-100 text-yellow-800'
                                                            }`}>
                                                            {tender.fulfillment_percentage === 100 ? 'Fully Fulfilled' : 'Partially Fulfilled'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Order ID
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Supplier
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Quantity
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Unit Price
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Total Cost
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Delivery Date
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Status
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Actions
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {tender.orders.map((order) => (
                                                                <tr key={order.id} className="hover:bg-gray-50">
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                        #{order.id}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {order.supplier_name}
                                                                        </div>
                                                                        <div className="text-sm text-gray-500">
                                                                            {order.supplier_email}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        {order.quantity}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        Rs {order.unit_price}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        Rs {order.total_cost}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        {new Date(order.expected_delivery_date).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                            {order.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                                                        <button
                                                                            onClick={() => downloadSupplyOrderPDF(order.id, tender.item_name, order.supplier_name)}
                                                                            className="text-indigo-600 hover:text-indigo-900 flex items-center"
                                                                        >
                                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                                                            </svg>
                                                                            Download PDF
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>)}
                            </div>
                        </div>
                    )}

                    {/* Financial Opening Tab */}
                    {activeTab === 'financial-opening' && (
                        <div className="space-y-6">
                            {/* Ready for Financial Opening */}
                            {readyTenders.length > 0 && (
                                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                                    <div className="px-4 py-5 sm:p-6">
                                        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                                            <i className="fas fa-clipboard-check mr-2 text-green-600"></i>
                                            All Suppliers Finalized - Ready for Financial Opening
                                        </h2>

                                        <div className="space-y-4">
                                            {readyTenders.map((tender) => (
                                                <div key={tender.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-lg font-semibold text-gray-900">
                                                                All suppliers for {getTenderDisplayName(tender)} finalized
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
                                                                <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                                                                    <p className="text-sm text-blue-800">
                                                                        <i className="fas fa-clock mr-1"></i>
                                                                        Financial opening scheduled for: {new Date(tender.financial_opening.scheduled_opening_time).toLocaleString('en-PK')}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="ml-4">
                                                            <button
                                                                onClick={() => handleScheduleFinancialOpening(tender)}
                                                                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                            >
                                                                <i className="fas fa-calendar-plus mr-2"></i>
                                                                {tender.financial_opening ? 'Reschedule' : 'Schedule'} Financial Opening
                                                            </button>
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
                </div>
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
                                Top Optimal Supplier Combinations
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
                                                </div>
                                                <div className="text-sm text-gray-700">
                                                    {combo.suppliers.map(supplier =>
                                                        `${supplier.item_name}: ${supplier.company_name}`
                                                    ).join(' | ')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
