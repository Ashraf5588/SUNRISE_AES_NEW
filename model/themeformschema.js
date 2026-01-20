const mongoose = require('mongoose');

// Custom schema type to handle potentially array values - takes first element if array
const handleArrayOrSingle = function(value) {
  if (Array.isArray(value)) {
    return value[0]; // Take first element if it's an array
  }
  return value;
};

// Schema for theme-based student evaluation
const ThemeEvaluationSchema = new mongoose.Schema({
  // Student basic information
  name: { 
    type: String, 
    required: true,
    set: handleArrayOrSingle 
  },
  studentClass: { 
    type: String, 
    required: true,
    set: handleArrayOrSingle 
  },
  section: { 
    type: String, 
    required: false,
    set: handleArrayOrSingle 
  },
  roll: { 
    type: String, 
    required: true,
    set: handleArrayOrSingle 
  },
  
  // Array of subjects for the student
  subjects: [
    {
      name: { 
        type: String, 
        required: true,
        set: handleArrayOrSingle 
      },
      
      // Array of themes within each subject
      themes: [
        {
          themeName: { 
            type: String, 
            required: true,
            set: handleArrayOrSingle 
          },
          
          // Array of learning outcomes for each theme
          learningOutcomes: [
            {
              name: { 
                type: String, 
                required: true,
                set: handleArrayOrSingle 
              },
              evaluationDateBefore: { 
                type: String,
                set: handleArrayOrSingle 
              },
                 evaluationDateAfter: { 
                type: String,
                set: handleArrayOrSingle 
              },

              
              // Indicators for each learning outcome
              indicators: [
                {
                  name: { 
                    type: String, 
                    required: true,
                    set: handleArrayOrSingle 
                  },
                  maxMarks: { 
                    type: Number, 
                    required: true,
                    set: handleArrayOrSingle 
                  },
                  marksBeforeIntervention: { 
                    type: Number, 
                    default: 0,
                    set: handleArrayOrSingle 
                  },
                  marksAfterIntervention: { 
                    type: Number, 
                    default: 0,
                    set: handleArrayOrSingle 
                  },
                  toolsUsed: { 
                    type: String,
                    set: handleArrayOrSingle 
                  }
                }
              ],
              
              // Total marks for this learning outcome
              totalMarksBeforeIntervention: { 
                type: Number, 
                default: 0,
                set: handleArrayOrSingle 
              },
              totalMarksAfterIntervention: { 
                type: Number, 
                default: 0,
                set: handleArrayOrSingle 
              }
            }
          ],
          
          // Overall theme total
          overallTotalBefore: { 
            type: Number, 
            default: 0,
            set: handleArrayOrSingle 
          },
          overallTotalAfter: { 
            type: Number, 
            default: 0,
            set: handleArrayOrSingle 
          }
        }
      ]
    }
  ],
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create model from schema if it doesn't exist
// let ThemeEvaluation;
// try {
//   // Try to get the existing model
//   ThemeEvaluation = mongoose.model('ThemeEvaluation');
// } catch (e) {
//   // Create the model if it doesn't exist
//   ThemeEvaluation = mongoose.model('ThemeEvaluation', ThemeEvaluationSchema, 'themeForStudent1');
// }

// Add pre-save middleware to handle arrays in the document
ThemeEvaluationSchema.pre('save', function(next) {
  // Use WeakMap to track processed objects and prevent circular references
  const processed = new WeakMap();
  
  // This will handle any nested arrays that might not be caught by the setters
  const processObject = (obj) => {
    // Skip null, undefined, or primitive values
    if (!obj || typeof obj !== 'object') return obj;
    
    // Check if we've already processed this object (prevents circular reference stack overflow)
    if (processed.has(obj)) {
      return obj;
    }
    
    // Mark this object as processed
    processed.set(obj, true);
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      
      // If it's an array but not supposed to be an array field
      if (Array.isArray(value) && 
          !['subjects', 'themes', 'learningOutcomes', 'indicators'].includes(key)) {
        obj[key] = value[0]; // Take the first element
      }
      
      // Process nested objects/arrays recursively
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && typeof item === 'object') {
              processObject(item);
            }
          });
        } else {
          processObject(value);
        }
      }
    });
    
    return obj;
  };
  
  // Process the document
  processObject(this);
  next();
});

// Export both the schema and model


const practicalSchema = new mongoose.Schema(
  {
    roll:{ type:String, required:false},
    name: {type:String, required:false},
    studentClass: {type:String, required:false},
    section:{ type:String, required:false},
    terminal:[
      {
          terminalName:{ type:String, required:false},
          totalAttendance: {type:Number, required:false},
          attendanceMarks: {type:Number, required:false},
    subject:[
      {
        
        subjectName:{ type:String, required:false},
     
        participationMarks: {type:Number, required:false},
        theoryMarks:{type:Number,required:false},
        terminalMarks: {type:Number, required:false},
        mulyangkanAdhar: [
          {

            
            mulyangkanName:{type:String, required:false},
            prixyanPakxya: {type:String,required:false},
            praptaSuchak: {type:String, required:false},
            praptangka: {type:Number, required:false},
            
           

              }
            ],

          }
        ],
        totalObtained: {type:Number, required:false}
      },
    ],
    },

)
// Export both the schema and model

const scienceprojectSchema = new mongoose.Schema({
  roll: { type: String, required: false },
  name: { type: String, required: false },
  studentClass: { type: String, required: false },
  section: { type: String, required: false },
  subject: { type: String, required: false },
  terminal: { type: String, required: false },
  projectWorks: [
    {
      projectWorkLesson: { type: String, required: false },
      projectName: { type: String, required: false },
      sanchalan: {
        projectAdhar: { type: String, required: false },
        projectIndicator: { type: String, required: false },
        projectMarks: { type: Number, required: false }
      },
      abhilekh: {
        projectAdhar: { type: String, required: false },
        projectIndicator: { type: String, required: false },
        projectMarks: { type: Number, required: false }
      }
    }
  ],
    practical: [
    {
      practicalName: { type: String, required: false },
      practicalLesson: { type: String, required: false },
      practicalAdhar: { type: String, required: false },
      practicalIndicator: { type: String, required: false },
      practicalMarks: { type: Number, required: false }
    }
  ]
});


const practicalprojectSchema = new mongoose.Schema({
  reg: {type: String, required:false},
  roll: { type: String, required: false },
  name: { type: String, required: false },
  studentClass: { type: String, required: false },
  section: { type: String, required: false },
  subject: { type: String, required: false },
  terminalName: {type:String, required: false},
   
      totalAttendance: { type: Number, required: false },
      attendanceMarks: { type: Number, required: false },
      theoryMarks: { type: Number, required: false },
      terminalMarks: { type: Number, required: false },
      participationMarks: { type: Number, required: false },
    
  unit: [
    {
      unitName: { type: String, required: false },
      portion: { type: String, required: false },
      
      projectWorks: [
        {
          projectName: { type: String, required: false },
          projectMarks: { type: Number, required: false },
          criteria: [{
          projectIndicator:{type:String, required:false},
          projectAdhar: {type:String,required:false},
          projectIndicatorMarks:{type:String, required:false}
       }]
      }
      ],
      practicals: [
        {
          practicalName: { type: String, required: false },
          practicalMarks: { type: Number, required: false },
          criteria: [{
          practicalIndicator:{type:String, required:false},
          practicalAdhar: {type:String,required:false},
          practicalIndicatorMarks:{type:String, required:false}
       }]
      }
      ]
    }
  ],
   
})
module.exports = {
  ThemeEvaluationSchema,
  practicalSchema,
  scienceprojectSchema,
  practicalprojectSchema

};

