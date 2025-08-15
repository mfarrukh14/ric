const { getDatabase } = require('../config/database');
const EmailService = require('../utils/emailService');

// Get all pending grievance notifications for purchase department
const getPendingGrievances = async (req, res) => {
    try {
        const db = getDatabase();
        
        const grievances = await new Promise((resolve, reject) => {
            db.all(
                `SELECT pg.*, d.item_name as tender_title, dt.id as tender_number
                 FROM purchase_department_grievances pg
                 JOIN demand_tenders dt ON pg.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE pg.status = 'pending'
                 ORDER BY pg.created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({
            success: true,
            grievances: grievances
        });
    } catch (error) {
        console.error('Error fetching pending grievances:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending grievances'
        });
    }
};

// Approve and send grievance notification to supplier
const approveGrievance = async (req, res) => {
    try {
        const { grievanceId } = req.params;
        const { approvalComments, reviewedBy } = req.body;
        const db = getDatabase();

        // Get grievance details
        const grievance = await new Promise((resolve, reject) => {
            db.get(
                `SELECT pg.*, d.item_name as tender_title, dt.id as tender_number
                 FROM purchase_department_grievances pg
                 JOIN demand_tenders dt ON pg.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 WHERE pg.id = ?`,
                [grievanceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!grievance) {
            return res.status(404).json({
                success: false,
                message: 'Grievance record not found'
            });
        }

        // Update grievance status to approved
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE purchase_department_grievances 
                 SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, approval_comments = ?
                 WHERE id = ?`,
                [reviewedBy, approvalComments, grievanceId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Send email notification to supplier
        const emailService = new EmailService();
        try {
            await emailService.sendTechnicalEvaluationRejectionEmail(
                grievance.supplier_email,
                grievance.supplier_name,
                grievance.item_name,
                grievance.rejection_reason,
                grievance.contact_person
            );

            console.log(`✅ Grievance email sent successfully to ${grievance.supplier_name}`);
        } catch (emailError) {
            console.error(`❌ Failed to send grievance email:`, emailError);
            // Update status to indicate email sending failed
            await new Promise((resolve) => {
                db.run(
                    `UPDATE purchase_department_grievances 
                     SET approval_comments = ? 
                     WHERE id = ?`,
                    [`${approvalComments || ''} (Email sending failed: ${emailError.message})`, grievanceId],
                    () => resolve()
                );
            });
        }

        res.json({
            success: true,
            message: 'Grievance approved and notification sent to supplier'
        });
    } catch (error) {
        console.error('Error approving grievance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve grievance'
        });
    }
};

// Reject grievance (supplier will not be notified)
const rejectGrievance = async (req, res) => {
    try {
        const { grievanceId } = req.params;
        const { rejectionComments, reviewedBy } = req.body;
        const db = getDatabase();

        // Update grievance status to rejected
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE purchase_department_grievances 
                 SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, approval_comments = ?
                 WHERE id = ?`,
                [reviewedBy, rejectionComments, grievanceId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            message: 'Grievance rejected - supplier will not be notified'
        });
    } catch (error) {
        console.error('Error rejecting grievance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject grievance'
        });
    }
};

// Get all grievances (pending, approved, rejected) for purchase department
const getAllGrievances = async (req, res) => {
    try {
        const db = getDatabase();
        
        const grievances = await new Promise((resolve, reject) => {
            db.all(
                `SELECT pg.*, d.item_name as tender_title, dt.id as tender_number
                 FROM purchase_department_grievances pg
                 JOIN demand_tenders dt ON pg.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 ORDER BY pg.created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json({
            success: true,
            grievances: grievances
        });
    } catch (error) {
        console.error('Error fetching all grievances:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch grievances'
        });
    }
};

// Bulk approve grievances
const bulkApproveGrievances = async (req, res) => {
    try {
        const { grievanceIds, approvalComments, reviewedBy } = req.body;
        const db = getDatabase();
        const emailService = new EmailService();

        let successCount = 0;
        let failedCount = 0;
        const results = [];

        for (const grievanceId of grievanceIds) {
            try {
                // Get grievance details
                const grievance = await new Promise((resolve, reject) => {
                    db.get(
                        `SELECT pg.*, d.item_name as tender_title, dt.id as tender_number
                         FROM purchase_department_grievances pg
                         JOIN demand_tenders dt ON pg.tender_id = dt.id
                         JOIN demands d ON dt.demand_id = d.id
                         WHERE pg.id = ?`,
                        [grievanceId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });

                if (!grievance) {
                    results.push({ grievanceId, status: 'failed', reason: 'Grievance not found' });
                    failedCount++;
                    continue;
                }

                // Update grievance status to approved
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE purchase_department_grievances 
                         SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, approval_comments = ?
                         WHERE id = ?`,
                        [reviewedBy, approvalComments, grievanceId],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Send email notification to supplier
                try {
                    await emailService.sendTechnicalEvaluationRejectionEmail(
                        grievance.supplier_email,
                        grievance.supplier_name,
                        grievance.item_name,
                        grievance.rejection_reason,
                        grievance.contact_person
                    );

                    results.push({ 
                        grievanceId, 
                        status: 'success', 
                        supplierName: grievance.supplier_name 
                    });
                    successCount++;
                } catch (emailError) {
                    console.error(`❌ Failed to send email for grievance ${grievanceId}:`, emailError);
                    
                    // Update with email failure note
                    await new Promise((resolve) => {
                        db.run(
                            `UPDATE purchase_department_grievances 
                             SET approval_comments = ? 
                             WHERE id = ?`,
                            [`${approvalComments || ''} (Email sending failed: ${emailError.message})`, grievanceId],
                            () => resolve()
                        );
                    });

                    results.push({ 
                        grievanceId, 
                        status: 'partial', 
                        reason: 'Approved but email failed',
                        supplierName: grievance.supplier_name 
                    });
                    successCount++;
                }
            } catch (error) {
                console.error(`❌ Failed to process grievance ${grievanceId}:`, error);
                results.push({ 
                    grievanceId, 
                    status: 'failed', 
                    reason: error.message 
                });
                failedCount++;
            }
        }

        res.json({
            success: true,
            message: `Bulk approval completed: ${successCount} successful, ${failedCount} failed`,
            results: results,
            summary: {
                total: grievanceIds.length,
                successful: successCount,
                failed: failedCount
            }
        });
    } catch (error) {
        console.error('Error in bulk approve grievances:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to bulk approve grievances'
        });
    }
};

module.exports = {
    getPendingGrievances,
    approveGrievance,
    rejectGrievance,
    getAllGrievances,
    bulkApproveGrievances
};
