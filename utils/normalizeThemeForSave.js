function normalizeStudentTheme(theme) {
  if (!theme || typeof theme !== 'object') return theme;

  const getFirstMeaningfulValue = (value) => {
    if (Array.isArray(value)) {
      const firstMeaningful = value.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
      return firstMeaningful === undefined ? '' : String(firstMeaningful);
    }
    if (value === undefined || value === null) return '';
    return String(value);
  };

  const t = { ...theme };
  const loKey = t.learningOutcomes || t.learningOutcome || [];
  const normalizedLearningOutcomes = Array.isArray(loKey)
    ? loKey.map((lo, loIndex) => {
        const newLo = { ...lo };

        if (!Array.isArray(newLo.indicators)) newLo.indicators = [];

        if (!Array.isArray(newLo.assessmentAspects) && newLo.assessmentAspects && typeof newLo.assessmentAspects === 'object') {
          newLo.assessmentAspects = [newLo.assessmentAspects];
        }

        if (Array.isArray(newLo.assessmentAspects)) {
          newLo.assessmentAspects = newLo.assessmentAspects.map((asp, aspIndex) => {
            const newAsp = { ...asp };

            if (!Array.isArray(newAsp.tools) && newAsp.tools && typeof newAsp.tools === 'object') {
              newAsp.tools = [newAsp.tools];
            }

            if (Array.isArray(newAsp.tools)) {
              newAsp.tools = newAsp.tools.map((tool, toolIndex) => {
                const newTool = { ...tool };

                if (!Array.isArray(newTool.indicators) && newTool.indicators && typeof newTool.indicators === 'object') {
                  newTool.indicators = [newTool.indicators];
                }

                if (Array.isArray(newTool.indicators)) {
                  newTool.indicators = newTool.indicators.map((ind) => {
                    const newInd = { ...ind };
                    newInd.indicatorName = (newInd.indicatorName || newInd.name || '').toString();
                    newInd.maxMarks = Number(newInd.maxMarks || newInd.indicatorsMarks || 0);
                    newInd.obtainedBefore = Number(newInd.obtainedBefore || newInd.marksBeforeIntervention || 0);
                    newInd.obtainedAfter = Number(newInd.obtainedAfter || newInd.marksAfterIntervention || 0);

                    if (newInd.indicatorsMarks !== undefined) delete newInd.indicatorsMarks;
                    if (newInd.name !== undefined) delete newInd.name;

                    return newInd;
                  }).filter((ind) => {
                    const hasName = (ind.indicatorName || '').toString().trim().length > 0;
                    const hasMax = typeof ind.maxMarks === 'number' && ind.maxMarks >= 0;
                    return hasName || hasMax;
                  });
                } else {
                  newTool.indicators = [];
                }

                newTool.toolName = getFirstMeaningfulValue(newTool.toolName || newTool.name).trim() || `Tool ${toolIndex + 1}`;
                newTool.evaluationDateBefore = newTool.evaluationDateBefore || newLo.evaluationDateBefore || '';
                newTool.evaluationDateAfter = newTool.evaluationDateAfter || newLo.evaluationDateAfter || '';
                newTool.totalBefore = Number(newTool.totalBefore || 0);
                newTool.totalAfter = Number(newTool.totalAfter || 0);

                if (newTool.name !== undefined) delete newTool.name;

                return newTool;
              }).filter((tool) => {
                const hasName = (tool.toolName || '').toString().trim().length > 0;
                const hasIndicators = Array.isArray(tool.indicators) && tool.indicators.length > 0;
                return hasName || hasIndicators;
              });
            } else {
              newAsp.tools = [];
            }

            newAsp.aspectName = getFirstMeaningfulValue(newAsp.aspectName || newAsp.name).trim() || `Assessment Aspect ${aspIndex + 1}`;
            if (newAsp.name !== undefined) delete newAsp.name;

            return newAsp;
          });
        } else {
          newLo.assessmentAspects = [];
        }

        newLo.name = getFirstMeaningfulValue(newLo.name || newLo.learningOutcomeName).trim() || `Learning Outcome ${loIndex + 1}`;
        newLo.totalMarksBeforeIntervention = Number(newLo.totalMarksBeforeIntervention || 0);
        newLo.totalMarksAfterIntervention = Number(newLo.totalMarksAfterIntervention || 0);

        if (newLo.learningOutcomeName !== undefined) delete newLo.learningOutcomeName;

        return newLo;
      })
    : [];

  t.learningOutcomes = normalizedLearningOutcomes.filter((lo) => {
    const hasName = (lo.name || '').toString().trim().length > 0;
    const hasAspects = Array.isArray(lo.assessmentAspects) && lo.assessmentAspects.length > 0;
    return hasName || hasAspects;
  });

  t.themeName = getFirstMeaningfulValue(t.themeName).trim() || 'Untitled Theme';
  t.overallTotalBefore = Number(t.overallTotalBefore || 0);
  t.overallTotalAfter = Number(t.overallTotalAfter || 0);

  return t;
}

module.exports = { normalizeStudentTheme };
