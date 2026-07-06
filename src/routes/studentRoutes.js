const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  getUniqueGrades,
} = require("../controllers/studentController");

// ==================== SPECIFIC ROUTES FIRST ====================
// These must come BEFORE the /:id route

// GET UNIQUE GRADES (for dropdown) - MUST COME FIRST
router.get(
  "/grades",
  authMiddleware,
  getUniqueGrades
);

// GET ALL STUDENTS
router.get(
  "/",
  authMiddleware,
  getStudents
);

// CREATE STUDENT
router.post(
  "/create",
  authMiddleware,
  roleMiddleware("ADMIN"),
  createStudent
);

// ==================== DYNAMIC ROUTES (WITH :id) LAST ====================
// GET ONE STUDENT
router.get(
  "/:id",
  authMiddleware,
  getStudentById
);

// UPDATE STUDENT
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  updateStudent
);

// DELETE STUDENT
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  deleteStudent
);

module.exports = router;