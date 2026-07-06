const pool = require("../config/db");

// GET COMPLETE DASHBOARD STATISTICS
const getDashboardStats = async (req, res) => {
    try {
        // 1. Get total counts
        const studentsResult = await pool.query(
            "SELECT COUNT(*) as count FROM students"
        );
        const teachersResult = await pool.query(
            "SELECT COUNT(*) as count FROM teachers"
        );
        const usersResult = await pool.query(
            "SELECT COUNT(*) as count FROM users"
        );

        // 2. Get pending admissions
        const pendingAdmissionsResult = await pool.query(
            "SELECT COUNT(*) as count FROM admissions WHERE status = 'PENDING'"
        );

        // 3. Get today's attendance
        const today = new Date().toISOString().split('T')[0];
        const todayAttendanceResult = await pool.query(
            `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late
            FROM attendance 
            WHERE attendance_date = $1
            `,
            [today]
        );

        // 4. Get total subjects
        const subjectsResult = await pool.query(
            "SELECT COUNT(*) as count FROM subjects"
        );

        // 5. Get total assessments
        const assessmentsResult = await pool.query(
            "SELECT COUNT(*) as count FROM assessments"
        );

        // 6. Get total report cards
        const reportCardsResult = await pool.query(
            "SELECT COUNT(*) as count FROM report_cards"
        );

        // 7. Get published report cards
        const publishedReportCardsResult = await pool.query(
            "SELECT COUNT(*) as count FROM report_cards WHERE status = 'published'"
        );

        // 8. Get recent students (last 5)
        const recentStudentsResult = await pool.query(
            `
            SELECT id, student_id, first_name, last_name, grade_level, section, created_at
            FROM students 
            ORDER BY id DESC 
            LIMIT 5
            `
        );

        // 9. Get recent admissions (last 5)
        const recentAdmissionsResult = await pool.query(
            `
            SELECT id, application_no, first_name, last_name, status, created_at
            FROM admissions 
            ORDER BY id DESC 
            LIMIT 5
            `
        );

        // 10. Get grade distribution (students per grade)
        const gradeDistributionResult = await pool.query(
            `
            SELECT grade_level, COUNT(*) as count
            FROM students
            WHERE grade_level IS NOT NULL
            GROUP BY grade_level
            ORDER BY grade_level
            `
        );

        // 11. Get weekly attendance trend (last 7 days)
        const weeklyAttendanceResult = await pool.query(
            `
            SELECT 
                attendance_date,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present
            FROM attendance 
            WHERE attendance_date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY attendance_date
            ORDER BY attendance_date DESC
            `
        );

        // 12. Get fee summary (if payments table exists)
        let feeSummary = { total_fees: 0, total_paid: 0, balance: 0 };
        try {
            const feeResult = await pool.query(`
                SELECT 
                    COALESCE(SUM(amount), 0) as total_fees,
                    COALESCE(SUM(paid_amount), 0) as total_paid
                FROM student_fees
            `);
            feeSummary = {
                total_fees: parseFloat(feeResult.rows[0]?.total_fees || 0),
                total_paid: parseFloat(feeResult.rows[0]?.total_paid || 0),
                balance: parseFloat(feeResult.rows[0]?.total_fees || 0) - parseFloat(feeResult.rows[0]?.total_paid || 0),
            };
        } catch (e) {
            // Payments table might not exist yet
        }

        // 13. Get upcoming deadlines (if any)
        let upcomingDeadlines = [];
        try {
            const deadlinesResult = await pool.query(`
                SELECT 
                    s.id as student_id,
                    s.first_name,
                    s.last_name,
                    sf.due_date,
                    sf.amount,
                    sf.paid_amount,
                    (sf.amount - sf.paid_amount) as balance
                FROM student_fees sf
                JOIN students s ON sf.student_id = s.id
                WHERE sf.due_date >= CURRENT_DATE
                AND sf.due_date <= CURRENT_DATE + INTERVAL '7 days'
                AND sf.paid_amount < sf.amount
                ORDER BY sf.due_date ASC
                LIMIT 5
            `);
            upcomingDeadlines = deadlinesResult.rows;
        } catch (e) {
            // Payments table might not exist yet
        }

        // 14. Get recent activity (combine students, admissions, assessments)
        const recentActivityResult = await pool.query(
            `
            (SELECT 
                'student' as type,
                id,
                first_name || ' ' || last_name as name,
                created_at as date,
                'added a new student' as action
            FROM students
            ORDER BY created_at DESC
            LIMIT 3)
            UNION ALL
            (SELECT 
                'admission' as type,
                id,
                first_name || ' ' || last_name as name,
                created_at as date,
                'submitted an application' as action
            FROM admissions
            ORDER BY created_at DESC
            LIMIT 3)
            UNION ALL
            (SELECT 
                'assessment' as type,
                id,
                'Assessment' as name,
                created_at as date,
                'added new assessment' as action
            FROM assessments
            ORDER BY created_at DESC
            LIMIT 3)
            ORDER BY date DESC
            LIMIT 10
            `
        );

        res.json({
            // Stats Cards
            stats: {
                students: parseInt(studentsResult.rows[0].count),
                teachers: parseInt(teachersResult.rows[0].count),
                users: parseInt(usersResult.rows[0].count),
                pendingAdmissions: parseInt(pendingAdmissionsResult.rows[0].count),
                subjects: parseInt(subjectsResult.rows[0].count),
                assessments: parseInt(assessmentsResult.rows[0].count),
                reportCards: parseInt(reportCardsResult.rows[0].count),
                publishedReportCards: parseInt(publishedReportCardsResult.rows[0].count),
                feeSummary: feeSummary,
            },
            
            // Today's Attendance
            todayAttendance: {
                total: parseInt(todayAttendanceResult.rows[0]?.total || 0),
                present: parseInt(todayAttendanceResult.rows[0]?.present || 0),
                absent: parseInt(todayAttendanceResult.rows[0]?.absent || 0),
                late: parseInt(todayAttendanceResult.rows[0]?.late || 0),
                percentage: todayAttendanceResult.rows[0]?.total > 0 
                    ? ((todayAttendanceResult.rows[0].present / todayAttendanceResult.rows[0].total) * 100).toFixed(1)
                    : 0,
            },
            
            // Recent Data
            recentStudents: recentStudentsResult.rows,
            recentAdmissions: recentAdmissionsResult.rows,
            gradeDistribution: gradeDistributionResult.rows,
            weeklyAttendance: weeklyAttendanceResult.rows,
            upcomingDeadlines: upcomingDeadlines,
            recentActivity: recentActivityResult.rows,
        });

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({
            message: "Failed to fetch dashboard statistics",
            error: error.message,
        });
    }
};

module.exports = {
    getDashboardStats,
};