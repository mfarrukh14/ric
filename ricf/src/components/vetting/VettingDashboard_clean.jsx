import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../config/api';

const VettingDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('pending-tenders');
    const [loading, setLoading] = useState(false);
    
    // Tender vetting states
    const [pendingTenders, setPendingTenders] = useState([]);
    const [allTenders, setAllTenders] = useState([]);

    useEffect(() => {
        if (activeTab === 'pending-tenders') {
            fetchPendingTenders();
        } else if (activeTab === 'all-tenders') {
            fetchAllTenders();
        }
    }, [activeTab]);

    const fetchPendingTenders = async () => {
        try {
            setLoading(true);
            const response = await api.get('/vetting/tenders/pending');
            setPendingTenders(response.data);
        } catch (error) {
            console.error('Error fetching pending tenders:', error);
            toast.error('Failed to fetch pending tenders');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllTenders = async () => {
        try {
            setLoading(true);
            const response = await api.get('/vetting/tenders/all');
            setAllTenders(response.data);
        } catch (error) {
            console.error('Error fetching all tenders:', error);
            toast.error('Failed to fetch all tenders');
        } finally {
            setLoading(false);
        }
    };

    const fetchTenderDetails = async (tenderId) => {
        // Navigate to the dedicated tender review page
        navigate(`/committee/vetting/tender/${tenderId}`);
    };

    const renderEvaluatedTenderCard = (tender) => {
        const getStatusBadge = () => {
            if (tender.my_decision) {
                return tender.my_decision === 'approve' 
                    ? <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">Approved by You</span>
                    : <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">Rejected by You</span>;
            } else if (tender.tender_status === 'vetting_approved') {
                return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">Committee Approved</span>;
            } else if (tender.tender_status === 'vetting_rejected') {
                return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">Committee Rejected</span>;
            } else {
                return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Pending</span>;
            }
        };

        return (
            <div key={tender.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{tender.tender_number}</h3>
                        <p className="text-sm text-gray-600">{tender.item_names || 'Multiple Items'}</p>
                        {tender.item_count > 1 && (
                            <p className="text-xs text-blue-600">{tender.item_count} items in this tender</p>
                        )}
                    </div>
                    {getStatusBadge()}
                </div>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p><span className="font-medium">Created by:</span> {tender.created_by_name} ({tender.created_by_department})</p>
                    <p><span className="font-medium">Total Estimated Cost:</span> PKR {tender.total_estimated_cost?.toLocaleString() || '0'}</p>
                    <p><span className="font-medium">Bidding End:</span> {new Date(tender.bidding_end_time).toLocaleString()}</p>
                    {tender.my_decision && (
                        <p><span className="font-medium">Your Decision:</span> {tender.my_decision} 
                        {tender.my_evaluation_date && (
                            <span className="text-xs text-gray-500"> on {new Date(tender.my_evaluation_date).toLocaleDateString()}</span>
                        )}
                        </p>
                    )}
                    {tender.my_comments && (
                        <p><span className="font-medium">Your Comments:</span> {tender.my_comments}</p>
                    )}
                </div>
                
                <button
                    onClick={() => fetchTenderDetails(tender.id)}
                    className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
                >
                    View Details
                </button>
            </div>
        );
    };

    const renderTenderCard = (tender) => {
        return (
            <div key={tender.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{tender.tender_number}</h3>
                        <p className="text-sm text-gray-600">{tender.item_names || 'Multiple Items'}</p>
                        {tender.item_count > 1 && (
                            <p className="text-xs text-blue-600">{tender.item_count} items in this tender</p>
                        )}
                    </div>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                        Pending Vetting
                    </span>
                </div>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p><span className="font-medium">Created by:</span> {tender.created_by_name} ({tender.created_by_department})</p>
                    <p><span className="font-medium">Total Estimated Cost:</span> PKR {tender.total_estimated_cost?.toLocaleString() || '0'}</p>
                    <p><span className="font-medium">Bidding End:</span> {new Date(tender.bidding_end_time).toLocaleString()}</p>
                    <p><span className="font-medium">Minimum Suppliers:</span> {tender.minimum_suppliers}</p>
                </div>
                
                <button
                    onClick={() => fetchTenderDetails(tender.id)}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                >
                    Review Tender
                </button>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Vetting Committee Dashboard</h1>
                    <p className="text-gray-600">Review and evaluate tenders submitted for vetting approval</p>
                </div>

                {/* Tab Navigation */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('pending-tenders')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'pending-tenders'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Pending Tenders ({pendingTenders.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('all-tenders')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'all-tenders'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            All Tenders ({allTenders.length})
                        </button>
                    </nav>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div>
                        {activeTab === 'pending-tenders' && (
                            <div>
                                {pendingTenders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <i className="fas fa-clipboard-check text-4xl text-gray-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Tenders</h3>
                                        <p className="text-gray-500">There are no tenders currently pending vetting approval.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {pendingTenders.map(renderTenderCard)}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'all-tenders' && (
                            <div>
                                {allTenders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <i className="fas fa-clipboard-list text-4xl text-gray-400 mb-4"></i>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Tenders</h3>
                                        <p className="text-gray-500">No tenders have been submitted for vetting yet.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {allTenders.map(renderEvaluatedTenderCard)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VettingDashboard;
