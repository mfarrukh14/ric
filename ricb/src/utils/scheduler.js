const cron = require('node-cron');
const { processExpiredTenders } = require('../controllers/demandController');

// Run every 30 seconds to check for expired tenders (for faster testing)
const startTenderScheduler = () => {
    console.log('Starting tender auto-award scheduler...');
      // Run every 30 seconds for faster testing and debugging
    cron.schedule('*/30 * * * * *', async () => {
        try {
            const utcTime = new Date().toISOString();
            const pakistanTime = new Date(Date.now() + (5 * 60 * 60 * 1000)).toISOString();
            console.log(`Checking for expired tenders at: UTC: ${utcTime}, Pakistan: ${pakistanTime}`);
            const processedCount = await processExpiredTenders();
            if (processedCount > 0) {
                console.log(`Processed ${processedCount} expired tenders`);
            } else {
                console.log('No expired tenders found');
            }
        } catch (error) {
            console.error('Error in tender scheduler:', error);
        }
    });    // Also run once immediately on startup
    setTimeout(async () => {
        try {
            console.log('Running initial tender check at startup...');
            const utcTime = new Date().toISOString();
            const pakistanTime = new Date(Date.now() + (5 * 60 * 60 * 1000)).toISOString();
            console.log(`Initial check time: UTC: ${utcTime}, Pakistan: ${pakistanTime}`);
            const processedCount = await processExpiredTenders();
            if (processedCount > 0) {
                console.log(`Initial check: Processed ${processedCount} expired tenders`);
            } else {
                console.log('Initial check: No expired tenders found');
            }
        } catch (error) {
            console.error('Error in initial tender check:', error);
        }
    }, 5000); // Wait 5 seconds after startup
};

module.exports = {
    startTenderScheduler
};
