import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';
import CostAnalysisChart from './CostAnalysisChart';
import { generateDemandReport } from '../../utils/excelReportGenerator';

const FulfillmentPage = () => {
    const { demandId } = useParams();
    const navigate = useNavigate();
    
    const [demand, setDemand] = useState(null);
    const [items, setItems] = useState([]);
    const [currentItemIndex, setCurrentItemIndex] = useState(0);
    const [itemStatuses, setItemStatuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [categories, setCategories] = useState([]);
    const [response, setResponse] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [activeView, setActiveView] = useState('fulfillment'); // 'fulfillment' or 'analytics'
    const [showZeroQuantityAlert, setShowZeroQuantityAlert] = useState(false);
    const [showRemovalModal, setShowRemovalModal] = useState(false);
    const [removalReason, setRemovalReason] = useState('');

    // Filtered items based on search and category filter
    const filteredItems = items.filter(item => {
        const matchesSearch = item.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            item.categoryName?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !categoryFilter || item.categoryId?.toString() === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    useEffect(() => {
        if (demandId) {
            fetchDemandDetails();
        }
    }, [demandId]);

    useEffect(() => {
        // Reset current index when filtered items change
        if (filteredItems.length > 0 && currentItemIndex >= filteredItems.length) {
            setCurrentItemIndex(0);
        }
    }, [filteredItems, currentItemIndex]);

    const fetchDemandDetails = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            
            // Fetch demand details with items
            const demandResponse = await fetch(`${apiUrl}/demands/${demandId}/with-items`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!demandResponse.ok) {
                throw new Error('Failed to fetch demand details');
            }
            
            const demandData = await demandResponse.json();
            console.log('Demand data received:', demandData);
            setDemand(demandData);

            // Fetch categories for filtering
            const categoriesResponse = await fetch(`${apiUrl}/items/categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (categoriesResponse.ok) {
                const categoriesData = await categoriesResponse.json();
                setCategories(categoriesData);
            }

            // Process demand items with category names
            const processedItems = (demandData.items || []).map((item) => {
                return {
                    ...item,
                    categoryName: item.category_name || 'N/A',
                    itemName: item.item_name_full || item.item_name || 'Unknown Item',
                    categoryId: item.category_id,
                    itemNameId: item.item_name_id,
                    specifications: item.specifications || ''
                };
            });

            setItems(processedItems);
            initializeItemStatuses(processedItems);
            
        } catch (error) {
            console.error('Error fetching demand:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const initializeItemStatuses = (itemsData) => {
        const initialStatuses = itemsData.map(item => ({
            itemId: item.id,
            itemName: item.itemName,
            requestedQuantity: parseInt(item.quantity),
            availableQuantity: parseInt(item.quantity),
            status: 'available',
            remarks: '',
            specifications: item.specifications || '',
            estimatedCost: parseFloat(item.estimated_cost || 0),
            unit: item.unit || 'pcs',
            stockInHand: parseInt(item.stock_in_hand || 0),
            consumptionType: item.consumption_type || 'monthly',
            consumptionAmount: parseInt(item.consumption_amount || 0),
            calculatedRequiredQty: parseInt(item.calculated_required_qty || item.quantity),
            storeEstimatedCost: parseFloat(item.store_estimated_cost || item.estimated_cost || 0),
            removalReason: item.removal_reason || '',
            isRemoved: item.is_removed || false,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            itemNameId: item.itemNameId,
            prevYearCost: parseFloat(item.prev_year_cost || 0),
            currentYearCost: parseFloat(item.current_year_cost || item.estimated_cost || 0)
        }));

        setItemStatuses(initialStatuses);
    };

    const getCurrentItem = () => {
        return filteredItems[currentItemIndex];
    };

    const getCurrentItemStatus = () => {
        const currentItem = getCurrentItem();
        if (!currentItem) return null;
        return itemStatuses.find(status => status.itemId === currentItem.id);
    };

    const updateCurrentItemStatus = (field, value) => {
        const currentItem = getCurrentItem();
        if (!currentItem) return;

        const updatedStatuses = itemStatuses.map(status => {
            if (status.itemId === currentItem.id) {
                const updated = { ...status, [field]: value };

                // Auto-calculate required quantity when stock or consumption changes
                if (field === 'stockInHand' || field === 'consumptionAmount' || field === 'consumptionType') {
                    const stockInHand = parseInt(updated.stockInHand || 0);
                    const consumptionAmount = parseInt(updated.consumptionAmount || 0);
                    const requestedQty = updated.requestedQuantity;
                    
                    let shortfall = 0;
                    if (consumptionAmount > stockInHand) {
                        shortfall = consumptionAmount - stockInHand;
                    }
                    
                    if (field !== 'calculatedRequiredQty') {
                        updated.calculatedRequiredQty = shortfall;
                    }
                    
                    updated.availableQuantity = updated.calculatedRequiredQty;

                    // Auto-adjust status based on stock availability
                    if (stockInHand === 0) {
                        updated.status = 'not_available';
                    } else {
                        // If consumption is 0, compare with requested quantity
                        // Otherwise, compare with consumption amount
                        const comparisonValue = consumptionAmount === 0 ? requestedQty : consumptionAmount;
                        
                        if (stockInHand >= comparisonValue) {
                            updated.status = 'available';
                        } else {
                            updated.status = 'partial';
                        }
                    }
                }

                // Sync available quantity when calculated required quantity changes
                if (field === 'calculatedRequiredQty') {
                    updated.availableQuantity = parseInt(value || 0);
                }

                // Auto-adjust status based on available quantity
                if (field === 'calculatedRequiredQty') {
                    const requestedQty = updated.requestedQuantity;
                    const availableQty = parseInt(value || 0);

                    if (availableQty <= 0) {
                        updated.status = 'not_available';
                    } else if (availableQty < requestedQty) {
                        updated.status = 'partial';
                    } else {
                        updated.status = 'available';
                    }
                }

                return updated;
            }
            return status;
        });

        setItemStatuses(updatedStatuses);
    };

    const handleItemRemoval = (isRemoved, reason = '') => {
        const currentItem = getCurrentItem();
        if (!currentItem) return;

        const updatedStatuses = itemStatuses.map(status => {
            if (status.itemId === currentItem.id) {
                return {
                    ...status,
                    isRemoved: isRemoved,
                    removalReason: reason,
                    availableQuantity: isRemoved ? 0 : status.calculatedRequiredQty,
                    status: isRemoved ? 'not_available' : 'available'
                };
            }
            return status;
        });

        setItemStatuses(updatedStatuses);
    };

    const handleRemovalConfirm = () => {
        if (removalReason.trim()) {
            handleItemRemoval(true, removalReason.trim());
            setShowRemovalModal(false);
            setRemovalReason('');
            // Move to next item after removal
            if (currentItemIndex < filteredItems.length - 1) {
                navigateToItem(currentItemIndex + 1);
            }
        }
    };

    const openRemovalModal = () => {
        setRemovalReason('');
        setShowRemovalModal(true);
    };

    const handleStatusChange = (status) => {
        const currentItem = getCurrentItem();
        if (!currentItem) return;

        const updatedStatuses = itemStatuses.map(statusItem => {
            if (statusItem.itemId === currentItem.id) {
                const updated = { ...statusItem, status };

                if (status === 'not_available') {
                    updated.calculatedRequiredQty = 0;
                    updated.availableQuantity = 0;
                } else if (status === 'available') {
                    updated.calculatedRequiredQty = updated.requestedQuantity;
                    updated.availableQuantity = updated.requestedQuantity;
                }

                return updated;
            }
            return statusItem;
        });

        setItemStatuses(updatedStatuses);
    };

    const navigateToItem = (index) => {
        if (index >= 0 && index < filteredItems.length) {
            setCurrentItemIndex(index);
        }
    };

    const goToNextItem = () => {
        const currentItemStatus = getCurrentItemStatus();
        
        // Check if calculated quantity is 0 and item is not removed
        if (currentItemStatus && 
            parseInt(currentItemStatus.calculatedRequiredQty || 0) === 0 && 
            !currentItemStatus.isRemoved) {
            setShowZeroQuantityAlert(true);
            return;
        }
        
        navigateToItem(currentItemIndex + 1);
    };

    const goToPreviousItem = () => {
        navigateToItem(currentItemIndex - 1);
    };

    const jumpToItem = (itemId) => {
        const index = filteredItems.findIndex(item => item.id === itemId);
        if (index !== -1) {
            setCurrentItemIndex(index);
        }
    };

    const validateForm = () => {
        if (!response.trim()) {
            setError('Please provide a response/comment');
            return false;
        }

        for (let i = 0; i < itemStatuses.length; i++) {
            const item = itemStatuses[i];
            
            if (item.status === 'partial' && (item.calculatedRequiredQty <= 0 || item.calculatedRequiredQty >= item.requestedQuantity)) {
                setError(`Item "${item.itemName}": Partial quantity must be between 1 and ${item.requestedQuantity - 1}`);
                return false;
            }

            if (item.calculatedRequiredQty < 0) {
                setError(`Item "${item.itemName}": Required quantity cannot be negative`);
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const token = localStorage.getItem('token');
            const response_data = await fetch(`${apiUrl}/demands/${demandId}/items-status`, {
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
            
            // Generate Excel report after successful submission
            try {
                const reportFilename = generateDemandReport(demand, items);
                console.log('Excel report generated:', reportFilename);
                
                // Show success message with report info
                navigate('/dashboard', { 
                    state: { 
                        message: `Fulfillment submitted successfully! Excel report "${reportFilename}" has been downloaded.`,
                        type: 'success'
                    }
                });
            } catch (reportError) {
                console.error('Error generating report:', reportError);
                // Still navigate with success, but mention report issue
                navigate('/dashboard', { 
                    state: { 
                        message: 'Fulfillment submitted successfully! (Report generation failed)',
                        type: 'success'
                    }
                });
            }
            
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
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
        const nonRemovedItems = itemStatuses.filter(item => !item.isRemoved);
        const fullyAvailable = nonRemovedItems.filter(item => item.status === 'available').length;
        const partiallyAvailable = nonRemovedItems.filter(item => item.status === 'partial').length;
        const notAvailable = nonRemovedItems.filter(item => item.status === 'not_available').length;
        const removedItems = itemStatuses.filter(item => item.isRemoved).length;
        
        return { fullyAvailable, partiallyAvailable, notAvailable, removedItems };
    };

    const getExpectedOutcome = () => {
        const { fullyAvailable, partiallyAvailable, notAvailable, removedItems } = getFulfillmentSummary();
        const totalNonRemovedItems = fullyAvailable + partiallyAvailable + notAvailable;
        
        if (totalNonRemovedItems === 0) {
            return { status: 'all_removed', text: 'All items have been removed from demand', color: 'text-red-600' };
        } else if (fullyAvailable === totalNonRemovedItems) {
            return { status: 'available', text: 'All remaining items will be marked as AVAILABLE', color: 'text-green-600' };
        } else if (partiallyAvailable > 0 || notAvailable > 0) {
            return { status: 'pending_hod_approval', text: 'Demand will go to HOD for approval first, then to PURCHASE DEPARTMENT if needed', color: 'text-orange-600' };
        }
        
        return { status: 'pending', text: 'Status will be determined', color: 'text-gray-600' };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading demand details...</p>
                </div>
            </div>
        );
    }

    if (error && !demand) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 mb-4">{error}</p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const currentItem = getCurrentItem();
    const currentItemStatus = getCurrentItemStatus();
    const summary = getFulfillmentSummary();
    const expectedOutcome = getExpectedOutcome();

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                Manage Fulfillment - Demand #{demand?.id}
                            </h1>
                            <p className="text-gray-600 mt-2">
                                Review and update stock availability for each item in this demand
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                            Back to Dashboard
                        </button>
                    </div>

                    {/* Demand Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 p-4 bg-gray-50 rounded-lg text-sm">
                        <div>
                            <span className="font-medium text-gray-700">Requested By:</span>
                            <p>{demand?.created_by_name}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Department:</span>
                            <p>{demand?.creator_department || 'N/A'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Required By:</span>
                            <p>{demand?.required_by ? new Date(demand.required_by).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Urgency:</span>
                            <p className="capitalize">{demand?.urgency || 'Normal'}</p>
                        </div>
                    </div>
                    
                    {demand?.description && (
                        <div className="mt-4">
                            <span className="font-medium text-gray-700">Description:</span>
                            <p className="text-gray-600 mt-1">{demand.description}</p>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="mt-6 flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveView('fulfillment')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeView === 'fulfillment'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Item Review & Fulfillment
                        </button>
                        <button
                            onClick={() => setActiveView('analytics')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeView === 'analytics'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Cost Analysis & Projections
                        </button>
                    </div>
                </div>

                {/* Analytics View */}
                {activeView === 'analytics' && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <CostAnalysisChart 
                            itemStatuses={itemStatuses}
                            filteredItems={filteredItems}
                        />
                        
                        {/* Floating Action Button to switch back to fulfillment */}
                        <div className="fixed bottom-6 right-6 z-50">
                            <button
                                onClick={() => setActiveView('fulfillment')}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-colors"
                                title="Back to Item Review"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {/* Error Display */}
                {error && activeView === 'fulfillment' && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}

                {/* Zero Quantity Alert Modal */}
                {showZeroQuantityAlert && (
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                            <div className="flex items-center mb-4">
                                <div className="flex-shrink-0">
                                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                        <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-lg font-medium text-gray-900">
                                        Zero Quantity Detected
                                    </h3>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <p className="text-sm text-gray-600 mb-3">
                                    The calculated required quantity for this item is <strong>0</strong>. Since no quantity is needed, 
                                    this item should be removed from the demand.
                                </p>
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                    <p className="text-sm text-orange-800">
                                        <strong>Current Item:</strong> {getCurrentItem()?.itemName}
                                    </p>
                                    <p className="text-sm text-orange-700 mt-1">
                                        Please remove this item to continue, or adjust the stock/consumption values if needed.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => setShowZeroQuantityAlert(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                >
                                    Go Back & Adjust
                                </button>
                                <button
                                    onClick={() => {
                                        setShowZeroQuantityAlert(false);
                                        openRemovalModal();
                                    }}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                    Remove Item
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Removal Reason Modal */}
                {showRemovalModal && (
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                            <div className="flex items-center mb-4">
                                <div className="flex-shrink-0">
                                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-lg font-medium text-gray-900">
                                        Remove Item from Demand
                                    </h3>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <p className="text-sm text-gray-600 mb-4">
                                    You are about to remove <strong>"{getCurrentItem()?.itemName}"</strong> from this demand. 
                                    Please provide a reason for this removal.
                                </p>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Reason for Removal *
                                    </label>
                                    <textarea
                                        value={removalReason}
                                        onChange={(e) => setRemovalReason(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                        rows="3"
                                        placeholder="Please explain why this item is being removed from the demand..."
                                        required
                                    />
                                    {removalReason.trim() && (
                                        <div className="mt-2 text-sm text-gray-500">
                                            Character count: {removalReason.length}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm text-red-800">
                                                <strong>Warning:</strong> This action cannot be undone easily. The item will be marked as removed from this demand.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => {
                                        setShowRemovalModal(false);
                                        setRemovalReason('');
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRemovalConfirm}
                                    disabled={!removalReason.trim()}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Remove Item
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeView === 'fulfillment' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar - Items List */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">Items List</h2>
                                <span className="text-sm text-gray-500">
                                    {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Search and Filter */}
                            <div className="space-y-3 mb-4">
                                <div>
                                    <input
                                        type="text"
                                        placeholder="Search items..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="">All Categories</option>
                                        {categories.map(category => (
                                            <option key={category.id} value={category.id.toString()}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {filteredItems.map((item, index) => {
                                    const itemStatus = itemStatuses.find(s => s.itemId === item.id);
                                    const isActive = index === currentItemIndex;
                                    
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setCurrentItemIndex(index)}
                                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                isActive 
                                                    ? 'border-blue-500 bg-blue-50' 
                                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-medium text-sm text-gray-900 truncate">
                                                    {item.itemName}
                                                </h3>
                                                {itemStatus && (
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(itemStatus.status)}`}>
                                                        {itemStatus.status.toUpperCase().replace('_', ' ')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mb-1">{item.categoryName}</p>
                                            <p className="text-xs text-gray-600">
                                                Requested: {item.quantity} {item.unit}
                                            </p>
                                            {itemStatus?.isRemoved && (
                                                <span className="inline-block mt-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                                                    REMOVED
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {filteredItems.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <p>No items found matching your search criteria.</p>
                                </div>
                            )}
                        </div>

                        {/* Progress Summary */}
                        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Summary</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-green-600">Fully Available:</span>
                                    <span className="font-medium">{summary.fullyAvailable}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-yellow-600">Partially Available:</span>
                                    <span className="font-medium">{summary.partiallyAvailable}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-red-600">Not Available:</span>
                                    <span className="font-medium">{summary.notAvailable}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-red-800">Removed:</span>
                                    <span className="font-medium">{summary.removedItems}</span>
                                </div>
                                <hr className="my-3" />
                                <div className={`font-medium ${expectedOutcome.color}`}>
                                    {expectedOutcome.text}
                                </div>
                            </div>
                        </div>

                        {/* Quick Cost Summary */}
                        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">Cost Overview</h3>
                                <button
                                    onClick={() => setActiveView('analytics')}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                    View Details →
                                </button>
                            </div>
                            <div className="space-y-3 text-sm">
                                {(() => {
                                    const totalCurrent = itemStatuses.reduce((sum, item) => sum + (item.currentYearCost || 0), 0);
                                    const totalProjected = itemStatuses.reduce((sum, item) => {
                                        const projectedCost = item.requestedQuantity > 0 ? 
                                            (item.storeEstimatedCost / item.requestedQuantity) * item.calculatedRequiredQty : 0;
                                        return sum + (isNaN(projectedCost) ? 0 : projectedCost);
                                    }, 0);
                                    const savings = totalCurrent - totalProjected;
                                    
                                    return (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Requested Cost:</span>
                                                <span className="font-medium">Rs {totalCurrent.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-blue-600">Projected Cost:</span>
                                                <span className="font-medium">Rs {totalProjected.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className={savings >= 0 ? "text-green-600" : "text-red-600"}>
                                                    {savings >= 0 ? "Potential Savings:" : "Additional Cost:"}
                                                </span>
                                                <span className={`font-medium ${savings >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                    Rs {Math.abs(savings).toLocaleString()}
                                                </span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Main Content - Current Item */}
                    <div className="lg:col-span-3">
                        {currentItem && currentItemStatus ? (
                            <div className="bg-white rounded-lg shadow-sm p-6">
                                {/* Item Header */}
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">
                                            {currentItem.itemName}
                                        </h2>
                                        <p className="text-gray-600">
                                            Item {currentItemIndex + 1} of {filteredItems.length}
                                        </p>
                                    </div>
                                    <div className="flex space-x-2">
                                        <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusBadgeColor(currentItemStatus.status)}`}>
                                            {currentItemStatus.status.toUpperCase().replace('_', ' ')}
                                        </span>
                                        {currentItemStatus.isRemoved && (
                                            <span className="px-3 py-1 rounded text-sm font-medium bg-red-100 text-red-800">
                                                REMOVED
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Navigation */}
                                <div className="flex justify-between items-center mb-6 p-4 bg-gray-50 rounded-lg">
                                    <button
                                        onClick={goToPreviousItem}
                                        disabled={currentItemIndex === 0}
                                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        ← Previous
                                    </button>
                                    
                                    <span className="text-sm text-gray-600">
                                        {currentItemIndex + 1} / {filteredItems.length}
                                    </span>
                                    
                                    <button
                                        onClick={goToNextItem}
                                        disabled={currentItemIndex === filteredItems.length - 1}
                                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next →
                                    </button>
                                </div>

                                {/* Item Details */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Category
                                        </label>
                                        <div className="text-sm text-gray-600">
                                            {currentItem.categoryName || 'N/A'}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Requested Quantity
                                        </label>
                                        <div className="text-sm text-gray-600">
                                            {currentItem.quantity} {currentItem.unit}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Previous Year Cost
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={currentItemStatus.prevYearCost}
                                            onChange={(e) => updateCurrentItemStatus('prevYearCost', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                        <div className="text-xs text-gray-500 mt-1">Rs (Editable)</div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Current Year Cost
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={currentItemStatus.currentYearCost}
                                            onChange={(e) => updateCurrentItemStatus('currentYearCost', e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                        <div className="text-xs text-gray-500 mt-1">Rs (Editable)</div>
                                    </div>
                                </div>

                                {/* Item Specifications */}
                                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Item Specifications (Editable by Store)
                                    </label>
                                    <textarea
                                        value={currentItemStatus.specifications}
                                        onChange={(e) => updateCurrentItemStatus('specifications', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
                                        placeholder="Enter or modify item specifications..."
                                        rows="4"
                                    />
                                    <div className="text-xs text-gray-500 mt-1">
                                        Store users can modify specifications as needed
                                    </div>
                                </div>

                                {!currentItemStatus.isRemoved ? (
                                    <>
                                        {/* Stock Management Section */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Stock in Hand *
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={currentItemStatus.stockInHand}
                                                    onChange={(e) => updateCurrentItemStatus('stockInHand', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    required
                                                />
                                                <div className="text-xs text-gray-500 mt-1">{currentItem.unit}</div>
                                            </div>
                                            
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Consumption Type *
                                                </label>
                                                <select
                                                    value={currentItemStatus.consumptionType}
                                                    onChange={(e) => updateCurrentItemStatus('consumptionType', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    required
                                                >
                                                    <option value="monthly">Monthly</option>
                                                    <option value="quarterly">Quarterly</option>
                                                    <option value="yearly">Yearly</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Consumption Amount *
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={currentItemStatus.consumptionAmount}
                                                    onChange={(e) => updateCurrentItemStatus('consumptionAmount', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    required
                                                />
                                                <div className="text-xs text-gray-500 mt-1">{currentItem.unit}</div>
                                            </div>
                                        </div>

                                        {/* Calculated Requirements */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Calculated Required Qty
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={currentItemStatus.calculatedRequiredQty}
                                                    onChange={(e) => updateCurrentItemStatus('calculatedRequiredQty', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <div className="text-xs text-gray-500 mt-1">{currentItem.unit} (Auto-calculated, but editable)</div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Store Estimated Cost
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={currentItemStatus.storeEstimatedCost}
                                                    onChange={(e) => updateCurrentItemStatus('storeEstimatedCost', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <div className="text-xs text-gray-500 mt-1">Rs</div>
                                            </div>
                                        </div>

                                        {/* Status Selection */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                                Fulfillment Status
                                            </label>
                                            <div className="flex flex-wrap gap-4">
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="status"
                                                        value="available"
                                                        checked={currentItemStatus.status === 'available'}
                                                        onChange={() => handleStatusChange('available')}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-green-600">Fully Available</span>
                                                </label>
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="status"
                                                        value="partial"
                                                        checked={currentItemStatus.status === 'partial'}
                                                        onChange={() => handleStatusChange('partial')}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-yellow-600">Partially Available</span>
                                                </label>
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="status"
                                                        value="not_available"
                                                        checked={currentItemStatus.status === 'not_available'}
                                                        onChange={() => handleStatusChange('not_available')}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-red-600">Not Available</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Remarks */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Remarks (Optional)
                                            </label>
                                            <textarea
                                                value={currentItemStatus.remarks}
                                                onChange={(e) => updateCurrentItemStatus('remarks', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                rows="3"
                                                placeholder="Any additional comments for this item..."
                                            />
                                        </div>

                                        {/* Remove Item Option */}
                                        <div className="flex justify-end mb-6">
                                            <button
                                                type="button"
                                                onClick={openRemovalModal}
                                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                                            >
                                                Remove Item from Demand
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    /* Removed Item Display */
                                    <div className="p-6 bg-red-50 border border-red-200 rounded-lg mb-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-red-800 font-medium text-lg">This item has been removed from the demand</p>
                                                <p className="text-red-600 mt-2">Reason: {currentItemStatus.removalReason}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleItemRemoval(false, '')}
                                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                                            >
                                                Restore Item
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Final Actions - Only show on last item */}
                                {currentItemIndex === filteredItems.length - 1 && (
                                    <div className="border-t pt-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Final Review & Submission</h3>
                                        
                                        {/* Store Response */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Store Response/Comments *
                                            </label>
                                            <textarea
                                                value={response}
                                                onChange={(e) => setResponse(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                rows="4"
                                                placeholder="Provide your overall response and any additional comments about this demand..."
                                                required
                                            />
                                        </div>

                                        {/* Submit Button */}
                                        <div className="flex justify-end space-x-3">
                                            <button
                                                type="button"
                                                onClick={() => navigate('/dashboard')}
                                                className="px-6 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                                disabled={submitting}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSubmit}
                                                className="px-8 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                                disabled={submitting}
                                            >
                                                {submitting ? 'Submitting...' : 'Submit Fulfillment'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-lg shadow-sm p-6 text-center">
                                <p className="text-gray-500">
                                    {filteredItems.length === 0 
                                        ? 'No items match your search criteria.' 
                                        : 'Select an item from the sidebar to begin review.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                )}
            </div>
        </div>
    );
};

export default FulfillmentPage;
