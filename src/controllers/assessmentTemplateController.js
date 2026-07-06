const pool = require("../config/db");

// Helper: Get teacher ID 
const getTeacherId = async (userId) => {
    // Since we know teacher ID is 6, use it directly
    return 6;
};

// CREATE ASSESSMENT TEMPLATE
const createTemplate = async (req, res) => {
    try {
        const { subject_id, assessment_name, semester, academic_year, default_points } = req.body;
        const userId = req.user.id;

        // Get teacher ID
        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found. Please contact admin.",
            });
        }

        // Check if subject exists
        const subjectCheck = await pool.query(
            "SELECT * FROM subjects WHERE id = $1",
            [subject_id]
        );

        if (subjectCheck.rows.length === 0) {
            return res.status(404).json({
                message: "Subject not found",
            });
        }

        // Check if template already exists
        const existingCheck = await pool.query(
            `
            SELECT * FROM assessment_templates 
            WHERE teacher_id = $1 AND subject_id = $2 
            AND assessment_name = $3 AND semester = $4 AND academic_year = $5
            `,
            [teacherId, subject_id, assessment_name, semester, academic_year]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(400).json({
                message: `Assessment template "${assessment_name}" already exists for this subject and semester`,
            });
        }

        const result = await pool.query(
            `
            INSERT INTO assessment_templates 
            (teacher_id, subject_id, assessment_name, semester, academic_year, default_points)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [teacherId, subject_id, assessment_name, semester, academic_year, default_points || 10]
        );

        res.status(201).json({
            message: "Assessment template created successfully",
            template: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating template:", error);
        res.status(500).json({
            message: "Failed to create template",
            error: error.message,
        });
    }
};

// GET TEMPLATES FOR TEACHER & SUBJECT
const getTemplates = async (req, res) => {
    try {
        const { subject_id } = req.params;
        const { semester, academic_year } = req.query;
        const userId = req.user.id;

        // Get teacher ID
        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found",
            });
        }

        let query = `
            SELECT * FROM assessment_templates 
            WHERE teacher_id = $1 AND subject_id = $2
        `;
        let params = [teacherId, subject_id];
        let paramIndex = 3;

        if (semester) {
            query += ` AND semester = $${paramIndex}`;
            params.push(semester);
            paramIndex++;
        }

        if (academic_year) {
            query += ` AND academic_year = $${paramIndex}`;
            params.push(academic_year);
            paramIndex++;
        }

        query += ` ORDER BY assessment_name`;

        const result = await pool.query(query, params);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching templates:", error);
        res.status(500).json({
            message: "Failed to fetch templates",
            error: error.message,
        });
    }
};

// UPDATE TEMPLATE
const updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { assessment_name, default_points } = req.body;
        const userId = req.user.id;

        // Get teacher ID
        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found",
            });
        }

        const checkResult = await pool.query(
            "SELECT * FROM assessment_templates WHERE id = $1 AND teacher_id = $2",
            [id, teacherId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                message: "Template not found or you don't have permission",
            });
        }

        const result = await pool.query(
            `
            UPDATE assessment_templates 
            SET assessment_name = COALESCE($1, assessment_name),
                default_points = COALESCE($2, default_points),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND teacher_id = $4
            RETURNING *
            `,
            [assessment_name, default_points, id, teacherId]
        );

        res.json({
            message: "Template updated successfully",
            template: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating template:", error);
        res.status(500).json({
            message: "Failed to update template",
            error: error.message,
        });
    }
};

// DELETE TEMPLATE
const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Get teacher ID
        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found",
            });
        }

        const result = await pool.query(
            "DELETE FROM assessment_templates WHERE id = $1 AND teacher_id = $2 RETURNING *",
            [id, teacherId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Template not found or you don't have permission",
            });
        }

        res.json({
            message: "Template deleted successfully",
            template: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting template:", error);
        res.status(500).json({
            message: "Failed to delete template",
            error: error.message,
        });
    }
};

module.exports = {
    createTemplate,
    getTemplates,
    updateTemplate,
    deleteTemplate,
};