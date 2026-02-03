const path = require("path");
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
// Use libreoffice-convert instead of docx-pdf to avoid PhantomJS crash
const libre = require('libreoffice-convert');
const util = require('util');
const convertAsync = util.promisify(libre.convert);
const bs = require("bikram-sambat-js")
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");
const {marksheetSchema} = require("../model/masrksheetschema");
const { classSchema, subjectSchema, terminalSchema,newsubjectSchema,marksheetsetupSchema } = require("../model/adminschema");
const { adminSchema,superadminSchema, teacherSchema} = require("../model/admin");
const { studentSchema } = require("../model/schema");
const student = require("../routers/mainpage");
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const newsubjectModel = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const userlist = mongoose.model("userlist", teacherSchema, "users");
 const { studentrecordschema } = require("../model/adminschema");
const modal = mongoose.model("studentrecord", studentrecordschema, "studentrecord");
const bcrypt = require("bcrypt");
const {allowedSubjectData} = require("./controller");
const {generateToken} = require("../middleware/auth");

app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));
const {marksheetsetupschemaForAdmin} = require("../model/masrksheetschema");
const marksheetSetup = mongoose.models.marksheetSetup || mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const { addChapterSchema } = require("../model/addchapterschema");
const addChapter = mongoose.model("addChapter", addChapterSchema, "addChapter");
const multer = require('multer')
const fs = require('fs')

// Configure storage with better file naming

// Helper function to fetch sidenav data
const getSidenavData = async (req) => {
  try {
    const subjects = await newsubject.find({}).lean();
  
    const studentClassdata = await studentClass.find({}).lean();
    const terminals = await terminal.find({}).lean();
    
    let accessibleSubject = [];
    let accessibleClass = [];
    
    // Check if req exists and has user property
    if (req && req.user) {
      const user = req.user;
      // Log user info for debugging
      if (user && user.role) {
        console.log('User role:', user.role);
        console.log('User allowed subjects:', user.allowedSubjects || []);
      } else {
        console.log('User object exists but missing role or allowedSubjects');
      }
      
      if (user.role === "ADMIN") {
        accessibleSubject = subjects;
        accessibleClass = studentClassdata;
      } else {
        // Filter subjects based on user's allowed subjects
        accessibleSubject = subjects.filter(subj =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.subject === subj.newsubject && allowed.studentClass === subj.forClass
          )
        );
        
        // Filter classes based on user's allowed classes/sections
        accessibleClass = studentClassdata.filter(classItem =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.studentClass === classItem.studentClass && 
            allowed.section === classItem.section
          )
        );
        
        console.log('Filtered subjects:', accessibleSubject.length);
        console.log('Filtered classes:', accessibleClass.length);
      }
    } else {
      // If no user is found, return all data (default admin view)
      console.log('No user found in request, returning all data');
      accessibleSubject = subjects;
      accessibleClass = studentClassdata;
    }
    
    return {
      subjects: accessibleSubject,
      studentClassdata: accessibleClass,
      terminals
    };
  } catch (error) {
    console.error('Error fetching sidenav data:', error);
    return {
      subjects: [],
      studentClassdata: [],
      terminals: []
    };
  }
};
const getSubjectModelPractical = (subjectinput, studentClass, section, terminal, type, year) => {
  const modelName = `${subjectinput}_${studentClass}_${section}_${terminal}_${type}_${year}`;
  
  // Check if model already exists
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }
  
  // Create a new schema with roll as unique index to prevent duplicates
  const practicalSchema = new mongoose.Schema({
    ...marksheetSchema.obj,
    roll: { 
      type: String, 
      required: true,
      unique: true // Enforce uniqueness at schema level
    },
    lastUpdated: { 
      type: Date, 
      default: Date.now 
    }
  });
  
  // Explicitly ensure roll is a unique index
  practicalSchema.index({ roll: 1 }, { 
    unique: true,
    background: true,
    name: "unique_roll_index"
  });
  
  // Add a compound index for better query performance
  practicalSchema.index({ 
    studentClass: 1, 
    section: 1, 
    terminal: 1 
  }, { 
    background: true,
    name: "class_section_terminal_index"
  });
  
  // Create and return the model with unique index on roll
  const model = mongoose.model(modelName, practicalSchema, modelName);
  
  // Ensure indexes are applied
  model.createIndexes().catch(err => {
    console.error(`Error creating indexes for ${modelName}:`, err);
  });
  
  return model;
};
// Create mongoose models
const subject = mongoose.model("subject", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentTerminal = mongoose.model("studentTerminal", classSchema, "terminal");
const admin = mongoose.model("admin", adminSchema, "admin");
const superadmin = mongoose.model("superadmin", superadminSchema, "superadmin");
let entryArray = [];

/**
 * Transform entry array data into a pivoted format for better data visualization
 * 
 * This function takes the MongoDB aggregation results and creates a pivot table structure:
 * - Rows represent unique subjects (math, science, etc.)
 * - Columns represent unique class-section combinations (4-janak, 2-chanakya, etc.)
 * - Each cell contains the totalentry value for that subject and class-section
 * - Empty cells are represented as 0
 * 
 * The returned object has three properties:
 * - subjects: Array of unique subject names sorted alphabetically
 * - headers: Array of class-section combinations sorted by class number then section name
 * - pivotTable: Nested object where pivotTable[subject][classSection] gives the entry count
 * 
 * Example output:
 * {
 *   subjects: ["English", "Math", "Science"],
 *   headers: ["1-A", "1-B", "2-A"],
 *   pivotTable: {
 *     "English": { "1-A": 20, "1-B": 15, "2-A": 18 },
 *     "Math": { "1-A": 22, "1-B": 17, "2-A": 19 },
 *     "Science": { "1-A": 21, "1-B": 16, "2-A": 17 }
 *   }
 * }
 * 
 * @param {Array} entries - The original entry array data from MongoDB aggregation
 * @returns {Object} Object containing subjects, headers and pivoted table data
 */
function transformToPivotedFormat(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { subjects: [], headers: [], pivotTable: {} };
  }

  try {
    // Extract unique subjects and class-section combinations
    const subjects = [...new Set(entries.map(entry => entry.subject))].sort();
    
    // Create headers by combining class and section (e.g., "4-janak")
    const classSections = [...new Set(entries.map(entry => `${entry.studentClass}-${entry.section}`))];
    
    // Sort headers by class number first, then section
    const headers = classSections.sort((a, b) => {
      try {
        const classA = parseInt(a.split('-')[0]);
        const classB = parseInt(b.split('-')[0]);
        
        // If classes are different, sort by class number
        if (classA !== classB) {
          return classA - classB;
        }
        
        // If classes are the same, sort
        const sectionA = a.split('-')[1];
        const sectionB = b.split('-')[1];
        return sectionA.localeCompare(sectionB);
      } catch (error) {
        console.error("Error sorting headers:", error);
        return 0;
      }
    });
    
    // Create a pivot table as an object
    const pivotTable = {};
    
    // Initialize the pivot table with zeros for all combinations
    subjects.forEach(subject => {
      pivotTable[subject] = {};
      headers.forEach(header => {
        pivotTable[subject][header] = 0;
      });
    });
    
    // Fill in the pivot table with actual values
    entries.forEach(entry => {
      try {
        const subject = entry.subject;
        const header = `${entry.studentClass}-${entry.section}`;
        pivotTable[subject][header] = entry.totalentry;
      } catch (error) {
        console.error("Error setting pivot table value:", error);
      }
    });
    
    return {
      subjects,
      headers,
      pivotTable
    };
  } catch (error) {
    console.error("Error in transformToPivotedFormat:", error);
    return { subjects: [], headers: [], pivotTable: {} };
  }
}

exports.adminlogin = async (req, res, next) => {
  try {
    res.render("admin/login");
  } catch (err) {
    console.log(err);
  }
};
exports.adminloginpost = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    


const user = await userlist.findOne({ username });

if (!user) return res.render("admin/invalid",{message: "Invalid username"});
const isMatch = await bcrypt.compare(password, user.password);
if (!isMatch) return res.render("admin/invalid",{message: "Invalid password"});

const token = generateToken(user);



      console.log("Generated Token:", token); // Log the generated token
  res.cookie("token", token, {
      httpOnly: true,  // prevent JavaScript access
      secure: false,   // change to true if using HTTPS
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });



      if (user.role === "NEWSADMIN") {
  return res.redirect('/newsadmin');
} else if (user.role === "ADMIN") {
  return res.redirect('/admin/term/FIRST');
} else {
  return res.redirect('/');
}
}
   catch (err) {
    console.log(err);
  }
};



exports.admin = async (req, res, next) => {
  try {
    // Initialize array
    entryArray = [];
    const subjects = await subject.find({});
    const studentClasslist = await studentClass.find({});
    const terminal = req.params.terminal; // Get terminal from params
    
    console.log(`🔍 Processing admin data for terminal: ${terminal}`);
    console.log(`📚 Found ${subjects.length} subjects`);
    console.log(`🏫 Found ${studentClasslist.length} class-sections`);

    // Create subject mappings
    const subjectMappings = await subject.find({});
    const allowedSubjectsMap = {};
subjectMappings.forEach(sub => {
  if (!allowedSubjectsMap[sub.subject]) {
    allowedSubjectsMap[sub.subject] = [];
  }
  allowedSubjectsMap[sub.subject].push(String(sub.forClass));
});



    

    // Optimized batch processing for entry counts
    const db = mongoose.connection.db;
    const batchSize = 50; // Process in batches to avoid memory issues
    entryArray = [];

    // Process subjects in batches
    for (let i = 0; i < subjects.length; i += batchSize) {
      const batchSubjects = subjects.slice(i, i + batchSize);
      const batchPromises = [];

      for (const sub of batchSubjects) {
        for (const stuclass of studentClasslist) {
          const section = stuclass.section;
          const studentClass = stuclass.studentClass;

          // Skip if subject not allowed for this class
          if (!allowedSubjectsMap[sub.subject]?.includes(studentClass.toString())) {
            entryArray.push({
              studentClass,
              section,
              subject: sub.subject,
              terminal,
              totalentry: 0,
            });
            continue;
          }

          const modelName = `${sub.subject}_${studentClass}_${section}_${terminal}`;
          
          // Create a promise for this collection check and count
          const processPromise = (async () => {
            try {
              const collections = await db.listCollections({ name: modelName }).toArray();
              
              if (collections.length === 0) {
                return {
                  studentClass,
                  section,
                  subject: sub.subject,
                  terminal,
                  totalentry: 0,
                };
              }

              // Use collection directly instead of creating model for better performance
              const collection = db.collection(modelName);
              const count = await collection.countDocuments({
                section,
                terminal,
                studentClass
              });

              return {
                studentClass,
                section,
                subject: sub.subject,
                terminal,
                totalentry: count,
              };
            } catch (error) {
              console.error(`Error processing ${modelName}:`, error.message);
              return {
                studentClass,
                section,
                subject: sub.subject,
                terminal,
                totalentry: 0,
              };
            }
          })();

          batchPromises.push(processPromise);
        }
      }

      // Wait for all promises in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      entryArray.push(...batchResults);
    }

  

    // Transform entryArray into pivoted format with fixed variable names
    let pivotedData;
    try {
      if (typeof transformToPivotedFormat === 'function') {
        pivotedData = transformToPivotedFormat(entryArray);
        console.log("✅ Pivoted data generated successfully using function");
      } else {
        console.log("⚠️  transformToPivotedFormat function not available, creating manually");
        
        // Create pivot table manually with DIFFERENT variable names to avoid conflict
        const uniqueSubjects = [...new Set(entryArray.map(e => e.subject))].sort();
        const uniqueHeaders = [...new Set(entryArray.map(e => `${e.studentClass}-${e.section}`))].sort();
        
   
        
        // Create pivot table
        const pivotTable = {};
        uniqueSubjects.forEach(subjectName => {
          pivotTable[subjectName] = {};
          uniqueHeaders.forEach(header => {
            pivotTable[subjectName][header] = 0;
          });
        });
        
        // Fill in values
        entryArray.forEach(entry => {
          const header = `${entry.studentClass}-${entry.section}`;
          if (pivotTable[entry.subject]) {
            pivotTable[entry.subject][header] = entry.totalentry;
          }
        });
        
        pivotedData = { 
          subjects: uniqueSubjects, 
          headers: uniqueHeaders, 
          pivotTable: pivotTable 
        };
        
        
      }
    } catch (error) {
      console.error("❌ Error transforming data:", error);
      pivotedData = { subjects: [], headers: [], pivotTable: {} };
    }

    // Get student class data separately to avoid variable conflicts
    const studentClassdata = await studentClass.find({});
    
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
    
    console.log(`\n🎯 Final data summary:`);
    console.log(`  - Subjects: ${subjects.length}`);
    console.log(`  - Class list: ${studentClasslist.length}`);
    console.log(`  - Entry array: ${entryArray.length}`);
    console.log(`  - Pivot subjects: ${pivotedData.subjects.length}`);
    console.log(`  - Pivot headers: ${pivotedData.headers.length}`);
    
    // Render with entryArray and pivotedData
    res.render("admin/adminpannel", {
      editing: false,
      subjects,
      studentClasslist,
      entryArray,
      pivotedData,
      terminal, 
      studentClassdata,
      ...sidenavData
    });
    
  } catch (err) {
    console.error("❌ Error in admin function:", err);
    console.error("Stack trace:", err.stack);
    next(err);
  }
};

exports.showSubject = async (req, res, next) => {
  const {forClass,subjectname} = req.query;

  // Fetch subjects with question paper information
  const subjectsformat = await subject.find({}, {
  }).lean();

  // Add file URL and status to each subject
const chapterData = await addChapter.find({subject: subjectname,forClass:{$in: [forClass]}}).lean();
console.log("Chapter Data:", chapterData);
  

  const studentClassdata = await studentClass.find({});
    const className = req.query.className;
    const newsubjectList = await newsubject.find({}).lean();
   const terminals = await terminal.find({}).lean();
 
  // Get sidenav data
  const sidenavData = await getSidenavData(req);
  let accessibleSubjects = [];
  let newaccessibleSubjects = [];
  let accessibleClasses = [];
  const user = req.user;
if(user.role === 'ADMIN')
{
  accessibleSubjects = subjectsformat;
  newaccessibleSubjects = newsubjectList;
  accessibleClasses = studentClassdata;
}
else
{
  accessibleSubjects = subjectsformat.filter(subj =>
    user.allowedSubjects.some(allowed =>
      allowed.subject === subj.subject && allowed.studentClass === subj.forClass
    )
  );

 newaccessibleSubjects = newsubjectList.filter(subj =>
  user.allowedSubjects.some(allowed =>
    allowed.subject === subj.newsubject
  )
);

accessibleClasses = studentClassdata.filter(classItem =>
    user.allowedSubjects && user.allowedSubjects.some(allowed =>
      allowed.studentClass === classItem.studentClass && 
      allowed.section === classItem.section
    )
  );
}
  res.render("admin/subjectlist", {
    subjectsformat: accessibleSubjects,
    editing: false,
    currentPage: 'adminSubject',
    studentClassdata: accessibleClasses,
    className,
    newsubjectList:newaccessibleSubjects,
    ...sidenavData,
    chapterData,
    terminals
  });
};
exports.addSubject = async (req, res, next) => {  
  try {
    const { subId} = req.params;
    const className = req.query.className;
    
    
    console.log("=== ADDSUBJECT FUNCTION START ===");
    console.log("Subject ID (editing):", subId);
    console.log("File uploaded:", req.file);
    console.log("Form data:", req.body);
    console.log("Form has currentQuestionPaper:", req.body.currentQuestionPaper);
    console.log("=====================================");

    // Process the form data
    const formData = req.body;
    if (formData.subject) {
  formData.subject = formData.subject.trim();
}
    
    // Create a clean object with ONLY the fields we want
    const processedData = {
      // Basic fields
      subject: formData.subject,
      forClass: formData.forClass,
      forTerminal: formData.forTerminal,
      max: formData.max
    };
    
    // Add question field data to processed data
    console.log("Form Data Keys:", Object.keys(formData));
    console.log("Form Data:", formData);
    
    Object.keys(formData).forEach(key => {
      // Check if it's one of our special question fields (starts with 'q')
      if (key.startsWith('q')) {
        let value = formData[key];
        
        // Handle boolean checkboxes
        if (key.endsWith('_has_subparts')) {
             if (value === 'on') {
                 value = true;
             }
        }

        // Handle nested objects (subparts parsed by body-parser)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
             // It's an object like { i: '5', ii: '5' }
             // We need to flatten this into q1b_i, q1b_ii
             Object.keys(value).forEach(subKey => {
                 let subValue = value[subKey];
                 // Try to convert to number
                 if (!isNaN(parseFloat(subValue)) && isFinite(subValue)) {
                     subValue = parseFloat(subValue);
                 }
                 
                 const flatKey = `${key}_${subKey}`; // e.g. q1b_i
                 processedData[flatKey] = subValue;
                 console.log(`Flattened nested field ${key}.${subKey} → ${flatKey} = ${subValue}`);
             });
             // We do NOT add the object itself to processedData to avoid CastError
             return; 
        }

        // Convert string values to numbers where appropriate
        // But only if it's not the boolean we just converted
        if (typeof value !== 'boolean') {
             if (!isNaN(parseFloat(value)) && isFinite(value)) {
                 value = parseFloat(value);
             }
        }
        
        // MongoDB treats fields with dots as nested objects, so we need to replace dots
        // with a different character like underscore for storage
        const processedKey = key.replace(/\./g, '_');
        
        // Add to processedData with the modified key name if it contains dots
        processedData[processedKey] = value;
        console.log(`Question field ${key} → ${processedKey} = ${value}`);
      }
    });

    // PROCESS CHAPTER DATA - construct the chapter array structure requested
    const chapterMap = {}; // chapterName -> [questions]
    
    // Find all chapter keys in processedData (both main questions q1_chapter and subquestions q1a_chapter)
    // We prefer subquestion specific chapters if available
    
    // First, categorize questions by main question number
    const questionsByNum = {};
    
    console.log("--- CHAPTER PROCESSING DEBUG START ---");
    
    // Identify all subquestions that exist (e.g. q1a, q1b)
    Object.keys(processedData).forEach(key => {
        // Match keys like q1a but NOT q1a_chapter or q1_subcount
        if (/^q\d+[a-z]$/.test(key)) {
             const match = key.match(/^q(\d+)([a-z])$/);
             const qNum = match[1];
             const letter = match[2];
             
             if (!questionsByNum[qNum]) questionsByNum[qNum] = [];
             questionsByNum[qNum].push(key);
        }
    });

    console.log("Questions by Num:", JSON.stringify(questionsByNum));
    
    // Now iterate through questions and assign chapters
    Object.keys(questionsByNum).forEach(qNum => {
        const subQuestions = questionsByNum[qNum];
        
        // Check if main question has a chapter assigned (default for all its subquestions)
        const mainChapterKey = `q${qNum}_chapter`;
        const mainChapter = processedData[mainChapterKey];
        
        console.log(`Processing Q${qNum}. Main Chapter Key: ${mainChapterKey}, Value: "${mainChapter}"`);
        
        subQuestions.forEach(subQ => {
            // Check if subquestion has specific chapter
            const subChapterKey = `${subQ}_chapter`;
            let chapterName = processedData[subChapterKey];
            
            console.log(`  SubQ: ${subQ}. Specific Key: ${subChapterKey}, Value: "${chapterName}"`);
            
            // Fallback to main chapter if no specific one
            if (!chapterName || String(chapterName).trim() === '') {
                console.log(`  -> Fallback to main chapter: "${mainChapter}"`);
                chapterName = mainChapter;
            } else {
                console.log(`  -> Using specific chapter: "${chapterName}"`);
            }
            
            if (chapterName && typeof chapterName === 'string' && chapterName.trim() !== '') {
                if (!chapterMap[chapterName]) {
                    chapterMap[chapterName] = [];
                }
                // Add to the list if not already there
                if (!chapterMap[chapterName].includes(subQ)) {
                    chapterMap[chapterName].push(subQ);
                }
            }
        });
    });
    
    console.log("Final Chapter Map:", JSON.stringify(chapterMap));
    console.log("--- CHAPTER PROCESSING DEBUG END ---");
    
    // Convert map to array structure for schema
    if (Object.keys(chapterMap).length > 0) {
        processedData.chapter = Object.keys(chapterMap).map(name => ({
            chapterName: name,
            questions: chapterMap[name]
        }));
        console.log("Constructed chapter data:", processedData.chapter);
    }



    // Handle file upload logic
    // default.pdf serves as a shared placeholder file for subjects without specific question papers
    if (req.file) {
      // New file uploaded - process and save it
      const {rootDir} = require("../utils/path");
  
      console.log("Processing uploaded file:", req.file);
      
      // Check if the file is a DOCX file that needs conversion
      if (req.file.filename.endsWith('.docx')) {
        try {
          console.log(`🔄 Starting DOCX to PDF conversion for: ${req.file.filename}`);
          
          // Use Promise wrapper for better error handling
          await new Promise((resolve, reject) => {
            const inputPath = `${rootDir}/uploads/${req.file.filename}`;
            const outputPath = `${rootDir}/uploads/${req.file.filename.replace('.docx', '.pdf')}`;
            
            console.log(`📂 Input path: ${inputPath}`);
            console.log(`📂 Output path: ${outputPath}`);
            
            // Check if input file exists
            if (!fs.existsSync(inputPath)) {
              const error = new Error(`Input DOCX file not found: ${inputPath}`);
              console.error("❌ Input file check failed:", error.message);
              reject(error);
              return;
            }
            
            console.log(`✅ Input file exists, size: ${fs.statSync(inputPath).size} bytes`);
            console.log(`🔄 Converting DOCX to PDF: ${inputPath} -> ${outputPath}`);
            
            // docx-pdf replacement: Use libreoffice-convert
            const { exec } = require('child_process');
            let sofficeCmd;

            if (process.platform === 'win32') {
                const libreOfficePath = 'C:\\Program Files\\LibreOffice\\program';
                // Force add LibreOffice to PATH to avoid restart requirement
                if (!process.env.PATH.includes(libreOfficePath)) {
                    process.env.PATH = `${libreOfficePath};${process.env.PATH}`;
                    console.log(`🔧 Added LibreOffice to PATH: ${libreOfficePath}`);
                }
                sofficeCmd = `"${libreOfficePath}\\soffice.exe" --headless --convert-to pdf --outdir "${path.dirname(inputPath)}" "${inputPath}"`;
            } else {
                // Linux/Unix: Assume installed via package manager (apt/yum) and in global PATH
                sofficeCmd = `soffice --headless --convert-to pdf --outdir "${path.dirname(inputPath)}" "${inputPath}"`;
            }

            // DIRECT CALL TO SOFFICE - More reliable than library wrappers
            console.log(`🚀 Executing conversion command: ${sofficeCmd}`);
            
            exec(sofficeCmd, (execErr, stdout, stderr) => {
                if (execErr) {
                    console.error("❌ DOCX conversion error (exec):", execErr);
                    return reject(execErr);
                }
                
                if (stderr) console.error("⚠️ Conversion stderr:", stderr);
                if (stdout) console.log("ℹ️ Conversion stdout:", stdout);
                
                  console.log("✅ DOCX conversion operation completed");
                  
                  // Verify the PDF was created
                  if (fs.existsSync(outputPath)) {
                    const pdfSize = fs.statSync(outputPath).size;
                    console.log(`✅ PDF created successfully, size: ${pdfSize} bytes`);
                    
                    // Delete the temporary DOCX file after successful conversion
                    fs.unlink(inputPath, (unlinkErr) => {
                      if (unlinkErr) {
                        console.error(`⚠️ Error deleting temporary docx file: ${unlinkErr.message}`);
                      } else {
                        console.log(`🗑️ Temporary docx file deleted successfully: ${req.file.filename}`);
                      }
                    });
                    
                    resolve('Success');
                  } else {
                    const error = new Error("PDF file was not created despite successful exit");
                    console.error("❌ PDF verification failed:", error.message);
                    reject(error);
                  }
            });
            // Removed nested fs.readFile since we use exec on file path directly
            /* 
            fs.readFile(inputPath, (readErr, docxBuf) => { ... }) 
            */
          });
          
          // Convert filename to PDF
          const finalFileName = req.file.filename.replace('.docx', '.pdf');
          processedData.questionPaperOfClass = finalFileName;
          console.log(`✅ CONVERSION COMPLETE - NEW FILE SET: ${finalFileName}`);
          
        } catch (conversionError) {
          console.error("❌ DOCX conversion failed:", conversionError.message);
          console.error("❌ Stack trace:", conversionError.stack);
          
          // If conversion fails, keep the original DOCX file but warn about it
          processedData.questionPaperOfClass = req.file.filename;
          console.log(`⚠️ CONVERSION FAILED - KEEPING ORIGINAL DOCX FILE: ${req.file.filename}`);
          console.log(`⚠️ Note: This file will force download instead of inline display`);
        }
      } else {
        // For non-DOCX files (PDF, etc.), use as-is
        processedData.questionPaperOfClass = req.file.filename;
        console.log(`NON-DOCX FILE - USING AS-IS: ${req.file.filename}`);
      }
      
      console.log("processedData.questionPaperOfClass =", processedData.questionPaperOfClass);
    } else if (formData.currentQuestionPaper) {
      // Editing mode: Keep existing file (could be default.pdf or a specific file)
      processedData.questionPaperOfClass = formData.currentQuestionPaper;
      console.log(`KEEPING EXISTING FILE: ${formData.currentQuestionPaper}`);
    } else {
      // Creating new subject with no file: Use default.pdf as placeholder
      // default.pdf is shared across multiple subjects and should never be deleted
      processedData.questionPaperOfClass = "default.pdf";
      console.log("NO FILE PROVIDED - USING DEFAULT: default.pdf");
    }

  // We don't need to delete or filter anything since we're building a new object

  // We don't need to delete or filter anything since we're building a new object

  // Redundant processing block removed to prevent CastError with nested objects
  // The form data is already processed and sanitized at the beginning of the function
  
  // Process questions with their marks - For backwards compatibility
  const numericKeys = Object.keys(formData)
    .filter(key => /^\d+$/.test(key))
    .map(key => parseInt(key))
    .sort((a, b) => a - b);
    
  console.log("Question numbers found:", numericKeys);

  // Process all questions that have mark inputs - For backwards compatibility
  for (const qNum of numericKeys) {
    // Get the marks array which now includes the count as first element
    if (Array.isArray(formData[qNum])) {
      // Convert all values to numbers
      processedData[qNum] = formData[qNum].map(val => 
        !isNaN(parseFloat(val)) ? parseFloat(val) : val
      );
      console.log(`Question ${qNum} values (array):`, processedData[qNum]);
    } else {
      // If it's a single value, convert to a one-element array
      const value = !isNaN(parseFloat(formData[qNum])) ? 
        parseFloat(formData[qNum]) : formData[qNum];        
      processedData[qNum] = [value];
      console.log(`Question ${qNum} value (single):`, processedData[qNum]);
    }
  }
    

    console.log("=== FINAL PROCESSED DATA ===");
    console.log("Complete processedData object:", JSON.stringify(processedData, null, 2));
    console.log("questionPaperOfClass specifically:", processedData.questionPaperOfClass);
    console.log("============================");
    
    // Previous chapter processing logic removed as it relied on incorrect formData structure
    // New logic added above handles chapter grouping by question correctly

    if (subId) {
      // Edit mode
      console.log("Edit mode - updating subject");
      const oldSubject = await subject.findById(subId);
      if (!oldSubject) {
        return res.status(404).send("Subject not found");
      }
      
      // File cleanup logic when editing a subject
      // When a new file is uploaded, delete the old file BUT protect default.pdf
      // default.pdf is a shared placeholder used by multiple subjects - never delete it
      if (req.file && oldSubject.questionPaperOfClass && 
          oldSubject.questionPaperOfClass !== processedData.questionPaperOfClass) {
        
        console.log(`Old file: ${oldSubject.questionPaperOfClass}`);
        console.log(`New file: ${processedData.questionPaperOfClass}`);
        
        // Only delete the old file if it's NOT default.pdf
        if (oldSubject.questionPaperOfClass !== "default.pdf") {
          try {
            const {rootDir} = require("../utils/path");
            const oldFilePath = `${rootDir}/uploads/${oldSubject.questionPaperOfClass}`;
            
            // Check if file exists before trying to delete it
            fs.access(oldFilePath, fs.constants.F_OK, (accessErr) => {
              if (accessErr) {
                console.log(`Old file not found (already deleted or moved): ${oldSubject.questionPaperOfClass}`);
              } else {
                // File exists, proceed with deletion
                fs.unlink(oldFilePath, (unlinkErr) => {
                  if (unlinkErr) {
                    console.error(`Error deleting old file: ${unlinkErr.message}`);
                  } else {
                    console.log(`✅ Old file deleted successfully: ${oldSubject.questionPaperOfClass}`);
                  }
                });
              }
            });
          } catch (error) {
            console.error("Error handling old file deletion:", error);
          }
        } else {
          console.log("🛡️ Protected: default.pdf is a shared system file - NOT deleting from uploads folder");
        }
      } else if (oldSubject.questionPaperOfClass === "default.pdf" && req.file) {
        console.log("📝 Replacing default.pdf placeholder with new uploaded file:", processedData.questionPaperOfClass);
        console.log("🛡️ default.pdf remains in uploads folder for other subjects to use");
      }
      
      // Update the subject in database
      console.log("BEFORE DATABASE UPDATE:");
      console.log("Subject ID:", subId);
      console.log("Processed Data:", processedData);
      console.log("Old questionPaperOfClass:", oldSubject.questionPaperOfClass);
      console.log("New questionPaperOfClass:", processedData.questionPaperOfClass);
      
      console.log("Before database update - FULL PROCESSED DATA:", JSON.stringify(processedData, null, 2));
      console.log("Question field keys:", Object.keys(processedData).filter(k => k.startsWith('q')));
      
      const updatedSubject = await subject.findByIdAndUpdate(
        subId,
        processedData,
        { new: true, runValidators: true }
      );
      
      console.log("AFTER DATABASE UPDATE:");
      console.log("Updated subject questionPaperOfClass:", updatedSubject.questionPaperOfClass);
      
      if (updatedSubject.questionPaperOfClass === processedData.questionPaperOfClass) {
        console.log("✅ Database update successful - file path updated correctly");
      } else {
        console.log("❌ Database update failed - file path not updated");
      }

      // Handle collection rename if subject name changed
      if (oldSubject.subject !== processedData.subject) {
        try {
          const db = mongoose.connection.db;
          await db.collection(oldSubject.subject).rename(processedData.subject);
          console.log(`Renamed collection from ${oldSubject.subject} to ${processedData.subject}`);
        } catch (err) {
          console.error(`Error renaming collection: ${err.message}`);
          // Continue anyway as the document is updated
        }
      }

      res.redirect("/admin/subject");
    } else {
      // Create mode
      console.log("Create mode - adding new subject with data:", processedData);

     
     console.log("Before database create - FULL PROCESSED DATA:", JSON.stringify(processedData, null, 2));
     console.log("Question field keys:", Object.keys(processedData).filter(k => k.startsWith('q')));
     
     // =====================


     const createdSubject = await subject.create(processedData);
     console.log("After save - Data saved to DB:", createdSubject);
     res.redirect("/admin/subject");
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding subject: " + err.message);
  }
};


exports.showClass = async (req, res, next) => {
  const studentClasslist = await studentClass.find({});

  
  // Get sidenav data
  const sidenavData = await getSidenavData(req);
  
  res.render("admin/classlist", {
    editing: false,
    studentClasslist,
    currentPage: 'adminClass',
    ...sidenavData
  });
};


exports.subjectData = async (req, res, next) => {
  try {
    // Get parameters from query string
    const className = req.query.className;
    const subjectName = req.query.subjectName;
    const forTerminal = req.query.forTerminal;
    
    console.log("Fetching subject data for:", { className, subjectName, forTerminal });
    
    // Validate parameters
    if (!className || !subjectName) {
      return res.status(400).json({ 
        error: "Missing parameters", 
        message: "Both className and subjectName are required" 
      });
    }

    // Build query object
    const query = { subject: subjectName, forClass: className };
    // If terminal is provided, add it to query to get specific terminal data
    if (forTerminal && forTerminal !== "undefined" && forTerminal !== "") {
        query.forTerminal = forTerminal;
    }

    // Find the subject in the database
    // Use sort to favor the requested terminal if multiple exist but query was underspecified?
    // But since we added terminal to query if present, it should be exact match.
    // If multiple docs match class+subject (and terminal wasn't provided), we just pick one (the first one).
    const result = await subject.findOne(query);
    
    if (!result) {
      console.log(`No subject found for ${subjectName} in Class ${className} (Terminal: ${forTerminal})`);
      return res.status(404).json({ 
        error: "Subject not found", 
        message: `Cannot find ${subjectName} for Class ${className}` 
      });
    }
    
    console.log("Found subject data:", result);
    res.json(result);
  } catch (err) {
    console.error("Error in subjectData controller:", err);
    res.status(500).json({ 
      error: "Server error", 
      message: err.message 
    });
  }
}

exports.addClass = async (req, res, next) => {
  const { classId } = req.params;
  const updateClass = req.body.studentClass;
  const updateSection = req.body.section;



  console.log(updateClass)
  
  if (classId && !undefined) {
    await studentClass.findByIdAndUpdate(
      classId,
      { studentClass: `${updateClass}`, section: `${updateSection}` },
      { new: true, runValidators: true }
    );

    const studentclass = await studentClass.find({});
    res.redirect('/admin/class')
  } 
  else {
    console.log(req.body)
    await studentClass.create(req.body);
    console.log(req.body)
    res.redirect("/admin/class");
  }
};
exports.addNewSubject = async (req, res, next) => {
  const newsubjectList = await newsubject.find({}).lean();


  // Get sidenav data
  const sidenavData = await getSidenavData(req);

  res.render("admin/newsubject", {
    newsubjectList,
    editing: false,
    ...sidenavData
  });
}
exports.copytheory = async (req, res, next) => {
    const {subject,studentClass} = req.query;
    console.log("Copying theory for subject:", subject, "and class:", studentClass);
    if (!subject || !studentClass) {
      console.error("Missing subject or class parameters");
      return res.status(400).json({ error: "Missing subject or class parameters" });
    }

  if(subject && studentClass) {
  const data = await newsubject.findOne({newsubject:subject,forClass:studentClass}).lean();
  console.log(data)
  return res.json(data);
  }
}
exports.addNewSubjectPost = async (req, res, next) => {
  try {
    const { subjectId } = req.params;
    const updatedNewSubject = req.body.newsubject.toUpperCase().trim();
   const { newsubject, theory, practical, selectedClasses,total,passingMarks,theoryCreditHour, practicalCreditHour } = req.body;
     const classes = JSON.parse(selectedClasses);
console.log("Selected classes for new subject:", classes);


    if (subjectId) {
      await newsubjectModel.updateMany(
        {
            newsubject: newsubject,
            forClass: { $in: classes }
        },
        {
            $set: {
                newsubject: updatedNewSubject,
                theory,
                practical,
                total,
                passingMarks,
                theoryCreditHour,
                practicalCreditHour
            }
        }
    );
    } else {
      
  const dataToInsert = classes.map(cls => ({
      newsubject,
      theory,
      practical,
      total,
      passingMarks,
      theoryCreditHour,
      practicalCreditHour,

      forClass: cls
  }));
    await newsubjectModel.insertMany(dataToInsert);
    }
    res.redirect("/admin/new/subject");
  } catch (err) {
    console.error("Error in addNewSubjectPost:", err);
    res.status(500).send("Error adding new subject: " + err.message);
  }
}
exports.editNewSubject = async (req, res, next) => {
  try {
    const { subjectId } = req.params;
    const newsubjectList = await newsubject.find({}).lean();
    const editing = req.query.editing === "true";
    const newsubjectData = await newsubject.findOne({ _id: subjectId });

    if (!newsubjectData) {
      return res.status(404).send("New subject not found");
    }
    res.render("admin/newsubject", {
      editing,
      subjectId,
      newsubjectData,
      newsubjectList,
      ...(await getSidenavData(req))
    });
  }
  catch (err) {
    console.error("Error in editNewSubject:", err);
    res.status(500).send("Error editing new subject: " + err.message);
  }
}
exports.deleteNewSubject = async (req, res, next) => {
  const { subjectId } = req.params;
  await newsubject.findByIdAndDelete(subjectId);
  res.redirect("/admin/new/subject");
}


exports.addTerminal = async (req, res, next) => {
  const terminalList = await terminal.find({},{ __v: 0 }).lean();
  
  // Get sidenav data
  const sidenavData = await getSidenavData(req);
  
  res.render("admin/terminal", { 
    terminalList, 
    editing: false,
    ...sidenavData
  });
}
exports.addTerminalpost = async (req, res, next) => {
  try {
    const { terminalId } = req.params;
    updatedterminal = req.body.terminal.toUpperCase().trim();
    if(terminalId)
    {
      
      await terminal.findByIdAndUpdate(
        terminalId,
        { terminal: `${updatedterminal}` },
        { new: true, runValidators: true }
       
      );
    
    }
    else
    {
      
    await terminal.create({ terminal: updatedterminal });
    }
     res.redirect("/admin/terminal");
  } catch (err) {
    console.error("Error in addTerminalpost:", err);
    res.status(500).send("Error adding terminal: " + err.message);
  }
}
exports.editTerminal = async (req, res, next) => {
  try {
    const { terminalId } = req.params;
      const terminalList = await terminal.find({},{ __v: 0 }).lean();
    const editing = req.query.editing === "true";
    const terminalData = await terminal.findOne({ _id: terminalId });

    if (!terminalData) {
      return res.status(404).send("Terminal not found");
    }
    res.render("admin/terminal", {
      editing,
      terminalData,
      terminalList,
      ...(await getSidenavData(req))
    });
  } catch (err) {
    console.error("Error in addTerminalpost:", err);
    res.status(500).send("Error adding terminal: " + err.message);
  }
}
exports.deleteTerminal = async (req, res, next) => {
  const {terminalId} = req.params;
  await terminal.findByIdAndDelete(terminalId);
  res.redirect("/admin/terminal");
}


exports.deleteSubject = async (req, res, next) => {
  const { subjectId, subjectname } = req.params;
  try {
    // Get the subject data before deletion to handle file cleanup
    const subjectData = await subject.findById(subjectId);
    
    // Clean up question paper file, but protect the shared default.pdf
    // default.pdf serves as a placeholder for multiple subjects and should never be deleted
    if (subjectData && subjectData.questionPaperOfClass && 
        subjectData.questionPaperOfClass !== "default.pdf") {
      try {
        const {rootDir} = require("../utils/path");
        const filePath = `${rootDir}/uploads/${subjectData.questionPaperOfClass}`;
        
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error(`Error deleting question paper file: ${err.message}`);
          } else {
            console.log(`Question paper file deleted successfully: ${subjectData.questionPaperOfClass}`);
          }
        });
      } catch (error) {
        console.error("Error handling question paper file deletion:", error);
      }
    } else if (subjectData && subjectData.questionPaperOfClass === "default.pdf") {
      console.log("Protected: default.pdf is a shared placeholder file used by multiple subjects - not deleted");
    }

    // Drop the MongoDB collection for this subject
    
    
    // Delete the subject document from the database
    await subject.findByIdAndDelete(subjectId);
    
    res.redirect("/admin/subject");
  } catch (err) {
    console.error("Error deleting subject:", err);
    res.status(500).send("Error deleting subject: " + err.message);
  }
};

exports.deleteStudentClass = async (req, res, next) => {
  const { classId } = req.params;
  await studentClass.findByIdAndDelete(classId);
  res.redirect("/admin/class");
};

exports.editSub = async (req, res, next) => {
  try {
    const { subId } = req.params;
    const {subjectname, forClass, forTerminal} = req.query;
    const editing = req.query.editing === "true";
    const subjectsformat = await subject.find({}).lean();
    const subjectedit = await subject.findOne({ _id: `${subId}` });
     const studentClassdata = await studentClass.find({});
    const newsubjectList = await newsubject.find({}).lean();
    if (!subjectedit) {
      return res.status(404).send("Subject not found");
    }
    const chapterData = await addChapter.find({subject: subjectname,forClass:{$in: [forClass]}}).lean();
    const terminals = await terminal.find({}).lean();
    
    console.log("Editing subject:", subjectedit);
      const className = req.query.className;
    // Get student class data for form dropdown
    const sidenavData = await getSidenavData(req);
    const user = req.user;
if(user.role === 'ADMIN')
{
  accessibleSubjects = subjectsformat;
  newaccessibleSubjects = newsubjectList;
  accessibleClasses = studentClassdata;
}
else
{
  accessibleSubjects = subjectsformat.filter(subj =>
    user.allowedSubjects.some(allowed =>
      allowed.subject === subj.subject && allowed.studentClass === subj.forClass
    )
  );

 newaccessibleSubjects = newsubjectList.filter(subj =>
  user.allowedSubjects.some(allowed =>
    allowed.subject === subj.newsubject
  )
);

accessibleClasses = studentClassdata.filter(classItem =>
    user.allowedSubjects && user.allowedSubjects.some(allowed =>
      allowed.studentClass === classItem.studentClass && 
      allowed.section === classItem.section
    )
  );
}
    
    res.render("admin/subjectlist", {
  
      editing,
      subId,
      subjectedit,
      subjectsformat: accessibleSubjects,
      studentClassdata: accessibleClasses,
      className,
      newsubjectList: newaccessibleSubjects,
      ...sidenavData,
      chapterData,
      forTerminal,
      terminals
    });
  } catch (err) {
    console.error("Error in editSub function:", err);
    res.status(500).send("Error loading subject edit form: " + err.message);
  }
};
exports.editClass = async (req, res, next) => {
  const { classId } = req.params;
  const editing = req.query.editing === "true";
  const classedit = await studentClass.findOne({ _id: `${classId}` });
  console.log(classedit)
  const studentClasslist = await studentClass.find({});
  
  // Get sidenav data
  const sidenavData = await getSidenavData(req);
  
   res.render("admin/classlist", {
      editing,
      classedit,
      classId,
      studentClasslist,
      currentPage: 'adminClass',
      ...sidenavData
    });
  }

exports.showTerminal = async (req, res, next) => {
  const terminalList = await studentTerminal.find({});
  res.render("admin/terminallist", {
    editing: false,
    terminalList,
  });
};

exports.addClass = async (req, res, next) => {
  const { classId } = req.params;
  const updateClass = req.body.studentClass;
  console.log(updateClass)
  if (classId && !undefined) {
    await studentClass.findByIdAndUpdate(
      classId,
      { studentClass: `${updateClass}`,section: `${req.body.section}` },
      { new: true, runValidators: true }
    );
   
    const studentclass = await studentClass.find({});
    res.redirect('/admin/class')
  } else {
    await studentClass.create(req.body);
    res.redirect("/admin/class");
  }
};
exports.cross_sheet = async (req, res, next) => {
  const subjectlist = await subject.find({}, { _id: 0, subject: 1, forClass: 1 });
  const classlist = await studentClass.find({}, { _id: 0, studentClass: 1, section: 1 });

  const sortedClassList = classlist.sort((a, b) => Number(a.studentClass) - Number(b.studentClass));
  const sortedsubjectlist = subjectlist.sort((a, b) => Number(a.forClass) - Number(b.forClass));

  const sidenavData = await getSidenavData(req);
  const terminalList = await terminal.find({}).lean();

  // 👇 Declare with default value (empty array)
  let sortedMarkslip = [];

  // ✅ Run this block only if full query is provided
  if (
    req.query.subject &&
    req.query.class &&
    req.query.section &&
    req.query.terminal
  ) {
    const modelName = `${req.query.subject}_${req.query.class}_${req.query.section}_${req.query.terminal}`;
    const subjectdata = mongoose.models[modelName] || mongoose.model(modelName, studentSchema, modelName);

    const slipclass = req.query.class;
    const subjectinput = req.query.subject;
    const section = req.query.section;

    const markslip = await subjectdata.find({ studentClass: slipclass, subject: subjectinput, section: section }, { _id: 0, __v: 0 });

    sortedMarkslip = markslip.sort((a, b) => {
      if (a.section === b.section) {
        return Number(a.roll) - Number(b.roll);
      }
      return a.section.localeCompare(b.section);
    });
  }


  res.render("admin/crosssheet", {
    editing: false,
    sortedMarkslip,
    currentPage: 'crossSheet',
    terminalList,
    sortedsubjectlist,
    sortedClassList,
    ...sidenavData
  });
};
exports.studentrecord = async (req, res, next) => {
  try {
     
    const studentRecord = await modal.find({}).lean();
    const year = new Date();
    const nepaliYear = bs.ADToBS(`${year}`).slice(0, 4);
    console.log(nepaliYear);

    // Get sidenav data
    const sidenavData = await getSidenavData(req);

    res.render("admin/schoolstudentrecord", {
      editing: false,
      nepaliYear,
      studentRecord,
      currentPage: 'studentRecord',
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in studentrecord:", err);
    res.status(500).send("Error loading student record page: " + err.message);
  }
};
exports.studentrecordpost = async (req, res, next) => {
try
{

  const { studentrecordschema } = require("../model/adminschema");
const modal = mongoose.model("studentrecord", studentrecordschema, "studentrecord");
//insert new record, delete old record from studentrecord collection when new file is uploaded csv,


  if (!req.file || req.file.mimetype !== 'text/csv') {
    return res.status(400).send("Please upload a valid CSV file");
  }
  
  // Read the CSV file
  const csvFilePath = req.file.path;
  const csv = require('csvtojson');
  
  // Convert CSV to JSON
  const jsonArray = await csv().fromFile(csvFilePath);
  
  // Insert JSON data into MongoDB
  await modal.deleteMany({});

  await modal.insertMany(jsonArray);
 
  // Delete the uploaded file after processing
  fs.unlinkSync(csvFilePath);
  const classListFromCsv = await modal.find({}, { studentClass: 1 ,section:1}).lean();





  if (!req.file) {
    return res.status(400).send("No file uploaded");
  } 
  else
  {

    res.redirect("/studentrecord");
  }
}catch(err)
{
  console.log(err);
  res.status(500).send("Error processing student records: " + err.message);
}
}
exports.studentrecordadd = async (req, res, next) => {
  try {
      const { studentrecordschema } = require("../model/adminschema");
const modal = mongoose.model("studentrecord", studentrecordschema, "studentrecord");
    const { reg,roll, name,studentClass,section,gender} = req.body;

    // Update student record based on regNo and column
    const updated = await modal.create({ reg,roll, name,studentClass,section,gender});  // Your update function here

    if (updated) {
        return res.render("./partials/success", {
            message: 'Student record updated successfully',
            redirectUrl: '/studentrecord'
        });
    } else {
        res.json({ success: false, message: 'Update failed' });
    }




  }catch (err) {
    console.error("Error in studentrecordadd:", err);
    res.status(500).send("Error adding student record: " + err.message);
  }
};
exports.studentrecordedit = async (req, res, next) => {
  try {
    const { studentrecordschema } = require("../model/adminschema");
    const modal = mongoose.model("studentrecord", studentrecordschema, "studentrecord");
    const studentRecord = await modal.find({}).lean();
    const { studentId } = req.params;
    const editing = req.query.editing === "true"; // Check if editing mode is enabled
    const studentrecordData = await modal.findOne({ _id: studentId }).lean();
    console.log("Editing student record:", studentrecordData);

    if (!studentrecordData) {
      return res.status(404).send("Student record not found");
    }    
    return res.render("admin/schoolstudentrecord", {
      editing:true,
      studentrecordData,
      studentId,
      studentRecord,
      nepaliYear: bs.ADToBS(new Date()).slice(0, 4), // Convert current date to Nepali year
      currentPage: 'studentRecord',
      ...await getSidenavData(req)
    });
  }
  catch (err) {
    console.error("Error in studentrecordedit:", err);
    res.status(500).send("Error editing student record: " + err.message);
  }
};
exports.studentrecorddelete = async (req, res, next) => {
  try {
    const { studentrecordschema } = require("../model/adminschema");
    const modal = mongoose.model("studentrecord", studentrecordschema, "studentrecord");
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).send("Student ID is required for deletion");
    }
    // Find the student record to delete
    const studentToDelete = await modal.findById(studentId);
    if (!studentToDelete) {
      return res.status(404).send("Student record not found");
    }
    // Delete the student record
    await modal.findByIdAndDelete(studentId);
    console.log(`Student record ${studentToDelete.name} deleted successfully`);
    res.redirect("/studentrecord");
  } catch (err) {
    console.error("Error deleting student record:", err);
    res.status(500).send("Error deleting student record: " + err.message);
  }
};
exports.showuser = async (req, res, next) => {
  try {

    const subjects = await subject.find({}).lean();
    const classlist = await studentClass.find({}).lean();
const aasuser = await userlist.find();

    const sidenavData = await getSidenavData(req);
    res.render("admin/user", {
      editing: false,
      subjects,
      classlist,
      userlist: aasuser,
      ...sidenavData,
      currentPage: 'adminUser'
    });
  } catch (err) {
    console.error("Error in showuser:", err);
    res.status(500).send("Error loading user list: " + err.message);
  }
};
exports.saveuser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const editing = userId ? true : false; // Check if userId exists in params
    let allowedSubjects = [];
    allowedSubjects = req.body.allowedSubjects || []; // This should be an array of strings like "subject_class_section"
    if (typeof allowedSubjects === 'string') {
      allowedSubjects = [allowedSubjects];
    }
     allowedSubjects = allowedSubjects.map(sub => {
      const [subject, studentClass, section] = sub.split('_');
      return { subject, studentClass, section };
    });
    const teacherName = req.body.teacherName.toUpperCase().trim();
    const role = req.body.role.toUpperCase().trim();
    const username = req.body.username.toLowerCase().trim();

    // Only handle password if it's provided in the request
    let updateData = {
      teacherName,
      teacherID: req.body.teacherID,
      role,
      allowedSubjects,
      username
    };

    // For new users or password changes, hash the password
    if (!editing || (req.body.password && req.body.password.trim())) {
      const password = req.body.password.toLowerCase().trim();
      updateData.password = await bcrypt.hash(password, 10);
    }

if(editing)
{
    if (!userId) {
      return res.status(400).send("User ID is required for editing");
    }
    
    // Update existing user - only increment tokenVersion if there is any changes 
   
      updateData.$inc = { tokenVersion: 1 };
    
    
    const existingUser = await userlist.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );
    if (!existingUser) {
      return res.status(404).send("User not found");
    }
    console.log("User updated successfully:", existingUser);
    
    // Check if this is a password change
    if (req.body.password && req.body.password.trim()) {
      // Force the updated user to login again
      if (req.user && req.user._id && req.user._id.toString() === userId) {
        // If it's the current user, log them out
        res.clearCookie('token');
        return res.redirect("/admin/login");
      }
    }
    // For all other cases, just redirect to user list
    res.redirect("/user");
  }
else
{
   // For new users, password is required
    if (!updateData.password) {
      return res.status(400).send("Password is required for new users");
    }
    
    const user = await userlist.create({
      ...updateData,
      tokenVersion: 1 // Initialize tokenVersion for new users
    });

    console.log("User created successfully:", req.body);
    res.redirect("/user");
  }
  } catch (err) {
    console.error("Error saving user:", err);
    res.status(500).send("Error saving user: " + err.message);
  }
};
exports.deleteTeacher = async (req, res, next) => {
  try {
    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).send("User ID is required for deletion");
    }
    
    // Find the user to delete
    const userToDelete = await userlist.findById(teacherId);
    if (!userToDelete) {
      return res.status(404).send("User not found");
    }
    
    // Delete the user
    await userlist.findByIdAndDelete(teacherId);

    console.log(`User ${userToDelete.teacherName} deleted successfully`);
    res.redirect("/user");

  } catch (err) {
    console.error("Error deleting teacher:", err);
    res.status(500).send("Error deleting teacher: " + err.message);
  }
};

exports.viewFile = async (req, res, next) => {
  try {
    const { filename } = req.params;
    const { rootDir } = require("../utils/path");
    const filePath = path.join(rootDir, 'uploads', filename);
    
    console.log(`🔍 ViewFile Request: ${filename}`);
    console.log(`📁 Root Directory: ${rootDir}`);
    console.log(`📄 Full File Path: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      
      // List all files in uploads directory for debugging
      try {
        const uploadsDir = path.join(rootDir, 'uploads');
        const files = fs.readdirSync(uploadsDir);
        console.log(`📂 Available files in uploads directory:`, files);
      } catch (dirError) {
        console.error(`❌ Error reading uploads directory:`, dirError);
      }
      
      return res.status(404).send('File not found');
    }
    
    // Get file stats for debugging
    const stats = fs.statSync(filePath);
    console.log(`📊 File stats:`, {
      size: stats.size,
      isFile: stats.isFile(),
      created: stats.birthtime,
      modified: stats.mtime
    });
    
    // Get file extension to determine content type
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    console.log(`🎯 File extension: ${ext}`);
    
    // Set appropriate content types for different file formats
    switch (ext) {
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.doc':
        contentType = 'application/msword';
        break;
      case '.docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      default:
        contentType = 'application/octet-stream';
        break;
    }
    
    console.log(`📋 Content-Type: ${contentType}`);
    
    // CRITICAL FIX: Set headers to force inline display
    res.setHeader('Content-Type', contentType);
    
    // Only set Content-Disposition for Word docs (force download)
    // For PDFs and images, don't set Content-Disposition at all to allow inline viewing
    if (ext === '.doc' || ext === '.docx') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      console.log(`📥 Disposition: attachment (Word document)`);
    } else {
      // For PDFs, images, and other viewable files - NO Content-Disposition header
      console.log(`👁️ No disposition header - allowing inline display`);
    }
    
    res.setHeader('Content-Length', stats.size);
    
    // Add CORS headers for VM environments
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // For PDFs and images, set cache headers for better browser display
    if (ext === '.pdf' || ['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // Additional PDF-specific headers to ensure inline display
    if (ext === '.pdf') {
      res.setHeader('Accept-Ranges', 'bytes');
      console.log(`📄 PDF-specific headers set for inline display`);
    }
    
    console.log(`🚀 Starting file stream for: ${filename}`);
    console.log(`🔧 Headers set:`, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Has-Disposition': (ext === '.doc' || ext === '.docx') ? 'Yes (attachment)' : 'No (inline)'
    });
    
    // Stream the file to the response
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('open', () => {
      console.log(`✅ File stream opened successfully for: ${filename}`);
    });
    
    fileStream.on('error', (error) => {
      console.error(`❌ Error streaming file ${filename}:`, error);
      if (!res.headersSent) {
        res.status(500).send('Error displaying file');
      }
    });
    
    fileStream.on('end', () => {
      console.log(`✅ File stream completed for: ${filename}`);
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('❌ Error in viewFile:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).send('Error displaying file');
  }
};

// Diagnostic function for VM deployment issues
exports.diagnostics = async (req, res, next) => {
  try {
    const { rootDir } = require("../utils/path");
    const uploadsDir = path.join(rootDir, 'uploads');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        cwd: process.cwd(),
        rootDir: rootDir
      },
      uploads: {
        directory: uploadsDir,
        exists: fs.existsSync(uploadsDir),
        permissions: null,
        files: []
      }
    };
    
    // Check uploads directory
    try {
      if (fs.existsSync(uploadsDir)) {
        const stats = fs.statSync(uploadsDir);
        diagnostics.uploads.permissions = {
          isDirectory: stats.isDirectory(),
          mode: stats.mode.toString(8),
          uid: stats.uid,
          gid: stats.gid
        };
        
        // List all files
        const files = fs.readdirSync(uploadsDir);
        diagnostics.uploads.files = files.map(file => {
          const filePath = path.join(uploadsDir, file);
          const fileStats = fs.statSync(filePath);
          return {
            name: file,
            size: fileStats.size,
            created: fileStats.birthtime,
            modified: fileStats.mtime,
            isFile: fileStats.isFile(),
            permissions: fileStats.mode.toString(8)
          };
        });
      }
    } catch (error) {
      diagnostics.uploads.error = error.message;
    }
    
    // Check if we're in a development or production environment
    diagnostics.environment.isDevelopment = process.env.NODE_ENV !== 'production';
    diagnostics.environment.port = process.env.PORT || 'not set';
    
    res.json(diagnostics);
    
  } catch (error) {
    console.error('Error in diagnostics:', error);
    res.status(500).json({
      error: 'Diagnostics failed',
      message: error.message,
      stack: error.stack
    });
  }
};

  // to Check if model already exists
    const getSubjectModel = (subjectinput, studentClass, section, terminal) => {
      // to Check if model already exists
      if (mongoose.models[`${subjectinput}_${studentClass}_${section}_${terminal}`]) {
        return mongoose.models[`${subjectinput}_${studentClass}_${section}_${terminal}`];
      }
      // Create and return a new model if it doesn't exist
      return mongoose.model(`${subjectinput}_${studentClass}_${section}_${terminal}`, studentSchema, `${subjectinput}_${studentClass}_${section}_${terminal}`);
      };



exports.marksheet = async (req, res, next) => {
  try {
     const {studentClass,section,terminal,academicYear} = req.query;
    const year = new Date();
    const nepaliYear = academicYear || bs.ADToBS(`${year}`).slice(0, 4);
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
   
    
   const cross=[]
    
    // Render the marksheet page with sidenav data
   
      const subjects = await newsubject.find({forClass:studentClass}, { _id: 0, newsubject: 1,forClass:1, theory: 1, practical: 1, total: 1, passingMarks: 1 });
      console.log("Subjects for class:", studentClass, subjects);
      const subjectlist = subjects.map(sub => sub.newsubject);
    for (const sub of subjectlist) {
      const model = getSubjectModelPractical(sub, studentClass, section, terminal,"thpr",nepaliYear);
      const ledgerData = await model.find({}, { _id: 0,totalmarks:1,theory:1,practical:1,name:1,roll:1 }).lean();
      cross.push({
      
        subject: sub,
        ledgerData: ledgerData
    });
  }
  
let students = {};
  const subjectname = cross.map(c=>c.subject);
cross.forEach(({ subject, ledgerData }) => {
  ledgerData.forEach(student => {
    // Initialize student if not exists
    if (!students[student.name]) {
      students[student.name] = {
        roll: student.roll || null
      };
    }

    // Initialize subject object if not exists
    if (!students[student.name][subject]) {
      students[student.name][subject] = {
        theory: 0,
        practical: 0,
        total: 0
      };
    }

    // Add theory & practical marks
    students[student.name][subject].theory = student.theory || 0;
    students[student.name][subject].practical = student.practical || 0;
    students[student.name][subject].total =
      (student.theory || 0) + (student.practical || 0);
  });
});

console.log("Students data:", students);


    //from subject list collection subject where class


   
    // Create subject configurations for the marksheet

    // If no configurations exist, create defaults
    if (!subjects || subjects.length === 0) {
      subjects = subjectname.map(sub => ({
        subject: sub,
        forClass: studentClass,
        theory: 75,
        practical: 25,
        total: 100,
        passingMarks: 35
      }));
    }
    
    // Create a map of subject configurations
    const subjectConfigs = {};
    subjects.forEach(sub => {
      const subName = sub.subject || sub.newsubject;
      if (subName) {
        // Use more explicit checks for numeric values to handle 0 correctly
        const theory = sub.theory !== undefined && sub.theory !== null ? parseInt(sub.theory) : 75;
        const practical = sub.practical !== undefined && sub.practical !== null ? parseInt(sub.practical) : 25;
        const total = sub.total !== undefined && sub.total !== null ? parseInt(sub.total) : 100;
        const passingMarks = sub.passingMarks !== undefined && sub.passingMarks !== null ? parseInt(sub.passingMarks) : 35;
        
        subjectConfigs[subName] = {
          theory: theory,
          practical: practical,
          total: total,
          passingMarks: passingMarks
        };
      }
    });

    res.render("admin/marksheet", {
      editing: false,
      currentPage: 'marksheet',
      subjectname,
      students,
      terminal: terminal,
      academicYear: nepaliYear,
      studentClass: studentClass,
      section: section,
      subjectConfigs: subjectConfigs || {},
      cross,
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in marksheet controller:", err);
    res.status(500).send("Error loading marksheet page: " + err.message);
  }
};
exports.marksheetprint = async (req, res, next) => {
  try {

     const {studentClass,section,terminal,academicYear} = req.query;
    const year = new Date();
    const nepaliYear = academicYear || bs.ADToBS(`${year}`).slice(0, 4);
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
   
    
   const cross = []
    
    // Get subjects with their configurations for this class
    let subjects = await newsubject.find({forClass: studentClass}, { _id: 0, subject: 1, newsubject: 1, forClass: 1, theory: 1, practical: 1, total: 1, passingMarks: 1 });
    console.log("Found subject configs:", subjects);
    
    // If no subject configuration exists in newsubject collection, use defaults
    if (!subjects || subjects.length === 0) {
      console.log("No subject configurations found, using defaults");
      // Use old subject list if available
      const oldSubjects = await subject.find({forClass: studentClass});
      console.log("Using old subject list:", oldSubjects);
      
      const defaultSubjects = oldSubjects.length > 0 
                            ? oldSubjects.map(s => s.subject) 
                            : ["Nepali", "English", "Mathematics", "Science", "Social Studies"];
      
      // Create default configurations
      subjects = defaultSubjects.map(subName => ({
        subject: subName,
        newsubject: subName, // Include both field names for consistency
        forClass: studentClass,
        theory: 75,
        practical: 25,
        total: 100,
        passingMarks: 35
      }));
    }
    
    // Create a map of subject configurations
    const subjectConfigs = {};
    subjects.forEach(sub => {
      // Handle both possible field names
      const subName = sub.subject || sub.newsubject;
      if (subName) {
        // Use more explicit checks for numeric values to handle 0 correctly
        const theory = sub.theory !== undefined && sub.theory !== null ? parseInt(sub.theory) : 75;
        const practical = sub.practical !== undefined && sub.practical !== null ? parseInt(sub.practical) : 25;
        const total = sub.total !== undefined && sub.total !== null ? parseInt(sub.total) : 100;
        const passingMarks = sub.passingMarks !== undefined && sub.passingMarks !== null ? parseInt(sub.passingMarks) : 35;
        
        subjectConfigs[subName] = {
          theory: theory,
          practical: practical,
          total: total,
          passingMarks: passingMarks
        };
        console.log(`Subject config for ${subName}:`, subjectConfigs[subName]);
      }
    });
    
    const subjectlist = subjects.map(sub => sub.subject || sub.newsubject);
   
    for (const sub of subjectlist) {
      const model = getSubjectModelPractical(sub, studentClass, section, terminal,"thpr",nepaliYear);
      const ledgerData = await model.find({}, { _id: 0,totalmarks:1,theory:1,practical:1,name:1,roll:1 }).lean();
      cross.push({
      
        subject: sub,
        ledgerData: ledgerData
    });
  }
  
let students = {};
  const subjectname = cross.map(c=>c.subject);
cross.forEach(({ subject, ledgerData }) => {
  ledgerData.forEach(student => {
    // Initialize student if not exists
    if (!students[student.name]) {
      students[student.name] = {
        roll: student.roll || null
      };
    }


    // Initialize subject object if not exists
    if (!students[student.name][subject]) {
      students[student.name][subject] = {
        theory: null,
        practical: null,
        total: null
        
      };
    }

    // Add theory & practical marks
    students[student.name][subject].theory = student.theory || null;
    students[student.name][subject].practical = student.practical || null;
    students[student.name][subject].total =
      (student.theory || null) + (student.practical || null);
  });
 
});

console.log("Students data:", students);


    //from subject list collection subject where class


   
    // Make sure we always pass subjectConfigs to the template
    console.log("Subject configs for rendering:", Object.keys(subjectConfigs));
    
    res.render("admin/marksheetprint", {
      editing: false,
      currentPage: 'marksheetprint',
      subjectname,
      students,
      terminal: terminal,
      academicYear: nepaliYear,
      studentClass: studentClass,
      section: section,
      subjectConfigs: subjectConfigs || {}, // Ensure it's never undefined
      cross,
      subjects,
      
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in marksheet controller:", err);
    res.status(500).send("Error loading marksheet page: " + err.message);
  }
    }
exports.marksheetSetupForm = async (req, res) => {
  try {
    const { studentClass } = req.query;
    const sidenavData = await getSidenavData(req);
    
    // Default values for the form
    let formData = {
      schoolName: 'ZENITH SECONDARY SCHOOL',
      schoolAddress: 'Piple, Hetauda-05, Makwanpur',
      schoolLogo: '/public/school.jpg',
      schoolSeal: '',
      schoolSealPosition: 'center',
      terminal: 'FIRST',
      academicYear: new Date().getFullYear() + 56 + '/' + (new Date().getFullYear() + 57),
      classTeacher: '',
      principalName: ''
    };
    
    // If a class is specified, get subject configurations
    if (studentClass) {
      const subjects = await newsubject.find({forClass: studentClass});
      
      if (subjects && subjects.length > 0) {
        formData.subjects = subjects.map(s => s.subject).join(',');
        
        // Use the first subject as a reference for default marks
        formData.fullTheory = subjects[0].theory || 75;
        formData.fullPractical = subjects[0].practical || 25;
        formData.fullMarks = subjects[0].total || 100;
        formData.passingMarks = subjects[0].passingMarks || 35;
      }
    }
    
    res.render('admin/marksheetsetup', {
      ...formData,
      studentClass,
      currentPage: 'marksheetsetup',
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in marksheet setup form:", err);
    res.status(500).send("Error loading marksheet setup: " + err.message);
  }
};

exports.marksheetSetupSave = async (req, res) => {
  try {
    const {
      schoolName, schoolAddress, schoolLogo, schoolSeal, schoolSealPosition,
      subjects, fullTheory, fullPractical, fullMarks, passingMarks,
      terminal, academicYear, classTeacher, principalName, studentClass
    } = req.body;
    
    // Save school settings to a configuration model or file
    // For now, we'll just focus on saving subject configurations
    
    if (subjects && studentClass) {
      // Parse subjects string to array
      const subjectArray = subjects.split(',').map(s => s.trim());
      
      // Delete existing subject configs for this class
      await newsubject.deleteMany({forClass: studentClass});
      
      // Create new subject configurations
      for (const subjectName of subjectArray) {
        await newsubject.create({
          subject: subjectName,
          forClass: studentClass,
          theory: fullTheory,
          practical: fullPractical,
          total: fullMarks,
          passingMarks: passingMarks
        });
      }
      
      res.redirect(`/admin/marksheetsetup?studentClass=${studentClass}`);
    } else {
      res.status(400).send("Missing required fields: subjects and class");
    }
  } catch (err) {
    console.error("Error in marksheet setup save:", err);
    res.status(500).send("Error saving marksheet setup: " + err.message);
  }
};

exports.practicalMarks = async (req, res, next) => {
  try {
    let { subjectinput, studentClass, section, terminal, academicyear } = req.query;

    // ✅ Get sidenav data for dropdowns (always needed)
    const sidenavData = await getSidenavData(req);

    console.log("=== PRACTICAL MARKS REQUEST ===");
    console.log("Query parameters:", req.query);
    console.log("Parameters:", { subjectinput, studentClass, section, terminal, academicyear });
    console.log("===============================");

    // ✅ Case 1: No query yet → just render empty page with selection
    if (!subjectinput || !studentClass || !section || !terminal) {
      console.log("No complete parameters provided - showing selection form");
      
      return res.render("admin/practicalentry", {
        editing: false,
        currentPage: "practicalMarks",
        studentThData: [],   // no table yet
        subjectinput: null,
        studentClass: null,
        section: null,
        terminal: null,
        academicyear: null,
        studentPrData: [],
        ...sidenavData
      });
    }

    // ✅ Case 2: Query exists → proceed to fetch and display marks
    const year = new Date();
    const nepaliYear = academicyear || bs.ADToBS(`${year}`).slice(0, 4);
    console.log("Practical Marks Request:", { subjectinput, studentClass, section, terminal, academicyear: nepaliYear });

    // ✅ Step 1: Get all students for this class and section
    const allStudents = await modal.find(
      { studentClass, section }, 
      { _id: 0, name: 1, roll: 1, studentClass: 1, section: 1 }
    ).lean();

    if (!allStudents || allStudents.length === 0) {
      console.log(`❌ No students found for Class ${studentClass}, Section ${section}`);
      return res.render("admin/practicalentry", {
        editing: false,
        currentPage: "practicalMarks",
        studentThData: [],
        subjectinput,
        studentClass,
        section,
        terminal,
        academicyear: nepaliYear,
        studentPrData: [],
        message: `No students found for Class ${studentClass}, Section ${section}`,
        ...sidenavData
      });
    }

    console.log(`✅ Found ${allStudents.length} students in class ${studentClass}-${section}`);
    console.log("Sample student:", allStudents[0]);

    // ✅ Debug: List all collections to see what actually exists
    try {
      const allCollections = await mongoose.connection.db.listCollections().toArray();
      const relevantCollections = allCollections
        .filter(col => col.name.includes(subjectinput) || col.name.includes(`${studentClass}_${section}`))
        .map(col => col.name);
      
      console.log("🗂️ All relevant collections in database:", relevantCollections);
    } catch (err) {
      console.error("Error listing collections:", err);
    }

    // ✅ Step 2: Try to get theory marks from getSubjectModel collection
    let theoryMarksData = [];
    const theoryModelName = `${subjectinput}_${studentClass}_${section}_${terminal}`;
    
    console.log(`🔍 Looking for theory collection: ${theoryModelName}`);
    
    try {
      // Check if theory collection exists
      const collections = await mongoose.connection.db.listCollections({ name: theoryModelName }).toArray();
      
      if (collections.length > 0) {
        console.log(`✅ Theory collection ${theoryModelName} exists`);
        // Collection exists, create model and fetch data
        const theoryModel = getSubjectModel(subjectinput, studentClass, section, terminal);
        theoryMarksData = await theoryModel.find(
          {},
          { _id: 0, roll: 1, name: 1, totalMarks: 1 }
        ).lean();
        
        console.log(`✅ Found ${theoryMarksData.length} theory records from ${theoryModelName}`);
        if (theoryMarksData.length > 0) {
          console.log("Sample theory record:", theoryMarksData[0]);
        }
      } else {
        console.log(`⚠️ Theory collection ${theoryModelName} does not exist`);
      }
    } catch (error) {
      console.error("❌ Error fetching theory marks:", error);
      theoryMarksData = [];
    }

    // ✅ Step 3: Get practical marks from getSubjectModelPractical collection
    let practicalMarksData = [];
    const practicalModelName = `${subjectinput}_${studentClass}_${section}_${terminal}_thpr_${nepaliYear}`;
    
    console.log(`🔍 Looking for practical collection: ${practicalModelName}`);
    
    try {
      const practicalModel = getSubjectModelPractical(subjectinput, studentClass, section, terminal, "thpr", nepaliYear);
      practicalMarksData = await practicalModel.find(
        {},
        { _id: 0, roll: 1, name: 1, theory: 1, practical: 1, totalmarks: 1 }
      ).lean();
      
      console.log(`✅ Found ${practicalMarksData.length} practical records from ${practicalModelName}`);
      if (practicalMarksData.length > 0) {
        console.log("Sample practical record:", practicalMarksData[0]);
        console.log("All practical records:", practicalMarksData);
      }
    } catch (error) {
      console.error("❌ Error fetching practical marks:", error);
      practicalMarksData = [];
    }

    // ✅ Step 4: Create maps for quick lookup
    const theoryMarksMap = new Map();
    theoryMarksData.forEach(record => {
      theoryMarksMap.set(record.roll, record.totalMarks || 0);
      console.log(`📚 Theory map - Roll ${record.roll}: ${record.totalMarks || 0}`);
    });

    const practicalMarksMap = new Map();
    practicalMarksData.forEach(record => {
      practicalMarksMap.set(record.roll, {
        theory: record.theory || 0,
        practical: record.practical || 0,
        totalmarks: record.totalmarks || 0
      });
      console.log(`🔬 Practical map - Roll ${record.roll}: Theory=${record.theory || 0}, Practical=${record.practical || 0}, Total=${record.totalmarks || 0}`);
    });

    console.log(`📊 Theory map size: ${theoryMarksMap.size}, Practical map size: ${practicalMarksMap.size}`);

    console.log("🚨🚨🚨 NEW MERGING LOGIC STARTING 🚨🚨🚨");
    
    // ✅ Step 5: Merge all data - prioritize practical collection data, then fallback to theory collection
    const mergedStudentData = allStudents.map(student => {
      const roll = student.roll;
      
      // Get theory marks: First try from practical collection (which has saved marks), then from theory collection
      let theoryMarks = 0;
      console.log(`🔍 DEBUG - Roll ${roll} (type: ${typeof roll}) practical data lookup in map with keys:`, Array.from(practicalMarksMap.keys()));
      
      if (practicalMarksMap.has(roll)) {
        const practicalData = practicalMarksMap.get(roll);
        console.log(`🔍 DEBUG - Roll ${roll} practical data:`, practicalData);
        
        if (practicalData && practicalData.theory !== undefined) {
          theoryMarks = Number(practicalData.theory) || 0;
          console.log(`✅ Theory from practical collection for roll ${roll}: ${theoryMarks}`);
        } else {
          console.log(`⚠️ No theory data in practical collection for roll ${roll}`);
        }
      } else {
        console.log(`❌ Roll ${roll} NOT FOUND in practical map. Checking with string conversion...`);
        if (practicalMarksMap.has(String(roll))) {
          const practicalData = practicalMarksMap.get(String(roll));
          console.log(`🔍 Found with string conversion - Roll ${String(roll)} practical data:`, practicalData);
          if (practicalData && practicalData.theory !== undefined) {
            theoryMarks = Number(practicalData.theory) || 0;
            console.log(`✅ Theory from practical collection for roll ${String(roll)}: ${theoryMarks}`);
          }
        }
      }
      
      if (theoryMarks === 0 && theoryMarksMap.has(roll)) {
        theoryMarks = Number(theoryMarksMap.get(roll)) || 0;
        console.log(`📚 Theory from theory collection for roll ${roll}: ${theoryMarks}`);
      }

      // Get practical marks from practical collection
      let practicalMarks = 0;
      if (practicalMarksMap.has(roll)) {
        practicalMarks = Number(practicalMarksMap.get(roll).practical) || 0;
        console.log(`🔬 Practical for roll ${roll}: ${practicalMarks}`);
      } else if (practicalMarksMap.has(String(roll))) {
        practicalMarks = Number(practicalMarksMap.get(String(roll)).practical) || 0;
        console.log(`🔬 Practical for roll ${String(roll)} (string): ${practicalMarks}`);
      }

      // Get total marks from practical collection if available, otherwise calculate
      let totalMarks = 0;
      if (practicalMarksMap.has(roll)) {
        totalMarks = Number(practicalMarksMap.get(roll).totalmarks) || (theoryMarks + practicalMarks);
      } else if (practicalMarksMap.has(String(roll))) {
        totalMarks = Number(practicalMarksMap.get(String(roll)).totalmarks) || (theoryMarks + practicalMarks);
      } else {
        totalMarks = theoryMarks + practicalMarks;
      }

      const studentData = {
        roll: roll,
        name: student.name,
        studentClass: student.studentClass,
        section: student.section,
        theory: theoryMarks,
        practical: practicalMarks,
        totalmarks: totalMarks
      };
      
      console.log(`Merged data for Roll ${roll}:`, studentData);
      return studentData;
    });

    // Sort by roll number
    mergedStudentData.sort((a, b) => parseInt(a.roll) - parseInt(b.roll));

    console.log(`Final merged data for ${mergedStudentData.length} students:`);
    mergedStudentData.forEach(student => {
      console.log(`Roll ${student.roll}: Theory=${student.theory}, Practical=${student.practical}, Total=${student.totalmarks}`);
    });

    // ✅ Step 6: Render the page with merged data
    console.log("\n=== FINAL RENDER DATA ===");
    console.log(`Rendering with ${mergedStudentData.length} students`);
    console.log("Sample student data:", mergedStudentData.length > 0 ? mergedStudentData[0] : "No students");
    console.log("Render parameters:", {
      subjectinput,
      studentClass,
      section,
      terminal,
      academicyear: nepaliYear,
      hasStudentData: mergedStudentData.length > 0
    });
    console.log("=========================\n");

    res.render("admin/practicalentry", {
      editing: false,
      currentPage: "practicalMarks",
      studentThData: mergedStudentData, // Send merged data with existing marks
      subjectinput,
      studentClass,
      section,
      terminal,
      academicyear: nepaliYear,
      studentPrData: [], // Keep for compatibility
      ...sidenavData
    });

  } catch (err) {
    console.error("Error in practicalMarks controller:", err);
    return res.status(500).send("Error loading practical marks page: " + err.message);
  }
};

exports.autoSavePracticalMarks = async (req, res, next) => {
  try {
    const { subjectinput, studentClass, section, terminal, roll, theory, practical, academicyear } = req.body;
    
    // Validate required fields
    if (!subjectinput || !studentClass || !section || !terminal || !roll) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: subject, class, section, terminal, or roll number" 
      });
    }
    
    // Convert to numbers and handle missing values
    const theoryValue = Number(theory) || 0;
    const practicalValue = Number(practical) || 0;
    const totalmarks = theoryValue + practicalValue;
    
    // Get current year for academic year if not provided
    const year = new Date();
    const nepaliYear = academicyear || bs.ADToBS(`${year}`).slice(0, 4);
    
    console.log(`Auto-saving practical marks: Roll: ${roll}, Subject: ${subjectinput}, Theory: ${theoryValue}, Practical: ${practicalValue}, Total: ${totalmarks}`);

    // Get student name from the student collection
    let studentName = '';
    try {
      const studentData = await modal.findOne({ studentClass, section, roll }, { _id: 0, name: 1 }).lean();
      if (studentData) {
        studentName = studentData.name;
      } else {
        console.warn(`Student not found for roll: ${roll} in class ${studentClass}-${section}`);
        studentName = `Student_${roll}`; // Fallback name
      }
    } catch (err) {
      console.error("Error fetching student name:", err);
      studentName = `Student_${roll}`; // Fallback name
    }
    
    // Get the correct model dynamically for practical marks
    const practicalModelName = `${subjectinput}_${studentClass}_${section}_${terminal}_thpr_${nepaliYear}`;
    const model = getSubjectModelPractical(subjectinput, studentClass, section, terminal, "thpr", nepaliYear);
    
    if (!model) {
      return res.status(404).json({ 
        success: false, 
        error: `Unable to get or create model for ${practicalModelName}` 
      });
    }
    
    // Prepare the document data
    const documentData = {
      roll,
      name: studentName,
      subject: subjectinput,
      studentClass,
      section,
      terminal,
      theory: theoryValue,
      practical: practicalValue,
      totalmarks,
      academicYear: nepaliYear,
      lastUpdated: new Date()
    };
    
    // Use findOneAndUpdate with upsert to create or update the record
    try {
      const result = await model.findOneAndUpdate(
        { roll }, // Find by roll number
        { $set: documentData }, // Update all fields
        { 
          upsert: true, // Create if doesn't exist
          new: true, // Return updated document
          runValidators: true // Run schema validations
        }
      );
      
      if (!result) {
        return res.status(500).json({ 
          success: false, 
          error: `Failed to save marks for roll ${roll}` 
        });
      }
      
      console.log(`✅ Successfully saved marks for Roll ${roll}:`, {
        theory: theoryValue,
        practical: practicalValue,
        total: totalmarks,
        name: studentName
      });
      
      // Return success with all saved data
      res.json({ 
        success: true, 
        roll,
        name: studentName,
        subject: subjectinput,
        theory: theoryValue,
        practical: practicalValue, 
        totalmarks,
        studentClass,
        section,
        terminal,
        academicYear: nepaliYear,
        message: `All marks saved successfully for ${studentName} (Roll: ${roll})` 
      });
      
    } catch (saveErr) {
      console.error("Error saving practical marks:", saveErr);
      return res.status(500).json({ 
        success: false, 
        error: `Error saving marks: ${saveErr.message}` 
      });
    }

  } catch (err) {
    console.error("Auto-save error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
exports.editTeacher = async (req, res, next) => {
  try {
    const user = req.user;
    const { userId } = req.params;
    const { editing } = req.query;
    const classlist = await studentClass.find({}).lean();
    const userData = await userlist.findOne({ _id: userId }).lean();
    
    const users = await userlist.find({}).lean();
    
    if (!userData) {
      return res.status(404).send("User not found");
    }
    
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
    
    res.render("admin/user", {
      editing,
      userId,
      userData,
      userlist:users,
      classlist,
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in editTeacher:", err);
    res.status(500).send("Error loading teacher edit form: " + err.message);
  }
};

// Secure password reset controller
exports.resetPassword = async (req, res, next) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ message: "User ID and new password are required" });
    }
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const userlist = require("mongoose").model("userlist", require("../model/admin").teacherSchema, "users");
    const updatedUser = await userlist.findByIdAndUpdate(
      userId,
      { password: hashedPassword, $inc: { tokenVersion: 1 } },
      { new: true }
    );
   
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.render("./partials/success",{message: "Password reset successful",redirectUrl:"/user"} )
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({ message: "Error resetting password: " + err.message });
  }
};
exports.subjectlistcheck = async (req, res, next) => {
  try
  {
    const {subjectinput, forClass,forTerminal} = req.query;
    console.log("Checking subject list for:", { subjectinput, forClass, forTerminal });
    const exist = await subject.findOne({ subject: subjectinput, forClass: forClass,forTerminal:forTerminal });
    if (exist) {
      res.json({exists: true, message: `Subject ${subjectinput} already exists for class ${forClass}-${forTerminal}.` });
      return true;
    }
    else {
      res.json({exists: false, message: `Subject ${subjectinput} does not exist for class ${forClass}-${forTerminal}.` });
      return false;
    }
   
  }catch(err)
  {
    console.error("Error in subjectlistcheck:", err);
    res.status(500).send("Error checking subject list: " + err.message);
  }
}
exports.report = async (req, res, next) => {
  try {
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
    
    res.render("admin/reportprint", {
      currentPage: 'report',
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in report controller:", err);
    res.status(500).send("Error loading report page: " + err.message);
  }
};
const getSubjectData = async (subjectinput, forClass, forTerminal, res) => {
  try {
    // First try exact match
    let currentSubject = await subject.find({'subject': `${subjectinput}`, forClass: forClass, forTerminal: forTerminal})
    
    // If no results, try case-insensitive search
    if (!currentSubject || currentSubject.length === 0) {
      // Try case-insensitive search using a regular expression
      currentSubject = await subject.find({
        'subject': { $regex: new RegExp(`^${subjectinput}$`, 'i') }, forClass: forClass
      });
    }
    
    if (!currentSubject || currentSubject.length === 0) {
      // Check if any subjects exist at all
      const allSubjects = await subjectlist.find({}).lean();
      const subjectsList = allSubjects.map(s => s.subject).join(', ');
      
      if (res) {
        res.status(404).render('404', {
          errorMessage: `Subject '${subjectinput}' not found in the database. Available subjects: ${subjectsList || 'None'}`,
          currentPage: 'teacher'
        });
      }
      return null;
    }
    return currentSubject[0];
  } catch (err) {
    console.error(`Error in getSubjectData: ${err.message}`);
    if (res) {
      res.status(500).render('404', {
        errorMessage: `Server error while looking up subject '${subjectinput}': ${err.message}`,
        currentPage: 'teacher'
      });
    }
    return null;
  }
};

exports.reportprint = async (req, res, next) => {
  try {
    const { subjectinput, studentClass, section, terminal, academicYear } = req.query;
    console.log("Report print request:", { subjectinput, studentClass, section, terminal, academicYear });
    const year = new Date();
    const nepaliYear = academicYear || bs.ADToBS(`${year}`).slice(0, 4);
    
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
    const reportofClass = [];

    // Find all subjects for this class and terminal
    const subjectlistFromDb = await subject.find({
        forClass: studentClass,
        forTerminal: terminal
    }, { _id: 0, subject: 1, forClass: 1, forTerminal: 1 }).lean();

    // Deduplicate subjects
    const subjectMap = new Map();
    subjectlistFromDb.forEach(item => {
        subjectMap.set(`${item.subject}-${item.forClass}-${item.forTerminal}`, item);
    });
    const uniqueSubjects = Array.from(subjectMap.values());
    
    console.log(`Found ${uniqueSubjects.length} subjects for Class ${studentClass} Terminal ${terminal}`);

    for (const subItem of uniqueSubjects) {
         // Use logic from findData
         const subjectName = subItem.subject;
         let result = [];
         let total = [];
         
         // Use getSubjectData to get chapter info and marks structure
         // Pass null for res to avoid auto-rendering error pages inside loop
         const subjectDetails = await getSubjectData(subjectName, studentClass, terminal, null);
         
         if (!subjectDetails) {
             console.log(`Skipping ${subjectName} - no detailed config found`);
             continue;
         }
 
         const model = getSubjectModel(subjectName, studentClass, section, terminal);
         
         // 1. Get total students count
         const totalStudentParams = await model.aggregate([
             {
                 $match: {
                     $and: [{ section: `${section}` }, { terminal: `${terminal}` }, { studentClass: `${studentClass}` }],
                 },
             },
             { $count: "count" },
         ]);
         
         const totalStudent = totalStudentParams.length > 0 && totalStudentParams[0].count ? totalStudentParams[0].count : 0;
         
         // 2. Get obtained marks for all students to calculate totals
         let subData = await model.find({ 
             subject: `${subjectName}`, 
             studentClass: `${studentClass}`, 
             section: `${section}`, 
             terminal: `${terminal}` 
         }, { _id: 0, __v: 0 }).lean();
         
         if (subData && subData.length > 0) {
             // Calculate total obtained marks for each question across all students
              total = Object.keys(subData[0]).slice(7).map(qno=>
             {
             const t = subData.reduce((sum,obtainedmarks)=>{
                 return sum + (obtainedmarks[qno] ?? 0);
             },0)
             return {qno,t};
             }
 
             );
         }
 
         // 3. Process keyValues (marks per question) and Chapters from subjectDetails
         const keyValues = {};
         const questionToChapter = {};
         const roman = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
         
         // Create chapter mapping
         if (subjectDetails.chapter && Array.isArray(subjectDetails.chapter)) {
             subjectDetails.chapter.forEach(chap => {
                 if (chap.questions && Array.isArray(chap.questions)) {
                     chap.questions.forEach(q => {
                         questionToChapter[q] = chap.chapterName;
                     });
                 }
             });
         }
         
         // Create marks mapping
         for (const key in subjectDetails) {
             if (/^q\d+[a-z]$/.test(key)) {
                 const hasSubparts = subjectDetails[`${key}_has_subparts`] === "on" || subjectDetails[`${key}_has_subparts`] === true;
                 const subpartsCount = parseInt(subjectDetails[`${key}_subparts_count`] || 0);
                 const marksPerSubpart = parseFloat(subjectDetails[`${key}_marks_per_subpart`] || 0);
                 const marks = parseFloat(subjectDetails[key] || 0);
 
                 if (hasSubparts && subpartsCount > 0 && !isNaN(marksPerSubpart) && marksPerSubpart > 0) {
                     for (let i = 0; i < subpartsCount; i++) {
                         const subKey = `${key}_${roman[i]}`;
                         keyValues[subKey] = marksPerSubpart;
                     }
                 } else if (!hasSubparts && !isNaN(marks) && marks > 0) {
                     keyValues[key] = marks;
                 }
                 // Skip any keys that don't have valid marks to avoid NaN errors
             }
         }
 
         // 4. Generate stats for each question
         for (const key in keyValues) {
             const questionKey = key;
             const fullMarks = keyValues[key];
 
             if (isNaN(fullMarks) || fullMarks <= 0) continue;
             
             // Get total marks for this question
             const questionTotal = total.find(t => t.qno === questionKey);
             const totalMarksForQuestion = questionTotal ? questionTotal.t : 0;
             
             const averagePercentage = totalStudent > 0 ? (totalMarksForQuestion / (totalStudent * fullMarks)) * 100 : 0;
             
             const correctCount = await model.countDocuments({
                 subject: `${subjectName}`, studentClass: `${studentClass}`, section: `${section}`, terminal: `${terminal}`,
                 [questionKey]: fullMarks
             });
             
             const incorrectCount = await model.countDocuments({
                 subject: `${subjectName}`, studentClass: `${studentClass}`, section: `${section}`, terminal: `${terminal}`,
                 [questionKey]: 0
             });
             
             const fiftyCount = await model.countDocuments({
                 subject: `${subjectName}`, studentClass: `${studentClass}`, section: `${section}`, terminal: `${terminal}`,
                 [questionKey]: 0.5 * fullMarks
             });
             
             const above50Count = await model.countDocuments({
                 subject: `${subjectName}`, studentClass: `${studentClass}`, section: `${section}`, terminal: `${terminal}`,
                 [questionKey]: { $gt: 0.5 * fullMarks, $lt: fullMarks }
             });
             
             const below50Count = await model.countDocuments({
                 subject: `${subjectName}`, studentClass: `${studentClass}`, section: `${section}`, terminal: `${terminal}`,
                 [questionKey]: { $lt: 0.5 * fullMarks, $gt: 0 }
             });
             
            
             
             result.push({
                 questionNo: questionKey,
                 chapterName: questionToChapter[questionKey] || 'Uncategorized',
                 correct: correctCount,
                 wrong: incorrectCount,
                 correctabove50: above50Count,
                 correctbelow50: below50Count,
                 fifty: fiftyCount,
                 averagePercentage: averagePercentage.toFixed(2),
                 totalMarks: totalMarksForQuestion,
                 fullMarks: fullMarks
             });
         }
 
         // Sort result by wrong count (most wrong first)
         result.sort((a, b) => b.wrong - a.wrong);

         reportofClass.push(
         {
         subject: subjectName,
         totalStudents: totalStudent,
         results: result,
         }
         );
    }
    
    return res.render("admin/finalreportprint", {
      currentPage: 'reportprint',
      reportofClass,
      studentClass,
      section,
      terminal,
      academicYear: nepaliYear,
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in report print controller:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      params: { subjectinput, studentClass, section, terminal, academicYear }
    });
    res.status(500).send("Error generating report: " + err.message);
  }
}

exports.showmarksheetSetupForm = async (req, res) => {
  try {
    // Get sidenav data
    const sidenavData = await getSidenavData(req);
    
    // Debug: Check the collection name and connection
    console.log("=== MARKSHEET SETUP DEBUG ===");
    console.log("Model collection name:", marksheetSetup.collection.name);
    console.log("Database name:", mongoose.connection.db.databaseName);
    
    // Try to get collection directly
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Available collections:", collections.map(c => c.name));
    
    // Fetch all existing marksheet configurations
    const marksheetData = await marksheetSetup.find({}).lean();
    console.log("Number of records found:", marksheetData.length);
    console.log("Marksheet data:", JSON.stringify(marksheetData, null, 2));
    
    // Also try querying the collection directly
    const directQuery = await db.collection('marksheetSetting').find({}).toArray();
    console.log("Direct query results:", directQuery.length);
    console.log("Direct query data:", JSON.stringify(directQuery, null, 2));
    
    // Check if we're in edit mode
    let editData = null;
    if (req.query.edit === 'true' && req.query.id) {
      editData = await marksheetSetup.findById(req.query.id).lean();
      console.log("Edit data:", editData);
    }
    
    res.render("admin/marksheetsetup", {
      currentPage: 'marksheetsetup',
      marksheetData: marksheetData,
      editData: editData,
      ...sidenavData
    });
  } catch (err) {
    console.error("Error in showmarksheetSetupForm:", err);
    res.status(500).send("Error loading marksheet setup: " + err.message);
  }
};
exports.savemarksheetSetupForm = async (req, res) => {
  try {
    const total = req.body.totalTerminals;
    const terminals = [];

    for (let i = 1; i <= total; i++) {
      const name = req.body[`name${i}`];
      const workingDays = req.body[`workingDays${i}`];

      if (name && workingDays) {
        terminals.push({ name, workingDays });
      }
    }

    // Check if we're updating an existing setup
    if (req.query.edit === 'true' && req.query.id) {
      // Update existing setup
      await marksheetSetup.findByIdAndUpdate(req.query.id, {
        schoolName: req.body.schoolName,
        address: req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        website: req.body.website,
        academicYear: req.body.academicYear,
        totalTerminals: total,
        terminals
      });
    } else {
      // Create new setup
      await marksheetSetup.create({
        schoolName: req.body.schoolName,
        address: req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        website: req.body.website,
        academicYear: req.body.academicYear,
        totalTerminals: total,
        terminals
      });
    }

    res.redirect('/marksheetsetup');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving marksheet setup");
  }
};

exports.deletemarksheetSetup = async (req, res) => {
  try {
    const { id } = req.params;
    await marksheetSetup.findByIdAndDelete(id);
    res.redirect('/marksheetsetup');
  } catch (err) {
    console.error("Error deleting marksheet setup:", err);
    res.status(500).send("Error deleting marksheet setup: " + err.message);
  }
};
