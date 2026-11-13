import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../config/api';

import { formatDate, formatDateTime } from '../../lib/time';
import { TenderStatus } from '../../ui/tender';
import { money } from '../../ui/status';
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
            toast.success('Tender submitted for Finance & MS approvals.');
            fetchTendersWithVettingStatus(); // Refresh the list
        } catch (error) {
            console.error('Error submitting tender for approval:', error);
            const errorMessage = error.response?.data?.message || 'Failed to submit tender for approval';
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const renderTenderCard = (tender) => {

        return (
            <div key={tender.id} className="ui-panel ui-panel--pad">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">{tender.tender_number}</h3>
                        <p className="text-sm text-gray-600">{tender.item_name}</p>
                    </div>
                    <TenderStatus status={tender.tender_status} />
                </div>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p><span className="font-medium">Description:</span> {tender.demand_description}</p>
                    <p><span className="font-medium">Estimated Cost:</span> {money(tender.estimated_cost)}</p>
                    <p><span className="font-medium">Bidding End:</span> {formatDateTime(tender.bidding_end_time)}</p>
                    <p><span className="font-medium">Created by:</span> {tender.created_by_name} ({tender.created_by_department})</p>
                    <p><span className="font-medium">Created:</span> {formatDate(tender.created_at)}</p>
                </div>
                
                <div className="flex space-x-2">
                    <button
                        onClick={() => {
                            setSelectedTender(tender);
                            setShowDetailsModal(true);
                        }}
                        className="ui-btn ui-btn--secondary flex-1"
                    >
                        View details
                    </button>
                    
                    {tender.tender_status === 'vetting_approved' && (
                        <button
                            onClick={() => submitForFinanceApproval(tender.id)}
                            disabled={loading}
                            className="ui-btn ui-btn--primary flex-1"
                        >
                            {loading ? 'Submitting...' : 'Submit for Finance & MS Approvals'}
                        </button>
                    )}
                    
                    {tender.tender_status === 'vetting_rejected' && (
                        <button
                            disabled
                            className="flex-1 bg-gray-400 text-white py-2 px-4 rounded-md cursor-not-allowed"
                        >
                            Cannot publish
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderDetailsModal = () => {
        if (!selectedTender) return null;

        return (
            <div className="ui-scrim">
                <div className="ui-dialog ui-dialog--legacy ui-dialog--lg overflow-y-auto">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Tender details</h2>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="ui-callout">
                                <h3 className="font-semibold text-gray-900 mb-3">Basic information</h3>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-medium">Tender Number:</span> {selectedTender.tender_number}</p>
                                    <p><span className="font-medium">Item:</span> {selectedTender.item_name}</p>
                                    <p><span className="font-medium">Description:</span> {selectedTender.demand_description}</p>
                                    <p><span className="font-medium">Estimated Cost:</span> {money(selectedTender.estimated_cost)}</p>
                                    <p><span className="font-medium">Status:</span> <TenderStatus status={selectedTender.tender_status} /></p>
                                </div>
                            </div>

                            <div className="ui-callout">
                                <h3 className="font-semibold text-gray-900 mb-3">Bidding details</h3>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-medium">Bidding End:</span> {formatDateTime(selectedTender.bidding_end_time)}</p>
                                    <p><span className="font-medium">Minimum Suppliers:</span> {selectedTender.minimum_suppliers}</p>
                                    <p><span className="font-medium">Created by:</span> {selectedTender.created_by_name}</p>
                                    <p><span className="font-medium">Department:</span> {selectedTender.created_by_department}</p>
                                    <p><span className="font-medium">Created:</span> {formatDate(selectedTender.created_at)}</p>
                                </div>
                            </div>
                        </div>

                        {selectedTender.tender_status === 'vetting_approved' && (
                            <div className="ui-callout mb-6">
                                <div className="flex">
                                    <i className="fas fa-check-circle h-5 w-5 text-green-400"></i>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium">Tender approved</h3>
                                        <p className="text-sm mt-1">
                                            Ready to send for Finance & MS approval.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTender.tender_status === 'vetting_rejected' && (
                            <div className="ui-callout ui-callout--danger mb-6">
                                <div className="flex">
                                    <i className="fas fa-times-circle h-5 w-5 text-red-400"></i>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">Tender rejected</h3>
                                        <p className="text-sm text-red-700 mt-1">
                                            It cannot be published.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTender.tender_status === 'pending_vetting' && (
                            <div className="ui-callout ui-callout--warning mb-6">
                                <div className="flex">
                                    <i className="fas fa-clock h-5 w-5 text-yellow-400"></i>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-yellow-800">Pending vetting</h3>
                                        <p className="text-sm text-yellow-700 mt-1">
                                            The vetting committee is reviewing it.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="ui-btn ui-btn--secondary"
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
                                    className="ui-btn ui-btn--primary"
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
                    <h1 className="text-3xl font-bold text-gray-900">Tender vetting management</h1>
                    <p className="text-gray-600">Manage tenders that are under vetting committee review</p>
                </div>

                {loading && !showDetailsModal ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="ui-spin"></div>
                    </div>
                ) : (
                    <div>
                        {tenders.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-clipboard-list text-4xl text-gray-400 mb-4"></i>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No tenders found</h3>
                                <p className="text-gray-500">There are no tenders currently in the vetting process.</p>
                            </div>
                        ) : (
                            <div>
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                    <div className="ui-callout ui-callout--warning">
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
                                    <div className="ui-callout">
                                        <div className="flex items-center">
                                            <i className="fas fa-check-circle text-green-500 text-2xl mr-3"></i>
                                            <div>
                                                <p className="text-sm font-medium">Approved</p>
                                                <p className="text-2xl font-bold">
                                                    {tenders.filter(t => t.tender_status === 'vetting_approved').length}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="ui-callout ui-callout--danger">
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
