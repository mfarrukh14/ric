import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const apiUrl = import.meta.env.VITE_API_URL || 'http://10.10.10.35:5000';

const PurchaseOrdersManagement = () => {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
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
    }, [pagination.page, statusFilter]);

    const fetchPurchaseOrders = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            
            let url = `${apiUrl}/api/purchase-orders?page=${pagination.page}&limit=${pagination.limit}`;
            if (statusFilter) url += `&status=${statusFilter}`;
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

    const handleStatusChange = async (poId, newStatus) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/purchase-orders/${poId}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) throw new Error('Failed to update status');
            
            toast.success('Status updated successfully');
            fetchPurchaseOrders();
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        }
    };

    const openDetailsModal = (po) => {
        setSelectedPO(po);
        setShowDetailsModal(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString();
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
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Purchase Orders</h2>
                    <p className="text-sm text-gray-600 mt-1">Manage all purchase orders</p>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white p-4 rounded-lg shadow">
                <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <input
                            type="text"
                            placeholder="Search by PO number, supplier, or tender..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPagination(prev => ({ ...prev, page: 1 }));
                            }}
                            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="created">Created</option>
                            <option value="sent">Sent</option>
                            <option value="acknowledged">Acknowledged</option>
                            <option value="fulfilled">Fulfilled</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                        <i className="fas fa-search mr-2"></i>
                        Search
                    </button>
                </form>
            </div>

            {/* Purchase Orders Table */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
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
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tender</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {purchaseOrders.map((po) => (
                                        <tr key={po.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-indigo-600">{po.po_number}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900">{po.tender_number}</div>
                                                <div className="text-xs text-gray-500">{po.tender_item_name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900">{po.supplier_name}</div>
                                                <div className="text-xs text-gray-500">{po.supplier_email}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    Rs {Number(po.total_amount).toLocaleString()}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(po.status)}`}>
                                                    {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {formatDate(po.created_at)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <button
                                                    onClick={() => openDetailsModal(po)}
                                                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                >
                                                    <i className="fas fa-eye mr-1"></i>
                                                    View
                                                </button>
                                                {po.status === 'created' && (
                                                    <button
                                                        onClick={() => handleStatusChange(po.id, 'sent')}
                                                        className="text-blue-600 hover:text-blue-900"
                                                    >
                                                        <i className="fas fa-paper-plane mr-1"></i>
                                                        Mark Sent
                                                    </button>
                                                )}
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
                                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                    disabled={pagination.page >= pagination.totalPages}
                                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-file-invoice mr-2 text-indigo-600"></i>
                                Purchase Order Details
                            </h3>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* PO Header */}
                        <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-sm text-gray-500">PO Number</span>
                                    <p className="font-bold text-indigo-600">{selectedPO.po_number}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Status</span>
                                    <p>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(selectedPO.status)}`}>
                                            {selectedPO.status.charAt(0).toUpperCase() + selectedPO.status.slice(1)}
                                        </span>
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Tender</span>
                                    <p className="font-medium">{selectedPO.tender_number}</p>
                                    <p className="text-sm text-gray-600">{selectedPO.tender_item_name}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Created</span>
                                    <p className="font-medium">{formatDate(selectedPO.created_at)}</p>
                                    <p className="text-sm text-gray-600">By: {selectedPO.created_by_name}</p>
                                </div>
                            </div>
                        </div>

                        {/* Supplier Info */}
                        <div className="border border-gray-200 rounded-lg p-4 mb-6">
                            <h4 className="font-medium text-gray-900 mb-3">
                                <i className="fas fa-building mr-2 text-gray-600"></i>
                                Supplier Information
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-sm text-gray-500">Company Name</span>
                                    <p className="font-medium">{selectedPO.supplier_name}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Email</span>
                                    <p className="font-medium">{selectedPO.supplier_email}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Contact Person</span>
                                    <p className="font-medium">{selectedPO.supplier_contact || '-'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items */}
                        <div className="border border-gray-200 rounded-lg p-4 mb-6">
                            <h4 className="font-medium text-gray-900 mb-3">
                                <i className="fas fa-list mr-2 text-gray-600"></i>
                                Order Items
                            </h4>
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {(selectedPO.items || []).map((item, index) => (
                                        <tr key={index}>
                                            <td className="px-4 py-2 text-sm">{item.itemName}</td>
                                            <td className="px-4 py-2 text-sm">Rs {Number(item.unitPrice).toLocaleString()}</td>
                                            <td className="px-4 py-2 text-sm">{item.quantity}</td>
                                            <td className="px-4 py-2 text-sm font-medium">Rs {(item.quantity * item.unitPrice).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50">
                                    <tr>
                                        <td colSpan="3" className="px-4 py-2 text-right text-sm font-medium">Total Amount:</td>
                                        <td className="px-4 py-2 text-sm font-bold text-green-600">
                                            Rs {Number(selectedPO.total_amount).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Timeline */}
                        <div className="border border-gray-200 rounded-lg p-4 mb-6">
                            <h4 className="font-medium text-gray-900 mb-3">
                                <i className="fas fa-clock mr-2 text-gray-600"></i>
                                Timeline
                            </h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Created:</span>
                                    <span>{formatDate(selectedPO.created_at)}</span>
                                </div>
                                {selectedPO.sent_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Sent:</span>
                                        <span>{formatDate(selectedPO.sent_at)}</span>
                                    </div>
                                )}
                                {selectedPO.acknowledged_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Acknowledged:</span>
                                        <span>{formatDate(selectedPO.acknowledged_at)}</span>
                                    </div>
                                )}
                                {selectedPO.fulfilled_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Fulfilled:</span>
                                        <span>{formatDate(selectedPO.fulfilled_at)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Remarks */}
                        {selectedPO.remarks && (
                            <div className="border border-gray-200 rounded-lg p-4 mb-6">
                                <h4 className="font-medium text-gray-900 mb-2">
                                    <i className="fas fa-sticky-note mr-2 text-gray-600"></i>
                                    Remarks
                                </h4>
                                <p className="text-sm text-gray-600">{selectedPO.remarks}</p>
                            </div>
                        )}

                        {/* Status Update Buttons */}
                        <div className="flex justify-between items-center pt-4 border-t">
                            <div className="flex space-x-2">
                                {selectedPO.status === 'created' && (
                                    <button
                                        onClick={() => {
                                            handleStatusChange(selectedPO.id, 'sent');
                                            setShowDetailsModal(false);
                                        }}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                                    >
                                        <i className="fas fa-paper-plane mr-2"></i>
                                        Mark as Sent
                                    </button>
                                )}
                                {selectedPO.status === 'sent' && (
                                    <button
                                        onClick={() => {
                                            handleStatusChange(selectedPO.id, 'acknowledged');
                                            setShowDetailsModal(false);
                                        }}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                                    >
                                        <i className="fas fa-check mr-2"></i>
                                        Mark as Acknowledged
                                    </button>
                                )}
                                {(selectedPO.status === 'acknowledged' || selectedPO.status === 'sent') && (
                                    <button
                                        onClick={() => {
                                            handleStatusChange(selectedPO.id, 'fulfilled');
                                            setShowDetailsModal(false);
                                        }}
                                        className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                                    >
                                        <i className="fas fa-check-double mr-2"></i>
                                        Mark as Fulfilled
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
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

export default PurchaseOrdersManagement;
