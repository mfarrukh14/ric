import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const FulfillmentModal = ({ demand, isOpen, onClose, onSuccess }) => {
    const [itemStatuses, setItemStatuses] = useState([]);
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (demand && isOpen) {
            initializeItemStatuses();
        }
    }, [demand, isOpen]);

    const initializeItemStatuses = () => {
        if (!demand) return;

        // Use items array if available, otherwise create from single item demand
        const items = demand.items && demand.items.length > 0 ? demand.items : [{
            id: `single-${demand.id}`,
            item_name: demand.item_name,
            quantity: demand.quantity,
            estimated_cost: demand.estimated_cost,
            unit: demand.unit || 'pcs'
        }];

        const initialStatuses = items.map(item => ({
            itemId: item.id,
            itemName: item.item_name,
            requestedQuantity: parseInt(item.quantity),
            availableQuantity: parseInt(item.quantity), // Default to full quantity
            status: 'available', // Default status
            remarks: '',
            estimatedCost: parseFloat(item.estimated_cost),
            unit: item.unit || 'pcs'
        }));

        setItemStatuses(initialStatuses);
    };

    const handleItemStatusChange = (index, field, value) => {
        const updatedStatuses = [...itemStatuses];
        updatedStatuses[index] = {
            ...updatedStatuses[index],
            [field]: value
        };

        // Auto-adjust status based on available quantity
        if (field === 'availableQuantity') {
            const requestedQty = updatedStatuses[index].requestedQuantity;
            const availableQty = parseInt(value);

            if (availableQty <= 0) {
                updatedStatuses[index].status = 'not_available';
            } else if (availableQty < requestedQty) {
                updatedStatuses[index].status = 'partial';
            } else {
                updatedStatuses[index].status = 'available';
            }
        }

        setItemStatuses(updatedStatuses);
    };

    const handleStatusChange = (index, status) => {
        const updatedStatuses = [...itemStatuses];
        updatedStatuses[index] = {
            ...updatedStatuses[index],
            status: status
        };

        // Auto-adjust quantity based on status
        if (status === 'not_available') {
            updatedStatuses[index].availableQuantity = 0;
        } else if (status === 'available') {
            updatedStatuses[index].availableQuantity = updatedStatuses[index].requestedQuantity;
        }
        // For partial, keep current availableQuantity

        setItemStatuses(updatedStatuses);
    };

    const validateForm = () => {
        if (!response.trim()) {
            setError('Please provide a response/comment');
            return false;
        }

        for (let i = 0; i < itemStatuses.length; i++) {
            const item = itemStatuses[i];
            
            if (item.status === 'partial' && (item.availableQuantity <= 0 || item.availableQuantity >= item.requestedQuantity)) {
                setError(`Item "${item.itemName}": Partial quantity must be between 1 and ${item.requestedQuantity - 1}`);
                return false;
            }

            if (item.availableQuantity < 0) {
                setError(`Item "${item.itemName}": Available quantity cannot be negative`);
                return false;
            }

            if (item.availableQuantity > item.requestedQuantity) {
                setError(`Item "${item.itemName}": Available quantity cannot exceed requested quantity`);
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('token');
            const response_data = await fetch(`${apiUrl}/demands/${demand.id}/items-status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemUpdates: itemStatuses,
                    response: response
                })
            });

            if (!response_data.ok) {
                const errorData = await response_data.json();
                throw new Error(errorData.message || 'Failed to update fulfillment');
            }

            const result = await response_data.json();
            
            if (onSuccess) {
                onSuccess(result);
            }
            
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadgeColor = (status) => {
        switch (status) {
            case 'available': return 'bg-green-100 text-green-800';
            case 'partial': return 'bg-yellow-100 text-yellow-800';
            case 'not_available': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getFulfillmentSummary = () => {
        const fullyAvailable = itemStatuses.filter(item => item.status === 'available').length;
        const partiallyAvailable = itemStatuses.filter(item => item.status === 'partial').length;
        const notAvailable = itemStatuses.filter(item => item.status === 'not_available').length;
        
        return { fullyAvailable, partiallyAvailable, notAvailable };
    };

    const getExpectedOutcome = () => {
        const { fullyAvailable, partiallyAvailable, notAvailable } = getFulfillmentSummary();
        
        if (fullyAvailable === itemStatuses.length) {
            return { status: 'available', text: 'All items will be marked as AVAILABLE', color: 'text-green-600' };
        } else if (partiallyAvailable > 0 || notAvailable > 0) {
            return { status: 'vetting_pending', text: 'Demand will go to VETTING COMMITTEE for review', color: 'text-blue-600' };
        }
        
        return { status: 'pending', text: 'Status will be determined', color: 'text-gray-600' };
    };

    if (!isOpen || !demand) {
        return null;
    }

    const summary = getFulfillmentSummary();
    const expectedOutcome = getExpectedOutcome();

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
                <div className="mt-3">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-2xl font-semibold text-gray-900">
                                Manage Fulfillment - Demand #{demand.id}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                                Specify quantities you can fulfill for each item
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                        >
                            ×
                        </button>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Demand Info */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span className="font-medium text-gray-700">Requested By:</span>
                                <p>{demand.created_by_name}</p>
                            </div>
                            <div>
                                <span className="font-medium text-gray-700">Department:</span>
                                <p>{demand.creator_department || 'N/A'}</p>
                            </div>
                            <div>
                                <span className="font-medium text-gray-700">Required By:</span>
                                <p>{new Date(demand.required_by).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <span className="font-medium text-gray-700">Urgency:</span>
                                <p className="capitalize">{demand.urgency}</p>
                            </div>
                        </div>
                        {demand.description && (
                            <div className="mt-3">
                                <span className="font-medium text-gray-700">Description:</span>
                                <p className="text-gray-600 mt-1">{demand.description}</p>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit}>
                        {/* Items Fulfillment */}
                        <div className="mb-6">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">Items Fulfillment</h4>
                            <div className="space-y-4">
                                {itemStatuses.map((item, index) => (
                                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-3">
                                            <h5 className="font-medium text-gray-900">{item.itemName}</h5>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(item.status)}`}>
                                                {item.status.toUpperCase().replace('_', ' ')}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Requested Quantity
                                                </label>
                                                <div className="text-sm text-gray-600">
                                                    {item.requestedQuantity} {item.unit}
                                                </div>
                                            </div>
                                            
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Available Quantity *
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={item.requestedQuantity}
                                                    value={item.availableQuantity}
                                                    onChange={(e) => handleItemStatusChange(index, 'availableQuantity', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Estimated Cost
                                                </label>
                                                <div className="text-sm text-gray-600">
                                                    ₹{item.estimatedCost}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status Selection */}
                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Fulfillment Status
                                            </label>
                                            <div className="flex space-x-4">
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name={`status-${index}`}
                                                        value="available"
                                                        checked={item.status === 'available'}
                                                        onChange={() => handleStatusChange(index, 'available')}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-green-600">Fully Available</span>
                                                </label>
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name={`status-${index}`}
                                                        value="partial"
                                                        checked={item.status === 'partial'}
                                                        onChange={() => handleStatusChange(index, 'partial')}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-yellow-600">Partially Available</span>
                                                </label>
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name={`status-${index}`}
                                                        value="not_available"
                                                        checked={item.status === 'not_available'}
                                                        onChange={() => handleStatusChange(index, 'not_available')}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-red-600">Not Available</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Remarks */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Remarks (Optional)
                                            </label>
                                            <textarea
                                                value={item.remarks}
                                                onChange={(e) => handleItemStatusChange(index, 'remarks', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                rows="2"
                                                placeholder="Any additional comments for this item..."
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                            <h4 className="font-medium text-gray-900 mb-2">Fulfillment Summary</h4>
                            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                <div className="text-green-600">
                                    <span className="font-medium">Fully Available:</span> {summary.fullyAvailable}
                                </div>
                                <div className="text-yellow-600">
                                    <span className="font-medium">Partially Available:</span> {summary.partiallyAvailable}
                                </div>
                                <div className="text-red-600">
                                    <span className="font-medium">Not Available:</span> {summary.notAvailable}
                                </div>
                            </div>
                            <div className={`font-medium ${expectedOutcome.color}`}>
                                Expected Outcome: {expectedOutcome.text}
                            </div>
                        </div>

                        {/* Store Response */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Store Response/Comments *
                            </label>
                            <textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows="3"
                                placeholder="Provide your overall response and any additional comments..."
                                required
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                disabled={loading}
                            >
                                {loading ? 'Submitting...' : 'Submit Fulfillment'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default FulfillmentModal;