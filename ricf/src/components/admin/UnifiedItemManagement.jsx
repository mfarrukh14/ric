import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';
import { 
  Plus, 
  Edit, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  Package, 
  Pill, 
  Wrench,
  FileText,
  Search,
  Filter
} from 'lucide-react';

const UnifiedItemManagement = () => {
  const [activeMainCategory, setActiveMainCategory] = useState('pharmaceuticals');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState({});

  // Main item categories (top level)
  const [mainCategories, setMainCategories] = useState([]);
  
  // Pharmaceutical data
  const [drugCategories, setDrugCategories] = useState([]);
  const [drugNames, setDrugNames] = useState([]);
  const [strengthUnits, setStrengthUnits] = useState([]);
  const [dosageForms, setDosageForms] = useState([]);
  const [preparations, setPreparations] = useState([]);

  // Equipment data
  const [equipmentCategories, setEquipmentCategories] = useState([]);
  const [equipmentTypes, setEquipmentTypes] = useState([]);

  // Form states
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Load main categories
      const mainCategoriesRes = await fetch(`${apiUrl}/items/categories`, { headers });
      if (mainCategoriesRes.ok) {
        const data = await mainCategoriesRes.json();
        setMainCategories(data);
      }

      // Load pharmaceutical data
      const [
        drugCategoriesRes,
        strengthUnitsRes,
        dosageFormsRes,
        preparationsRes,
        equipmentCategoriesRes
      ] = await Promise.all([
        fetch(`${apiUrl}/item-categorization/drug-categories`, { headers }),
        fetch(`${apiUrl}/item-categorization/strength-units`, { headers }),
        fetch(`${apiUrl}/item-categorization/dosage-forms`, { headers }),
        fetch(`${apiUrl}/item-categorization/preparations`, { headers }),
        fetch(`${apiUrl}/item-categorization/equipment-categories`, { headers })
      ]);

      if (drugCategoriesRes.ok) {
        const data = await drugCategoriesRes.json();
        setDrugCategories(data);
        loadAllDrugNames(data);
      }

      if (strengthUnitsRes.ok) setStrengthUnits(await strengthUnitsRes.json());
      if (dosageFormsRes.ok) setDosageForms(await dosageFormsRes.json());
      if (preparationsRes.ok) setPreparations(await preparationsRes.json());
      
      if (equipmentCategoriesRes.ok) {
        const data = await equipmentCategoriesRes.json();
        setEquipmentCategories(data);
        loadAllEquipmentTypes(data);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAllDrugNames = async (categories) => {
    try {
      const token = localStorage.getItem('token');
      const drugNamesPromises = categories.map(category =>
        fetch(`${apiUrl}/item-categorization/drug-names/${category.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.ok ? res.json() : [])
      );
      
      const allDrugNames = await Promise.all(drugNamesPromises);
      setDrugNames(allDrugNames.flat());
    } catch (error) {
      console.error('Error loading drug names:', error);
    }
  };

  const loadAllEquipmentTypes = async (categories) => {
    try {
      const token = localStorage.getToken('token');
      const equipmentTypesPromises = categories.map(category =>
        fetch(`${apiUrl}/item-categorization/equipment-types/${category.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.ok ? res.json() : [])
      );
      
      const allEquipmentTypes = await Promise.all(equipmentTypesPromises);
      setEquipmentTypes(allEquipmentTypes.flat());
    } catch (error) {
      console.error('Error loading equipment types:', error);
    }
  };

  const handleCreate = async (type, parentId = null) => {
    try {
      const token = localStorage.getItem('token');
      let endpoint = `${apiUrl}/item-categorization/admin/${type}`;
      
      if (type === 'main-categories') {
        endpoint = `${apiUrl}/items/categories`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          parentId
        })
      });

      if (response.ok) {
        setSuccess('Item created successfully');
        setFormData({});
        setEditingItem(null);
        setShowModal(false);
        loadAllData();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to create item');
      }
    } catch (error) {
      console.error('Error creating item:', error);
      setError('Failed to create item');
    }
  };

  const handleUpdate = async (type, id) => {
    try {
      const token = localStorage.getItem('token');
      let endpoint = `${apiUrl}/item-categorization/admin/${type}/${id}`;
      
      if (type === 'main-categories') {
        endpoint = `${apiUrl}/items/categories/${id}`;
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSuccess('Item updated successfully');
        setFormData({});
        setEditingItem(null);
        setShowModal(false);
        loadAllData();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to update item');
      }
    } catch (error) {
      console.error('Error updating item:', error);
      setError('Failed to update item');
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;

    try {
      const token = localStorage.getItem('token');
      let endpoint = `${apiUrl}/item-categorization/admin/${type}/${id}`;
      
      if (type === 'main-categories') {
        endpoint = `${apiUrl}/items/categories/${id}`;
      }

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setSuccess('Item deleted successfully');
        loadAllData();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      setError('Failed to delete item');
    }
  };

  const toggleNode = (nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const openModal = (type, item = null, parentId = null) => {
    setModalType(type);
    setEditingItem(item);
    setFormData(item || {});
    setShowModal(true);
  };

  const getFilteredDrugNames = (categoryId) => {
    return drugNames.filter(drug => drug.drug_category_id === categoryId);
  };

  const getFilteredEquipmentTypes = (categoryId) => {
    return equipmentTypes.filter(equipment => equipment.equipment_category_id === categoryId);
  };

  const renderPharmaceuticalTree = () => {
    const pharmaceuticalCategory = mainCategories.find(cat => 
      cat.name.toLowerCase().includes('pharmaceutical') || 
      cat.name.toLowerCase().includes('medicine')
    );

    if (!pharmaceuticalCategory) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Pill className="mx-auto h-12 w-12 mb-4" />
          <p>No pharmaceutical category found. Please create one first.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Main Pharmaceutical Category */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Pill className="h-6 w-6 text-blue-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{pharmaceuticalCategory.name}</h3>
                <p className="text-sm text-gray-600">{pharmaceuticalCategory.description}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => openModal('drug-categories')}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 inline mr-1" />
                Add Drug Category
              </button>
            </div>
          </div>

          {/* Drug Categories */}
          <div className="mt-4 ml-6 space-y-3">
            {drugCategories.map(drugCategory => (
              <div key={drugCategory.id} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => toggleNode(`drug-cat-${drugCategory.id}`)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedNodes[`drug-cat-${drugCategory.id}`] ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </button>
                    <div>
                      <h4 className="font-medium text-gray-900">{drugCategory.name}</h4>
                      <p className="text-xs text-gray-600">{drugCategory.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openModal('drug-names', null, drugCategory.id)}
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                      <Plus className="h-3 w-3 inline mr-1" />
                      Add Drug
                    </button>
                    <button
                      onClick={() => openModal('drug-categories', drugCategory)}
                      className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete('drug-categories', drugCategory.id)}
                      className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Drug Names under this category */}
                {expandedNodes[`drug-cat-${drugCategory.id}`] && (
                  <div className="mt-3 ml-6 space-y-2">
                    {getFilteredDrugNames(drugCategory.id).map(drug => (
                      <div key={drug.id} className="flex items-center justify-between p-2 bg-white border rounded">
                        <div>
                          <span className="font-medium text-sm">{drug.name}</span>
                          <p className="text-xs text-gray-600">{drug.description}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openModal('drug-names', drug)}
                            className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete('drug-names', drug.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {getFilteredDrugNames(drugCategory.id).length === 0 && (
                      <p className="text-xs text-gray-500 italic">No drugs in this category</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Supporting Data Section */}
          <div className="mt-6 border-t pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Supporting Data</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Strength Units */}
              <div className="bg-gray-50 p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-sm">Strength Units ({strengthUnits.length})</h5>
                  <button
                    onClick={() => openModal('strength-units')}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  {strengthUnits.slice(0, 3).map(unit => (
                    <div key={unit.id} className="flex items-center justify-between text-xs">
                      <span>{unit.name} ({unit.abbreviation})</span>
                      <div className="flex space-x-1">
                        <button onClick={() => openModal('strength-units', unit)} className="text-yellow-600 hover:text-yellow-800">
                          <Edit className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete('strength-units', unit.id)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {strengthUnits.length > 3 && (
                    <p className="text-xs text-gray-500">... and {strengthUnits.length - 3} more</p>
                  )}
                </div>
              </div>

              {/* Dosage Forms */}
              <div className="bg-gray-50 p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-sm">Dosage Forms ({dosageForms.length})</h5>
                  <button
                    onClick={() => openModal('dosage-forms')}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  {dosageForms.slice(0, 3).map(form => (
                    <div key={form.id} className="flex items-center justify-between text-xs">
                      <span>{form.name}</span>
                      <div className="flex space-x-1">
                        <button onClick={() => openModal('dosage-forms', form)} className="text-yellow-600 hover:text-yellow-800">
                          <Edit className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete('dosage-forms', form.id)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {dosageForms.length > 3 && (
                    <p className="text-xs text-gray-500">... and {dosageForms.length - 3} more</p>
                  )}
                </div>
              </div>

              {/* Preparations */}
              <div className="bg-gray-50 p-3 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-sm">Preparations ({preparations.length})</h5>
                  <button
                    onClick={() => openModal('preparations')}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  {preparations.slice(0, 3).map(prep => (
                    <div key={prep.id} className="flex items-center justify-between text-xs">
                      <span>{prep.name}</span>
                      <div className="flex space-x-1">
                        <button onClick={() => openModal('preparations', prep)} className="text-yellow-600 hover:text-yellow-800">
                          <Edit className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete('preparations', prep.id)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {preparations.length > 3 && (
                    <p className="text-xs text-gray-500">... and {preparations.length - 3} more</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEquipmentTree = () => {
    const equipmentCategory = mainCategories.find(cat => 
      cat.name.toLowerCase().includes('equipment') || 
      cat.name.toLowerCase().includes('machinery')
    );

    if (!equipmentCategory) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Wrench className="mx-auto h-12 w-12 mb-4" />
          <p>No equipment category found. Please create one first.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Main Equipment Category */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Wrench className="h-6 w-6 text-orange-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{equipmentCategory.name}</h3>
                <p className="text-sm text-gray-600">{equipmentCategory.description}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => openModal('equipment-categories')}
                className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
              >
                <Plus className="h-4 w-4 inline mr-1" />
                Add Equipment Category
              </button>
            </div>
          </div>

          {/* Equipment Categories */}
          <div className="mt-4 ml-6 space-y-3">
            {equipmentCategories.map(eqCategory => (
              <div key={eqCategory.id} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => toggleNode(`eq-cat-${eqCategory.id}`)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedNodes[`eq-cat-${eqCategory.id}`] ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </button>
                    <div>
                      <h4 className="font-medium text-gray-900">{eqCategory.name}</h4>
                      <p className="text-xs text-gray-600">{eqCategory.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openModal('equipment-types', null, eqCategory.id)}
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    >
                      <Plus className="h-3 w-3 inline mr-1" />
                      Add Equipment
                    </button>
                    <button
                      onClick={() => openModal('equipment-categories', eqCategory)}
                      className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete('equipment-categories', eqCategory.id)}
                      className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Equipment Types under this category */}
                {expandedNodes[`eq-cat-${eqCategory.id}`] && (
                  <div className="mt-3 ml-6 space-y-2">
                    {getFilteredEquipmentTypes(eqCategory.id).map(equipment => (
                      <div key={equipment.id} className="flex items-center justify-between p-2 bg-white border rounded">
                        <div>
                          <span className="font-medium text-sm">{equipment.name}</span>
                          <p className="text-xs text-gray-600">{equipment.description}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => openModal('equipment-types', equipment)}
                            className="px-2 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete('equipment-types', equipment.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {getFilteredEquipmentTypes(eqCategory.id).length === 0 && (
                      <p className="text-xs text-gray-500 italic">No equipment in this category</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderOtherCategories = () => {
    const otherCategories = mainCategories.filter(cat => 
      !cat.name.toLowerCase().includes('pharmaceutical') && 
      !cat.name.toLowerCase().includes('medicine') &&
      !cat.name.toLowerCase().includes('equipment') &&
      !cat.name.toLowerCase().includes('machinery')
    );

    return (
      <div className="space-y-4">
        {otherCategories.map(category => (
          <div key={category.id} className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Package className="h-6 w-6 text-gray-500" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                  <p className="text-sm text-gray-600">{category.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => openModal('main-categories', category)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                >
                  <Edit className="h-4 w-4 inline mr-1" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete('main-categories', category.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  <Trash2 className="h-4 w-4 inline mr-1" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {otherCategories.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="mx-auto h-12 w-12 mb-4" />
            <p>No other categories found.</p>
          </div>
        )}
      </div>
    );
  };

  const renderModal = () => {
    if (!showModal) return null;

    const getModalTitle = () => {
      const titles = {
        'drug-categories': 'Drug Category',
        'drug-names': 'Drug Name',
        'strength-units': 'Strength Unit',
        'dosage-forms': 'Dosage Form',
        'preparations': 'Preparation',
        'equipment-categories': 'Equipment Category',
        'equipment-types': 'Equipment Type',
        'main-categories': 'Main Category'
      };
      return `${editingItem ? 'Edit' : 'Add'} ${titles[modalType]}`;
    };

    const getFormFields = () => {
      switch (modalType) {
        case 'drug-categories':
        case 'equipment-categories':
        case 'dosage-forms':
        case 'preparations':
        case 'main-categories':
          return (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Enter description"
                />
              </div>
            </>
          );

        case 'drug-names':
          return (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Drug Category *</label>
                <select
                  value={formData.drugCategoryId || ''}
                  onChange={(e) => setFormData({...formData, drugCategoryId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Category</option>
                  {drugCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Drug Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter drug name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="2"
                  placeholder="Enter description"
                />
              </div>
            </>
          );

        case 'equipment-types':
          return (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Equipment Category *</label>
                <select
                  value={formData.equipmentCategoryId || ''}
                  onChange={(e) => setFormData({...formData, equipmentCategoryId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Category</option>
                  {equipmentCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Equipment Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter equipment name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="2"
                  placeholder="Enter description"
                />
              </div>
            </>
          );

        case 'strength-units':
          return (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Milligrams"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Abbreviation *</label>
                <input
                  type="text"
                  value={formData.abbreviation || ''}
                  onChange={(e) => setFormData({...formData, abbreviation: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., mg"
                />
              </div>
            </>
          );

        default:
          return null;
      }
    };

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{getModalTitle()}</h3>
            <button
              onClick={() => setShowModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            {getFormFields()}
          </div>

          <div className="flex items-center justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={() => editingItem ? 
                handleUpdate(modalType, editingItem.id) : 
                handleCreate(modalType)
              }
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Unified Item Management</h1>
        <p className="text-gray-600">Manage all item categories and their hierarchical data in one place</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      {/* Search and Add Main Category */}
      <div className="mb-6 flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <button
          onClick={() => openModal('main-categories')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Main Category</span>
        </button>
      </div>

      {/* Main Category Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveMainCategory('pharmaceuticals')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeMainCategory === 'pharmaceuticals'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Pill className="inline h-4 w-4 mr-2" />
            Pharmaceuticals
          </button>
          <button
            onClick={() => setActiveMainCategory('equipment')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeMainCategory === 'equipment'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Wrench className="inline h-4 w-4 mr-2" />
            Equipment
          </button>
          <button
            onClick={() => setActiveMainCategory('other')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeMainCategory === 'other'
                ? 'border-gray-500 text-gray-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Package className="inline h-4 w-4 mr-2" />
            Other Categories
          </button>
        </nav>
      </div>

      {/* Content based on active tab */}
      <div className="space-y-6">
        {activeMainCategory === 'pharmaceuticals' && renderPharmaceuticalTree()}
        {activeMainCategory === 'equipment' && renderEquipmentTree()}
        {activeMainCategory === 'other' && renderOtherCategories()}
      </div>

      {/* Modal */}
      {renderModal()}
    </div>
  );
};

export default UnifiedItemManagement;
