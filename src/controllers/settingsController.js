const pool = require("../config/db");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const bcrypt = require("bcryptjs");

// ==================== SCHOOL PROFILE ====================

const getSchoolProfile = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM school_profile ORDER BY id DESC LIMIT 1"
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "School profile not found",
            });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching school profile:", error);
        res.status(500).json({
            message: "Failed to fetch school profile",
            error: error.message,
        });
    }
};

const updateSchoolProfile = async (req, res) => {
    try {
        const { 
            school_name, address, phone, email, motto, website, 
            logo_url, footer_text, primary_color, secondary_color 
        } = req.body;

        const result = await pool.query(
            `
            UPDATE school_profile 
            SET 
                school_name = COALESCE($1, school_name),
                address = COALESCE($2, address),
                phone = COALESCE($3, phone),
                email = COALESCE($4, email),
                motto = COALESCE($5, motto),
                website = COALESCE($6, website),
                logo_url = COALESCE($7, logo_url),
                footer_text = COALESCE($8, footer_text),
                primary_color = COALESCE($9, primary_color),
                secondary_color = COALESCE($10, secondary_color),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT id FROM school_profile ORDER BY id DESC LIMIT 1)
            RETURNING *
            `,
            [school_name, address, phone, email, motto, website, logo_url, footer_text, primary_color, secondary_color]
        );

        res.json({
            message: "School profile updated successfully",
            profile: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating school profile:", error);
        res.status(500).json({
            message: "Failed to update school profile",
            error: error.message,
        });
    }
};

// ==================== GET ACTIVE ACADEMIC YEAR ====================

const getActiveAcademicYear = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM academic_years WHERE is_active = TRUE LIMIT 1"
        );
        res.json(result.rows[0] || null);
    } catch (error) {
        console.error("Error fetching active academic year:", error);
        res.status(500).json({
            message: "Failed to fetch active academic year",
            error: error.message,
        });
    }
};

// ==================== GET ACTIVE SEMESTER ====================

const getActiveSemester = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM semesters WHERE is_active = TRUE LIMIT 1"
        );
        res.json(result.rows[0] || null);
    } catch (error) {
        console.error("Error fetching active semester:", error);
        res.status(500).json({
            message: "Failed to fetch active semester",
            error: error.message,
        });
    }
};

// ==================== ACADEMIC YEARS CRUD ====================

const getAcademicYears = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM academic_years ORDER BY name DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching academic years:", error);
        res.status(500).json({
            message: "Failed to fetch academic years",
            error: error.message,
        });
    }
};

const createAcademicYear = async (req, res) => {
    try {
        const { name, start_date, end_date, is_active } = req.body;

        if (is_active) {
            await pool.query(
                "UPDATE academic_years SET is_active = FALSE WHERE is_active = TRUE"
            );
        }

        const result = await pool.query(
            `
            INSERT INTO academic_years (name, start_date, end_date, is_active)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [name, start_date, end_date, is_active || false]
        );

        res.status(201).json({
            message: "Academic year created successfully",
            academic_year: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating academic year:", error);
        res.status(500).json({
            message: "Failed to create academic year",
            error: error.message,
        });
    }
};

const updateAcademicYear = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, start_date, end_date, is_active } = req.body;

        const checkResult = await pool.query(
            "SELECT * FROM academic_years WHERE id = $1",
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                message: "Academic year not found",
            });
        }

        if (is_active) {
            await pool.query(
                "UPDATE academic_years SET is_active = FALSE WHERE is_active = TRUE AND id != $1",
                [id]
            );
        }

        const result = await pool.query(
            `
            UPDATE academic_years 
            SET 
                name = COALESCE($1, name),
                start_date = COALESCE($2, start_date),
                end_date = COALESCE($3, end_date),
                is_active = COALESCE($4, is_active)
            WHERE id = $5
            RETURNING *
            `,
            [name, start_date, end_date, is_active, id]
        );

        res.json({
            message: "Academic year updated successfully",
            academic_year: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating academic year:", error);
        res.status(500).json({
            message: "Failed to update academic year",
            error: error.message,
        });
    }
};

const deleteAcademicYear = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM academic_years WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Academic year not found",
            });
        }

        res.json({
            message: "Academic year deleted successfully",
            academic_year: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting academic year:", error);
        res.status(500).json({
            message: "Failed to delete academic year",
            error: error.message,
        });
    }
};

// ==================== SEMESTERS CRUD ====================

const getSemesters = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT s.*, a.name as academic_year_name 
            FROM semesters s
            LEFT JOIN academic_years a ON s.academic_year_id = a.id
            ORDER BY s.name DESC
            `
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching semesters:", error);
        res.status(500).json({
            message: "Failed to fetch semesters",
            error: error.message,
        });
    }
};

const createSemester = async (req, res) => {
    try {
        const { name, academic_year_id, start_date, end_date, is_active } = req.body;

        if (is_active) {
            await pool.query(
                "UPDATE semesters SET is_active = FALSE WHERE is_active = TRUE"
            );
        }

        const result = await pool.query(
            `
            INSERT INTO semesters (name, academic_year_id, start_date, end_date, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [name, academic_year_id, start_date, end_date, is_active || false]
        );

        res.status(201).json({
            message: "Semester created successfully",
            semester: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating semester:", error);
        res.status(500).json({
            message: "Failed to create semester",
            error: error.message,
        });
    }
};

const updateSemester = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, academic_year_id, start_date, end_date, is_active } = req.body;

        const checkResult = await pool.query(
            "SELECT * FROM semesters WHERE id = $1",
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                message: "Semester not found",
            });
        }

        if (is_active) {
            await pool.query(
                "UPDATE semesters SET is_active = FALSE WHERE is_active = TRUE AND id != $1",
                [id]
            );
        }

        const result = await pool.query(
            `
            UPDATE semesters 
            SET 
                name = COALESCE($1, name),
                academic_year_id = COALESCE($2, academic_year_id),
                start_date = COALESCE($3, start_date),
                end_date = COALESCE($4, end_date),
                is_active = COALESCE($5, is_active)
            WHERE id = $6
            RETURNING *
            `,
            [name, academic_year_id, start_date, end_date, is_active, id]
        );

        res.json({
            message: "Semester updated successfully",
            semester: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating semester:", error);
        res.status(500).json({
            message: "Failed to update semester",
            error: error.message,
        });
    }
};

const deleteSemester = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM semesters WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Semester not found",
            });
        }

        res.json({
            message: "Semester deleted successfully",
            semester: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting semester:", error);
        res.status(500).json({
            message: "Failed to delete semester",
            error: error.message,
        });
    }
};

// ==================== SYSTEM SETTINGS ====================

const getSystemSettings = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM system_settings ORDER BY setting_key"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching system settings:", error);
        res.status(500).json({
            message: "Failed to fetch system settings",
            error: error.message,
        });
    }
};

const updateSystemSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        const result = await pool.query(
            `
            UPDATE system_settings 
            SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
            WHERE setting_key = $2
            RETURNING *
            `,
            [value, key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Setting not found",
            });
        }

        res.json({
            message: "Setting updated successfully",
            setting: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating system setting:", error);
        res.status(500).json({
            message: "Failed to update system setting",
            error: error.message,
        });
    }
};

// ==================== GRADE RANGES ====================

const getGradeRanges = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM grade_ranges ORDER BY min_mark DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching grade ranges:", error);
        res.status(500).json({
            message: "Failed to fetch grade ranges",
            error: error.message,
        });
    }
};

const updateGradeRange = async (req, res) => {
    try {
        const { id } = req.params;
        const { min_mark, max_mark, description, points } = req.body;

        const result = await pool.query(
            `
            UPDATE grade_ranges 
            SET 
                min_mark = COALESCE($1, min_mark),
                max_mark = COALESCE($2, max_mark),
                description = COALESCE($3, description),
                points = COALESCE($4, points)
            WHERE id = $5
            RETURNING *
            `,
            [min_mark, max_mark, description, points, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Grade range not found",
            });
        }

        res.json({
            message: "Grade range updated successfully",
            grade_range: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating grade range:", error);
        res.status(500).json({
            message: "Failed to update grade range",
            error: error.message,
        });
    }
};

// ==================== USER MANAGEMENT ====================

const getUsers = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT id, username, email, role, phone, is_active, last_login, created_at, first_name, last_name
            FROM users 
            ORDER BY created_at DESC
            `
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            message: "Failed to fetch users",
            error: error.message,
        });
    }
};

const createUser = async (req, res) => {
    try {
        const { username, email, password, role, phone, first_name, last_name } = req.body;

        if (!password) {
            return res.status(400).json({
                message: "Password is required",
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            "SELECT * FROM users WHERE email = $1 OR username = $2",
            [email, username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                message: "User with this email or username already exists",
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `
            INSERT INTO users (username, email, password, role, phone, is_active, first_name, last_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, username, email, role, phone, is_active, first_name, last_name, created_at
            `,
            [username, email, hashedPassword, role || 'STAFF', phone || null, true, first_name || username, last_name || '']
        );

        res.status(201).json({
            message: "User created successfully",
            user: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({
            message: "Failed to create user",
            error: error.message,
        });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, role, phone, is_active, first_name, last_name } = req.body;

        const result = await pool.query(
            `
            UPDATE users 
            SET 
                username = COALESCE($1, username),
                email = COALESCE($2, email),
                role = COALESCE($3, role),
                phone = COALESCE($4, phone),
                is_active = COALESCE($5, is_active),
                first_name = COALESCE($6, first_name),
                last_name = COALESCE($7, last_name)
            WHERE id = $8
            RETURNING id, username, email, role, phone, is_active, first_name, last_name, created_at
            `,
            [username, email, role, phone, is_active, first_name, last_name, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        res.json({
            message: "User updated successfully",
            user: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({
            message: "Failed to update user",
            error: error.message,
        });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                message: "Cannot delete your own account",
            });
        }

        const result = await pool.query(
            "DELETE FROM users WHERE id = $1 RETURNING id",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        res.json({
            message: "User deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({
            message: "Failed to delete user",
            error: error.message,
        });
    }
};

// ==================== NOTIFICATIONS ====================

const getNotifications = async (req, res) => {
    try {
        const { user_id } = req.params;
        const result = await pool.query(
            `
            SELECT * FROM notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC
            LIMIT 50
            `,
            [user_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({
            message: "Failed to fetch notifications",
            error: error.message,
        });
    }
};

const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE id = $1 
            RETURNING *
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Notification not found",
            });
        }

        res.json({
            message: "Notification marked as read",
            notification: result.rows[0],
        });
    } catch (error) {
        console.error("Error marking notification read:", error);
        res.status(500).json({
            message: "Failed to mark notification as read",
            error: error.message,
        });
    }
};

// ==================== BACKUP ====================

const createBackup = async (req, res) => {
    try {
        const backupDir = path.join(__dirname, "../../backups");
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `backup_${timestamp}.sql`;
        const filepath = path.join(backupDir, filename);

        const logResult = await pool.query(
            `
            INSERT INTO backup_logs (backup_type, file_name, status, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            ["database", filename, "pending", req.user.id]
        );

        const logId = logResult.rows[0].id;

        const { database_url } = process.env;
        const command = `pg_dump --clean --if-exists --no-owner --no-privileges "${database_url}" > "${filepath}"`;

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                await pool.query(
                    `
                    UPDATE backup_logs 
                    SET status = 'failed', completed_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    `,
                    [logId]
                );
                console.error("Backup failed:", error);
                return;
            }

            try {
                const stats = fs.statSync(filepath);
                const fileSize = (stats.size / 1024).toFixed(2) + " KB";

                await pool.query(
                    `
                    UPDATE backup_logs 
                    SET status = 'completed', file_size = $1, completed_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    `,
                    [fileSize, logId]
                );
            } catch (err) {
                console.error("Error updating backup log:", err);
            }
        });

        res.json({
            message: "Backup started successfully",
            filename: filename,
            log_id: logId,
        });
    } catch (error) {
        console.error("Error creating backup:", error);
        res.status(500).json({
            message: "Failed to create backup",
            error: error.message,
        });
    }
};

const getBackupLogs = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT * FROM backup_logs 
            ORDER BY created_at DESC 
            LIMIT 20
            `
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching backup logs:", error);
        res.status(500).json({
            message: "Failed to fetch backup logs",
            error: error.message,
        });
    }
};

// ==================== FEE MANAGEMENT ====================

const getFeeTypes = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM fee_types ORDER BY name"
        );
        res.json(result.rows);
    } catch (error) {
        if (error.code === '42P01') {
            return res.json([]);
        }
        console.error("Error fetching fee types:", error);
        res.status(500).json({
            message: "Failed to fetch fee types",
            error: error.message,
        });
    }
};

const createFeeType = async (req, res) => {
    try {
        const { name, description, amount, is_required, grade_level } = req.body;

        const result = await pool.query(
            `
            INSERT INTO fee_types (name, description, amount, is_required, grade_level)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [name, description, amount, is_required !== undefined ? is_required : true, grade_level || null]
        );

        res.status(201).json({
            message: "Fee type created successfully",
            fee_type: result.rows[0],
        });
    } catch (error) {
        if (error.code === '42P01') {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS fee_types (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    amount DECIMAL(10,2) NOT NULL,
                    is_required BOOLEAN DEFAULT TRUE,
                    grade_level VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            return createFeeType(req, res);
        }
        console.error("Error creating fee type:", error);
        res.status(500).json({
            message: "Failed to create fee type",
            error: error.message,
        });
    }
};

const updateFeeType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, amount, is_required, grade_level } = req.body;

        const result = await pool.query(
            `
            UPDATE fee_types 
            SET 
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                amount = COALESCE($3, amount),
                is_required = COALESCE($4, is_required),
                grade_level = $5,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *
            `,
            [name, description, amount, is_required, grade_level || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Fee type not found",
            });
        }

        res.json({
            message: "Fee type updated successfully",
            fee_type: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating fee type:", error);
        res.status(500).json({
            message: "Failed to update fee type",
            error: error.message,
        });
    }
};

const deleteFeeType = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM fee_types WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Fee type not found",
            });
        }

        res.json({
            message: "Fee type deleted successfully",
            fee_type: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting fee type:", error);
        res.status(500).json({
            message: "Failed to delete fee type",
            error: error.message,
        });
    }
};

// ==================== GET ALL SETTINGS ====================

const getAllSettings = async (req, res) => {
    try {
        const profile = await pool.query(
            "SELECT * FROM school_profile ORDER BY id DESC LIMIT 1"
        );
        
        const academicYears = await pool.query(
            "SELECT * FROM academic_years ORDER BY name DESC"
        );
        
        const semesters = await pool.query(
            "SELECT * FROM semesters ORDER BY name DESC"
        );
        
        const systemSettings = await pool.query(
            "SELECT * FROM system_settings ORDER BY setting_key"
        );
        
        const gradeRanges = await pool.query(
            "SELECT * FROM grade_ranges ORDER BY min_mark DESC"
        );

        let feeTypes = [];
        try {
            const feeResult = await pool.query(
                "SELECT * FROM fee_types ORDER BY name"
            );
            feeTypes = feeResult.rows;
        } catch (err) {
            console.log("Fee types table not yet created, skipping...");
        }

        let users = [];
        try {
            const usersResult = await pool.query(
                "SELECT id, username, email, role, phone, is_active, first_name, last_name, created_at FROM users ORDER BY created_at DESC"
            );
            users = usersResult.rows;
        } catch (err) {
            console.log("Users table error, skipping...");
        }

        let backupLogs = [];
        try {
            const backupResult = await pool.query(
                "SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 10"
            );
            backupLogs = backupResult.rows;
        } catch (err) {
            console.log("Backup logs table not yet created, skipping...");
        }

        res.json({
            school_profile: profile.rows[0] || null,
            academic_years: academicYears.rows,
            semesters: semesters.rows,
            system_settings: systemSettings.rows,
            grade_ranges: gradeRanges.rows,
            fee_types: feeTypes,
            users: users,
            backup_logs: backupLogs,
        });
    } catch (error) {
        console.error("Error fetching all settings:", error);
        res.status(500).json({
            message: "Failed to fetch all settings",
            error: error.message,
        });
    }
};

module.exports = {
    getSchoolProfile,
    updateSchoolProfile,
    getActiveAcademicYear,
    getActiveSemester,
    getAcademicYears,
    createAcademicYear,
    updateAcademicYear,
    deleteAcademicYear,
    getSemesters,
    createSemester,
    updateSemester,
    deleteSemester,
    getSystemSettings,
    updateSystemSetting,
    getGradeRanges,
    updateGradeRange,
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getNotifications,
    markNotificationRead,
    createBackup,
    getBackupLogs,
    getFeeTypes,
    createFeeType,
    updateFeeType,
    deleteFeeType,
    getAllSettings,
};