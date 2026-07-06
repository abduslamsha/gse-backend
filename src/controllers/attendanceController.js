const pool = require("../config/db");

// MARK ATTENDANCE
const markAttendance = async (req, res) => {
  try {
    const {
      student_id,
      attendance_date,
      status,
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO attendance (
        student_id,
        attendance_date,
        status
      )
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [
        student_id,
        attendance_date,
        status,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to mark attendance",
    });
  }
};

// GET ALL ATTENDANCE
const getAttendance = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        attendance.id,
        attendance.attendance_date,
        attendance.status,
        students.student_id,
        students.first_name,
        students.last_name
      FROM attendance
      JOIN students
      ON attendance.student_id = students.id
      ORDER BY attendance.id DESC
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch attendance",
    });
  }
};

// DELETE ATTENDANCE
const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM attendance
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Attendance record not found",
      });
    }

    res.json({
      message:
        "Attendance deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message:
        "Failed to delete attendance",
    });
  }
};

module.exports = {
  markAttendance,
  getAttendance,
  deleteAttendance,
};