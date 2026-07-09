import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Package,
  X
} from 'lucide-react';
import {
  getItemCategories,
  createItemCategory,
  updateItemCategory,
  deleteItemCategory,
  getCategoryFields,
  createCategoryField,
  updateCategoryField,
  deleteCategoryField,
  createFieldOption,
  updateFieldOption,
  deleteFieldOption
} from '../../config/api';

const FIELD_TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  dropdown: 'Dropdown'
};

const emptyFieldForm = () => ({
  label: '',
  fieldType: 'text',
  isRequired: true,
  dependsOnFieldId: '',
  options: []
});

const UnifiedItemManagement = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [fieldsByCategory, setFieldsByCategory] = useState({});
  const [fieldsLoading, setFieldsLoading] = useState(false);

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });

  // Field modal
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [fieldModalCategoryId, setFieldModalCategoryId] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [fieldForm, setFieldForm] = useState(emptyFieldForm());
  const [fieldFormError, setFieldFormError] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(t);
  }, [success]);

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getItemCategories();
      setCategories(data);
    } catch (err) {
      console.error('Error loading categories:', err);
      setError('Failed to load item categories');
    } finally {
      setLoading(false);
    }
  };

  const loadFieldsForCategory = async (categoryId) => {
    setFieldsLoading(true);
    try {
      const fields = await getCategoryFields(categoryId);
      setFieldsByCategory(prev => ({ ...prev, [categoryId]: fields }));
    } catch (err) {
      console.error('Error loading fields:', err);
      setError('Failed to load fields for this category');
    } finally {
      setFieldsLoading(false);
    }
  };

  const toggleCategory = (categoryId) => {
    if (expandedCategoryId === categoryId) {
      setExpandedCategoryId(null);
      return;
    }
    setExpandedCategoryId(categoryId);
    if (!fieldsByCategory[categoryId]) {
      loadFieldsForCategory(categoryId);
    }
  };

  // ---- Category CRUD ----

  const openCategoryModal = (category = null) => {
    setEditingCategory(category);
    setCategoryForm(category ? { name: category.name, description: category.description || '' } : { name: '', description: '' });
    setShowCategoryModal(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      setError('Category name is required');
      return;
    }
    try {
      if (editingCategory) {
        await updateItemCategory(editingCategory.id, categoryForm);
        setSuccess('Category updated successfully');
      } else {
        await createItemCategory(categoryForm);
        setSuccess('Category created successfully');
      }
      setShowCategoryModal(false);
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save category');
    }
  };

  const removeCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"? This also removes its fields.`)) return;
    try {
      await deleteItemCategory(category.id);
      setSuccess('Category deleted successfully');
      if (expandedCategoryId === category.id) setExpandedCategoryId(null);
      loadCategories();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete category');
    }
  };

  // ---- Field CRUD ----

  const openFieldModal = (categoryId, field = null) => {
    setFieldModalCategoryId(categoryId);
    setEditingField(field);
    setFieldFormError('');
    if (field) {
      setFieldForm({
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        dependsOnFieldId: field.dependsOnFieldId || '',
        options: field.options.map(o => ({ id: o.id, value: o.value, parentOptionId: o.parentOptionId || '' }))
      });
    } else {
      setFieldForm(emptyFieldForm());
    }
    setShowFieldModal(true);
  };

  const existingFields = fieldModalCategoryId ? (fieldsByCategory[fieldModalCategoryId] || []) : [];
  const dropdownFieldsForDependency = existingFields.filter(
    f => f.fieldType === 'dropdown' && (!editingField || f.id !== editingField.id)
  );
  const dependsOnField = fieldForm.dependsOnFieldId
    ? existingFields.find(f => String(f.id) === String(fieldForm.dependsOnFieldId))
    : null;

  const addOptionRow = () => {
    setFieldForm(prev => ({
      ...prev,
      options: [...prev.options, { value: '', parentOptionId: dependsOnField?.options?.[0]?.id || '' }]
    }));
  };

  const updateOptionRow = (index, patch) => {
    setFieldForm(prev => ({
      ...prev,
      options: prev.options.map((o, i) => (i === index ? { ...o, ...patch } : o))
    }));
  };

  // Changing which field this one depends on invalidates every existing option's
  // parent mapping (it pointed at the old parent's options), so force reassignment.
  const handleDependsOnChange = (newDependsOnFieldId) => {
    setFieldForm(prev => ({
      ...prev,
      dependsOnFieldId: newDependsOnFieldId,
      options: prev.options.map(o => ({ ...o, parentOptionId: '' }))
    }));
  };

  const removeOptionRow = async (index) => {
    const option = fieldForm.options[index];
    if (option.id) {
      if (!window.confirm('Delete this option?')) return;
      try {
        await deleteFieldOption(option.id);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to delete option (it may already be in use on a demand)');
        return;
      }
    }
    setFieldForm(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
  };

  const saveField = async () => {
    setFieldFormError('');

    if (!fieldForm.label.trim()) {
      setFieldFormError('Field label is required');
      return;
    }
    if (fieldForm.fieldType === 'dropdown') {
      if (fieldForm.options.length === 0) {
        setFieldFormError('Dropdown fields require at least one option');
        return;
      }
      if (fieldForm.options.some(o => !o.value.trim())) {
        setFieldFormError('All options must have a value');
        return;
      }
      if (fieldForm.dependsOnFieldId && fieldForm.options.some(o => !o.parentOptionId)) {
        setFieldFormError('Every option must specify which parent option it belongs to');
        return;
      }
    }

    try {
      if (editingField) {
        await updateCategoryField(editingField.id, {
          label: fieldForm.label,
          isRequired: fieldForm.isRequired,
          dependsOnFieldId: fieldForm.fieldType === 'dropdown' ? (fieldForm.dependsOnFieldId || null) : null
        });

        for (const option of fieldForm.options) {
          if (option.id) {
            await updateFieldOption(option.id, {
              value: option.value,
              parentOptionId: option.parentOptionId || null
            });
          } else {
            await createFieldOption(editingField.id, {
              value: option.value,
              parentOptionId: option.parentOptionId || null
            });
          }
        }
        setSuccess('Field updated successfully');
      } else {
        await createCategoryField(fieldModalCategoryId, {
          label: fieldForm.label,
          fieldType: fieldForm.fieldType,
          isRequired: fieldForm.isRequired,
          dependsOnFieldId: fieldForm.dependsOnFieldId || null,
          options: fieldForm.fieldType === 'dropdown'
            ? fieldForm.options.map(o => ({ value: o.value, parentOptionId: o.parentOptionId || null }))
            : undefined
        });
        setSuccess('Field created successfully');
      }
      setShowFieldModal(false);
      loadFieldsForCategory(fieldModalCategoryId);
    } catch (err) {
      setFieldFormError(err.response?.data?.message || 'Failed to save field');
    }
  };

  const removeField = async (categoryId, field) => {
    if (!window.confirm(`Delete field "${field.label}"?`)) return;
    try {
      await deleteCategoryField(field.id);
      setSuccess('Field deleted successfully');
      loadFieldsForCategory(categoryId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete field');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Unified Item Management</h1>
          <p className="text-gray-600">Create item categories and define the fields users fill in when requesting items in each one.</p>
        </div>
        <button
          onClick={() => openCategoryModal()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Category</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="text-center py-20 text-gray-500 border-2 border-dashed rounded-lg">
          <Package className="mx-auto h-12 w-12 mb-4 text-gray-300" />
          <p className="mb-4">No categories yet. Add your first item category to get started.</p>
          <button
            onClick={() => openCategoryModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Category</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map(category => {
            const isExpanded = expandedCategoryId === category.id;
            const fields = fieldsByCategory[category.id] || [];

            return (
              <div key={category.id} className="bg-white rounded-lg border">
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="flex items-center space-x-3 text-left flex-1"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{category.name}</h3>
                      {category.description && <p className="text-sm text-gray-500">{category.description}</p>}
                    </div>
                  </button>
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => openFieldModal(category.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Field</span>
                    </button>
                    <button
                      onClick={() => openCategoryModal(category)}
                      className="p-2 text-yellow-600 hover:bg-yellow-50 rounded"
                      title="Edit category"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeCategory(category)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Delete category"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-gray-50">
                    {fieldsLoading && !fieldsByCategory[category.id] ? (
                      <p className="text-sm text-gray-500">Loading fields...</p>
                    ) : fields.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No fields yet. Click "Add Field" to define what information users must provide for this category.</p>
                    ) : (
                      <div className="space-y-2">
                        {fields.map(field => (
                          <div key={field.id} className="bg-white border rounded p-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center flex-wrap gap-2">
                                  <span className="font-medium text-gray-900">{field.label}</span>
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                    {FIELD_TYPE_LABELS[field.fieldType]}
                                  </span>
                                  {field.isRequired && (
                                    <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded">Required</span>
                                  )}
                                  {field.dependsOnFieldId && (
                                    <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded">
                                      Depends on: {fields.find(f => f.id === field.dependsOnFieldId)?.label || '...'}
                                    </span>
                                  )}
                                </div>
                                {field.fieldType === 'dropdown' && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {field.options.map(o => (
                                      <span key={o.id} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                        {o.value}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  onClick={() => openFieldModal(category.id, field)}
                                  className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded"
                                  title="Edit field"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => removeField(category.id, field)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  title="Delete field"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingCategory ? 'Edit Category' : 'Add Category'}</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Pharmaceuticals"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 mt-6">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={saveCategory} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                {editingCategory ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Modal */}
      {showFieldModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingField ? 'Edit Field' : 'Add Field'}</h3>
              <button onClick={() => setShowFieldModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {fieldFormError && (
              <div className="mb-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                {fieldFormError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Field Label *</label>
                <input
                  type="text"
                  value={fieldForm.label}
                  onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Drug Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Field Type *</label>
                <select
                  value={fieldForm.fieldType}
                  onChange={(e) => setFieldForm({ ...fieldForm, fieldType: e.target.value, dependsOnFieldId: '', options: [] })}
                  disabled={!!editingField}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="dropdown">Dropdown</option>
                </select>
                {editingField && <p className="text-xs text-gray-500 mt-1">Field type can't be changed after creation.</p>}
              </div>

              <div className="flex items-center">
                <input
                  id="fieldRequired"
                  type="checkbox"
                  checked={fieldForm.isRequired}
                  onChange={(e) => setFieldForm({ ...fieldForm, isRequired: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="fieldRequired" className="ml-2 text-sm text-gray-700">Required when creating a demand</label>
              </div>

              {fieldForm.fieldType === 'dropdown' && dropdownFieldsForDependency.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Depends on another field? (optional)
                  </label>
                  <select
                    value={fieldForm.dependsOnFieldId}
                    onChange={(e) => handleDependsOnChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None - independent dropdown</option>
                    {dropdownFieldsForDependency.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {dependsOnField
                      ? `Each option below must belong to one of ${dependsOnField.label}'s options. Changing this resets existing options' parent mapping.`
                      : 'If set, each option below only shows up once the matching parent option is selected (like Drug Name depending on Drug Category).'}
                  </p>
                </div>
              )}

              {fieldForm.fieldType === 'dropdown' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Options * (at least 1 required)</label>
                    <button
                      type="button"
                      onClick={addOptionRow}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Option</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {fieldForm.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={option.value}
                          onChange={(e) => updateOptionRow(index, { value: e.target.value })}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                          placeholder="Option value"
                        />
                        {dependsOnField && (
                          <select
                            value={option.parentOptionId}
                            onChange={(e) => updateOptionRow(index, { parentOptionId: e.target.value })}
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                          >
                            <option value="">Belongs to...</option>
                            {dependsOnField.options.map(po => (
                              <option key={po.id} value={po.id}>{po.value}</option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => removeOptionRow(index)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {fieldForm.options.length === 0 && (
                      <p className="text-xs text-gray-500 italic">No options added yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button onClick={() => setShowFieldModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={saveField} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                {editingField ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedItemManagement;
