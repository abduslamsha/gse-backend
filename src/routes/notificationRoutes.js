const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

// Get all notifications for the logged-in user
router.get("/", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await pool.query(
            `
            SELECT * FROM notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC
            `,
            [userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({
            message: "Failed to fetch notifications",
            error: error.message,
        });
    }
});

// Mark notification as read
router.put("/:id/read", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const result = await pool.query(
            `
            UPDATE notifications 
            SET is_read = true 
            WHERE id = $1 AND user_id = $2
            RETURNING *
            `,
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Notification not found",
            });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({
            message: "Failed to mark notification as read",
            error: error.message,
        });
    }
});

// Mark all notifications as read
router.put("/read-all", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        await pool.query(
            `
            UPDATE notifications 
            SET is_read = true 
            WHERE user_id = $1
            `,
            [userId]
        );
        
        res.json({
            message: "All notifications marked as read",
        });
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        res.status(500).json({
            message: "Failed to mark all notifications as read",
            error: error.message,
        });
    }
});

// Delete notification
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const result = await pool.query(
            `
            DELETE FROM notifications 
            WHERE id = $1 AND user_id = $2
            RETURNING *
            `,
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Notification not found",
            });
        }
        
        res.json({
            message: "Notification deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).json({
            message: "Failed to delete notification",
            error: error.message,
        });
    }
});

module.exports = router;