const { getDatabase } = require('../config/database');
const auditLogger = require('../utils/auditLogger');

// Create a new demand with multiple items
const createDemand = async (req, res) => {
    const db = getDatabase();
    const { description, urgency, requiredBy, items } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!description || !requiredBy || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Description, required date and at least one item are required' });
    }

    // Validate each item based on category type
    for (const item of items) {
        // Basic validation for all items
        if (!item.categoryId || !item.quantity || !item.unit || 
            (!item.prevYearCost && item.prevYearCost !== 0) || (!item.currentYearCost && item.currentYearCost !== 0)) {
            return res.status(400).json({ message: 'Each item must have category, quantity, unit, and both year costs' });
        }
        if (item.quantity <= 0 || item.prevYearCost < 0 || item.currentYearCost < 0) {
            return res.status(400).json({ message: 'Quantity must be positive and costs cannot be negative' });
        }

        // Category-specific validation
        // Get category info to determine validation rules
        const categoryInfo = await new Promise((resolve, reject) => {
            db.get(
                'SELECT name FROM item_categories WHERE id = ?',
                [item.categoryId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const categoryName = categoryInfo?.name?.toLowerCase() || '';
        const isPharmaCategory = categoryName.includes('pharmaceutical') || categoryName.includes('medicine') || categoryName.includes('drug');
        const isEquipmentCategory = categoryName.includes('equipment') || categoryName.includes('machinery');

        // Pharmaceutical items validation
        if (isPharmaCategory) {
            if (!item.drugCategoryId || !item.drugNameId || !item.strengthValue || !item.strengthUnitId || !item.dosageFormId) {
                return res.status(400).json({ 
                    message: 'Pharmaceutical items must have drug category, drug name, strength, strength unit, and dosage form' 
                });
            }
        }
        // Equipment items validation
        else if (isEquipmentCategory) {
            if (!item.equipmentCategoryId || !item.equipmentTypeId) {
                return res.status(400).json({ 
                    message: 'Equipment items must have equipment category and equipment type' 
                });
            }
        }
        // General items validation
        else {
            if (!item.itemNameId) {
                return res.status(400).json({ 
                    message: 'General items must have item name' 
                });
            }
        }
    }

    // Validate user is eligible for demand creation
    if (!req.user.eligible_for_demand_creation) {
        return res.status(403).json({ message: 'You are not eligible to create demands' });
    }

    try {
        // Calculate total estimated cost (using current year cost)
        const totalEstimatedCost = items.reduce((sum, item) => sum + parseFloat(item.currentYearCost), 0);
        
        // Get item name for the first item for backward compatibility
        const firstItem = items[0];
        let itemNameData = null;
        
        // Get category info for the first item
        const firstItemCategory = await new Promise((resolve, reject) => {
            db.get(
                'SELECT name FROM item_categories WHERE id = ?',
                [firstItem.categoryId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const categoryName = firstItemCategory?.name?.toLowerCase() || '';
        const isPharmaCategory = categoryName.includes('pharmaceutical') || categoryName.includes('medicine') || categoryName.includes('drug');
        const isEquipmentCategory = categoryName.includes('equipment') || categoryName.includes('machinery');

        // Get the appropriate name based on item type
        if (isPharmaCategory && firstItem.drugNameId) {
            itemNameData = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT name FROM drug_names WHERE id = ?',
                    [firstItem.drugNameId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
        } else if (isEquipmentCategory && firstItem.equipmentTypeId) {
            itemNameData = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT name FROM equipment_types WHERE id = ?',
                    [firstItem.equipmentTypeId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
        } else if (firstItem.itemNameId) {
            itemNameData = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT name FROM item_names WHERE id = ?',
                    [firstItem.itemNameId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
        }

        if (!itemNameData) {
            return res.status(400).json({ message: 'Invalid item name selected for first item' });
        }

        // Create main demand record (using first item as primary for backward compatibility)
        const demandResult = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO demands (item_name, quantity, estimated_cost, description, urgency, required_by, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [itemNameData.name, firstItem.quantity, totalEstimatedCost, description, urgency || 'normal', requiredBy, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID });
                }
            );
        });

        const demandId = demandResult.id;

        // Insert all items into demand_items table with new fields
        for (const item of items) {
            // Get the actual item name based on item type
            let itemName = 'Unknown Item';
            
            // Get category info for this item
            const itemCategory = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT name FROM item_categories WHERE id = ?',
                    [item.categoryId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            const categoryName = itemCategory?.name?.toLowerCase() || '';
            const isPharmaCategory = categoryName.includes('pharmaceutical') || categoryName.includes('medicine') || categoryName.includes('drug');
            const isEquipmentCategory = categoryName.includes('equipment') || categoryName.includes('machinery');

            // Get the appropriate name based on item type
            if (isPharmaCategory && item.drugNameId) {
                const drugNameData = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT name FROM drug_names WHERE id = ?',
                        [item.drugNameId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                itemName = drugNameData?.name || 'Unknown Drug';
            } else if (isEquipmentCategory && item.equipmentTypeId) {
                const equipmentNameData = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT name FROM equipment_types WHERE id = ?',
                        [item.equipmentTypeId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                itemName = equipmentNameData?.name || 'Unknown Equipment';
            } else if (item.itemNameId) {
                const itemNameData = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT name FROM item_names WHERE id = ?',
                        [item.itemNameId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                itemName = itemNameData?.name || 'Unknown Item';
            }

            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demand_items (demand_id, item_name, quantity, estimated_cost, remarks, unit, 
                     category_id, item_name_id, prev_year_cost, current_year_cost, specifications,
                     drug_category_id, drug_name_id, strength_value, strength_unit_id, dosage_form_id, 
                     preparation_id, equipment_category_id, equipment_type_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        demandId, 
                        itemName, 
                        item.quantity, 
                        item.currentYearCost, // Use current year cost as estimated cost
                        item.remarks || null, 
                        item.unit,
                        item.categoryId,
                        item.itemNameId,
                        item.prevYearCost,
                        item.currentYearCost,
                        item.specifications || null,
                        item.drugCategoryId || null,
                        item.drugNameId || null,
                        item.strengthValue || null,
                        item.strengthUnitId || null,
                        item.dosageFormId || null,
                        item.preparationId || null,
                        item.equipmentCategoryId || null,
                        item.equipmentTypeId || null
                    ],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
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
                `SELECT d.*, u.name as created_by_name, sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
                 WHERE d.created_by = ?
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
                        sr.name as store_response_by_name
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 LEFT JOIN users sr ON d.store_response_by = sr.id
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

        // Get items for the demand with category names and detailed categorization
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*, 
                        ic.name as category_name,
                        in_t.name as item_name_full,
                        dc.name as drug_category_name,
                        dn.name as drug_name,
                        su.name as strength_unit_name,
                        su.abbreviation as strength_unit_abbr,
                        df.name as dosage_form_name,
                        p.name as preparation_name,
                        ec.name as equipment_category_name,
                        et.name as equipment_type_name
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 LEFT JOIN drug_categories dc ON di.drug_category_id = dc.id
                 LEFT JOIN drug_names dn ON di.drug_name_id = dn.id
                 LEFT JOIN strength_units su ON di.strength_unit_id = su.id
                 LEFT JOIN dosage_forms df ON di.dosage_form_id = df.id
                 LEFT JOIN preparations p ON di.preparation_id = p.id
                 LEFT JOIN equipment_categories ec ON di.equipment_category_id = ec.id
                 LEFT JOIN equipment_types et ON di.equipment_type_id = et.id
                 WHERE di.demand_id = ? 
                 ORDER BY di.id`,
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        demand.items = items;
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
                 WHERE d.status IN ('pending', 'store_pending', 'available', 'not_available', 'vetting_pending', 'vetting_approved', 'purchase_pending')
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

        // Get paginated items with all detailed information
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*, 
                        ic.name as category_name,
                        in_t.name as item_name_full,
                        dc.name as drug_category_name,
                        dn.name as drug_name,
                        su.name as strength_unit_name,
                        df.name as dosage_form_name,
                        p.name as preparation_name,
                        ec.name as equipment_category_name,
                        et.name as equipment_type_name
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 LEFT JOIN drug_categories dc ON di.drug_category_id = dc.id
                 LEFT JOIN drug_names dn ON di.drug_name_id = dn.id
                 LEFT JOIN strength_units su ON di.strength_unit_id = su.id
                 LEFT JOIN dosage_forms df ON di.dosage_form_id = df.id
                 LEFT JOIN preparations p ON di.preparation_id = p.id
                 LEFT JOIN equipment_categories ec ON di.equipment_category_id = ec.id
                 LEFT JOIN equipment_types et ON di.equipment_type_id = et.id
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

        // Format items for frontend with detailed information based on category
        const formattedItems = items.map(item => {
            const categoryName = item.category_name?.toLowerCase() || '';
            const isPharmaCategory = categoryName.includes('pharmaceutical') || categoryName.includes('medicine') || categoryName.includes('drug');
            const isEquipmentCategory = categoryName.includes('equipment') || categoryName.includes('machinery');
            
            let formattedItem = {
                id: item.id,
                name: item.item_name || item.item_name_full || item.drug_name || item.equipment_type_name || 'Unknown Item',
                category: item.category_name || 'Unknown Category',
                quantity: item.quantity,
                unit: item.unit,
                specifications: item.specifications,
                estimated_cost: item.current_year_cost,
                prev_year_cost: item.prev_year_cost,
                item_type: isPharmaCategory ? 'pharmaceutical' : isEquipmentCategory ? 'equipment' : 'general'
            };

            // Add pharmaceutical-specific details
            if (isPharmaCategory) {
                formattedItem.pharmaceutical_details = {
                    drug_category: item.drug_category_name,
                    drug_name: item.drug_name,
                    strength: item.strength_value ? `${item.strength_value} ${item.strength_unit_name || ''}`.trim() : null,
                    dosage_form: item.dosage_form_name,
                    preparation: item.preparation_name
                };
            }

            // Add equipment-specific details
            if (isEquipmentCategory) {
                formattedItem.equipment_details = {
                    equipment_category: item.equipment_category_name,
                    equipment_type: item.equipment_type_name
                };
            }

            return formattedItem;
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

        // Get demand items with detailed categorization (pharma/equipment) for accurate Excel export
        const items = await new Promise((resolve, reject) => {
            db.all(
                `SELECT di.*, 
                        ic.name as category_name,
                        in_t.name as item_name_full,
                        dc.name as drug_category_name,
                        dn.name as drug_name,
                        su.name as strength_unit_name,
                        su.abbreviation as strength_unit_abbr,
                        df.name as dosage_form_name,
                        p.name as preparation_name,
                        ec.name as equipment_category_name,
                        et.name as equipment_type_name
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 LEFT JOIN item_names in_t ON di.item_name_id = in_t.id
                 LEFT JOIN drug_categories dc ON di.drug_category_id = dc.id
                 LEFT JOIN drug_names dn ON di.drug_name_id = dn.id
                 LEFT JOIN strength_units su ON di.strength_unit_id = su.id
                 LEFT JOIN dosage_forms df ON di.dosage_form_id = df.id
                 LEFT JOIN preparations p ON di.preparation_id = p.id
                 LEFT JOIN equipment_categories ec ON di.equipment_category_id = ec.id
                 LEFT JOIN equipment_types et ON di.equipment_type_id = et.id
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
                const categoryNameLower = (item.category_name || '').toLowerCase();
                const isPharma = categoryNameLower.includes('pharmaceutical') || categoryNameLower.includes('medicine') || categoryNameLower.includes('drug');
                const isEquipment = categoryNameLower.includes('equipment') || categoryNameLower.includes('machinery') || categoryNameLower.includes('instrument');

                // Build strength string if available
                const strength = item.strength_value ? `${item.strength_value} ${item.strength_unit_abbr || item.strength_unit_name || ''}`.trim() : '';

                return {
                    name: item.item_name_full || item.item_name || item.drug_name || item.equipment_type_name,
                    category: item.category_name,
                    quantity: item.quantity,
                    unit: item.unit,
                    specifications: item.specifications,
                    // Costs: fall back to legacy estimated_cost if specific year costs absent
                    previous_year_cost: item.previous_year_cost || item.prev_year_cost || 0,
                    current_year_cost: item.current_year_cost || item.estimated_cost || 0,
                    // Extra fields used by excel generator heuristics for pharma/equipment layout
                    drug_category: isPharma ? item.drug_category_name : undefined,
                    drug_name: isPharma ? item.drug_name : undefined,
                    strength: isPharma ? strength : undefined,
                    dosage_form: isPharma ? item.dosage_form_name : undefined,
                    preparation: isPharma ? item.preparation_name : undefined,
                    equipment_category: isEquipment ? item.equipment_category_name : undefined,
                    equipment_type: isEquipment ? item.equipment_type_name : undefined,
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

module.exports = {
    createDemand,
    getUserDemands,
    getAllDemands,
    getDemandById,
    getDemandWithItems,
    getAllDemandsWithItems,
    rejectDemand,
    getDemandItemsPaginated,
    generateDemandExcelReport
};
