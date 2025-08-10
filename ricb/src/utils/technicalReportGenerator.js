const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, HeadingLevel } = require('docx');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../config/database');

class TechnicalReportGenerator {
    constructor() {
        this.reportsDir = path.join(__dirname, '../../reports/technical');
        this.ensureReportsDirectory();
    }

    ensureReportsDirectory() {
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
    }

    async generateComparativeAnalysisExcel(tenderId, supplierId) {
        const db = getDatabase();
        
        // Get tender and supplier details
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description 
                 FROM demand_tenders dt 
                 JOIN demands d ON dt.demand_id = d.id 
                 WHERE dt.id = ?`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const supplier = await new Promise((resolve, reject) => {
            db.get(
                `SELECT s.*, bp.business_name 
                 FROM suppliers s 
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id 
                 WHERE s.id = ?`,
                [supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Get bid items with evaluation results
        const bidItems = await new Promise((resolve, reject) => {
            db.all(
                `SELECT sbi.*, sb.id as bid_id, sb.supplier_id, s.username, s.business_email,
                        bp.business_name, te.evaluation_status, te.completed_at
                 FROM supplier_bid_items sbi
                 JOIN supplier_bids sb ON sbi.bid_id = sb.id
                 LEFT JOIN technical_evaluations te ON sb.tender_id = te.tender_id
                 LEFT JOIN suppliers s ON sb.supplier_id = s.id
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE sb.tender_id = ? AND sb.supplier_id = ?`,
                [tenderId, supplierId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Comparative Analysis');

        // Set column widths
        worksheet.columns = [
            { key: 'srNo', width: 8 },
            { key: 'itemName', width: 30 },
            { key: 'specifications', width: 40 },
            { key: 'brandManufacturer', width: 30 },
            { key: 'registrationStatus', width: 20 },
            { key: 'selectionRejection', width: 15 },
            { key: 'remarks', width: 25 }
        ];

        // Add header
        worksheet.mergeCells('A1:G1');
        worksheet.getCell('A1').value = 'RAWALPINDI INSTITUTE OF CARDIOLOGY';
        worksheet.getCell('A1').font = { bold: true, size: 14 };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        worksheet.mergeCells('A2:G2');
        worksheet.getCell('A2').value = 'Technical Evaluation Committee';
        worksheet.getCell('A2').font = { bold: true, size: 12 };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };

        worksheet.mergeCells('A3:G3');
        worksheet.getCell('A3').value = `END USER SELECTION REJECTION OF ANNUAL TENDER OF SURGICAL & DISPOSABLE ITEMS FOR OT, ANESTHESIA & OTHER DEPARTMENTS FOR FY 2025-26.`;
        worksheet.getCell('A3').font = { bold: true, size: 10 };
        worksheet.getCell('A3').alignment = { horizontal: 'center', wrapText: true };

        worksheet.mergeCells('A4:G4');
        worksheet.getCell('A4').value = `REF NO. ${tender.reference_number || 'RIC/PO/2912/25'}, Dated ${new Date().toLocaleDateString()}`;
        worksheet.getCell('A4').font = { bold: true, size: 10 };
        worksheet.getCell('A4').alignment = { horizontal: 'center' };

        worksheet.mergeCells('A5:G5');
        worksheet.getCell('A5').value = 'After going through the specifications of items demanded in the bidding documents of RIC the undersigned examined the provided items and satisfied with their registration, Authorization, certification and quality. The rejected items are not upto the specification/ quality.';
        worksheet.getCell('A5').font = { size: 10 };
        worksheet.getCell('A5').alignment = { wrapText: true };

        worksheet.mergeCells('A6:G6');
        worksheet.getCell('A6').value = 'The Detail of Selection/ Rejection is given as under';
        worksheet.getCell('A6').font = { bold: true, size: 10 };
        worksheet.getCell('A6').alignment = { horizontal: 'center' };

        // Add supplier name
        worksheet.mergeCells('A8:G8');
        worksheet.getCell('A8').value = `${supplierId}. M/S ${supplier.business_name || supplier.username}`;
        worksheet.getCell('A8').font = { bold: true, size: 12 };

        // Add table headers
        const headerRow = worksheet.getRow(9);
        headerRow.values = ['Sr. No.', 'Name of item', 'SPECIFICATIONS', 'Brand/Manufacturer', 'Registration Status', 'Selection/Rejection', 'Remarks'];
        headerRow.font = { bold: true };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Add data rows
        let rowIndex = 10;
        bidItems.forEach((item, index) => {
            const row = worksheet.getRow(rowIndex);
            
            // Determine evaluation status
            let status = 'Under Evaluation';
            if (item.evaluation_status === 'completed') {
                status = 'Evaluated';
            } else if (item.completed_at) {
                status = 'Completed';
            }
            
            row.values = [
                index + 1,
                item.item_name,
                `${item.item_name} - ${item.required_quantity} ${item.unit || 'units'}`,
                item.manufacturer_brand || 'Not specified',
                'MDIR-0003098', // Default registration status
                status,
                ''
            ];
            
            row.alignment = { vertical: 'middle' };
            rowIndex++;
        });

        // Add borders to all cells
        const borderStyle = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        for (let i = 9; i < rowIndex; i++) {
            const row = worksheet.getRow(i);
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = borderStyle;
            });
        }

        // Save file
        const filename = `Comparative_Analysis_${supplier.business_name || supplier.username}_${Date.now()}.xlsx`;
        const filepath = path.join(this.reportsDir, filename);
        await workbook.xlsx.writeFile(filepath);

        return { filename, filepath };
    }

    async generateTechnicalEvaluationDocx(tenderId, supplierId) {
        const db = getDatabase();
        
        // Get tender and supplier details
        const tender = await new Promise((resolve, reject) => {
            db.get(
                `SELECT dt.*, d.item_name, d.description 
                 FROM demand_tenders dt 
                 JOIN demands d ON dt.demand_id = d.id 
                 WHERE dt.id = ?`,
                [tenderId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const supplier = await new Promise((resolve, reject) => {
            db.get(
                `SELECT s.*, bp.business_name 
                 FROM suppliers s 
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id 
                 WHERE s.id = ?`,
                [supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Get evaluation data for this specific supplier and tender
        const evaluation = await new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM technical_evaluations WHERE tender_id = ? AND supplier_id = ?`,
                [tenderId, supplierId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        // Get knockout clauses for this tender
        const knockoutClauses = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM tender_evaluation_criteria 
                 WHERE tender_id = ? AND is_knockout = 1 
                 ORDER BY id ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Parse knockout clause failures to get yes/no responses
        let knockoutResponses = {};
        
        if (evaluation) {
            if (evaluation.status === 'approved') {
                // If supplier is approved, all knockout clauses should be YES
                knockoutClauses.forEach(clause => {
                    knockoutResponses[clause.id] = 'YES';
                });
            } else if (evaluation.status === 'rejected' && evaluation.knockout_clause_failures) {
                // If supplier is rejected, parse the failure reasons
                try {
                    let failedClauseIds = [];
                    
                    // Handle different formats of knockout_clause_failures
                    if (typeof evaluation.knockout_clause_failures === 'string') {
                        // Could be comma-separated IDs or JSON string
                        if (evaluation.knockout_clause_failures.includes(',')) {
                            // Comma-separated clause IDs
                            failedClauseIds = evaluation.knockout_clause_failures.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                        } else {
                            // Try to parse as JSON
                            try {
                                const parsed = JSON.parse(evaluation.knockout_clause_failures);
                                if (Array.isArray(parsed)) {
                                    failedClauseIds = parsed.map(id => parseInt(id)).filter(id => !isNaN(id));
                                }
                            } catch (jsonError) {
                                // Single ID as string
                                const singleId = parseInt(evaluation.knockout_clause_failures);
                                if (!isNaN(singleId)) {
                                    failedClauseIds = [singleId];
                                }
                            }
                        }
                    }
                    
                    // Set responses based on failed clauses
                    knockoutClauses.forEach(clause => {
                        if (failedClauseIds.includes(clause.id)) {
                            knockoutResponses[clause.id] = 'NO';
                        } else {
                            knockoutResponses[clause.id] = 'YES';
                        }
                    });
                    
                } catch (error) {
                    console.error('Error parsing knockout clause failures:', error);
                    // Default to NO for all if parsing fails and supplier is rejected
                    knockoutClauses.forEach(clause => {
                        knockoutResponses[clause.id] = 'NO';
                    });
                }
            } else {
                // No specific failure data, default based on status
                knockoutClauses.forEach(clause => {
                    knockoutResponses[clause.id] = evaluation.status === 'approved' ? 'YES' : '';
                });
            }
        } else {
            // No evaluation data, default to empty responses
            knockoutClauses.forEach(clause => {
                knockoutResponses[clause.id] = '';
            });
        }

        // Get scoring criteria for this tender
        const scoringCriteria = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM tender_evaluation_criteria 
                 WHERE tender_id = ? AND is_knockout = 0 
                 ORDER BY id ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Parse scoring breakdown to get actual scores
        let scoringResults = {};
        if (evaluation && evaluation.scoring_breakdown) {
            try {
                scoringResults = JSON.parse(evaluation.scoring_breakdown);
            } catch (error) {
                console.error('Error parsing scoring breakdown:', error);
            }
        }

        // Create document
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    // Header
                    new Paragraph({
                        children: [new TextRun({ text: "RAWALPINDI INSTITUTE OF CARDIOLOGY", bold: true, size: 28 })],
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: "Technical Evaluation Committee", bold: true, size: 24 })],
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }), // Empty line
                    new Paragraph({
                        children: [new TextRun({ 
                            text: `TECHNICAL EVALUATION OF ANNUAL TENDER FOR ${tender.item_name?.toUpperCase() || 'SURGICAL & DISPOSABLE ITEMS'} FOR FY 2025-26, REF NO: ${tender.reference_number || 'RIC/PO/2941/25'}, Dated: ${new Date().toLocaleDateString()}.`,
                            bold: true,
                            size: 22
                        })],
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),
                    new Paragraph({
                        children: [new TextRun({ text: "CHECK LIST", bold: true, size: 28 })],
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),
                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),
                    new Paragraph({
                        children: [new TextRun({ text: `Name of Firm: ${supplier.business_name || supplier.username}`, size: 22 })],
                    }),
                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),

                    // Dynamic knockout clauses table generation
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            // Table header
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "S #", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "DETAIL", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "YES / NO", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "PAGE #", bold: true })] })] }),
                                ],
                            }),
                            // Knockout clauses section header
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "KNOCK OUT CLAUSES", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "", bold: true })] })] }),
                                ],
                            }),
                            // Dynamic knockout clauses rows
                            ...knockoutClauses.map((clause, index) => {
                                const response = knockoutResponses[clause.id] || '';
                                return new TableRow({
                                    children: [
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (index + 1).toString() })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: clause.criteria_description || clause.criteria_title })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: response, bold: response === 'NO' })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
                                    ],
                                });
                            }),
                        ],
                    }),

                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),
                    new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),

                    // Evaluation Criteria - only show if there are scoring criteria
                    ...(scoringCriteria.length > 0 ? [
                        new Paragraph({
                            children: [new TextRun({ text: "Evaluation Criteria:", bold: true, size: 22 })],
                        }),

                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: [
                                new TableRow({
                                    children: [
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "S#", bold: true })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Parameters", bold: true })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Detail", bold: true })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Max Marks", bold: true })] })] }),
                                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Obtained", bold: true })] })] }),
                                    ],
                                }),
                                // Dynamic scoring criteria rows
                                ...scoringCriteria.map((criteria, index) => {
                                    const obtainedScore = scoringResults[criteria.id] || '';
                                    return new TableRow({
                                        children: [
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (index + 1).toString() })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: criteria.criteria_title })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: criteria.criteria_description || criteria.minimum_requirement || '' })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: criteria.weightage?.toString() || '0' })] })] }),
                                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: obtainedScore.toString() })] })] }),
                                        ],
                                    });
                                }),
                            ],
                        }),

                        new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }),
                        new Paragraph({
                            children: [
                                new TextRun({ text: `Total Max Marks: ${scoringCriteria.reduce((sum, c) => sum + (parseFloat(c.weightage) || 0), 0)}`, bold: true, size: 22 }),
                                new TextRun({ text: "      Qualifying marks 65%", size: 22 }),
                                new TextRun({ text: `      Total Marks Obtained: ${evaluation?.total_score || '_____'}`, size: 22 })
                            ],
                        }),
                    ] : [
                        new Paragraph({
                            children: [new TextRun({ text: "Knockout Evaluation Only - No Scoring Criteria", bold: true, size: 22 })],
                        }),
                    ]),
                ],
            }],
        });

        // Save file
        const filename = `Technical_Evaluation_${supplier.business_name || supplier.username}_${Date.now()}.docx`;
        const filepath = path.join(this.reportsDir, filename);
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(filepath, buffer);

        return { filename, filepath };
    }

    async getArchivedEvaluations() {
        const db = getDatabase();
        
        const evaluations = await new Promise((resolve, reject) => {
            db.all(
                `SELECT te.*, dt.reference_number, d.item_name, d.description,
                        COUNT(DISTINCT sb.supplier_id) as supplier_count
                 FROM technical_evaluations te
                 JOIN demand_tenders dt ON te.tender_id = dt.id
                 JOIN demands d ON dt.demand_id = d.id
                 LEFT JOIN supplier_bids sb ON dt.id = sb.tender_id
                 WHERE te.status = 'completed'
                 GROUP BY te.id
                 ORDER BY te.created_at DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        return evaluations;
    }

    async getTenderSuppliers(tenderId) {
        const db = getDatabase();
        
        const suppliers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT DISTINCT s.id, s.username, bp.business_name, sb.created_at as bid_date
                 FROM supplier_bids sb
                 JOIN suppliers s ON sb.supplier_id = s.id
                 LEFT JOIN supplier_business_profile bp ON s.id = bp.supplier_id
                 WHERE sb.tender_id = ?
                 ORDER BY sb.created_at ASC`,
                [tenderId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        return suppliers;
    }
}

module.exports = TechnicalReportGenerator;
