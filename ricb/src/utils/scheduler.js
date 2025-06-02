const cron = require('node-cron');
const { processExpiredTenders } = require('../controllers/demandController');

// Run every 30 seconds to check for expired tenders (for faster testing)
const startTenderScheduler = () => {
    console.log('Starting tender auto-award scheduler...');
    // Run every 30 seconds for faster testing and debugging
    cron.schedule('*/30 * * * * *', async () => {
        try {
            const currentTime = new Date().toLocaleString('en-US', { 
                timeZone: 'Asia/Karachi',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            console.log(`Checking for expired tenders at: ${currentTime} (Pakistan Time)`);
            const processedCount = await processExpiredTenders();
            if (processedCount > 0) {
                console.log(`Processed ${processedCount} expired tenders`);
            } else {
                console.log('No expired tenders found');
            }
        } catch (error) {
            console.error('Error in tender scheduler:', error);
        }    });
    // Also run once immediately on startup
    setTimeout(async () => {
        try {
            console.log('Running initial tender check at startup...');
            const currentTime = new Date().toLocaleString('en-US', { 
                timeZone: 'Asia/Karachi',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            console.log(`Initial check time: ${currentTime} (Pakistan Time)`);
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
