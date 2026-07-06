const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

// ==================== STUDENT LOGIN ====================
const studentLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const userResult = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND role = 'STUDENT' AND is_active = true",
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid credentials or account not activated",
            });
        }

        const user = userResult.rows[0];

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({
                message: "Invalid credentials",
            });
        }

        let studentResult;
        try {
            studentResult = await pool.query(
                "SELECT * FROM students WHERE user_id = $1",
                [user.id]
            );
        } catch (err) {
            studentResult = await pool.query(
                "SELECT * FROM students WHERE email = $1",
                [email]
            );
        }

        if (studentResult.rows.length === 0) {
            studentResult = await pool.query(
                "SELECT * FROM students WHERE student_id = $1 OR first_name = $2",
                [user.username, user.first_name || 'Student']
            );
        }

        if (studentResult.rows.length === 0) {
            const newStudentId = `STD-${Date.now().toString().slice(-6)}`;
            studentResult = await pool.query(
                `
                INSERT INTO students (student_id, first_name, last_name, email, grade_level, user_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                `,
                [newStudentId, user.first_name || 'Student', user.last_name || 'User', email, 'Not Assigned', user.id]
            );
        }

        const student = studentResult.rows[0];

        await pool.query(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
            [user.id]
        );

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                studentId: student.id,
                username: user.username,
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const isTemporary = !user.password_changed;

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
            student: {
                id: student.id,
                student_id: student.student_id,
                first_name: student.first_name,
                last_name: student.last_name,
                grade_level: student.grade_level,
                section: student.section,
            },
            is_temporary: isTemporary,
        });

    } catch (error) {
        console.error("Student login error:", error);
        res.status(500).json({
            message: "Login failed",
            error: error.message,
        });
    }
};

// ==================== CHECK IF PASSWORD IS TEMPORARY ====================
const checkTemporaryPassword = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            "SELECT password_changed FROM users WHERE id = $1",
            [userId]
        );

        const isTemporary = !result.rows[0]?.password_changed;

        res.json({
            is_temporary: isTemporary,
            message: isTemporary ? "Please change your password" : "Password is active",
        });
    } catch (error) {
        console.error("Error checking password status:", error);
        res.status(500).json({
            message: "Failed to check password status",
            error: error.message,
        });
    }
};

// ==================== CHANGE PASSWORD (First Time) ====================
const changePasswordFirstTime = async (req, res) => {
    try {
        const userId = req.user.id;
        const { new_password } = req.body;

        if (!new_password || new_password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters",
            });
        }

        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await pool.query(
            `
            UPDATE users 
            SET 
                password = $1,
                password_changed = true
            WHERE id = $2
            `,
            [hashedPassword, userId]
        );

        res.json({
            message: "Password changed successfully! You can now access the portal.",
        });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({
            message: "Failed to change password",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT ANNOUNCEMENTS ====================
const getStudentAnnouncements = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        
        const studentResult = await pool.query(
            "SELECT grade_level FROM students WHERE id = $1",
            [studentId]
        );
        
        const studentGrade = studentResult.rows[0]?.grade_level || null;
        
        const result = await pool.query(
            `
            SELECT * FROM announcements 
            WHERE is_published = true 
            AND (
                target_audience = 'ALL' 
                OR target_audience = 'STUDENTS'
            )
            AND (
                grade_level IS NULL 
                OR grade_level = '' 
                OR grade_level = 'ALL'
                OR grade_level = $1
            )
            ORDER BY created_at DESC
            LIMIT 20
            `,
            [studentGrade]
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

// ==================== GET STUDENT ASSIGNMENTS ====================
const getStudentAssignments = async (req, res) => {
    try {
        const studentId = req.user.studentId;

        const subjectsResult = await pool.query(
            `
            SELECT subject_id FROM student_subjects 
            WHERE student_id = $1
            `,
            [studentId]
        );

        const subjectIds = subjectsResult.rows.map(row => row.subject_id);

        if (subjectIds.length === 0) {
            return res.json([]);
        }

        const result = await pool.query(
            `
            SELECT 
                a.*,
                sub.name as subject_name,
                COALESCE(ass.id IS NOT NULL, false) as is_submitted
            FROM assignments a
            JOIN subjects sub ON a.subject_id = sub.id
            LEFT JOIN assignment_submissions ass ON a.id = ass.assignment_id AND ass.student_id = $1
            WHERE a.subject_id = ANY($2::int[])
            ORDER BY a.due_date ASC
            `,
            [studentId, subjectIds]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching assignments:", error);
        res.status(500).json({
            message: "Failed to fetch assignments",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT ATTENDANCE CALENDAR ====================
const getStudentAttendanceCalendar = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { year, month } = req.query;

        const result = await pool.query(
            `
            SELECT attendance_date, status
            FROM attendance
            WHERE student_id = $1
            AND EXTRACT(YEAR FROM attendance_date) = $2
            AND EXTRACT(MONTH FROM attendance_date) = $3
            ORDER BY attendance_date
            `,
            [studentId, year, month]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching attendance calendar:", error);
        res.status(500).json({
            message: "Failed to fetch attendance calendar",
            error: error.message,
        });
    }
};

// ==================== DOWNLOAD STUDENT REPORT CARD PDF ====================
const downloadStudentReportCard = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { semester, academic_year } = req.query;

        const reportResult = await pool.query(
            `
            SELECT * FROM report_cards 
            WHERE student_id = $1 
            AND status = 'published'
            ${semester ? 'AND semester = $2' : ''}
            ${academic_year ? `AND academic_year = $${semester ? 3 : 2}` : ''}
            ORDER BY generated_at DESC 
            LIMIT 1
            `,
            semester ? [studentId, semester] : [studentId]
        );

        if (reportResult.rows.length === 0) {
            return res.status(404).json({
                message: "Published report card not found",
            });
        }

        const { generateReportCardPDF } = require("./reportCardController");
        
        const mockReq = {
            params: { student_id: studentId },
            query: { semester: semester || 'Semester 1', academic_year: academic_year || '2024/25' },
        };
        const mockRes = res;
        await generateReportCardPDF(mockReq, mockRes);

    } catch (error) {
        console.error("Error downloading report card:", error);
        res.status(500).json({
            message: "Failed to download report card",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT DASHBOARD ====================
const getStudentDashboard = async (req, res) => {
    try {
        const studentId = req.user.studentId;

        const studentResult = await pool.query(
            `
            SELECT 
                s.*,
                u.email,
                u.username
            FROM students s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
            `,
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const student = studentResult.rows[0];

        // Get enrolled subjects
        const enrolledSubjectsResult = await pool.query(
            `
            SELECT 
                s.id as subject_id,
                s.name as subject_name,
                s.subject_code,
                COALESCE(st.grade, 'Not Graded') as grade,
                COALESCE(st.percentage, 0) as percentage
            FROM subjects s
            JOIN student_subjects ss ON s.id = ss.subject_id
            LEFT JOIN semester_totals st ON s.id = st.subject_id 
                AND st.student_id = $1
                AND st.semester = 'Semester 1'
                AND st.academic_year = '2026/27'
            WHERE ss.student_id = $1
            ORDER BY s.name
            `,
            [studentId]
        );

        // Get grades - ONLY from semester_totals that have data
        const gradesResult = await pool.query(
            `
            SELECT 
                st.*,
                sub.name as subject_name,
                sub.subject_code
            FROM semester_totals st
            JOIN subjects sub ON st.subject_id = sub.id
            WHERE st.student_id = $1
            AND st.total_points > 0
            AND st.percentage > 0
            ORDER BY sub.name
            `,
            [studentId]
        );

        // Get attendance
        const attendanceResult = await pool.query(
            `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'Present') as present,
                COUNT(*) FILTER (WHERE status = 'Absent') as absent,
                COUNT(*) FILTER (WHERE status = 'Late') as late,
                COUNT(*) as total
            FROM attendance
            WHERE student_id = $1
            `,
            [studentId]
        );

        const attendance = attendanceResult.rows[0];

        // Get recent attendance
        const recentAttendanceResult = await pool.query(
            `
            SELECT attendance_date, status
            FROM attendance
            WHERE student_id = $1
            AND attendance_date >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY attendance_date DESC
            `,
            [studentId]
        );

        // Calculate average from grades that have data
        const grades = gradesResult.rows;
        let totalPercentage = 0;
        let gradeCount = 0;
        grades.forEach(g => {
            const perc = parseFloat(g.percentage);
            if (perc > 0) {
                totalPercentage += perc;
                gradeCount++;
            }
        });
        const average = gradeCount > 0 ? totalPercentage / gradeCount : 0;
        const overallGrade = await calculateGrade(average);

        // Get report card from report_cards table
        let reportCardData = null;
        try {
            const reportResult = await pool.query(
                `
                SELECT * FROM report_cards 
                WHERE student_id = $1 
                AND semester = 'Semester 1'
                AND academic_year = '2026/27'
                ORDER BY generated_at DESC 
                LIMIT 1
                `,
                [studentId]
            );
            
            if (reportResult.rows.length > 0) {
                reportCardData = reportResult.rows[0];
            }
        } catch (err) {
            console.log("Error fetching report card:", err.message);
        }

        const enrolledSubjects = enrolledSubjectsResult.rows;

        // Determine report card status for summary
        let reportCardStatus = 'Not Generated';
        let reportCardId = null;
        if (reportCardData) {
            reportCardStatus = reportCardData.status === 'published' ? 'Published' : 
                              reportCardData.status === 'draft' ? 'Draft' : 'Not Generated';
            reportCardId = reportCardData.id;
        }

        res.json({
            student: {
                id: student.id,
                student_id: student.student_id,
                first_name: student.first_name,
                last_name: student.last_name,
                grade_level: student.grade_level,
                section: student.section,
                guardian_name: student.guardian_name,
                guardian_phone: student.guardian_phone,
                email: student.email,
            },
            enrolledSubjects: enrolledSubjects,
            grades: grades,
            attendance: {
                present: parseInt(attendance.present || 0),
                absent: parseInt(attendance.absent || 0),
                late: parseInt(attendance.late || 0),
                total: parseInt(attendance.total || 0),
                percentage: attendance.total > 0 
                    ? ((attendance.present / attendance.total) * 100).toFixed(1)
                    : 0,
            },
            recentAttendance: recentAttendanceResult.rows,
            summary: {
                total_subjects: enrolledSubjects.length,
                average: parseFloat(average.toFixed(2)),
                overall_grade: overallGrade,
                report_card_status: reportCardStatus,
                report_card_id: reportCardId,
            },
            report_card: reportCardData,
        });

    } catch (error) {
        console.error("Error fetching student dashboard:", error);
        res.status(500).json({
            message: "Failed to fetch dashboard",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT GRADES (With Full Breakdown) ====================
const getStudentGrades = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { semester, academic_year } = req.query;

        const semVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        // Get all subjects the student is enrolled in
        const subjectsResult = await pool.query(
            `
            SELECT s.id, s.name, s.subject_code
            FROM subjects s
            JOIN student_subjects ss ON s.id = ss.subject_id
            WHERE ss.student_id = $1
            ORDER BY s.name
            `,
            [studentId]
        );

        if (subjectsResult.rows.length === 0) {
            return res.json([]);
        }

        const gradesWithBreakdown = [];

        for (const subject of subjectsResult.rows) {
            // Get semester totals
            const totalResult = await pool.query(
                `
                SELECT 
                    total_score,
                    total_points,
                    percentage,
                    grade,
                    semester,
                    academic_year
                FROM semester_totals
                WHERE student_id = $1 
                AND subject_id = $2
                AND semester = $3
                AND academic_year = $4
                `,
                [studentId, subject.id, semVal, yearVal]
            );

            // Get ALL assessments for this student and subject
            const assessmentsResult = await pool.query(
                `
                SELECT 
                    assessment_name,
                    max_points,
                    score,
                    (score / max_points * 100) as percentage
                FROM assessments
                WHERE student_id = $1 
                AND subject_id = $2
                AND semester = $3
                AND academic_year = $4
                ORDER BY assessment_name
                `,
                [studentId, subject.id, semVal, yearVal]
            );

            const total = totalResult.rows[0] || { 
                total_score: 0, 
                total_points: 0, 
                percentage: 0, 
                grade: 'F' 
            };

            // Calculate breakdown by category
            let quizScore = 0, quizMax = 0;
            let midScore = 0, midMax = 0;
            let finalScore = 0, finalMax = 0;
            let assignmentScore = 0, assignmentMax = 0;
            let testScore = 0, testMax = 0;
            let projectScore = 0, projectMax = 0;
            let otherScore = 0, otherMax = 0;
            let otherAssessments = [];

            assessmentsResult.rows.forEach(a => {
                const name = a.assessment_name.toLowerCase();
                const score = parseFloat(a.score) || 0;
                const max = parseFloat(a.max_points) || 0;
                
                // Categorize by name
                if (name.includes('quiz')) {
                    quizScore += score;
                    quizMax += max;
                } else if (name.includes('mid') || name.includes('midterm')) {
                    midScore += score;
                    midMax += max;
                } else if (name.includes('final')) {
                    finalScore += score;
                    finalMax += max;
                } else if (name.includes('assignment')) {
                    assignmentScore += score;
                    assignmentMax += max;
                } else if (name.includes('test')) {
                    testScore += score;
                    testMax += max;
                } else if (name.includes('project')) {
                    projectScore += score;
                    projectMax += max;
                } else {
                    otherScore += score;
                    otherMax += max;
                    otherAssessments.push({
                        assessment_name: a.assessment_name,
                        max_points: a.max_points,
                        score: a.score,
                        percentage: a.percentage
                    });
                }
            });

            // Build the response
            const gradeData = {
                subject_id: subject.id,
                subject_name: subject.name,
                subject_code: subject.subject_code,
                semester: semVal,
                academic_year: yearVal,
                total_score: parseFloat(total.total_score) || 0,
                total_points: parseFloat(total.total_points) || 0,
                percentage: parseFloat(total.percentage) || 0,
                grade: total.grade || 'F',
                assessments: assessmentsResult.rows,
                quiz_score: quizScore,
                quiz_max: quizMax,
                mid_score: midScore,
                mid_max: midMax,
                final_score: finalScore,
                final_max: finalMax,
                assignment_score: assignmentScore,
                assignment_max: assignmentMax,
                test_score: testScore,
                test_max: testMax,
                project_score: projectScore,
                project_max: projectMax,
                other_score: otherScore,
                other_max: otherMax,
                other_assessments: otherAssessments,
                all_assessments: assessmentsResult.rows
            };

            gradesWithBreakdown.push(gradeData);
        }

        res.json(gradesWithBreakdown);
    } catch (error) {
        console.error("Error fetching student grades:", error);
        res.status(500).json({
            message: "Failed to fetch grades",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT ATTENDANCE ====================
const getStudentAttendance = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { start_date, end_date } = req.query;

        let query = `
            SELECT 
                a.*,
                sub.name as subject_name
            FROM attendance a
            LEFT JOIN subjects sub ON a.subject_id = sub.id
            WHERE a.student_id = $1
        `;
        let params = [studentId];
        let paramIndex = 2;

        if (start_date) {
            query += ` AND a.attendance_date >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND a.attendance_date <= $${paramIndex}`;
            params.push(end_date);
            paramIndex++;
        }

        query += ` ORDER BY a.attendance_date DESC`;

        const result = await pool.query(query, params);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching student attendance:", error);
        res.status(500).json({
            message: "Failed to fetch attendance",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT REPORT CARD ====================
const getStudentReportCard = async (req, res) => {
    try {
        const studentId = req.user.studentId;
        const { semester, academic_year } = req.query;

        const studentResult = await pool.query(
            "SELECT * FROM students WHERE id = $1",
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const student = studentResult.rows[0];

        const gradesResult = await pool.query(
            `
            SELECT 
                sub.name as subject_name,
                st.percentage,
                st.grade,
                st.total_score,
                st.total_points,
                st.semester
            FROM semester_totals st
            JOIN subjects sub ON st.subject_id = sub.id
            WHERE st.student_id = $1
            ${semester ? 'AND st.semester = $2' : ''}
            ${academic_year ? `AND st.academic_year = $${semester ? 3 : 2}` : ''}
            ORDER BY sub.name
            `,
            semester ? [studentId, semester] : [studentId]
        );

        const grades = gradesResult.rows;
        let totalPercentage = 0;
        grades.forEach(g => {
            totalPercentage += parseFloat(g.percentage);
        });
        const average = grades.length > 0 ? totalPercentage / grades.length : 0;
        const overallGrade = await calculateGrade(average);

        const attendanceResult = await pool.query(
            `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'Present') as present,
                COUNT(*) FILTER (WHERE status = 'Absent') as absent,
                COUNT(*) as total
            FROM attendance
            WHERE student_id = $1
            `,
            [studentId]
        );

        const attendance = attendanceResult.rows[0];

        res.json({
            student: {
                first_name: student.first_name,
                last_name: student.last_name,
                student_id: student.student_id,
                grade_level: student.grade_level,
                section: student.section,
                guardian_name: student.guardian_name,
            },
            grades: grades,
            attendance: {
                present: parseInt(attendance.present || 0),
                absent: parseInt(attendance.absent || 0),
                total: parseInt(attendance.total || 0),
                percentage: attendance.total > 0 
                    ? ((attendance.present / attendance.total) * 100).toFixed(1)
                    : 0,
            },
            average: parseFloat(average.toFixed(2)),
            overall_grade: overallGrade,
        });

    } catch (error) {
        console.error("Error fetching student report card:", error);
        res.status(500).json({
            message: "Failed to fetch report card",
            error: error.message,
        });
    }
};

// ==================== CHANGE STUDENT PASSWORD (Regular) ====================
const changeStudentPassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                message: "Current password and new password are required",
            });
        }

        if (new_password.length < 6) {
            return res.status(400).json({
                message: "New password must be at least 6 characters",
            });
        }

        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        const user = userResult.rows[0];

        const isValid = await bcrypt.compare(current_password, user.password);
        if (!isValid) {
            return res.status(401).json({
                message: "Current password is incorrect",
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await pool.query(
            "UPDATE users SET password = $1, password_changed = true WHERE id = $2",
            [hashedPassword, userId]
        );

        res.json({
            message: "Password changed successfully",
        });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({
            message: "Failed to change password",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT PROFILE ====================
const getStudentProfile = async (req, res) => {
    try {
        const studentId = req.user.studentId;

        const result = await pool.query(
            `
            SELECT 
                s.*,
                u.email,
                u.username,
                u.phone,
                u.created_at
            FROM students s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
            `,
            [studentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching student profile:", error);
        res.status(500).json({
            message: "Failed to fetch profile",
            error: error.message,
        });
    }
};

// ==================== GET SCHOOL PROFILE ====================
const getStudentSchoolProfile = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM school_profile ORDER BY id DESC LIMIT 1"
        );
        res.json(result.rows[0] || {});
    } catch (error) {
        console.error("Error fetching school profile:", error);
        res.status(500).json({
            message: "Failed to fetch school profile",
            error: error.message,
        });
    }
};

// ==================== FORGOT PASSWORD ====================
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required",
            });
        }

        const userResult = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "No account found with this email",
            });
        }

        const user = userResult.rows[0];

        const resetToken = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET + "_reset",
            { expiresIn: '1h' }
        );

        // Create notification for admins
        try {
            const adminResult = await pool.query(
                "SELECT id FROM users WHERE role = 'ADMIN'"
            );

            for (const admin of adminResult.rows) {
                await pool.query(
                    `
                    INSERT INTO notifications (user_id, title, body, type, is_read)
                    VALUES ($1, $2, $3, $4, false)
                    `,
                    [
                        admin.id,
                        '🔑 Password Reset Request',
                        `Student ${user.email} has requested a password reset. Please help them reset their password.`,
                        'alert'
                    ]
                );
            }
        } catch (err) {
            console.log("Notification table may not exist yet:", err.message);
        }

        try {
            await pool.query(
                `
                INSERT INTO password_resets (user_id, token, expires_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')
                `,
                [user.id, resetToken]
            );
        } catch (err) {
            console.log("Password resets table not created yet:", err.message);
        }

        const isStudent = user.role === 'STUDENT';

        res.json({
            message: isStudent 
                ? "Password reset request received. Your teacher has been notified." 
                : "Password reset link sent to your email",
            reset_token: resetToken,
            email: email,
            is_student: isStudent,
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({
            message: "Failed to process request",
            error: error.message,
        });
    }
};

// ==================== MODULE EXPORTS ====================
module.exports = {
    studentLogin,
    getStudentDashboard,
    getStudentGrades,
    getStudentAttendance,
    getStudentReportCard,
    changeStudentPassword,
    getStudentProfile,
    getStudentSchoolProfile,
    forgotPassword,
    checkTemporaryPassword,
    changePasswordFirstTime,
    getStudentAnnouncements,
    getStudentAssignments,
    getStudentAttendanceCalendar,
    downloadStudentReportCard,
};