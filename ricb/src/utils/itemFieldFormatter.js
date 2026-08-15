// Shared helper for reading/formatting the generic per-category custom field
// values attached to demand_items (replaces the old hardcoded pharma/equipment
// column + JOIN + isPharmaCategory/isEquipmentCategory logic that used to be
// duplicated across demandController, technicalEvaluationController,
// tenderController, vettingController, demandMergeController, etc.

const dbAll = (db, sqlText, params = []) => new Promise((resolve, reject) => {
    db.all(sqlText, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});

// Fetch the custom field definitions (with nested options) configured for a category.
// Returns: [{ id, categoryId, label, fieldType, dependsOnFieldId, isRequired, displayOrder,
//              options: [{ id, value, parentOptionId }] }]
const getCategoryFieldDefinitions = async (db, categoryId) => {
    const fields = await dbAll(db,
        'SELECT * FROM category_fields WHERE category_id = ? ORDER BY display_order, id',
        [categoryId]
    );

    const fieldIds = fields.map(f => f.id);
    let optionsByField = {};
    if (fieldIds.length > 0) {
        const placeholders = fieldIds.map(() => '?').join(',');
        const options = await dbAll(db,
            `SELECT * FROM category_field_options WHERE field_id IN (${placeholders}) ORDER BY display_order, id`,
            fieldIds
        );
        optionsByField = options.reduce((acc, opt) => {
            (acc[opt.field_id] = acc[opt.field_id] || []).push({
                id: opt.id,
                value: opt.value,
                parentOptionId: opt.parent_option_id
            });
            return acc;
        }, {});
    }

    return fields.map(f => ({
        id: f.id,
        categoryId: f.category_id,
        label: f.label,
        fieldType: f.field_type,
        dependsOnFieldId: f.depends_on_field_id,
        isRequired: !!f.is_required,
        displayOrder: f.display_order,
        options: optionsByField[f.id] || []
    }));
};

// Resolve raw submitted { [fieldId]: rawValue } into display-ready entries
// (dropdown values resolved to their option's text) for a set of field definitions.
const resolveSubmittedFieldValues = (fieldDefs, fieldValues) => {
    const resolved = [];
    for (const field of fieldDefs) {
        const raw = fieldValues ? fieldValues[field.id] : undefined;
        if (raw === undefined || raw === null || raw === '') continue;

        let value;
        if (field.fieldType === 'dropdown') {
            const option = field.options.find(o => String(o.id) === String(raw));
            if (!option) continue;
            value = option.value;
        } else {
            value = String(raw);
        }

        resolved.push({
            fieldId: field.id,
            label: field.label,
            fieldType: field.fieldType,
            displayOrder: field.displayOrder,
            dependsOnFieldId: field.dependsOnFieldId,
            value
        });
    }
    return resolved;
};

// Fetch generic custom-field values for a set of demand_items, grouped by demand_item_id.
// Returns: { [demandItemId]: [{ fieldId, label, fieldType, displayOrder, dependsOnFieldId, value }] }
const getFieldValuesByItemIds = async (db, demandItemIds) => {
    const ids = (demandItemIds || []).filter(id => id !== null && id !== undefined);
    if (ids.length === 0) return {};

    const placeholders = ids.map(() => '?').join(',');
    const rows = await dbAll(db, `
        SELECT
            v.demand_item_id AS demandItemId,
            v.field_id AS fieldId,
            v.value_text AS valueText,
            v.option_id AS optionId,
            f.label AS label,
            f.field_type AS fieldType,
            f.display_order AS displayOrder,
            f.depends_on_field_id AS dependsOnFieldId,
            o.value AS optionValue
        FROM demand_item_field_values v
        JOIN category_fields f ON v.field_id = f.id
        LEFT JOIN category_field_options o ON v.option_id = o.id
        WHERE v.demand_item_id IN (${placeholders})
        ORDER BY v.demand_item_id, f.display_order, f.id
    `, ids);

    const grouped = {};
    for (const row of rows) {
        const value = row.fieldType === 'dropdown' ? row.optionValue : row.valueText;
        if (value === null || value === undefined || value === '') continue;
        (grouped[row.demandItemId] = grouped[row.demandItemId] || []).push({
            fieldId: row.fieldId,
            label: row.label,
            fieldType: row.fieldType,
            displayOrder: row.displayOrder,
            dependsOnFieldId: row.dependsOnFieldId,
            value
        });
    }
    return grouped;
};

// Given the custom field values for ONE item, pick a human-readable "name"
// (the most specific dropdown value, e.g. Drug Name rather than Drug Category)
// and build a full "description" listing every field as "Label: value".
const formatItemFields = (fields) => {
    if (!fields || fields.length === 0) {
        return { name: null, description: null, fields: [] };
    }

    const byId = {};
    fields.forEach(f => { byId[f.fieldId] = f; });

    const depthCache = {};
    const depthOf = (field) => {
        if (depthCache[field.fieldId] !== undefined) return depthCache[field.fieldId];
        if (!field.dependsOnFieldId || !byId[field.dependsOnFieldId]) {
            depthCache[field.fieldId] = 0;
            return 0;
        }
        const d = 1 + depthOf(byId[field.dependsOnFieldId]);
        depthCache[field.fieldId] = d;
        return d;
    };

    const sortedByDepth = [...fields].sort((a, b) => depthOf(b) - depthOf(a) || a.displayOrder - b.displayOrder);
    const nameField = sortedByDepth[0];

    const orderedFields = fields.slice().sort((a, b) => a.displayOrder - b.displayOrder);
    const description = orderedFields.map(f => `${f.label}: ${f.value}`).join(', ');

    return {
        name: nameField ? nameField.value : null,
        description,
        fields: orderedFields.map(f => ({ label: f.label, value: f.value }))
    };
};

module.exports = {
    getCategoryFieldDefinitions,
    resolveSubmittedFieldValues,
    getFieldValuesByItemIds,
    formatItemFields
};
