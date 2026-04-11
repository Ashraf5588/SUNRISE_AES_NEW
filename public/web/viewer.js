/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Enhanced viewer.js file with better Android WebView compatibility
"use strict";

// Document initialization code
document.addEventListener("DOMContentLoaded", function() {
  // Extract PDF URL from query string
  const urlParams = new URLSearchParams(window.location.search);
  const fileParam = urlParams.get('file');
  
  // Make sure we have a PDF file to display
  if (!fileParam) {
    showError('No PDF file specified');
    return;
  }

  // Get the full URL to the PDF
  const pdfUrl = fileParam;

  // Update page title
  const fileName = pdfUrl.split('/').pop();
  document.title = fileName + ' - PDF Viewer';
  
  // Configure back button
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', function() {
      // Set a marker to prevent auto-download when returning to main page
      try {
        sessionStorage.setItem('pdfViewed', 'true');
        // Also set localStorage as a fallback for some WebView instances
        localStorage.setItem('pdfViewed', 'true');
      } catch (e) {
        console.warn('Could not set storage:', e);
      }
      
      // Go back to previous page
      history.back();
    });
  }
  
  // Display loading bar
  const loadingBar = document.getElementById('loadingBar');
  if (loadingBar) {
    loadingBar.classList.add('indeterminate');
  }      // For Android WebView, add a note and optimizations
      if (navigator.userAgent.indexOf('wv') > -1 || 
          (navigator.userAgent.indexOf('Android') > -1 && navigator.userAgent.indexOf('Chrome') === -1)) {
        const webViewNote = document.createElement('div');
        webViewNote.className = 'webview-note';
        webViewNote.innerHTML = '<div style="position: fixed; top: 0; left: 0; right: 0; background: rgba(33, 150, 243, 0.9); color: white; padding: 5px 10px; font-size: 12px; text-align: center; z-index: 1000;">Android WebView Optimized Mode</div>';
        document.body.appendChild(webViewNote);
        
        // Add class to body for Android WebView specific styling
        document.body.classList.add('android-webview');
        
        // Add back button for easier navigation in WebView
        const backButton = document.createElement('div');
        backButton.className = 'webview-back-button';
        backButton.innerHTML = `
          <button style="position: fixed; top: 30px; left: 10px; z-index: 1001; 
                         background: rgba(255,255,255,0.9); border: none; border-radius: 50%; 
                         width: 40px; height: 40px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
            <span style="font-size: 24px;">&larr;</span>
          </button>
        `;
        document.body.appendChild(backButton);
        
        // Add event listener to back button
        backButton.querySelector('button').addEventListener('click', function() {
          history.back();
        });
        
        // Force hardware acceleration to improve rendering
        document.body.style.transform = 'translateZ(0)';
        document.body.style.backfaceVisibility = 'hidden';
        document.body.style.perspective = '1000px';
  }
  
  try {
    // Load the PDF using PDF.js
    loadPDF(pdfUrl);
  } catch (error) {
    showError("Failed to load PDF: " + error.message);
  }
  
  // Set up the download button handler
  const downloadButton = document.getElementById('download');
  if (downloadButton) {
    downloadButton.addEventListener('click', function() {
      // Create a temporary link for downloading
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = pdfUrl.split('/').pop();
      link.target = '_blank';
      link.click();
    });
  }
  
  // Set up zoom controls
  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');
  window.currentScale = 1.0;
  
  if (zoomIn) {
    zoomIn.addEventListener('click', function() {
      window.currentScale = Math.min(window.currentScale + 0.2, 3.0);
      applyZoom();
    });
  }
  
  if (zoomOut) {
    zoomOut.addEventListener('click', function() {
      window.currentScale = Math.max(window.currentScale - 0.2, 0.5);
      applyZoom();
    });
  }
  
  function applyZoom() {
    const pages = document.querySelectorAll('.page');
    
    if (pages.length > 0) {
      pages.forEach(page => {
        page.style.transform = `scale(${window.currentScale})`;
        page.style.transformOrigin = 'top left';
      });
      
      // Center the content after zooming (focus on visible page)
      const container = document.getElementById('viewerContainer');
      if (container) {
        // Get the currently visible page
        const visiblePage = document.querySelector('.page[style*="display: block"]') || pages[0];
        
        // Adjust container scroll to keep content centered
        const pageRect = visiblePage.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        const centerX = pageRect.width / 2;
        const centerY = pageRect.height / 2;
        
        // Only adjust if zoomed in
        if (window.currentScale > 1.0) {
          container.scrollLeft = (centerX * window.currentScale) - (containerRect.width / 2);
          container.scrollTop = (centerY * window.currentScale) - (containerRect.height / 2);
        }
      }
      
      // Update page info with zoom level
      const pageInfo = document.getElementById('pageInfo');
      if (pageInfo) {
        const pagesText = pageInfo.textContent.split('|')[0].trim();
        pageInfo.textContent = `${pagesText} | Zoom: ${Math.round(window.currentScale * 100)}%`;
      }
    }
  }
});

function loadPDF(url) {
  // Set up PDF.js
  try {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error("PDF.js library not loaded properly");
    }
    
    const loadingTask = pdfjsLib.getDocument({
      url: url,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/cmaps/',
      cMapPacked: true,
    });
    
    loadingTask.promise
      .then(function(pdfDocument) {
        // PDF loaded successfully
        const loadingBar = document.getElementById("loadingBar");
        if (loadingBar) {
          loadingBar.classList.remove("indeterminate");
          loadingBar.style.display = "none";
        }
        
        // Update page info
        const numPages = pdfDocument.numPages;
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) {
          pageInfo.textContent = 'Pages: ' + numPages;
        }
        
        // Get the container for all pages
        const container = document.getElementById("viewerContainer");
        if (!container) {
          throw new Error("Viewer container not found");
        }
        
        const pdfViewer = document.createElement("div");
        pdfViewer.className = "pdfViewer";
        container.appendChild(pdfViewer);

        // Create page navigation controls
        const pageNav = document.createElement("div");
        pageNav.className = "page-nav";
        pageNav.style.position = "fixed";
        pageNav.style.bottom = "20px";
        pageNav.style.left = "50%";
        pageNav.style.transform = "translateX(-50%)";
        pageNav.style.zIndex = "100";
        pageNav.style.backgroundColor = "rgba(25, 118, 210, 0.9)";
        pageNav.style.borderRadius = "8px";
        pageNav.style.padding = "8px 15px";
        pageNav.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
        pageNav.style.display = "flex";
        pageNav.style.alignItems = "center";
        pageNav.style.gap = "10px";
        
        const prevBtn = document.createElement("button");
        prevBtn.textContent = "← Previous";
        prevBtn.className = "btn";
        prevBtn.disabled = true;
        
        const nextBtn = document.createElement("button");
        nextBtn.textContent = "Next →";
        nextBtn.className = "btn";
        nextBtn.disabled = numPages <= 1;
        
        const pageCounter = document.createElement("span");
        pageCounter.style.color = "white";
        pageCounter.textContent = "Page 1 of " + numPages;
        
        pageNav.appendChild(prevBtn);
        pageNav.appendChild(pageCounter);
        pageNav.appendChild(nextBtn);
        
        container.parentNode.appendChild(pageNav);
        
        let currentPage = 1;
        // Store all rendered pages
        const renderedPages = {};
        
        // Preload the first few pages for better user experience
        const pagesToPreload = Math.min(numPages, 3);
        const preloadPromises = [];
        for (let i = 1; i <= pagesToPreload; i++) {
          preloadPromises.push(renderPage(i, i === 1));
        }
        
        // Wait for preload to complete
        Promise.all(preloadPromises).then(() => {
          console.log(`Preloaded first ${pagesToPreload} pages`);
        }).catch(error => {
          console.error("Error preloading pages:", error);
        });
        
        // Function to render a specific page
        function renderPage(pageNum, shouldDisplay = true) {
          if (pageNum < 1 || pageNum > numPages) {
            return Promise.reject(new Error("Invalid page number"));
          }
          
          currentPage = pageNum;
          
          // Update page counter
          pageCounter.textContent = `Page ${pageNum} of ${numPages}`;
          
          // Update button states
          prevBtn.disabled = pageNum <= 1;
          nextBtn.disabled = pageNum >= numPages;
          
          // If page is already rendered, just show or hide it
          if (renderedPages[pageNum]) {
            // Hide all pages
            for (let key in renderedPages) {
              renderedPages[key].style.display = 'none';
            }
            
            // Show only current page if requested
            if (shouldDisplay) {
              renderedPages[pageNum].style.display = 'block';
            }
            
            return Promise.resolve();
          }
          
          return pdfDocument.getPage(pageNum).then(function(page) {
            const scale = window.currentScale || 1.0;
            const viewport = page.getViewport({ scale });
            
            // Create page container
            const pageContainer = document.createElement("div");
            pageContainer.className = "page";
            pageContainer.id = `page-${pageNum}`;
            pageContainer.style.width = viewport.width + "px";
            pageContainer.style.height = viewport.height + "px";
            pageContainer.dataset.pageNumber = pageNum;
            pageContainer.style.marginBottom = "20px";
            pageContainer.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";
            pageContainer.style.backgroundColor = "#fff";
            
            // Show or hide based on whether this is the current page
            pageContainer.style.display = shouldDisplay ? 'block' : 'none';
            
            // Hide all other pages if this one should be displayed
            if (shouldDisplay) {
              for (let key in renderedPages) {
                renderedPages[key].style.display = 'none';
              }
            }
            
            pdfViewer.appendChild(pageContainer);
            renderedPages[pageNum] = pageContainer;
            
            // Create canvas
            const canvas = document.createElement("canvas");
            canvas.className = "pageCanvas";
            pageContainer.appendChild(canvas);
            
            const context = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Render PDF page
            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            
            return page.render(renderContext).promise.then(function() {
              console.log(`Page ${pageNum} rendered successfully`);
              
              // Add a page label
              const pageLabel = document.createElement('div');
              pageLabel.textContent = `Page ${pageNum}`;
              pageLabel.style.position = 'absolute';
              pageLabel.style.bottom = '5px';
              pageLabel.style.right = '10px';
              pageLabel.style.background = 'rgba(0,0,0,0.5)';
              pageLabel.style.color = 'white';
              pageLabel.style.padding = '2px 8px';
              pageLabel.style.borderRadius = '4px';
              pageLabel.style.fontSize = '12px';
              pageContainer.appendChild(pageLabel);
              
              // Handle Android WebView specific optimizations
              if (navigator.userAgent.indexOf('wv') > -1 || 
                  (navigator.userAgent.indexOf('Android') > -1 && navigator.userAgent.indexOf('Chrome') === -1)) {
                // Force redraw in Android WebView to prevent rendering issues
                setTimeout(function() {
                  canvas.style.opacity = '0.99';
                  setTimeout(function() {
                    canvas.style.opacity = '1';
                  }, 10);
                }, 100);
              }
            });
          });
        }
        
        // Add event listeners for page navigation
        prevBtn.addEventListener("click", function() {
          if (currentPage > 1) {
            renderPage(currentPage - 1);
          }
        });
        
        nextBtn.addEventListener("click", function() {
          if (currentPage < numPages) {
            renderPage(currentPage + 1);
          }
        });
        
        // Add keyboard navigation
        document.addEventListener("keydown", function(e) {
          if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
            if (currentPage < numPages) {
              renderPage(currentPage + 1);
            }
            e.preventDefault();
          } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
            if (currentPage > 1) {
              renderPage(currentPage - 1);
            }
            e.preventDefault();
          }
        });
        
        // Render first page initially
        return renderPage(1);
      })
      .catch(function(error) {
        // PDF failed to load
        showError(error.message || "Failed to load PDF");
      });
  } catch (error) {
    // Handle any errors that occur during setup
    showError("PDF.js initialization error: " + error.message);
  }
}

function showError(message) {
  // Hide loading bar
  const loadingBar = document.getElementById("loadingBar");
  if (loadingBar) {
    loadingBar.style.display = "none";
  }
  
  // Show error message
  const errorWrapper = document.getElementById("errorWrapper");
  if (errorWrapper) {
    errorWrapper.style.display = "block";
    
    const errorMessage = document.getElementById("errorMessage");
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    
    // Set up download button for fallback
    const errorDownloadBtn = document.getElementById('errorDownload');
    if (errorDownloadBtn) {
      const pdfUrl = new URLSearchParams(window.location.search).get('file');
      if (pdfUrl) {
        errorDownloadBtn.addEventListener('click', function() {
          window.open(pdfUrl, '_blank');
        });
      } else {
        errorDownloadBtn.style.display = 'none';
      }
    }
  }
  
  console.error("PDF Viewer Error:", message);
  
  // Also provide a download link as fallback
  const pdfUrl = new URLSearchParams(window.location.search).get('file');
  if (pdfUrl && errorWrapper && !document.querySelector('.fallback-link')) {
    const fallbackLink = document.createElement('div');
    fallbackLink.className = 'fallback-link';
    fallbackLink.innerHTML = `
      <div style="margin-top: 20px; text-align: center;">
        <p>You can still access the PDF directly:</p>
        <a href="${pdfUrl}" class="btn" style="display: inline-block; padding: 8px 16px; background-color: #0d6efd; color: white; text-decoration: none; border-radius: 4px;" target="_blank">
          Download PDF
        </a>
      </div>
    `;
    errorWrapper.appendChild(fallbackLink);
  }
}
