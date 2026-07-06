const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  createSubject,
  getSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  // Teacher-Subject Assignment
  assignSubjectToTeacher,
  removeSubjectFromTeacher,
  getTeacherSubjects,
  getAllTeacherAssignments,
  getSubjectsNotAssignedToTeacher,
  // Student-Subject Enrollment
  enrollStudentInSubject,
  removeStudentFromSubject,
  getStudentSubjects,
  getAllStudentEnrollments,
  getSubjectsNotEnrolledByStudent,
} = require("../controllers/subjectController");

// All routes require authentication
router.use(authMiddleware);

// ==================== SUBJECT CRUD ====================
router.post("/create", roleMiddleware("ADMIN"), createSubject);
router.get("/", getSubjects);

// ==================== TEACHER-SUBJECT ASSIGNMENT (MUST COME BEFORE /:id) ====================
router.post("/assign-teacher", roleMiddleware("ADMIN"), assignSubjectToTeacher);
router.delete("/remove-teacher/:teacher_id/:subject_id", roleMiddleware("ADMIN"), removeSubjectFromTeacher);
router.get("/teacher/:teacher_id", getTeacherSubjects);
router.get("/teacher-assignments/all", getAllTeacherAssignments);
router.get("/teacher/:teacher_id/available", getSubjectsNotAssignedToTeacher);

// ==================== STUDENT-SUBJECT ENROLLMENT (MUST COME BEFORE /:id) ====================
router.post("/enroll-student", roleMiddleware("ADMIN"), enrollStudentInSubject);
router.delete("/remove-student/:student_id/:subject_id", roleMiddleware("ADMIN"), removeStudentFromSubject);
router.get("/student/:student_id", getStudentSubjects);
router.get("/student-enrollments/all", getAllStudentEnrollments);
router.get("/student/:student_id/available", getSubjectsNotEnrolledByStudent);

// ==================== SUBJECT CRUD WITH ID (MUST COME LAST) ====================
router.get("/:id", getSubjectById);
router.put("/:id", roleMiddleware("ADMIN"), updateSubject);
router.delete("/:id", roleMiddleware("ADMIN"), deleteSubject);

module.exports = router;