const mongoose = require('mongoose');
const Event = require('../model/eventmodel');

const nodemailer = require("nodemailer");
const cron = require("node-cron");
const { adminSchema,superadminSchema, teacherSchema} = require("../model/admin");

const Users = mongoose.model("userlist", teacherSchema, "users");
const admin = require(".././firebase");

const { classSchema, subjectSchema, terminalSchema,newsubjectSchema} = require("../model/adminschema");
const { marksheetsetupschemaForAdmin } = require("../model/marksheetschema");
const marksheetSetup = mongoose.model("marksheetSetup", marksheetsetupschemaForAdmin, "marksheetSetup");
const { name } = require("ejs");
const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");

const getSidenavData = async (req) => {
  try {
    const subjects = await subjectlist.find({}).lean();
   
    const studentClassdata = await studentClass.find({}).lean();
    const newsubjects = await newsubject.find({}).lean();
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
        accessibleSubject = newsubjects;
        accessibleClass = studentClassdata;
      } else {
        // Filter subjects based on user's allowed subjects
        accessibleSubject = newsubjects.filter(subj =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.subject === subj.newsubject
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
      accessibleSubject = newsubjects;
      accessibleClass = studentClassdata;
    }
    
    return {
      subjects: accessibleSubject,
      studentClassdata: accessibleClass,
      
    };
  } catch (error) {
    console.error('Error fetching sidenav data:', error);
    return {
      subjects: [],
      studentClassdata: [],
     
    };
  }
};
// Show the form to create a new event
exports.createEventForm = async (req, res) => {
  const sidenavData = await getSidenavData(req);
  let events = [];
  let editEvent = null;
  try {
       if (req.user.role === 'ADMIN') {
         events = await Event.find().sort({ date: -1 }).lean();
       } else {
         events = await Event.find({ teacherName: req.user.teacherName }).sort({ date: -1 }).lean();
       }

      const editEventId = req.query.id || req.params.id;
      if (editEventId) {
        const eventRecord = await Event.findById(editEventId).lean();
        if (eventRecord) {
          if (req.user.role === 'ADMIN' || eventRecord.teacherName === req.user.teacherName) {
            editEvent = eventRecord;
          }
        }
      }
  } catch (err) {
      console.error("Error fetching events:", err);
  }

  res.render('eventsremainder/createevent', { sidenavData, teacherName: req.user.teacherName, events, editEvent }); // Render the form view
};

// Start or Update event
exports.saveEvent = async (req, res) => {
  const { id, title, subject, description, date, time, forClass, section, teacherName, location, material, nepaliDate } = req.body;
  const classList = Array.isArray(forClass)
    ? forClass.map((item) => String(item || '').trim()).filter(Boolean)
    : [String(forClass || '').trim()].filter(Boolean);
  const formatTo12Hour = (value) => {
    const match = String(value || '').match(/^([01][0-9]|2[0-3]):([0-5][0-9])$/);
    if (!match) return String(value || '').trim();
    const hoursNum = Number(match[1]);
    const minutes = match[2];
    const period = hoursNum >= 12 ? 'PM' : 'AM';
    const hours12 = hoursNum % 12 || 12;
    return `${hours12}:${minutes}${period}`;
  };
  
  const computeNepaliDate = (englishDate) => {
    try {
      if (!englishDate || typeof bs === 'undefined') {
        return '';
      }
      const d = new Date(englishDate);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const englishDateStr = `${year}-${month}-${day}`;
      const nepaliResult = bs.ADToBS(englishDateStr);
      return nepaliResult ? String(nepaliResult).trim() : '';
    } catch (error) {
      console.error('Error computing Nepali date:', error);
      return '';
    }
  };
  
  const formattedTime = formatTo12Hour(time);
  const computedNepaliDate = nepaliDate || computeNepaliDate(date);
  
  try {
    if (id) {
      // Update existing event
      await Event.findByIdAndUpdate(id, {
        title,
        subject,
        description,
        date,
        time: formattedTime,
        forClass: classList,
        section,
        teacherName,
        location,
        material,
        nepaliDate: computedNepaliDate
      });
      res.redirect('/createevent?saved=1');
    } else {
      // Create new event
      const event = new Event({
        title,
        subject,
        description,
        date,
        time: formattedTime,
        teacherName,
        forClass: classList,
        location,
        material,
        nepaliDate: computedNepaliDate
      });
      await event.save();
      res.redirect('/createevent?saved=1');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.deleteEvent = async (req, res) => {
    try {
        await Event.findByIdAndDelete(req.params.id);
        res.redirect('/createevent');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};


// List all events
exports.listEvents = (req, res) => {
    Event.find()
        .then(events => {
            res.render('createevent', { events }); // Render the events list view
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Server Error');
        });
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.user,
    pass: process.env.pass 
  }
});
const formatEventDate = (value) => {
  if (!value) {
    return '';
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const sendReminderEmail = async (to, title, description, date, time, location, forClass, teacherName, daysBefore) => {
  let label = '';
  let urgency = '';
  
  if (daysBefore === 7) {
    label = '7-day reminder';
    urgency = 'upcoming';
  } else if (daysBefore === 1) {
    label = '1-day reminder';
    urgency = 'tomorrow';
  } else if (daysBefore === 0) {
    label = 'TODAY - Event happening now!';
    urgency = 'today';
  }
  
  const formattedDate = formatEventDate(date) || String(date || '').trim();
  const classLabel = Array.isArray(forClass) ? forClass.join(', ') : String(forClass || '').trim();

  const mailOptions = {
    from: process.env.user,
    to: to,
    subject: `Event reminder (${label}): ${title}`,
    html: `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2933;">
      <h2 style="margin:0 0 8px; color: ${daysBefore === 0 ? '#dc2626' : '#1f2933'};">
        ${daysBefore === 0 ? '🔔 TODAY - ' : '📅 '}Event reminder
      </h2>
      <p style="margin:0 0 16px;">
        This is your <strong>${label}</strong> for the event below.
      </p>
      <table style="border-collapse:collapse; width:100%;">
        <tr style="background: ${daysBefore === 0 ? '#fee2e2' : '#f9fafb'};">
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Event</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${title}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Date</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${formattedDate}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Time</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${time || '-'}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Location</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${location || '-'}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Class</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${classLabel || '-'}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Teacher</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${teacherName || '-'}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:8px 12px; font-weight:bold; border:1px solid #e5e7eb;"><b>Description</b></td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${description || '-'}</td>
        </tr>
      </table>
      <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />
      <p style="margin:0;color:#6b7280;font-size:0.9em;">
        This is an automated ${label} from the school system. 
        ${daysBefore === 0 ? '⏰ The event is happening TODAY!' : ''}
      </p>
    </div>
  `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ ${label} email sent to: ${to.join(', ')}`);
  } catch (err) {
    console.error(`❌ Failed to send ${label} email:`, err);
  }
};

const checkEventReminders = async () => {
  try {
    const emailtoSend = ["ashrafalimiya77@gmail.com","rehanmiya977@gmail.com","axeldhungana123@gmail.com","unitedecd@gmail.com"];
 
    const now = new Date();
    
    // Get current Kathmandu time and hour
    const getKathmanduDateTime = (value) => {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        return { dateKey: '', hour: -1 };
      }

      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kathmandu',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
      }).formatToParts(date);
      
      const year = parts.find((part) => part.type === 'year')?.value;
      const month = parts.find((part) => part.type === 'month')?.value;
      const day = parts.find((part) => part.type === 'day')?.value;
      const hour = parts.find((part) => part.type === 'hour')?.value;
      
      if (!year || !month || !day || hour === undefined) {
        return { dateKey: '', hour: -1 };
      }

      return {
        dateKey: `${year}-${month}-${day}`,
        hour: Number(hour)
      };
    };

    const dateKeyToUtc = (key) => {
      const [year, month, day] = String(key || '').split('-').map((part) => Number(part));
      if (!year || !month || !day) {
        return null;
      }
      return Date.UTC(year, month - 1, day);
    };

    const currentTime = getKathmanduDateTime(now);
    const currentDateKey = currentTime.dateKey;
    const currentHour = currentTime.hour;
    const currentDateUtc = dateKeyToUtc(currentDateKey);

    console.log(`⏰ Checking reminders at ${currentDateKey} ${currentHour}:00 Kathmandu time`);

    const upcomingEvents = await Event.find();
    
    for (const event of upcomingEvents) {
      const eventDate = new Date(event.date);
      const eventDateKey = getKathmanduDateTime(eventDate).dateKey;
      const eventDateUtc = dateKeyToUtc(eventDateKey);
      
      if (!eventDateKey || eventDateUtc === null || currentDateUtc === null) {
        continue;
      }

      const diffDays = Math.round((eventDateUtc - currentDateUtc) / (1000 * 60 * 60 * 24));
      
      // 7-day reminder logic
      if (diffDays === 7) {
        // Send if not sent in this hour yet
        if (event.reminder7SentHour !== currentHour) {
          console.log(`📧 Sending 7-day reminder for "${event.title}" (Day: ${diffDays}, Hour: ${currentHour})`);
          await sendReminderEmail(
            emailtoSend,
            event.title,
            event.description,
            event.date,
            event.time,
            event.location,
            event.forClass,
            event.teacherName,
            7
          );
          event.reminder7SentHour = currentHour;
          event.reminder7SentDate = currentDateKey; // Keep for backward compatibility
          event.reminder7Sent = true;
          await event.save();
          console.log(`✅ 7-day reminder sent for: ${event.title}`);
        } else {
          console.log(`⏭️ 7-day reminder already sent for "${event.title}" in hour ${currentHour}`);
        }
      }

      // 1-day and same-day reminder logic
      const isOneDayBefore = diffDays === 1;
      const isSameDay = diffDays === 0;
      
      if (isOneDayBefore || isSameDay) {
        const reminderType = isOneDayBefore ? '1-day' : 'same-day';
        const reminderHourField = isOneDayBefore ? 'reminder1SentHour' : 'reminder0SentHour';
        
        // Send if not sent in this hour yet
        if (event[reminderHourField] !== currentHour) {
          console.log(`📧 Sending ${reminderType} reminder for "${event.title}" (Day: ${diffDays}, Hour: ${currentHour})`);
          
          // Send push notification
          await sendReminderPush(event.title);
          
          // Send email
          await sendReminderEmail(
            emailtoSend,
            event.title,
            event.description,
            event.date,
            event.time,
            event.location,
            event.forClass,
            event.teacherName,
            isOneDayBefore ? 1 : 0
          );
          
          event[reminderHourField] = currentHour;
          
          if (isOneDayBefore) {
            event.reminder1SentDate = currentDateKey;
            event.reminder1Sent = true;
          }
          
          await event.save();
          console.log(`✅ ${reminderType} reminder sent for: ${event.title}`);
        } else {
          console.log(`⏭️ ${reminderType} reminder already sent for "${event.title}" in hour ${currentHour}`);
        }
      }
    }

    console.log(`✔️ Reminder check completed at ${currentDateKey} ${currentHour}:00`);
    
  } catch (err) {
    console.error("❌ Error checking event reminders:", err);
  }
};
// Schedule reminder checks at 7 AM, 9 AM, 11 AM, 1 PM, 3 PM, 5 PM, 7 PM, 9 PM, 11 PM
const reminderHours = [7, 9, 11, 13, 15, 17, 19, 21, 23];

reminderHours.forEach((hour) => {
  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log(`Running reminder job at ${hour}:00 Kathmandu time...`);
    await checkEventReminders();
  });
});





exports.saveFcmToken = async (req, res) => {

  try {
    const { token } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!token) {
      return res.status(400).json({ message: "FCM token is required" });
    }

    const userId = req.user._id;

    await Users.findByIdAndUpdate(userId, {
      $addToSet: { fcmTokens: token }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};


const sendPushNotification = async (tokens, title, body) => {
  try {
    const message = {
      notification: {
        title: title,
        body: body
      },
      tokens: tokens // array of FCM tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log("✅ Success:", response.successCount);
console.log("❌ Failure:", response.failureCount);
console.log("✅ Success:", response.successCount);
console.log("❌ Failure:", response.failureCount);

response.responses.forEach((res, index) => {
  if (!res.success) {
    console.log("❌ Token error:", tokens[index]);
    console.log("👉 Reason:", res.error);
  }
});
  
  } catch (error) {
    console.error("Push error:", error);
  }
};
const sendReminderPush = async (title) => {
  const users = await Users.find({ fcmTokens: { $exists: true,$ne: [] } });
  const tokens = users.map(u => u.fcmTokens).flat() || [];
console.log("Tokens to send push:", tokens);
console.log("Sending push for event:", title);
  await sendPushNotification(
    tokens,
    "Upcoming Event Reminder",
    `Don't forget about the upcoming event: ${title}`
  );
  
};

