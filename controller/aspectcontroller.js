const AspectContainer = require('../model/aspectcontainerschema');

exports.addAspectForm = async (req, res) => {
  try {
    const studentClass = req.query.studentClass || '';
    const subject = req.query.subject || '';

    // Try to load existing AspectContainer for edit mode
    // filter only by class + subject (section removed)
    const filter = { studentClass: String(studentClass), subject: String(subject) };
    const existingData = await AspectContainer.findOne(filter).lean();

    res.render('theme/aspectform', { studentClass, subject, existingData });
  } catch (err) {
    console.error('Error rendering aspect form', err);
    res.status(500).send('Error');
  }
};

exports.saveAspect = async (req, res) => {
  try {
    const payload = req.body || {};
    const studentClass = payload.studentClass || '';
    const subject = payload.subject || '';
    // section removed from payload
    const credit = payload.credit || 0;
    const aspects = Array.isArray(payload.aspects) ? payload.aspects : (payload.aspects ? Object.values(payload.aspects) : []);

    // Normalize and recompute totals authoritative on server
    const safeAspects = (Array.isArray(aspects) ? aspects : []).map(a => (a && typeof a === 'object') ? a : { aspectName: '', tools: [] });
    safeAspects.forEach(aspect => {
      if (!Array.isArray(aspect.tools)) aspect.tools = [];
      let aspectTotal = 0;
      aspect.tools.forEach(tool => {
        if (!Array.isArray(tool.indicators)) tool.indicators = [];
        let toolMax = 0;
        tool.indicators.forEach(ind => {
          const maxMarks = Number(ind.maxMarks) || 0;
          toolMax += maxMarks;
        });
        tool.totalMax = toolMax;
        aspectTotal += toolMax;
      });
      aspect.totalMarks = aspectTotal;
    });

    // Upsert by studentClass + subject (section removed)
    const filter = { studentClass: String(studentClass), subject: String(subject) };
    const update = { $set: { credit: credit, aspects: safeAspects, updatedAt: Date.now() } };
    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };

    const saved = await AspectContainer.findOneAndUpdate(filter, update, opts);

    res.json({ success: true, id: saved._id });
  } catch (err) {
    console.error('Error saving aspect container', err);
    res.json({ success: false, message: err.message });
  }
};

exports.getAspect = async (req, res) => {
  try {
    const studentClass = req.query.studentClass || req.query.class || '';
    const subject = req.query.subject || '';
    if (!studentClass || !subject) return res.json({ success: false, message: 'missing params' });
    const filter = { studentClass: String(studentClass), subject: String(subject) };
    const existing = await AspectContainer.findOne(filter).lean();
    if (!existing) return res.json({ success: true, aspects: [] });
    return res.json({ success: true, aspects: existing.aspects || [] });
  } catch (err) {
    console.error('Error fetching aspect container', err);
    res.json({ success: false, message: err.message });
  }
};
