const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Middleware to check if user is superadmin
const isSuperAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Superadmin only.' });
    }
};

// Department routes
router.post('/departments', auth, isSuperAdmin, adminController.createDepartment);
router.get('/departments', auth, adminController.listDepartments);
router.delete('/departments/:id', auth, isSuperAdmin, adminController.deleteDepartment);

// Committee routes
router.post('/committees', auth, isSuperAdmin, adminController.createCommittee);
router.get('/committees', auth, adminController.listCommittees);
router.delete('/committees/:id', auth, isSuperAdmin, adminController.deleteCommittee);

// User management routes
router.post('/users', auth, isSuperAdmin, adminController.createUser);
router.get('/users', auth, isSuperAdmin, adminController.listUsers);
router.delete('/users/:id', auth, isSuperAdmin, adminController.deleteUser);

// System configuration routes
router.get('/system-configurations', auth, isSuperAdmin, adminController.getSystemConfigurations);
router.put('/system-configuration', auth, isSuperAdmin, adminController.updateSystemConfiguration);

// Grievance deadline monitoring routes
router.get('/grievance-deadlines', auth, isSuperAdmin, adminController.getGrievanceDeadlines);
router.get('/grievance-deadline-config', auth, isSuperAdmin, adminController.getGrievanceDeadlineConfig);
router.put('/grievance-deadline-config', auth, isSuperAdmin, adminController.updateGrievanceDeadlineConfig);

module.exports = router;
