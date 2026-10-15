const MAIN_ATTENDANCE_SUBJECTS = new Set([
  'NEPALI',
  'ENGLISH',
  'SOCIAL',
  'SCIENCE',
  'MATHEMATICS',
  'HEALTH',
  'HAMRO HETAUDA'
]);

const calculateAttendanceMarks = ({ attendance, workingDays, subject, theoryFullMarks }) => {
  const daysPresent = Number(attendance) || 0;
  const daysInTerm = Number(workingDays) || 0;
  const fullMarks = Number(theoryFullMarks) || 0;
  if (!daysInTerm || !fullMarks) return 0;

  const attendancePercent = Math.min(100, (daysPresent / daysInTerm) * 100);
  const isMainSubject = MAIN_ATTENDANCE_SUBJECTS.has(String(subject || '').trim().toUpperCase());
  const lowerScale = isMainSubject || fullMarks <= 25;

  if (attendancePercent >= 90) return lowerScale ? 2 : 4;
  if (attendancePercent >= 80) return lowerScale ? 1.5 : 3;
  if (attendancePercent >= 70) return lowerScale ? 1 : 2;
  if (attendancePercent >= 60) return lowerScale ? 0.5 : 1;
  return 0;
};

module.exports = { calculateAttendanceMarks };