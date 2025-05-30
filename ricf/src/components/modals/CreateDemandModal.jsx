import React, { useState } from 'react';
import Modal from './Modal';

const CreateDemandModal = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    itemName: '',
    quantity: '',
    estimatedCost: '',
    description: '',
    urgency: 'normal',
    requiredBy: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.itemName.trim()) {
      newErrors.itemName = 'Item name is required';
    }
    
    if (!formData.quantity || formData.quantity <= 0) {
      newErrors.quantity = 'Valid quantity is required';
    }
    
    if (!formData.estimatedCost || formData.estimatedCost <= 0) {
      newErrors.estimatedCost = 'Valid estimated cost is required';
    }
    
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
      // Reset form on successful submission
      setFormData({
        itemName: '',
        quantity: '',
        estimatedCost: '',
        description: '',
        urgency: 'normal',
        requiredBy: ''
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
      itemName: '',
      quantity: '',
      estimatedCost: '',
      description: '',
      urgency: 'normal',
      requiredBy: ''
    });
    setErrors({});
    onClose();
  };
  return (
    <Modal show={isOpen} onClose={handleClose} title="Create New Demand">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Name */}
        <div>
          <label htmlFor="itemName" className="block text-sm font-medium text-gray-700 mb-1">
            Item Name *
          </label>
          <input
            type="text"
            id="itemName"
            name="itemName"
            value={formData.itemName}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.itemName ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter item name"
          />
          {errors.itemName && <p className="text-red-500 text-xs mt-1">{errors.itemName}</p>}
        </div>

        {/* Quantity */}
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
            Quantity *
          </label>
          <input
            type="number"
            id="quantity"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            min="1"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.quantity ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter quantity"
          />
          {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity}</p>}
        </div>

        {/* Estimated Cost */}
        <div>
          <label htmlFor="estimatedCost" className="block text-sm font-medium text-gray-700 mb-1">
            Estimated Cost (₹) *
          </label>
          <input
            type="number"
            id="estimatedCost"
            name="estimatedCost"
            value={formData.estimatedCost}
            onChange={handleChange}
            min="0"
            step="0.01"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.estimatedCost ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter estimated cost"
          />
          {errors.estimatedCost && <p className="text-red-500 text-xs mt-1">{errors.estimatedCost}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description *
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="3"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Describe the item and purpose"
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
        </div>

        {/* Urgency */}
        <div>
          <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 mb-1">
            Urgency Level
          </label>
          <select
            id="urgency"
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
          <label htmlFor="requiredBy" className="block text-sm font-medium text-gray-700 mb-1">
            Required By Date *
          </label>
          <input
            type="date"
            id="requiredBy"
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

        {/* Submit Error */}
        {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
