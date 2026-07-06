const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    generateReportCard,
    generateClassReport,
    generateAttendanceReport,
    generateSubjectPerformanceReport,
} = require("../controllers/reportsController");

// All routes require authentication
router.use(authMiddleware);

// Report routes
router.get("/report-card/:student_id", generateReportCard);
router.get("/class-report/:grade_level", generateClassReport);
router.get("/attendance-report/:student_id", generateAttendanceReport);
router.get("/subject-performance/:subject_id", generateSubjectPerformanceReport);

module.exports = router;