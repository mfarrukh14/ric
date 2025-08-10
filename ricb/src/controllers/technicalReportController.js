const { getDatabase } = require('../config/database');
const TechnicalReportGenerator = require('../utils/technicalReportGenerator');
const path = require('path');

const reportGenerator = new TechnicalReportGenerator();

// Get archived technical evaluations
const getArchivedEvaluations = async (req, res) => {
    try {
        const db = getDatabase();
        
        // Get completed technical evaluations with their suppliers
        const query = `
            SELECT DISTINCT 
                dt.id as tender_id,
                'Tender #' || dt.id as title,
                d.item_name,
                d.description,
                'Purchase Department' as department_name,
                dt.created_at,
                COUNT(DISTINCT sb.supplier_id) as supplier_count,
                AVG(te.total_score) as avg_score
            FROM demand_tenders dt
            INNER JOIN demands d ON dt.demand_id = d.id
            INNER JOIN supplier_bids sb ON dt.id = sb.tender_id
            INNER JOIN technical_evaluations te ON dt.id = te.tender_id AND sb.id = te.bid_id
            WHERE te.completed_at IS NOT NULL
            GROUP BY dt.id, dt.created_at, d.item_name, d.description
            ORDER BY dt.created_at DESC
        `;

        const archivedTenders = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // For each tender, get the suppliers who submitted bids
        const tendersWithSuppliers = await Promise.all(archivedTenders.map(async (tender) => {
            const suppliersQuery = `
                SELECT DISTINCT 
                    s.id,
                    s.username,
                    COALESCE(sbp.business_name, s.username) as display_name
                FROM suppliers s
                INNER JOIN supplier_bids sb ON s.id = sb.supplier_id
                LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                WHERE sb.tender_id = ?
                ORDER BY s.username
            `;
            
            const suppliers = await new Promise((resolve, reject) => {
                db.all(suppliersQuery, [tender.tender_id], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            return {
                ...tender,
                suppliers: suppliers.map(supplier => ({
                    id: supplier.id,
                    username: supplier.username,
                    displayName: supplier.display_name,
                    evaluation_status: 'Evaluated'
                }))
            };
        }));

        console.log('Archived evaluations query result:', tendersWithSuppliers);
        res.json(tendersWithSuppliers);
    } catch (error) {
        console.error('Error fetching archived evaluations:', error);
        res.status(500).json({ 
            error: 'Failed to fetch archived evaluations',
            details: error.message 
        });
    }
};

// Get suppliers for a specific tender
const getTenderSuppliers = async (req, res) => {
    const { tenderId } = req.params;
    
    try {
        const suppliers = await reportGenerator.getTenderSuppliers(tenderId);
        res.json({ suppliers });
    } catch (error) {
        console.error('Get tender suppliers error:', error);
        res.status(500).json({ error: 'Failed to fetch tender suppliers' });
    }
};

// Generate and download comparative analysis Excel report
const downloadComparativeAnalysis = async (req, res) => {
    const { tenderId, supplierName } = req.params;
    
    try {
        console.log('📊 Download comparative analysis request:', { tenderId, supplierName });
        
        // Get supplier ID from supplier name (business_name or username)
        const db = getDatabase();
        const supplier = await new Promise((resolve, reject) => {
            db.get(
                `SELECT s.id, s.username, sbp.business_name FROM suppliers s 
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 WHERE COALESCE(sbp.business_name, s.username) = ? OR s.username = ?`,
                [decodeURIComponent(supplierName), decodeURIComponent(supplierName)],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        console.log('🔍 Supplier lookup result:', supplier);

        if (!supplier) {
            console.log('❌ Supplier not found for name:', supplierName);
            
            // Get all available suppliers for this tender to help with debugging
            const availableSuppliers = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT DISTINCT s.id, s.username, COALESCE(sbp.business_name, s.username) as display_name
                     FROM suppliers s
                     INNER JOIN supplier_bids sb ON s.id = sb.supplier_id
                     LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                     WHERE sb.tender_id = ?`,
                    [tenderId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
            console.log('Available suppliers for tender:', availableSuppliers);
            
            return res.status(404).json({ 
                error: 'Supplier not found',
                supplierName: supplierName,
                availableSuppliers: availableSuppliers.map(s => ({
                    id: s.id,
                    username: s.username,
                    displayName: s.display_name
                }))
            });
        }

        console.log('✅ Generating report for supplier:', supplier);
        const result = await reportGenerator.generateComparativeAnalysisExcel(tenderId, supplier.id);
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        
        // Send file
        res.download(result.filepath, result.filename, (err) => {
            if (err) {
                console.error('File download error:', err);
                res.status(500).json({ error: 'Failed to download file' });
            }
        });
    } catch (error) {
        console.error('Generate comparative analysis error:', error);
        res.status(500).json({ error: 'Failed to generate comparative analysis report' });
    }
};

// Generate and download technical evaluation DOCX report
const downloadTechnicalEvaluation = async (req, res) => {
    const { tenderId, supplierName } = req.params;
    
    try {
        // Get supplier ID from supplier name (business_name or username)
        const db = getDatabase();
        const supplier = await new Promise((resolve, reject) => {
            db.get(
                `SELECT s.id FROM suppliers s 
                 LEFT JOIN supplier_business_profile sbp ON s.id = sbp.supplier_id
                 WHERE COALESCE(sbp.business_name, s.username) = ? OR s.username = ?`,
                [decodeURIComponent(supplierName), decodeURIComponent(supplierName)],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        const result = await reportGenerator.generateTechnicalEvaluationDocx(tenderId, supplier.id);
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        
        // Send file
        res.download(result.filepath, result.filename, (err) => {
            if (err) {
                console.error('File download error:', err);
                res.status(500).json({ error: 'Failed to download file' });
            }
        });
    } catch (error) {
        console.error('Generate technical evaluation error:', error);
        res.status(500).json({ error: 'Failed to generate technical evaluation report' });
    }
};

// Mark evaluation as completed (this should be called after all evaluators submit)
const markEvaluationCompleted = async (req, res) => {
    const { tenderId } = req.params;
    const db = getDatabase();
    
    try {
        // Check if evaluation record exists
        const existingEvaluation = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM technical_evaluations WHERE tender_id = ?',
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (existingEvaluation) {
            // Update existing evaluation to completed
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE technical_evaluations SET completed_at = datetime("now") WHERE tender_id = ?',
                    [tenderId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        } else {
            // Create new completed evaluation record
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO technical_evaluations (tender_id, status, completed_at) VALUES (?, ?, datetime("now"))',
                    [tenderId, 'completed'],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
        
        res.json({ message: 'Evaluation marked as completed successfully' });
    } catch (error) {
        console.error('Mark evaluation completed error:', error);
        res.status(500).json({ error: 'Failed to mark evaluation as completed' });
    }
};

module.exports = {
    getArchivedEvaluations,
    getTenderSuppliers,
    downloadComparativeAnalysis,
    downloadTechnicalEvaluation,
    markEvaluationCompleted
};
