const pool = require("../config/db");
const bcrypt = require("bcryptjs");

// Helper: Generate Student ID
const generateStudentId = async () => {
    const result = await pool.query(
        "SELECT student_id FROM students ORDER BY id DESC LIMIT 1"
    );
    if (result.rows.length === 0) {
        return 'STD-1001';
    }
    const lastId = result.rows[0].student_id;
    const lastNumber = parseInt(lastId.split('-')[1], 10);
    return `STD-${lastNumber + 1}`;
};

// Helper: Generate Application Number
const generateApplicationNo = async () => {
    const result = await pool.query(
        "SELECT application_no FROM admissions ORDER BY id DESC LIMIT 1"
    );
    if (result.rows.length === 0) {
        return 'APP-1001';
    }
    const lastNo = result.rows[0].application_no;
    const lastNumber = parseInt(lastNo.split('-')[1], 10);
    return `APP-${lastNumber + 1}`;
};

// Helper: Generate Username
const generateUsername = (firstName, lastName) => {
    const base = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    return base.replace(/[^a-z.]/g, '');
};

// Helper: Generate Default Password
const generateDefaultPassword = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    return `GSEMS${random}`;
};

// CREATE ADMISSION (with auto-generated application number)
const createAdmission = async (req, res) => {
    try {
        const {
            first_name,
            middle_name,
            last_name,
            gender,
            applying_grade,
            section,
            guardian_name,
            guardian_phone,
        } = req.body;

        const application_no = await generateApplicationNo();

        const result = await pool.query(
            `
            INSERT INTO admissions (
                application_no,
                first_name,
                middle_name,
                last_name,
                gender,
                applying_grade,
                section,
                guardian_name,
                guardian_phone,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
            RETURNING *
            `,
            [
                application_no,
                first_name,
                middle_name || null,
                last_name,
                gender || null,
                applying_grade,
                section || null,
                guardian_name,
                guardian_phone,
            ]
        );

        res.status(201).json({
            message: "Admission application submitted successfully!",
            admission: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating admission:", error);
        res.status(500).json({
            message: "Failed to create admission",
            error: error.message,
        });
    }
};

// GET ALL ADMISSIONS
const getAdmissions = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM admissions ORDER BY id DESC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching admissions:", error);
        res.status(500).json({
            message: "Failed to fetch admissions",
            error: error.message,
        });
    }
};

// GET ADMISSION BY ID
const getAdmissionById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            "SELECT * FROM admissions WHERE id = $1",
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Admission not found",
            });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching admission:", error);
        res.status(500).json({
            message: "Failed to fetch admission",
            error: error.message,
        });
    }
};

// UPDATE ADMISSION
const updateAdmission = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            first_name,
            middle_name,
            last_name,
            gender,
            applying_grade,
            section,
            guardian_name,
            guardian_phone,
        } = req.body;

        const checkResult = await pool.query(
            "SELECT * FROM admissions WHERE id = $1",
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                message: "Admission not found",
            });
        }

        if (checkResult.rows[0].status === 'APPROVED') {
            return res.status(400).json({
                message: "Cannot edit approved admission",
            });
        }

        const result = await pool.query(
            `
            UPDATE admissions 
            SET 
                first_name = COALESCE($1, first_name),
                middle_name = COALESCE($2, middle_name),
                last_name = COALESCE($3, last_name),
                gender = COALESCE($4, gender),
                applying_grade = COALESCE($5, applying_grade),
                section = COALESCE($6, section),
                guardian_name = COALESCE($7, guardian_name),
                guardian_phone = COALESCE($8, guardian_phone),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
            `,
            [
                first_name,
                middle_name || null,
                last_name,
                gender || null,
                applying_grade,
                section || null,
                guardian_name,
                guardian_phone,
                id,
            ]
        );

        res.json({
            message: "Admission updated successfully",
            admission: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating admission:", error);
        res.status(500).json({
            message: "Failed to update admission",
            error: error.message,
        });
    }
};

// DELETE ADMISSION
const deleteAdmission = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM admissions WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Admission not found",
            });
        }

        res.json({
            message: "Admission deleted successfully",
            admission: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting admission:", error);
        res.status(500).json({
            message: "Failed to delete admission",
            error: error.message,
        });
    }
};

// APPROVE ADMISSION - Auto creates User + Student (with duplicate handling)
const approveAdmission = async (req, res) => {
    try {
        const { id } = req.params;

        // Get admission details
        const admissionResult = await pool.query(
            "SELECT * FROM admissions WHERE id = $1 AND status = 'PENDING'",
            [id]
        );

        if (admissionResult.rows.length === 0) {
            return res.status(404).json({
                message: "Admission not found or already processed",
            });
        }

        const admission = admissionResult.rows[0];

        // Generate credentials
        const username = generateUsername(admission.first_name, admission.last_name);
        const email = `${username}@student.gsems.com`;
        const defaultPassword = generateDefaultPassword();

        // ============================================
        // STEP 1: Check if user already exists
        // ============================================
        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        let userId;

        if (existingUser.rows.length > 0) {
            // User already exists, use existing user
            userId = existingUser.rows[0].id;
        } else {
            // Create new user account
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(defaultPassword, salt);

            const userResult = await pool.query(
                `
                INSERT INTO users (
                    username, 
                    email, 
                    password, 
                    role, 
                    is_active,
                    first_name,
                    last_name,
                    phone
                )
                VALUES ($1, $2, $3, 'STUDENT', true, $4, $5, $6)
                RETURNING id
                `,
                [
                    username,
                    email,
                    hashedPassword,
                    admission.first_name,
                    admission.last_name,
                    admission.guardian_phone
                ]
            );

            userId = userResult.rows[0].id;
        }

        // ============================================
        // STEP 2: Check if student already exists
        // ============================================
        const existingStudent = await pool.query(
            "SELECT id FROM students WHERE user_id = $1",
            [userId]
        );

        let student;

        if (existingStudent.rows.length > 0) {
            // Student already exists, update instead of insert
            const studentId = existingStudent.rows[0].id;
            
            const updateResult = await pool.query(
                `
                UPDATE students 
                SET 
                    first_name = $1,
                    middle_name = $2,
                    last_name = $3,
                    gender = $4,
                    date_of_birth = $5,
                    grade_level = $6,
                    section = $7,
                    guardian_name = $8,
                    guardian_phone = $9,
                    email = $10
                WHERE id = $11
                RETURNING id, student_id
                `,
                [
                    admission.first_name,
                    admission.middle_name || null,
                    admission.last_name,
                    admission.gender || null,
                    admission.date_of_birth || null,
                    admission.applying_grade,
                    admission.section || null,
                    admission.guardian_name,
                    admission.guardian_phone,
                    email,
                    studentId,
                ]
            );

            student = updateResult.rows[0];
        } else {
            // Generate new student ID
            const newStudentId = await generateStudentId();

            // Create new student profile
            const studentResult = await pool.query(
                `
                INSERT INTO students (
                    user_id,
                    student_id,
                    first_name,
                    middle_name,
                    last_name,
                    gender,
                    date_of_birth,
                    grade_level,
                    section,
                    guardian_name,
                    guardian_phone,
                    email
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id, student_id
                `,
                [
                    userId,
                    newStudentId,
                    admission.first_name,
                    admission.middle_name || null,
                    admission.last_name,
                    admission.gender || null,
                    admission.date_of_birth || null,
                    admission.applying_grade,
                    admission.section || null,
                    admission.guardian_name,
                    admission.guardian_phone,
                    email,
                ]
            );

            student = studentResult.rows[0];
        }

        // ============================================
        // STEP 3: Update Admission with student_id
        // ============================================
        await pool.query(
            `
            UPDATE admissions 
            SET 
                status = 'APPROVED',
                student_id = $1,
                approved_at = CURRENT_TIMESTAMP,
                approved_by = $2
            WHERE id = $3
            `,
            [student.id, req.user.id, id]
        );

        // ============================================
        // STEP 4: Send response with credentials
        // ============================================
        res.json({
            message: "Admission approved successfully! Student account created.",
            student: {
                id: student.id,
                student_id: student.student_id,
                first_name: admission.first_name,
                last_name: admission.last_name,
                grade_level: admission.applying_grade,
                section: admission.section || null,
            },
            credentials: {
                username: username,
                email: email,
                password: defaultPassword,
                is_temporary: true,
                existing_user: existingUser.rows.length > 0,
            },
        });

    } catch (error) {
        console.error("Error approving admission:", error);
        res.status(500).json({
            message: "Failed to approve admission",
            error: error.message,
        });
    }
};

module.exports = {
    createAdmission,
    getAdmissions,
    getAdmissionById,
    updateAdmission,
    deleteAdmission,
    approveAdmission,
};