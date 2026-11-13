/** sqlite3-style (sql, [params], [callback]) arguments, shared by both adapters. */
const parseArgs = (paramsOrCb, maybeCb) =>
    typeof paramsOrCb === 'function'
        ? { params: [], callback: paramsOrCb }
        : { params: paramsOrCb ?? [], callback: maybeCb || null };

/**
 * Invokes a query callback. Anything the callback throws is logged rather than
 * rethrown: it is a bug in that handler, not a database error, and letting it
 * escape would surface as an unhandled rejection and stop the server.
 */
const deliver = (callback, context, ...args) => {
    if (!callback) return;
    try {
        callback.apply(context, args);
    } catch (err) {
        console.error('Error thrown inside a database callback:', err);
    }
};

module.exports = { parseArgs, deliver };
