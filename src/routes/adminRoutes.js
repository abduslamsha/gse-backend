const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  getDashboardStats,
} = require("../controllers/adminController");

router.get(
  "/dashboard",
  authMiddleware,
  roleMiddleware("ADMIN"),
  getDashboardStats
);

module.exports = router;