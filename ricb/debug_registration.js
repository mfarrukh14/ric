const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        return;
    }
    console.log('Connected to SQLite database');
});

// Check registration bodies
db.all('SELECT * FROM supplier_registration_bodies LIMIT 5', (err, rows) => {
    if (err) {
        console.error('Error querying registration bodies:', err);
    } else {
        console.log('\n=== Registration Bodies ===');
        console.log(rows);
    }
});

// Check PPRA registrations
db.all('SELECT * FROM supplier_ppra_registrations LIMIT 5', (err, rows) => {
    if (err) {
        console.error('Error querying PPRA registrations:', err);
    } else {
        console.log('\n=== PPRA Registrations ===');
        console.log(rows);
    }
});

// Check business profiles
db.all('SELECT * FROM supplier_business_profile LIMIT 5', (err, rows) => {
    if (err) {
        console.error('Error querying business profiles:', err);
    } else {
        console.log('\n=== Business Profiles ===');
        console.log(rows);
    }
});

// Close database after a delay
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
    });
}, 2000);
