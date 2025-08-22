const { getDatabase } = require('../config/database');
const auditLogger = require('../utils/auditLogger');

// Get demands eligible for merging (only for store users)
const getDemandsForMerging = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from store department
    const canMerge = user.role === 'superadmin' || 
                    (user.department_name && user.department_name.toLowerCase() === 'store');

    if (!canMerge) {
        return res.status(403).json({ message: 'Only Store department users can merge demands' });
    }

    try {
        // Get demands that are eligible for merging (pending status and not already merged)
        const demands = await new Promise((resolve, reject) => {
            db.all(
                `SELECT d.*, u.name as created_by_name, dept.name as creator_department
                 FROM demands d
                 LEFT JOIN users u ON d.created_by = u.id
                 LEFT JOIN departments dept ON u.department_id = dept.id
                 WHERE d.status IN ('pending', 'store_pending') 
                 AND d.is_merged = 0
                 ORDER BY d.created_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Get items for each demand with category information
        for (let demand of demands) {
            const items = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT di.*, ic.name as category_name
                     FROM demand_items di
                     LEFT JOIN item_categories ic ON di.category_id = ic.id
                     WHERE di.demand_id = ? 
                     ORDER BY di.id`,
                    [demand.id],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            demand.items = items;
            
            // Get dominant category for this demand
            const categoryCounts = items.reduce((acc, item) => {
                const category = item.category_name || 'Uncategorized';
                acc[category] = (acc[category] || 0) + 1;
                return acc;
            }, {});
            
            // Find the most common category
            demand.dominant_category = Object.keys(categoryCounts).reduce((a, b) => 
                categoryCounts[a] > categoryCounts[b] ? a : b
            );
        }

        res.json(demands);
    } catch (error) {
        console.error('Error fetching demands for merging:', error);
        res.status(500).json({ message: 'Failed to fetch demands', error: error.message });
    }
};

// Validate if demands can be merged (same category check)
const validateDemandMerging = async (req, res) => {
    const db = getDatabase();
    const { demandIds } = req.body;
    const user = req.user;

    // Check if user is from store department
    const canMerge = user.role === 'superadmin' || 
                    (user.department_name && user.department_name.toLowerCase() === 'store');

    if (!canMerge) {
        return res.status(403).json({ message: 'Only Store department users can merge demands' });
    }

    if (!demandIds || !Array.isArray(demandIds) || demandIds.length < 2) {
        return res.status(400).json({ message: 'At least 2 demands are required for merging' });
    }

    try {
        // Get all items from selected demands with their categories
        const allItems = await new Promise((resolve, reject) => {
            const placeholders = demandIds.map(() => '?').join(',');
            db.all(
                `SELECT di.*, ic.name as category_name, d.id as demand_id
                 FROM demand_items di
                 LEFT JOIN item_categories ic ON di.category_id = ic.id
                 JOIN demands d ON di.demand_id = d.id
                 WHERE di.demand_id IN (${placeholders})
                 AND d.is_merged = 0`,
                demandIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (allItems.length === 0) {
            return res.status(400).json({ message: 'No items found in selected demands' });
        }

        // Check if all items have the same category
        const categories = [...new Set(allItems.map(item => item.category_name))];
        
        if (categories.length > 1) {
            return res.status(400).json({ 
                message: `Cannot merge demands with different item categories. Found categories: ${categories.join(', ')}. All items must belong to the same category (e.g., Pharmaceuticals, IT Equipment, etc.)`,
                categories: categories,
                valid: false
            });
        }

        // Check if demands are eligible for merging (not already merged, correct status)
        const demands = await new Promise((resolve, reject) => {
            const placeholders = demandIds.map(() => '?').join(',');
            db.all(
                `SELECT id, status, is_merged FROM demands WHERE id IN (${placeholders})`,
                demandIds,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        const invalidDemands = demands.filter(d => 
            d.is_merged === 1 || !['pending', 'store_pending'].includes(d.status)
        );

        if (invalidDemands.length > 0) {
            return res.status(400).json({ 
                message: 'Some demands are not eligible for merging (already merged or wrong status)',
                valid: false
            });
        }

        res.json({ 
            valid: true, 
            category: categories[0],
            itemCount: allItems.length,
            demandCount: demandIds.length,
            message: `All ${allItems.length} items belong to category: ${categories[0]}. Ready to merge ${demandIds.length} demands.`
        });

    } catch (error) {
        console.error('Error validating demand merging:', error);
        res.status(500).json({ message: 'Failed to validate demands', error: error.message });
    }
};

// Merge selected demands into a single new demand
const mergeDemands = async (req, res) => {
    const db = getDatabase();
    const { demandIds, mergedDescription, urgency, requiredBy } = req.body;
    const user = req.user;

    // Check if user is from store department
    const canMerge = user.role === 'superadmin' || 
                    (user.department_name && user.department_name.toLowerCase() === 'store');

    if (!canMerge) {
        return res.status(403).json({ message: 'Only Store department users can merge demands' });
    }

    if (!demandIds || !Array.isArray(demandIds) || demandIds.length < 2) {
        return res.status(400).json({ message: 'At least 2 demands are required for merging' });
    }

    if (!mergedDescription || !urgency || !requiredBy) {
        return res.status(400).json({ message: 'Description, urgency, and required date are required' });
    }

    try {
        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Get all items from selected demands
            const allItems = await new Promise((resolve, reject) => {
                const placeholders = demandIds.map(() => '?').join(',');
                db.all(
                    `SELECT di.*, ic.name as category_name, d.created_by
                     FROM demand_items di
                     LEFT JOIN item_categories ic ON di.category_id = ic.id
                     JOIN demands d ON di.demand_id = d.id
                     WHERE di.demand_id IN (${placeholders})
                     AND d.is_merged = 0`,
                    demandIds,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            if (allItems.length === 0) {
                throw new Error('No items found in selected demands');
            }

            // Check category consistency again
            const categories = [...new Set(allItems.map(item => item.category_name))];
            if (categories.length > 1) {
                throw new Error(`Cannot merge demands with different categories: ${categories.join(', ')}`);
            }

            // Calculate total estimated cost
            const totalEstimatedCost = allItems.reduce((sum, item) => sum + parseFloat(item.current_year_cost || item.estimated_cost || 0), 0);

            // Get first item name for backward compatibility
            const firstItem = allItems[0];
            
            // Create new merged demand
            const mergedDemandResult = await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO demands (item_name, quantity, estimated_cost, description, urgency, required_by, created_by, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                    [
                        `Merged Demand - ${categories[0]}`, // Generic name for merged demand
                        allItems.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0), // Total quantity
                        totalEstimatedCost,
                        mergedDescription,
                        urgency,
                        requiredBy,
                        user.id // Merged by store user
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ id: this.lastID });
                    }
                );
            });

            const newDemandId = mergedDemandResult.id;

            // Copy all items to the new demand
            for (const item of allItems) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO demand_items (
                            demand_id, item_name, quantity, estimated_cost, remarks, unit, 
                            category_id, item_name_id, prev_year_cost, current_year_cost, specifications,
                            drug_category_id, drug_name_id, strength_value, strength_unit_id, 
                            dosage_form_id, preparation_id, equipment_category_id, equipment_type_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            newDemandId,
                            item.item_name,
                            item.quantity,
                            item.estimated_cost,
                            item.remarks,
                            item.unit,
                            item.category_id,
                            item.item_name_id,
                            item.prev_year_cost,
                            item.current_year_cost,
                            item.specifications,
                            item.drug_category_id,
                            item.drug_name_id,
                            item.strength_value,
                            item.strength_unit_id,
                            item.dosage_form_id,
                            item.preparation_id,
                            item.equipment_category_id,
                            item.equipment_type_id
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            // Mark original demands as merged
            for (const demandId of demandIds) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE demands SET is_merged = 1, status = \'merged\' WHERE id = ?',
                        [demandId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Record the merge relationship
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO merged_demands (new_demand_id, original_demand_id, merged_by) VALUES (?, ?, ?)',
                        [newDemandId, demandId, user.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log the merge action
            await auditLogger.logDemandManagement(
                user.id,
                user.role,
                user.name,
                'DEMANDS_MERGED',
                newDemandId,
                `Merged ${demandIds.length} demands (IDs: ${demandIds.join(', ')}) with ${allItems.length} items in category: ${categories[0]}`,
                req
            );

            res.json({
                message: 'Demands merged successfully',
                newDemandId: newDemandId,
                mergedDemandIds: demandIds,
                itemCount: allItems.length,
                category: categories[0],
                totalEstimatedCost: totalEstimatedCost
            });

        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve) => {
                db.run('ROLLBACK', () => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('Error merging demands:', error);
        res.status(500).json({ message: 'Failed to merge demands', error: error.message });
    }
};

// Get merge history
const getMergeHistory = async (req, res) => {
    const db = getDatabase();
    const user = req.user;

    // Check if user is from store department
    const canView = user.role === 'superadmin' || 
                   (user.department_name && user.department_name.toLowerCase() === 'store');

    if (!canView) {
        return res.status(403).json({ message: 'Only Store department users can view merge history' });
    }

    try {
        const mergeHistory = await new Promise((resolve, reject) => {
            db.all(
                `SELECT md.*, 
                        nd.description as new_demand_description,
                        nd.status as new_demand_status,
                        od.description as original_demand_description,
                        u.name as merged_by_name
                 FROM merged_demands md
                 JOIN demands nd ON md.new_demand_id = nd.id
                 JOIN demands od ON md.original_demand_id = od.id
                 JOIN users u ON md.merged_by = u.id
                 ORDER BY md.merged_at DESC`,
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(mergeHistory);
    } catch (error) {
        console.error('Error fetching merge history:', error);
        res.status(500).json({ message: 'Failed to fetch merge history', error: error.message });
    }
};

module.exports = {
    getDemandsForMerging,
    validateDemandMerging,
    mergeDemands,
    getMergeHistory
};
