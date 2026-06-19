import { describe, it, expect, vi } from "vitest";
import {
  listStudentEnrolledClassesForTeacher,
  verifyStudentAccessForTeacher,
  listAttendanceForDay,
} from "./externalDummy";

// Helper to create a mock D1Database
function createMockDb(mockResults: any[] | null, mockFirstRow: any | null) {
  const mockAll = vi.fn().mockResolvedValue({ results: mockResults });
  const mockFirst = vi.fn().mockResolvedValue(mockFirstRow);
  
  const mockBind = vi.fn().mockReturnValue({
    all: mockAll,
    first: mockFirst,
  });
  
  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind,
  });

  return {
    db: {
      prepare: mockPrepare,
    } as unknown as D1Database,
    mockPrepare,
    mockBind,
    mockAll,
    mockFirst,
  };
}

describe("Attendance Multi-Class Resolve & Verification Helpers", () => {
  describe("listStudentEnrolledClassesForTeacher", () => {
    it("should return empty list when student is enrolled in 0 classes for the teacher", async () => {
      const { db } = createMockDb([], null);
      
      const results = await listStudentEnrolledClassesForTeacher(db, "student_1", "teacher_1");
      
      expect(results).toEqual([]);
    });

    it("should return exactly 1 class when student is enrolled in 1 class for the teacher", async () => {
      const mockClasses = [
        { id: "CS101", name: "Computer Science 101", code: "CS101" }
      ];
      const { db } = createMockDb(mockClasses, null);

      const results = await listStudentEnrolledClassesForTeacher(db, "student_1", "teacher_1");
      
      expect(results).toEqual(mockClasses);
      expect(results.length).toBe(1);
    });

    it("should return multiple classes when student is enrolled in multiple classes for the teacher", async () => {
      const mockClasses = [
        { id: "CS101", name: "Computer Science 101", code: "CS101" },
        { id: "MATH201", name: "Discrete Mathematics", code: "MATH201" }
      ];
      const { db } = createMockDb(mockClasses, null);

      const results = await listStudentEnrolledClassesForTeacher(db, "student_1", "teacher_1");
      
      expect(results).toEqual(mockClasses);
      expect(results.length).toBe(2);
    });
  });

  describe("verifyStudentAccessForTeacher", () => {
    it("should return null if student access token is invalid or expired", async () => {
      const { db } = createMockDb(null, null);

      const studentAccess = await verifyStudentAccessForTeacher(db, "invalid_token", "teacher_1");
      
      expect(studentAccess).toBeNull();
    });

    it("should return student access profile if token is valid and student is enrolled in teacher's classes", async () => {
      const mockAccessProfile = {
        studentId: "student_1",
        studentName: "Ada Sharma",
        studentEmail: "ada@example.com"
      };
      const { db } = createMockDb(null, mockAccessProfile);

      const studentAccess = await verifyStudentAccessForTeacher(db, "valid_token", "teacher_1");
      
      expect(studentAccess).toEqual(mockAccessProfile);
    });
  });
});

// ── listAttendanceForDay ───────────────────────────────────────────────

const MOCK_RECORD_1 = {
  id: "rec_001",
  studentName: "Alice Tamang",
  studentId: "student_abc",
  className: "Computer Science 101",
  classCode: "CS101",
  classId: "CS101",
  time: "09:15:00",
  checkoutTime: null,
  duration: null,
  deviceType: "mobile",
  country: "NP",
};

const MOCK_RECORD_2 = {
  id: "rec_002",
  studentName: "Bob Gurung",
  studentId: "student_def",
  className: "Mathematics",
  classCode: "MATH201",
  classId: "MATH201",
  time: "09:22:00",
  checkoutTime: null,
  duration: null,
  deviceType: "desktop",
  country: "IN",
};

describe("listAttendanceForDay", () => {
  it("returns an empty array when no records exist for the day (admin path)", async () => {
    const { db } = createMockDb([], null);

    const results = await listAttendanceForDay(db, "2025-01-15");

    expect(results).toEqual([]);
    expect(results.length).toBe(0);
  });

  it("returns all records for the day on the unfiltered admin path", async () => {
    const { db } = createMockDb([MOCK_RECORD_1, MOCK_RECORD_2], null);

    const results = await listAttendanceForDay(db, "2025-01-15");

    expect(results).toEqual([MOCK_RECORD_1, MOCK_RECORD_2]);
    expect(results.length).toBe(2);
  });

  it("returns an empty array when D1 returns null results (defensive null-coalescing)", async () => {
    // D1 can return { results: null } on an empty table in some configurations
    const { db } = createMockDb(null, null);

    const results = await listAttendanceForDay(db, "2025-01-15");

    expect(results).toEqual([]);
  });

  it("binds the day argument on the admin (unfiltered) path", async () => {
    const { db, mockBind } = createMockDb([], null);

    await listAttendanceForDay(db, "2025-06-18");

    expect(mockBind).toHaveBeenCalledWith("2025-06-18");
  });

  it("returns only teacher-scoped records when teacherId is provided", async () => {
    const { db } = createMockDb([MOCK_RECORD_1], null);

    const results = await listAttendanceForDay(db, "2025-01-15", {
      teacherId: "teacher_xyz",
    });

    expect(results).toEqual([MOCK_RECORD_1]);
    expect(results.length).toBe(1);
  });

  it("returns empty array when teacher has no records for that day", async () => {
    const { db } = createMockDb([], null);

    const results = await listAttendanceForDay(db, "2025-01-15", {
      teacherId: "teacher_no_attendance",
    });

    expect(results).toEqual([]);
  });

  it("binds day AND teacherId when teacher filter is provided", async () => {
    const { db, mockBind } = createMockDb([], null);

    await listAttendanceForDay(db, "2025-06-18", { teacherId: "teacher_123" });

    expect(mockBind).toHaveBeenCalledWith("2025-06-18", "teacher_123");
  });

  it("uses the unfiltered query path when teacherId is explicitly undefined", async () => {
    const { db, mockBind } = createMockDb([], null);

    await listAttendanceForDay(db, "2025-06-18", { teacherId: undefined });

    // Should fall through to the admin (no teacher filter) branch
    expect(mockBind).toHaveBeenCalledWith("2025-06-18");
  });

  it("correctly computes unique student count from returned records", async () => {
    // Both records belong to the same student — testing consumer logic
    const sameStudentRecords = [
      { ...MOCK_RECORD_1, classId: "CS101" },
      { ...MOCK_RECORD_1, id: "rec_003", classId: "MATH201" },
    ];
    const { db } = createMockDb(sameStudentRecords, null);

    const results = await listAttendanceForDay(db, "2025-01-15");
    const uniqueStudents = new Set(results.map((r) => r.studentId)).size;

    expect(results.length).toBe(2);
    expect(uniqueStudents).toBe(1); // same student in two classes
  });
});
