const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStudentTheme } = require('../utils/normalizeThemeForSave');

test('normalizes blank learning outcome and aspect names to safe fallbacks', () => {
  const input = {
    themeName: ['', ''],
    learningOutcomes: [
      {
        name: '',
        assessmentAspects: [
          {
            aspectName: '',
            tools: [
              {
                toolName: '',
                indicators: [{ indicatorName: '', maxMarks: 2 }]
              }
            ]
          }
        ]
      }
    ],
    overallTotalBefore: '',
    overallTotalAfter: ''
  };

  const result = normalizeStudentTheme(input);

  assert.equal(result.themeName, 'Untitled Theme');
  assert.equal(result.learningOutcomes[0].name, 'Learning Outcome 1');
  assert.equal(result.learningOutcomes[0].assessmentAspects[0].aspectName, 'Assessment Aspect 1');
  assert.equal(result.learningOutcomes[0].assessmentAspects[0].tools[0].toolName, 'Tool 1');
});
