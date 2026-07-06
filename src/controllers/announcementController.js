const pool = require("../config/db");

// CREATE ANNOUNCEMENT
const createAnnouncement = async (req, res) => {
    try {
        const { title, content, target_audience, grade_level } = req.body;
        const userId = req.user.id;

        if (!title || !content) {
            return res.status(400).json({
                message: "Title and content are required",
            });
        }

        const result = await pool.query(
            `
            INSERT INTO announcements (title, content, target_audience, grade_level, created_by, is_published)
            VALUES ($1, $2, $3, $4, $5, true)
            RETURNING *
            `,
            [title, content, target_audience || 'ALL', grade_level || null, userId]
        );

        res.status(201).json({
            message: "Announcement created successfully",
            announcement: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating announcement:", error);
        res.status(500).json({
            message: "Failed to create announcement",
            error: error.message,
        });
    }
};

// GET ALL ANNOUNCEMENTS (Admin)
const getAnnouncements = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT a.*, u.username as created_by_name
            FROM announcements a
            LEFT JOIN users u ON a.created_by = u.id
            ORDER BY a.created_at DESC
            `
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching announcements:", error);
        res.status(500).json({
            message: "Failed to fetch announcements",
            error: error.message,
        });
    }
};

// UPDATE ANNOUNCEMENT
const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, target_audience, grade_level, is_published } = req.body;

        const result = await pool.query(
            `
            UPDATE announcements 
            SET 
                title = COALESCE($1, title),
                content = COALESCE($2, content),
                target_audience = COALESCE($3, target_audience),
                grade_level = $4,
                is_published = COALESCE($5, is_published),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
            `,
            [title, content, target_audience, grade_level || null, is_published, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Announcement not found",
            });
        }

        res.json({
            message: "Announcement updated successfully",
            announcement: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating announcement:", error);
        res.status(500).json({
            message: "Failed to update announcement",
            error: error.message,
        });
    }
};

// DELETE ANNOUNCEMENT
const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM announcements WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Announcement not found",
            });
        }

        res.json({
            message: "Announcement deleted successfully",
            announcement: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting announcement:", error);
        res.status(500).json({
            message: "Failed to delete announcement",
            error: error.message,
        });
    }
};

// TOGGLE PUBLISH STATUS
const togglePublish = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_published } = req.body;

        const result = await pool.query(
            `
            UPDATE announcements 
            SET 
                is_published = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
            `,
            [is_published, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Announcement not found",
            });
        }

        res.json({
            message: `Announcement ${is_published ? 'published' : 'unpublished'} successfully`,
            announcement: result.rows[0],
        });
    } catch (error) {
        console.error("Error toggling publish status:", error);
        res.status(500).json({
            message: "Failed to toggle publish status",
            error: error.message,
        });
    }
};

module.exports = {
    createAnnouncement,
    getAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    togglePublish,
};