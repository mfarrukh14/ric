import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiUrl } from '../../config/api';
import { PageHeader } from '../../ui';

import { formatDate, formatDateTime } from '../../lib/time';
import { StatusBadge } from '../../ui/status';
const DemandManagement = ({ embedded = false }) => {
    const navigate = useNavigate();
    const [demands, setDemands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [selectedDemands, setSelectedDemands] = useState([]);
    const [mergeMode, setMergeMode] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [user, setUser] = useState(null);
    const [mergeForm, setMergeForm] = useState({
        description: '',
        urgency: 'normal',
        requiredBy: ''
    });

    // Get current user information
    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (stored) {
            setUser(JSON.parse(stored));
        }
    }, []);

    const isHod = user?.is_hod === 1 || user?.is_hod === true;

    useEffect(() => {
        fetchDemands();
    }, []);

    const fetchDemands = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demands/with-items`, {
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

    const handleManageFulfillment = (demand) => {
        // Navigate to the dedicated fulfillment page
        navigate(`/store/fulfillment/${demand.id}`);
    };

    const getStatusBadge = (status) => <StatusBadge status={status} />;

    const getUrgencyBadge = (urgency) => {
        const urgencyColors = {
            'high': 'bg-red-100 text-red-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-yellow-100 text-yellow-800',
            'low': 'bg-green-100 text-green-800'
        };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyColors[urgency] || 'bg-gray-100 text-gray-800'}`}>
                {urgency?.charAt(0).toUpperCase() + urgency?.slice(1) || 'Normal'}
            </span>
        );
    };

    const getTotalEstimatedCost = (items) => {
        if (!items || items.length === 0) return 0;
        return items.reduce((total, item) => total + parseFloat(item.estimated_cost || 0), 0);
    };

    const canManageFulfillment = (demand) => {
        // HODs approve or reject; they do not fulfil.
        if (isHod) return false;
        // The API only accepts a store response while the demand is waiting for store.
        return demand.status === 'pending';
    };

    const getActionButtonMessage = (demand) => {
        if (demand.status === 'pending_hod_approval') return 'Waiting for the department HOD';
        if (demand.status === 'pending_store_hod_approval') return 'Waiting for the store HOD';
        return 'Store has responded';
    };

    const handleMergeDemandsClick = () => {
        setMergeMode(true);
        setSelectedDemands([]);
        toast.info('Select multiple demands with the same item category to merge them together');
    };

    const handleDemandSelection = (demandId, checked) => {
        if (checked) {
            setSelectedDemands(prev => [...prev, demandId]);
        } else {
            setSelectedDemands(prev => prev.filter(id => id !== demandId));
        }
    };

    const handleCancelMerge = () => {
        setMergeMode(false);
        setSelectedDemands([]);
        setValidationResult(null);
    };

    const handleProceedToMerge = async () => {
        if (selectedDemands.length < 2) {
            toast.error('Please select at least 2 demands to merge');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demand-merge/validate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ demandIds: selectedDemands })
            });

            const result = await response.json();

            if (!response.ok) {
                toast.error(result.message);
                return;
            }

            if (result.valid) {
                setValidationResult(result);
                setShowMergeModal(true);
                setMergeMode(false);
                
                // Set default required date to latest of selected demands
                const selectedDemandsData = demands.filter(d => selectedDemands.includes(d.id));
                const latestRequiredDate = selectedDemandsData.reduce((latest, demand) => {
                    const demandDate = new Date(demand.required_by);
                    return demandDate > latest ? demandDate : latest;
                }, new Date(selectedDemandsData[0]?.required_by || new Date()));
                
                setMergeForm(prev => ({
                    ...prev,
                    requiredBy: latestRequiredDate.toISOString().split('T')[0]
                }));
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            console.error('Error validating merge:', error);
            toast.error('Failed to validate demand merging');
        }
    };

    const handleMergeSubmit = async (e) => {
        e.preventDefault();
        
        if (!mergeForm.description || !mergeForm.requiredBy) {
            toast.error('Please fill in all required fields');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/demand-merge/merge`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    demandIds: selectedDemands,
                    mergedDescription: mergeForm.description,
                    urgency: mergeForm.urgency,
                    requiredBy: mergeForm.requiredBy
                })
            });

            const result = await response.json();

            if (!response.ok) {
                toast.error(result.message);
                return;
            }

            toast.success(`Merged ${selectedDemands.length} demands into a new demand (ID: ${result.newDemandId})`);
            setShowMergeModal(false);
            setSelectedDemands([]);
            setValidationResult(null);
            setMergeForm({ description: '', urgency: 'normal', requiredBy: '' });
            fetchDemands(); // Refresh the list
        } catch (error) {
            console.error('Error merging demands:', error);
            toast.error('Failed to merge demands');
        }
    };


    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="ui-spin"></div>
            </div>
        );
    }

    return (
        <div>
            <div>
                <div>
                    {!embedded && (
                        <PageHeader
                            title={isHod ? 'Fulfilment review' : 'All demands'}
                        />
                    )}

                    {error && (
                        <div className="ui-callout ui-callout--danger mb-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    <div className="ui-panel">
                        <div className="px-4 py-5 sm:p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-medium text-gray-900">Pending demands</h2>
                                
                                {/* Merge Controls */}
                                <div className="flex space-x-2">
                                    {!mergeMode ? (
                                        <button
                                            onClick={handleMergeDemandsClick}
                                            className="ui-btn ui-btn--primary"
                                        >
                                            <i className="fas fa-code-merge mr-2"></i>
                                            Merge demands
                                        </button>
                                    ) : (
                                        <>
                                            <span className="text-sm text-gray-600 flex items-center">
                                                <i className="fas fa-info-circle mr-1"></i>
                                                Select demands with same category ({selectedDemands.length} selected)
                                            </span>
                                            <button
                                                onClick={handleProceedToMerge}
                                                disabled={selectedDemands.length < 2}
                                                className="ui-btn ui-btn--primary"
                                            >
                                                Proceed to merge
                                            </button>
                                            <button
                                                onClick={handleCancelMerge}
                                                className="ui-btn ui-btn--secondary"
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            {demands.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-gray-500">No pending demands at this time.</div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {demands.map((demand) => (
                                        <div key={demand.id} className={`border rounded-lg p-6 transition-shadow ${
                                            mergeMode 
                                                ? selectedDemands.includes(demand.id) 
                                                    ? 'border-indigo-300 bg-indigo-50 shadow-md' 
                                                    : 'border-gray-200 hover:border-indigo-200' 
                                                : 'border-gray-200 hover:shadow-md'
                                        }`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-start space-x-3">
                                                    {/* Merge Mode Checkbox */}
                                                    {mergeMode && (
                                                        <div className="flex items-center mt-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedDemands.includes(demand.id)}
                                                                onChange={(e) => handleDemandSelection(demand.id, e.target.checked)}
                                                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                            />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h3 className="text-xl font-semibold text-gray-900">
                                                            Demand #{demand.id}
                                                        </h3>
                                                        <p className="text-sm text-gray-600">
                                                            Created by: {demand.created_by_name}
                                                            {demand.creator_department && ` (${demand.creator_department})`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex space-x-2">
                                                    {getStatusBadge(demand.status)}
                                                    {getUrgencyBadge(demand.urgency)}
                                                </div>
                                            </div>

                                            {/* Demand Summary */}
                                            <div className="ui-callout mb-4">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <span className="font-medium text-gray-700">Total Items:</span>
                                                        <span className="ml-2">{demand.items?.length || 1}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-gray-700">Total Est. Cost:</span>
                                                        <span className="ml-2">Rs {demand.items ? getTotalEstimatedCost(demand.items) : demand.estimated_cost}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-gray-700">Required By:</span>
                                                        <span className="ml-2">{formatDate(demand.required_by)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-gray-700">Created:</span>
                                                        <span className="ml-2">{formatDate(demand.created_at)}</span>
                                                    </div>
                                                </div>
                                                {demand.description && (
                                                    <div className="mt-3">
                                                        <span className="font-medium text-gray-700">Description:</span>
                                                        <p className="text-gray-600 mt-1">{demand.description}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Items Display */}
                                            {demand.items && demand.items.length > 0 ? (
                                                <div className="mb-4">
                                                    <h4 className="font-medium text-gray-900 mb-3">Items requested:</h4>
                                                    <div className="space-y-3">
                                                        {demand.items.map((item, index) => (
                                                            <div key={item.id} className="ui-panel ui-panel--pad">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                                                    {item.store_status && <StatusBadge status={item.store_status} />}
                                                                </div>
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                                                                    <div>
                                                                        <span className="font-medium">Quantity:</span> {item.quantity} {item.unit}
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-medium">Est. Cost:</span> Rs {item.estimated_cost}
                                                                    </div>
                                                                    {item.store_available_quantity !== undefined && (
                                                                        <div>
                                                                            <span className="font-medium">Available:</span> {item.store_available_quantity} {item.unit}
                                                                        </div>
                                                                    )}
                                                                    {item.unit && (
                                                                        <div>
                                                                            <span className="font-medium">Unit:</span> {item.unit}
                                                                        </div>
                                                                    )}
                                                                    {item.stock_in_hand !== undefined && (
                                                                        <div>
                                                                            <span className="font-medium">Stock in Hand:</span> {item.stock_in_hand} {item.unit}
                                                                        </div>
                                                                    )}
                                                                    {item.consumption_type && (
                                                                        <div>
                                                                            <span className="font-medium">Consumption:</span> {item.consumption_amount} {item.unit} ({item.consumption_type})
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {item.remarks && (
                                                                    <div className="mt-2 text-sm text-gray-600">
                                                                        <span className="font-medium">Remarks:</span> {item.remarks}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                // Fallback for old single-item demands
                                                <div className="mb-4">
                                                    <h4 className="font-medium text-gray-900 mb-3">Item details:</h4>
                                                    <div className="ui-panel ui-panel--pad">
                                                        <h5 className="font-medium text-gray-900 mb-2">{demand.item_name}</h5>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-600">
                                                            <div>
                                                                <span className="font-medium">Quantity:</span> {demand.quantity} {demand.unit || 'pcs'}
                                                            </div>
                                                            <div>
                                                                <span className="font-medium">Est. Cost:</span> Rs {demand.estimated_cost}
                                                            </div>
                                                            <div>
                                                                <span className="font-medium">Unit:</span> {demand.unit || 'pcs'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Store Response Display */}
                                            {demand.store_response && (
                                                <div className="ui-callout mb-4">
                                                    <p className="text-sm font-medium text-gray-900">Store Response:</p>
                                                    <p className="text-sm text-gray-700 mt-1">{demand.store_response}</p>
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Responded by {demand.store_response_by_name} on {formatDateTime(demand.store_response_at)}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className="flex justify-end">
                                                {canManageFulfillment(demand) ? (
                                                    <button
                                                        onClick={() => handleManageFulfillment(demand)}
                                                        className="ui-btn ui-btn--primary"
                                                    >
                                                        Manage fulfillment
                                                    </button>
                                                ) : (
                                                    <div className="text-sm text-gray-500">
                                                        {getActionButtonMessage(demand)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Merge Demands Modal */}
            {showMergeModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-900">Merge demands</h2>
                                <button
                                    onClick={() => setShowMergeModal(false)}
                                    className="ui-btn ui-btn--ghost ui-btn--sm"
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            {/* Validation Results */}
                            {validationResult && (
                                <div className="ui-callout mb-6">
                                    <div className="flex items-center">
                                        <i className="fas fa-check-circle text-green-500 mr-2"></i>
                                        <div>
                                            <h3 className="text-sm font-medium">Validation successful</h3>
                                            <p className="text-sm mt-1">{validationResult.message}</p>
                                            <div className="text-xs text-green-600 mt-2">
                                                <span className="font-medium">Category:</span> {validationResult.category} | 
                                                <span className="font-medium ml-2">Total Items:</span> {validationResult.itemCount} | 
                                                <span className="font-medium ml-2">Demands:</span> {validationResult.demandCount}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Merge Form */}
                            <form onSubmit={handleMergeSubmit}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="ui-label block mb-2">
                                            Merged demand description *
                                        </label>
                                        <textarea
                                            value={mergeForm.description}
                                            onChange={(e) => setMergeForm(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder={`Enter description for merged ${validationResult?.category || 'demand'} items`}
                                            className="ui-input ui-textarea"
                                            rows="3"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="ui-label block mb-2">
                                                Urgency *
                                            </label>
                                            <select
                                                value={mergeForm.urgency}
                                                onChange={(e) => setMergeForm(prev => ({ ...prev, urgency: e.target.value }))}
                                                className="ui-input"
                                                required
                                            >
                                                <option value="normal">Normal</option>
                                                <option value="urgent">Urgent</option>
                                                <option value="emergency">Emergency</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="ui-label block mb-2">
                                                Required by *
                                            </label>
                                            <input
                                                type="date"
                                                value={mergeForm.requiredBy}
                                                onChange={(e) => setMergeForm(prev => ({ ...prev, requiredBy: e.target.value }))}
                                                className="ui-input"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setShowMergeModal(false)}
                                        className="ui-btn ui-btn--secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="ui-btn ui-btn--primary"
                                    >
                                        <i className="fas fa-code-merge mr-2"></i>
                                        Merge demands
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DemandManagement;
