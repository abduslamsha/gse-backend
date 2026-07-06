const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    getTeacherDashboard,
    getTeacherSubjects,
    getStudentsBySubject,
    takeAttendance,
    getAttendanceBySubject,
    createAssessment,
    updateAssessment,
    deleteAssessment,
    getStudentGradesBySubject,
    getTeacherProfile,
} = require("../controllers/teacherPortalController");

// All routes require authentication and TEACHER role
router.use(authMiddleware);
router.use(roleMiddleware("TEACHER"));

// Dashboard
router.get("/dashboard", getTeacherDashboard);

// Subjects
router.get("/subjects", getTeacherSubjects);

// Students
router.get("/students/:subject_id", getStudentsBySubject);

// Attendance
router.post("/attendance", takeAttendance);
router.get("/attendance/:subject_id", getAttendanceBySubject);

// Assessments
router.post("/assessments", createAssessment);
router.put("/assessments/:id", updateAssessment);
router.delete("/assessments/:id", deleteAssessment);

// Grades
router.get("/grades/:subject_id", getStudentGradesBySubject);

// Profile
router.get("/profile", getTeacherProfile);

module.exports = router;