import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, Save, Trash2, Plus, Edit3, Check, X } from 'lucide-react';
import api from '../../config/api';

const TenderReviewPage = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tenderData, setTenderData] = useState(null);
    const [editedItems, setEditedItems] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [newItem, setNewItem] = useState({
        item_name: '',
        quantity: '',
        unit: '',
        estimated_cost: '',
        custom_item_name: ''
    });
    
    const [evaluationForm, setEvaluationForm] = useState({
        decision: '',
        comments: ''
    });

    useEffect(() => {
        fetchTenderDetails();
    }, [tenderId]);

    const fetchTenderDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/vetting/tenders/${tenderId}`);
            setTenderData(response.data);
            setEditedItems(response.data.items.map(item => ({ ...item })));
        } catch (error) {
            console.error('Error fetching tender details:', error);
            toast.error('Failed to fetch tender details');
            navigate(-1);
        } finally {
            setLoading(false);
        }
    };

    const handleItemEdit = (index, field, value) => {
        const updatedItems = [...editedItems];
        updatedItems[index] = {
            ...updatedItems[index],
            [field]: value
        };
        setEditedItems(updatedItems);
    };

    const handleDeleteItem = (index) => {
        if (editedItems.length <= 1) {
            toast.error('Cannot delete the last item. A tender must have at least one item.');
            return;
        }
        
        if (window.confirm('Are you sure you want to delete this item?')) {
            const updatedItems = editedItems.filter((_, i) => i !== index);
            setEditedItems(updatedItems);
            toast.success('Item deleted successfully');
        }
    };

    const handleAddItem = () => {
        if (!newItem.item_name && !newItem.custom_item_name) {
            toast.error('Please provide an item name');
            return;
        }
        if (!newItem.quantity || !newItem.unit || !newItem.estimated_cost) {
            toast.error('Please fill all required fields');
            return;
        }

        const itemToAdd = {
            id: `new_${Date.now()}`, // Temporary ID for new items
            item_name: newItem.custom_item_name || newItem.item_name,
            quantity: parseInt(newItem.quantity),
            unit: newItem.unit,
            estimated_cost: parseFloat(newItem.estimated_cost),
            store_estimated_cost: parseFloat(newItem.estimated_cost) * parseInt(newItem.quantity),
            custom_item_name: newItem.custom_item_name,
            isNew: true
        };

        setEditedItems([...editedItems, itemToAdd]);
        setNewItem({
            item_name: '',
            quantity: '',
            unit: '',
            estimated_cost: '',
            custom_item_name: ''
        });
        setShowAddItemModal(false);
        toast.success('Item added successfully');
    };

    const saveChanges = async () => {
        try {
            setSaving(true);
            
            // Prepare the data to send to backend
            const updatedTenderData = {
                tenderId: tenderId,
                items: editedItems.map(item => ({
                    id: item.isNew ? null : item.id,
                    item_name: item.item_name,
                    custom_item_name: item.custom_item_name,
                    quantity: parseInt(item.quantity),
                    unit: item.unit,
                    estimated_cost: parseFloat(item.estimated_cost),
                    store_estimated_cost: parseFloat(item.estimated_cost) * parseInt(item.quantity),
                    isNew: item.isNew || false,
                    isDeleted: false
                }))
            };

            await api.put(`/vetting/tenders/${tenderId}/update-items`, updatedTenderData);
            toast.success('Changes saved successfully');
            
            // Refresh the data
            await fetchTenderDetails();
        } catch (error) {
            console.error('Error saving changes:', error);
            toast.error('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const submitEvaluation = async () => {
        if (!evaluationForm.decision) {
            toast.error('Please select a decision');
            return;
        }

        try {
            setSaving(true);
            await api.post(`/vetting/tenders/${tenderId}/evaluate`, evaluationForm);
            toast.success('Evaluation submitted successfully');
            navigate(-1);
        } catch (error) {
            console.error('Error submitting evaluation:', error);
            const errorMessage = error.response?.data?.message || 'Failed to submit evaluation';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    const calculateTotalCost = () => {
        return editedItems.reduce((total, item) => {
            return total + (parseFloat(item.estimated_cost || 0) * parseInt(item.quantity || 0));
        }, 0);
    };

    const getItemDisplayName = (item) => {
        return item.custom_item_name ||
               item.item_name_full ||
               item.item_name ||
               item.custom_field_description ||
               'Unnamed Item';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading tender details...</p>
                </div>
            </div>
        );
    }

    if (!tenderData) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-600">Tender not found</p>
                    <button 
                        onClick={() => navigate(-1)}
                        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const { tender, evaluationCriteria, existingEvaluations } = tenderData;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => navigate(-1)}
                                className="flex items-center text-gray-600 hover:text-gray-900"
                            >
                                <ArrowLeft className="w-5 h-5 mr-1" />
                                Back
                            </button>
                            <div>
                                <h1 className="text-xl font-semibold text-gray-900">
                                    Tender Review - {tender.tender_number}
                                </h1>
                                <p className="text-sm text-gray-500">
                                    Vetting Committee Evaluation
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={saveChanges}
                                disabled={saving}
                                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4 mr-1" />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2">
                        {/* Tender Information */}
                        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Tender Information</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Tender Number</label>
                                    <p className="mt-1 text-sm text-gray-900">{tender.tender_number}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <p className="mt-1 text-sm text-gray-900">{tender.demand_description}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Created By</label>
                                    <p className="mt-1 text-sm text-gray-900">{tender.created_by_name}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Department</label>
                                    <p className="mt-1 text-sm text-gray-900">{tender.created_by_department}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Required By</label>
                                    <p className="mt-1 text-sm text-gray-900">
                                        {new Date(tender.required_by).toLocaleDateString()}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Urgency</label>
                                    <p className="mt-1 text-sm text-gray-900 capitalize">{tender.urgency}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tender Items */}
                        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">Tender Items</h2>
                                <div className="flex items-center space-x-3">
                                    <span className="text-sm text-gray-600">
                                        Total: PKR {calculateTotalCost().toLocaleString()}
                                    </span>
                                    <button
                                        onClick={() => setShowAddItemModal(true)}
                                        className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                                    >
                                        <Plus className="w-4 h-4 mr-1" />
                                        Add Item
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Item Name
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Quantity
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Unit
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Unit Cost
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Total Cost
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {editedItems.map((item, index) => (
                                            <ItemRow
                                                key={item.id || index}
                                                item={item}
                                                index={index}
                                                editingItem={editingItem}
                                                setEditingItem={setEditingItem}
                                                onEdit={handleItemEdit}
                                                onDelete={handleDeleteItem}
                                                getItemDisplayName={getItemDisplayName}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Evaluation Criteria */}
                        {evaluationCriteria && evaluationCriteria.length > 0 && (
                            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Evaluation Criteria</h2>
                                <div className="space-y-3">
                                    {evaluationCriteria.map((criteria, index) => (
                                        <div key={index} className="border rounded-lg p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <h3 className="font-medium text-gray-900">{criteria.criteria_title}</h3>
                                                    <p className="text-sm text-gray-600 mt-1">{criteria.criteria_description}</p>
                                                </div>
                                                <div className="ml-4">
                                                    {criteria.is_knockout ? (
                                                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                                                            Knockout
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                                            {criteria.weightage}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        {/* Existing Evaluations */}
                        {existingEvaluations && existingEvaluations.length > 0 && (
                            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Committee Evaluations</h3>
                                <div className="space-y-3">
                                    {existingEvaluations.map((evaluation, index) => (
                                        <div key={index} className="border rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-gray-900">{evaluation.member_name}</span>
                                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                                    evaluation.decision === 'approve' 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {evaluation.decision === 'approve' ? 'Approved' : 'Rejected'}
                                                </span>
                                            </div>
                                            {evaluation.comments && (
                                                <p className="text-sm text-gray-600">{evaluation.comments}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Evaluation Form */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Evaluation</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                                    <div className="space-y-2">
                                        <label className="flex items-center">
                                            <input
                                                type="radio"
                                                name="decision"
                                                value="approve"
                                                checked={evaluationForm.decision === 'approve'}
                                                onChange={(e) => setEvaluationForm(prev => ({ ...prev, decision: e.target.value }))}
                                                className="mr-2"
                                            />
                                            <span className="text-green-700 font-medium">Approve</span>
                                        </label>
                                        <label className="flex items-center">
                                            <input
                                                type="radio"
                                                name="decision"
                                                value="reject"
                                                checked={evaluationForm.decision === 'reject'}
                                                onChange={(e) => setEvaluationForm(prev => ({ ...prev, decision: e.target.value }))}
                                                className="mr-2"
                                            />
                                            <span className="text-red-700 font-medium">Reject</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                                    <textarea
                                        value={evaluationForm.comments}
                                        onChange={(e) => setEvaluationForm(prev => ({ ...prev, comments: e.target.value }))}
                                        rows={4}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your comments (optional)"
                                    />
                                </div>

                                <button
                                    onClick={submitEvaluation}
                                    disabled={saving || !evaluationForm.decision}
                                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {saving ? 'Submitting...' : 'Submit Evaluation'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Item Modal */}
            {showAddItemModal && (
                <AddItemModal
                    newItem={newItem}
                    setNewItem={setNewItem}
                    onAdd={handleAddItem}
                    onClose={() => setShowAddItemModal(false)}
                />
            )}
        </div>
    );
};

// Individual Item Row Component
const ItemRow = ({ item, index, editingItem, setEditingItem, onEdit, onDelete, getItemDisplayName }) => {
    const isEditing = editingItem === index;

    const handleSave = () => {
        setEditingItem(null);
    };

    const handleCancel = () => {
        setEditingItem(null);
    };

    return (
        <tr>
            <td className="px-6 py-4 whitespace-nowrap">
                {isEditing ? (
                    <input
                        type="text"
                        value={item.item_name || ''}
                        onChange={(e) => onEdit(index, 'item_name', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                        placeholder="Item name"
                    />
                ) : (
                    <div className="text-sm text-gray-900">{getItemDisplayName(item)}</div>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                {isEditing ? (
                    <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => onEdit(index, 'quantity', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                        min="1"
                    />
                ) : (
                    <div className="text-sm text-gray-900">{item.quantity}</div>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                {isEditing ? (
                    <input
                        type="text"
                        value={item.unit || ''}
                        onChange={(e) => onEdit(index, 'unit', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                        placeholder="Unit"
                    />
                ) : (
                    <div className="text-sm text-gray-900">{item.unit}</div>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                {isEditing ? (
                    <input
                        type="number"
                        value={item.estimated_cost || ''}
                        onChange={(e) => onEdit(index, 'estimated_cost', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                        min="0"
                        step="0.01"
                    />
                ) : (
                    <div className="text-sm text-gray-900">PKR {parseFloat(item.estimated_cost || 0).toLocaleString()}</div>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                    PKR {((parseFloat(item.estimated_cost || 0)) * (parseInt(item.quantity || 0))).toLocaleString()}
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                {isEditing ? (
                    <div className="flex space-x-2">
                        <button
                            onClick={handleSave}
                            className="text-green-600 hover:text-green-900"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleCancel}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setEditingItem(index)}
                            className="text-blue-600 hover:text-blue-900"
                        >
                            <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onDelete(index)}
                            className="text-red-600 hover:text-red-900"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
};

// Add Item Modal Component
const AddItemModal = ({ newItem, setNewItem, onAdd, onClose }) => {
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Item</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                        <input
                            type="text"
                            value={newItem.custom_item_name}
                            onChange={(e) => setNewItem(prev => ({ ...prev, custom_item_name: e.target.value }))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter item name"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                            <input
                                type="number"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem(prev => ({ ...prev, quantity: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                min="1"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                            <input
                                type="text"
                                value={newItem.unit}
                                onChange={(e) => setNewItem(prev => ({ ...prev, unit: e.target.value }))}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., pcs, kg, box"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (PKR) *</label>
                        <input
                            type="number"
                            value={newItem.estimated_cost}
                            onChange={(e) => setNewItem(prev => ({ ...prev, estimated_cost: e.target.value }))}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="0"
                            step="0.01"
                        />
                    </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onAdd}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Add Item
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TenderReviewPage;
