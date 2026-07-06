const pool = require("../config/db");

const getDashboardStats = async (req, res) => {
  try {
    const studentCount = await pool.query(
      "SELECT COUNT(*) FROM students"
    );

    const teacherCount = await pool.query(
      "SELECT COUNT(*) FROM teachers"
    );

    const userCount = await pool.query(
      "SELECT COUNT(*) FROM users"
    );

    res.json({
      totalStudents: Number(studentCount.rows[0].count),
      totalTeachers: Number(teacherCount.rows[0].count),
      totalUsers: Number(userCount.rows[0].count),
      systemStatus: "Online",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load dashboard statistics",
    });
  }
};

module.exports = {
  getDashboardStats,
};