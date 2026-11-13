import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { apiUrl } from '../../config/api';
import { PageHeader } from '../../ui';

import { formatDateTime } from '../../lib/time';
import { humanize } from '../../ui/status';
const StorePurchaseOrders = () => {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPO, setSelectedPO] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    });

    useEffect(() => {
        fetchPurchaseOrders();
    }, [pagination.page]);

    const fetchPurchaseOrders = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            
            let url = `${apiUrl}/purchase-orders?page=${pagination.page}&limit=${pagination.limit}`;
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch purchase orders');
            
            const data = await response.json();
            setPurchaseOrders(data.purchaseOrders);
            setPagination(prev => ({
                ...prev,
                total: data.pagination.total,
                totalPages: data.pagination.totalPages
            }));
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
            toast.error('Failed to fetch purchase orders');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination(prev => ({ ...prev, page: 1 }));
        fetchPurchaseOrders();
    };

    const openDetailsModal = (po) => {
        setSelectedPO(po);
        setShowDetailsModal(true);
    };



    const getStatusBadge = (status) => {
        const statusClasses = {
            'created': 'bg-yellow-100 text-yellow-800',
            'sent': 'bg-blue-100 text-blue-800',
            'acknowledged': 'bg-purple-100 text-purple-800',
            'fulfilled': 'bg-green-100 text-green-800',
            'cancelled': 'bg-red-100 text-red-800'
        };
        return statusClasses[status] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Purchase orders" />

            {/* Search */}
            <div className="ui-panel ui-panel--pad">
                <form onSubmit={handleSearch} className="flex gap-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search by PO number, supplier, or tender..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="ui-input"
                        />
                    </div>
                    <button
                        type="submit"
                        className="ui-btn ui-btn--primary"
                    >
                        <i className="fas fa-search mr-2"></i>
                        Search
                    </button>
                </form>
            </div>

            {/* Purchase Orders Table */}
            <div className="ui-panel">
                {loading ? (
                    <div className="text-center py-12">
                        <i className="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>
                        <p className="text-gray-500">Loading purchase orders...</p>
                    </div>
                ) : purchaseOrders.length === 0 ? (
                    <div className="text-center py-12">
                        <i className="fas fa-file-invoice text-gray-400 text-4xl mb-4"></i>
                        <p className="text-gray-500">No purchase orders found</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th className="text-left">PO number</th>
                                        <th className="text-left">Tender</th>
                                        <th className="text-left">Supplier</th>
                                        <th className="text-left">Amount</th>
                                        <th className="text-left">Status</th>
                                        <th className="text-left">Created</th>
                                        <th className="text-left">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseOrders.map((po) => (
                                        <tr key={po.id} className="hover:bg-gray-50">
                                            <td className="whitespace-nowrap">
                                                <div className="text-sm font-medium text-indigo-600">{po.po_number}</div>
                                            </td>
                                            <td>
                                                <div className="text-sm text-gray-900">{po.tender_number}</div>
                                                <div className="text-xs text-gray-500">{po.tender_item_name}</div>
                                            </td>
                                            <td>
                                                <div className="text-sm text-gray-900">{po.supplier_name}</div>
                                            </td>
                                            <td className="whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    Rs {Number(po.total_amount).toLocaleString()}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(po.status)}`}>
                                                    {humanize(po.status)}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap">
                                                {formatDateTime(po.created_at)}
                                            </td>
                                            <td className="whitespace-nowrap">
                                                <button
                                                    onClick={() => openDetailsModal(po)}
                                                    className="ui-btn ui-btn--ghost ui-btn--sm"
                                                >
                                                    <i className="fas fa-eye mr-1"></i>
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                            <div className="text-sm text-gray-700">
                                Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                                <span className="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of{' '}
                                <span className="font-medium">{pagination.total}</span> results
                            </div>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                    disabled={pagination.page <= 1}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                    disabled={pagination.page >= pagination.totalPages}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* PO Details Modal */}
            {showDetailsModal && selectedPO && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-file-invoice mr-2 text-indigo-600"></i>
                                Purchase order: {selectedPO.po_number}
                            </h3>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* PO Header */}
                        <div className="ui-callout mb-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-sm text-gray-500">Status</span>
                                    <p>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(selectedPO.status)}`}>
                                            {humanize(selectedPO.status)}
                                        </span>
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Tender</span>
                                    <p className="font-medium">{selectedPO.tender_number}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Supplier</span>
                                    <p className="font-medium">{selectedPO.supplier_name}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Total Amount</span>
                                    <p className="font-bold text-green-600">Rs {Number(selectedPO.total_amount).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items */}
                        <div className="ui-card mb-6">
                            <h4 className="font-medium text-gray-900 mb-3">
                                <i className="fas fa-list mr-2 text-gray-600"></i>
                                Order items
                            </h4>
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th className="text-left">Item</th>
                                        <th className="text-left">Unit price</th>
                                        <th className="text-left">Quantity</th>
                                        <th className="text-left">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedPO.items || []).map((item, index) => (
                                        <tr key={index}>
                                            <td>{item.itemName}</td>
                                            <td>Rs {Number(item.unitPrice).toLocaleString()}</td>
                                            <td>{item.quantity}</td>
                                            <td>Rs {(item.quantity * item.unitPrice).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Timeline */}
                        <div className="ui-card mb-6">
                            <h4 className="font-medium text-gray-900 mb-3">
                                <i className="fas fa-clock mr-2 text-gray-600"></i>
                                Timeline
                            </h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Created:</span>
                                    <span>{formatDateTime(selectedPO.created_at)}</span>
                                </div>
                                {selectedPO.sent_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Sent:</span>
                                        <span>{formatDateTime(selectedPO.sent_at)}</span>
                                    </div>
                                )}
                                {selectedPO.acknowledged_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Acknowledged:</span>
                                        <span>{formatDateTime(selectedPO.acknowledged_at)}</span>
                                    </div>
                                )}
                                {selectedPO.fulfilled_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Fulfilled:</span>
                                        <span>{formatDateTime(selectedPO.fulfilled_at)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="ui-btn ui-btn--secondary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StorePurchaseOrders;
