const express = require('express');
const { staffOnly, superAdminOnly } = require('../middleware/auth');
const admin = require('../controllers/adminController');

const router = express.Router();

// Department and committee lists feed dropdowns across the app.
router.get('/departments', staffOnly, admin.listDepartments);
router.get('/committees', staffOnly, admin.listCommittees);

router.use(superAdminOnly);
router.post('/departments', admin.createDepartment);
router.delete('/departments/:id', admin.deleteDepartment);
router.post('/committees', admin.createCommittee);
router.delete('/committees/:id', admin.deleteCommittee);

router.post('/users', admin.createUser);
router.get('/users', admin.listUsers);
router.delete('/users/:id', admin.deleteUser);
router.get('/users/:id/password', admin.revealUserPassword);
router.post('/users/:id/reset-password', admin.resetUserPassword);
router.put('/users/hod-status', admin.updateHodStatus);
router.put('/users/eproc-status', admin.updateEprocStatus);

router.get('/system-configurations', admin.getSystemConfigurations);
router.put('/system-configuration', admin.updateSystemConfiguration);

router.get('/grievance-deadlines', admin.getGrievanceDeadlines);
router.get('/grievance-deadline-config', admin.getGrievanceDeadlineConfig);
router.put('/grievance-deadline-config', admin.updateGrievanceDeadlineConfig);

module.exports = router;
