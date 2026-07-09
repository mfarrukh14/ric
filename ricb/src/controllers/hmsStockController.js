const { getHmsStockPool, sql } = require('../config/hmsStockDb');

// Look up one item's real stock-on-hand in the hospital inventory system by name.
// There's no shared ID between eProc and HMS items, so match by name: try an
// exact (case-insensitive) match first, then fall back to the shortest
// contains-match so "Laptop" can still find "Dell Laptop 15-inch" etc.
const findStockForItemName = async (pool, itemName) => {
    const exactResult = await pool.request()
        .input('exact', sql.NVarChar, itemName)
        .query(`
            SELECT TOP 1 Id, Name FROM Inv.Items
            WHERE IsActive = 1 AND LOWER(Name) = LOWER(@exact)
        `);

    let matchedItem = exactResult.recordset[0];

    if (!matchedItem) {
        const likeResult = await pool.request()
            .input('like', sql.NVarChar, `%${itemName}%`)
            .query(`
                SELECT TOP 1 Id, Name FROM Inv.Items
                WHERE IsActive = 1 AND Name LIKE @like
                ORDER BY LEN(Name) ASC
            `);
        matchedItem = likeResult.recordset[0];
    }

    if (!matchedItem) {
        return { found: false };
    }

    const stockResult = await pool.request()
        .input('itemId', sql.Int, matchedItem.Id)
        .query(`
            SELECT ISNULL(SUM(TotalItems), 0) AS totalStock
            FROM Inv.Stocks
            WHERE ItemId = @itemId AND IsActive = 1
        `);

    return {
        found: true,
        matchedItemId: matchedItem.Id,
        matchedItemName: matchedItem.Name,
        totalStock: stockResult.recordset[0]?.totalStock || 0
    };
};

// POST /hms-stock/lookup  { itemNames: string[] }
// Best-effort: if the HMS database is unreachable, returns "not found" for every
// name rather than failing, so the fulfillment page always still works with
// manual entry.
const lookupStockForItems = async (req, res) => {
    const { itemNames } = req.body;

    if (!Array.isArray(itemNames) || itemNames.length === 0) {
        return res.status(400).json({ message: 'itemNames array is required' });
    }

    const uniqueNames = [...new Set(itemNames.filter(Boolean))];

    try {
        const pool = await getHmsStockPool();
        const results = {};

        for (const name of uniqueNames) {
            try {
                results[name] = await findStockForItemName(pool, name);
            } catch (err) {
                console.error(`HMS stock lookup failed for "${name}":`, err.message);
                results[name] = { found: false };
            }
        }

        res.json(results);
    } catch (error) {
        console.error('Error connecting to HMS inventory database:', error.message);
        const fallback = uniqueNames.reduce((acc, name) => {
            acc[name] = { found: false, unavailable: true };
            return acc;
        }, {});
        res.json(fallback);
    }
};

module.exports = { lookupStockForItems };
