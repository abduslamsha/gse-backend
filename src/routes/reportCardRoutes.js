const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    getGradeSummary,
    getStudentReportData,
    generateReportCardPDF,
    generateReportCard,
    publishReportCard,
    deleteReportCard,
    bulkGenerateReportCards,
    bulkPublishReportCards,
    getGradeLevels,
    getReportCardStatus,
} = require("../controllers/reportCardController");

// All routes require authentication
router.use(authMiddleware);

// ==================== STUDENT ACCESS ROUTES ====================
// Get student report data (students can view their own)
router.get("/student/:student_id", getStudentReportData);

// Get report card status (students can view their own)
router.get("/status/:student_id/:semester/:academic_year", getReportCardStatus);

// Generate PDF report card (students can download their own)
router.get("/pdf/:student_id", generateReportCardPDF);

// ==================== ADMIN ONLY ROUTES ====================
// Get grade levels
router.get("/grade-levels", roleMiddleware("ADMIN"), getGradeLevels);

// Get grade summary (with filters)
router.get("/grade-summary", roleMiddleware("ADMIN"), getGradeSummary);

// Generate report card (save to DB)
router.post("/generate/:student_id", roleMiddleware("ADMIN"), generateReportCard);

// Publish report card
router.put("/publish/:student_id", roleMiddleware("ADMIN"), publishReportCard);

// Delete report card
router.delete("/delete/:student_id", roleMiddleware("ADMIN"), deleteReportCard);

// Bulk generate
router.post("/bulk-generate", roleMiddleware("ADMIN"), bulkGenerateReportCards);

// Bulk publish
router.put("/bulk-publish", roleMiddleware("ADMIN"), bulkPublishReportCards);

module.exports = router;