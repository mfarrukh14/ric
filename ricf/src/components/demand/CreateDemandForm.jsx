import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash } from '@phosphor-icons/react';
import api, { getItemCategories, getItemNamesByCategory, getCategoryFields } from '../../config/api';
import { todayInPakistan } from '../../lib/time';
import { toast } from '../../lib/notify';
import { Button, Notice, PageHeader, Panel, cx } from '../../ui';
import './demand.css';

const STEPS = ['Description', 'Items', 'Details'];

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
        // YYYY-MM-DD strings compare as dates; "today" is the Pakistan calendar day.
        if (formData.requiredBy < todayInPakistan()) {
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
      await api.post('/demands', formData);
      toast.success('Demand submitted');
      navigate('/demands');
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to create demand');
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
    const inputClass = 'ui-input';
    const invalid = errors[errorKey] ? true : undefined;

    if (field.fieldType === 'text') {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleFieldValueChange(index, item.categoryId, field.id, e.target.value)}
          className={inputClass}
          aria-invalid={invalid}
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
          aria-invalid={invalid}
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
        className={inputClass}
        aria-invalid={invalid}
      >
        <option value="">{isBlockedByParent ? '—' : 'Select'}</option>
        {options.map(option => (
          <option key={option.id} value={option.id}>{option.value}</option>
        ))}
      </select>
    );
  };

  // Only offer categories an admin has actually finished configuring (i.e. has
  // at least one field defined) - a category with nothing to select isn't usable yet.
  const selectableCategories = categories.filter((category) => (category.field_count || 0) > 0);

  const fieldError = (key) => errors[key] && <span className="ui-field__error">{errors[key]}</span>;

  return (
    <div className="demand-form">
      <PageHeader title="New demand" actions={<Button onClick={() => navigate('/demands')}>Cancel</Button>} />

      <ol className="demand-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} data-state={currentStep === i + 1 ? 'current' : currentStep > i + 1 ? 'done' : 'todo'}>
            <span className="demand-steps__n">{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {error && <Notice tone="danger">{error}</Notice>}

      <form onSubmit={currentStep === 3 ? handleSubmit : (e) => e.preventDefault()}>
        {currentStep === 1 && (
          <Panel>
            <label className="ui-field">
              <span className="ui-label">Description</span>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={5}
                className="ui-input ui-textarea"
                aria-invalid={errors.description ? true : undefined}
                autoFocus
              />
              {fieldError('description')}
            </label>
          </Panel>
        )}

        {currentStep === 2 && (
          <div className="demand-items">
            {formData.items.map((item, index) => {
              const fields = fieldsByCategory[item.categoryId] || [];
              const err = (name) => errors[`item_${index}_${name}`];
              return (
                <Panel
                  key={index}
                  title={`Item ${index + 1}`}
                  actions={formData.items.length > 1 && (
                    <Button size="sm" variant="ghost" className="demand-remove" icon={<Trash size={15} />} aria-label={`Remove item ${index + 1}`} title="Remove item" onClick={() => removeItem(index)} />
                  )}
                >
                  <div className="demand-grid">
                    <label className="ui-field">
                      <span className="ui-label">Category</span>
                      <select className="ui-input" value={item.categoryId} aria-invalid={err('categoryId') ? true : undefined} onChange={(e) => handleItemChange(index, 'categoryId', e.target.value)}>
                        <option value="">Select</option>
                        {selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      {fieldError(`item_${index}_categoryId`)}
                      {selectableCategories.length === 0 && <span className="ui-hint">No categories are set up yet.</span>}
                    </label>

                    {item.categoryId && fields.length === 0 && (
                      <label className="ui-field">
                        <span className="ui-label">Item</span>
                        <select className="ui-input" value={item.itemNameId} aria-invalid={err('itemNameId') ? true : undefined} onChange={(e) => handleItemChange(index, 'itemNameId', e.target.value)}>
                          <option value="">Select</option>
                          {(itemNamesByCategory[item.categoryId] || []).map((itemName) => <option key={itemName.id} value={itemName.id}>{itemName.name}</option>)}
                        </select>
                        {fieldError(`item_${index}_itemNameId`)}
                      </label>
                    )}

                    {item.categoryId && fields.map((field) => (
                      <label key={field.id} className="ui-field">
                        <span className="ui-label">{field.label}{field.isRequired ? '' : ' (optional)'}</span>
                        {renderCustomField(item, index, field)}
                        {fieldError(`item_${index}_field_${field.id}`)}
                      </label>
                    ))}

                    <label className="ui-field">
                      <span className="ui-label">Quantity</span>
                      <input type="number" min="1" className="ui-input" value={item.quantity} aria-invalid={err('quantity') ? true : undefined} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} />
                      {fieldError(`item_${index}_quantity`)}
                    </label>

                    <label className="ui-field">
                      <span className="ui-label">Unit</span>
                      <select className="ui-input" value={item.unit} onChange={(e) => handleItemChange(index, 'unit', e.target.value)}>
                        {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                      {fieldError(`item_${index}_unit`)}
                    </label>

                    <label className="ui-field demand-grid__wide">
                      <span className="ui-label">Specifications</span>
                      <textarea rows={3} className="ui-input ui-textarea" value={item.specifications} aria-invalid={err('specifications') ? true : undefined} onChange={(e) => handleItemChange(index, 'specifications', e.target.value)} />
                      {fieldError(`item_${index}_specifications`)}
                    </label>

                    <label className="ui-field demand-grid__wide">
                      <span className="ui-label">Remarks (optional)</span>
                      <input type="text" className="ui-input" value={item.remarks} onChange={(e) => handleItemChange(index, 'remarks', e.target.value)} />
                    </label>
                  </div>
                </Panel>
              );
            })}
            <Button icon={<Plus size={15} weight="bold" />} onClick={addItem} className="demand-add">Add item</Button>
          </div>
        )}

        {currentStep === 3 && (
          <Panel>
            <div className="demand-grid">
              <label className="ui-field">
                <span className="ui-label">Urgency</span>
                <select name="urgency" className="ui-input" value={formData.urgency} onChange={handleChange}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="ui-field">
                <span className="ui-label">Required by</span>
                <input type="date" name="requiredBy" className="ui-input" value={formData.requiredBy} min={todayInPakistan()} aria-invalid={errors.requiredBy ? true : undefined} onChange={handleChange} />
                {fieldError('requiredBy')}
              </label>
            </div>
            <dl className="demand-summary">
              <div><dt>Description</dt><dd>{formData.description}</dd></div>
              <div><dt>Items</dt><dd>{formData.items.length}</dd></div>
            </dl>
          </Panel>
        )}

        <div className={cx('demand-nav', currentStep === 1 && 'demand-nav--end')}>
          {currentStep > 1 && <Button onClick={handlePreviousStep}>Back</Button>}
          {currentStep < 3 ? (
            <Button variant="primary" onClick={handleNextStep}>Next</Button>
          ) : (
            <Button variant="primary" type="submit" loading={loading}>Submit demand</Button>
          )}
        </div>
      </form>
    </div>
  );
};

export default CreateDemandForm;
