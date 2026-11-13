const { dbAll, dbRun } = require('../db');
const { buildChecklist, buildSelectionStatement, tenderSuppliers } = require('../reports/technicalReport');

// Tenders whose technical evaluation is complete, with the suppliers who bid.
const getArchivedEvaluations = async (req, res) => {
    try {
        const tenders = await dbAll(
            `SELECT dt.id AS tender_id, dt.tender_number, d.item_name, d.description, dt.created_at,
                    COUNT(DISTINCT te.supplier_id) AS supplier_count, AVG(te.total_score) AS avg_score
             FROM demand_tenders dt
             JOIN demands d ON dt.demand_id = d.id
             JOIN technical_evaluations te ON te.tender_id = dt.id
             WHERE te.completed_at IS NOT NULL
             GROUP BY dt.id, dt.tender_number, d.item_name, d.description, dt.created_at
             ORDER BY dt.created_at DESC`,
        );
        const withSuppliers = await Promise.all(tenders.map(async (tender) => ({
            ...tender,
            title: tender.tender_number || `Tender #${tender.tender_id}`,
            suppliers: (await tenderSuppliers(tender.tender_id)).map((s) => ({
                id: s.id, username: s.username, displayName: s.name, evaluation_status: 'Evaluated',
            })),
        })));
        res.json(withSuppliers);
    } catch (error) {
        console.error('Error fetching archived evaluations:', error);
        res.status(500).json({ error: 'Failed to fetch archived evaluations' });
    }
};

const getTenderSuppliers = async (req, res) => {
    try {
        res.json({ suppliers: await tenderSuppliers(req.params.tenderId) });
    } catch (error) {
        console.error('Get tender suppliers error:', error);
        res.status(500).json({ error: 'Failed to fetch tender suppliers' });
    }
};

/**
 * The supplier named in the URL, among those who bid on this tender. Accepts the id, the
 * business name or the username (older links use the name).
 */
async function bidderFor(tenderId, key) {
    const wanted = decodeURIComponent(String(key)).trim();
    const bidders = await tenderSuppliers(tenderId);
    return bidders.find((s) => String(s.id) === wanted) || bidders.find((s) => s.name === wanted) || bidders.find((s) => s.username === wanted) || null;
}

const sendFile = (res, { buffer, filename }, type) => {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
};

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const downloadComparativeAnalysis = async (req, res) => {
    try {
        const supplier = await bidderFor(req.params.tenderId, req.params.supplierName);
        if (!supplier) return res.status(404).json({ error: 'This supplier did not bid on the tender' });
        sendFile(res, await buildSelectionStatement(req.params.tenderId, supplier), XLSX);
    } catch (error) {
        console.error('Selection statement error:', error);
        res.status(500).json({ error: 'Failed to generate the statement' });
    }
};

const downloadTechnicalEvaluation = async (req, res) => {
    try {
        const supplier = await bidderFor(req.params.tenderId, req.params.supplierName);
        if (!supplier) return res.status(404).json({ error: 'This supplier did not bid on the tender' });
        sendFile(res, await buildChecklist(req.params.tenderId, supplier), DOCX);
    } catch (error) {
        console.error('Checklist error:', error);
        res.status(500).json({ error: 'Failed to generate the checklist' });
    }
};

/** Stamps the tender's evaluation rows as complete once the committee has submitted them. */
const markEvaluationCompleted = async (req, res) => {
    try {
        const { changes } = await dbRun(
            'UPDATE technical_evaluations SET completed_at = CURRENT_TIMESTAMP WHERE tender_id = ?',
            [req.params.tenderId],
        );
        if (!changes) return res.status(404).json({ error: 'No evaluations have been submitted for this tender' });
        res.json({ message: 'Evaluation marked as completed' });
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
    markEvaluationCompleted,
};
