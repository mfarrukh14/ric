import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const ItemWiseEvaluation = () => {
    const [tender, setTender] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [itemEvaluations, setItemEvaluations] = useState({});
    
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const apiUrl = 'http://localhost:5000/api';

    useEffect(() => {
        if (tenderId) {
            fetchTenderDetails();
        }
    }, [tenderId]);

    const fetchTenderDetails = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/tenders/${tenderId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch tender details');
            }

            const data = await response.json();
            setTender(data);
            
            // Initialize evaluation state for each item
            const initialEvaluations = {};
            data.items?.forEach(item => {
                initialEvaluations[item.id] = {
                    approvedCompanies: [],
                    rejectedCompanies: []
                };
            });
            setItemEvaluations(initialEvaluations);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadTechnicalBid = async (bidId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/bids/${bidId}/technical-document`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to download technical bid');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `technical-bid-${bidId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleCompanyEvaluation = (itemId, bidId, companyName, action, reason = '') => {
        setItemEvaluations(prev => {
            const updated = { ...prev };
            const itemEval = updated[itemId];
            
            // Remove from both arrays first
            itemEval.approvedCompanies = itemEval.approvedCompanies.filter(c => c.bidId !== bidId);
            itemEval.rejectedCompanies = itemEval.rejectedCompanies.filter(c => c.bidId !== bidId);
            
            // Add to appropriate array
            if (action === 'approve') {
                itemEval.approvedCompanies.push({ bidId, companyName });
            } else if (action === 'reject') {
                if (!reason.trim()) {
                    setError('Rejection reason is required');
                    return prev;
                }
                itemEval.rejectedCompanies.push({ bidId, companyName, reason });
            }
            
            return updated;
        });
        setError('');
    };

    const getCompanyEvaluationStatus = (itemId, bidId) => {
        const itemEval = itemEvaluations[itemId];
        if (!itemEval) return 'pending';
        
        if (itemEval.approvedCompanies.some(c => c.bidId === bidId)) return 'approved';
        if (itemEval.rejectedCompanies.some(c => c.bidId === bidId)) return 'rejected';
        return 'pending';
    };

    const getCompanyRejectionReason = (itemId, bidId) => {
        const itemEval = itemEvaluations[itemId];
        if (!itemEval) return '';
        
        const rejected = itemEval.rejectedCompanies.find(c => c.bidId === bidId);
        return rejected ? rejected.reason : '';
    };

    const getItemBids = (itemId) => {
        if (!tender?.bids) return [];
        
        // For now, return all bids since we don't have item-specific bidding
        // In a real system, you'd filter bids by item
        return tender.bids;
    };

    const nextStep = () => {
        if (currentStep < tender?.items?.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const submitEvaluation = async () => {
        try {
            setSaving(true);
            
            // Validate that all items have been evaluated
            const hasUnevaluatedItems = tender.items.some(item => {
                const itemEval = itemEvaluations[item.id];
                const itemBids = getItemBids(item.id);
                return itemBids.some(bid => getCompanyEvaluationStatus(item.id, bid.id) === 'pending');
            });

            if (hasUnevaluatedItems) {
                setError('Please evaluate all companies for all items before submitting');
                return;
            }

            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/tenders/${tenderId}/item-wise-evaluation`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    evaluations: itemEvaluations
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit evaluation');
            }

            const data = await response.json();
            alert(data.message);
            navigate('/committee/technical-evaluation');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!tender) {
        return (
            <div className="text-center text-gray-500 py-8">
                Tender not found
            </div>
        );
    }

    const currentItem = tender.items?.[currentStep - 1];
    const itemBids = getItemBids(currentItem?.id);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-lg leading-6 font-medium text-gray-900">
                                Item-wise Technical Evaluation
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                                {tender.item_name} - Tender ID: {tender.id}
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/committee/technical-evaluation')}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                        >
                            Back to List
                        </button>
                    </div>

                    {/* Progress indicator */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                            <span>Step {currentStep} of {tender.items?.length || 0}</span>
                            <span>{Math.round((currentStep / (tender.items?.length || 1)) * 100)}% Complete</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(currentStep / (tender.items?.length || 1)) * 100}%` }}
                            ></div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Current Item Evaluation */}
            {currentItem && (
                <div className="bg-white shadow rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="mb-6">
                            <h4 className="text-xl font-medium text-gray-900 mb-2">
                                {currentItem.item_name}
                            </h4>
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                                <div>
                                    <span className="font-medium">Required Quantity:</span> {currentItem.quantity} {currentItem.unit || 'units'}
                                </div>
                                {currentItem.remarks && (
                                    <div>
                                        <span className="font-medium">Remarks:</span> {currentItem.remarks}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Companies bidding for this item */}
                        <div>
                            <h5 className="text-lg font-medium text-gray-900 mb-4">
                                Companies Bidding ({itemBids.length})
                            </h5>

                            {itemBids.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">
                                    No companies have bid for this item
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {itemBids.map((bid) => {
                                        const status = getCompanyEvaluationStatus(currentItem.id, bid.id);
                                        const rejectionReason = getCompanyRejectionReason(currentItem.id, bid.id);

                                        return (
                                            <div key={bid.id} className="border rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex-1">
                                                        <h6 className="font-medium text-gray-900">
                                                            {bid.company_name}
                                                        </h6>
                                                        <p className="text-sm text-gray-600">{bid.company_email}</p>
                                                    </div>
                                                    
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={() => downloadTechnicalBid(bid.id)}
                                                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                                        >
                                                            Download Technical Bid
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                                                    <div>
                                                        <span className="font-medium">Proposed Quantity:</span>
                                                        <div>{bid.proposed_quantity}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Delivery Time:</span>
                                                        <div>{bid.delivery_days} days</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Submitted:</span>
                                                        <div>{formatDate(bid.created_at)}</div>
                                                    </div>
                                                </div>

                                                {bid.bid_comments && (
                                                    <div className="mb-4 p-3 bg-gray-50 rounded">
                                                        <span className="font-medium text-sm">Comments:</span>
                                                        <p className="text-sm mt-1">{bid.bid_comments}</p>
                                                    </div>
                                                )}

                                                {/* Evaluation Actions */}
                                                <div className="border-t pt-4">
                                                    <div className="flex items-center space-x-4">
                                                        <span className="text-sm font-medium text-gray-700">
                                                            Evaluation:
                                                        </span>
                                                        
                                                        <button
                                                            onClick={() => handleCompanyEvaluation(currentItem.id, bid.id, bid.company_name, 'approve')}
                                                            className={`px-3 py-1 text-sm rounded ${
                                                                status === 'approved' 
                                                                    ? 'bg-green-600 text-white' 
                                                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                            }`}
                                                        >
                                                            {status === 'approved' ? '✓ Approved' : 'Approve'}
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                const reason = prompt('Please enter rejection reason:');
                                                                if (reason) {
                                                                    handleCompanyEvaluation(currentItem.id, bid.id, bid.company_name, 'reject', reason);
                                                                }
                                                            }}
                                                            className={`px-3 py-1 text-sm rounded ${
                                                                status === 'rejected' 
                                                                    ? 'bg-red-600 text-white' 
                                                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                            }`}
                                                        >
                                                            {status === 'rejected' ? '✗ Rejected' : 'Reject'}
                                                        </button>

                                                        {status === 'pending' && (
                                                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </div>

                                                    {status === 'rejected' && rejectionReason && (
                                                        <div className="mt-2 p-2 bg-red-50 rounded text-sm">
                                                            <span className="font-medium text-red-700">Rejection Reason:</span>
                                                            <p className="text-red-600 mt-1">{rejectionReason}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Navigation */}
                        <div className="mt-8 flex justify-between">
                            <button
                                onClick={prevStep}
                                disabled={currentStep === 1}
                                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed"
                            >
                                Previous Item
                            </button>

                            {currentStep < tender.items?.length ? (
                                <button
                                    onClick={nextStep}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                >
                                    Next Item
                                </button>
                            ) : (
                                <button
                                    onClick={submitEvaluation}
                                    disabled={saving}
                                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300"
                                >
                                    {saving ? 'Saving...' : 'Submit Evaluation'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Section */}
            <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Evaluation Summary</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tender.items?.map((item, index) => {
                            const itemEval = itemEvaluations[item.id] || { approvedCompanies: [], rejectedCompanies: [] };
                            const itemBidsCount = getItemBids(item.id).length;
                            const evaluatedCount = itemEval.approvedCompanies.length + itemEval.rejectedCompanies.length;
                            
                            return (
                                <div key={item.id} className="border rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <h6 className="font-medium text-sm text-gray-900 truncate">
                                            {item.item_name}
                                        </h6>
                                        <span className={`px-2 py-1 text-xs rounded ${
                                            currentStep === index + 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            Step {index + 1}
                                        </span>
                                    </div>
                                    
                                    <div className="text-xs text-gray-600 space-y-1">
                                        <div>Total Bids: {itemBidsCount}</div>
                                        <div>Evaluated: {evaluatedCount}/{itemBidsCount}</div>
                                        <div className="flex space-x-2">
                                            <span className="text-green-600">✓ {itemEval.approvedCompanies.length}</span>
                                            <span className="text-red-600">✗ {itemEval.rejectedCompanies.length}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ItemWiseEvaluation;