import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl, getItemCategories, getItemNamesByCategory, getCategoryFields } from '../../config/api';

const CreateDemandForm = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Dropdown data
  const [categories, setCategories] = useState([]);
  const [itemNamesByCategory, setItemNamesByCategory] = useState({});
  // Custom fields (text/number/dropdown) configured per category, fetched lazily.
  const [fieldsByCategory, setFieldsByCategory] = useState({});

  // Unit options
  const unitOptions = ['packet', 'box', 'kg', 'roll', 'ltr', 'numbers', 'tests', 'kit'];

  // Previous/current year cost are intentionally not collected here - store
  // fills those in during fulfillment, once real stock/pricing is known.
  const emptyItem = () => ({
    categoryId: '',
    itemNameId: '',
    quantity: '',
    unit: 'numbers',
    specifications: '',
    remarks: '',
    fieldValues: {}
  });

  // Form data state
  const [formData, setFormData] = useState({
    description: '',
    urgency: 'normal',
    requiredBy: '',
    items: [emptyItem()]
  });

  // Validation state
  const [errors, setErrors] = useState({});

  // Load categories on component mount
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const categoriesData = await getItemCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading categories:', error);
      setError('Failed to load item categories');
    }
  };

  const loadItemNames = async (categoryId) => {
    try {
      const itemNames = await getItemNamesByCategory(categoryId);
      setItemNamesByCategory(prev => ({
        ...prev,
        [categoryId]: itemNames
      }));
    } catch (error) {
      console.error('Error loading item names:', error);
      setError('Failed to load item names');
    }
  };

  const loadCategoryFields = async (categoryId) => {
    if (fieldsByCategory[categoryId]) return;
    try {
      const fields = await getCategoryFields(categoryId);
      setFieldsByCategory(prev => ({ ...prev, [categoryId]: fields }));
    } catch (error) {
      console.error('Error loading category fields:', error);
      setError('Failed to load fields for the selected category');
    }
  };

  // Handle form field changes
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

  // Handle item field changes
  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;

    // If category is changed, load its item names + custom fields and reset item-specific state
    if (field === 'categoryId') {
      newItems[index]['itemNameId'] = '';
      newItems[index]['fieldValues'] = {};
      if (value) {
        loadItemNames(value);
        loadCategoryFields(value);
      }
    }

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

  // Handle a custom field's value changing. Resets any field that depends on it
  // (a cascading dropdown, e.g. Drug Name depends on Drug Category).
  const handleFieldValueChange = (index, categoryId, fieldId, value) => {
    const fields = fieldsByCategory[categoryId] || [];
    const newItems = [...formData.items];
    const fieldValues = { ...(newItems[index].fieldValues || {}) };

    fieldValues[fieldId] = value;

    // Reset any fields that depend (directly or transitively) on this one
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of fields) {
        if (f.dependsOnFieldId && String(f.dependsOnFieldId) === String(fieldId) && fieldValues[f.id] !== undefined) {
          delete fieldValues[f.id];
          fieldId = f.id;
          changed = true;
        }
      }
    }

    newItems[index] = { ...newItems[index], fieldValues };
    setFormData(prev => ({ ...prev, items: newItems }));

    const errorKey = `item_${index}_field_${fieldId}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  // Add a new item
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, emptyItem()]
    }));
  };

  // Remove an item
  const removeItem = (index) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        items: newItems
      }));
    }
  };

  // Validate form data
  const validateForm = () => {
    const newErrors = {};

    // Step 1: Description validation
    if (currentStep === 1) {
      if (!formData.description.trim()) {
        newErrors.description = 'Description is required';
      }
    }

    // Step 2: Items validation
    else if (currentStep === 2) {
      // Validate each item
      formData.items.forEach((item, index) => {
        if (!item.categoryId) {
          newErrors[`item_${index}_categoryId`] = 'Item category is required';
        }

        const fields = fieldsByCategory[item.categoryId] || [];
        if (fields.length > 0) {
          fields.forEach(field => {
            const raw = (item.fieldValues || {})[field.id];
            if (field.isRequired && (raw === undefined || raw === null || raw === '')) {
              newErrors[`item_${index}_field_${field.id}`] = `${field.label} is required`;
            }
          });
        } else if (item.categoryId && !item.itemNameId) {
          newErrors[`item_${index}_itemNameId`] = 'Item name is required';
        }

        if (!item.quantity || item.quantity <= 0) {
          newErrors[`item_${index}_quantity`] = 'Valid quantity is required';
        }
        if (!item.unit) {
          newErrors[`item_${index}_unit`] = 'Unit is required';
        }
        if (!item.specifications || item.specifications.trim() === '') {
          newErrors[`item_${index}_specifications`] = 'Item specifications are required';
        }
      });
    }

    // Step 3: Urgency and required date validation
    else if (currentStep === 3) {
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
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle next step
  const handleNextStep = () => {
    if (validateForm()) {
      setCurrentStep(prevStep => prevStep + 1);
    }
  };

  // Handle previous step
  const handlePreviousStep = () => {
    setCurrentStep(prevStep => prevStep - 1);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/demands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create demand');
      }

      // Redirect to dashboard on success
      navigate('/dashboard');
    } catch (error) {
      console.error('Error submitting demand:', error);
      setError(error.message || 'Failed to create demand. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Render one custom field's input (text/number/dropdown), handling cascading
  // dropdowns whose options are filtered by the currently selected parent option.
  const renderCustomField = (item, index, field) => {
    const fieldValues = item.fieldValues || {};
    const value = fieldValues[field.id] ?? '';
    const errorKey = `item_${index}_field_${field.id}`;
    const inputClass = `w-full px-3 py-2 border rounded-md text-sm ${
      errors[errorKey] ? 'border-red-500' : 'border-gray-300'
    }`;

    if (field.fieldType === 'text') {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleFieldValueChange(index, item.categoryId, field.id, e.target.value)}
          className={inputClass}
          placeholder={field.label}
        />
      );
    }

    if (field.fieldType === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => handleFieldValueChange(index, item.categoryId, field.id, e.target.value)}
          className={inputClass}
          placeholder={field.label}
        />
      );
    }

    // Dropdown
    const parentValue = field.dependsOnFieldId ? fieldValues[field.dependsOnFieldId] : null;
    const isBlockedByParent = field.dependsOnFieldId && !parentValue;
    const options = field.dependsOnFieldId
      ? field.options.filter(o => String(o.parentOptionId) === String(parentValue))
      : field.options;

    return (
      <select
        value={value}
        onChange={(e) => handleFieldValueChange(index, item.categoryId, field.id, e.target.value)}
        disabled={isBlockedByParent}
        className={`${inputClass} ${isBlockedByParent ? 'bg-gray-100 cursor-not-allowed' : ''}`}
      >
        <option value="">
          {isBlockedByParent ? `Select ${field.label} after choosing its parent field` : `Select ${field.label}`}
        </option>
        {options.map(option => (
          <option key={option.id} value={option.id}>{option.value}</option>
        ))}
      </select>
    );
  };

  // Only offer categories an admin has actually finished configuring (i.e. has
  // at least one field defined) - a category with nothing to select isn't usable yet.
  const selectableCategories = categories.filter((category) => (category.field_count || 0) > 0);

  return (
    <div className="container mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Demand</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className={`flex-1 text-center ${currentStep >= 1 ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            Description
          </div>
          <div className={`flex-1 text-center ${currentStep >= 2 ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            Items
          </div>
          <div className={`flex-1 text-center ${currentStep >= 3 ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            Details
          </div>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden">
          <div className="bg-blue-600 flex-1"></div>
          <div className={`${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'} flex-1`}></div>
          <div className={`${currentStep >= 3 ? 'bg-blue-600' : 'bg-gray-200'} flex-1`}></div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={currentStep === 3 ? handleSubmit : e => e.preventDefault()}>
          {/* Step 1: Description */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Step 1: Demand Description</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe your demand *
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.description ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Provide a detailed description of what you are requesting"
                ></textarea>
                {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
                <p className="text-gray-500 text-sm mt-1">
                  Please be clear and specific about the purpose of this demand.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Items */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Step 2: Add Demand Items</h2>

              <div className="mb-4 flex justify-between items-center">
                <p className="text-gray-600 text-sm">Add all items that you need for this demand.</p>
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  + Add Item
                </button>
              </div>

              <div className="space-y-4">
                {formData.items.map((item, index) => {
                  const fields = fieldsByCategory[item.categoryId] || [];

                  return (
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
                        {/* Item Category Dropdown */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Item Category *
                          </label>
                          <select
                            value={item.categoryId}
                            onChange={(e) => handleItemChange(index, 'categoryId', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-sm ${
                              errors[`item_${index}_categoryId`] ? 'border-red-500' : 'border-gray-300'
                            }`}
                          >
                            <option value="">Select Category</option>
                            {selectableCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                          {errors[`item_${index}_categoryId`] && (
                            <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_categoryId`]}</p>
                          )}
                          {selectableCategories.length === 0 && (
                            <p className="text-gray-500 text-xs mt-1">
                              No categories are available yet. Ask an admin to configure fields for a category in Unified Item Management.
                            </p>
                          )}
                        </div>

                        {/* Item Name Dropdown - only for categories with no custom fields configured */}
                        {item.categoryId && fields.length === 0 && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Item Name *
                            </label>
                            <select
                              value={item.itemNameId}
                              onChange={(e) => handleItemChange(index, 'itemNameId', e.target.value)}
                              disabled={!item.categoryId}
                              className={`w-full px-3 py-2 border rounded-md text-sm ${
                                errors[`item_${index}_itemNameId`] ? 'border-red-500' : 'border-gray-300'
                              } ${!item.categoryId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            >
                              <option value="">Select Item</option>
                              {item.categoryId && itemNamesByCategory[item.categoryId] &&
                               itemNamesByCategory[item.categoryId].map((itemName) => (
                                <option key={itemName.id} value={itemName.id}>
                                  {itemName.name}
                                </option>
                              ))}
                            </select>
                            {errors[`item_${index}_itemNameId`] && (
                              <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_itemNameId`]}</p>
                            )}
                          </div>
                        )}

                        {/* Category-specific custom fields, defined by the admin for this category */}
                        {item.categoryId && fields.length > 0 && (
                          <div className="col-span-full border-l-4 border-blue-500 bg-blue-50 p-4 rounded-md">
                            <h4 className="text-sm font-semibold text-blue-800 mb-3">
                              {categories.find(c => String(c.id) === String(item.categoryId))?.name || 'Category'} Details
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {fields.map(field => (
                                <div key={field.id}>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {field.label}{field.isRequired ? ' *' : ''}
                                  </label>
                                  {renderCustomField(item, index, field)}
                                  {errors[`item_${index}_field_${field.id}`] && (
                                    <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_field_${field.id}`]}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Quantity */}
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

                        {/* Unit Dropdown */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Unit *
                          </label>
                          <select
                            value={item.unit}
                            onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-sm ${
                              errors[`item_${index}_unit`] ? 'border-red-500' : 'border-gray-300'
                            }`}
                          >
                            {unitOptions.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                          {errors[`item_${index}_unit`] && (
                            <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_unit`]}</p>
                          )}
                        </div>

                        {/* Specifications */}
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Item Specifications *
                          </label>
                          <textarea
                            value={item.specifications}
                            onChange={(e) => handleItemChange(index, 'specifications', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-sm resize-vertical ${
                              errors[`item_${index}_specifications`] ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Enter detailed specifications for this item"
                            rows="3"
                          />
                          {errors[`item_${index}_specifications`] && (
                            <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_specifications`]}</p>
                          )}
                        </div>

                        {/* Remarks */}
                        <div className="col-span-2">
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
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Urgency & Required Date */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Step 3: Demand Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <p className="text-gray-500 text-sm mt-1">
                    Select the appropriate urgency level for this demand.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <p className="text-gray-500 text-sm mt-1">
                    When do you need this demand to be fulfilled?
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
                <h3 className="font-medium text-blue-800 mb-2">Summary</h3>
                <p className="text-blue-700 mb-1">
                  <span className="font-medium">Description:</span> {formData.description}
                </p>
                <p className="text-blue-700">
                  <span className="font-medium">Total Items:</span> {formData.items.length}
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-6">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePreviousStep}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Previous
              </button>
            )}

            <div className="ml-auto">
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  {loading ? 'Submitting...' : 'Submit Demand'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateDemandForm;
