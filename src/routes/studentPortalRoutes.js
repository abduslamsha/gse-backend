const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    studentLogin,
    getStudentDashboard,
    getStudentGrades,
    getStudentAttendance,
    getStudentReportCard,
    changeStudentPassword,
    getStudentProfile,
    getStudentSchoolProfile,
    forgotPassword,
    checkTemporaryPassword,
    changePasswordFirstTime,
    getStudentAnnouncements,
    getStudentAssignments,
    getStudentAttendanceCalendar,
    downloadStudentReportCard,
} = require("../controllers/studentPortalController");

// Public routes
router.post("/login", studentLogin);
router.post("/forgot-password", forgotPassword);

// Protected routes
router.use(authMiddleware);

// Password
router.get("/check-password", checkTemporaryPassword);
router.put("/change-password-first", changePasswordFirstTime);
router.put("/change-password", changeStudentPassword);

// Dashboard
router.get("/dashboard", getStudentDashboard);
router.get("/grades", getStudentGrades);
router.get("/attendance", getStudentAttendance);
router.get("/attendance-calendar", getStudentAttendanceCalendar);
router.get("/report-card", getStudentReportCard);
router.get("/report-card-pdf", downloadStudentReportCard);
router.get("/profile", getStudentProfile);
router.get("/school-profile", getStudentSchoolProfile);

// Announcements & Assignments
router.get("/announcements", getStudentAnnouncements);
router.get("/assignments", getStudentAssignments);

module.exports = router;