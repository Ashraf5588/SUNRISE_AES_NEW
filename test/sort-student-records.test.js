const test = require('node:test');
const assert = require('node:assert');

const CLASS_ORDER = {
  nursery: 1, lkg: 2, ukg: 3, one: 4, two: 5, three: 6,
  four: 7, five: 8, six: 9, seven: 10, eight: 11, nine: 12, ten: 13
};

const normalizeClassName = (value) => {
  let raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  raw = raw.replace(/^class\s+/i, '').replace(/\s+section$/i, '').trim();
  raw = raw.replace(/^nurser$/i, 'nursery').replace(/^nursary$/i, 'nursery');
  const lower = raw.toLowerCase();
  const numberWordMap = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten' };
  if (numberWordMap[lower]) raw = numberWordMap[lower];
  if (lower === 'lkg') return 'LKG';
  if (lower === 'ukg') return 'UKG';
  return raw.split(' ').map(w => {
    const l = w.toLowerCase();
    if (l === 'lkg') return 'LKG';
    if (l === 'ukg') return 'UKG';
    return l.charAt(0).toUpperCase() + l.slice(1);
  }).join(' ');
};

const classSortWeight = (className) => {
  const raw = String(className || '').trim();
  if (!raw) return 9999;
  const lower = raw.toLowerCase();
  for (const token of lower.split(/\s+/)) {
    if (Object.prototype.hasOwnProperty.call(CLASS_ORDER, token)) return CLASS_ORDER[token];
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return 100 + numeric;
  return 9000;
};

const sortStudentRecords = (records, classList = []) => {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const normalizeKey = (val) => String(val || '').trim().toLowerCase();
  const classOrderMap = new Map();
  const sectionSequenceMap = new Map();

  (classList || []).forEach((item, index) => {
    const rawClass = normalizeKey(item.studentClass);
    const normClass = normalizeClassName(item.studentClass).toLowerCase();
    const rawSection = String(item.section || '').trim().toUpperCase();
    const orderNum = item.classorder !== null && item.classorder !== undefined && item.classorder !== ''
      ? Number(item.classorder)
      : NaN;
    const hasOrder = Number.isFinite(orderNum);

    [rawClass, normClass].filter(Boolean).forEach((clsKey) => {
      if (hasOrder) {
        if (!classOrderMap.has(clsKey) || orderNum < classOrderMap.get(clsKey)) {
          classOrderMap.set(clsKey, orderNum);
        }
      }
      if (rawSection) {
        const secKey = `${clsKey}__${rawSection}`;
        if (!sectionSequenceMap.has(secKey)) {
          sectionSequenceMap.set(secKey, index);
        }
      }
    });
  });

  const getStudentClassWeight = (cls) => {
    const norm = normalizeClassName(cls).toLowerCase();
    const raw = normalizeKey(cls);
    if (classOrderMap.has(norm)) return classOrderMap.get(norm);
    if (classOrderMap.has(raw)) return classOrderMap.get(raw);
    return 10000 + classSortWeight(norm || raw);
  };

  const parseRoll = (val) => {
    if (val === null || val === undefined || String(val).trim() === '') {
      return { num: Infinity, str: '' };
    }
    const str = String(val).trim();
    const num = Number.parseInt(str.replace(/[^\d-]/g, ''), 10);
    return { num: Number.isFinite(num) ? num : Infinity, str };
  };

  return [...records].sort((a, b) => {
    const weightA = getStudentClassWeight(a.studentClass);
    const weightB = getStudentClassWeight(b.studentClass);
    if (weightA !== weightB) {
      return weightA - weightB;
    }

    const classCmp = normalizeClassName(a.studentClass).localeCompare(
      normalizeClassName(b.studentClass),
      undefined,
      { numeric: true, sensitivity: 'base' }
    );
    if (classCmp !== 0) {
      return classCmp;
    }

    const secA = String(a.section || '').trim().toUpperCase();
    const secB = String(b.section || '').trim().toUpperCase();
    if (secA !== secB) {
      const normClass = normalizeClassName(a.studentClass).toLowerCase();
      const seqA = sectionSequenceMap.get(`${normClass}__${secA}`);
      const seqB = sectionSequenceMap.get(`${normClass}__${secB}`);
      if (seqA !== undefined && seqB !== undefined && seqA !== seqB) {
        return seqA - seqB;
      }
      if (seqA !== undefined && seqB === undefined) return -1;
      if (seqA === undefined && seqB !== undefined) return 1;
      return secA.localeCompare(secB, undefined, { numeric: true, sensitivity: 'base' });
    }

    const rollA = parseRoll(a.roll);
    const rollB = parseRoll(b.roll);
    if (rollA.num !== rollB.num) {
      return rollA.num - rollB.num;
    }
    const rollStrCmp = rollA.str.localeCompare(rollB.str, undefined, { numeric: true });
    if (rollStrCmp !== 0) {
      return rollStrCmp;
    }

    const nameCmp = String(a.name || '').trim().localeCompare(
      String(b.name || '').trim(),
      undefined,
      { sensitivity: 'base' }
    );
    if (nameCmp !== 0) {
      return nameCmp;
    }

    return String(a.reg || '').trim().localeCompare(
      String(b.reg || '').trim(),
      undefined,
      { numeric: true, sensitivity: 'base' }
    );
  });
};

test('sorts students by classorder, groups same section together, then next section, sorted by roll', () => {
  const classList = [
    { studentClass: 'Nursery', section: 'A', classorder: 1 },
    { studentClass: '1', section: 'A', classorder: 2 },
    { studentClass: '1', section: 'B', classorder: 2 },
    { studentClass: '2', section: 'A', classorder: 3 },
  ];

  // Raw array simulates insertion order where newly added student is at the bottom
  const rawStudents = [
    { name: 'David', studentClass: '2', section: 'A', roll: 1 },
    { name: 'Charlie', studentClass: '1', section: 'B', roll: 1 },
    { name: 'Bob', studentClass: '1', section: 'A', roll: 2 },
    { name: 'Alice', studentClass: '1', section: 'A', roll: 1 },
    { name: 'Nancy', studentClass: 'Nursery', section: 'A', roll: 1 },
    { name: 'Newly Added Student', studentClass: '1', section: 'A', roll: 3 },
    { name: 'Section B Student 2', studentClass: '1', section: 'B', roll: 2 }
  ];

  const sorted = sortStudentRecords(rawStudents, classList);
  const names = sorted.map(s => s.name);

  assert.deepStrictEqual(names, [
    'Nancy',                // Nursery A Roll 1
    'Alice',                // Class 1 Section A Roll 1
    'Bob',                  // Class 1 Section A Roll 2
    'Newly Added Student',  // Class 1 Section A Roll 3 (in Section A, before Section B!)
    'Charlie',              // Class 1 Section B Roll 1
    'Section B Student 2',  // Class 1 Section B Roll 2
    'David'                 // Class 2 Section A Roll 1
  ]);
});

test('handles numeric roll sorting (roll 2 before roll 10)', () => {
  const classList = [{ studentClass: '1', section: 'A', classorder: 1 }];
  const students = [
    { name: 'Roll 10', studentClass: '1', section: 'A', roll: '10' },
    { name: 'Roll 2', studentClass: '1', section: 'A', roll: '2' },
    { name: 'Roll 1', studentClass: '1', section: 'A', roll: '1' }
  ];
  const sorted = sortStudentRecords(students, classList);
  assert.deepStrictEqual(sorted.map(s => s.name), ['Roll 1', 'Roll 2', 'Roll 10']);
});

