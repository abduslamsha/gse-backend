const pool = require("../config/db");

// ==================== SUBJECT CRUD ====================

// CREATE SUBJECT
const createSubject = async (req, res) => {
  try {
    const { subject_code, name, grade_level } = req.body;

    const result = await pool.query(
      `
      INSERT INTO subjects (subject_code, name, grade_level)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [subject_code, name, grade_level]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating subject:", error);
    res.status(500).json({
      message: "Failed to create subject",
      error: error.message,
    });
  }
};

// GET ALL SUBJECTS
const getSubjects = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM subjects ORDER BY id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching subjects:", error);
    res.status(500).json({
      message: "Failed to fetch subjects",
      error: error.message,
    });
  }
};

// GET SUBJECT BY ID
const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM subjects WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching subject:", error);
    res.status(500).json({
      message: "Failed to fetch subject",
      error: error.message,
    });
  }
};

// UPDATE SUBJECT
const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject_code, name, grade_level } = req.body;

    const checkResult = await pool.query(
      "SELECT * FROM subjects WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    const result = await pool.query(
      `
      UPDATE subjects 
      SET 
        subject_code = $1,
        name = $2,
        grade_level = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
      `,
      [subject_code, name, grade_level, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating subject:", error);
    res.status(500).json({
      message: "Failed to update subject",
      error: error.message,
    });
  }
};

// DELETE SUBJECT
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM subjects WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    res.json({
      message: "Subject deleted successfully",
      subject: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({
      message: "Failed to delete subject",
      error: error.message,
    });
  }
};

// ==================== TEACHER-SUBJECT ASSIGNMENT ====================

// ASSIGN SUBJECT TO TEACHER
const assignSubjectToTeacher = async (req, res) => {
  try {
    const { teacher_id, subject_id } = req.body;

    // Check if teacher exists
    const teacherCheck = await pool.query(
      "SELECT * FROM teachers WHERE id = $1",
      [teacher_id]
    );

    if (teacherCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Teacher not found",
      });
    }

    // Check if subject exists
    const subjectCheck = await pool.query(
      "SELECT * FROM subjects WHERE id = $1",
      [subject_id]
    );

    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    // Check if already assigned
    const existingCheck = await pool.query(
      "SELECT * FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
      [teacher_id, subject_id]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        message: "Subject already assigned to this teacher",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO teacher_subjects (teacher_id, subject_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [teacher_id, subject_id]
    );

    res.status(201).json({
      message: "Subject assigned to teacher successfully",
      assignment: result.rows[0],
    });
  } catch (error) {
    console.error("Error assigning subject to teacher:", error);
    res.status(500).json({
      message: "Failed to assign subject to teacher",
      error: error.message,
    });
  }
};

// REMOVE SUBJECT FROM TEACHER
const removeSubjectFromTeacher = async (req, res) => {
  try {
    const { teacher_id, subject_id } = req.params;

    const result = await pool.query(
      "DELETE FROM teacher_subjects WHERE teacher_id = $1 AND subject_id = $2 RETURNING *",
      [teacher_id, subject_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    res.json({
      message: "Subject removed from teacher successfully",
    });
  } catch (error) {
    console.error("Error removing subject from teacher:", error);
    res.status(500).json({
      message: "Failed to remove subject from teacher",
      error: error.message,
    });
  }
};

// GET TEACHER'S SUBJECTS
const getTeacherSubjects = async (req, res) => {
  try {
    const { teacher_id } = req.params;

    const result = await pool.query(
      `
      SELECT s.*, ts.assigned_date
      FROM subjects s
      JOIN teacher_subjects ts ON s.id = ts.subject_id
      WHERE ts.teacher_id = $1
      ORDER BY s.grade_level, s.name
      `,
      [teacher_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching teacher subjects:", error);
    res.status(500).json({
      message: "Failed to fetch teacher subjects",
      error: error.message,
    });
  }
};

// GET ALL TEACHER ASSIGNMENTS
const getAllTeacherAssignments = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        ts.id,
        ts.assigned_date,
        t.id as teacher_id,
        t.employee_id,
        t.first_name as teacher_first_name,
        t.last_name as teacher_last_name,
        s.id as subject_id,
        s.subject_code,
        s.name as subject_name,
        s.grade_level
      FROM teacher_subjects ts
      JOIN teachers t ON ts.teacher_id = t.id
      JOIN subjects s ON ts.subject_id = s.id
      ORDER BY t.first_name, s.grade_level, s.name
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching teacher assignments:", error);
    res.status(500).json({
      message: "Failed to fetch teacher assignments",
      error: error.message,
    });
  }
};

// GET SUBJECTS NOT ASSIGNED TO TEACHER
const getSubjectsNotAssignedToTeacher = async (req, res) => {
  try {
    const { teacher_id } = req.params;

    const result = await pool.query(
      `
      SELECT s.*
      FROM subjects s
      WHERE s.id NOT IN (
        SELECT subject_id 
        FROM teacher_subjects 
        WHERE teacher_id = $1
      )
      ORDER BY s.grade_level, s.name
      `,
      [teacher_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching available subjects:", error);
    res.status(500).json({
      message: "Failed to fetch available subjects",
      error: error.message,
    });
  }
};

// ==================== STUDENT-SUBJECT ENROLLMENT ====================

// ENROLL STUDENT IN SUBJECT
const enrollStudentInSubject = async (req, res) => {
  try {
    const { student_id, subject_id } = req.body;

    // Check if student exists
    const studentCheck = await pool.query(
      "SELECT * FROM students WHERE id = $1",
      [student_id]
    );

    if (studentCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    // Check if subject exists
    const subjectCheck = await pool.query(
      "SELECT * FROM subjects WHERE id = $1",
      [subject_id]
    );

    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    // Check if already enrolled
    const existingCheck = await pool.query(
      "SELECT * FROM student_subjects WHERE student_id = $1 AND subject_id = $2",
      [student_id, subject_id]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        message: "Student already enrolled in this subject",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO student_subjects (student_id, subject_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [student_id, subject_id]
    );

    res.status(201).json({
      message: "Student enrolled in subject successfully",
      enrollment: result.rows[0],
    });
  } catch (error) {
    console.error("Error enrolling student:", error);
    res.status(500).json({
      message: "Failed to enroll student",
      error: error.message,
    });
  }
};

// REMOVE STUDENT FROM SUBJECT
const removeStudentFromSubject = async (req, res) => {
  try {
    const { student_id, subject_id } = req.params;

    const result = await pool.query(
      "DELETE FROM student_subjects WHERE student_id = $1 AND subject_id = $2 RETURNING *",
      [student_id, subject_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Enrollment not found",
      });
    }

    res.json({
      message: "Student removed from subject successfully",
    });
  } catch (error) {
    console.error("Error removing student from subject:", error);
    res.status(500).json({
      message: "Failed to remove student from subject",
      error: error.message,
    });
  }
};

// GET STUDENT'S SUBJECTS
const getStudentSubjects = async (req, res) => {
  try {
    const { student_id } = req.params;

    const result = await pool.query(
      `
      SELECT s.*, ss.enrolled_date
      FROM subjects s
      JOIN student_subjects ss ON s.id = ss.subject_id
      WHERE ss.student_id = $1
      ORDER BY s.grade_level, s.name
      `,
      [student_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching student subjects:", error);
    res.status(500).json({
      message: "Failed to fetch student subjects",
      error: error.message,
    });
  }
};

// GET ALL STUDENT ENROLLMENTS
const getAllStudentEnrollments = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        ss.id,
        ss.enrolled_date,
        st.id as student_id,
        st.student_id as student_identifier,
        st.first_name as student_first_name,
        st.last_name as student_last_name,
        st.grade_level,
        s.id as subject_id,
        s.subject_code,
        s.name as subject_name
      FROM student_subjects ss
      JOIN students st ON ss.student_id = st.id
      JOIN subjects s ON ss.subject_id = s.id
      ORDER BY st.first_name, s.grade_level, s.name
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching student enrollments:", error);
    res.status(500).json({
      message: "Failed to fetch student enrollments",
      error: error.message,
    });
  }
};

// GET SUBJECTS NOT ENROLLED BY STUDENT
const getSubjectsNotEnrolledByStudent = async (req, res) => {
  try {
    const { student_id } = req.params;

    const result = await pool.query(
      `
      SELECT s.*
      FROM subjects s
      WHERE s.id NOT IN (
        SELECT subject_id 
        FROM student_subjects 
        WHERE student_id = $1
      )
      ORDER BY s.grade_level, s.name
      `,
      [student_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching available subjects:", error);
    res.status(500).json({
      message: "Failed to fetch available subjects",
      error: error.message,
    });
  }
};

// ==================== EXPORTS ====================

module.exports = {
  createSubject,
  getSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  assignSubjectToTeacher,
  removeSubjectFromTeacher,
  getTeacherSubjects,
  getAllTeacherAssignments,
  getSubjectsNotAssignedToTeacher,
  enrollStudentInSubject,
  removeStudentFromSubject,
  getStudentSubjects,
  getAllStudentEnrollments,
  getSubjectsNotEnrolledByStudent,
};