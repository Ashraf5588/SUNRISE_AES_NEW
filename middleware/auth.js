//fucntion to generate jwt token
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const {teacherSchema} = require("../model/admin");
const userlist = mongoose.model("userlist", teacherSchema, "users");
const generateToken = (user) => {


const JWT_SECRET = process.env.JWT_SECRET || "aas_amedtech_solutions_789";  // use env var in production
const JWT_EXPIRES_IN = "30d"; // 30 days, adjust as needed

  // Only include non-sensitive info
  const payload = {
    id: user._id,
    teacherName: user.teacherName || user.username, // Use teacherName if available
    role: user.role,
    allowedSubjects: user.allowedSubjects || [], // Include allowed subjects if available
    username: user.username,
    tokenVersion: user.tokenVersion || 1 // Default to 1 if not set
  };
console.log("Payload:", payload); // Debugging line to check payload content
  // Sign token
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
const verifytoken = async (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.redirect("/admin/login");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "aas_amedtech_solutions_789");
    const user = await userlist.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User not found" });
    
    // Check tokenVersion only if it exists in both places
    if (user.tokenVersion && decoded.tokenVersion && user.tokenVersion !== decoded.tokenVersion) {
      res.clearCookie('token');
      return res.redirect("/admin/login");
    }

    // Use the fresh user data from database instead of decoded token data
    req.user = user;
    next();

   
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.redirect("/admin/login"); // Or res.status(403).json({ message: "Invalid token" })
  }
};
const authorized = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  const user = req.user;
  
  console.log("Middleware Debug - URL:", req.originalUrl);
  console.log("Middleware Debug - Params:", req.params);
  console.log("Middleware Debug - Query:", req.query);

const subjectValue = req.params.subject || req.params.subjectinput || req.query.subject || req.query.subjectinput || req.body.subject || req.body.subjectinput;
const studentClass = req.params.studentClass || req.query.studentClass || req.body.studentClass;
const section = req.params.section || req.query.section || req.body.section;

    if (user.role === "ADMIN") return next();
    if (!subjectValue && !studentClass && !section) return next();

  // ✅ Match allowedSubjects array of objects
  const hasAccess = user.allowedSubjects?.some(allowed =>
    allowed.subject === subjectValue &&
    (!studentClass || allowed.studentClass === studentClass) &&
    (!section || allowed.section === section)
  );

  if (!hasAccess) {
    return res.render("block", {
      teacherName: user.teacherName,
      username: user.username,
      role: user.role,
      allowedSubjects: user.allowedSubjects || []
    }); // Render a block page or redirect
  }
console.log("Access granted for user:", user.username, "to subject:", subjectValue, "class:", studentClass, "section:", section);

  next();
};

const isAdmin = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "ADMIN") {
    return res.render("block",{teacherName: user.teacherName, username: user.username, role: user.role, allowedSubjects: user.allowedSubjects || []}); // Render a block page or redirect
  }
  next();
};
const isnewsAdmin = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "NEWSADMIN") {
    return res.render("block",{teacherName: user.teacherName, username: user.username, role: user.role, allowedSubjects: user.allowedSubjects || []}); // Render a block page or redirect
  }
  next();
};




module.exports = { generateToken, verifytoken, authorized, isAdmin, isnewsAdmin };