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
    }, [navigate]);

    const fetchActiveTenders = async () => {
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
    };

    const fetchMyBids = async () => {
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

    const handleBidClick = (tender) => {
        // Check if we already have a bid for this tender
        const existingBid = myBids.find(bid => bid.tender_id === tender.id);
        if (existingBid) {
            // Prevent navigation if bid already exists
            setError('You have already submitted a bid for this tender. Bids cannot be modified once submitted.');
            return;
        }
        
        // Navigate to multi-step bid application
        navigate(`/supplier/apply-bid/${tender.id}`);
    };

    const getTimeRemaining = (endTime) => {
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

    const downloadTenderDocument = async (tenderId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/${tenderId}/tender-document`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download tender document');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `tender-document-${tenderId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError('Failed to download tender document: ' + err.message);
        }
    };

    const downloadItemsList = async (tenderId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/tenders/${tenderId}/items-list`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to download items list');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Get filename from response headers or use default
            const contentDisposition = response.headers.get('content-disposition');
            const filename = contentDisposition 
                ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
                : `items-list-${tenderId}.csv`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError('Failed to download items list: ' + err.message);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">Supplier Dashboard</h1>
                        <p className="mt-2 text-sm text-gray-600">
                            Welcome back! Here are your tender opportunities and bid submissions.
                        </p>
                    </div>

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
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {activeTenders.map((tender) => (
                                        <li key={tender.id} className="px-4 py-6 sm:px-6 hover:bg-gray-50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {tender.item_name}
                                                        </h3>
                                                        {getUrgencyBadge(tender.urgency)}
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                        <div className="bg-blue-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-blue-800">Quantity Required</p>
                                                            <p className="text-xl font-bold text-blue-900">{tender.quantity}</p>
                                                        </div>
                                                        
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
                                                    </div>
                                                      
                                                    <div className="text-sm text-gray-600 mb-3">
                                                        <p><span className="font-medium">Description:</span> {tender.description}</p>
                                                        <p className="mt-1">
                                                            <span className="font-medium">Bidding Expires:</span> {' '}
                                                            {formatDateTime(tender.bidding_end_time)}
                                                        </p>
                                                    </div>

                                                    {/* Download Buttons */}
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        <button
                                                            onClick={() => downloadTenderDocument(tender.id)}
                                                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                        >
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            Download Tender Document
                                                        </button>
                                                        <button
                                                            onClick={() => downloadItemsList(tender.id)}
                                                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                        >
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            Download Items List
                                                        </button>
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
                            ) : (
                                <ul className="divide-y divide-gray-200">
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
                                            <p className="text-xl font-bold text-green-900">Rs {bid.total_cost?.toLocaleString()}</p>
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
            </div>
        </div>
    );
};

export default SupplierDashboard;
