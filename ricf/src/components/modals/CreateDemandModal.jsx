import React, { useState } from 'react';
import Modal from './Modal';

const CreateDemandModal = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    description: '',
    urgency: 'normal',
    requiredBy: '',
    items: [
      { itemName: '', quantity: '', estimatedCost: '', remarks: '' }
    ]
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData(prev => ({
      ...prev,
      items: newItems
    }));
    
    // Clear item error
    if (errors[`item_${index}_${field}`]) {
      setErrors(prev => ({
        ...prev,
        [`item_${index}_${field}`]: ''
      }));
    }
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { itemName: '', quantity: '', estimatedCost: '', remarks: '' }]
    }));
  };

  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        items: newItems
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!formData.requiredBy) {
      newErrors.requiredBy = 'Required by date is required';
    } else {
      const selectedDate = new Date(formData.requiredBy);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        newErrors.requiredBy = 'Required by date cannot be in the past';
      }
    }

    // Validate each item
    formData.items.forEach((item, index) => {
      if (!item.itemName.trim()) {
        newErrors[`item_${index}_itemName`] = 'Item name is required';
      }
      if (!item.quantity || item.quantity <= 0) {
        newErrors[`item_${index}_quantity`] = 'Valid quantity is required';
      }
      if (!item.estimatedCost || item.estimatedCost <= 0) {
        newErrors[`item_${index}_estimatedCost`] = 'Valid estimated cost is required';
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
      // Reset form
      setFormData({
        description: '',
        urgency: 'normal',
        requiredBy: '',
        items: [{ itemName: '', quantity: '', estimatedCost: '', remarks: '' }]
      });
      setErrors({});
      onClose();
    } catch (error) {
      console.error('Error submitting demand:', error);
      setErrors({ submit: 'Failed to create demand. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      description: '',
      urgency: 'normal',
      requiredBy: '',
      items: [{ itemName: '', quantity: '', estimatedCost: '', remarks: '' }]
    });
    setErrors({});
    onClose();
  };

  return (
    <Modal show={isOpen} onClose={handleClose} title="Create New Demand">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Demand Description *
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="2"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Describe the purpose of this demand"
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
        </div>

        {/* Items Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Items Required *
            </label>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              + Add Item
            </button>
          </div>

          {formData.items.map((item, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-gray-800">Item {index + 1}</h4>
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    value={item.itemName}
                    onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${
                      errors[`item_${index}_itemName`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter item name"
                  />
                  {errors[`item_${index}_itemName`] && (
                    <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_itemName`]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    min="1"
                    className={`w-full px-3 py-2 border rounded-md text-sm ${
                      errors[`item_${index}_quantity`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Qty"
                  />
                  {errors[`item_${index}_quantity`] && (
                    <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_quantity`]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Estimated Cost (Rs) *
                  </label>
                  <input
                    type="number"
                    value={item.estimatedCost}
                    onChange={(e) => handleItemChange(index, 'estimatedCost', e.target.value)}
                    min="0"
                    step="0.01"
                    className={`w-full px-3 py-2 border rounded-md text-sm ${
                      errors[`item_${index}_estimatedCost`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Cost"
                  />
                  {errors[`item_${index}_estimatedCost`] && (
                    <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_estimatedCost`]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={item.remarks}
                    onChange={(e) => handleItemChange(index, 'remarks', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="Any remarks"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Urgency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Urgency Level
          </label>
          <select
            name="urgency"
            value={formData.urgency}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Required By Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Required By Date *
          </label>
          <input
            type="date"
            name="requiredBy"
            value={formData.requiredBy}
            onChange={handleChange}
            min={new Date().toISOString().split('T')[0]}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.requiredBy ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.requiredBy && <p className="text-red-500 text-xs mt-1">{errors.requiredBy}</p>}
        </div>

        {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Demand'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateDemandModal;
