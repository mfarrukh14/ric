import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const PurchaseDepartment = () => {
    const [demands, setDemands] = useState([]);
    const [supplyOrders, setSupplyOrders] = useState([]);
    const [selectedDemand, setSelectedDemand] = useState(null);
    const [activeTab, setActiveTab] = useState('demands');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');const [evaluationForm, setEvaluationForm] = useState({
        status: '',
        comments: '',
        biddingExpiryTime: '',
        updatedDemand: {
            item_name: '',
            quantity: '',
            estimated_cost: '',
            description: '',
            urgency: '',
            required_by: ''
        }
    });const [showEvaluationModal, setShowEvaluationModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);    useEffect(() => {
        fetchPurchaseDemands();
        fetchSupplyOrders();
    }, []);    const fetchPurchaseDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/purchase`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch demands');
            }

            const data = await response.json();
            setDemands(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSupplyOrders = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/supply-orders/all`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch supply orders');
            }

            const data = await response.json();
            setSupplyOrders(data);
        } catch (err) {
            console.error('Error fetching supply orders:', err);
            // Don't set error for supply orders as it's secondary functionality
        }
    };

    const handleEvaluate = (demand) => {
        setSelectedDemand(demand);        setEvaluationForm({
            status: '',
            comments: '',
            biddingExpiryTime: '',
            updatedDemand: {
                item_name: demand.item_name,
                quantity: demand.quantity,
                estimated_cost: demand.estimated_cost,
                description: demand.description,
                urgency: demand.urgency,
                required_by: demand.required_by
            }
        });
        setShowEvaluationModal(true);
    };    const handleEvaluationSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!evaluationForm.status) {
            setError('Please select approval or rejection');
            return;
        }

        if (evaluationForm.status === 'rejected' && !evaluationForm.comments) {
            setError('Rejection reason is required');
            return;
        }

        if (evaluationForm.status === 'approved' && !evaluationForm.biddingExpiryTime) {
            setError('Bidding expiry date and time is required for approval');
            return;
        }        // Validate that expiry time is at least 1 minute from now (for testing)
        if (evaluationForm.status === 'approved' && evaluationForm.biddingExpiryTime) {
            const expiryTime = new Date(evaluationForm.biddingExpiryTime);
            const minTime = new Date(Date.now() + 1 * 60 * 1000); // 1 minute from now
            
            if (expiryTime < minTime) {
                setError('Bidding expiry must be at least 1 minute from now');
                return;
            }
        }try {
            const token = localStorage.getItem('token');
            let endpoint, method, bodyData;
            
            if (evaluationForm.status === 'approved') {
                // Use the new approve endpoint that creates tenders
                endpoint = `${apiUrl}/demands/${selectedDemand.id}/approve`;
                method = 'POST';
                bodyData = {
                    expiryDate: evaluationForm.biddingExpiryTime
                };
            } else {
                // Use the old evaluate endpoint for rejections
                endpoint = `${apiUrl}/demands/${selectedDemand.id}/evaluate-purchase`;
                method = 'POST';
                bodyData = evaluationForm;
            }
            
            const response = await fetch(endpoint, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit evaluation');
            }            setShowEvaluationModal(false);
            fetchPurchaseDemands(); // Refresh the list
            fetchSupplyOrders(); // Refresh supply orders in case new ones were created
            
            // Show success modal
            setShowSuccessModal(true);
            setTimeout(() => {
                setShowSuccessModal(false);
            }, 2000);
        } catch (err) {            setError(err.message);
        }
    };

    const downloadSupplyOrderPDF = async (orderId, itemName, supplierName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/supply-orders/${orderId}/pdf`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `supply-order-${orderId}-${itemName}-${supplierName}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError('Failed to download PDF: ' + err.message);
        }
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('demand_')) {
            const fieldName = name.replace('demand_', '');
            setEvaluationForm(prev => ({
                ...prev,
                updatedDemand: {
                    ...prev.updatedDemand,
                    [fieldName]: value
                }
            }));
        } else {
            setEvaluationForm(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const getStatusBadge = (status) => {
        const statusColors = {
            'vetting_approved': 'bg-blue-100 text-blue-800',
            'purchase_pending': 'bg-yellow-100 text-yellow-800',
            'purchase_approved': 'bg-green-100 text-green-800',
            'rejected': 'bg-red-100 text-red-800'
        };

        const statusLabels = {
            'vetting_approved': 'Approved by Vetting',
            'purchase_pending': 'Purchase Pending',
            'purchase_approved': 'Purchase Approved',
            'rejected': 'Rejected'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
                {statusLabels[status] || status}
            </span>
        );
    };

    const getUrgencyBadge = (urgency) => {
        const urgencyColors = {
            'high': 'bg-red-100 text-red-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-yellow-100 text-yellow-800',
            'low': 'bg-green-100 text-green-800'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[urgency] || 'bg-gray-100 text-gray-800'}`}>
                {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">Purchase Department</h1>
                        <p className="text-gray-600">Review and process demands approved by vetting committee</p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-md bg-red-50 p-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="mb-6">
                        <nav className="flex space-x-8" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('demands')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'demands'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Pending Demands
                                {demands.length > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                        {demands.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('supply-orders')}
                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'supply-orders'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                Supply Orders
                                {supplyOrders.length > 0 && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        {supplyOrders.length}
                                    </span>
                                )}
                            </button>
                        </nav>
                    </div>                    {/* Tab Content */}
                    {activeTab === 'demands' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Demands for Purchase Review</h2>
                                
                                {demands.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No demands available for purchase review at this time.</div>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Item Details
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Quantity & Cost
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Urgency
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Required By
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Requested By
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Status
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Actions
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {demands.map((demand) => (
                                                    <tr key={demand.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {demand.item_name}
                                                                </div>
                                                                <div className="text-sm text-gray-500">
                                                                    {demand.description}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                Qty: {demand.quantity}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                Cost: ${demand.estimated_cost}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {getUrgencyBadge(demand.urgency)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {new Date(demand.required_by).toLocaleDateString()}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {demand.created_by_name}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                {demand.creator_department}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {getStatusBadge(demand.status)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                            <button
                                                                onClick={() => handleEvaluate(demand)}
                                                                className="text-indigo-600 hover:text-indigo-900"
                                                            >
                                                                Review
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'supply-orders' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:p-6">
                                <h2 className="text-lg font-medium text-gray-900 mb-4">Supply Orders</h2>
                                
                                {supplyOrders.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-gray-500">No supply orders available at this time.</div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {supplyOrders.map((tender) => (
                                            <div key={tender.tender_id} className="border border-gray-200 rounded-lg p-6">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            Tender: {tender.item_name}
                                                        </h3>
                                                        <div className="mt-1 text-sm text-gray-600">
                                                            <span>Total Quantity: {tender.total_quantity}</span>
                                                            <span className="mx-2">•</span>
                                                            <span>Fulfilled: {tender.total_fulfilled_quantity} ({tender.fulfillment_percentage}%)</span>
                                                            <span className="mx-2">•</span>
                                                            <span>Total Cost: ${tender.total_cost}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                            tender.fulfillment_percentage === 100 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            {tender.fulfillment_percentage === 100 ? 'Fully Fulfilled' : 'Partially Fulfilled'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Order ID
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Supplier
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Quantity
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Unit Price
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Total Cost
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Delivery Date
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Status
                                                                </th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Actions
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {tender.orders.map((order) => (
                                                                <tr key={order.id} className="hover:bg-gray-50">
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                        #{order.id}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                                        <div className="text-sm font-medium text-gray-900">
                                                                            {order.supplier_name}
                                                                        </div>
                                                                        <div className="text-sm text-gray-500">
                                                                            {order.supplier_email}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        {order.quantity}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        ${order.unit_price}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        ${order.total_cost}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                                        {new Date(order.expected_delivery_date).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                            {order.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                                                        <button
                                                                            onClick={() => downloadSupplyOrderPDF(order.id, tender.item_name, order.supplier_name)}
                                                                            className="text-indigo-600 hover:text-indigo-900 flex items-center"
                                                                        >
                                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                                                            </svg>
                                                                            Download PDF
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Evaluation Modal */}
            {showEvaluationModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Purchase Review: {selectedDemand?.item_name}
                        </h3>

                        <form onSubmit={handleEvaluationSubmit}>
                            {/* Demand Details (Editable) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Item Name</label>
                                    <input
                                        type="text"
                                        name="demand_item_name"
                                        value={evaluationForm.updatedDemand.item_name}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Quantity</label>
                                    <input
                                        type="number"
                                        name="demand_quantity"
                                        value={evaluationForm.updatedDemand.quantity}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Estimated Cost</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="demand_estimated_cost"
                                        value={evaluationForm.updatedDemand.estimated_cost}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Urgency</label>
                                    <select
                                        name="demand_urgency"
                                        value={evaluationForm.updatedDemand.urgency}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    >
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        name="demand_description"
                                        value={evaluationForm.updatedDemand.description}
                                        onChange={handleFormChange}
                                        rows={3}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Required By</label>
                                    <input
                                        type="date"
                                        name="demand_required_by"
                                        value={evaluationForm.updatedDemand.required_by}
                                        onChange={handleFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Evaluation Decision */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700">Purchase Decision</label>
                                <div className="mt-2 space-x-4">
                                    <label className="inline-flex items-center">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="approved"
                                            checked={evaluationForm.status === 'approved'}
                                            onChange={handleFormChange}
                                            className="form-radio h-4 w-4 text-indigo-600"
                                        />
                                        <span className="ml-2 text-sm text-gray-700">Approve for Purchase</span>
                                    </label>
                                    <label className="inline-flex items-center">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="rejected"
                                            checked={evaluationForm.status === 'rejected'}
                                            onChange={handleFormChange}
                                            className="form-radio h-4 w-4 text-red-600"
                                        />
                                        <span className="ml-2 text-sm text-gray-700">Reject Purchase</span>
                                    </label>
                                </div>
                            </div>                            {/* Bidding Expiry Time (only for approved) */}
                            {evaluationForm.status === 'approved' && (
                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Bidding Expiry Date & Time <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="datetime-local"
                                        name="biddingExpiryTime"                                        value={evaluationForm.biddingExpiryTime}
                                        onChange={handleFormChange}
                                        min={new Date(Date.now() + 1 * 60 * 1000).toISOString().slice(0, 16)} // Minimum 1 minute from now
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        required
                                    />
                                    <p className="mt-1 text-sm text-gray-500">
                                        Set the deadline for suppliers to submit their bids. Minimum 1 minute required (for testing).
                                    </p>
                                </div>
                            )}

                            {/* Comments */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700">
                                    Comments {evaluationForm.status === 'rejected' && <span className="text-red-500">*</span>}
                                </label>
                                <textarea
                                    name="comments"
                                    value={evaluationForm.comments}
                                    onChange={handleFormChange}
                                    rows={3}
                                    placeholder={evaluationForm.status === 'rejected' ? 'Please provide reason for purchase rejection' : 'Optional comments about the purchase decision'}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowEvaluationModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    Submit Review
                                </button>
                            </div>
                        </form>                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="relative p-8 border w-96 shadow-lg rounded-md bg-white text-center">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Evaluation Submitted!</h3>
                            <p className="text-gray-600">Your purchase review has been successfully submitted.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PurchaseDepartment;
