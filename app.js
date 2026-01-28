const express = require('express');
const student  = require('./routers/mainpage');
const attendance  = require('./routers/attendance');
const fs = require('fs');
const admincontrol = require('./controller/admincontroller')

const app = express();
const {verifytoken} = require('./middleware/auth');
const cors = require("cors");

app.use(cors({
  origin: [
    'https://uebschool.edu.np',   // production site
    'http://127.0.0.1:5500',      // local test
    'http://localhost:5500'       // another common local URL
  ]
}));
const connection = require('./config/connection')
// Serve static files from 'uploads' folder
// app.use('/uploads', express.static(__dirname + '/uploads'));
const path = require('path')
 // Apply token verification middleware globally
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath, stat) => {
    const fileName = path.basename(filePath);
    const req = res.req; // Get the request object
    
    // Ensure PDFs are ALWAYS served inline, NEVER as download
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      
      // FORCE INLINE - Remove any potential download triggers
      // explicit inline header to prevent download
      res.setHeader('Content-Disposition', 'inline'); 
      
      // Essential headers for inline PDF viewing
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Ensure maximum compatibility
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      
      console.log('PDF served inline (no Content-Disposition header):', fileName);
    }
    // Handle other file types
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
      // No Content-Disposition for images - let browser handle inline display
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
    else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
      // No Content-Disposition for images - let browser handle inline display
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
    else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
      // No Content-Disposition for images - let browser handle inline display
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
    // Force download for Word documents
    else if (filePath.endsWith('.doc') || filePath.endsWith('.docx')) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
    }
  }
}))
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

app.set('view engine','ejs')
app.set('views',path.join(__dirname,'views'))
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json())
app.use(cookieParser());
app.use(express.urlencoded({
  extended: true,
  // Allow dots in field names to be part of the field name and not create nested objects
  allowDots: true
}))

// app.use(verifytoken); // Apply token verification middleware globally
connection();

// Middleware to log PDF requests for debugging
app.use('/uploads', (req, res, next) => {
  if (req.path.endsWith('.pdf')) {
    console.log('=== PDF REQUEST DEBUG ===');
    console.log('PDF Request URL:', req.originalUrl);
    console.log('File path:', req.path);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Accept:', req.headers['accept']);
    console.log('Referer:', req.headers['referer']);
    console.log('Query params:', req.query);
    console.log('========================');
  }
  next();
});

// Additional logging for ALL file requests to debug the issue
app.use('/uploads', (req, res, next) => {
  console.log('=== UPLOADS REQUEST ===');
  console.log('Requested file:', req.path);
  console.log('Full URL:', req.originalUrl);
  console.log('Method:', req.method);
  console.log('Referer:', req.headers['referer']);
  console.log('======================');
  next();
});

// Dedicated PDF viewing route for better VM compatibility
app.get('/view-pdf/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    
    // Serve PDF with STRICT INLINE headers - NO DOWNLOAD
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    console.log('Serving PDF inline (view-pdf route):', filename);
    
    // Send the file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).send('Error serving file');
  }
});

// Enhanced file viewer route for better compatibility
app.get('/file-viewer/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).render('404', { message: 'File not found' });
    }
    
    res.render('file-viewer', { filename: filename });
  } catch (error) {
    console.error('Error in file viewer:', error);
    res.status(500).render('404', { message: 'Error loading file viewer' });
  }
});

// Test route for PDF serving debugging
app.get('/test-pdf/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
    
    console.log('=== PDF TEST ROUTE ===');
    console.log('Requested file:', filename);
    console.log('Full path:', filePath);
    console.log('File exists:', fs.existsSync(filePath));
    
    if (!fs.existsSync(filePath)) {
      console.log('File not found');
      return res.status(404).send('File not found');
    }
    
    const stats = fs.statSync(filePath);
    console.log('File size:', stats.size);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Accept header:', req.headers['accept']);
    
    // Set MINIMAL headers for MAXIMUM inline compatibility
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stats.size);
    
    // CRITICAL: Never use attachment for PDFs - always inline or no disposition
    res.setHeader('Accept-Ranges', 'bytes');
    
    console.log('Headers set for INLINE display:', {
      'Content-Type': 'application/pdf',
      'Content-Length': stats.size,
      'No-Content-Disposition': 'true (forcing inline)'
    });
    
    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    stream.on('end', () => {
      console.log('PDF streaming completed successfully');
    });
    
    stream.on('error', (error) => {
      console.error('PDF streaming error:', error);
    });
    
  } catch (error) {
    console.error('Error in test PDF route:', error);
    res.status(500).send('Error serving PDF');
  }
});

// Diagnostic route to test PDF viewing in VM
app.get('/debug-pdf-test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>PDF Debug Test</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .test-item { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .test-item h3 { margin-top: 0; }
            a { display: inline-block; margin: 5px; padding: 10px 15px; background: #007bff; color: white; text-decoration: none; border-radius: 3px; }
            a:hover { background: #0056b3; }
        </style>
    </head>
    <body>
        <h1>PDF Viewing Test for VM Environment</h1>
        <p>User Agent: ${req.headers['user-agent']}</p>
        
        <div class="test-item">
            <h3>Test 1: Direct PDF Access</h3>
            <a href="/uploads/default.pdf" target="_blank">Open default.pdf (Direct Upload)</a>
            <a href="/view-pdf/default.pdf" target="_blank">Open via view-pdf route</a>
            <a href="/test-pdf/default.pdf" target="_blank">Open via test-pdf route</a>
        </div>
        
        <div class="test-item">
            <h3>Test 2: Enhanced File Viewer</h3>
            <a href="/file-viewer/default.pdf" target="_blank">Open Enhanced File Viewer</a>
        </div>
        
        <div class="test-item">
            <h3>Test 3: Inline Display Test</h3>
            <a href="/test-pdf/default.pdf" target="_blank">Test PDF Inline (No Download)</a>
            <p><em>This PDF should ALWAYS display inline, never download</em></p>
        </div>
        
        <div class="test-item">
            <h3>Test 4: Browser PDF Support</h3>
            <button onclick="testPDFSupport()">Test PDF Support</button>
            <div id="result"></div>
        </div>
        
        <script>
            function testPDFSupport() {
                var result = document.getElementById('result');
                var hasPDFSupport = navigator.mimeTypes['application/pdf'];
                var hasAcrobat = navigator.plugins['Adobe Acrobat'];
                
                result.innerHTML = '<h4>Results:</h4>' +
                    '<p>PDF MIME Type Support: ' + (hasPDFSupport ? 'Yes' : 'No') + '</p>' +
                    '<p>Adobe Acrobat Plugin: ' + (hasAcrobat ? 'Yes' : 'No') + '</p>' +
                    '<p>User Agent: ' + navigator.userAgent + '</p>';
            }
        </script>
    </body>
    </html>
  `);
});

// Debug route to check file conversion status
app.get('/debug-conversion/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const docxPath = path.join(__dirname, 'uploads', filename);
    const pdfPath = path.join(__dirname, 'uploads', filename.replace('.docx', '.pdf'));
    
    const status = {
      originalFile: filename,
      docxExists: fs.existsSync(docxPath),
      pdfExists: fs.existsSync(pdfPath),
      docxSize: fs.existsSync(docxPath) ? fs.statSync(docxPath).size : 0,
      pdfSize: fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0,
      expectedPdfName: filename.replace('.docx', '.pdf')
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual conversion trigger route for debugging
app.get('/convert-docx/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const docxPath = path.join(__dirname, 'uploads', filename);
    const pdfPath = path.join(__dirname, 'uploads', filename.replace('.docx', '.pdf'));
    
    if (!fs.existsSync(docxPath)) {
      return res.status(404).json({ error: 'DOCX file not found' });
    }
    
    const libre = require('libreoffice-convert');
    const fs = require('fs');

    fs.readFile(docxPath, (readErr, docxBuf) => {
        if(readErr) {
             console.error('Manual conversion error (read):', readErr);
             return res.status(500).json({ error: 'Read failed', details: readErr.message });
        }
        
        libre.convert(docxBuf, '.pdf', undefined, (err, pdfBuf) => {
          if (err) {
            console.error('Manual conversion error:', err);
            res.status(500).json({ 
              error: 'Conversion failed', 
              details: err.message,
              suggestion: 'LibreOffice might not be installed or accessible'
            });
          } else {
            fs.writeFile(pdfPath, pdfBuf, (writeErr) => {
                if(writeErr) {
                    console.error('Manual conversion error (write):', writeErr);
                    return res.status(500).json({ error: 'Write failed', details: writeErr.message });
                }
                console.log('Manual conversion successful');
                res.json({ 
                    success: true, 
                    message: 'Conversion completed',
                    pdfExists: true,
                    pdfSize: pdfBuf.length
                });
             });
          }
        });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(student)
app.use(attendance)
app.listen(80,()=>{
    console.log('Server is running on port 80')

})
