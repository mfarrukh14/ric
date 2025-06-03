import React, { useState, useEffect } from 'react';

const TechnicalEvaluation = () => {
    const [expiredTenders, setExpiredTenders] = useState([]);
    const [selectedTender, setSelectedTender] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [evaluating, setEvaluating] = useState(false);
    const [showAwardModal, setShowAwardModal] = useState(false);
    const [selectedBidId, setSelectedBidId] = useState('');
    const [remarks, setRemarks] = useState('');

    const apiUrl = 'http://localhost:5000/api';

    useEffect(() => {
        fetchExpiredTenders();
    }, []);

    const fetchExpiredTenders = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/expired-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch expired tenders');
            }

            const data = await response.json();
            setExpiredTenders(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchTenderDetails = async (tenderId) => {
        try {
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
            setSelectedTender(data);
        } catch (err) {
            setError(err.message);
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

            // Create download link
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

    const handleAwardTender = () => {
        if (!selectedBidId) {
            setError('Please select a bid to award');
            return;
        }
        setShowAwardModal(true);
    };

    const submitAward = async () => {
        try {
            setEvaluating(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/tenders/${selectedTender.id}/award`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selectedBidId: parseInt(selectedBidId),
                    remarks: remarks
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to award tender');
            }

            const data = await response.json();
            alert(data.message);
            setShowAwardModal(false);
            setSelectedTender(null);
            setSelectedBidId('');
            setRemarks('');
            fetchExpiredTenders(); // Refresh the list
        } catch (err) {
            setError(err.message);
        } finally {
            setEvaluating(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR'
        }).format(amount);
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

    return (
        <div className="space-y-6">
            <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                        Technical Evaluation - Expired Tenders
                    </h3>

                    {error && (
                        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    {expiredTenders.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            No expired tenders requiring evaluation
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {expiredTenders.map((tender) => (
                                <div key={tender.id} className="border rounded-lg p-4 hover:bg-gray-50">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h4 className="text-lg font-medium text-gray-900">
                                                {tender.item_name}
                                            </h4>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {tender.description}
                                            </p>
                                            <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="font-medium">Tender ID:</span> {tender.id}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Urgency:</span> 
                                                    <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
                                                        tender.urgency === 'urgent' ? 'bg-red-100 text-red-800' :
                                                        tender.urgency === 'normal' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-green-100 text-green-800'
                                                    }`}>
                                                        {tender.urgency}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="font-medium">Expired On:</span> {formatDate(tender.bidding_end_time)}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Total Bids:</span> {tender.bids?.length || 0}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => fetchTenderDetails(tender.id)}
                                            className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            Evaluate Bids
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Tender Details Modal */}
            {selectedTender && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">
                                Tender Evaluation - {selectedTender.item_name}
                            </h3>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Tender Information */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="font-medium text-gray-900 mb-3">Tender Information</h4>
                                    <div className="space-y-2 text-sm">
                                        <div><span className="font-medium">Tender ID:</span> {selectedTender.id}</div>
                                        <div><span className="font-medium">Description:</span> {selectedTender.description}</div>
                                        <div><span className="font-medium">Urgency:</span> {selectedTender.urgency}</div>
                                        <div><span className="font-medium">Required By:</span> {selectedTender.required_by}</div>
                                        <div><span className="font-medium">Expired On:</span> {formatDate(selectedTender.bidding_end_time)}</div>
                                        <div><span className="font-medium">Created By:</span> {selectedTender.created_by_name}</div>
                                        <div><span className="font-medium">Department:</span> {selectedTender.creator_department}</div>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="font-medium text-gray-900 mb-3">Items Required</h4>
                                    <div className="space-y-2">
                                        {selectedTender.items?.map((item, index) => (
                                            <div key={index} className="text-sm bg-white p-2 rounded">
                                                <div><span className="font-medium">Item:</span> {item.item_name}</div>
                                                <div><span className="font-medium">Quantity:</span> {item.quantity} {item.unit}</div>
                                                {item.estimated_cost && (
                                                    <div><span className="font-medium">Est. Cost:</span> {formatCurrency(item.estimated_cost)}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Bids Section */}
                            <div className="mt-6">
                                <h4 className="font-medium text-gray-900 mb-3">
                                    Submitted Bids ({selectedTender.bids?.length || 0})
                                </h4>

                                {selectedTender.bids?.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                        No bids submitted for this tender
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedTender.bids?.map((bid) => (
                                            <div key={bid.id} className="border rounded-lg p-4">
                                                <div className="flex items-center justify-between">
                                                    <label className="flex items-center">
                                                        <input
                                                            type="radio"
                                                            name="selectedBid"
                                                            value={bid.id}
                                                            checked={selectedBidId === bid.id.toString()}
                                                            onChange={(e) => setSelectedBidId(e.target.value)}
                                                            className="mr-3"
                                                        />
                                                        <div>
                                                            <h5 className="font-medium text-gray-900">
                                                                {bid.company_name}
                                                            </h5>
                                                            <p className="text-sm text-gray-600">{bid.company_email}</p>
                                                        </div>
                                                    </label>
                                                    <button
                                                        onClick={() => downloadTechnicalBid(bid.id)}
                                                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                                    >
                                                        Download Technical Bid
                                                    </button>
                                                </div>

                                                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <span className="font-medium">Total Cost:</span>
                                                        <div className="text-lg font-bold text-green-600">
                                                            {formatCurrency(bid.total_cost)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Quantity:</span>
                                                        <div>{bid.proposed_quantity}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Delivery:</span>
                                                        <div>{bid.delivery_days} days</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Submitted:</span>
                                                        <div>{formatDate(bid.created_at)}</div>
                                                    </div>
                                                </div>

                                                {bid.bid_comments && (
                                                    <div className="mt-3 p-3 bg-gray-50 rounded">
                                                        <span className="font-medium text-sm">Comments:</span>
                                                        <p className="text-sm mt-1">{bid.bid_comments}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-6 flex justify-between">
                                <button
                                    onClick={() => setSelectedTender(null)}
                                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                                >
                                    Close
                                </button>
                                
                                {selectedTender.bids?.length > 0 && (
                                    <button
                                        onClick={handleAwardTender}
                                        disabled={!selectedBidId}
                                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                        Award Tender
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Award Confirmation Modal */}
            {showAwardModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">
                                Confirm Tender Award
                            </h3>
                            
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Evaluation Remarks
                                </label>
                                <textarea
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Enter evaluation remarks..."
                                />
                            </div>

                            <div className="flex justify-between">
                                <button
                                    onClick={() => setShowAwardModal(false)}
                                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitAward}
                                    disabled={evaluating}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300"
                                >
                                    {evaluating ? 'Awarding...' : 'Confirm Award'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TechnicalEvaluation;