// Recalculate totals for a theme object according to indicator obtainedBefore/obtainedAfter
module.exports = {
  computeThemeTotals: function(theme) {
    if (!theme || typeof theme !== 'object') return theme;
    const num = v => Number(v) || 0;

    const los = theme.learningOutcomes || theme.learningOutcome || [];

    let themeTotalBefore = 0;
    let themeTotalAfter = 0;

    theme.learningOutcomes = Array.isArray(los) ? los.map(lo => {
      const newLo = { ...lo };
      let loTotalBefore = 0;
      let loTotalAfter = 0;

      if (Array.isArray(newLo.assessmentAspects)) {
        newLo.assessmentAspects = newLo.assessmentAspects.map(asp => {
          const newAsp = { ...asp };
          let aspTotalBefore = 0;
          let aspTotalAfter = 0;

          if (Array.isArray(newAsp.tools)) {
            newAsp.tools = newAsp.tools.map(tool => {
              const newTool = { ...tool };
              let toolTotalBefore = 0;
              let toolTotalAfter = 0;

              if (Array.isArray(newTool.indicators)) {
                newTool.indicators = newTool.indicators.map(ind => {
                  const newInd = { ...ind };
                  const obtainedBefore = num(newInd.obtainedBefore || newInd.marksBeforeIntervention || newInd.marksBefore);
                  const obtainedAfter = num(newInd.obtainedAfter || newInd.marksAfterIntervention || newInd.marksAfter);
                  newInd.obtainedBefore = obtainedBefore;
                  newInd.obtainedAfter = obtainedAfter;
                  newInd.maxMarks = num(newInd.maxMarks || newInd.indicatorsMarks);

                  toolTotalBefore += obtainedBefore;
                  toolTotalAfter += obtainedAfter;
                  return newInd;
                });
              }

              newTool.totalBefore = toolTotalBefore;
              newTool.totalAfter = toolTotalAfter;

              aspTotalBefore += toolTotalBefore;
              aspTotalAfter += toolTotalAfter;

              return newTool;
            });
          }

          newAsp.assessmentAspectTotalBefore = aspTotalBefore;
          newAsp.assessmentAspectTotalAfter = aspTotalAfter;

          loTotalBefore += aspTotalBefore;
          loTotalAfter += aspTotalAfter;

          return newAsp;
        });
      }

      newLo.totalMarksBeforeIntervention = loTotalBefore;
      newLo.totalMarksAfterIntervention = loTotalAfter;

      themeTotalBefore += loTotalBefore;
      themeTotalAfter += loTotalAfter;

      return newLo;
    }) : [];

    theme.overallTotalBefore = themeTotalBefore;
    theme.overallTotalAfter = themeTotalAfter;

    return theme;
  }
};
