const path = require("path");
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const bs = require("bikram-sambat-js")
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const { rootDir } = require("../utils/path");

const { classSchema, subjectSchema, terminalSchema,newsubjectSchema } = require("../model/adminschema");
const { adminSchema,superadminSchema, teacherSchema} = require("../model/admin");
const { studentSchema } = require("../model/schema");
const student = require("../routers/mainpage");
const terminal = mongoose.model("terminal", terminalSchema, "terminal");
const newsubject = mongoose.model("newsubject", newsubjectSchema, "newsubject");
const userlist = mongoose.model("userlist", teacherSchema, "users");
 const { studentrecordschema } = require("../model/adminschema");
const modal = mongoose.model("studentrecord", studentrecordschema, "studentrecord");
const bcrypt = require("bcrypt");
const {allowedSubjectData} = require("./controller");
const {generateToken} = require("../middleware/auth");
const {newsschema} = require("../model/newsschema");
const newsModel = mongoose.model("news", newsschema, "news");
app.set("view engine", "ejs");
app.set("view", path.join(rootDir, "views"));

const subjectlist = mongoose.model("subjectlist", subjectSchema, "subjectlist");
const studentClass = mongoose.model("studentClass", classSchema, "classlist");
const studentRecord = mongoose.model("studentRecord", studentrecordschema, "studentrecord");

const multer = require('multer')
const fs = require('fs')

// Configure storage with better file naming

// Helper function to fetch sidenav data
const getSidenavData = async (req) => {
  try {
    const subjects = await newsubject.find({}).lean();
  
    const studentClassdata = await studentClass.find({}).lean();
    const terminals = await terminal.find({}).lean();
    
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
        accessibleSubject = subjects;
        accessibleClass = studentClassdata;
      } else {
        // Filter subjects based on user's allowed subjects
        accessibleSubject = subjects.filter(subj =>
          user.allowedSubjects && user.allowedSubjects.some(allowed =>
            allowed.subject === subj.newsubject && allowed.studentClass === subj.forClass
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
      accessibleSubject = subjects;
      accessibleClass = studentClassdata;
    }
    return {
      subjects: accessibleSubject,
      studentClassdata: accessibleClass,
      terminals
    };
  } catch (error) {
    console.error('Error fetching sidenav data:', error);
    return {
      subjects: [],
      studentClassdata: [],
      terminals: []
    };
  }
};

exports.newsadmin = async (req, res) => {
  try {
    const sidenavData = await getSidenavData(req);
    const news = await newsModel.find().sort({ date: -1 }).lean();

    res.render("news/newsadmin", {
      pageTitle: "News Admin",
      sidenavData,
      news,
      user: req.user,
      editing: false,
      newsItem: null
    });
  } catch (error) { 
    console.error("Error rendering news admin page:", error);
    res.status(500).send("Internal Server Error");
  }
}
exports.savenewspost = async (req, res) => {
  try {
    const { headline, content, date } = req.body;

    // Access files from req.files (since we used upload.fields)
    const image1Url = req.files['image1'] ? `/uploads/${req.files['image1'][0].filename}` : null;
    const image2Url = req.files['image2'] ? `/uploads/${req.files['image2'][0].filename}` : null;
    const galleryUrls = req.files['gallery']
      ? req.files['gallery'].map(file => `/uploads/${file.filename}`)
      : [];

    const newPost = new newsModel({
      headline,
      content,
      date,
      image1Url,
      image2Url,
      gallery: galleryUrls
    });

    await newPost.save();

    res.redirect('/newsadmin'); // or res.json({ success: true, newPost });
  } catch (error) {
    console.error("Error saving news post:", error);
    res.status(500).send("Internal Server Error");
  }
};
exports.getNewsJson = async (req, res) => {
  try {
    const newsPosts = await newsModel.find().sort({ date: -1 }).lean();
    res.json(newsPosts);
  } catch (err) {
    console.error("Error fetching news:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getNewsPage = async (req, res) => {
  try {
    const newsId = req.query.newsId;
    
    if (!newsId) {
      return res.status(400).send("News ID is required");
    }

    const newsItem = await newsModel.findById(newsId).lean();
    
    if (!newsItem) {
      return res.status(404).send("News not found");
    }

    // Clean content for meta description
    const cleanContent = newsItem.content.replace(/<[^>]+>/g, '').substring(0, 160);
    
    res.render("news/newsdescription", {
      pageTitle: newsItem.headline,
      newsItem,
      cleanContent,
      baseUrl: `${req.protocol}://${req.get('host')}`
    });
  } catch (err) {
    console.error("Error fetching news:", err);
    res.status(500).send("Internal Server Error");
  }
};

exports.deleteNews = async (req, res) => {
  try {
    const newsId = req.params.id;
    const deletedNews = await newsModel.findByIdAndDelete(newsId);
    if (!deletedNews) {
      return res.status(404).json({ error: "News not found" });
    }
    // Optionally delete the associated image files
    if (deletedNews.image1Url) {
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(rootDir, 'uploads', path.basename(deletedNews.image1Url));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    if (deletedNews.image2Url) {
      const fs = require('fs');
      const path = require('path');
      const imagePath = path.join(rootDir, 'uploads', path.basename(deletedNews.image2Url));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    // Respond with JSON for AJAX delete
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error deleting news:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
exports.editNewsPage = async (req, res) => {
  try {
    const newsId = req.query.newsId;
    if (!newsId) {
      return res.redirect('/newsadmin');
    }
    
    const newsItem = await newsModel.findById(newsId).lean();
    if (!newsItem) {
      return res.status(404).send("News not found");
    }
    
    const sidenavData = await getSidenavData(req);
    const news = await newsModel.find().sort({ date: -1 }).lean();
    
    res.render("news/newsadmin", {
      pageTitle: "Edit News",
      sidenavData,
      news,
      newsItem,
      user: req.user,
      editing: true
    });
  } catch (err) {
    console.error("Error fetching news for edit:", err);
    res.status(500).send("Internal Server Error");
  }
};

exports.updateNews = async (req, res) => {
  try {
    const newsId = req.body.newsId;
    if (!newsId) {
      return res.status(400).send("News ID is required");
    }

    const { headline, content } = req.body;
    
    // Find the existing news item
    const existingNews = await newsModel.findById(newsId);
    if (!existingNews) {
      return res.status(404).send("News not found");
    }

    // Update fields
    existingNews.headline = headline;
    existingNews.content = content;
    
    // Handle image updates
    if (req.files && req.files['image1']) {
      // Delete old image if exists
      if (existingNews.image1Url) {
        const oldImagePath = path.join(rootDir, 'uploads', path.basename(existingNews.image1Url));
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      existingNews.image1Url = `/uploads/${req.files['image1'][0].filename}`;
    }
    
    if (req.files && req.files['image2']) {
      // Delete old image if exists
      if (existingNews.image2Url) {
        const oldImagePath = path.join(rootDir, 'uploads', path.basename(existingNews.image2Url));
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      existingNews.image2Url = `/uploads/${req.files['image2'][0].filename}`;
    }

    await existingNews.save();
    res.redirect('/newsadmin');
  } catch (err) {
    console.error("Error updating news:", err);
    res.status(500).send("Internal Server Error");
  }
};