const { getDatabase } = require('../config/database');

// Generate unique PO number
const generatePONumber = async () => {
    const db = getDatabase();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Get the count of POs created today
    const countRow = await new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM purchase_orders WHERE DATE(created_at) = DATE('now')`,
            [],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
    
    const sequentialNumber = String((countRow?.count || 0) + 1).padStart(3, '0');
    return `PO-${year}${month}${day}-${sequentialNumber}`;
};

// Create a new purchase order
const createPurchaseOrder = async (req, res) => {
    try {
        const {
            tenderId,
            awardLetterId,
            supplierId,
            items,
            remarks,
            deliveryDate,
            paymentTerms,
            billingAddress,
            shippingAddress,
            contactName,
            contactPhone,
            contactEmail,
            referenceNo
        } = req.body;
        const userId = req.user.id;
        const db = getDatabase();

        if (!tenderId || !awardLetterId || !supplierId || !items || items.length === 0) {
            return res.status(400).json({ error: 'Missing required fields: tenderId, awardLetterId, supplierId, and items are required' });
        }

        // Verify that the award letter exists and belongs to this tender/supplier
        const awardLetter = await new Promise((resolve, reject) => {
            db.get(
                `SELECT tl.*, sa.award_amount, sa.awarded_items
                 FROM tender_letters tl
                 JOIN supplier_awards sa ON tl.id = sa.award_letter_id
                 WHERE tl.id = ? AND tl.tender_id = ? AND sa.supplier_id = ? AND tl.letter_type = 'award'`,
                [awardLetterId, tenderId, supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!awardLetter) {
            return res.status(404).json({ error: 'Award letter not found for this tender and supplier combination' });
        }

        // Calculate total amount from items
        let totalAmount = 0;
        for (const item of items) {
            totalAmount += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
        }

        // Generate unique PO number
        const poNumber = await generatePONumber();

        // Create the purchase order
        const poId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO purchase_orders 
                (po_number, tender_id, award_letter_id, supplier_id, items, total_amount, remarks, created_by, delivery_date, payment_terms, billing_address, shipping_address, contact_name, contact_phone, contact_email, reference_no)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ,
                [
                    poNumber,
                    tenderId,
                    awardLetterId,
                    supplierId,
                    JSON.stringify(items),
                    totalAmount,
                    remarks || null,
                    userId,
                    deliveryDate || null,
                    paymentTerms || null,
                    billingAddress || null,
                    shippingAddress || null,
                    contactName || null,
                    contactPhone || null,
                    contactEmail || null,
                    referenceNo || null
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        res.status(201).json({
            message: 'Purchase order created successfully',
            purchaseOrder: {
                id: poId,
                poNumber,
                tenderId,
                awardLetterId,
                supplierId,
                items,
                totalAmount,
                status: 'created',
                remarks,
                deliveryDate,
                paymentTerms,
                billingAddress,
                shippingAddress,
                contactName,
                contactPhone,
                contactEmail,
                referenceNo
            }
        });

    } catch (error) {
        console.error('Error creating purchase order:', error);
        res.status(500).json({ error: 'Failed to create purchase order' });
    }
};

// Get all purchase orders (with optional filters)
const getPurchaseOrders = async (req, res) => {
    try {
        const { tenderId, supplierId, status, search, page = 1, limit = 20 } = req.query;
        const db = getDatabase();
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
            SELECT 
                po.id,
                po.po_number,
                po.tender_id,
                po.award_letter_id,
                po.supplier_id,
                po.items,
                po.total_amount,
                po.status,
                po.remarks,
                po.delivery_date,
                po.payment_terms,
                po.billing_address,
                po.shipping_address,
                po.contact_name,
                po.contact_phone,
                po.contact_email,
                po.reference_no,
                po.created_at,
                po.sent_at,
                po.acknowledged_at,
                po.fulfilled_at,
                po.created_by,
                dt.tender_number,
                d.item_name as tender_item_name,
                d.description as tender_description,
                sbp.business_name as supplier_name,
                sbp.contact_person_name as supplier_contact,
                s.business_email as supplier_email,
                u.name as created_by_name
            FROM purchase_orders po
            JOIN demand_tenders dt ON po.tender_id = dt.id
            JOIN demands d ON dt.demand_id = d.id
            JOIN suppliers s ON po.supplier_id = s.id
            JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
            JOIN users u ON po.created_by = u.id
            WHERE 1=1
        `;

        let countQuery = `SELECT COUNT(*) as total FROM purchase_orders po WHERE 1=1`;
        const params = [];
        const countParams = [];

        if (tenderId) {
            query += ` AND po.tender_id = ?`;
            countQuery += ` AND po.tender_id = ?`;
            params.push(tenderId);
            countParams.push(tenderId);
        }

        if (supplierId) {
            query += ` AND po.supplier_id = ?`;
            countQuery += ` AND po.supplier_id = ?`;
            params.push(supplierId);
            countParams.push(supplierId);
        }

        if (status) {
            query += ` AND po.status = ?`;
            countQuery += ` AND po.status = ?`;
            params.push(status);
            countParams.push(status);
        }

        if (search) {
            query += ` AND (po.po_number LIKE ? OR sbp.business_name LIKE ? OR dt.tender_number LIKE ?)`;
            countQuery = `
                SELECT COUNT(*) as total 
                FROM purchase_orders po
                JOIN demand_tenders dt ON po.tender_id = dt.id
                JOIN suppliers s ON po.supplier_id = s.id
                JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                WHERE 1=1
            `;
            if (tenderId) countQuery += ` AND po.tender_id = ?`;
            if (supplierId) countQuery += ` AND po.supplier_id = ?`;
            if (status) countQuery += ` AND po.status = ?`;
            countQuery += ` AND (po.po_number LIKE ? OR sbp.business_name LIKE ? OR dt.tender_number LIKE ?)`;
            
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY po.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const purchaseOrders = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const totalCount = await new Promise((resolve, reject) => {
            db.get(countQuery, countParams, (err, row) => {
                if (err) reject(err);
                else resolve(row?.total || 0);
            });
        });

        // Parse items JSON for each PO
        const formattedOrders = purchaseOrders.map(po => ({
            ...po,
            items: JSON.parse(po.items || '[]')
        }));

        res.json({
            purchaseOrders: formattedOrders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error getting purchase orders:', error);
        res.status(500).json({ error: 'Failed to get purchase orders' });
    }
};

// Get purchase order by ID
const getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const db = getDatabase();

        const purchaseOrder = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    po.*,
                    dt.tender_number,
                    d.item_name as tender_item_name,
                    d.description as tender_description,
                    sbp.business_name as supplier_name,
                    sbp.contact_person_name as supplier_contact,
                    s.business_email as supplier_email,
                    u.name as created_by_name
                FROM purchase_orders po
                JOIN demand_tenders dt ON po.tender_id = dt.id
                JOIN demands d ON dt.demand_id = d.id
                JOIN suppliers s ON po.supplier_id = s.id
                JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                JOIN users u ON po.created_by = u.id
                WHERE po.id = ?`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!purchaseOrder) {
            return res.status(404).json({ error: 'Purchase order not found' });
        }

        res.json({
            ...purchaseOrder,
            items: JSON.parse(purchaseOrder.items || '[]')
        });

    } catch (error) {
        console.error('Error getting purchase order:', error);
        res.status(500).json({ error: 'Failed to get purchase order' });
    }
};

// Get purchase orders by PO number (for search)
const getPurchaseOrderByNumber = async (req, res) => {
    try {
        const { poNumber } = req.params;
        const db = getDatabase();

        const purchaseOrder = await new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    po.*,
                    dt.tender_number,
                    d.item_name as tender_item_name,
                    d.description as tender_description,
                    sbp.business_name as supplier_name,
                    sbp.contact_person_name as supplier_contact,
                    s.business_email as supplier_email,
                    u.name as created_by_name
                FROM purchase_orders po
                JOIN demand_tenders dt ON po.tender_id = dt.id
                JOIN demands d ON dt.demand_id = d.id
                JOIN suppliers s ON po.supplier_id = s.id
                JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                JOIN users u ON po.created_by = u.id
                WHERE po.po_number = ?`,
                [poNumber],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!purchaseOrder) {
            return res.status(404).json({ error: 'Purchase order not found' });
        }

        res.json({
            ...purchaseOrder,
            items: JSON.parse(purchaseOrder.items || '[]')
        });

    } catch (error) {
        console.error('Error getting purchase order by number:', error);
        res.status(500).json({ error: 'Failed to get purchase order' });
    }
};

// Get awarded suppliers for a tender (for creating PO)
const getAwardedSuppliersForTender = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const db = getDatabase();

        const awardedSuppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    sa.id as award_id,
                    sa.supplier_id,
                    sa.award_amount,
                    sa.awarded_items,
                    sa.award_letter_id,
                    sbp.business_name as supplier_name,
                    sbp.contact_person_name as supplier_contact,
                    s.business_email as supplier_email,
                    tl.letter_title,
                    tl.sent_at as award_sent_at
                FROM supplier_awards sa
                JOIN suppliers s ON sa.supplier_id = s.id
                JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                JOIN tender_letters tl ON sa.award_letter_id = tl.id
                WHERE sa.tender_id = ?`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Parse awarded items JSON
        const formattedSuppliers = awardedSuppliers.map(supplier => ({
            ...supplier,
            awarded_items: JSON.parse(supplier.awarded_items || '[]')
        }));

        res.json(formattedSuppliers);

    } catch (error) {
        console.error('Error getting awarded suppliers:', error);
        res.status(500).json({ error: 'Failed to get awarded suppliers' });
    }
};

// Update purchase order status
const updatePurchaseOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks, cancellationReason } = req.body;
        const db = getDatabase();

        const validStatuses = ['created', 'sent', 'acknowledged', 'fulfilled', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Check if PO exists
        const existingPO = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM purchase_orders WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!existingPO) {
            return res.status(404).json({ error: 'Purchase order not found' });
        }

        // Determine which timestamp to update based on status
        let updateQuery = 'UPDATE purchase_orders SET status = ?';
        const params = [status];

        if (status === 'sent') {
            updateQuery += ', sent_at = CURRENT_TIMESTAMP';
        } else if (status === 'acknowledged') {
            updateQuery += ', acknowledged_at = CURRENT_TIMESTAMP';
        } else if (status === 'fulfilled') {
            updateQuery += ', fulfilled_at = CURRENT_TIMESTAMP';
        } else if (status === 'cancelled') {
            updateQuery += ', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ?';
            params.push(cancellationReason || null);
        }

        if (remarks) {
            updateQuery += ', remarks = ?';
            params.push(remarks);
        }

        updateQuery += ' WHERE id = ?';
        params.push(id);

        await new Promise((resolve, reject) => {
            db.run(updateQuery, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({
            message: 'Purchase order status updated successfully',
            status
        });

    } catch (error) {
        console.error('Error updating purchase order status:', error);
        res.status(500).json({ error: 'Failed to update purchase order status' });
    }
};

// Get purchase orders for a specific award letter (to check if PO already exists)
const getPurchaseOrdersByAwardLetter = async (req, res) => {
    try {
        const { awardLetterId } = req.params;
        const db = getDatabase();

        const purchaseOrders = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    po.*,
                    sbp.business_name as supplier_name,
                    u.name as created_by_name
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.id
                JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                JOIN users u ON po.created_by = u.id
                WHERE po.award_letter_id = ?
                ORDER BY po.created_at DESC`,
                [awardLetterId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        const formattedOrders = purchaseOrders.map(po => ({
            ...po,
            items: JSON.parse(po.items || '[]')
        }));

        res.json(formattedOrders);

    } catch (error) {
        console.error('Error getting purchase orders by award letter:', error);
        res.status(500).json({ error: 'Failed to get purchase orders' });
    }
};

module.exports = {
    createPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrderById,
    getPurchaseOrderByNumber,
    getAwardedSuppliersForTender,
    updatePurchaseOrderStatus,
    getPurchaseOrdersByAwardLetter
};
