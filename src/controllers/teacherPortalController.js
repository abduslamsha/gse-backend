const pool = require("../config/db");

// Helper: Calculate grade
const calculateGrade = async (percentage) => {
    try {
        const result = await pool.query(
            `
            SELECT grade FROM grade_ranges 
            WHERE $1 >= min_mark AND $1 <= max_mark
            LIMIT 1
            `,
            [percentage]
        );
        return result.rows.length > 0 ? result.rows[0].grade : 'F';
    } catch (error) {
        if (percentage >= 90) return 'A';
        if (percentage >= 75) return 'B';
        if (percentage >= 60) return 'C';
        if (percentage >= 50) return 'D';
        return 'F';
    }
};

// Helper: Recalculate semester total
const recalculateSemesterTotal = async (student_id, subject_id, semester, academic_year) => {
    const assessmentsResult = await pool.query(
        `
        SELECT score, max_points, teacher_id
        FROM assessments 
        WHERE student_id = $1 
        AND subject_id = $2 
        AND semester = $3 
        AND academic_year = $4
        `,
        [student_id, subject_id, semester, academic_year]
    );

    const assessments = assessmentsResult.rows;

    let totalScore = 0;
    let totalPoints = 0;
    let teacher_id = null;

    assessments.forEach(a => {
        totalScore += parseFloat(a.score);
        totalPoints += parseFloat(a.max_points);
        teacher_id = a.teacher_id;
    });

    const isComplete = totalPoints === 100;
    const percentage = totalPoints > 0 ? (totalScore / totalPoints) * 100 : 0;
    const grade = await calculateGrade(percentage);

    const existingCheck = await pool.query(
        `
        SELECT * FROM semester_totals 
        WHERE student_id = $1 AND subject_id = $2 AND semester = $3 AND academic_year = $4
        `,
        [student_id, subject_id, semester, academic_year]
    );

    if (existingCheck.rows.length > 0) {
        await pool.query(
            `
            UPDATE semester_totals 
            SET total_score = $1, total_points = $2, percentage = $3, 
                grade = $4, is_complete = $5, updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $6 AND subject_id = $7 AND semester = $8 AND academic_year = $9
            `,
            [totalScore, totalPoints, percentage, grade, isComplete, student_id, subject_id, semester, academic_year]
        );
    } else {
        await pool.query(
            `
            INSERT INTO semester_totals 
            (student_id, subject_id, teacher_id, semester, academic_year, 
             total_score, total_points, percentage, grade, is_complete)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `,
            [student_id, subject_id, teacher_id, semester, academic_year, 
             totalScore, totalPoints, percentage, grade, isComplete]
        );
    }

    return { totalPoints, isComplete };
};

// ==================== GET TEACHER DASHBOARD ====================
const getTeacherDashboard = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;

        // Get teacher info
        const teacherResult = await pool.query(
            `
            SELECT 
                t.*,
                u.email,
                u.username
            FROM teachers t
            JOIN users u ON t.user_id = u.id
            WHERE t.id = $1
            `,
            [teacherId]
        );

        if (teacherResult.rows.length === 0) {
            return res.status(404).json({
                message: "Teacher not found",
            });
        }

        const teacher = teacherResult.rows[0];

        // Get assigned subjects
        const subjectsResult = await pool.query(
            `
            SELECT 
                s.id,
                s.name,
                s.subject_code,
                s.grade_level,
                ts.assigned_date
            FROM subjects s
            JOIN teacher_subjects ts ON s.id = ts.subject_id
            WHERE ts.teacher_id = $1
            ORDER BY s.grade_level, s.name
            `,
            [teacherId]
        );

        // Get total students across all subjects
        const studentsResult = await pool.query(
            `
            SELECT COUNT(DISTINCT ss.student_id) as total
            FROM student_subjects ss
            JOIN teacher_subjects ts ON ss.subject_id = ts.subject_id
            WHERE ts.teacher_id = $1
            `,
            [teacherId]
        );

        // Get today's attendance count
        const attendanceResult = await pool.query(
            `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'Present') as present,
                COUNT(*) FILTER (WHERE status = 'Absent') as absent,
                COUNT(*) FILTER (WHERE status = 'Late') as late,
                COUNT(*) as total
            FROM attendance
            WHERE attendance_date = CURRENT_DATE
            `,
            []
        );

        // Get recent assessments
        const assessmentsResult = await pool.query(
            `
            SELECT 
                a.*,
                s.name as subject_name,
                st.first_name as student_first_name,
                st.last_name as student_last_name
            FROM assessments a
            JOIN subjects s ON a.subject_id = s.id
            JOIN students st ON a.student_id = st.id
            WHERE a.teacher_id = $1
            ORDER BY a.created_at DESC
            LIMIT 10
            `,
            [teacherId]
        );

        res.json({
            teacher: {
                id: teacher.id,
                employee_id: teacher.employee_id,
                first_name: teacher.first_name,
                last_name: teacher.last_name,
                email: teacher.email,
                phone: teacher.phone,
                qualification: teacher.qualification,
            },
            subjects: subjectsResult.rows,
            total_students: parseInt(studentsResult.rows[0]?.total || 0),
            total_subjects: subjectsResult.rows.length,
            attendance: {
                present: parseInt(attendanceResult.rows[0]?.present || 0),
                absent: parseInt(attendanceResult.rows[0]?.absent || 0),
                late: parseInt(attendanceResult.rows[0]?.late || 0),
                total: parseInt(attendanceResult.rows[0]?.total || 0),
            },
            recent_assessments: assessmentsResult.rows,
        });
    } catch (error) {
        console.error("Error fetching teacher dashboard:", error);
        res.status(500).json({
            message: "Failed to fetch dashboard",
            error: error.message,
        });
    }
};

// ==================== GET TEACHER SUBJECTS ====================
const getTeacherSubjects = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;

        const result = await pool.query(
            `
            SELECT 
                s.id,
                s.name,
                s.subject_code,
                s.grade_level,
                ts.assigned_date,
                (
                    SELECT COUNT(DISTINCT ss.student_id)
                    FROM student_subjects ss
                    WHERE ss.subject_id = s.id
                ) as student_count
            FROM subjects s
            JOIN teacher_subjects ts ON s.id = ts.subject_id
            WHERE ts.teacher_id = $1
            ORDER BY s.grade_level, s.name
            `,
            [teacherId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching teacher subjects:", error);
        res.status(500).json({
            message: "Failed to fetch subjects",
            error: error.message,
        });
    }
};

// ==================== GET STUDENTS BY SUBJECT (FIXED) ====================
const getStudentsBySubject = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { subject_id } = req.params;

        // Verify teacher teaches this subject
        const verifyResult = await pool.query(
            "SELECT * FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
            [teacherId, subject_id]
        );

        if (verifyResult.rows.length === 0) {
            return res.status(403).json({
                message: "You are not assigned to this subject",
            });
        }

        // Parse subject_id as integer
        const subjectId = parseInt(subject_id);

        const result = await pool.query(
            `
            SELECT 
                s.id,
                s.student_id,
                s.first_name,
                s.middle_name,
                s.last_name,
                s.grade_level,
                s.section,
                ss.enrolled_date,
                COALESCE(
                    (SELECT AVG(percentage) FROM semester_totals 
                     WHERE student_id = s.id AND subject_id = $1), 0
                ) as average_score,
                COALESCE(
                    (SELECT grade FROM semester_totals 
                     WHERE student_id = s.id AND subject_id = $1 
                     ORDER BY created_at DESC LIMIT 1), 'Not Graded'
                ) as current_grade
            FROM students s
            JOIN student_subjects ss ON s.id = ss.student_id
            WHERE ss.subject_id = $1
            ORDER BY s.first_name, s.last_name
            `,
            [subjectId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching students by subject:", error);
        res.status(500).json({
            message: "Failed to fetch students",
            error: error.message,
        });
    }
};

// ==================== TAKE ATTENDANCE ====================
const takeAttendance = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { subject_id, attendance_date, records } = req.body;

        if (!subject_id || !attendance_date || !records || !Array.isArray(records)) {
            return res.status(400).json({
                message: "Subject ID, date, and attendance records are required",
            });
        }

        // Verify teacher teaches this subject
        const verifyResult = await pool.query(
            "SELECT * FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
            [teacherId, subject_id]
        );

        if (verifyResult.rows.length === 0) {
            return res.status(403).json({
                message: "You are not assigned to this subject",
            });
        }

        // Check if subject_id column exists in attendance
        const columnCheck = await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'subject_id'"
        );

        // Delete existing attendance for this date
        if (columnCheck.rows.length > 0) {
            await pool.query(
                "DELETE FROM attendance WHERE subject_id = $1 AND attendance_date = $2",
                [subject_id, attendance_date]
            );
        } else {
            await pool.query(
                "DELETE FROM attendance WHERE attendance_date = $1",
                [attendance_date]
            );
        }

        // Insert new attendance records
        let inserted = 0;
        for (const record of records) {
            if (record.student_id && record.status) {
                if (columnCheck.rows.length > 0) {
                    await pool.query(
                        `
                        INSERT INTO attendance (student_id, subject_id, attendance_date, status)
                        VALUES ($1, $2, $3, $4)
                        `,
                        [record.student_id, subject_id, attendance_date, record.status]
                    );
                } else {
                    await pool.query(
                        `
                        INSERT INTO attendance (student_id, attendance_date, status)
                        VALUES ($1, $2, $3)
                        `,
                        [record.student_id, attendance_date, record.status]
                    );
                }
                inserted++;
            }
        }

        res.json({
            message: `Attendance saved successfully for ${inserted} students`,
            inserted: inserted,
        });
    } catch (error) {
        console.error("Error taking attendance:", error);
        res.status(500).json({
            message: "Failed to save attendance",
            error: error.message,
        });
    }
};

// ==================== GET ATTENDANCE BY SUBJECT ====================
const getAttendanceBySubject = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { subject_id } = req.params;
        const { date } = req.query;

        // Verify teacher teaches this subject
        const verifyResult = await pool.query(
            "SELECT * FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
            [teacherId, subject_id]
        );

        if (verifyResult.rows.length === 0) {
            return res.status(403).json({
                message: "You are not assigned to this subject",
            });
        }

        // Check if subject_id column exists
        const columnCheck = await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'attendance' AND column_name = 'subject_id'"
        );

        let query = `
            SELECT 
                a.*,
                s.student_id,
                s.first_name,
                s.last_name
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            WHERE 1=1
        `;
        let params = [];

        if (columnCheck.rows.length > 0) {
            query += ` AND a.subject_id = $1`;
            params.push(subject_id);
        }

        if (date) {
            query += ` AND a.attendance_date = $${params.length + 1}`;
            params.push(date);
        }

        query += ` ORDER BY s.first_name, s.last_name`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching attendance:", error);
        res.status(500).json({
            message: "Failed to fetch attendance",
            error: error.message,
        });
    }
};

// ==================== CREATE ASSESSMENT ====================
const createAssessment = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { student_id, subject_id, assessment_name, semester, academic_year, max_points, score } = req.body;

        // Verify teacher teaches this subject
        const verifyResult = await pool.query(
            "SELECT * FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
            [teacherId, subject_id]
        );

        if (verifyResult.rows.length === 0) {
            return res.status(403).json({
                message: "You are not assigned to this subject",
            });
        }

        if (max_points <= 0) {
            return res.status(400).json({
                message: "Max points must be greater than 0",
            });
        }

        if (score < 0 || score > max_points) {
            return res.status(400).json({
                message: `Score must be between 0 and ${max_points}`,
            });
        }

        // Check if assessment already exists
        const existingCheck = await pool.query(
            `
            SELECT * FROM assessments 
            WHERE student_id = $1 
            AND subject_id = $2 
            AND assessment_name = $3 
            AND semester = $4 
            AND academic_year = $5
            `,
            [student_id, subject_id, assessment_name, semester, academic_year]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(400).json({
                message: `Assessment "${assessment_name}" already exists for this student`,
            });
        }

        const result = await pool.query(
            `
            INSERT INTO assessments (
                student_id, subject_id, teacher_id, assessment_name,
                semester, academic_year, max_points, score
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            `,
            [student_id, subject_id, teacherId, assessment_name, semester, academic_year, max_points, score]
        );

        // Recalculate semester total
        await recalculateSemesterTotal(student_id, subject_id, semester, academic_year);

        res.status(201).json({
            message: "Assessment created successfully",
            assessment: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating assessment:", error);
        res.status(500).json({
            message: "Failed to create assessment",
            error: error.message,
        });
    }
};

// ==================== UPDATE ASSESSMENT ====================
const updateAssessment = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { id } = req.params;
        const { score, max_points } = req.body;

        const checkResult = await pool.query(
            "SELECT * FROM assessments WHERE id = $1 AND teacher_id = $2",
            [id, teacherId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                message: "Assessment not found or you don't have permission",
            });
        }

        const assessment = checkResult.rows[0];

        const newScore = score !== undefined ? score : assessment.score;
        const newMaxPoints = max_points !== undefined ? max_points : assessment.max_points;

        if (newScore < 0 || newScore > newMaxPoints) {
            return res.status(400).json({
                message: `Score must be between 0 and ${newMaxPoints}`,
            });
        }

        const result = await pool.query(
            `
            UPDATE assessments 
            SET score = $1, max_points = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND teacher_id = $4
            RETURNING *
            `,
            [newScore, newMaxPoints, id, teacherId]
        );

        // Recalculate semester total
        await recalculateSemesterTotal(
            assessment.student_id,
            assessment.subject_id,
            assessment.semester,
            assessment.academic_year
        );

        res.json({
            message: "Assessment updated successfully",
            assessment: result.rows[0],
        });
    } catch (error) {
        console.error("Error updating assessment:", error);
        res.status(500).json({
            message: "Failed to update assessment",
            error: error.message,
        });
    }
};

// ==================== DELETE ASSESSMENT ====================
const deleteAssessment = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { id } = req.params;

        const checkResult = await pool.query(
            "SELECT * FROM assessments WHERE id = $1 AND teacher_id = $2",
            [id, teacherId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                message: "Assessment not found or you don't have permission",
            });
        }

        const assessment = checkResult.rows[0];

        const result = await pool.query(
            "DELETE FROM assessments WHERE id = $1 AND teacher_id = $2 RETURNING *",
            [id, teacherId]
        );

        // Recalculate semester total
        await recalculateSemesterTotal(
            assessment.student_id,
            assessment.subject_id,
            assessment.semester,
            assessment.academic_year
        );

        res.json({
            message: "Assessment deleted successfully",
            assessment: result.rows[0],
        });
    } catch (error) {
        console.error("Error deleting assessment:", error);
        res.status(500).json({
            message: "Failed to delete assessment",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT GRADES BY SUBJECT ====================
const getStudentGradesBySubject = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;
        const { subject_id } = req.params;

        // Verify teacher teaches this subject
        const verifyResult = await pool.query(
            "SELECT * FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
            [teacherId, subject_id]
        );

        if (verifyResult.rows.length === 0) {
            return res.status(403).json({
                message: "You are not assigned to this subject",
            });
        }

        const subjectId = parseInt(subject_id);

        const result = await pool.query(
            `
            SELECT 
                s.id as student_id,
                s.student_id as student_identifier,
                s.first_name,
                s.last_name,
                COALESCE(st.percentage, 0) as percentage,
                COALESCE(st.grade, 'Not Graded') as grade,
                COALESCE(st.total_score, 0) as total_score,
                COALESCE(st.total_points, 0) as total_points,
                COALESCE(st.is_complete, false) as is_complete,
                (
                    SELECT json_agg(
                        json_build_object(
                            'id', a.id,
                            'name', a.assessment_name,
                            'score', a.score,
                            'max_points', a.max_points
                        ) ORDER BY a.assessment_name
                    )
                    FROM assessments a
                    WHERE a.student_id = s.id AND a.subject_id = $1
                ) as assessments
            FROM students s
            JOIN student_subjects ss ON s.id = ss.student_id
            LEFT JOIN semester_totals st ON s.id = st.student_id 
                AND st.subject_id = $1
                AND st.semester = 'Semester 1'
                AND st.academic_year = '2026/27'
            WHERE ss.subject_id = $1
            ORDER BY s.first_name, s.last_name
            `,
            [subjectId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching student grades:", error);
        res.status(500).json({
            message: "Failed to fetch grades",
            error: error.message,
        });
    }
};

// ==================== GET TEACHER PROFILE ====================
const getTeacherProfile = async (req, res) => {
    try {
        const teacherId = req.user.teacherId;

        const result = await pool.query(
            `
            SELECT 
                t.*,
                u.email,
                u.username,
                u.phone,
                u.created_at
            FROM teachers t
            JOIN users u ON t.user_id = u.id
            WHERE t.id = $1
            `,
            [teacherId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Teacher not found",
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching teacher profile:", error);
        res.status(500).json({
            message: "Failed to fetch profile",
            error: error.message,
        });
    }
};

module.exports = {
    getTeacherDashboard,
    getTeacherSubjects,
    getStudentsBySubject,
    takeAttendance,
    getAttendanceBySubject,
    createAssessment,
    updateAssessment,
    deleteAssessment,
    getStudentGradesBySubject,
    getTeacherProfile,
};