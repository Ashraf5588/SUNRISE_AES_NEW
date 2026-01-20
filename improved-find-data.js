// Enhanced findData controller function for controller.js
// Replace the existing findData function with this one

exports.findData = async (req, res) => {
  try {
    const {
      subjectinput,
      studentClass,
      section,
      terminal,
    } = req.params;
    
    console.log(`findData called with: subject=${subjectinput}, class=${studentClass}, section=${section}, terminal=${terminal}`);
    
    // Use the helper function to safely get subject data first
    const subjectData = await getSubjectData(subjectinput, res);
    
    // If subject data is null, the helper function has already sent a response
    if (!subjectData) {
      console.log(`No subject data found for ${subjectinput}`);
      return;
    }
    
    const model = getSubjectModel(subjectinput);
    console.log(`Using model for subject: ${subjectinput}`);
    
    // Log collection name for debugging
    console.log(`Collection name: ${model.collection.name}`);
    
    // Try to find at least one document to test access
    const sampleDoc = await model.findOne({
      section: section,
      terminal: terminal,
      studentClass: studentClass
    }).lean();
    
    if (!sampleDoc) {
      console.log(`Warning: No documents found with exact criteria. Checking for case sensitivity issues...`);
      
      // Try case insensitive search to see if there's a match
      const altDoc = await model.findOne({
        section: { $regex: new RegExp(`^${section}$`, 'i') },
        terminal: { $regex: new RegExp(`^${terminal}$`, 'i') },
        studentClass: { $regex: new RegExp(`^${studentClass}$`, 'i') }
      }).lean();
      
      if (altDoc) {
        console.log(`Found documents with case-insensitive search. 
          Used: section=${section}, terminal=${terminal}, studentClass=${studentClass}
          Found: section=${altDoc.section}, terminal=${altDoc.terminal}, studentClass=${altDoc.studentClass}`);
        
        // Adjust search criteria to match actual data in DB
        section = altDoc.section;
        terminal = altDoc.terminal;
        studentClass = altDoc.studentClass;
      } else {
        console.log(`No documents found even with case-insensitive search`);
      }
    } else {
      console.log(`Found documents with exact criteria match`);
    }
    
    // Get total count of students
    const totalstudent = await model.aggregate([
      {
        $match: {
          section: section,
          terminal: terminal,
          studentClass: studentClass
        }
      },
      { $count: "count" }
    ]);
    
    const totalStudent = totalstudent.length > 0 && totalstudent[0].count
      ? totalstudent[0].count
      : 0;
      
    console.log(`Found ${totalStudent} students for ${subjectinput} class ${studentClass}-${section} (${terminal} term)`);
    
    // If no students found, render with empty results
    if (totalStudent === 0) {
      return res.render("analysis", {
        results: [],
        subjectname: subjectinput,
        studentClass,
        section,
        totalStudent: 0,
        terminal,
        error: "No student data found for the specified criteria."
      });
    }
    
    let result = [];
    
    // Add logging around max parsing
    console.log(`Subject max questions value: ${subjectData.max}, type: ${typeof subjectData.max}`);
    const max = parseInt(subjectData.max) || 0;
    console.log(`Parsed max questions: ${max}`);

    // Process questions
    for (let i = 1; i <= max; i++) {
      try {
        // Try to get the main question first (without subquestions)
        const mainQuestionKey = `q${i}`;
        
        // Check if this question exists in any document
        const questionExists = await model.findOne({
          [mainQuestionKey]: { $exists: true }
        });
        
        if (questionExists) {
          try {
            const analysis = await model.aggregate([
              {
                $facet: {
                  correct: [
                    { $match: { [mainQuestionKey]: "correct", section, terminal, studentClass } },
                    { $count: "count" }
                  ],
                  incorrect: [
                    { $match: { [mainQuestionKey]: "incorrect", section, terminal, studentClass } },
                    { $count: "count" }
                  ],
                  notattempt: [
                    { $match: { [mainQuestionKey]: "notattempt", section, terminal, studentClass } },
                    { $count: "count" }
                  ],
                  correctabove50: [
                    { $match: { [mainQuestionKey]: "correctabove50", section, terminal, studentClass } },
                    { $count: "count" }
                  ],
                  correctbelow50: [
                    { $match: { [mainQuestionKey]: "correctbelow50", section, terminal, studentClass } },
                    { $count: "count" }
                  ]
                }
              },
              {
                $project: {
                  correct: { $ifNull: [{ $arrayElemAt: ["$correct.count", 0] }, 0] },
                  incorrect: { $ifNull: [{ $arrayElemAt: ["$incorrect.count", 0] }, 0] },
                  notattempt: { $ifNull: [{ $arrayElemAt: ["$notattempt.count", 0] }, 0] },
                  correctabove50: { $ifNull: [{ $arrayElemAt: ["$correctabove50.count", 0] }, 0] },
                  correctbelow50: { $ifNull: [{ $arrayElemAt: ["$correctbelow50.count", 0] }, 0] }
                }
              }
            ]);
            
            const hasData = analysis[0].correct > 0 || analysis[0].incorrect > 0 || 
                           analysis[0].notattempt > 0 || analysis[0].correctabove50 > 0 || 
                           analysis[0].correctbelow50 > 0;
                           
            if (hasData) {
              result.push({
                questionNo: mainQuestionKey,
                correct: analysis[0].correct,
                wrong: analysis[0].incorrect,
                notattempt: analysis[0].notattempt,
                correctabove50: analysis[0].correctabove50 || 0,
                correctbelow50: analysis[0].correctbelow50 || 0
              });
              
              console.log(`Added question ${mainQuestionKey} with ${analysis[0].correct} correct, ${analysis[0].incorrect} incorrect`);
            }
          } catch (qErr) {
            console.error(`Error processing main question ${mainQuestionKey}:`, qErr);
          }
        }
        
        // Now handle subquestions
        let n = subjectData[i] || 0;
        if (n <= 0 && i === 1) {
          n = 1; // Ensure we check at least one subquestion for question 1
        }
        
        for (let j = 0; j < n; j++) {
          try {
            const subQuestionKey = `q${i}${String.fromCharCode(97+j)}`;
            
            // Check if this subquestion exists
            const subQuestionExists = await model.findOne({
              [subQuestionKey]: { $exists: true }
            });
            
            if (subQuestionExists) {
              const analysis = await model.aggregate([
                {
                  $facet: {
                    correct: [
                      { $match: { [subQuestionKey]: "correct", section, terminal, studentClass } },
                      { $count: "count" }
                    ],
                    incorrect: [
                      { $match: { [subQuestionKey]: "incorrect", section, terminal, studentClass } },
                      { $count: "count" }
                    ],
                    notattempt: [
                      { $match: { [subQuestionKey]: "notattempt", section, terminal, studentClass } },
                      { $count: "count" }
                    ],
                    correctabove50: [
                      { $match: { [subQuestionKey]: "correctabove50", section, terminal, studentClass } },
                      { $count: "count" }
                    ],
                    correctbelow50: [
                      { $match: { [subQuestionKey]: "correctbelow50", section, terminal, studentClass } },
                      { $count: "count" }
                    ]
                  }
                },
                {
                  $project: {
                    correct: { $ifNull: [{ $arrayElemAt: ["$correct.count", 0] }, 0] },
                    incorrect: { $ifNull: [{ $arrayElemAt: ["$incorrect.count", 0] }, 0] },
                    notattempt: { $ifNull: [{ $arrayElemAt: ["$notattempt.count", 0] }, 0] },
                    correctabove50: { $ifNull: [{ $arrayElemAt: ["$correctabove50.count", 0] }, 0] },
                    correctbelow50: { $ifNull: [{ $arrayElemAt: ["$correctbelow50.count", 0] }, 0] }
                  }
                }
              ]);
              
              const hasData = analysis[0].correct > 0 || analysis[0].incorrect > 0 || 
                             analysis[0].notattempt > 0 || analysis[0].correctabove50 > 0 || 
                             analysis[0].correctbelow50 > 0;
              
              if (hasData) {
                result.push({
                  questionNo: subQuestionKey,
                  correct: analysis[0].correct,
                  wrong: analysis[0].incorrect,
                  notattempt: analysis[0].notattempt,
                  correctabove50: analysis[0].correctabove50 || 0,
                  correctbelow50: analysis[0].correctbelow50 || 0
                });
                
                console.log(`Added subquestion ${subQuestionKey} with ${analysis[0].correct} correct, ${analysis[0].incorrect} incorrect`);
              }
            }
          } catch (sqErr) {
            console.error(`Error processing subquestion for q${i}${String.fromCharCode(97+j)}:`, sqErr);
          }
        }
      } catch (qErr) {
        console.error(`Error processing question ${i}:`, qErr);
      }
    }
    
    // Filter out items with no data to avoid confusion
    result = result.filter(item => 
      item.correct > 0 || item.wrong > 0 || item.notattempt > 0 || 
      item.correctabove50 > 0 || item.correctbelow50 > 0
    );
    
    console.log(`Final result has ${result.length} question items with data`);
    
    if (result.length === 0) {
      console.log(`Warning: No question data found even though there are ${totalStudent} students`);
    }
    
    // Sort results by number of wrong answers (descending)
    result.sort((a, b) => b.wrong - a.wrong);
    
    // Render the analysis view with the data
    console.log(`Rendering analysis view with ${result.length} questions`);
    res.render("analysis", {
      results: result,
      subjectname: subjectinput,
      studentClass,
      section,
      totalStudent,
      terminal
    });
    
  } catch (err) {
    console.error(`Error in findData:`, err);
    res.status(500).render('404', {
      errorMessage: `Error processing data: ${err.message}`,
      currentPage: 'teacher'
    });
  }
};
