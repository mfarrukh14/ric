import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const WonBids = () => {
    const [wonBids, setWonBids] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('awarded');

    useEffect(() => {
        fetchWonBids();
    }, []);

    const fetchWonBids = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/supplier-awards/won-bids`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch won bids');
            
            const data = await response.json();
            setWonBids(data);
        } catch (error) {
            console.error('Error fetching won bids:', error);
            toast.error('Failed to fetch won bids');
        } finally {
            setLoading(false);
        }
    };

    const downloadAwardLetter = async (tenderId, letterType) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/supplier-awards/award-letter/${tenderId}/${letterType}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to download award letter');

            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition');
            const fileName = contentDisposition 
                ? contentDisposition.split('filename=')[1].replace(/"/g, '')
                : `award-letter-${letterType}-${tenderId}.pdf`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            
            toast.success('Award letter downloaded successfully');
        } catch (error) {
            console.error('Error downloading award letter:', error);
            toast.error('Failed to download award letter');
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            'awarded': { bg: 'bg-green-100', text: 'text-green-800', icon: 'fa-trophy' },
            'in_progress': { bg: 'bg-blue-100', text: 'text-blue-800', icon: 'fa-clock' },
            'completed': { bg: 'bg-gray-100', text: 'text-gray-800', icon: 'fa-check-circle' },
            'cancelled': { bg: 'bg-red-100', text: 'text-red-800', icon: 'fa-times-circle' }
        };

        const config = statusConfig[status] || statusConfig['awarded'];

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                <i className={`fas ${config.icon} mr-1`}></i>
                {status.replace('_', ' ').toUpperCase()}
            </span>
        );
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-PK', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR'
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    const awardedBids = wonBids.filter(bid => bid.status === 'awarded');
    const allBids = wonBids;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                <i className="fas fa-trophy mr-3 text-yellow-500"></i>
                                Won Bids & Awards
                            </h1>
                            <p className="mt-2 text-sm text-gray-600">
                                View and manage your awarded contracts and download award letters.
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-green-600">{awardedBids.length}</div>
                            <div className="text-sm text-gray-500">Total Awards</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('awarded')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'awarded'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <i className="fas fa-trophy mr-2"></i>
                        Awarded Contracts ({awardedBids.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'all'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <i className="fas fa-list mr-2"></i>
                        All Bids ({allBids.length})
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <div className="px-4 py-5 sm:p-6">
                    {((activeTab === 'awarded' && awardedBids.length === 0) || 
                      (activeTab === 'all' && allBids.length === 0)) ? (
                        <div className="text-center py-12">
                            <i className="fas fa-inbox text-gray-400 text-6xl mb-4"></i>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                {activeTab === 'awarded' ? 'No Awards Yet' : 'No Bids Found'}
                            </h3>
                            <p className="text-gray-500">
                                {activeTab === 'awarded' 
                                    ? 'You have not won any contracts yet. Keep participating in tenders!'
                                    : 'You have not participated in any bids yet.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {(activeTab === 'awarded' ? awardedBids : allBids).map((bid) => (
                                <div key={bid.tender_id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center mb-2">
                                                <h3 className="text-xl font-semibold text-gray-900 mr-3">
                                                    {bid.tender_number} - {bid.tender_title}
                                                </h3>
                                                {getStatusBadge(bid.status)}
                                            </div>
                                            <p className="text-gray-600 mb-3">{bid.tender_description}</p>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                <div className="bg-gray-50 p-3 rounded-lg">
                                                    <div className="font-medium text-gray-700 mb-1">
                                                        <i className="fas fa-calendar-check mr-2 text-green-500"></i>
                                                        Award Date
                                                    </div>
                                                    <div className="text-gray-900">
                                                        {formatDate(bid.awarded_at)}
                                                    </div>
                                                </div>
                                                
                                                <div className="bg-gray-50 p-3 rounded-lg">
                                                    <div className="font-medium text-gray-700 mb-1">
                                                        <i className="fas fa-money-bill-wave mr-2 text-green-500"></i>
                                                        Award Value
                                                    </div>
                                                    <div className="text-lg font-semibold text-green-600">
                                                        {bid.award_amount ? formatCurrency(bid.award_amount) : 'TBD'}
                                                    </div>
                                                </div>
                                                
                                                <div className="bg-gray-50 p-3 rounded-lg">
                                                    <div className="font-medium text-gray-700 mb-1">
                                                        <i className="fas fa-truck mr-2 text-blue-500"></i>
                                                        Delivery Date
                                                    </div>
                                                    <div className="text-gray-900">
                                                        {bid.delivery_date ? formatDate(bid.delivery_date) : 'As per contract'}
                                                    </div>
                                                </div>
                                            </div>

                                            {bid.award_details && (
                                                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                                    <h4 className="font-medium text-blue-900 mb-2">
                                                        <i className="fas fa-info-circle mr-2"></i>
                                                        Award Details
                                                    </h4>
                                                    <p className="text-sm text-blue-800">{bid.award_details}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                                        {bid.intent_letter_available && (
                                            <button
                                                onClick={() => downloadAwardLetter(bid.tender_id, 'intent')}
                                                className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm bg-white text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                            >
                                                <i className="fas fa-download mr-2"></i>
                                                Download Letter of Intent
                                            </button>
                                        )}
                                        
                                        {bid.award_letter_available && (
                                            <button
                                                onClick={() => downloadAwardLetter(bid.tender_id, 'award')}
                                                className="inline-flex items-center px-4 py-2 border border-green-300 rounded-md shadow-sm bg-white text-sm font-medium text-green-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                            >
                                                <i className="fas fa-trophy mr-2"></i>
                                                Download Letter of Award
                                            </button>
                                        )}
                                        
                                        <button
                                            onClick={() => {/* Navigate to tender details */}}
                                            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                        >
                                            <i className="fas fa-eye mr-2"></i>
                                            View Tender Details
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Statistics Card */}
            {allBids.length > 0 && (
                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-chart-bar mr-2 text-indigo-600"></i>
                            Award Statistics
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">
                                    {awardedBids.length}
                                </div>
                                <div className="text-sm text-green-700">Awards Won</div>
                            </div>
                            <div className="text-center p-4 bg-blue-50 rounded-lg">
                                <div className="text-2xl font-bold text-blue-600">
                                    {awardedBids.reduce((sum, bid) => sum + (bid.award_amount || 0), 0).toLocaleString()}
                                </div>
                                <div className="text-sm text-blue-700">Total Value (PKR)</div>
                            </div>
                            <div className="text-center p-4 bg-yellow-50 rounded-lg">
                                <div className="text-2xl font-bold text-yellow-600">
                                    {allBids.length > 0 ? Math.round((awardedBids.length / allBids.length) * 100) : 0}%
                                </div>
                                <div className="text-sm text-yellow-700">Success Rate</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-600">
                                    {allBids.length}
                                </div>
                                <div className="text-sm text-gray-700">Total Bids</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WonBids;
