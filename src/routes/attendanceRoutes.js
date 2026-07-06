const express = require("express");
const router = express.Router();

const authMiddleware =
  require("../middleware/authMiddleware");

const roleMiddleware =
  require("../middleware/roleMiddleware");

const {
  markAttendance,
  getAttendance,
  deleteAttendance,
} = require(
  "../controllers/attendanceController"
);

router.post(
  "/create",
  authMiddleware,
  roleMiddleware("ADMIN"),
  markAttendance
);

router.get(
  "/",
  authMiddleware,
  getAttendance
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  deleteAttendance
);

module.exports = router;