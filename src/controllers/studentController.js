const pool = require("../config/db");

// CREATE STUDENT (with auto-generated student ID)
const createStudent = async (req, res) => {
  try {
    const {
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      grade_level,
      section,
      guardian_name,
      guardian_phone,
      guardian_address,
      email,
    } = req.body;

    // Get the last student ID to generate the next one
    const lastStudent = await pool.query(
      `
      SELECT student_id 
      FROM students 
      ORDER BY id DESC 
      LIMIT 1
      `
    );

    let newStudentId = 'STD-1001';

    if (lastStudent.rows.length > 0) {
      const lastId = lastStudent.rows[0].student_id;
      const lastNumber = parseInt(lastId.split('-')[1], 10);
      const nextNumber = lastNumber + 1;
      newStudentId = `STD-${nextNumber}`;
    }

    const result = await pool.query(
      `
      INSERT INTO students (
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
        guardian_address,
        email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
      `,
      [
        newStudentId,
        first_name,
        middle_name || null,
        last_name,
        gender || null,
        date_of_birth || null,
        grade_level,
        section || null,
        guardian_name,
        guardian_phone,
        guardian_address || "Not Provided",
        email || `${first_name.toLowerCase()}.${last_name.toLowerCase()}@gsems.com`,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating student:", error);
    res.status(500).json({
      message: "Failed to create student",
      error: error.message,
    });
  }
};

// GET ALL STUDENTS
const getStudents = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM students ORDER BY id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({
      message: "Failed to fetch students",
      error: error.message,
    });
  }
};

// GET STUDENT BY ID
const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate that id is a number
    if (isNaN(id)) {
      return res.status(400).json({
        message: "Invalid student ID format",
      });
    }

    const result = await pool.query(
      "SELECT * FROM students WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching student:", error);
    res.status(500).json({
      message: "Failed to fetch student",
      error: error.message,
    });
  }
};

// UPDATE STUDENT
const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate that id is a number
    if (isNaN(id)) {
      return res.status(400).json({
        message: "Invalid student ID format",
      });
    }

    const {
      first_name,
      middle_name,
      last_name,
      gender,
      date_of_birth,
      grade_level,
      section,
      guardian_name,
      guardian_phone,
      guardian_address,
      email,
    } = req.body;

    const checkResult = await pool.query(
      "SELECT * FROM students WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const result = await pool.query(
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
        guardian_address = $10,
        email = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
      `,
      [
        first_name,
        middle_name || null,
        last_name,
        gender || null,
        date_of_birth || null,
        grade_level,
        section || null,
        guardian_name,
        guardian_phone,
        guardian_address,
        email,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating student:", error);
    res.status(500).json({
      message: "Failed to update student",
      error: error.message,
    });
  }
};

// DELETE STUDENT
const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate that id is a number
    if (isNaN(id)) {
      return res.status(400).json({
        message: "Invalid student ID format",
      });
    }

    const result = await pool.query(
      "DELETE FROM students WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.json({
      message: "Student deleted successfully",
      student: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting student:", error);
    res.status(500).json({
      message: "Failed to delete student",
      error: error.message,
    });
  }
};

// GET UNIQUE GRADES (for dropdown)
const getUniqueGrades = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT grade_level FROM students WHERE grade_level IS NOT NULL AND grade_level != '' ORDER BY grade_level"
    );
    res.json(result.rows.map(row => row.grade_level));
  } catch (error) {
    console.error("Error fetching unique grades:", error);
    res.status(500).json({
      message: "Failed to fetch grades",
      error: error.message,
    });
  }
};

module.exports = {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  getUniqueGrades,
};