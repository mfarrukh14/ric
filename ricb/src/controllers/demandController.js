const { getDatabase } = require('../config/database');
const auditLogger = require('../utils/auditLogger');
const {
    getCategoryFieldDefinitions,
    getFieldValuesByItemIds,
    resolveSubmittedFieldValues,
    formatItemFields
} = require('../utils/itemFieldFormatter');

// Create a new demand with multiple items
const createDemand = async (req, res) => {
    const db = getDatabase();
    const { description, urgency, requiredBy, items } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!description || !requiredBy || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Description, required date and at least one item are required' });
    }

    // Validate each item, and validate its category's custom fields (if any).
    // Previous/current year costs are intentionally NOT collected here - store
    // fills those in during fulfillment, once real stock/pricing is known.
    // fieldDefsByItem is reused below so we don't re-query the definitions on insert.
    const fieldDefsByItem = [];
    for (const item of items) {
        // Basic validation for all items
        if (!item.categoryId || !item.quantity || !item.unit) {
            return res.status(400).json({ message: 'Each item must have category, quantity, and unit' });
        }
        if (item.quantity <= 0) {
            return res.status(400).json({ message: 'Quantity must be positive' });
        }

        const fieldDefs = await getCategoryFieldDefinitions(db, item.categoryId);

        if (fieldDefs.length > 0) {
            const fieldValues = item.fieldValues || {};
            for (const field of fieldDefs) {
                const raw = fieldValues[field.id];
                const hasValue = raw !== undefined && raw !== null && raw !== '';
                if (field.isRequired && !hasValue) {
                    return res.status(400).json({ message: `${field.label} is required` });
                }
                if (hasValue && field.fieldType === 'dropdown') {
                    const option = field.options.find(o => String(o.id) === String(raw));
                    if (!option) {
                        return res.status(400).json({ message: `Invalid selection for ${field.label}` });
                    }
                    if (field.dependsOnFieldId && String(option.parentOptionId) !== String(fieldValues[field.dependsOnFieldId])) {
                        return res.status(400).json({ message: `${field.label} selection does not match the selected parent option` });
                    }
                }
            }
        } else if (!item.itemNameId) {
            return res.status(400).json({ message: 'Item name is required' });
        }

        fieldDefsByItem.push(fieldDefs);
    }

    // Validate user is eligible for demand creation
    if (!req.user.eligible_for_demand_creation) {
        return res.status(403).json({ message: 'You are not eligible to create demands' });
    }

    try {
        // Total estimated cost starts at 0 - costs aren't collected at creation time,
        // store fills them in (prev/current year cost) during fulfillment.
        const totalEstimatedCost = items.reduce((sum, item) => sum + (parseFloat(item.currentYearCost) || 0), 0);

        // Resolve a display name for every item (used for demand_items.item_name, and for
        // the first item, the legacy demands.item_name column).
        const resolvedItems = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const fieldDefs = fieldDefsByItem[i];

            if (fieldDefs.length > 0) {
                const resolvedFields = resolveSubmittedFieldValues(fieldDefs, item.fieldValues || {});
                const formatted = formatItemFields(resolvedFields);
                resolvedItems.push({ item, itemName: formatted.name || 'Unknown Item' });
            } else {
                const itemNameData = await new Promise((resolve, reject) => {
                    db.get('SELECT name FROM item_names WHERE id = ?', [item.itemNameId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
                resolvedItems.push({ item, itemName: itemNameData?.name || 'Unknown Item' });
            }
        }

        if (!resolvedItems[0] || !resolvedItems[0].itemName || resolvedItems[0].itemName === 'Unknown Item') {
            return res.status(400).json({ message: 'Invalid item name selected for first item' });
        }

        // Check if user's department has an HOD to determine initial status
        const userInfo = await new Promise((resolve, reject) => {
            db.get(
                'SELECT department_id FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        let initialStatus = 'pending'; // Default: goes directly to store
        let hodStatus = null;

        // If user has a department, check if department has an HOD
        if (userInfo && userInfo.department_id) {
            const departmentHod = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT id FROM users WHERE department_id = ? AND is_hod = 1',
                    [userInfo.department_id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            // If department has an HOD, demand needs HOD approval first
            if (departmentHod) {
                initialStatus = 'pending_hod_approval';
                hodStatus = null; // NULL means waiting for HOD approval
            }
        }

        // Create main demand record (using first item as primary for backward compatibility)
        const demandResult = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demands (item_name, quantity, estimated_cost, description, urgency, required_by, created_by, status, hod_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [resolvedItems[0].itemName, items[0].quantity, totalEstimatedCost, description, urgency || 'normal', requiredBy, userId, initialStatus, hodStatus],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

        const demandId = demandResult.id;

        // Insert all items into demand_items table, then their custom field values (if any)
        for (let i = 0; i < resolvedItems.length; i++) {
            const { item, itemName } = resolvedItems[i];
            const fieldDefs = fieldDefsByItem[i];

            const demandItemResult = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demand_items (demand_id, item_name, quantity, estimated_cost, remarks, unit,
                     category_id, item_name_id, prev_year_cost, current_year_cost, specifications)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        demandId,
                        itemName,
                        item.quantity,
                        parseFloat(item.currentYearCost) || 0, // Use current year cost as estimated cost
                        item.remarks || null,
                        item.unit,
                        item.categoryId,
                        item.itemNameId || null,
                        parseFloat(item.prevYearCost) || 0,
                        parseFloat(item.currentYearCost) || 0,
                        item.specifications || null
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID });
                    }
                );
            });

            const fieldValues = item.fieldValues || {};
            for (const field of fieldDefs) {
                const raw = fieldValues[field.id];
                if (raw === undefined || raw === null || raw === '') continue;

                if (field.fieldType === 'dropdown') {
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO demand_item_field_values (demand_item_id, field_id, option_id) VALUES (?, ?, ?)',
                            [demandItemResult.id, field.id, raw],
                            (err) => err ? reject(err) : resolve()
                        );
                    });
                } else {
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO demand_item_field_values (demand_item_id, field_id, value_text) VALUES (?, ?, ?)',
                            [demandItemResult.id, field.id, String(raw)],
                            (err) => err ? reject(err) : resolve()
                        );
                    });
                }
            }
        }

        // Log demand creation
        await auditLogger.logDemandManagement(
            userId,
            req.user.role,
            req.user.name,
            'DEMAND_CREATED',
            demandId,
            `Items: ${items.length} | Total Cost: ${totalEstimatedCost} | Description: ${description}`,
            req
        );

        res.status(201).json({
            message: 'Demand created successfully',
            demandId: demandId,
            itemsCount: items.length
        });
    } catch (error) {
        console.error('Error creating demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demands for the current user with items
const getUserDemands = async (req, res) => {
    const db = getDatabase();
    const userId = req.user.id;

    try {
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, sr.name as store_response_by_name, hr.name as hod_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 LEFT JOIN users hr ON d.hod_response_by = hr.id
                 WHERE d.created_by = ? AND (d.is_merged IS NULL OR d.is_merged = 0)
                 ORDER BY d.created_at DESC`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get items for each demand
        for (const demand of demands) {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`,
                    [demand.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            demand.items = items;
        }

        res.json(demands);
    } catch (error) {
        console.error('Error fetching user demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all demands (for superadmin and store department users)
const getAllDemands = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user can view all demands
    const canViewAll = user.role === 'superadmin' || 
                      (user.department_name && user.department_name.toLowerCase() === 'store');

    if (!canViewAll) {
        return res.status(403).json({ message: 'You do not have permission to view all demands' });
    }

    try {
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department,
                        sr.name as store_response_by_name, hr.name as hod_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 LEFT JOIN users hr ON d.hod_response_by = hr.id
                 WHERE d.status != 'pending_hod_approval' AND d.is_merged != 1
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get items for each demand
        for (const demand of demands) {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM demand_items WHERE demand_id = ? ORDER BY id`,
                    [demand.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            demand.items = items;
        }

        res.json(demands);
    } catch (error) {
        console.error('Error fetching all demands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demand by ID
const getDemandById = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const user = req.user;

    try {
        const demand = await new Promise((resolve, reject) => {
            db.get(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department,
                        sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 WHERE d.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found' });
        }

        // Check if user can view this demand
        const canView = user.role === 'superadmin' || 
                       demand.created_by === user.id ||
                       (user.department_name && user.department_name.toLowerCase() === 'store') ||
                       (user.committee_name && user.committee_name.toLowerCase() === 'vetting committee') ||
                       (user.department_name && user.department_name.toLowerCase() === 'purchase');

        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to view this demand' });
        }

        res.json(demand);
    } catch (error) {
        console.error('Error fetching demand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get demand with items
const getDemandWithItems = async (req, res) => {
    const { id } = req.params;
    const db = getDatabase();

    try {
        // Get the demand
        const demand = await new Promise((resolve, reject) => {
            db.get(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE d.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found' });
        }

        // Get items for the demand along with their generic custom field values
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*,
                        ic.name as category_name,
                        in_t.name as item_name_full
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 WHERE di.demand_id = ?
                 ORDER BY di.id`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        const fieldValuesByItem = await getFieldValuesByItemIds(db, items.map(item => item.id));
        demand.items = items.map(item => {
            const formatted = formatItemFields(fieldValuesByItem[item.id] || []);
            return {
                ...item,
                custom_fields: formatted.fields,
                custom_field_description: formatted.description
            };
        });

        res.json(demand);
    } catch (error) {
        console.error('Error fetching demand with items:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all demands with their items for store management
const getAllDemandsWithItems = async (req, res) => {
    const db = getDatabase();

    try {
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 WHERE d.status IN ('pending', 'store_pending', 'available', 'not_available', 'vetting_pending', 'vetting_approved', 'purchase_pending', 'pending_hod_approval')
                 AND (d.is_merged IS NULL OR d.is_merged = 0)
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get items for each demand with category names
        for (let demand of demands) {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT di.*, 
                            ic.name as category_name,
                            in_t.name as item_name_full
                     FROM demand_items di
                     LEFT JOIN item_categories ic ON di.category_id = ic.id
                     LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                     WHERE di.demand_id = ? 
                     ORDER BY di.id ASC`,
                    [demand.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
            demand.items = items;
        }

        res.json(demands);
    } catch (error) {
        console.error('Get all demands with items error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Reject demand with reason
const rejectDemand = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const { reason } = req.body;
    const rejectedBy = req.user?.id || 1; // Get from auth middleware

    try {
        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: 'Rejection reason is required' });
        }

        // Check if demand exists
        const demand = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, user_id, status FROM demands WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found' });
        }

        // Update demand status to rejected
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE demands 
                 SET status = 'rejected', 
                     rejection_reason = ?, 
                     rejected_by = ?, 
                     rejected_at = datetime('now') 
                 WHERE id = ?`,
                [reason.trim(), rejectedBy, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Add to demand evaluations table for tracking
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demand_evaluations 
                 (demand_id, evaluator_id, committee_type, status, comments) 
                 VALUES (?, ?, 'purchase', 'rejected', ?)`,
                [id, rejectedBy, reason.trim()],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`Demand ${id} rejected by user ${rejectedBy} with reason: ${reason}`);

        // Log demand rejection
        await auditLogger.logDemandManagement(
            rejectedBy,
            req.user.role,
            req.user.name,
            'DEMAND_REJECTED',
            id,
            `Reason: ${reason}`,
            req
        );

        res.json({ 
            message: 'Demand rejected successfully',
            demandId: id,
            status: 'rejected'
        });

    } catch (error) {
        console.error('Error rejecting demand:', error);
        res.status(500).json({ 
            message: 'Failed to reject demand', 
            error: error.message 
        });
    }
};

// Get demand items with pagination
const getDemandItemsPaginated = async (req, res) => {
    const db = getDatabase();
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    try {
        // Get total count
        const totalCount = await new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as count FROM demand_items WHERE demand_id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });

        // Get paginated items with category info
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*,
                        ic.name as category_name,
                        in_t.name as item_name_full
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 WHERE di.demand_id = ?
                 ORDER BY di.id ASC
                 LIMIT ? OFFSET ?`,
                [id, limit, offset],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Format items for frontend, attaching each item's generic custom field values
        const fieldValuesByItem = await getFieldValuesByItemIds(db, items.map(item => item.id));
        const formattedItems = items.map(item => {
            const formatted = formatItemFields(fieldValuesByItem[item.id] || []);
            return {
                id: item.id,
                name: item.item_name || item.item_name_full || formatted.name || 'Unknown Item',
                category: item.category_name || 'Unknown Category',
                quantity: item.quantity,
                unit: item.unit,
                specifications: item.specifications,
                estimated_cost: item.current_year_cost,
                prev_year_cost: item.prev_year_cost,
                custom_fields: formatted.fields
            };
        });

        res.json({
            items: formattedItems,
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit)
        });

    } catch (error) {
        console.error('Error fetching demand items:', error);
        res.status(500).json({ 
            message: 'Failed to fetch demand items', 
            error: error.message 
        });
    }
};

// Generate Excel report for demand
const generateDemandExcelReport = async (req, res) => {
    console.log(`[EXCEL REPORT] Function called for demand ID: ${req.params.id} by user: ${req.user?.name || 'unknown'}`);
    const db = getDatabase();
    const { id } = req.params;

    try {
        // Get demand details
        const demand = await new Promise((resolve, reject) => {
            db.get(
                `SELECT d.*, u.name as created_by_name, u.department_id, dept.name as creator_department
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE d.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demand) {
            return res.status(404).json({ message: 'Demand not found' });
        }

        // Get demand items with category info
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*,
                        ic.name as category_name,
                        in_t.name as item_name_full
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 WHERE di.demand_id = ?
                 ORDER BY di.id ASC`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Use the Excel report generator
        const { generateDemandReport } = require('../utils/excelReportGenerator');

        const fieldValuesByItem = await getFieldValuesByItemIds(db, items.map(item => item.id));

        const reportData = {
            demand: {
                id: demand.id,
                description: demand.description,
                urgency: demand.urgency,
                required_by: demand.required_by,
                status: demand.status,
                created_by: demand.created_by_name,
                department: demand.department,
                created_at: demand.created_at
            },
            items: items.map(item => {
                const formatted = formatItemFields(fieldValuesByItem[item.id] || []);
                return {
                    name: item.item_name_full || item.item_name || formatted.name,
                    category: item.category_name,
                    quantity: item.quantity,
                    unit: item.unit,
                    specifications: item.specifications,
                    // Costs: fall back to legacy estimated_cost if specific year costs absent
                    previous_year_cost: item.previous_year_cost || item.prev_year_cost || 0,
                    current_year_cost: item.current_year_cost || item.estimated_cost || 0,
                    // Generic category custom fields (e.g. Drug Name, Strength, Equipment Type)
                    custom_fields: formatted.fields,
                    consumption_amount: item.consumption_amount,
                    consumption_type: item.consumption_type
                };
            })
        };

        // Debug log to verify mapped data before Excel generation
        try {
            console.log('[DEBUG] Demand Excel report data preview:', JSON.stringify({
                demandId: reportData.demand.id,
                itemSample: reportData.items.slice(0,5)
            }, null, 2));
        } catch (e) {
            console.warn('[DEBUG] Failed to stringify reportData preview:', e.message);
        }

        const buffer = await generateDemandReport(reportData);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Demand_${id}_Annual_Report.xlsx"`);
        res.send(buffer);

    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ 
            message: 'Failed to generate Excel report', 
            error: error.message 
        });
    }
};

// HOD Approval Functions
const getHodPendingDemands = async (req, res) => {
    const db = getDatabase();
    const hodUserId = req.user.id;
    
    try {
        // Get HOD's department
        const hodInfo = await new Promise((resolve, reject) => {
            db.get(
                'SELECT department_id FROM users WHERE id = ? AND is_hod = 1',
                [hodUserId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!hodInfo) {
            console.log('HOD authorization failed for user:', hodUserId);
            return res.status(403).json({ error: 'You are not authorized as an HOD' });
        }

        console.log('HOD Department ID:', hodInfo.department_id);

        // Get all pending demands from HOD's department
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as creator_name, dept.name as department_name
                 FROM demands d
                 JOIN users u ON d.created_by = u.id
                 JOIN departments dept ON u.department_id = dept.id
                 WHERE u.department_id = ? AND d.status = 'pending_hod_approval' AND d.hod_status IS NULL AND (d.is_merged IS NULL OR d.is_merged != 1)
                 ORDER BY d.created_at DESC`,
                [hodInfo.department_id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        console.log('Found pending demands for HOD:', demands.length);
        res.json(demands);
    } catch (error) {
        console.error('Error fetching HOD pending demands:', error);
        res.status(500).json({ error: 'Error fetching pending demands' });
    }
};

const approveRejectDemandByHod = async (req, res) => {
    // This is the FIRST approval stage - the requester's own department HOD
    // approving the demand request itself, before store has looked at it.
    // If approved, it goes to Store for fulfillment review. Store fulfillment
    // approval (purchase vs. available) is decided later by the Store HOD via
    // approveStoreFulfillmentByHod, not here.
    const { demandId, action, rejectionReason } = req.body;
    const hodUserId = req.user.id;
    const db = getDatabase();
    
    if (!demandId || !action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Demand ID and valid action (approve/reject) are required' });
    }

    if (action === 'reject' && !rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required when rejecting a demand' });
    }

    try {
        // Verify HOD has authority over this demand
        const demandInfo = await new Promise((resolve, reject) => {
            db.get(
                `SELECT d.*, u.department_id, u.name as creator_name
                 FROM demands d
                 JOIN users u ON d.created_by = u.id
                 WHERE d.id = ? AND d.status = 'pending_hod_approval' AND d.hod_status IS NULL`,
                [demandId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!demandInfo) {
            return res.status(404).json({ error: 'Demand not found or not pending HOD approval' });
        }

        // Verify user is HOD of the department
        const hodInfo = await new Promise((resolve, reject) => {
            db.get(
                'SELECT department_id FROM users WHERE id = ? AND is_hod = 1 AND department_id = ?',
                [hodUserId, demandInfo.department_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!hodInfo) {
            return res.status(403).json({ error: 'You are not authorized to approve/reject this demand' });
        }

        // Update demand status based on action
        if (action === 'reject') {
            // If HOD rejects, set status to hod_rejected
            const newStatus = 'hod_rejected';
            const hodStatus = 'rejected';

            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = ?, 
                     hod_status = ?, 
                     hod_response_by = ?, 
                     hod_response_at = CURRENT_TIMESTAMP,
                     hod_rejection_reason = ?
                     WHERE id = ?`,
                    [newStatus, hodStatus, hodUserId, rejectionReason, demandId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        } else {
            // HOD approved the demand request - send it to Store for fulfillment
            // review. Store has not looked at the items yet at this stage, so
            // status must NOT be derived from store_fulfilled here (that would
            // always be 0/unset and incorrectly skip straight to Purchase).
            const demandStatus = 'pending';
            const hodStatus = 'approved';

            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE demands SET 
                     status = ?, 
                     hod_status = ?, 
                     hod_response_by = ?, 
                     hod_response_at = CURRENT_TIMESTAMP,
                     hod_rejection_reason = ?
                     WHERE id = ?`,
                    [demandStatus, hodStatus, hodUserId, null, demandId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        // Log the action with the correct status
        const finalStatus = action === 'reject' ? 'hod_rejected' : 
                           (await new Promise((resolve, reject) => {
                               db.get('SELECT status FROM demands WHERE id = ?', [demandId], (err, row) => {
                                   if (err) reject(err);
                                   else resolve(row?.status);
                               });
                           }));

        await auditLogger.logDemandManagement(
            hodUserId,
            req.user.role,
            req.user.name,
            action === 'approve' ? 'HOD_DEMAND_APPROVED' : 'HOD_DEMAND_REJECTED',
            {
                id: demandId,
                status: finalStatus,
                department: demandInfo.department_id,
                title: demandInfo.item_name,
                creator: demandInfo.creator_name,
                rejectionReason: action === 'reject' ? rejectionReason : null
            },
            req
        );

        res.json({ message: `Demand ${action}d successfully` });
    } catch (error) {
        console.error(`Error ${action}ing demand:`, error);
        res.status(500).json({ error: `Error ${action}ing demand` });
    }
};

module.exports = {
    createDemand,
    getUserDemands,
    getAllDemands,
    getDemandById,
    getDemandWithItems,
    getAllDemandsWithItems,
    rejectDemand,
    getDemandItemsPaginated,
    generateDemandExcelReport,
    getHodPendingDemands,
    approveRejectDemandByHod
};
