const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
} = require("../controllers/teacherController");

router.post(
  "/create",
  authMiddleware,
  roleMiddleware("ADMIN"),
  createTeacher
);

router.get(
  "/",
  authMiddleware,
  getTeachers
);

router.get(
  "/:id",
  authMiddleware,
  getTeacherById
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  updateTeacher
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  deleteTeacher
);

module.exports = router;