const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
    createAnnouncement,
    getAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    togglePublish,
} = require("../controllers/announcementController");

router.use(authMiddleware);

router.post("/create", roleMiddleware("ADMIN"), createAnnouncement);
router.get("/", getAnnouncements);
router.put("/:id", roleMiddleware("ADMIN"), updateAnnouncement);
router.delete("/:id", roleMiddleware("ADMIN"), deleteAnnouncement);
router.patch("/:id/toggle", roleMiddleware("ADMIN"), togglePublish);

module.exports = router;