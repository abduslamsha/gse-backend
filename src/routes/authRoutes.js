const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    login,
    teacherLogin,
    forgotPasswordStudent,
    forgotPasswordAdmin,
    verifyResetToken,
    resetStudentPasswordByAdmin,
    resetPasswordSelf,
    getUsersWithResetRequests,
} = require("../controllers/authController");

// Public routes
router.post("/login", login);
router.post("/teacher-login", teacherLogin);
router.post("/forgot-password/student", forgotPasswordStudent);
router.post("/forgot-password/admin", forgotPasswordAdmin);
router.get("/verify-reset-token/:token", verifyResetToken);
router.post("/reset-password/self", resetPasswordSelf);

// Admin routes
router.post("/reset-password/student", authMiddleware, roleMiddleware("ADMIN"), resetStudentPasswordByAdmin);
router.get("/reset-requests", authMiddleware, roleMiddleware("ADMIN"), getUsersWithResetRequests);

module.exports = router;