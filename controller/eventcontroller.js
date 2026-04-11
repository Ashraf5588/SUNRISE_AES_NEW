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
           events = await Event.find().sort({ date: 1 }).lean();
      } else {
           events = await Event.find({ teacherName: req.user.teacherName }).sort({ date: 1 }).lean();
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
  const { id, title, subject, description, date, time, forClass, section, teacherName, location } = req.body;
    
    try {
        if (id) {
            // Update existing event
            await Event.findByIdAndUpdate(id, {
                title,
        subject,
                description,
                date,
                time,
                forClass, // Note: Schema has forClass, make sure this matches what is sent
                section, // Schema doesn't have section explicitly in previous read but let's check
                teacherName, // Usually shouldn't change, but if admin edits..
                location
            });
             res.redirect('/createevent');
        } else {
            // Create new event
            const event = new Event({
                title,
              subject,
                description,
                date,
                time,
                teacherName,
                forClass, // Ensure this combines class and section if needed or stored as is
                location,
            });
            await event.save();
            res.redirect('/createevent');
            
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
const sendReminderEmail = async (to, title, description, date, time, location, forClass, subject, teacherName) => {
  const mailOptions = {
    from: process.env.user,
    to: to,
    subject: `Reminder: ${title}`,
      html: `
    <h2>Reminder: ${title}</h2>
    <p><b>Time:</b> ${time}</p>
    <p><b>Location:</b> ${location}</p>
    <p><b>Class:</b> ${forClass}</p>
    <p><b>Subject:</b> ${subject}</p>
    <p><b>Description:</b> ${description}</p>
    <hr>
    <p>Sent by: ${teacherName}</p>
  `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent");
  } catch (err) {
    console.log(err);
  }
};

const checkEventReminders = async () => {
  try {
    const emailtoSend = ["ashrafalimiya77@gmail.com","admin@msrebs.edu.np"]
 
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    

    const upcomingEvents = await Event.find();
     // Events in the next 7 days
    for (const event of upcomingEvents) {
       const eventDate = new Date(event.date);
       eventDate.setHours(0, 0, 0, 0);
      const diffTime = eventDate - today;
const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays === 7 && !event.reminder7Sent) {
        await sendReminderPush(event.title);
        await sendReminderEmail(emailtoSend, event.title, event.description, event.date.toDateString(), event.time, event.location, event.forClass, event.subject, event.teacherName);
        event.reminder7Sent = true;
        await event.save();
        
      }
       if (diffDays === 1 && !event.reminder1Sent) {
        await sendReminderPush(event.title);
        await sendReminderEmail(
          emailtoSend,
          event.title,
          event.description,
          event.date.toDateString(),
          event.time,
          event.location,
          event.forClass,
          event.subject,
          event.teacherName
        );

        event.reminder1Sent = true;
        await event.save();
      }
    }

    
    
  } catch (err) {
    console.error("Error checking event reminders:", err);
  }
};
cron.schedule("0 7 * * *", async () => {
  console.log("Running reminder job...");
  await checkEventReminders();
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

