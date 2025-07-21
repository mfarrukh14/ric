import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const ItemCategorizationAdmin = () => {
  const [activeTab, setActiveTab] = useState('drugCategories');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Data states
  const [drugCategories, setDrugCategories] = useState([]);
  const [drugNames, setDrugNames] = useState([]);
  const [strengthUnits, setStrengthUnits] = useState([]);
  const [dosageForms, setDosageForms] = useState([]);
  const [preparations, setPreparations] = useState([]);
  const [equipmentCategories, setEquipmentCategories] = useState([]);
  const [equipmentTypes, setEquipmentTypes] = useState([]);

  // Form states
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});

  const tabs = [
    { id: 'drugCategories', label: 'Drug Categories', count: drugCategories.length },
    { id: 'drugNames', label: 'Drug Names', count: drugNames.length },
    { id: 'strengthUnits', label: 'Strength Units', count: strengthUnits.length },
    { id: 'dosageForms', label: 'Dosage Forms', count: dosageForms.length },
    { id: 'preparations', label: 'Preparations', count: preparations.length },
    { id: 'equipmentCategories', label: 'Equipment Categories', count: equipmentCategories.length },
    { id: 'equipmentTypes', label: 'Equipment Types', count: equipmentTypes.length }
  ];

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

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
        // Load drug names for all categories
        loadAllDrugNames(data);
      }

      if (strengthUnitsRes.ok) setStrengthUnits(await strengthUnitsRes.json());
      if (dosageFormsRes.ok) setDosageForms(await dosageFormsRes.json());
      if (preparationsRes.ok) setPreparations(await preparationsRes.json());
      
      if (equipmentCategoriesRes.ok) {
        const data = await equipmentCategoriesRes.json();
        setEquipmentCategories(data);
        // Load equipment types for all categories
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
      const token = localStorage.getItem('token');
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

  const handleCreate = async (type) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/item-categorization/admin/${type}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSuccess('Item created successfully');
        setFormData({});
        setEditingItem(null);
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
      const response = await fetch(`${apiUrl}/item-categorization/admin/${type}/${id}`, {
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
      const response = await fetch(`${apiUrl}/item-categorization/admin/${type}/${id}`, {
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

  const renderDrugCategories = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Drug Categories</h3>
        <button
          onClick={() => {
            setEditingItem('new');
            setFormData({ name: '', description: '' });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add New Category
        </button>
      </div>

      {editingItem === 'new' && (
        <div className="bg-gray-50 p-4 rounded border">
          <h4 className="font-medium mb-2">Add New Drug Category</h4>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Category Name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-3 py-2 border rounded"
            />
          </div>
          <div className="mt-3 space-x-2">
            <button
              onClick={() => handleCreate('drug-categories')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setFormData({});
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {drugCategories.map((category) => (
          <div key={category.id} className="flex items-center justify-between p-3 bg-white border rounded">
            <div>
              <div className="font-medium">{category.name}</div>
              <div className="text-sm text-gray-600">{category.description}</div>
            </div>
            <div className="space-x-2">
              <button
                onClick={() => {
                  setEditingItem(category.id);
                  setFormData({ name: category.name, description: category.description });
                }}
                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete('drug-categories', category.id)}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderDrugNames = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Drug Names</h3>
        <button
          onClick={() => {
            setEditingItem('new');
            setFormData({ drugCategoryId: '', name: '', description: '' });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add New Drug Name
        </button>
      </div>

      {editingItem === 'new' && (
        <div className="bg-gray-50 p-4 rounded border">
          <h4 className="font-medium mb-2">Add New Drug Name</h4>
          <div className="grid grid-cols-3 gap-4">
            <select
              value={formData.drugCategoryId || ''}
              onChange={(e) => setFormData({ ...formData, drugCategoryId: e.target.value })}
              className="px-3 py-2 border rounded"
            >
              <option value="">Select Category</option>
              {drugCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Drug Name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-3 py-2 border rounded"
            />
          </div>
          <div className="mt-3 space-x-2">
            <button
              onClick={() => handleCreate('drug-names')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setFormData({});
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {drugNames.map((drug) => {
          const category = drugCategories.find(cat => cat.id === drug.drug_category_id);
          return (
            <div key={drug.id} className="flex items-center justify-between p-3 bg-white border rounded">
              <div>
                <div className="font-medium">{drug.name}</div>
                <div className="text-sm text-gray-600">
                  Category: {category?.name} | {drug.description}
                </div>
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => {
                    setEditingItem(drug.id);
                    setFormData({ 
                      drugCategoryId: drug.drug_category_id, 
                      name: drug.name, 
                      description: drug.description 
                    });
                  }}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete('drug-names', drug.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSimpleList = (items, type, title, fields) => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button
          onClick={() => {
            setEditingItem('new');
            const initialData = {};
            fields.forEach(field => initialData[field] = '');
            setFormData(initialData);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add New {title.slice(0, -1)}
        </button>
      </div>

      {editingItem === 'new' && (
        <div className="bg-gray-50 p-4 rounded border">
          <h4 className="font-medium mb-2">Add New {title.slice(0, -1)}</h4>
          <div className={`grid grid-cols-${fields.length} gap-4`}>
            {fields.map(field => (
              <input
                key={field}
                type="text"
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={formData[field] || ''}
                onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                className="px-3 py-2 border rounded"
              />
            ))}
          </div>
          <div className="mt-3 space-x-2">
            <button
              onClick={() => handleCreate(type)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setFormData({});
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3 bg-white border rounded">
            <div>
              <div className="font-medium">{item.name}</div>
              {item.abbreviation && (
                <div className="text-sm text-gray-600">Abbreviation: {item.abbreviation}</div>
              )}
              {item.description && (
                <div className="text-sm text-gray-600">{item.description}</div>
              )}
            </div>
            <div className="space-x-2">
              <button
                onClick={() => {
                  setEditingItem(item.id);
                  const editData = {};
                  fields.forEach(field => editData[field] = item[field] || '');
                  setFormData(editData);
                }}
                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(type, item.id)}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'drugCategories':
        return renderDrugCategories();
      case 'drugNames':
        return renderDrugNames();
      case 'strengthUnits':
        return renderSimpleList(strengthUnits, 'strength-units', 'Strength Units', ['name', 'abbreviation']);
      case 'dosageForms':
        return renderSimpleList(dosageForms, 'dosage-forms', 'Dosage Forms', ['name', 'description']);
      case 'preparations':
        return renderSimpleList(preparations, 'preparations', 'Preparations', ['name', 'description']);
      case 'equipmentCategories':
        return renderSimpleList(equipmentCategories, 'equipment-categories', 'Equipment Categories', ['name', 'description']);
      case 'equipmentTypes':
        return renderEquipmentTypes();
      default:
        return null;
    }
  };

  const renderEquipmentTypes = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Equipment Types</h3>
        <button
          onClick={() => {
            setEditingItem('new');
            setFormData({ equipmentCategoryId: '', name: '', description: '' });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add New Equipment Type
        </button>
      </div>

      {editingItem === 'new' && (
        <div className="bg-gray-50 p-4 rounded border">
          <h4 className="font-medium mb-2">Add New Equipment Type</h4>
          <div className="grid grid-cols-3 gap-4">
            <select
              value={formData.equipmentCategoryId || ''}
              onChange={(e) => setFormData({ ...formData, equipmentCategoryId: e.target.value })}
              className="px-3 py-2 border rounded"
            >
              <option value="">Select Category</option>
              {equipmentCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Equipment Type Name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <input
              type="text"
              placeholder="Description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-3 py-2 border rounded"
            />
          </div>
          <div className="mt-3 space-x-2">
            <button
              onClick={() => handleCreate('equipment-types')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setFormData({});
              }}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {equipmentTypes.map((equipment) => {
          const category = equipmentCategories.find(cat => cat.id === equipment.equipment_category_id);
          return (
            <div key={equipment.id} className="flex items-center justify-between p-3 bg-white border rounded">
              <div>
                <div className="font-medium">{equipment.name}</div>
                <div className="text-sm text-gray-600">
                  Category: {category?.name} | {equipment.description}
                </div>
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => {
                    setEditingItem(equipment.id);
                    setFormData({ 
                      equipmentCategoryId: equipment.equipment_category_id, 
                      name: equipment.name, 
                      description: equipment.description 
                    });
                  }}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete('equipment-types', equipment.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Item Categorization Management</h1>

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

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setEditingItem(null);
                setFormData({});
                setError('');
                setSuccess('');
              }}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        renderTabContent()
      )}
    </div>
  );
};

export default ItemCategorizationAdmin;
