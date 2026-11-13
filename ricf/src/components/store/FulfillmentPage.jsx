import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiUrl, downloadFile } from '../../config/api';
import CostAnalysisChart from './CostAnalysisChart';

import { formatDate } from '../../lib/time';
import { humanize } from '../../ui/status';
import { toast } from '../../lib/notify';
// Shared availability logic: derives fulfillment status, how much store can
// actually supply, and the reorder shortfall purely from actual stock/
// consumption numbers - never assumes "available" by default. Zero stock in
// hand is always "not available".
//
// - availableQuantity: how much of this request store can supply now (never more than stock).
// - calculatedRequiredQty: how many units purchase must buy. Same rule as the server
//   (storeController.procurementQuantity), so what store sees here is what gets saved:
//     available → 0, not available → the full request, partial → (consumption or request) − stock.
const procurementQuantity = (status, requested, stock, consumption) => {
    if (status === 'available') return 0;
    if (status === 'not_available') return Math.max(0, requested);
    return Math.max(0, (consumption || requested) - stock);
};

const computeAutoFields = (stockInHand, consumptionAmount, requestedQuantity) => {
    const stock = parseInt(stockInHand || 0);
    const consumption = parseInt(consumptionAmount || 0);
    const requested = parseInt(requestedQuantity || 0);
    const availableQuantity = Math.min(stock, requested);

    let status;
    if (stock === 0) {
        status = 'not_available';
    } else {
        const comparisonValue = consumption === 0 ? requested : consumption;
        status = stock >= comparisonValue ? 'available' : 'partial';
    }

    return { calculatedRequiredQty: procurementQuantity(status, requested, stock, consumption), availableQuantity, status };
};

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

            // Best-effort: look up real stock-on-hand from the hospital inventory
            // system so the store user isn't starting from a blind "0" - the value
            // stays fully editable either way.
            let hmsStockByName = {};
            try {
                const namesToLookup = [...new Set(processedItems.map(i => i.itemName).filter(Boolean))];
                if (namesToLookup.length > 0) {
                    const stockResponse = await fetch(`${apiUrl}/hms-stock/lookup`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ itemNames: namesToLookup })
                    });
                    if (stockResponse.ok) {
                        hmsStockByName = await stockResponse.json();
                    }
                }
            } catch (stockError) {
                console.warn('HMS stock lookup unavailable, continuing without auto-fill:', stockError.message);
            }

            initializeItemStatuses(processedItems, hmsStockByName);

        } catch (error) {
            console.error('Error fetching demand:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const initializeItemStatuses = (itemsData, hmsStockByName = {}) => {
        const initialStatuses = itemsData.map(item => {
            const persistedStock = parseInt(item.stock_in_hand || 0);
            const hmsMatch = hmsStockByName[item.itemName];
            // Only auto-fill from HMS when store hasn't already entered a stock
            // value for this item (e.g. re-opening a partially reviewed demand).
            const hasPersistedStock = persistedStock > 0;
            const useHmsStock = !hasPersistedStock && hmsMatch && hmsMatch.found;
            const stockInHand = useHmsStock ? parseInt(hmsMatch.totalStock || 0) : persistedStock;
            const stockSource = useHmsStock ? 'hms' : (hasPersistedStock ? 'persisted' : 'manual');

            const consumptionAmount = parseInt(item.consumption_amount || 0);
            const requestedQuantity = parseInt(item.quantity);

            // If this item was already reviewed in a previous session, keep that
            // decision. Otherwise derive status/qty from actual stock - never
            // default to "available".
            const hasBeenReviewed = item.store_status && item.store_status !== 'pending';
            let status;
            let calculatedRequiredQty;
            let availableQuantity;
            if (hasBeenReviewed) {
                status = item.store_status;
                calculatedRequiredQty = item.calculated_required_qty != null
                    ? parseInt(item.calculated_required_qty)
                    : requestedQuantity;
                availableQuantity = item.store_available_quantity != null
                    ? parseInt(item.store_available_quantity)
                    : Math.min(stockInHand, requestedQuantity);
            } else {
                const auto = computeAutoFields(stockInHand, consumptionAmount, requestedQuantity);
                status = auto.status;
                calculatedRequiredQty = auto.calculatedRequiredQty;
                availableQuantity = auto.availableQuantity;
            }

            return {
                itemId: item.id,
                itemName: item.itemName,
                requestedQuantity,
                availableQuantity,
                status,
                remarks: '',
                specifications: item.specifications || '',
                estimatedCost: parseFloat(item.estimated_cost || 0),
                unit: item.unit || 'pcs',
                stockInHand,
                stockSource,
                hmsMatchedName: useHmsStock ? hmsMatch.matchedItemName : null,
                consumptionType: item.consumption_type || 'yearly',
                consumptionAmount,
                calculatedRequiredQty,
                storeEstimatedCost: parseFloat(item.store_estimated_cost || item.estimated_cost || 0),
                removalReason: item.removal_reason || '',
                isRemoved: item.is_removed || false,
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                itemNameId: item.itemNameId,
                prevYearCost: parseFloat(item.prev_year_cost || 0),
                currentYearCost: parseFloat(item.current_year_cost || item.estimated_cost || 0)
            };
        });

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

                if (field === 'stockInHand') {
                    updated.stockSource = 'manual';
                    updated.hmsMatchedName = null;
                }

                // Auto-calculate required quantity, real store availability, and
                // status when stock or consumption changes
                if (field === 'stockInHand' || field === 'consumptionAmount' || field === 'consumptionType') {
                    const auto = computeAutoFields(updated.stockInHand, updated.consumptionAmount, updated.requestedQuantity);
                    updated.calculatedRequiredQty = auto.calculatedRequiredQty;
                    updated.availableQuantity = auto.availableQuantity;
                    updated.status = auto.status;
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
                    availableQuantity: isRemoved ? 0 : status.requestedQuantity,
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

                const requested = parseInt(updated.requestedQuantity || 0);
                const stock = parseInt(updated.stockInHand || 0);
                updated.availableQuantity = status === 'available' ? requested : status === 'not_available' ? 0 : Math.min(stock, requested);
                updated.calculatedRequiredQty = procurementQuantity(status, requested, stock, parseInt(updated.consumptionAmount || 0));

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

    const goToNextItem = () => navigateToItem(currentItemIndex + 1);

    const goToPreviousItem = () => {
        navigateToItem(currentItemIndex - 1);
    };


    const validateForm = () => {
        if (!response.trim()) {
            setError('Please provide a response/comment');
            return false;
        }

        for (let i = 0; i < itemStatuses.length; i++) {
            const item = itemStatuses[i];

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
            toast.success(result.redirectsToHod === false ? 'All items supplied from store; requester notified' : 'Sent to the store HOD for approval');
            // The estimate is built on the server from what was just saved.
            await downloadFile(`/demands/${demandId}/excel-report`, `Demand_${demandId}_estimate.xlsx`).catch(() => toast.error('Saved, but the Excel report could not be downloaded'));
            navigate('/store/demands');
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
        const { fullyAvailable, partiallyAvailable, notAvailable } = getFulfillmentSummary();
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
                    <div className="ui-spin mx-auto"></div>
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
                        className="ui-btn ui-btn--secondary"
                    >
                        Back to dashboard
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
                <div className="ui-panel ui-panel--pad mb-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                Manage fulfillment - demand #{demand?.id}
                            </h1>
                            <p className="text-gray-600 mt-2">
                                Review and update stock availability for each item in this demand
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="ui-btn ui-btn--secondary"
                        >
                            Back to dashboard
                        </button>
                    </div>

                    {/* Demand Info */}
                    <div className="ui-callout grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
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
                            <p>{demand?.required_by ? formatDate(demand.required_by) : 'N/A'}</p>
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
                            Item review & fulfillment
                        </button>
                        <button
                            onClick={() => setActiveView('analytics')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeView === 'analytics'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Cost analysis & projections
                        </button>
                    </div>
                </div>

                {/* Analytics View */}
                {activeView === 'analytics' && (
                    <div className="ui-panel ui-panel--pad">
                        <CostAnalysisChart 
                            itemStatuses={itemStatuses}
                            filteredItems={filteredItems}
                        />
                        
                        {/* Floating Action Button to switch back to fulfillment */}
                        <div className="fixed bottom-6 right-6 z-50">
                            <button
                                onClick={() => setActiveView('fulfillment')}
                                className="ui-btn ui-btn--primary"
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
                    <div className="ui-callout ui-callout--danger mb-6">
                        <p className="text-sm text-red-600">{error}</p>
                    </div>
                )}

                {/* Removal Reason Modal */}
                {showRemovalModal && (
                    <div className="ui-scrim">
                        <div className="ui-dialog ui-dialog--legacy ui-dialog--sm">
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
                                        Remove item from demand
                                    </h3>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <p className="text-sm text-gray-600 mb-4">
                                    You are about to remove <strong>"{getCurrentItem()?.itemName}"</strong> from this demand. 
                                    Please provide a reason for this removal.
                                </p>
                                
                                <div className="mb-4">
                                    <label className="ui-label block mb-2">
                                        Reason for removal *
                                    </label>
                                    <textarea
                                        value={removalReason}
                                        onChange={(e) => setRemovalReason(e.target.value)}
                                        className="ui-input ui-textarea"
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

                                <div className="ui-callout ui-callout--danger">
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
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRemovalConfirm}
                                    disabled={!removalReason.trim()}
                                    className="ui-btn ui-btn--danger-solid"
                                >
                                    Remove item
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeView === 'fulfillment' && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar - Items List */}
                    <div className="lg:col-span-1">
                        <div className="ui-panel ui-panel--pad">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">Items list</h2>
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
                                        className="ui-input"
                                    />
                                </div>
                                <div>
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="ui-input"
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
                                                        {humanize(itemStatus.status)}
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
                        <div className="ui-panel ui-panel--pad mt-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress summary</h3>
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
                        <div className="ui-panel ui-panel--pad mt-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">Cost overview</h3>
                                <button
                                    onClick={() => setActiveView('analytics')}
                                    className="ui-btn ui-btn--ghost ui-btn--sm"
                                >
                                    View details →
                                </button>
                            </div>
                            <div className="space-y-3 text-sm">
                                {(() => {
                                    // Rates are per unit: requested × rate vs to-procure × rate.
                                    const totalCurrent = itemStatuses.reduce((sum, item) => sum + (Number(item.currentYearCost) || 0) * (Number(item.requestedQuantity) || 0), 0);
                                    const totalProjected = itemStatuses.reduce((sum, item) => sum + (item.isRemoved ? 0 : (Number(item.currentYearCost) || 0) * (Number(item.calculatedRequiredQty) || 0)), 0);
                                    const savings = totalCurrent - totalProjected;
                                    
                                    return (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Requested:</span>
                                                <span className="font-medium">Rs {totalCurrent.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-blue-600">To procure:</span>
                                                <span className="font-medium">Rs {totalProjected.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className={savings >= 0 ? "text-green-600" : "text-red-600"}>
                                                    {savings >= 0 ? "Covered by store stock:" : "Above request:"}
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
                            <div className="ui-panel ui-panel--pad">
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
                                            {humanize(currentItemStatus.status)}
                                        </span>
                                        {currentItemStatus.isRemoved && (
                                            <span className="px-3 py-1 rounded text-sm font-medium bg-red-100 text-red-800">
                                                REMOVED
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Navigation */}
                                <div className="ui-callout flex justify-between items-center mb-6">
                                    <button
                                        onClick={goToPreviousItem}
                                        disabled={currentItemIndex === 0}
                                        className="ui-btn ui-btn--primary"
                                    >
                                        ← Previous
                                    </button>
                                    
                                    <span className="text-sm text-gray-600">
                                        {currentItemIndex + 1} / {filteredItems.length}
                                    </span>
                                    
                                    <button
                                        onClick={goToNextItem}
                                        disabled={currentItemIndex === filteredItems.length - 1}
                                        className="ui-btn ui-btn--primary"
                                    >
                                        Next →
                                    </button>
                                </div>

                                {/* Item Details */}
                                <div className="ui-callout grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                    <div>
                                        <label className="ui-label block mb-1">
                                            Category
                                        </label>
                                        <div className="text-sm text-gray-600">
                                            {currentItem.categoryName || 'N/A'}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="ui-label block mb-1">
                                            Requested quantity
                                        </label>
                                        <div className="text-sm text-gray-600">
                                            {currentItem.quantity} {currentItem.unit}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="ui-label block mb-1">
                                            Last year's unit rate
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={currentItemStatus.prevYearCost}
                                            onChange={(e) => updateCurrentItemStatus('prevYearCost', e.target.value)}
                                            className="ui-input"
                                        />
                                        <div className="text-xs text-gray-500 mt-1">Rs per {currentItem.unit || 'unit'}</div>
                                    </div>
                                    <div>
                                        <label className="ui-label block mb-1">
                                            Unit rate
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={currentItemStatus.currentYearCost}
                                            onChange={(e) => updateCurrentItemStatus('currentYearCost', e.target.value)}
                                            className="ui-input"
                                        />
                                        <div className="text-xs text-gray-500 mt-1">Rs per {currentItem.unit || 'unit'}</div>
                                    </div>
                                </div>

                                {/* Item Specifications */}
                                <div className="ui-callout mb-6">
                                    <label className="ui-label block mb-2">
                                        Item specifications (editable by Store)
                                    </label>
                                    <textarea
                                        value={currentItemStatus.specifications}
                                        onChange={(e) => updateCurrentItemStatus('specifications', e.target.value)}
                                        className="ui-input ui-textarea"
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
                                                <label className="ui-label block mb-1">
                                                    Stock in hand *
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={currentItemStatus.stockInHand}
                                                    onChange={(e) => updateCurrentItemStatus('stockInHand', e.target.value)}
                                                    className="ui-input"
                                                    required
                                                />
                                                <div className="text-xs text-gray-500 mt-1">{currentItem.unit}</div>
                                                {currentItemStatus.stockSource === 'hms' ? (
                                                    <div className="text-xs text-green-600 mt-1">
                                                        Auto-filled from inventory system{currentItemStatus.hmsMatchedName ? ` (matched "${currentItemStatus.hmsMatchedName}")` : ''} — still editable
                                                    </div>
                                                ) : currentItemStatus.stockSource === 'persisted' ? (
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        Previously entered value
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        Not found in inventory system — enter manually
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="ui-label block mb-1">
                                                    Consumption type *
                                                </label>
                                                <select
                                                    value={currentItemStatus.consumptionType}
                                                    onChange={(e) => updateCurrentItemStatus('consumptionType', e.target.value)}
                                                    className="ui-input"
                                                    required
                                                >
                                                    <option value="monthly">Monthly</option>
                                                    <option value="quarterly">Quarterly</option>
                                                    <option value="yearly">Yearly</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="ui-label block mb-1">
                                                    Consumption amount *
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={currentItemStatus.consumptionAmount}
                                                    onChange={(e) => updateCurrentItemStatus('consumptionAmount', e.target.value)}
                                                    className="ui-input"
                                                    required
                                                />
                                                <div className="text-xs text-gray-500 mt-1">{currentItem.unit}</div>
                                            </div>
                                        </div>

                                        {/* Calculated Requirements */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                            <div>
                                                <label className="ui-label block mb-1">To procure</label>
                                                <div className="ui-input ui-input--readonly">{currentItemStatus.calculatedRequiredQty || 0} {currentItem.unit}</div>
                                                <div className="text-xs text-gray-500 mt-1">From status, stock and consumption</div>
                                            </div>

                                            <div>
                                                <label className="ui-label block mb-1">Estimated cost</label>
                                                <div className="ui-input ui-input--readonly">Rs {((Number(currentItemStatus.calculatedRequiredQty) || 0) * (Number(currentItemStatus.currentYearCost) || 0)).toLocaleString('en-PK', { maximumFractionDigits: 2 })}</div>
                                                <div className="text-xs text-gray-500 mt-1">To procure × unit rate</div>
                                            </div>
                                        </div>

                                        {/* Status Selection */}
                                        <div className="mb-6">
                                            <label className="ui-label block mb-3">
                                                Fulfillment status
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
                                                    <span className="text-green-600">Fully available</span>
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
                                                    <span className="text-yellow-600">Partially available</span>
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
                                                    <span className="text-red-600">Not available</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Remarks */}
                                        <div className="mb-6">
                                            <label className="ui-label block mb-1">
                                                Remarks (optional)
                                            </label>
                                            <textarea
                                                value={currentItemStatus.remarks}
                                                onChange={(e) => updateCurrentItemStatus('remarks', e.target.value)}
                                                className="ui-input ui-textarea"
                                                rows="3"
                                                placeholder="Any additional comments for this item..."
                                            />
                                        </div>

                                        {/* Remove Item Option */}
                                        <div className="flex justify-end mb-6">
                                            <button
                                                type="button"
                                                onClick={openRemovalModal}
                                                className="ui-btn ui-btn--danger-solid"
                                            >
                                                Remove item from demand
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    /* Removed Item Display */
                                    <div className="ui-callout ui-callout--danger mb-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-red-800 font-medium text-lg">This item has been removed from the demand</p>
                                                <p className="text-red-600 mt-2">Reason: {currentItemStatus.removalReason}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleItemRemoval(false, '')}
                                                className="ui-btn ui-btn--primary"
                                            >
                                                Restore item
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Final Actions - Only show on last item */}
                                {currentItemIndex === filteredItems.length - 1 && (
                                    <div className="border-t pt-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Final review & submission</h3>
                                        
                                        {/* Store Response */}
                                        <div className="mb-6">
                                            <label className="ui-label block mb-2">
                                                Store response/comments *
                                            </label>
                                            <textarea
                                                value={response}
                                                onChange={(e) => setResponse(e.target.value)}
                                                className="ui-input ui-textarea"
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
                                                className="ui-btn ui-btn--secondary"
                                                disabled={submitting}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSubmit}
                                                className="ui-btn ui-btn--primary"
                                                disabled={submitting}
                                            >
                                                {submitting ? 'Submitting...' : 'Submit Fulfillment'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="ui-panel ui-panel--pad text-center">
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
