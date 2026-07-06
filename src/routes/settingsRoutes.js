const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    getSchoolProfile,
    updateSchoolProfile,
    getActiveAcademicYear,
    getActiveSemester,
    getAcademicYears,
    createAcademicYear,
    updateAcademicYear,
    deleteAcademicYear,
    getSemesters,
    createSemester,
    updateSemester,
    deleteSemester,
    getSystemSettings,
    updateSystemSetting,
    getGradeRanges,
    updateGradeRange,
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getNotifications,
    markNotificationRead,
    createBackup,
    getBackupLogs,
    getFeeTypes,
    createFeeType,
    updateFeeType,
    deleteFeeType,
    getAllSettings,
} = require("../controllers/settingsController");

// All routes require authentication
router.use(authMiddleware);

// ==================== SCHOOL PROFILE ====================
router.get("/profile", getSchoolProfile);
router.put("/profile", roleMiddleware("ADMIN"), updateSchoolProfile);

// ==================== ACTIVE SETTINGS ====================
router.get("/active-academic-year", getActiveAcademicYear);
router.get("/active-semester", getActiveSemester);

// ==================== ACADEMIC YEARS ====================
router.get("/academic-years", getAcademicYears);
router.post("/academic-years", roleMiddleware("ADMIN"), createAcademicYear);
router.put("/academic-years/:id", roleMiddleware("ADMIN"), updateAcademicYear);
router.delete("/academic-years/:id", roleMiddleware("ADMIN"), deleteAcademicYear);

// ==================== SEMESTERS ====================
router.get("/semesters", getSemesters);
router.post("/semesters", roleMiddleware("ADMIN"), createSemester);
router.put("/semesters/:id", roleMiddleware("ADMIN"), updateSemester);
router.delete("/semesters/:id", roleMiddleware("ADMIN"), deleteSemester);

// ==================== SYSTEM SETTINGS ====================
router.get("/system-settings", getSystemSettings);
router.put("/system-settings/:key", roleMiddleware("ADMIN"), updateSystemSetting);

// ==================== GRADE RANGES ====================
router.get("/grade-ranges", getGradeRanges);
router.put("/grade-ranges/:id", roleMiddleware("ADMIN"), updateGradeRange);

// ==================== USER MANAGEMENT ====================
router.get("/users", roleMiddleware("ADMIN"), getUsers);
router.post("/users", roleMiddleware("ADMIN"), createUser);
router.put("/users/:id", roleMiddleware("ADMIN"), updateUser);
router.delete("/users/:id", roleMiddleware("ADMIN"), deleteUser);

// ==================== NOTIFICATIONS ====================
router.get("/notifications/:user_id", getNotifications);
router.put("/notifications/:id/read", markNotificationRead);

// ==================== BACKUP ====================
router.post("/backup", roleMiddleware("ADMIN"), createBackup);
router.get("/backup-logs", roleMiddleware("ADMIN"), getBackupLogs);

// ==================== FEE MANAGEMENT ====================
router.get("/fee-types", getFeeTypes);
router.post("/fee-types", roleMiddleware("ADMIN"), createFeeType);
router.put("/fee-types/:id", roleMiddleware("ADMIN"), updateFeeType);
router.delete("/fee-types/:id", roleMiddleware("ADMIN"), deleteFeeType);

// ==================== EXPORT ALL ====================
router.get("/all", getAllSettings);

module.exports = router;