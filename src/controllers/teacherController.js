const pool = require("../config/db");

// CREATE TEACHER (with auto-generated teacher ID)
const createTeacher = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      gender,
      phone,
      email,
      qualification,
      hire_date,
    } = req.body;

    // Get the last teacher ID to generate the next one
    const lastTeacher = await pool.query(
      `
      SELECT employee_id 
      FROM teachers 
      ORDER BY id DESC 
      LIMIT 1
      `
    );

    let newTeacherId = 'TCH-1001';

    if (lastTeacher.rows.length > 0) {
      const lastId = lastTeacher.rows[0].employee_id;
      const lastNumber = parseInt(lastId.split('-')[1], 10);
      if (!isNaN(lastNumber)) {
        const nextNumber = lastNumber + 1;
        newTeacherId = `TCH-${nextNumber}`;
      }
    }

    const result = await pool.query(
      `
      INSERT INTO teachers (
        employee_id,
        first_name,
        last_name,
        gender,
        phone,
        email,
        qualification,
        hire_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        newTeacherId,
        first_name,
        last_name,
        gender || null,
        phone,
        email || `${first_name.toLowerCase()}.${last_name.toLowerCase()}@gsems.com`,
        qualification,
        hire_date || new Date().toISOString().split('T')[0],
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating teacher:", error);
    res.status(500).json({
      message: "Failed to create teacher",
      error: error.message,
    });
  }
};

// GET ALL TEACHERS
const getTeachers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, employee_id, first_name, last_name, gender, phone, email, qualification, hire_date, status, created_at FROM teachers ORDER BY id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching teachers:", error);
    res.status(500).json({
      message: "Failed to fetch teachers",
      error: error.message,
    });
  }
};

// GET TEACHER BY ID
const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT id, employee_id, first_name, last_name, gender, phone, email, qualification, hire_date, status, created_at FROM teachers WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching teacher:", error);
    res.status(500).json({
      message: "Failed to fetch teacher",
      error: error.message,
    });
  }
};

// UPDATE TEACHER
const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name,
      last_name,
      gender,
      phone,
      email,
      qualification,
      hire_date,
    } = req.body;

    const checkResult = await pool.query(
      "SELECT * FROM teachers WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    const result = await pool.query(
      `
      UPDATE teachers 
      SET 
        first_name = $1,
        last_name = $2,
        gender = $3,
        phone = $4,
        email = $5,
        qualification = $6,
        hire_date = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, employee_id, first_name, last_name, gender, phone, email, qualification, hire_date, status, created_at
      `,
      [
        first_name,
        last_name,
        gender || null,
        phone,
        email,
        qualification,
        hire_date,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating teacher:", error);
    res.status(500).json({
      message: "Failed to update teacher",
      error: error.message,
    });
  }
};

// DELETE TEACHER
const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM teachers WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    res.json({
      message: "Teacher deleted successfully",
      teacher: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting teacher:", error);
    res.status(500).json({
      message: "Failed to delete teacher",
      error: error.message,
    });
  }
};

module.exports = {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
};