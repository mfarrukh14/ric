import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Eye, WarningCircle as AlertCircle, FileText, Check, X } from '@phosphor-icons/react';
import Modal from '../modals/Modal';
import { LoadingBlock } from '../../ui';
import { setNavBadge } from '../../lib/navBadges';
import { apiUrl } from '../../config/api';
import { notify } from '../../lib/notify';
import { confirmDialog } from '../../lib/confirm';

import { formatDate, formatDateTime, inputValueFromNow, toDate } from '../../lib/time';
import { money } from '../../ui/status';
import { TenderStatus } from '../../ui/tender';
const HodDashboard = () => {
    const [pendingDemands, setPendingDemands] = useState([]);
    const [pendingTenders, setPendingTenders] = useState([]);
    const [selectedDemand, setSelectedDemand] = useState(null);
    const [selectedTender, setSelectedTender] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showTenderDetailsModal, setShowTenderDetailsModal] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [showTenderApprovalModal, setShowTenderApprovalModal] = useState(false);
    const [approvalAction, setApprovalAction] = useState(''); // 'approve' or 'reject'
    const [rejectionReason, setRejectionReason] = useState('');
    // Tender-specific approval state
    const [tenderApprovalAction, setTenderApprovalAction] = useState(''); // 'approve' or 'reject'
    const [tenderRejectionReason, setTenderRejectionReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');
    const [isPurchaseHOD, setIsPurchaseHOD] = useState(false);
    const [isFinanceHOD, setIsFinanceHOD] = useState(false);
    const [isMsHOD, setIsMsHOD] = useState(false);
    const [isStoreHOD, setIsStoreHOD] = useState(false);
    const [pendingPublishing, setPendingPublishing] = useState([]);
    const [storePendingApprovals, setStorePendingApprovals] = useState([]);
    const [showExpiredPublishModal, setShowExpiredPublishModal] = useState(false);
    const [tenderPendingTimeFix, setTenderPendingTimeFix] = useState(null);
    const [newBiddingEndTime, setNewBiddingEndTime] = useState('');
    const [timeFixReason, setTimeFixReason] = useState('');

    useEffect(() => {
        // Check user department
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const departmentName = user.departmentName ? user.departmentName.toLowerCase() : '';
        
        const isPurchase = departmentName === 'purchase';
        const isFinance = departmentName === 'finance';
        const isMs = departmentName === 'ms';
        const isStore = departmentName === 'store';
        
        setIsPurchaseHOD(isPurchase);
        setIsFinanceHOD(isFinance);
        setIsMsHOD(isMs);
        setIsStoreHOD(isStore);
        
        fetchPendingDemands();
        
        if (isPurchase) {
            fetchPendingTenders();
            fetchPendingPublishing();
        } else if (isFinance) {
            fetchFinanceHodTenders();
        } else if (isMs) {
            fetchMsHodTenders();
        } else if (isStore) {
            fetchStorePendingApprovals();
        }
    }, []);

    const fetchPendingDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/hod/pending`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPendingDemands(data);
            } else {
                throw new Error('Failed to fetch pending demands');
            }
        } catch (error) {
            setError('Error fetching pending demands: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchPendingTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/purchase-hod/pending-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPendingTenders(data);
            } else {
                throw new Error('Failed to fetch pending tenders');
            }
        } catch (error) {
            setError('Error fetching pending tenders: ' + error.message);
        }
    };

    const fetchFinanceHodTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/finance-hod/pending-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPendingTenders(data);
            } else {
                throw new Error('Failed to fetch Finance HOD pending tenders');
            }
        } catch (error) {
            setError('Error fetching Finance HOD pending tenders: ' + error.message);
        }
    };

    const fetchMsHodTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/ms-hod/pending-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPendingTenders(data);
            } else {
                throw new Error('Failed to fetch MS HOD pending tenders');
            }
        } catch (error) {
            setError('Error fetching MS HOD pending tenders: ' + error.message);
        }
    };

    const fetchStorePendingApprovals = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/store-hod/pending`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setStorePendingApprovals(data);
            } else {
                throw new Error('Failed to fetch Store HOD pending approvals');
            }
        } catch (error) {
            setError('Error fetching Store HOD pending approvals: ' + error.message);
        }
    };

    const fetchPendingPublishing = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/purchase-hod/pending-publishing`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setPendingPublishing(data);
            } else {
                throw new Error('Failed to fetch pending publishing tenders');
            }
        } catch (error) {
            setError('Error fetching pending publishing tenders: ' + error.message);
        }
    };

    const fetchDemandDetails = async (demandId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/${demandId}/with-items`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSelectedDemand(data);
                setShowDetailsModal(true);
            } else {
                throw new Error('Failed to fetch demand details');
            }
        } catch (error) {
            setError('Error fetching demand details: ' + error.message);
        }
    };

    const handleApprovalAction = async () => {
        if (approvalAction === 'reject' && !rejectionReason.trim()) {
            setError('Rejection reason is required');
            return;
        }

        setProcessing(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/hod/approve-reject`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    demandId: selectedDemand.id,
                    action: approvalAction,
                    rejectionReason: rejectionReason.trim()
                })
            });

            if (response.ok) {
                await fetchPendingDemands(); // Refresh the list
                setShowApprovalModal(false);
                setShowDetailsModal(false);
                setRejectionReason('');
                setError('');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process approval');
            }
        } catch (error) {
            setError('Error processing approval: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleTenderApprovalAction = async () => {
        if (tenderApprovalAction === 'reject' && !tenderRejectionReason.trim()) {
            setError('Rejection reason is required');
            return;
        }

        setProcessing(true);
        try {
            const token = localStorage.getItem('token');
            
            // Determine the correct endpoint based on user department
            let endpoint;
            if (isPurchaseHOD) {
                endpoint = `${apiUrl}/demands/purchase-hod/approve-reject-tender`;
            } else if (isFinanceHOD) {
                endpoint = `${apiUrl}/demands/finance-hod/approve-reject-tender`;
            } else if (isMsHOD) {
                endpoint = `${apiUrl}/demands/ms-hod/approve-reject-tender`;
            } else {
                throw new Error('Invalid department for tender approval');
            }
            
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tenderId: selectedTender.id,
                    action: tenderApprovalAction,
                    rejectionReason: tenderRejectionReason.trim()
                })
            });

            if (response.ok) {
                // Refresh the appropriate list
                if (isPurchaseHOD) {
                    await fetchPendingTenders();
                    await fetchPendingPublishing();
                } else if (isFinanceHOD) {
                    await fetchFinanceHodTenders();
                } else if (isMsHOD) {
                    await fetchMsHodTenders();
                }
                
                setShowTenderApprovalModal(false);
                setShowTenderDetailsModal(false);
                setTenderRejectionReason('');
                setError('');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process tender approval');
            }
        } catch (error) {
            setError('Error processing tender approval: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const openApprovalModal = (action) => {
        setApprovalAction(action);
        setRejectionReason('');
        setError('');
        setShowApprovalModal(true);
    };

    const openTenderDetailsModal = (tender) => {
        setSelectedTender(tender);
        setShowTenderDetailsModal(true);
    };

    const openTenderApprovalModal = (action) => {
        setTenderApprovalAction(action);
        setTenderRejectionReason('');
        setError('');
        setShowTenderApprovalModal(true);
    };

    const handlePublishTender = async (tenderId) => {
        if (!(await confirmDialog('Are you sure you want to publish this tender?'))) {
            return;
        }

        setProcessing(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/purchase-hod/publish-tender/${tenderId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                await fetchPendingPublishing();
                setError('');
                notify('Tender published');
            } else {
                const errorData = await response.json();
                if (response.status === 409 && errorData.expired) {
                    // Bidding end time has already passed - offer to fix it instead
                    // of just failing, rather than making the user hunt for the edit flow.
                    const tender = pendingPublishing.find(t => t.id === tenderId) || { id: tenderId };
                    setTenderPendingTimeFix(tender);
                    setNewBiddingEndTime('');
                    setTimeFixReason('');
                    setShowExpiredPublishModal(true);
                    return;
                }
                throw new Error(errorData.error || 'Failed to publish tender');
            }
        } catch (error) {
            setError('Error publishing tender: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const closeExpiredPublishModal = () => {
        setShowExpiredPublishModal(false);
        setTenderPendingTimeFix(null);
        setNewBiddingEndTime('');
        setTimeFixReason('');
    };

    const handleFixTimeAndPublish = async () => {
        if (!newBiddingEndTime || !timeFixReason.trim()) {
            setError('New bidding end time and a reason are required');
            return;
        }

        if ((toDate(newBiddingEndTime)?.getTime() ?? 0) < Date.now() + 2 * 60 * 1000) {
            setError('New bidding end time must be at least 2 minutes from now');
            return;
        }

        setProcessing(true);
        try {
            const token = localStorage.getItem('token');

            const updateResponse = await fetch(`${apiUrl}/demands/tenders/${tenderPendingTimeFix.id}/update-time`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ newBiddingEndTime, reason: timeFixReason.trim() })
            });

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                throw new Error(errorData.message || 'Failed to update bidding end time');
            }

            const publishResponse = await fetch(`${apiUrl}/demands/purchase-hod/publish-tender/${tenderPendingTimeFix.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!publishResponse.ok) {
                const errorData = await publishResponse.json();
                throw new Error(errorData.error || 'Bidding end time updated, but publishing still failed');
            }

            await fetchPendingPublishing();
            setError('');
            closeExpiredPublishModal();
            notify('Bidding end time updated and tender published');
        } catch (error) {
            setError('Error updating time and publishing: ' + error.message);
        } finally {
            setProcessing(false);
        }
    };

    // Store HOD approval functions
    const handleStoreApproval = async (demandId, action, rejectionReason = '') => {
        if (action === 'reject' && !rejectionReason.trim()) {
            setError('Rejection reason is required');
            return;
        }

        setProcessing(true);
        try {
            const token = localStorage.getItem('token');
            const endpoint = action === 'approve' 
                ? `${apiUrl}/demands/store-hod/${demandId}/approve`
                : `${apiUrl}/demands/store-hod/${demandId}/reject`;
            
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: action === 'reject' ? JSON.stringify({ rejectionReason: rejectionReason.trim() }) : undefined
            });

            if (response.ok) {
                await fetchStorePendingApprovals();
                setError('');
                notify(`Store fulfillment ${action}d`);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to ${action} store fulfillment`);
            }
        } catch (error) {
            setError(`Error ${action}ing store fulfillment: ` + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending_hod_approval':
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending HOD Approval
                </span>;
            default:
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {status}
                </span>;
        }
    };

    const getUrgencyBadge = (urgency) => {
        const urgencyColors = {
            urgent: 'bg-red-100 text-red-800',
            high: 'bg-orange-100 text-orange-800',
            normal: 'bg-green-100 text-green-800',
            low: 'bg-blue-100 text-blue-800'
        };

        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[urgency] || urgencyColors.normal}`}>
                {urgency || 'normal'}
            </span>
        );
    };

    // Demands awaiting this HOD's approval (department-based, independent of any
    // department-specific tender/store approval duties below). Shown for every
    // department so a demand created within e.g. Finance or MS still surfaces here.
    const renderPendingDemandsSection = () => (
        <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending demands</h2>
            {pendingDemands.length === 0 ? (
                <div className="ui-panel ui-panel--pad text-center">
                    <CheckCircle className="mx-auto h-8 w-8 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No pending demands</h3>
                    <p className="mt-1 text-sm text-gray-500">All demands have been reviewed.</p>
                </div>
            ) : (
                <div className="ui-panel">
                    <ul className="divide-y divide-gray-200">
                        {pendingDemands.map((demand) => (
                            <li key={demand.id} className="px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-medium text-gray-900">
                                                {demand.item_name}
                                            </h3>
                                            <div className="flex space-x-2">
                                                {getStatusBadge(demand.status)}
                                                {getUrgencyBadge(demand.urgency)}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm text-gray-600">
                                            <p><strong>Description:</strong> {demand.description || 'N/A'}</p>
                                            <p><strong>Quantity:</strong> {demand.quantity || 'N/A'}</p>
                                            <p><strong>Estimated Cost:</strong> {money(demand.estimated_cost)}</p>
                                            <p><strong>Required By:</strong> {formatDate(demand.required_by)}</p>
                                            <p><strong>Requested By:</strong> {demand.creator_name}</p>
                                            <p><strong>Department:</strong> {demand.department_name}</p>
                                            <p><strong>Created:</strong> {formatDate(demand.created_at)}</p>
                                        </div>
                                    </div>
                                    <div className="ml-4 flex-shrink-0 flex space-x-2">
                                        <button
                                            onClick={() => fetchDemandDetails(demand.id)}
                                            className="ui-btn ui-btn--secondary"
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            View details
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedDemand(demand);
                                                openApprovalModal('approve');
                                            }}
                                            className="ui-btn ui-btn--primary"
                                            disabled={processing}
                                        >
                                            <Check className="w-4 h-4 mr-1" />
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedDemand(demand);
                                                openApprovalModal('reject');
                                            }}
                                            className="ui-btn ui-btn--danger-solid"
                                            disabled={processing}
                                        >
                                            <X className="w-4 h-4 mr-1" />
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );

    const waiting = pendingDemands.length + pendingTenders.length + pendingPublishing.length + storePendingApprovals.length;
    useEffect(() => {
        setNavBadge('hod.pending', waiting);
    }, [waiting]);

    if (loading) {
        return (
            <LoadingBlock label="Loading approvals…" />
        );
    }

    return (
        <div>
            <div className="page-heading">
                <h1 className="ui-page-header__title">Approvals</h1>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    <div className="flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        {error}
                    </div>
                </div>
            )}

            {/* Purchase HOD displays demands, tenders for approval, and tenders for publishing */}
            {isPurchaseHOD ? (
                <div className="space-y-8">
                    {/* Demands Section */}
                    {renderPendingDemandsSection()}

                    {/* Tenders for Approval Section */}
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending tender approvals</h2>
                        {pendingTenders.length === 0 ? (
                            <div className="ui-panel ui-panel--pad text-center">
                                <CheckCircle className="mx-auto h-8 w-8 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No pending tenders</h3>
                                <p className="mt-1 text-sm text-gray-500">All tenders have been reviewed.</p>
                            </div>
                        ) : (
                            <div className="ui-panel">
                                <ul className="divide-y divide-gray-200">
                                    {pendingTenders.map((tender) => (
                                        <li key={tender.id} className="px-6 py-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-lg font-medium text-gray-900">
                                                            {tender.item_name || 'N/A'}
                                                        </h3>
                                                        <TenderStatus status={tender.tender_status} />
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        <p><strong>Description:</strong> {tender.description || 'N/A'}</p>
                                                        <p><strong>Quantity:</strong> {tender.quantity || 'N/A'}</p>
                                                        <p><strong>Estimated Cost:</strong> {money(tender.estimated_cost)}</p>
                                                        <p><strong>Created By:</strong> {tender.creator_name}</p>
                                                        <p><strong>Created:</strong> {formatDate(tender.created_at)}</p>
                                                    </div>
                                                </div>
                                                <div className="ml-4 flex-shrink-0 flex space-x-2">
                                                    <button
                                                        onClick={() => openTenderDetailsModal(tender)}
                                                        className="ui-btn ui-btn--secondary"
                                                    >
                                                        <FileText className="w-4 h-4 mr-1" />
                                                        View details
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTender(tender);
                                                            openTenderApprovalModal('approve');
                                                        }}
                                                        className="ui-btn ui-btn--primary"
                                                        disabled={processing}
                                                    >
                                                        <Check className="w-4 h-4 mr-1" />
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTender(tender);
                                                            openTenderApprovalModal('reject');
                                                        }}
                                                        className="ui-btn ui-btn--danger-solid"
                                                        disabled={processing}
                                                    >
                                                        <X className="w-4 h-4 mr-1" />
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Tenders for Publishing Section */}
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Ready for publishing</h2>
                        {pendingPublishing.length === 0 ? (
                            <div className="ui-panel ui-panel--pad text-center">
                                <CheckCircle className="mx-auto h-8 w-8 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No tenders ready for publishing</h3>
                                <p className="mt-1 text-sm text-gray-500">All approved tenders have been published.</p>
                            </div>
                        ) : (
                            <div className="ui-panel">
                                <ul className="divide-y divide-gray-200">
                                    {pendingPublishing.map((tender) => (
                                        <li key={tender.id} className="px-6 py-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-lg font-medium text-gray-900">
                                                            {tender.item_name || 'N/A'}
                                                        </h3>
                                                        <TenderStatus status={tender.tender_status} />
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        <p><strong>Description:</strong> {tender.description || 'N/A'}</p>
                                                        <p><strong>Quantity:</strong> {tender.quantity || 'N/A'}</p>
                                                        <p><strong>Estimated Cost:</strong> {money(tender.estimated_cost)}</p>
                                                        <p><strong>Created By:</strong> {tender.creator_name}</p>
                                                        <p><strong>Created:</strong> {formatDate(tender.created_at)}</p>
                                                        {tender.bidding_end_time && (
                                                            <p>
                                                                <strong>Bidding End:</strong> {formatDateTime(tender.bidding_end_time)}
                                                                {(tender.is_expired === 1 || tender.is_expired === true) && (
                                                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                                        Time passed
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="ml-4 flex-shrink-0">
                                                    <button
                                                        onClick={() => handlePublishTender(tender.id)}
                                                        className="ui-btn ui-btn--primary"
                                                        disabled={processing}
                                                    >
                                                        <FileText className="w-4 h-4 mr-1" />
                                                        Publish tender
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            ) : (isFinanceHOD || isMsHOD) ? (
                /* Finance/MS HOD displays their pending demands plus tenders for approval */
                <div className="space-y-8">
                    {renderPendingDemandsSection()}

                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">
                            {isFinanceHOD ? "Finance HOD Approval" : "MS HOD Approval"}
                        </h2>
                        {pendingTenders.length === 0 ? (
                            <div className="ui-panel ui-panel--pad text-center">
                                <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No pending tenders</h3>
                                <p className="mt-1 text-sm text-gray-500">All tenders have been reviewed.</p>
                            </div>
                        ) : (
                            <div className="ui-panel">
                                <ul className="divide-y divide-gray-200">
                                    {pendingTenders.map((tender) => (
                                        <li key={tender.id} className="px-6 py-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-lg font-medium text-gray-900">
                                                            {tender.item_name || 'N/A'}
                                                        </h3>
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                            <Clock className="w-3 h-3 mr-1" />
                                                            Pending {isFinanceHOD ? "Finance" : "MS"} HOD Approval
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        <p><strong>Description:</strong> {tender.description || 'N/A'}</p>
                                                        <p><strong>Quantity:</strong> {tender.quantity || 'N/A'}</p>
                                                        <p><strong>Estimated Cost:</strong> {money(tender.estimated_cost)}</p>
                                                        <p><strong>Created By:</strong> {tender.creator_name}</p>
                                                        <p><strong>Created:</strong> {formatDate(tender.created_at)}</p>
                                                    </div>
                                                </div>
                                                <div className="ml-4 flex-shrink-0 flex space-x-2">
                                                    <button
                                                        onClick={() => openTenderDetailsModal(tender)}
                                                        className="ui-btn ui-btn--secondary"
                                                    >
                                                        <FileText className="w-4 h-4 mr-1" />
                                                        View details
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTender(tender);
                                                            openTenderApprovalModal('approve');
                                                        }}
                                                        className="ui-btn ui-btn--primary"
                                                        disabled={processing}
                                                    >
                                                        <Check className="w-4 h-4 mr-1" />
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTender(tender);
                                                            openTenderApprovalModal('reject');
                                                        }}
                                                        className="ui-btn ui-btn--danger-solid"
                                                        disabled={processing}
                                                    >
                                                        <X className="w-4 h-4 mr-1" />
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            ) : isStoreHOD ? (
                /* Store HOD displays their pending demands plus store fulfillments for approval */
                <div className="space-y-8">
                    {renderPendingDemandsSection()}

                    <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Store HOD approval</h2>
                    {storePendingApprovals.length === 0 ? (
                        <div className="ui-panel ui-panel--pad text-center">
                            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No pending fulfillments</h3>
                            <p className="mt-1 text-sm text-gray-500">All store fulfillments have been reviewed.</p>
                        </div>
                    ) : (
                        <div className="ui-panel">
                            <ul className="divide-y divide-gray-200">
                                {storePendingApprovals.map((demand) => (
                                    <li key={demand.id} className="px-6 py-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-lg font-medium text-gray-900">
                                                        {demand.item_name || 'N/A'}
                                                    </h3>
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                        <Clock className="w-3 h-3 mr-1" />
                                                        Pending Store HOD Approval
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-sm text-gray-600">
                                                    <p><strong>Description:</strong> {demand.description || 'N/A'}</p>
                                                    <p><strong>Quantity:</strong> {demand.quantity || 'N/A'}</p>
                                                    <p><strong>Urgency:</strong> {demand.urgency || 'N/A'}</p>
                                                    <p><strong>Department:</strong> {demand.departmentName || 'N/A'}</p>
                                                    <p><strong>Created By:</strong> {demand.createdByName || 'N/A'}</p>
                                                    <p><strong>Store Response By:</strong> {demand.storeResponseByName || 'N/A'}</p>
                                                    <p><strong>Created:</strong> {formatDate(demand.createdAt)}</p>
                                                </div>
                                            </div>
                                            <div className="ml-4 flex-shrink-0 flex space-x-2">
                                                <button
                                                    onClick={() => handleStoreApproval(demand.id, 'approve')}
                                                    className="ui-btn ui-btn--primary"
                                                    disabled={processing}
                                                >
                                                    <Check className="w-4 h-4 mr-1" />
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const reason = prompt('Please provide a reason for rejection:');
                                                        if (reason) {
                                                            handleStoreApproval(demand.id, 'reject', reason);
                                                        }
                                                    }}
                                                    className="ui-btn ui-btn--danger-solid"
                                                    disabled={processing}
                                                >
                                                    <X className="w-4 h-4 mr-1" />
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    </div>
                </div>
            ) : (
                /* Regular HOD displays only demands */
                <>
                    {pendingDemands.length === 0 ? (
                        <div className="text-center py-12">
                            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No pending demands</h3>
                            <p className="mt-1 text-sm text-gray-500">All demands from your department have been reviewed.</p>
                        </div>
                    ) : (
                        <div className="ui-panel">
                            <ul className="divide-y divide-gray-200">
                                {pendingDemands.map((demand) => (
                            <li key={demand.id} className="px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-medium text-gray-900">
                                                {demand.item_name}
                                            </h3>
                                            <div className="flex space-x-2">
                                                {getStatusBadge(demand.status)}
                                                {getUrgencyBadge(demand.urgency)}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-sm text-gray-600">
                                            <p><strong>Description:</strong> {demand.description}</p>
                                            <p><strong>Quantity:</strong> {demand.quantity}</p>
                                            <p><strong>Estimated Cost:</strong> {money(demand.estimated_cost)}</p>
                                            <p><strong>Required By:</strong> {formatDate(demand.required_by)}</p>
                                            <p><strong>Requested By:</strong> {demand.creator_name}</p>
                                            <p><strong>Department:</strong> {demand.department_name}</p>
                                            <p><strong>Created:</strong> {formatDate(demand.created_at)}</p>
                                        </div>
                                    </div>
                                    <div className="ml-6 flex space-x-2">
                                        <button
                                            onClick={() => fetchDemandDetails(demand.id)}
                                            className="ui-btn ui-btn--secondary"
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            View details
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedDemand(demand);
                                                openApprovalModal('approve');
                                            }}
                                            className="ui-btn ui-btn--primary"
                                        >
                                            <CheckCircle className="w-4 h-4 mr-1" />
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedDemand(demand);
                                                openApprovalModal('reject');
                                            }}
                                            className="ui-btn ui-btn--danger-solid"
                                        >
                                            <XCircle className="w-4 h-4 mr-1" />
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
                </>
            )}

            {/* Demand Details Modal */}
            <Modal 
                show={showDetailsModal} 
                onClose={() => setShowDetailsModal(false)} 
                title="Demand Details"
                size="lg"
            >
                {selectedDemand && (
                    <div className="space-y-4">
                        <div className="ui-callout">
                            <h4 className="font-medium text-gray-900 mb-2">Basic information</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><strong>Item:</strong> {selectedDemand.item_name}</div>
                                <div><strong>Quantity:</strong> {selectedDemand.quantity}</div>
                                <div><strong>Cost:</strong> {money(selectedDemand.estimated_cost)}</div>
                                <div><strong>Urgency:</strong> {selectedDemand.urgency}</div>
                                <div><strong>Required By:</strong> {formatDate(selectedDemand.required_by)}</div>
                                <div><strong>Requested By:</strong> {selectedDemand.created_by_name || selectedDemand.creator_name}</div>
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{selectedDemand.description}</p>
                        </div>

                        {selectedDemand.items && selectedDemand.items.length > 0 && (
                            <div>
                                <h4 className="font-medium text-gray-900 mb-2">Items breakdown</h4>
                                <div className="overflow-x-auto">
                                    <table className="ui-table">
                                        <thead>
                                            <tr>
                                                <th className="text-left">Item</th>
                                                <th className="text-left">Quantity</th>
                                                <th className="text-left">Unit</th>
                                                <th className="text-left">Cost (current year)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedDemand.items.map((item, index) => (
                                                <tr key={index}>
                                                    <td className="whitespace-nowrap">
                                                        {item.item_name || item.custom_field_description || 'N/A'}
                                                    </td>
                                                    <td className="whitespace-nowrap">{item.quantity}</td>
                                                    <td className="whitespace-nowrap">{item.unit}</td>
                                                    <td className="whitespace-nowrap">
                                                        {money(item.current_year_cost)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    openApprovalModal('approve');
                                }}
                                className="ui-btn ui-btn--primary"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                            </button>
                            <button
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    openApprovalModal('reject');
                                }}
                                className="ui-btn ui-btn--danger-solid"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Reject
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Approval/Rejection Modal */}
            <Modal 
                show={showApprovalModal} 
                onClose={() => setShowApprovalModal(false)} 
                title={`${approvalAction === 'approve' ? 'Approve' : 'Reject'} Demand`}
            >
                {selectedDemand && (
                    <div className="space-y-4">
                        <div className="ui-callout">
                            <h4 className="font-medium text-gray-900 mb-2">Demand summary</h4>
                            <p><strong>Item:</strong> {selectedDemand.item_name}</p>
                            <p><strong>Requested By:</strong> {selectedDemand.created_by_name || selectedDemand.creator_name}</p>
                            <p><strong>Cost:</strong> {money(selectedDemand.estimated_cost)}</p>
                        </div>

                        {approvalAction === 'reject' && (
                            <div>
                                <label className="ui-label block mb-2">
                                    Rejection reason *
                                </label>
                                <textarea
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    rows={4}
                                    className="ui-input ui-textarea"
                                    placeholder="Please provide a reason for rejecting this demand..."
                                />
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowApprovalModal(false)}
                                className="ui-btn ui-btn--secondary"
                                disabled={processing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApprovalAction}
                                disabled={processing || (approvalAction === 'reject' && !rejectionReason.trim())}
                                className={`px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white ${
                                    approvalAction === 'approve' 
                                        ? 'bg-blue-600 hover:bg-blue-700' 
                                        : 'bg-red-600 hover:bg-red-700'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {processing ? (
                                    <div className="flex items-center">
                                        <div className="ui-spin mr-2"></div>
                                        Processing...
                                    </div>
                                ) : (
                                    approvalAction === 'approve' ? 'Approve Demand' : 'Reject Demand'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Tender Details Modal */}
            <Modal
                show={showTenderDetailsModal}
                onClose={() => setShowTenderDetailsModal(false)}
                title="Tender Details"
                size="lg"
            >
                {selectedTender && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-gray-900">{selectedTender.item_name}</h3>
                            <p className="text-sm text-gray-600">{selectedTender.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="font-medium">Quantity:</span> {selectedTender.quantity}
                            </div>
                            <div>
                                <span className="font-medium">Estimated Cost:</span> {money(selectedTender.estimated_cost)}
                            </div>
                            <div>
                                <span className="font-medium">Created By:</span> {selectedTender.creator_name}
                            </div>
                            <div>
                                <span className="font-medium">Created:</span> {formatDate(selectedTender.created_at)}
                            </div>
                        </div>
                        {selectedTender.evaluation_criteria && (
                            <div>
                                <h4 className="font-medium text-gray-900 mb-2">Evaluation criteria:</h4>
                                <div className="ui-callout">
                                    <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                                        {typeof selectedTender.evaluation_criteria === 'string' 
                                            ? selectedTender.evaluation_criteria 
                                            : JSON.stringify(selectedTender.evaluation_criteria, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Tender Approval Modal */}
            <Modal
                show={showTenderApprovalModal}
                onClose={() => setShowTenderApprovalModal(false)}
                title={tenderApprovalAction === 'approve' ? 'Approve Tender' : 'Reject Tender'}
            >
                {selectedTender && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-gray-900">{selectedTender.item_name}</h3>
                            <p className="text-sm text-gray-600">{selectedTender.description}</p>
                        </div>

                        {tenderApprovalAction === 'reject' && (
                            <div>
                                <label className="ui-label block mb-2">
                                    Rejection reason *
                                </label>
                                <textarea
                                    value={tenderRejectionReason}
                                    onChange={(e) => setTenderRejectionReason(e.target.value)}
                                    rows={4}
                                    className="ui-input ui-textarea"
                                    placeholder="Please provide a reason for rejecting this tender..."
                                />
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowTenderApprovalModal(false)}
                                className="ui-btn ui-btn--secondary"
                                disabled={processing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleTenderApprovalAction}
                                disabled={processing || (tenderApprovalAction === 'reject' && !tenderRejectionReason.trim())}
                                className={`px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white ${
                                    tenderApprovalAction === 'approve' 
                                        ? 'bg-blue-600 hover:bg-blue-700' 
                                        : 'bg-red-600 hover:bg-red-700'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {processing ? (
                                    <div className="flex items-center">
                                        <div className="ui-spin mr-2"></div>
                                        Processing...
                                    </div>
                                ) : (
                                    tenderApprovalAction === 'approve' ? 'Approve Tender' : 'Reject Tender'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                show={showExpiredPublishModal}
                onClose={closeExpiredPublishModal}
                title="Bidding End Time Has Passed"
            >
                {tenderPendingTimeFix && (
                    <div className="space-y-4">
                        <div className="ui-callout ui-callout--warning flex items-start">
                            <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                            <span>
                                This tender's bidding end time
                                {tenderPendingTimeFix.bidding_end_time && (
                                    <> ({formatDateTime(tenderPendingTimeFix.bidding_end_time)})</>
                                )} has already passed, so it can't be published as-is. Set a new bidding end time to continue.
                            </span>
                        </div>

                        <div>
                            <label className="ui-label block mb-2">
                                New bidding end time *
                            </label>
                            <input
                                type="datetime-local"
                                value={newBiddingEndTime}
                                min={inputValueFromNow(2)}
                                onChange={(e) => setNewBiddingEndTime(e.target.value)}
                                className="ui-input"
                            />
                        </div>

                        <div>
                            <label className="ui-label block mb-2">
                                Reason for extension *
                            </label>
                            <textarea
                                value={timeFixReason}
                                onChange={(e) => setTimeFixReason(e.target.value)}
                                rows={3}
                                className="ui-input ui-textarea"
                                placeholder="Why the bidding end time is being updated..."
                            />
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={closeExpiredPublishModal}
                                className="ui-btn ui-btn--secondary"
                                disabled={processing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleFixTimeAndPublish}
                                disabled={processing || !newBiddingEndTime || !timeFixReason.trim()}
                                className="ui-btn ui-btn--primary"
                            >
                                {processing ? (
                                    <div className="flex items-center">
                                        <div className="ui-spin mr-2"></div>
                                        Processing...
                                    </div>
                                ) : (
                                    'Update Time & Publish'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default HodDashboard;
