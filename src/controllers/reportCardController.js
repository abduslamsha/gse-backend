const pool = require("../config/db");
const PDFDocument = require("pdfkit");

// Helper: Get school profile
const getSchoolProfile = async () => {
    const result = await pool.query(
        "SELECT * FROM school_profile ORDER BY id DESC LIMIT 1"
    );
    return result.rows[0] || null;
};

// Helper: Calculate grade from percentage
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
        if (percentage >= 95) return 'A+';
        if (percentage >= 85) return 'A';
        if (percentage >= 75) return 'B+';
        if (percentage >= 65) return 'B';
        if (percentage >= 55) return 'C+';
        if (percentage >= 45) return 'C';
        if (percentage >= 35) return 'D';
        return 'F';
    }
};

// Helper: Get grade description
const getGradeDescription = (grade) => {
    const descriptions = {
        'A+': 'Outstanding',
        'A': 'Excellent',
        'B+': 'Very Good',
        'B': 'Good',
        'C+': 'Satisfactory',
        'C': 'Average',
        'D': 'Below Average',
        'F': 'Fail'
    };
    return descriptions[grade] || '';
};

// Helper: Get grade color
const getGradeColor = (grade) => {
    const colors = {
        'A+': '#22C55E',
        'A': '#22C55E',
        'B+': '#3B82F6',
        'B': '#3B82F6',
        'C+': '#F59E0B',
        'C': '#F59E0B',
        'D': '#F97316',
        'F': '#DC2626'
    };
    return colors[grade] || '#6B7280';
};

// Helper: Format date
const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

const formatDateTime = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// ==================== GET GRADE SUMMARY (FIXED - NO DUPLICATES) ====================
const getGradeSummary = async (req, res) => {
    try {
        const { grade_level, semester, academic_year, section } = req.query;

        // Use DISTINCT ON to prevent duplicates
        let query = `
            SELECT DISTINCT ON (s.id)
                s.id as student_id,
                s.student_id as student_identifier,
                s.first_name,
                s.last_name,
                s.grade_level,
                s.section,
                COALESCE(
                    (SELECT ROUND(AVG(st.percentage)::numeric, 1) 
                     FROM semester_totals st 
                     WHERE st.student_id = s.id 
                     AND st.semester = $1 
                     AND st.academic_year = $2
                     GROUP BY st.student_id), 0
                ) AS average_score,
                COALESCE(
                    (SELECT st.grade 
                     FROM semester_totals st 
                     WHERE st.student_id = s.id 
                     AND st.semester = $1 
                     AND st.academic_year = $2
                     LIMIT 1), '-'
                ) AS letter_grade,
                (
                    SELECT RANK() OVER (ORDER BY AVG(st.percentage) DESC)
                    FROM semester_totals st
                    WHERE st.student_id = s.id
                    AND st.semester = $1
                    AND st.academic_year = $2
                    GROUP BY st.student_id
                ) AS class_rank,
                COALESCE(
                    (SELECT rc.status 
                     FROM report_cards rc 
                     WHERE rc.student_id = s.id 
                     AND rc.semester = $1 
                     AND rc.academic_year = $2
                     LIMIT 1), 'Not Generated'
                ) AS report_card_status,
                (
                    SELECT rc.published_at 
                    FROM report_cards rc 
                    WHERE rc.student_id = s.id 
                    AND rc.semester = $1 
                    AND rc.academic_year = $2
                    LIMIT 1
                ) AS published_at,
                (
                    SELECT rc.id 
                    FROM report_cards rc 
                    WHERE rc.student_id = s.id 
                    AND rc.semester = $1 
                    AND rc.academic_year = $2
                    LIMIT 1
                ) AS report_card_id,
                COALESCE(
                    (
                        SELECT ROUND((COUNT(*) FILTER (WHERE a.status = 'Present')::numeric / NULLIF(COUNT(*), 0) * 100), 1)
                        FROM attendance a
                        WHERE a.student_id = s.id
                    ), 0
                ) AS attendance_percentage
            FROM students s
            WHERE s.grade_level = $3
        `;

        let params = [semester || 'Semester 1', academic_year || '2024/25', grade_level];
        let paramIndex = 4;

        if (section) {
            query += ` AND s.section = $${paramIndex}`;
            params.push(section);
            paramIndex++;
        }

        query += `
            ORDER BY s.id, average_score DESC
        `;

        const result = await pool.query(query, params);

        const processedData = result.rows.map(row => ({
            ...row,
            attendance_percentage: row.attendance_percentage || 0,
            average_score: parseFloat(row.average_score) || 0,
            class_rank: row.class_rank || '-',
            letter_grade: row.letter_grade || '-',
        }));

        res.json(processedData);
    } catch (error) {
        console.error("Error fetching grade summary:", error);
        res.status(500).json({
            message: "Failed to fetch grade summary",
            error: error.message,
        });
    }
};

// ==================== GET STUDENT REPORT DATA ====================
const getStudentReportData = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { semester, academic_year } = req.query;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        const studentResult = await pool.query(
            `
            SELECT 
                s.id,
                s.student_id,
                s.first_name,
                s.middle_name,
                s.last_name,
                s.grade_level,
                s.section,
                s.guardian_name,
                s.guardian_phone
            FROM students s
            WHERE s.id = $1
            `,
            [student_id]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const student = studentResult.rows[0];

        // Get grades
        const gradesResult = await pool.query(
            `
            SELECT 
                sub.name as subject_name,
                st.percentage,
                st.grade,
                st.total_score,
                st.total_points
            FROM semester_totals st
            JOIN subjects sub ON st.subject_id = sub.id
            WHERE st.student_id = $1
            AND st.semester = $2
            AND st.academic_year = $3
            ORDER BY sub.name
            `,
            [student_id, semesterVal, yearVal]
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
            [student_id]
        );

        const attendance = attendanceResult.rows[0];

        const rankResult = await pool.query(
            `
            SELECT 
                s.id as student_id,
                RANK() OVER (ORDER BY AVG(st.percentage) DESC) as rank
            FROM students s
            JOIN semester_totals st ON s.id = st.student_id
            WHERE st.semester = $1
            AND st.academic_year = $2
            AND s.grade_level = $3
            GROUP BY s.id
            `,
            [semesterVal, yearVal, student.grade_level]
        );

        let rank = null;
        rankResult.rows.forEach(row => {
            if (row.student_id === parseInt(student_id)) {
                rank = row.rank;
            }
        });

        const grades = gradesResult.rows;
        let totalPercentage = 0;
        grades.forEach(g => {
            totalPercentage += parseFloat(g.percentage);
        });
        const average = grades.length > 0 ? totalPercentage / grades.length : 0;
        const overallGrade = await calculateGrade(average);

        // Get report card status
        const reportCardResult = await pool.query(
            `
            SELECT * FROM report_cards 
            WHERE student_id = $1 AND semester = $2 AND academic_year = $3
            `,
            [student_id, semesterVal, yearVal]
        );

        res.json({
            student: {
                id: student.id,
                student_id: student.student_id,
                first_name: student.first_name,
                middle_name: student.middle_name,
                last_name: student.last_name,
                grade_level: student.grade_level,
                section: student.section,
                guardian_name: student.guardian_name,
                guardian_phone: student.guardian_phone,
            },
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
            average: parseFloat(average.toFixed(1)),
            overall_grade: overallGrade,
            rank: rank || '-',
            semester: semesterVal,
            academic_year: yearVal,
            report_card: reportCardResult.rows[0] || null,
        });

    } catch (error) {
        console.error("Error fetching student report data:", error);
        res.status(500).json({
            message: "Failed to fetch student report data",
            error: error.message,
        });
    }
};

// ==================== GENERATE REPORT CARD PDF (ORIGINAL STYLE) ====================
const generateReportCardPDF = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { semester, academic_year } = req.query;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        // Get student data
        const studentResult = await pool.query(
            `
            SELECT 
                s.id,
                s.student_id,
                s.first_name,
                s.middle_name,
                s.last_name,
                s.grade_level,
                s.section,
                s.guardian_name,
                s.guardian_phone
            FROM students s
            WHERE s.id = $1
            `,
            [student_id]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({
                message: "Student not found",
            });
        }

        const student = studentResult.rows[0];

        // Get grades
        const gradesResult = await pool.query(
            `
            SELECT 
                sub.name as subject_name,
                st.percentage,
                st.grade,
                st.total_score,
                st.total_points
            FROM semester_totals st
            JOIN subjects sub ON st.subject_id = sub.id
            WHERE st.student_id = $1
            AND st.semester = $2
            AND st.academic_year = $3
            ORDER BY sub.name
            `,
            [student_id, semesterVal, yearVal]
        );

        // Get attendance
        const attendanceResult = await pool.query(
            `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'Present') as present,
                COUNT(*) FILTER (WHERE status = 'Absent') as absent,
                COUNT(*) as total
            FROM attendance
            WHERE student_id = $1
            `,
            [student_id]
        );

        const attendance = attendanceResult.rows[0];

        // Get rank
        const rankResult = await pool.query(
            `
            SELECT 
                s.id as student_id,
                RANK() OVER (ORDER BY AVG(st.percentage) DESC) as rank
            FROM students s
            JOIN semester_totals st ON s.id = st.student_id
            WHERE st.semester = $1
            AND st.academic_year = $2
            AND s.grade_level = $3
            GROUP BY s.id
            `,
            [semesterVal, yearVal, student.grade_level]
        );

        let rank = null;
        rankResult.rows.forEach(row => {
            if (row.student_id === parseInt(student_id)) {
                rank = row.rank;
            }
        });

        const grades = gradesResult.rows;
        let totalPercentage = 0;
        grades.forEach(g => {
            totalPercentage += parseFloat(g.percentage);
        });
        const average = grades.length > 0 ? totalPercentage / grades.length : 0;
        const overallGrade = await calculateGrade(average);

        // Get school profile
        const schoolProfile = await getSchoolProfile();
        
        const schoolName = schoolProfile?.school_name || 'German School of Excellence';
        const schoolAddress = schoolProfile?.address || 'Adama, Ethiopia';
        const schoolPhone = schoolProfile?.phone || '+251 912 228 494';
        const schoolEmail = schoolProfile?.email || 'germanschooloe74@gmail.com';
        const schoolMotto = schoolProfile?.motto || 'Excellence in Learning, Leadership for Tomorrow';

        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=report_card_${student.student_id}.pdf`);

        doc.pipe(res);

        // ===== ORIGINAL CLEAN PDF DESIGN =====
        const primaryColor = '#1a365d';
        const accentColor = '#f4a261';

        // Header
        doc.fontSize(18)
           .fillColor(primaryColor)
           .text(schoolName, { align: 'center' });
        doc.fontSize(10)
           .fillColor('#4a5568')
           .text(`${schoolAddress} · ${schoolPhone}`, { align: 'center' });
        doc.fontSize(9)
           .fillColor('#718096')
           .text(schoolMotto, { align: 'center' });
        doc.moveDown();

        doc.fontSize(14)
           .fillColor(primaryColor)
           .text('STUDENT REPORT CARD', { align: 'center' });
        doc.moveDown(0.5);

        const infoY = doc.y;

        doc.fontSize(10)
           .fillColor('#2d3748')
           .text(`Student Name: ${student.first_name} ${student.middle_name || ''} ${student.last_name}`, 50, infoY)
           .text(`Student ID: ${student.student_id}`, 50, infoY + 20)
           .text(`Grade Level: ${student.grade_level}`, 50, infoY + 40)
           .text(`Section: ${student.section || 'N/A'}`, 50, infoY + 60)
           .text(`Semester: ${semesterVal}`, 300, infoY)
           .text(`Academic Year: ${yearVal}`, 300, infoY + 20)
           .text(`Date Issued: ${formatDate(new Date())}`, 300, infoY + 40);

        doc.moveDown(4);

        // ===== GRADES TABLE =====
        const tableTop = doc.y;
        const colWidths = [120, 60, 60, 60, 60, 60];
        const headers = ['Subject', 'Score', 'Points', 'Percentage', 'Grade', 'Remark'];

        doc.fontSize(9)
           .fillColor('#ffffff')
           .rect(50, tableTop, 495, 20)
           .fill(primaryColor);

        let xPos = 55;
        headers.forEach((header, i) => {
            doc.fillColor('#ffffff')
               .text(header, xPos, tableTop + 5, { width: colWidths[i] - 5, align: 'center' });
            xPos += colWidths[i];
        });

        let yPos = tableTop + 22;

        if (grades.length === 0) {
            doc.fontSize(10)
               .fillColor('#dc2626')
               .text('No grades available for this student.', 50, yPos);
        } else {
            grades.forEach((grade, index) => {
                const rowColor = index % 2 === 0 ? '#f7fafc' : '#edf2f7';
                doc.rect(50, yPos - 2, 495, 18)
                   .fill(rowColor);

                doc.fillColor('#2d3748')
                   .fontSize(8);

                const values = [
                    grade.subject_name,
                    grade.total_score || 0,
                    grade.total_points || 100,
                    parseFloat(grade.percentage).toFixed(1) + '%',
                    grade.grade || '-',
                    getGradeDescription(grade.grade),
                ];

                xPos = 55;
                values.forEach((val, i) => {
                    doc.text(String(val), xPos, yPos, { 
                        width: colWidths[i] - 5, 
                        align: i === 0 ? 'left' : 'center' 
                    });
                    xPos += colWidths[i];
                });

                yPos += 18;
            });
        }

        doc.moveDown(1);

        // ===== SUMMARY =====
        const summaryY = doc.y;

        doc.fontSize(11)
           .fillColor(primaryColor)
           .text('SUMMARY', 50, summaryY);

        const att = attendance;
        const attPercentage = att.total > 0 ? ((att.present / att.total) * 100).toFixed(1) : 0;

        doc.fontSize(10)
           .fillColor('#2d3748')
           .text(`Overall Average: ${average}%`, 50, summaryY + 20)
           .text(`Overall Grade: ${overallGrade}`, 50, summaryY + 38)
           .text(`Class Rank: ${rank || '-'}`, 50, summaryY + 56)
           .text(`Attendance Rate: ${attPercentage}%`, 250, summaryY + 20)
           .text(`Days Present: ${att.present || 0} / ${att.total || 0}`, 250, summaryY + 38);

        // Grading Scale
        doc.text('GRADING SCALE', 450, summaryY);
        doc.fontSize(7)
           .fillColor('#4a5568');
        const scaleY = summaryY + 18;
        const gradesScale = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
        const ranges = ['95-100', '85-94', '75-84', '65-74', '55-64', '45-54', '35-44', '<35'];

        gradesScale.forEach((g, i) => {
            const y = scaleY + (i * 12);
            doc.text(`${g}: ${ranges[i]}`, 450, y);
        });

        // Signatures
        const signY = doc.y + 40;
        doc.moveTo(50, signY)
           .lineTo(200, signY)
           .stroke()
           .moveTo(250, signY)
           .lineTo(400, signY)
           .stroke()
           .moveTo(450, signY)
           .lineTo(545, signY)
           .stroke();

        doc.fontSize(8)
           .fillColor('#4a5568')
           .text('Class Teacher', 80, signY + 5)
           .text('Principal', 290, signY + 5)
           .text('Parent/Guardian', 470, signY + 5);

        // Footer
        doc.moveDown(3);
        doc.fontSize(7)
           .fillColor('#a0aec0')
           .text(`This report card is an official document of ${schoolName}.`, { align: 'center' })
           .text('Any alteration renders it invalid.', { align: 'center' })
           .text(`Generated on: ${formatDateTime(new Date())}`, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error("Error generating report card PDF:", error);
        res.status(500).json({
            message: "Failed to generate report card PDF",
            error: error.message,
        });
    }
};

// ==================== GENERATE REPORT CARD ====================
const generateReportCard = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { semester, academic_year } = req.query;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

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

        const gradesResult = await pool.query(
            `
            SELECT 
                sub.name as subject_name,
                st.percentage,
                st.grade,
                st.total_score,
                st.total_points
            FROM semester_totals st
            JOIN subjects sub ON st.subject_id = sub.id
            WHERE st.student_id = $1
            AND st.semester = $2
            AND st.academic_year = $3
            ORDER BY sub.name
            `,
            [student_id, semesterVal, yearVal]
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
                COUNT(*) as total
            FROM attendance
            WHERE student_id = $1
            `,
            [student_id]
        );

        const attendance = attendanceResult.rows[0];
        const attPercentage = attendance.total > 0 
            ? ((attendance.present / attendance.total) * 100).toFixed(1)
            : 0;

        const rankResult = await pool.query(
            `
            SELECT 
                s.id as student_id,
                RANK() OVER (ORDER BY AVG(st.percentage) DESC) as rank
            FROM students s
            JOIN semester_totals st ON s.id = st.student_id
            WHERE st.semester = $1
            AND st.academic_year = $2
            AND s.grade_level = $3
            GROUP BY s.id
            `,
            [semesterVal, yearVal, student.grade_level]
        );

        let rank = null;
        rankResult.rows.forEach(row => {
            if (row.student_id === parseInt(student_id)) {
                rank = row.rank;
            }
        });

        const existingCheck = await pool.query(
            `
            SELECT * FROM report_cards 
            WHERE student_id = $1 AND semester = $2 AND academic_year = $3
            `,
            [student_id, semesterVal, yearVal]
        );

        let result;
        if (existingCheck.rows.length > 0) {
            result = await pool.query(
                `
                UPDATE report_cards 
                SET 
                    average_score = $1,
                    letter_grade = $2,
                    class_rank = $3,
                    attendance_percentage = $4,
                    generated_at = CURRENT_TIMESTAMP,
                    generated_by = $5
                WHERE student_id = $6 AND semester = $7 AND academic_year = $8
                RETURNING *
                `,
                [
                    average,
                    overallGrade,
                    rank,
                    attPercentage,
                    req.user.id,
                    student_id,
                    semesterVal,
                    yearVal
                ]
            );
        } else {
            result = await pool.query(
                `
                INSERT INTO report_cards (
                    student_id,
                    semester,
                    academic_year,
                    average_score,
                    letter_grade,
                    class_rank,
                    attendance_percentage,
                    status,
                    generated_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
                RETURNING *
                `,
                [
                    student_id,
                    semesterVal,
                    yearVal,
                    average,
                    overallGrade,
                    rank,
                    attPercentage,
                    req.user.id
                ]
            );
        }

        res.json({
            message: "Report card generated successfully",
            report_card: result.rows[0],
        });

    } catch (error) {
        console.error("Error generating report card:", error);
        res.status(500).json({
            message: "Failed to generate report card",
            error: error.message,
        });
    }
};

// ==================== PUBLISH REPORT CARD ====================
const publishReportCard = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { semester, academic_year } = req.query;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        const result = await pool.query(
            `
            UPDATE report_cards 
            SET 
                status = 'published',
                published_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 
            AND semester = $2 
            AND academic_year = $3
            RETURNING *
            `,
            [student_id, semesterVal, yearVal]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Report card not found. Please generate first.",
            });
        }

        res.json({
            message: "Report card published successfully",
            report_card: result.rows[0],
        });

    } catch (error) {
        console.error("Error publishing report card:", error);
        res.status(500).json({
            message: "Failed to publish report card",
            error: error.message,
        });
    }
};

// ==================== DELETE REPORT CARD ====================
const deleteReportCard = async (req, res) => {
    try {
        const { student_id } = req.params;
        const { semester, academic_year } = req.query;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        const result = await pool.query(
            `
            DELETE FROM report_cards 
            WHERE student_id = $1 
            AND semester = $2 
            AND academic_year = $3
            RETURNING *
            `,
            [student_id, semesterVal, yearVal]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Report card not found",
            });
        }

        res.json({
            message: "Report card deleted successfully",
            report_card: result.rows[0],
        });

    } catch (error) {
        console.error("Error deleting report card:", error);
        res.status(500).json({
            message: "Failed to delete report card",
            error: error.message,
        });
    }
};

// ==================== BULK GENERATE ====================
const bulkGenerateReportCards = async (req, res) => {
    try {
        const { grade_level, section, semester, academic_year } = req.body;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        let query = `
            SELECT id FROM students 
            WHERE grade_level = $1
        `;
        let params = [grade_level];

        if (section) {
            query += ` AND section = $2`;
            params.push(section);
        }

        const studentsResult = await pool.query(query, params);

        const students = studentsResult.rows;
        let generated = 0;
        let failed = 0;

        for (const student of students) {
            try {
                const gradesResult = await pool.query(
                    `
                    SELECT percentage FROM semester_totals 
                    WHERE student_id = $1 AND semester = $2 AND academic_year = $3
                    `,
                    [student.id, semesterVal, yearVal]
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
                        COUNT(*) as total
                    FROM attendance
                    WHERE student_id = $1
                    `,
                    [student.id]
                );

                const attendance = attendanceResult.rows[0];
                const attPercentage = attendance.total > 0 
                    ? ((attendance.present / attendance.total) * 100).toFixed(1)
                    : 0;

                const rankResult = await pool.query(
                    `
                    SELECT 
                        s.id as student_id,
                        RANK() OVER (ORDER BY AVG(st.percentage) DESC) as rank
                    FROM students s
                    JOIN semester_totals st ON s.id = st.student_id
                    WHERE st.semester = $1
                    AND st.academic_year = $2
                    AND s.grade_level = $3
                    GROUP BY s.id
                    `,
                    [semesterVal, yearVal, grade_level]
                );

                let rank = null;
                rankResult.rows.forEach(row => {
                    if (row.student_id === student.id) {
                        rank = row.rank;
                    }
                });

                const existingCheck = await pool.query(
                    `
                    SELECT * FROM report_cards 
                    WHERE student_id = $1 AND semester = $2 AND academic_year = $3
                    `,
                    [student.id, semesterVal, yearVal]
                );

                if (existingCheck.rows.length > 0) {
                    await pool.query(
                        `
                        UPDATE report_cards 
                        SET 
                            average_score = $1,
                            letter_grade = $2,
                            class_rank = $3,
                            attendance_percentage = $4,
                            generated_at = CURRENT_TIMESTAMP
                        WHERE student_id = $5 AND semester = $6 AND academic_year = $7
                        `,
                        [
                            average,
                            overallGrade,
                            rank,
                            attPercentage,
                            student.id,
                            semesterVal,
                            yearVal
                        ]
                    );
                } else {
                    await pool.query(
                        `
                        INSERT INTO report_cards (
                            student_id,
                            semester,
                            academic_year,
                            average_score,
                            letter_grade,
                            class_rank,
                            attendance_percentage,
                            status,
                            generated_by
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
                        `,
                        [
                            student.id,
                            semesterVal,
                            yearVal,
                            average,
                            overallGrade,
                            rank,
                            attPercentage,
                            req.user.id
                        ]
                    );
                }
                generated++;
            } catch (err) {
                failed++;
                console.error(`Error generating report card for student ${student.id}:`, err);
            }
        }

        res.json({
            message: `Bulk generation completed`,
            total_students: students.length,
            generated: generated,
            failed: failed,
        });

    } catch (error) {
        console.error("Error in bulk generate:", error);
        res.status(500).json({
            message: "Failed to bulk generate report cards",
            error: error.message,
        });
    }
};

// ==================== BULK PUBLISH ====================
const bulkPublishReportCards = async (req, res) => {
    try {
        const { grade_level, section, semester, academic_year } = req.body;

        const semesterVal = semester || 'Semester 1';
        const yearVal = academic_year || '2024/25';

        let query = `
            UPDATE report_cards 
            SET 
                status = 'published',
                published_at = CURRENT_TIMESTAMP
            WHERE student_id IN (
                SELECT id FROM students WHERE grade_level = $1
            )
            AND semester = $2
            AND academic_year = $3
        `;
        let params = [grade_level, semesterVal, yearVal];
        let paramIndex = 4;

        if (section) {
            query += ` AND student_id IN (
                SELECT id FROM students WHERE section = $${paramIndex}
            )`;
            params.push(section);
            paramIndex++;
        }

        const result = await pool.query(query, params);

        res.json({
            message: `Published report cards successfully`,
            published: result.rowCount || 0,
        });

    } catch (error) {
        console.error("Error in bulk publish:", error);
        res.status(500).json({
            message: "Failed to bulk publish report cards",
            error: error.message,
        });
    }
};

// ==================== GET GRADE LEVELS ====================
const getGradeLevels = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT DISTINCT grade_level 
            FROM students 
            WHERE grade_level IS NOT NULL 
            ORDER BY grade_level
            `
        );

        res.json(result.rows.map(row => row.grade_level));
    } catch (error) {
        console.error("Error fetching grade levels:", error);
        res.status(500).json({
            message: "Failed to fetch grade levels",
            error: error.message,
        });
    }
};

// ==================== GET REPORT CARD STATUS ====================
const getReportCardStatus = async (req, res) => {
    try {
        const { student_id, semester, academic_year } = req.params;

        const result = await pool.query(
            `
            SELECT * FROM report_cards 
            WHERE student_id = $1 
            AND semester = $2 
            AND academic_year = $3
            `,
            [student_id, semester, academic_year]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Report card not found",
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching report card status:", error);
        res.status(500).json({
            message: "Failed to fetch report card status",
            error: error.message,
        });
    }
};

module.exports = {
    getGradeSummary,
    getStudentReportData,
    generateReportCardPDF,
    generateReportCard,
    publishReportCard,
    deleteReportCard,
    bulkGenerateReportCards,
    bulkPublishReportCards,
    getGradeLevels,
    getReportCardStatus,
};