import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../config/api';

const TenderVettingManagement = () => {
    const [loading, setLoading] = useState(false);
    const [tenders, setTenders] = useState([]);
    const [selectedTender, setSelectedTender] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    useEffect(() => {
        fetchTendersWithVettingStatus();
    }, []);

    const fetchTendersWithVettingStatus = async () => {
        try {
            setLoading(true);
            const response = await api.get('/demands/purchase/tenders-vetting-status');
            setTenders(response.data);
        } catch (error) {
            console.error('Error fetching tenders:', error);
            toast.error('Failed to fetch tenders');
        } finally {
            setLoading(false);
        }
    };

    const submitForFinanceApproval = async (tenderId) => {
        try {
            setLoading(true);
            await api.post(`/demands/purchase/tenders/${tenderId}/submit-for-finance-approval`);
            toast.success('Tender submitted for Finance & MS approvals successfully!');
            fetchTendersWithVettingStatus(); // Refresh the list
        } catch (error) {
            console.error('Error submitting tender for approval:', error);
            const errorMessage = error.response?.data?.message || 'Failed to submit tender for approval';
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const getStatusDisplay = (status) => {
        switch (status) {
            case 'pending_vetting':
                return {
                    text: 'Pending Vetting Approval',
                    color: 'bg-yellow-100 text-yellow-800',
                    icon: 'fas fa-clock'
                };
            case 'vetting_approved':
                return {
                    text: 'Ready for Finance & MS Approval',
                    color: 'bg-green-100 text-green-800',
                    icon: 'fas fa-check-circle'
                };
            case 'pending_finance_ms_approval':
                return {
                    text: 'Pending Finance & MS Approval',
                    color: 'bg-blue-100 text-blue-800',
                    icon: 'fas fa-hourglass-half'
                };
            case 'vetting_rejected':
                return {
                    text: 'Rejected by Vetting Committee',
                    color: 'bg-red-100 text-red-800',
                    icon: 'fas fa-times-circle'
                };
            default:
                return {
                    text: status,
                    color: 'bg-gray-100 text-gray-800',
                    icon: 'fas fa-question-circle'
                };
        }
    };

    const renderTenderCard = (tender) => {
        const statusDisplay = getStatusDisplay(tender.tender_status);

        return (
            <div key={tender.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{tender.tender_number}</h3>
                        <p className="text-sm text-gray-600">{tender.item_name}</p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full flex items-center ${statusDisplay.color}`}>
                        <i className={`${statusDisplay.icon} mr-1`}></i>
                        {statusDisplay.text}
                    </span>
                </div>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p><span className="font-medium">Description:</span> {tender.demand_description}</p>
                    <p><span className="font-medium">Estimated Cost:</span> PKR {tender.estimated_cost?.toLocaleString()}</p>
                    <p><span className="font-medium">Bidding End:</span> {new Date(tender.bidding_end_time).toLocaleString()}</p>
                    <p><span className="font-medium">Created by:</span> {tender.created_by_name} ({tender.created_by_department})</p>
                    <p><span className="font-medium">Created:</span> {new Date(tender.created_at).toLocaleDateString()}</p>
                </div>
                
                <div className="flex space-x-2">
                    <button
                        onClick={() => {
                            setSelectedTender(tender);
                            setShowDetailsModal(true);
                        }}
                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                    >
                        View Details
                    </button>
                    
                    {tender.tender_status === 'vetting_approved' && (
                        <button
                            onClick={() => submitForFinanceApproval(tender.id)}
                            disabled={loading}
                            className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Submitting...' : 'Submit for Finance & MS Approvals'}
                        </button>
                    )}
                    
                    {tender.tender_status === 'vetting_rejected' && (
                        <button
                            disabled
                            className="flex-1 bg-gray-400 text-white py-2 px-4 rounded-md cursor-not-allowed"
                        >
                            Cannot Publish
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderDetailsModal = () => {
        if (!selectedTender) return null;

        return (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg max-w-3xl w-full max-h-full overflow-y-auto">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Tender Details</h2>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Basic Information</h3>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-medium">Tender Number:</span> {selectedTender.tender_number}</p>
                                    <p><span className="font-medium">Item:</span> {selectedTender.item_name}</p>
                                    <p><span className="font-medium">Description:</span> {selectedTender.demand_description}</p>
                                    <p><span className="font-medium">Estimated Cost:</span> PKR {selectedTender.estimated_cost?.toLocaleString()}</p>
                                    <p><span className="font-medium">Status:</span> 
                                        <span className={`ml-2 px-2 py-1 text-xs font-medium rounded ${getStatusDisplay(selectedTender.tender_status).color}`}>
                                            {getStatusDisplay(selectedTender.tender_status).text}
                                        </span>
                                    </p>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Bidding Details</h3>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-medium">Bidding End:</span> {new Date(selectedTender.bidding_end_time).toLocaleString()}</p>
                                    <p><span className="font-medium">Minimum Suppliers:</span> {selectedTender.minimum_suppliers}</p>
                                    <p><span className="font-medium">Created by:</span> {selectedTender.created_by_name}</p>
                                    <p><span className="font-medium">Department:</span> {selectedTender.created_by_department}</p>
                                    <p><span className="font-medium">Created:</span> {new Date(selectedTender.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>

                        {selectedTender.tender_status === 'vetting_approved' && (
                            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
                                <div className="flex">
                                    <i className="fas fa-check-circle h-5 w-5 text-green-400"></i>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-green-800">Tender Approved</h3>
                                        <p className="text-sm text-green-700 mt-1">
                                            This tender has been approved by the vetting committee and is ready to be submitted for Finance & MS HOD approvals.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTender.tender_status === 'vetting_rejected' && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                                <div className="flex">
                                    <i className="fas fa-times-circle h-5 w-5 text-red-400"></i>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">Tender Rejected</h3>
                                        <p className="text-sm text-red-700 mt-1">
                                            This tender has been rejected by the vetting committee and cannot be published.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTender.tender_status === 'pending_vetting' && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
                                <div className="flex">
                                    <i className="fas fa-clock h-5 w-5 text-yellow-400"></i>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-yellow-800">Pending Vetting</h3>
                                        <p className="text-sm text-yellow-700 mt-1">
                                            This tender is currently under review by the vetting committee. You will be able to publish it once all members have approved.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                            {selectedTender.tender_status === 'vetting_approved' && (
                                <button
                                    onClick={() => {
                                        submitForFinanceApproval(selectedTender.id);
                                        setShowDetailsModal(false);
                                    }}
                                    disabled={loading}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                                >
                                    {loading ? 'Submitting...' : 'Submit for Finance & MS Approvals'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="px-4 py-6 sm:px-0">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">Tender Vetting Management</h1>
                    <p className="text-gray-600">Manage tenders that are under vetting committee review</p>
                </div>

                {loading && !showDetailsModal ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div>
                        {tenders.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-clipboard-list text-4xl text-gray-400 mb-4"></i>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No Tenders Found</h3>
                                <p className="text-gray-500">There are no tenders currently in the vetting process.</p>
                            </div>
                        ) : (
                            <div>
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                        <div className="flex items-center">
                                            <i className="fas fa-clock text-yellow-500 text-2xl mr-3"></i>
                                            <div>
                                                <p className="text-sm font-medium text-yellow-800">Pending Vetting</p>
                                                <p className="text-2xl font-bold text-yellow-900">
                                                    {tenders.filter(t => t.tender_status === 'pending_vetting').length}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <div className="flex items-center">
                                            <i className="fas fa-check-circle text-green-500 text-2xl mr-3"></i>
                                            <div>
                                                <p className="text-sm font-medium text-green-800">Approved</p>
                                                <p className="text-2xl font-bold text-green-900">
                                                    {tenders.filter(t => t.tender_status === 'vetting_approved').length}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                        <div className="flex items-center">
                                            <i className="fas fa-times-circle text-red-500 text-2xl mr-3"></i>
                                            <div>
                                                <p className="text-sm font-medium text-red-800">Rejected</p>
                                                <p className="text-2xl font-bold text-red-900">
                                                    {tenders.filter(t => t.tender_status === 'vetting_rejected').length}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tenders Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {tenders.map(renderTenderCard)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Details Modal */}
                {showDetailsModal && renderDetailsModal()}
            </div>
        </div>
    );
};

export default TenderVettingManagement;
