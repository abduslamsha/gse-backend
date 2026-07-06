const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  createAdmission,
  getAdmissions,
  getAdmissionById,
  updateAdmission,  // ← Add this
  deleteAdmission,
  approveAdmission,
} = require("../controllers/admissionController");

// All routes require authentication
router.use(authMiddleware);

// Routes
router.post("/create", roleMiddleware("ADMIN"), createAdmission);
router.get("/", getAdmissions);
router.get("/:id", getAdmissionById);
router.put("/:id", roleMiddleware("ADMIN"), updateAdmission);  // ← Add this
router.put("/approve/:id", roleMiddleware("ADMIN"), approveAdmission);
router.delete("/:id", roleMiddleware("ADMIN"), deleteAdmission);

module.exports = router;