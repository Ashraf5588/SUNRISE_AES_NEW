const getMinutes = value => {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const classifyPunchesByMidTime = (punches, midTime) => {
    const midTimeMinutes = getMinutes(midTime);
    const sortedPunches = [...punches].sort((first, second) => new Date(first.punchTime) - new Date(second.punchTime));
    let checkIn = null;
    let checkOut = null;

    sortedPunches.forEach(punch => {
        const punchTime = new Date(punch.punchTime);
        if (Number.isNaN(punchTime.getTime()) || midTimeMinutes === null) return;
        const punchMinutes = punchTime.getHours() * 60 + punchTime.getMinutes();

        if (punchMinutes < midTimeMinutes) {
            if (!checkIn) checkIn = punch;
        } else if (!checkOut) {
            checkOut = punch;
        }
    });

    return { checkIn, checkOut };
};

module.exports = { classifyPunchesByMidTime };