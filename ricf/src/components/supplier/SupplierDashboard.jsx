import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const SupplierDashboard = () => {
    const [supplier, setSupplier] = useState(null);
    const [activeTenders, setActiveTenders] = useState([]);
    const [myBids, setMyBids] = useState([]);
    const [activeTab, setActiveTab] = useState('tenders');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedTender, setSelectedTender] = useState(null);
    const [showBidModal, setShowBidModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);    const [bidForm, setBidForm] = useState({
        proposedQuantity: '',
        totalCost: '',
        deliveryTime: '',
        comments: ''
    });
    const navigate = useNavigate();

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (stored) {
            const userData = JSON.parse(stored);
            if (userData.role === 'supplier') {
                setSupplier(userData);
                fetchActiveTenders();
                fetchMyBids();
            } else {
                navigate('/');
            }
        } else {
            navigate('/');
        }
    }, [navigate]);    const fetchActiveTenders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/tenders/active`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch active tenders');
            }

            const data = await response.json();
            setActiveTenders(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };    const fetchMyBids = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/bids/my-bids`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch bids');
            }

            const data = await response.json();
            setMyBids(data);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleBidSubmit = async (e) => {
        e.preventDefault();
        setError('');        if (!bidForm.proposedQuantity || !bidForm.totalCost || !bidForm.deliveryTime) {
            setError('Proposed quantity, total cost, and delivery time are required');
            return;
        }

        if (parseFloat(bidForm.totalCost) <= 0) {
            setError('Total cost must be greater than 0');
            return;
        }

        if (parseInt(bidForm.proposedQuantity) <= 0) {
            setError('Proposed quantity must be greater than 0');
            return;
        }

        if (parseInt(bidForm.deliveryTime) <= 0) {
            setError('Delivery time must be greater than 0');
            return;
        }        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/tenders/${selectedTender.id}/bid`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    proposedQuantity: parseInt(bidForm.proposedQuantity),
                    totalCost: parseFloat(bidForm.totalCost),
                    deliveryDays: parseInt(bidForm.deliveryTime),
                    comments: bidForm.comments
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit bid');
            }            setShowBidModal(false);
            setBidForm({ proposedQuantity: '', totalCost: '', deliveryTime: '', comments: '' });
            fetchMyBids(); // Refresh bids list
            
            // Show success modal
            setShowSuccessModal(true);
            setTimeout(() => {
                setShowSuccessModal(false);
            }, 2000);
        } catch (err) {
            setError(err.message);
        }
    };    const handleBidClick = (tender) => {
        setSelectedTender(tender);
        
        // Check if we already have a bid for this tender
        const existingBid = myBids.find(bid => bid.tender_id === tender.id);
        if (existingBid) {
            // Prevent opening modal if bid already exists
            setError('You have already submitted a bid for this tender. Bids cannot be modified once submitted.');
            return;
        }
        
        // Reset form for new bid
        setBidForm({ proposedQuantity: '', totalCost: '', deliveryTime: '', comments: '' });
        setShowBidModal(true);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setBidForm(prev => ({
            ...prev,
            [name]: value
        }));
    };    const getTimeRemaining = (endTime) => {
        const now = new Date();
        // Handle date format like '2025-05-31T19:56' by adding seconds if missing
        let endTimeString = endTime;
        if (endTime && !endTime.includes('Z') && endTime.split(':').length === 2) {
            endTimeString = endTime + ':00'; // Add seconds
        }
        const end = new Date(endTimeString);
        
        // Check if date is valid
        if (isNaN(end.getTime())) {
            return 'Invalid date';
        }
        
        const diff = end - now;
        
        if (diff <= 0) return 'Expired';
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) return `${days}d ${hours}h remaining`;
        if (hours > 0) return `${hours}h ${minutes}m remaining`;
        return `${minutes}m remaining`;
    };

    const formatDateTime = (dateTime) => {
        if (!dateTime) return 'Not set';
        
        // Handle date format like '2025-05-31T19:56' by adding seconds if missing
        let dateTimeString = dateTime;
        if (dateTime && !dateTime.includes('Z') && dateTime.split(':').length === 2) {
            dateTimeString = dateTime + ':00'; // Add seconds
        }
        
        const date = new Date(dateTimeString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'Invalid date';
        }
        
        return date.toLocaleString();
    };

    const isExpired = (endTime) => {
        if (!endTime) return true;
        
        const now = new Date();
        let endTimeString = endTime;
        if (endTime && !endTime.includes('Z') && endTime.split(':').length === 2) {
            endTimeString = endTime + ':00';
        }
        const end = new Date(endTimeString);
        
        return isNaN(end.getTime()) || end <= now;
    };

    const getUrgencyBadge = (urgency) => {
        const colors = {
            'high': 'bg-red-100 text-red-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-blue-100 text-blue-800',
            'low': 'bg-green-100 text-green-800'
        };
        
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[urgency] || colors.normal}`}>
                {urgency.toUpperCase()}
            </span>
        );
    };

    const getBidStatus = (bid) => {
        if (bid.tender_status === 'awarded') {
            if (bid.awarded_supplier_id === bid.supplier_id) {
                return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">WON</span>;
            } else {
                return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">LOST</span>;
            }
        } else if (bid.tender_status === 'active' && new Date(bid.bidding_end_time) > new Date()) {
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">ACTIVE</span>;
        } else if (bid.tender_status === 'active' && new Date(bid.bidding_end_time) <= new Date()) {
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">UNDER REVIEW</span>;
        }
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">CLOSED</span>;
    };

    if (!supplier || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        );
    }    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex items-center">
                            <h1 className="text-xl font-semibold text-gray-900">Supplier Dashboard</h1>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    {error && (
                        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                            {error}
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="mb-6">
                        <nav className="flex space-x-8" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('tenders')}
                                className={`${
                                    activeTab === 'tenders'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                Active Tenders ({activeTenders.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('bids')}
                                className={`${
                                    activeTab === 'bids'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                My Bids ({myBids.length})
                            </button>
                        </nav>
                    </div>

                    {/* Active Tenders Tab */}
                    {activeTab === 'tenders' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:px-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">
                                    Active Tenders
                                </h3>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                    Current open tenders available for bidding
                                </p>
                            </div>
                            {activeTenders.length === 0 ? (
                                <div className="px-4 py-5 sm:p-6 text-center">
                                    <p className="text-gray-500">No active tenders available at the moment.</p>
                                </div>
                            ) : (                                <ul className="divide-y divide-gray-200">
                                    {activeTenders.map((tender) => (
                                        <li key={tender.id} className="px-4 py-6 sm:px-6 hover:bg-gray-50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {tender.items.length > 1 ? 
                                                                `Multi-Item Tender (${tender.items.length} items)` : 
                                                                tender.item_name || tender.items[0]?.item_name
                                                            }
                                                        </h3>
                                                        {getUrgencyBadge(tender.urgency)}
                                                    </div>
                                                    
                                                    {/* Items Display */}
                                                    {tender.items && tender.items.length > 0 ? (
                                                        <div className="mb-4">
                                                            <h4 className="font-medium text-gray-900 mb-3">Items in this Tender:</h4>
                                                            <div className="space-y-3 max-h-48 overflow-y-auto">
                                                                {tender.items.map((item, index) => (
                                                                    <div key={item.id || index} className="bg-gray-50 rounded-lg p-3 border">
                                                                        <div className="flex justify-between items-start mb-2">
                                                                            <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                                            <span className="text-sm text-gray-500">Item #{index + 1}</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-600">
                                                                            <div>
                                                                                <span className="font-medium">Quantity:</span> {item.quantity}
                                                                            </div>
                                                                            {item.estimated_cost && (
                                                                                <div>
                                                                                    <span className="font-medium">Est. Cost:</span> ₹{item.estimated_cost}
                                                                                </div>
                                                                            )}
                                                                            {item.unit && (
                                                                                <div>
                                                                                    <span className="font-medium">Unit:</span> {item.unit}
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
                                                        /* Fallback for legacy single-item display */
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                            <div className="bg-blue-50 p-3 rounded-lg">
                                                                <p className="text-sm font-medium text-blue-800">Quantity Required</p>
                                                                <p className="text-xl font-bold text-blue-900">{tender.quantity}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                        <div className="bg-orange-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-orange-800">Time Remaining</p>
                                                            <p className="text-lg font-bold text-orange-900">
                                                                {getTimeRemaining(tender.bidding_end_time)}
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="bg-green-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-green-800">Required By</p>
                                                            <p className="text-lg font-bold text-green-900">
                                                                {new Date(tender.required_by).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="bg-purple-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-purple-800">Total Items</p>
                                                            <p className="text-lg font-bold text-purple-900">
                                                                {tender.items?.length || 1}
                                                            </p>
                                                        </div>
                                                    </div>
                                                      <div className="text-sm text-gray-600 mb-3">
                                                        <p><span className="font-medium">Description:</span> {tender.description}</p>
                                                        <p className="mt-1">
                                                            <span className="font-medium">Bidding Expires:</span> {' '}
                                                            {formatDateTime(tender.bidding_end_time)}
                                                        </p>
                                                    </div>
                                                </div>
                                                  <div className="ml-6 flex-shrink-0">
                                                    {!isExpired(tender.bidding_end_time) ? (
                                                        myBids.find(bid => bid.tender_id === tender.id) ? (
                                                            <span className="text-sm text-green-600 font-medium bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                                                                Bid Submitted
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleBidClick(tender)}
                                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg text-sm font-medium shadow-md transition-colors"
                                                            >
                                                                Apply to Tender
                                                            </button>
                                                        )
                                                    ) : (
                                                        <span className="text-sm text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                                                            Expired
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* My Bids Tab */}
                    {activeTab === 'bids' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:px-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">
                                    My Bids
                                </h3>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                    Your submitted bids and their status
                                </p>
                            </div>
                            {myBids.length === 0 ? (
                                <div className="px-4 py-5 sm:p-6 text-center">
                                    <p className="text-gray-500">You haven't submitted any bids yet.</p>
                                </div>
                            ) : (                                <ul className="divide-y divide-gray-200">
                                    {myBids.map((bid) => (
                                        <li key={bid.id} className="px-4 py-6 sm:px-6 hover:bg-gray-50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-lg font-medium text-gray-900">
                                                            {bid.item_name}
                                                        </h3>
                                                        {getBidStatus(bid)}
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                                                        <div className="bg-green-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-green-800">Your Bid</p>
                                                            <p className="text-xl font-bold text-green-900">₹{bid.total_cost?.toLocaleString()}</p>
                                                        </div>
                                                        
                                                        <div className="bg-blue-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-blue-800">Quantity</p>
                                                            <p className="text-lg font-bold text-blue-900">{bid.proposed_quantity}</p>
                                                        </div>
                                                        
                                                        <div className="bg-orange-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-orange-800">Delivery</p>
                                                            <p className="text-lg font-bold text-orange-900">{bid.delivery_days} days</p>
                                                        </div>
                                                        
                                                        <div className="bg-purple-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-purple-800">Submitted</p>
                                                            <p className="text-sm font-bold text-purple-900">
                                                                {new Date(bid.created_at).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="text-sm text-gray-600 mb-3">
                                                        <p><span className="font-medium">Description:</span> {bid.description}</p>
                                                        {bid.bid_comments && (
                                                            <p className="mt-1">
                                                                <span className="font-medium">Your Comments:</span> {bid.bid_comments}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>            {/* Bid Submission Modal */}            {showBidModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-10 mx-auto p-6 border w-full max-w-2xl shadow-lg rounded-lg bg-white">
                        <div className="mt-3">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">
                                {myBids.find(bid => bid.tender_id === selectedTender?.id) ? 'Update Your Bid' : 'Submit Your Bid'}
                            </h3>
                            
                            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <h4 className="font-semibold text-blue-900 mb-2">
                                    {selectedTender?.items?.length > 1 ? 
                                        `Multi-Item Tender (${selectedTender.items.length} items)` : 
                                        selectedTender?.item_name || selectedTender?.items?.[0]?.item_name
                                    }
                                </h4>
                                
                                {/* Items Details */}
                                {selectedTender?.items && selectedTender.items.length > 0 ? (
                                    <div className="space-y-3 mt-3">
                                        <h5 className="font-medium text-blue-900">Items in this tender:</h5>
                                        <div className="max-h-32 overflow-y-auto space-y-2">
                                            {selectedTender.items.map((item, index) => (
                                                <div key={item.id || index} className="bg-white p-2 rounded border">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-gray-900">{item.item_name}</span>
                                                        <span className="text-sm text-gray-600">Qty: {item.quantity}</span>
                                                    </div>
                                                    {item.estimated_cost && (
                                                        <p className="text-sm text-gray-600">Est. Cost: ₹{item.estimated_cost}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-blue-800 space-y-1">
                                        <p><span className="font-medium">Required Quantity:</span> {selectedTender?.quantity}</p>
                                        <p><span className="font-medium">Description:</span> {selectedTender?.description}</p>
                                    </div>
                                )}
                                
                                <p className="text-sm text-blue-800 mt-2">
                                    <span className="font-medium">Bidding Expires:</span> {formatDateTime(selectedTender?.bidding_end_time)}
                                </p>
                                
                                {selectedTender?.items?.length > 1 && (
                                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                        <p className="text-sm text-yellow-800">
                                            <strong>Note:</strong> This is a multi-item tender. You can bid on the entire tender with your proposed quantities and total cost for all items.
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-red-700 text-sm">{error}</p>
                                </div>
                            )}
                            
                            <form onSubmit={handleBidSubmit} className="space-y-4">                                <div>
                                    <label htmlFor="proposedQuantity" className="block text-sm font-medium text-gray-700 mb-1">
                                        {selectedTender?.items?.length > 1 ? 
                                            'Total Quantity You Can Provide *' : 
                                            'Quantity You Can Provide *'
                                        }
                                    </label>
                                    <input
                                        type="number"
                                        id="proposedQuantity"
                                        name="proposedQuantity"
                                        value={bidForm.proposedQuantity}
                                        onChange={handleFormChange}
                                        min="1"
                                        max={selectedTender?.items?.length > 1 ? 
                                            selectedTender.items.reduce((sum, item) => sum + item.quantity, 0) :
                                            selectedTender?.quantity
                                        }
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter quantity"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        {selectedTender?.items?.length > 1 ? 
                                            `Maximum total: ${selectedTender.items.reduce((sum, item) => sum + item.quantity, 0)} (across all items)` :
                                            `Maximum: ${selectedTender?.quantity}`
                                        }
                                    </p>
                                </div>
                                
                                <div>
                                    <label htmlFor="totalCost" className="block text-sm font-medium text-gray-700 mb-1">
                                        Total Cost (₹) *
                                    </label>
                                    <input
                                        type="number"
                                        id="totalCost"
                                        name="totalCost"
                                        value={bidForm.totalCost}
                                        onChange={handleFormChange}
                                        step="0.01"
                                        min="0.01"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter total cost"
                                    />
                                    {selectedTender?.items?.length > 1 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            This should be your total cost for all items you can provide
                                        </p>
                                    )}
                                </div>
                                
                                <div>
                                    <label htmlFor="deliveryTime" className="block text-sm font-medium text-gray-700 mb-1">
                                        Delivery Time (days) *
                                    </label>
                                    <input
                                        type="number"
                                        id="deliveryTime"
                                        name="deliveryTime"
                                        value={bidForm.deliveryTime}
                                        onChange={handleFormChange}
                                        min="1"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter delivery days"
                                    />
                                </div>
                                
                                <div>
                                    <label htmlFor="comments" className="block text-sm font-medium text-gray-700 mb-1">
                                        Additional Comments
                                    </label>
                                    <textarea
                                        id="comments"
                                        name="comments"
                                        value={bidForm.comments}
                                        onChange={handleFormChange}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Any additional information or terms..."
                                    />
                                </div>
                                
                                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowBidModal(false);
                                            setError('');
                                        }}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>                                    <button
                                        type="submit"
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
                                    >
                                        Place Bid
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div className="mt-3 text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mt-4">Bid Submitted Successfully!</h3>
                            <p className="text-sm text-gray-500 mt-2">Your bid has been submitted and will be evaluated after the tender expires.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierDashboard;
