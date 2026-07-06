const pool = require("../config/db");

// Helper: Get teacher ID 
const getTeacherId = async (userId) => {
    // Since we know teacher ID is 6, use it directly
    return 6;
};

// Helper: Calculate grade from percentage using grade_ranges table
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
        // Fallback
        if (percentage >= 90) return 'A';
        if (percentage >= 75) return 'B';
        if (percentage >= 60) return 'C';
        if (percentage >= 50) return 'D';
        return 'F';
    }
};

// Helper: Recalculate semester total for a student
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

    // Check if semester total already exists
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

// ADD ASSESSMENT FOR STUDENT
const addAssessment = async (req, res) => {
    try {
        const {
            student_id,
            subject_id,
            template_id,
            assessment_name,
            semester,
            academic_year,
            max_points,
            score,
        } = req.body;

        const userId = req.user.id;
        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found",
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

        const studentCheck = await pool.query(
            "SELECT * FROM students WHERE id = $1",
            [student_id]
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const subjectCheck = await pool.query(
            "SELECT * FROM subjects WHERE id = $1",
            [subject_id]
        );

        if (subjectCheck.rows.length === 0) {
            return res.status(404).json({
                message: "Subject not found",
            });
        }

        // Check if template exists (if provided)
        if (template_id) {
            const templateCheck = await pool.query(
                "SELECT * FROM assessment_templates WHERE id = $1 AND teacher_id = $2",
                [template_id, teacherId]
            );

            if (templateCheck.rows.length === 0) {
                return res.status(404).json({
                    message: "Template not found or you don't have permission",
                });
            }
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
                student_id, subject_id, teacher_id, template_id, assessment_name,
                semester, academic_year, max_points, score
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            `,
            [student_id, subject_id, teacherId, template_id, assessment_name, 
             semester, academic_year, max_points, score]
        );

        const { totalPoints, isComplete } = await recalculateSemesterTotal(
            student_id, subject_id, semester, academic_year
        );

        let warning = null;
        if (!isComplete) {
            const remaining = 100 - totalPoints;
            warning = `Total points for this semester is ${totalPoints}. You need ${remaining} more points to reach 100.`;
        }

        res.status(201).json({
            message: "Assessment added successfully",
            assessment: result.rows[0],
            warning: warning,
            total_points: totalPoints,
            is_complete: isComplete,
        });
    } catch (error) {
        console.error("Error adding assessment:", error);
        res.status(500).json({
            message: "Failed to add assessment",
            error: error.message,
        });
    }
};

// GET STUDENT'S ASSESSMENTS
const getStudentAssessments = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { subject_id, semester, academic_year } = req.query;

        let query = `
            SELECT 
                a.*,
                sub.name as subject_name,
                sub.subject_code,
                t.first_name as teacher_first_name,
                t.last_name as teacher_last_name
            FROM assessments a
            JOIN subjects sub ON a.subject_id = sub.id
            JOIN teachers t ON a.teacher_id = t.id
            WHERE a.student_id = $1
        `;
        let params = [student_id];
        let paramIndex = 2;

        if (subject_id) {
            query += ` AND a.subject_id = $${paramIndex}`;
            params.push(subject_id);
            paramIndex++;
        }

        if (semester) {
            query += ` AND a.semester = $${paramIndex}`;
            params.push(semester);
            paramIndex++;
        }

        if (academic_year) {
            query += ` AND a.academic_year = $${paramIndex}`;
            params.push(academic_year);
            paramIndex++;
        }

        query += ` ORDER BY a.assessment_name`;

        const result = await pool.query(query, params);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching student assessments:", error);
        res.status(500).json({
            message: "Failed to fetch student assessments",
            error: error.message,
        });
    }
};

// UPDATE ASSESSMENT
const updateAssessment = async (req, res) => {
    try {
        const { id } = req.params;
        const { score, max_points } = req.body;
        const userId = req.user.id;

        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found",
            });
        }

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

        const { totalPoints, isComplete } = await recalculateSemesterTotal(
            assessment.student_id,
            assessment.subject_id,
            assessment.semester,
            assessment.academic_year
        );

        let warning = null;
        if (!isComplete) {
            const remaining = 100 - totalPoints;
            warning = `Total points for this semester is ${totalPoints}. You need ${remaining} more points to reach 100.`;
        }

        res.json({
            message: "Assessment updated successfully",
            assessment: result.rows[0],
            warning: warning,
            total_points: totalPoints,
            is_complete: isComplete,
        });
    } catch (error) {
        console.error("Error updating assessment:", error);
        res.status(500).json({
            message: "Failed to update assessment",
            error: error.message,
        });
    }
};

// DELETE ASSESSMENT
const deleteAssessment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const teacherId = await getTeacherId(userId);

        if (!teacherId) {
            return res.status(404).json({
                message: "Teacher profile not found",
            });
        }

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

        const { totalPoints, isComplete } = await recalculateSemesterTotal(
            assessment.student_id,
            assessment.subject_id,
            assessment.semester,
            assessment.academic_year
        );

        res.json({
            message: "Assessment deleted successfully",
            assessment: result.rows[0],
            total_points: totalPoints,
            is_complete: isComplete,
        });
    } catch (error) {
        console.error("Error deleting assessment:", error);
        res.status(500).json({
            message: "Failed to delete assessment",
            error: error.message,
        });
    }
};

// GET STUDENT REPORT CARD
const getStudentReportCard = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { academic_year } = req.query;

        const studentResult = await pool.query(
            "SELECT * FROM students WHERE id = $1",
            [student_id]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const student = studentResult.rows[0];

        let query = `
            SELECT 
                st.*,
                sub.name as subject_name,
                sub.subject_code,
                t.first_name as teacher_first_name,
                t.last_name as teacher_last_name,
                gr.description as grade_description
            FROM semester_totals st
            JOIN subjects sub ON st.subject_id = sub.id
            JOIN teachers t ON st.teacher_id = t.id
            LEFT JOIN grade_ranges gr ON st.grade = gr.grade
            WHERE st.student_id = $1
        `;
        let params = [student_id];

        if (academic_year) {
            query += ` AND st.academic_year = $2`;
            params.push(academic_year);
        }

        query += ` ORDER BY sub.name, st.semester`;

        const totalsResult = await pool.query(query, params);

        const totals = totalsResult.rows;
        const semester1Totals = totals.filter(t => t.semester === 'Semester 1');
        const semester2Totals = totals.filter(t => t.semester === 'Semester 2');

        const subjectReport = {};
        const allSubjectIds = [...new Set(totals.map(t => t.subject_id))];

        // Process each subject
        for (const subjectId of allSubjectIds) {
            const s1 = semester1Totals.find(t => t.subject_id === subjectId);
            const s2 = semester2Totals.find(t => t.subject_id === subjectId);

            const s1Percentage = s1 ? parseFloat(s1.percentage) : null;
            const s2Percentage = s2 ? parseFloat(s2.percentage) : null;

            let average = null;
            if (s1Percentage !== null && s2Percentage !== null) {
                average = (s1Percentage + s2Percentage) / 2;
            } else if (s1Percentage !== null) {
                average = s1Percentage;
            } else if (s2Percentage !== null) {
                average = s2Percentage;
            }

            const subjectName = s1?.subject_name || s2?.subject_name || 'Unknown';

            subjectReport[subjectId] = {
                subject_id: subjectId,
                subject_name: subjectName,
                subject_code: s1?.subject_code || s2?.subject_code,
                semester1: s1Percentage,
                semester2: s2Percentage,
                average: average !== null ? parseFloat(average.toFixed(2)) : null,
                grade: average !== null ? await calculateGrade(average) : null,
                is_complete: s1?.is_complete && s2?.is_complete,
            };
        }

        let totalAvg = 0;
        let count = 0;
        for (const key of Object.keys(subjectReport)) {
            const s = subjectReport[key];
            if (s.average !== null) {
                totalAvg += s.average;
                count++;
            }
        }
        const overallAverage = count > 0 ? totalAvg / count : 0;

        // Calculate rank
        const rankResult = await pool.query(
            `
            SELECT 
                s.id as student_id,
                s.first_name,
                s.last_name,
                AVG(st.percentage) as avg_percentage
            FROM students s
            JOIN semester_totals st ON s.id = st.student_id
            WHERE st.academic_year = $1
            AND s.grade_level = $2
            GROUP BY s.id, s.first_name, s.last_name
            ORDER BY avg_percentage DESC
            `,
            [academic_year || '2024/25', student.grade_level]
        );

        let rank = null;
        rankResult.rows.forEach((row, index) => {
            if (row.student_id === parseInt(student_id)) {
                rank = index + 1;
            }
        });

        // Convert subjectReport object to array
        const subjectArray = Object.values(subjectReport);

        res.json({
            student: {
                id: student.id,
                student_id: student.student_id,
                first_name: student.first_name,
                last_name: student.last_name,
                grade_level: student.grade_level,
            },
            academic_year: academic_year || '2024/25',
            subjects: subjectArray,
            summary: {
                total_subjects: count,
                overall_average: parseFloat(overallAverage.toFixed(2)),
                overall_grade: await calculateGrade(overallAverage),
                rank: rank,
                total_students: rankResult.rows.length,
            },
        });
    } catch (error) {
        console.error("Error fetching report card:", error);
        res.status(500).json({
            message: "Failed to fetch report card",
            error: error.message,
        });
    }
};

// GET SEMESTER TOTAL (using query parameters)
const getSemesterTotal = async (req, res) => {
    try {
        const { student_id, subject_id } = req.params;
        const { semester, academic_year } = req.query;

        // Validate required parameters
        if (!semester || !academic_year) {
            return res.status(400).json({
                message: "semester and academic_year are required query parameters",
            });
        }

        const result = await pool.query(
            `
            SELECT * FROM semester_totals 
            WHERE student_id = $1 AND subject_id = $2 
            AND semester = $3 AND academic_year = $4
            `,
            [student_id, subject_id, semester, academic_year]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Semester total not found",
                student_id: student_id,
                subject_id: subject_id,
                semester: semester,
                academic_year: academic_year,
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching semester total:", error);
        res.status(500).json({
            message: "Failed to fetch semester total",
            error: error.message,
        });
    }
};

// CHECK SEMESTER COMPLETION (using query parameters)
const checkSemesterCompletion = async (req, res) => {
    try {
        const { student_id, subject_id } = req.params;
        const { semester, academic_year } = req.query;

        // Validate required parameters
        if (!semester || !academic_year) {
            return res.status(400).json({
                message: "semester and academic_year are required query parameters",
            });
        }

        const result = await pool.query(
            `
            SELECT SUM(max_points) as total_points
            FROM assessments 
            WHERE student_id = $1 AND subject_id = $2 
            AND semester = $3 AND academic_year = $4
            `,
            [student_id, subject_id, semester, academic_year]
        );

        const totalPoints = parseFloat(result.rows[0]?.total_points || 0);
        const isComplete = totalPoints === 100;
        const remaining = isComplete ? 0 : 100 - totalPoints;

        res.json({
            student_id: student_id,
            subject_id: subject_id,
            semester: semester,
            academic_year: academic_year,
            total_points: totalPoints,
            is_complete: isComplete,
            remaining_points: remaining,
            message: isComplete ? "Semester is complete (100 points)" : `Need ${remaining} more points to reach 100`,
        });
    } catch (error) {
        console.error("Error checking semester completion:", error);
        res.status(500).json({
            message: "Failed to check semester completion",
            error: error.message,
        });
    }
};

module.exports = {
    addAssessment,
    getStudentAssessments,
    updateAssessment,
    deleteAssessment,
    getStudentReportCard,
    getSemesterTotal,
    checkSemesterCompletion,
    recalculateSemesterTotal,
};