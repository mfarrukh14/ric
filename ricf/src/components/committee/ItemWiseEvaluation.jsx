import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const ItemWiseEvaluation = () => {
    const [tender, setTender] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [itemEvaluations, setItemEvaluations] = useState({});
    const [knockoutChecks, setKnockoutChecks] = useState({}); // bidId -> { clauseId: boolean }
    const [grievanceMarked, setGrievanceMarked] = useState({}); // bidId -> true/false
    const [scoring, setScoring] = useState({}); // bidId -> { breakdown: {criteriaId: number}, total: number }
    const [scoreErrors, setScoreErrors] = useState({}); // bidId -> error msg
    const [showRejectionInput, setShowRejectionInput] = useState({}); // Changed to object with bid IDs as keys
    const [rejectionReasons, setRejectionReasons] = useState({}); // Changed to object with bid IDs as keys
    
    const { tenderId } = useParams();
    const navigate = useNavigate();

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
            // Initialize knockout checks for each bid (default all false = evaluator must check to approve)
            const koInit = {};
            (data.bids || []).forEach(b => {
                koInit[b.id] = {};
                (data.knockoutClauses || []).forEach(c => { koInit[b.id][c.id] = false; });
            });
            setKnockoutChecks(koInit);
            // Initialize scoring breakdown structure
            const scoreInit = {};
            (data.bids || []).forEach(b => {
                scoreInit[b.id] = { breakdown: {}, total: 0 };
                (data.scoringCriteria || []).forEach(c => { scoreInit[b.id].breakdown[c.id] = 0; });
            });
            setScoring(scoreInit);
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
        // Only used now for marking grievance (reject path) or internal approval staging
        if (action === 'reject' && !reason) {
            setShowRejectionInput(prev => ({ ...prev, [bidId]: true }));
            return;
        }
        setItemEvaluations(prev => {
            const updated = { ...prev };
            const itemEval = updated[itemId];
            itemEval.approvedCompanies = itemEval.approvedCompanies.filter(c => c.bidId !== bidId);
            itemEval.rejectedCompanies = itemEval.rejectedCompanies.filter(c => c.bidId !== bidId);
            if (action === 'approve') {
                const koMap = knockoutChecks[bidId] || {};
                const scoreObj = scoring[bidId];
                
                // Check if all knockout clauses are satisfied
                const knockoutClausesCount = tender.knockoutClauses ? tender.knockoutClauses.length : 0;
                const passedKnockoutClauses = Object.values(koMap).filter(v => v === true).length;
                const allKnockoutClausesPassed = knockoutClausesCount === 0 || passedKnockoutClauses === knockoutClausesCount;
                
                if (!allKnockoutClausesPassed) { 
                    setError('Cannot approve: All knockout clauses must be satisfied.'); 
                    return prev; 
                }
                
                // Check scoring if scoring criteria exist
                const hasScoringCriteria = tender.scoringCriteria && tender.scoringCriteria.length > 0;
                if (hasScoringCriteria && (!scoreObj || scoreObj.total <= 0)) { 
                    setError('Provide scoring before approval.'); 
                    return prev; 
                }
                
                itemEval.approvedCompanies.push({ bidId, companyName, knockoutChecks: koMap });
            } else if (action === 'reject') {
                if (!reason.trim()) { setError('Rejection reason required'); return prev; }
                itemEval.rejectedCompanies.push({ bidId, companyName, reason, knockoutChecks: knockoutChecks[bidId], grievanceMarked: grievanceMarked[bidId] || false });
            }
            return updated;
        });
        setError('');
    };

    const handleRejectionSubmit = (itemId, bidId, companyName) => {
        const reason = rejectionReasons[bidId];
        if (!reason || !reason.trim()) {
            setError('Please provide a reason for rejection');
            return;
        }

        handleCompanyEvaluation(itemId, bidId, companyName, 'reject', reason);
        
        // Clear the input and hide it
        setShowRejectionInput(prev => ({
            ...prev,
            [bidId]: false
        }));
        setRejectionReasons(prev => ({
            ...prev,
            [bidId]: ''
        }));
    };

    const handleRejectionCancel = (bidId) => {
        setShowRejectionInput(prev => ({
            ...prev,
            [bidId]: false
        }));
        setRejectionReasons(prev => ({
            ...prev,
            [bidId]: ''
        }));
    };

    const handleReasonChange = (bidId, value) => {
        setRejectionReasons(prev => ({
            ...prev,
            [bidId]: value
        }));
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
        
        // Filter bids to only show companies that actually bid for this specific item
        return tender.bids.filter(bid => {
            // Check if this bid has item-specific data for the current item
            if (bid.bidItems && bid.bidItems.length > 0) {
                return bid.bidItems.some(bidItem => 
                    bidItem.item_id === itemId && 
                    bidItem.proposed_quantity > 0 && 
                    bidItem.total_cost > 0
                );
            }
            // For legacy single-item tenders (where itemId is 0), show all bids
            return itemId === 0;
        });
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
                body: JSON.stringify({ evaluations: itemEvaluations, scoring })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit evaluation');
            }

            const data = await response.json();
            alert(data.message);
            
            // Mark evaluation as completed after successful submission
            await markEvaluationCompleted();
            
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const markEvaluationCompleted = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-reports/tender/${tenderId}/complete`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.error('Failed to mark evaluation as completed');
            }
        } catch (error) {
            console.error('Error marking evaluation as completed:', error);
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
                    {!error && tender && (!tender.scoringCriteria || tender.scoringCriteria.length === 0) && (
                        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded text-sm">
                            No scoring criteria were defined for this tender. Only knockout clause compliance will be considered. (Purchase team can append scoring via add-criteria endpoint.)
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

                                        const koMap = knockoutChecks[bid.id] || {};
                                        const scoreObj = scoring[bid.id] || { breakdown: {}, total: 0 };
                                        
                                        // Check if all knockout clauses are satisfied (all must be checked/true)
                                        const knockoutClausesCount = tender.knockoutClauses ? tender.knockoutClauses.length : 0;
                                        const passedKnockoutClauses = Object.values(koMap).filter(v => v === true).length;
                                        const allKnockoutClausesPassed = knockoutClausesCount === 0 || passedKnockoutClauses === knockoutClausesCount;
                                        
                                        // Check if any knockout clause failed (unchecked or false)
                                        const hasKnockoutFailures = Object.values(koMap).some(v => v === false) && knockoutClausesCount > 0;
                                        
                                        // Can approve if all knockout clauses pass and has scoring (if scoring criteria exist)
                                        const hasScoringCriteria = tender.scoringCriteria && tender.scoringCriteria.length > 0;
                                        const canApprove = allKnockoutClausesPassed && (!hasScoringCriteria || scoreObj.total > 0);
                                        
                                        const grievanceFlag = grievanceMarked[bid.id];
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

                                                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                                                    <div>
                                                        <span className="font-medium">Proposed Quantity:</span>
                                                        <div>{
                                                            (() => {
                                                                // Show item-specific quantity if available
                                                                if (bid.bidItems && bid.bidItems.length > 0) {
                                                                    const itemBid = bid.bidItems.find(item => item.item_id === currentItem.id);
                                                                    return itemBid ? `${itemBid.proposed_quantity} ${itemBid.unit || 'units'}` : 'No bid for this item';
                                                                }
                                                                // Fallback for legacy single-item tenders
                                                                return `${bid.proposed_quantity} units`;
                                                            })()
                                                        }</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Manufacturer/Brand:</span>
                                                        <div>{
                                                            (() => {
                                                                // Show item-specific manufacturer brand if available
                                                                if (bid.bidItems && bid.bidItems.length > 0) {
                                                                    const itemBid = bid.bidItems.find(item => item.item_id === currentItem.id);
                                                                    return itemBid?.manufacturer_brand || 'Not specified';
                                                                }
                                                                // For legacy tenders without item-specific data
                                                                return 'Not specified';
                                                            })()
                                                        }</div>
                                                    </div>
                                                </div>

                                                {/* Pricing Information */}
                                                {(() => {
                                                    if (bid.bidItems && bid.bidItems.length > 0) {
                                                        const itemBid = bid.bidItems.find(item => item.item_id === currentItem.id);
                                                        if (itemBid) {
                                                            // Calculate price per unit: total_cost / required_quantity
                                                            const totalCost = parseFloat(itemBid.total_cost || 0);
                                                            const requiredQty = parseInt(itemBid.required_quantity || 1);
                                                            const pricePerUnit = requiredQty > 0 ? (totalCost / requiredQty) : 0;
                                                            
                                                            return (
                                                                <div className="grid grid-cols-2 gap-4 text-sm mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                                                                    <div>
                                                                        <span className="font-medium text-green-800">Total Cost:</span>
                                                                        <div className="text-green-900 font-semibold">Rs {totalCost.toLocaleString()}</div>
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium text-green-800">Price per Unit:</span>
                                                                        <div className="text-green-900 font-semibold">Rs {pricePerUnit.toLocaleString()}</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                    }
                                                    return null;
                                                })()}

                                                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
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

                                                {/* Knockout Clauses Checklist */}
                                                {tender.knockoutClauses && tender.knockoutClauses.length > 0 && (
                                                    <div className="mt-4 border-t pt-4">
                                                        <h6 className="text-sm font-semibold text-red-700 mb-2 flex items-center">
                                                            <span className="mr-2">Knockout Clauses</span>
                                                            <span className="text-xs font-normal text-red-500">(Check if clause is satisfied)</span>
                                                        </h6>
                                                        <div className="grid md:grid-cols-2 gap-2">
                                                            {tender.knockoutClauses.map(clause => (
                                                                <label key={clause.id} className="flex items-start space-x-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-900">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="mt-0.5 h-4 w-4 text-red-600"
                                                                        checked={koMap[clause.id] === true}
                                                                        onChange={(e) => setKnockoutChecks(prev => ({
                                                                            ...prev,
                                                                            [bid.id]: { ...prev[bid.id], [clause.id]: e.target.checked }
                                                                        }))}
                                                                    />
                                                                    <span><span className="font-medium">{clause.criteria_title}:</span> {clause.criteria_description}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        
                                                        {/* Status indicator */}
                                                        <div className="mt-3 text-xs">
                                                            {allKnockoutClausesPassed ? (
                                                                <div className="inline-flex items-center space-x-1 bg-green-50 border border-green-200 rounded p-2 text-green-800">
                                                                    <span className="text-green-600">✓</span>
                                                                    <span>All knockout clauses satisfied</span>
                                                                </div>
                                                            ) : hasKnockoutFailures ? (
                                                                <div className="inline-flex items-center space-x-1 bg-red-50 border border-red-200 rounded p-2 text-red-800">
                                                                    <span className="text-red-600">✗</span>
                                                                    <span>Knockout clause(s) failed - requires grievance handling</span>
                                                                </div>
                                                            ) : (
                                                                <div className="inline-flex items-center space-x-1 bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-800">
                                                                    <span className="text-yellow-600">⚠</span>
                                                                    <span>Please evaluate all knockout clauses</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        
                                                        {hasKnockoutFailures && (
                                                            <label className="mt-3 inline-flex items-center space-x-2 bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-800">
                                                                <input
                                                                    type="checkbox"
                                                                    className="h-4 w-4 text-purple-600"
                                                                    checked={grievanceMarked[bid.id] || false}
                                                                    onChange={(e) => setGrievanceMarked(prev => ({ ...prev, [bid.id]: e.target.checked }))}
                                                                />
                                                                <span>Mark for grievance (knockout failure)</span>
                                                            </label>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Scoring & Actions */}
                                                <div className="border-t pt-4 space-y-4">
                                                    {tender.scoringCriteria && tender.scoringCriteria.length > 0 && (
                                                        <div>
                                                            <h6 className="text-sm font-semibold text-blue-700 mb-2">Scoring Criteria (Total out of 100)</h6>
                                                            <div className="space-y-2">
                                                                {tender.scoringCriteria.map(criteria => (
                                                                    <div key={criteria.id} className="flex items-center justify-between text-xs bg-blue-50 border border-blue-200 rounded p-2">
                                                                        <div className="pr-2">
                                                                            <div className="font-medium text-blue-900">{criteria.criteria_title}</div>
                                                                            <div className="text-blue-700">Weight: {criteria.weightage}%</div>
                                                                        </div>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            max={criteria.weightage}
                                                                            value={scoreObj.breakdown[criteria.id] ?? 0}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value || '0');
                                                                                setScoring(prev => {
                                                                                    const copy = { ...prev };
                                                                                    const bidScore = { ...copy[bid.id] };
                                                                                    bidScore.breakdown = { ...bidScore.breakdown, [criteria.id]: val };
                                                                                    // Recompute total as sum of (entered / weightageMax * weightage) but here direct sum of entered points
                                                                                    const total = Object.entries(bidScore.breakdown).reduce((s,[cid, v]) => s + (parseFloat(v) || 0), 0);
                                                                                    bidScore.total = total;
                                                                                    copy[bid.id] = bidScore;
                                                                                    return copy;
                                                                                });
                                                                            }}
                                                                            className="w-20 p-1 border rounded text-right"
                                                                        />
                                                                    </div>
                                                                ))}
                                                                <div className="text-xs font-semibold text-blue-800">Total Score: {scoreObj.total}</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center space-x-3">
                                                        {/* Approve Button - only show if not marked for grievance */}
                                                        {!grievanceFlag && (
                                                            <button
                                                                onClick={() => handleCompanyEvaluation(currentItem.id, bid.id, bid.company_name, 'approve')}
                                                                disabled={!canApprove || status === 'approved'}
                                                                className={`px-3 py-1 text-sm rounded ${
                                                                    canApprove && status !== 'approved' 
                                                                        ? 'bg-green-600 text-white hover:bg-green-700' 
                                                                        : status === 'approved' 
                                                                        ? 'bg-green-600 text-white' 
                                                                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                                }`}
                                                                title={
                                                                    !allKnockoutClausesPassed 
                                                                        ? 'All knockout clauses must be satisfied before approval'
                                                                        : hasScoringCriteria && scoreObj.total <= 0
                                                                        ? 'Scoring must be completed before approval'
                                                                        : ''
                                                                }
                                                            >
                                                                {status === 'approved' ? '✓ Approved' : 'Approve'}
                                                            </button>
                                                        )}
                                                        
                                                        {/* Send For Grievance Button - only show if grievance is marked */}
                                                        {grievanceFlag && (
                                                            <button
                                                                onClick={() => handleCompanyEvaluation(currentItem.id, bid.id, bid.company_name, 'reject')}
                                                                disabled={status === 'rejected'}
                                                                className={`px-3 py-1 text-sm rounded ${
                                                                    status === 'rejected' 
                                                                        ? 'bg-red-600 text-white' 
                                                                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                                }`}
                                                            >
                                                                {status === 'rejected' ? '✗ Sent for Grievance' : 'Send For Grievance'}
                                                            </button>
                                                        )}
                                                        
                                                        {/* Pending status indicator */}
                                                        {status === 'pending' && !grievanceFlag && !canApprove && (
                                                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded">
                                                                {!allKnockoutClausesPassed ? 'Complete Knockout Evaluation' : 'Complete Scoring'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Inline rejection reason input */}
                                                    {showRejectionInput[bid.id] && (
                                                        <div className="mt-3">
                                                            <div className="bg-red-50 rounded-md p-3 border border-red-200">
                                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                    Reason for Rejection:
                                                                </label>
                                                                <textarea
                                                                    value={rejectionReasons[bid.id] || ''}
                                                                    onChange={(e) => handleReasonChange(bid.id, e.target.value)}
                                                                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                                                    rows="2"
                                                                    placeholder="Enter reason for rejection"
                                                                ></textarea>
                                                                <div className="flex justify-end space-x-2 mt-2">
                                                                    <button
                                                                        onClick={() => handleRejectionCancel(bid.id)}
                                                                        className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRejectionSubmit(currentItem.id, bid.id, bid.company_name)}
                                                                        className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                                                    >
                                                                        Submit
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

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