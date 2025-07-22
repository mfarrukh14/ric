import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl, getItemCategories, getItemNamesByCategory } from '../../config/api';

const CreateDemandForm = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Dropdown data
  const [categories, setCategories] = useState([]);
  const [itemNamesByCategory, setItemNamesByCategory] = useState({});

  // Unit options
  const unitOptions = ['packet', 'box', 'kg', 'roll', 'ltr', 'numbers', 'tests', 'kit'];

  // Get current and previous fiscal years
  const getCurrentFiscalYear = () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
    
    // Fiscal year typically runs from July to June
    if (currentMonth >= 7) {
      return `${currentYear}-${currentYear + 1}`;
    } else {
      return `${currentYear - 1}-${currentYear}`;
    }
  };

  const getPreviousFiscalYear = () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    if (currentMonth >= 7) {
      return `${currentYear - 1}-${currentYear}`;
    } else {
      return `${currentYear - 2}-${currentYear - 1}`;
    }
  };

  const currentFiscalYear = getCurrentFiscalYear();
  const previousFiscalYear = getPreviousFiscalYear();

  // Form data state
  const [formData, setFormData] = useState({
    description: '',
    urgency: 'normal',
    requiredBy: '',
    items: [
      { 
        categoryId: '', 
        itemNameId: '', 
        quantity: '', 
        unit: 'numbers', 
        prevYearCost: '', 
        currentYearCost: '', 
        specifications: '',
        remarks: '',
        // Medicine-specific fields
        drugCategoryId: '',
        drugNameId: '',
        strengthValue: '',
        strengthUnitId: '',
        dosageFormId: '',
        preparationId: '',
        // Equipment-specific fields
        equipmentCategoryId: '',
        equipmentTypeId: ''
      }
    ]
  });

  // Additional state for dropdown data
  const [drugCategories, setDrugCategories] = useState([]);
  const [drugNamesByCategory, setDrugNamesByCategory] = useState({});
  const [strengthUnits, setStrengthUnits] = useState([]);
  const [dosageForms, setDosageForms] = useState([]);
  const [preparations, setPreparations] = useState([]);
  const [equipmentCategories, setEquipmentCategories] = useState([]);
  const [equipmentTypesByCategory, setEquipmentTypesByCategory] = useState({});

  // Validation state
  const [errors, setErrors] = useState({});

  // Helper function to check if category is pharmaceutical
  const isPharmaCategory = (categoryId) => {
    const category = categories.find(cat => cat.id == categoryId);
    return category && (
      category.name.toLowerCase().includes('pharmaceutical') || 
      category.name.toLowerCase().includes('medicine') ||
      category.name.toLowerCase().includes('drug')
    );
  };

  // Helper function to check if category is equipment
  const isEquipmentCategory = (categoryId) => {
    const category = categories.find(cat => cat.id == categoryId);
    return category && (
      category.name.toLowerCase().includes('equipment') || 
      category.name.toLowerCase().includes('machinery') ||
      category.name.toLowerCase().includes('instrument')
    );
  };

  // Load categories on component mount
  useEffect(() => {
    loadCategories();
    loadDetailedCategorizationData();
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

  const loadDetailedCategorizationData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Load drug categories
      const drugCategoriesResponse = await fetch(`${apiUrl}/item-categorization/drug-categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (drugCategoriesResponse.ok) {
        const drugCategoriesData = await drugCategoriesResponse.json();
        setDrugCategories(drugCategoriesData);
      }

      // Load strength units
      const strengthUnitsResponse = await fetch(`${apiUrl}/item-categorization/strength-units`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (strengthUnitsResponse.ok) {
        const strengthUnitsData = await strengthUnitsResponse.json();
        setStrengthUnits(strengthUnitsData);
      }

      // Load dosage forms
      const dosageFormsResponse = await fetch(`${apiUrl}/item-categorization/dosage-forms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (dosageFormsResponse.ok) {
        const dosageFormsData = await dosageFormsResponse.json();
        setDosageForms(dosageFormsData);
      }

      // Load preparations
      const preparationsResponse = await fetch(`${apiUrl}/item-categorization/preparations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (preparationsResponse.ok) {
        const preparationsData = await preparationsResponse.json();
        setPreparations(preparationsData);
      }

      // Load equipment categories
      const equipmentCategoriesResponse = await fetch(`${apiUrl}/item-categorization/equipment-categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (equipmentCategoriesResponse.ok) {
        const equipmentCategoriesData = await equipmentCategoriesResponse.json();
        setEquipmentCategories(equipmentCategoriesData);
      }
    } catch (error) {
      console.error('Error loading detailed categorization data:', error);
      setError('Failed to load categorization data');
    }
  };

  const loadDrugNames = async (drugCategoryId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/item-categorization/drug-names/${drugCategoryId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const drugNames = await response.json();
        setDrugNamesByCategory(prev => ({
          ...prev,
          [drugCategoryId]: drugNames
        }));
      }
    } catch (error) {
      console.error('Error loading drug names:', error);
      setError('Failed to load drug names');
    }
  };

  const loadEquipmentTypes = async (equipmentCategoryId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/item-categorization/equipment-types/${equipmentCategoryId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const equipmentTypes = await response.json();
        setEquipmentTypesByCategory(prev => ({
          ...prev,
          [equipmentCategoryId]: equipmentTypes
        }));
      }
    } catch (error) {
      console.error('Error loading equipment types:', error);
      setError('Failed to load equipment types');
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
    
    // If category is changed, load item names and reset item name
    if (field === 'categoryId') {
      newItems[index]['itemNameId'] = '';
      if (value) {
        loadItemNames(value);
      }
    }
    
    // If drug category is changed, load drug names and reset drug name
    if (field === 'drugCategoryId') {
      newItems[index]['drugNameId'] = '';
      if (value) {
        loadDrugNames(value);
      }
    }
    
    // If equipment category is changed, load equipment types and reset equipment type
    if (field === 'equipmentCategoryId') {
      newItems[index]['equipmentTypeId'] = '';
      if (value) {
        loadEquipmentTypes(value);
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

  // Add a new item
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { 
        categoryId: '', 
        itemNameId: '', 
        quantity: '', 
        unit: 'numbers', 
        prevYearCost: '', 
        currentYearCost: '', 
        specifications: '',
        remarks: '',
        // Medicine-specific fields
        drugCategoryId: '',
        drugNameId: '',
        strengthValue: '',
        strengthUnitId: '',
        dosageFormId: '',
        preparationId: '',
        // Equipment-specific fields
        equipmentCategoryId: '',
        equipmentTypeId: ''
      }]
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
        // Only require itemNameId for non-pharmaceutical categories
        if (!isPharmaCategory(item.categoryId) && !item.itemNameId) {
          newErrors[`item_${index}_itemNameId`] = 'Item name is required';
        }
        if (!item.quantity || item.quantity <= 0) {
          newErrors[`item_${index}_quantity`] = 'Valid quantity is required';
        }
        if (!item.unit) {
          newErrors[`item_${index}_unit`] = 'Unit is required';
        }
        
        // Additional validation for pharmaceutical items
        if (isPharmaCategory(item.categoryId)) {
          if (!item.drugCategoryId) {
            newErrors[`item_${index}_drugCategoryId`] = 'Drug category is required';
          }
          if (!item.drugNameId) {
            newErrors[`item_${index}_drugNameId`] = 'Drug name is required';
          }
          if (!item.strengthValue) {
            newErrors[`item_${index}_strengthValue`] = 'Strength value is required';
          }
          if (!item.strengthUnitId) {
            newErrors[`item_${index}_strengthUnitId`] = 'Strength unit is required';
          }
          if (!item.dosageFormId) {
            newErrors[`item_${index}_dosageFormId`] = 'Dosage form is required';
          }
        }
        
        // Additional validation for equipment items
        if (isEquipmentCategory(item.categoryId)) {
          if (!item.equipmentCategoryId) {
            newErrors[`item_${index}_equipmentCategoryId`] = 'Equipment category is required';
          }
          if (!item.equipmentTypeId) {
            newErrors[`item_${index}_equipmentTypeId`] = 'Equipment type is required';
          }
        }
        if (!item.specifications || item.specifications.trim() === '') {
          newErrors[`item_${index}_specifications`] = 'Item specifications are required';
        }
        if (item.prevYearCost === '' || item.prevYearCost < 0) {
          newErrors[`item_${index}_prevYearCost`] = 'Previous year cost is required';
        }
        if (item.currentYearCost === '' || item.currentYearCost < 0) {
          newErrors[`item_${index}_currentYearCost`] = 'Current year cost is required';
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
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        {errors[`item_${index}_categoryId`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_categoryId`]}</p>
                        )}
                      </div>

                      {/* Pharmaceutical Details - Show immediately after category for pharma items */}
                      {item.categoryId && isPharmaCategory(item.categoryId) && (
                        <div className="col-span-full border-l-4 border-blue-500 bg-blue-50 p-4 rounded-md">
                          <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Pharmaceutical Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Drug Category */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Drug Category *
                              </label>
                              <select
                                value={item.drugCategoryId}
                                onChange={(e) => handleItemChange(index, 'drugCategoryId', e.target.value)}
                                className={`w-full px-3 py-2 border rounded-md text-sm ${
                                  errors[`item_${index}_drugCategoryId`] ? 'border-red-500' : 'border-gray-300'
                                }`}
                              >
                                <option value="">Select Drug Category</option>
                                {drugCategories.map((drugCategory) => (
                                  <option key={drugCategory.id} value={drugCategory.id}>
                                    {drugCategory.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`item_${index}_drugCategoryId`] && (
                                <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_drugCategoryId`]}</p>
                              )}
                            </div>

                            {/* Drug Name */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Drug Name *
                              </label>
                              <select
                                value={item.drugNameId}
                                onChange={(e) => handleItemChange(index, 'drugNameId', e.target.value)}
                                disabled={!item.drugCategoryId}
                                className={`w-full px-3 py-2 border rounded-md text-sm ${
                                  errors[`item_${index}_drugNameId`] ? 'border-red-500' : 'border-gray-300'
                                } ${!item.drugCategoryId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              >
                                <option value="">Select Drug Name</option>
                                {item.drugCategoryId && drugNamesByCategory[item.drugCategoryId] && 
                                 drugNamesByCategory[item.drugCategoryId].map((drugName) => (
                                  <option key={drugName.id} value={drugName.id}>
                                    {drugName.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`item_${index}_drugNameId`] && (
                                <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_drugNameId`]}</p>
                              )}
                            </div>

                            {/* Strength Value and Unit */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Strength *
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={item.strengthValue}
                                  onChange={(e) => handleItemChange(index, 'strengthValue', e.target.value)}
                                  className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                                    errors[`item_${index}_strengthValue`] ? 'border-red-500' : 'border-gray-300'
                                  }`}
                                  placeholder="Value"
                                />
                                <select
                                  value={item.strengthUnitId}
                                  onChange={(e) => handleItemChange(index, 'strengthUnitId', e.target.value)}
                                  className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                                    errors[`item_${index}_strengthUnitId`] ? 'border-red-500' : 'border-gray-300'
                                  }`}
                                >
                                  <option value="">Unit</option>
                                  {strengthUnits.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                      {unit.abbreviation} ({unit.name})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {(errors[`item_${index}_strengthValue`] || errors[`item_${index}_strengthUnitId`]) && (
                                <p className="text-red-500 text-xs mt-1">
                                  {errors[`item_${index}_strengthValue`] || errors[`item_${index}_strengthUnitId`]}
                                </p>
                              )}
                            </div>

                            {/* Dosage Form */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Dosage Form *
                              </label>
                              <select
                                value={item.dosageFormId}
                                onChange={(e) => handleItemChange(index, 'dosageFormId', e.target.value)}
                                className={`w-full px-3 py-2 border rounded-md text-sm ${
                                  errors[`item_${index}_dosageFormId`] ? 'border-red-500' : 'border-gray-300'
                                }`}
                              >
                                <option value="">Select Dosage Form</option>
                                {dosageForms.map((form) => (
                                  <option key={form.id} value={form.id}>
                                    {form.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`item_${index}_dosageFormId`] && (
                                <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_dosageFormId`]}</p>
                              )}
                            </div>

                            {/* Preparation (Optional) */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Preparation (Optional)
                              </label>
                              <select
                                value={item.preparationId}
                                onChange={(e) => handleItemChange(index, 'preparationId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              >
                                <option value="">Select Preparation</option>
                                {preparations.map((prep) => (
                                  <option key={prep.id} value={prep.id}>
                                    {prep.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Equipment Details - Show for equipment items */}
                      {item.categoryId && isEquipmentCategory(item.categoryId) && (
                        <div className="col-span-full border-l-4 border-orange-500 bg-orange-50 p-4 rounded-md">
                          <h4 className="text-sm font-semibold text-orange-800 mb-3 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 000 1.788l4 2z"/>
                              <path d="M15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z"/>
                            </svg>
                            Equipment Information
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Equipment Category */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Equipment Category *
                              </label>
                              <select
                                value={item.equipmentCategoryId}
                                onChange={(e) => handleItemChange(index, 'equipmentCategoryId', e.target.value)}
                                className={`w-full px-3 py-2 border rounded-md text-sm ${
                                  errors[`item_${index}_equipmentCategoryId`] ? 'border-red-500' : 'border-gray-300'
                                }`}
                              >
                                <option value="">Select Equipment Category</option>
                                {equipmentCategories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`item_${index}_equipmentCategoryId`] && (
                                <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_equipmentCategoryId`]}</p>
                              )}
                            </div>

                            {/* Equipment Type */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Equipment Type *
                              </label>
                              <select
                                value={item.equipmentTypeId}
                                onChange={(e) => handleItemChange(index, 'equipmentTypeId', e.target.value)}
                                disabled={!item.equipmentCategoryId}
                                className={`w-full px-3 py-2 border rounded-md text-sm ${
                                  errors[`item_${index}_equipmentTypeId`] ? 'border-red-500' : 'border-gray-300'
                                } ${!item.equipmentCategoryId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                              >
                                <option value="">Select Equipment Type</option>
                                {item.equipmentCategoryId && equipmentTypesByCategory[item.equipmentCategoryId] && 
                                 equipmentTypesByCategory[item.equipmentCategoryId].map((type) => (
                                  <option key={type.id} value={type.id}>
                                    {type.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`item_${index}_equipmentTypeId`] && (
                                <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_equipmentTypeId`]}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Item Name Dropdown - Only for non-pharmaceutical/equipment categories */}
                      {item.categoryId && !isPharmaCategory(item.categoryId) && !isEquipmentCategory(item.categoryId) && (
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



                      {/* Previous Year Cost */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Previous Year Cost ({previousFiscalYear}) *
                        </label>
                        <input
                          type="number"
                          value={item.prevYearCost}
                          onChange={(e) => handleItemChange(index, 'prevYearCost', e.target.value)}
                          min="0"
                          step="0.01"
                          className={`w-full px-3 py-2 border rounded-md text-sm ${
                            errors[`item_${index}_prevYearCost`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Previous Cost"
                        />
                        {errors[`item_${index}_prevYearCost`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_prevYearCost`]}</p>
                        )}
                      </div>

                      {/* Current Year Cost */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Current Year Cost ({currentFiscalYear}) *
                        </label>
                        <input
                          type="number"
                          value={item.currentYearCost}
                          onChange={(e) => handleItemChange(index, 'currentYearCost', e.target.value)}
                          min="0"
                          step="0.01"
                          className={`w-full px-3 py-2 border rounded-md text-sm ${
                            errors[`item_${index}_currentYearCost`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Current Cost"
                        />
                        {errors[`item_${index}_currentYearCost`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`item_${index}_currentYearCost`]}</p>
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
                ))}
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
                <p className="text-blue-700 mb-1">
                  <span className="font-medium">Total Items:</span> {formData.items.length}
                </p>
                <p className="text-blue-700 mb-1">
                  <span className="font-medium">Total Previous Year Cost ({previousFiscalYear}):</span> Rs 
                  {" " + formData.items.reduce((sum, item) => sum + (parseFloat(item.prevYearCost) || 0), 0).toFixed(2)}
                </p>
                <p className="text-blue-700">
                  <span className="font-medium">Total Current Year Cost ({currentFiscalYear}):</span> Rs 
                  {" " + formData.items.reduce((sum, item) => sum + (parseFloat(item.currentYearCost) || 0), 0).toFixed(2)}
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