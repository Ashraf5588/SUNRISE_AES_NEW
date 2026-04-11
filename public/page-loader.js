// Global Page Loader System
class PageLoader {
    constructor() {
        this.createLoader();
        this.bindNavigationEvents();
    }

    createLoader() {
        // Create loader HTML if it doesn't exist
        if (!document.getElementById('page-loader')) {
            const loaderHTML = `
                <div id="page-loader" class="page-loader">
                    <div class="page-loader-overlay">
                        <div class="page-loader-content">
                            <div class="page-loader-spinner">
                                <div class="spinner-ring"></div>
                                <div class="spinner-ring"></div>
                                <div class="spinner-ring"></div>
                                <div class="spinner-ring"></div>
                            </div>
                            <div class="page-loader-text">
                                <h4 id="loader-title">Loading...</h4>
                                <p id="loader-subtitle">Please wait while we process your request</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', loaderHTML);
        }

        // Add CSS if not exists
        if (!document.getElementById('page-loader-styles')) {
            const styles = `
                <style id="page-loader-styles">
                    .page-loader {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 9999;
                        opacity: 0;
                        visibility: hidden;
                        transition: all 0.3s ease;
                    }

                    .page-loader.active {
                        opacity: 1;
                        visibility: visible;
                    }

                    .page-loader-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(255, 255, 255, 0.95);
                        backdrop-filter: blur(5px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .page-loader-content {
                        text-align: center;
                        padding: 2rem;
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                        max-width: 400px;
                        width: 90%;
                        transform: translateY(20px);
                        transition: transform 0.3s ease;
                    }

                    .page-loader.active .page-loader-content {
                        transform: translateY(0);
                    }

                    .page-loader-spinner {
                        position: relative;
                        width: 80px;
                        height: 80px;
                        margin: 0 auto 1.5rem;
                    }

                    .spinner-ring {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        border: 3px solid transparent;
                        border-top: 3px solid #0ea5e9;
                        border-radius: 50%;
                        animation: spin 1.2s linear infinite;
                    }

                    .spinner-ring:nth-child(1) {
                        animation-delay: 0s;
                        border-top-color: #0ea5e9;
                    }

                    .spinner-ring:nth-child(2) {
                        animation-delay: 0.3s;
                        border-top-color: #8b5a2b;
                        width: 85%;
                        height: 85%;
                        top: 7.5%;
                        left: 7.5%;
                    }

                    .spinner-ring:nth-child(3) {
                        animation-delay: 0.6s;
                        border-top-color: #a16207;
                        width: 70%;
                        height: 70%;
                        top: 15%;
                        left: 15%;
                    }

                    .spinner-ring:nth-child(4) {
                        animation-delay: 0.9s;
                        border-top-color: #22c55e;
                        width: 55%;
                        height: 55%;
                        top: 22.5%;
                        left: 22.5%;
                    }

                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }

                    .page-loader-text h4 {
                        color: #1e293b;
                        margin-bottom: 0.5rem;
                        font-weight: 600;
                        font-size: 1.3rem;
                    }

                    .page-loader-text p {
                        color: #64748b;
                        margin: 0;
                        font-size: 0.95rem;
                    }

                    /* Mobile responsiveness */
                    @media (max-width: 480px) {
                        .page-loader-content {
                            padding: 1.5rem;
                            border-radius: 15px;
                            max-width: 320px;
                        }

                        .page-loader-spinner {
                            width: 60px;
                            height: 60px;
                            margin-bottom: 1rem;
                        }

                        .page-loader-text h4 {
                            font-size: 1.1rem;
                        }

                        .page-loader-text p {
                            font-size: 0.85rem;
                        }
                    }
                    
                    /* Ensure loader is always on top */
                    .page-loader {
                        z-index: 99999 !important;
                    }
                    
                    /* Add smooth fade animation */
                    .page-loader-overlay {
                        animation: fadeIn 0.3s ease-out;
                    }
                    
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                </style>
            `;
            document.head.insertAdjacentHTML('beforeend', styles);
        }
    }

    show(title = 'Loading...', subtitle = 'Please wait while we process your request') {
        const loader = document.getElementById('page-loader');
        const titleElement = document.getElementById('loader-title');
        const subtitleElement = document.getElementById('loader-subtitle');
        
        if (titleElement) titleElement.textContent = title;
        if (subtitleElement) subtitleElement.textContent = subtitle;
        
        if (loader) {
            loader.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    hide() {
        const loader = document.getElementById('page-loader');
        if (loader) {
            loader.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    bindNavigationEvents() {
        // Show loader immediately if page is loading
        if (document.readyState === 'loading') {
            this.show('Loading Page...', 'Please wait while the page loads');
        }

        // Listen for page navigation
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (link && this.shouldShowLoader(link)) {
                const href = link.getAttribute('href');
                
                // Determine loading message based on URL
                let title = 'Loading...';
                let subtitle = 'Please wait while we process your request';
                
                if (href.includes('/findData/') || href.includes('/analysis/')) {
                    title = 'Analyzing Data...';
                    subtitle = 'Processing examination results and generating detailed insights';
                } else if (href.includes('/terminal/') || href.includes('/FIRST') || href.includes('/SECOND') || href.includes('/THIRD')) {
                    title = 'Loading Terminal...';
                    subtitle = 'Preparing terminal examination data';
                } else if (href.includes('/teacher/') || href.includes('/class/')) {
                    title = 'Loading Content...';
                    subtitle = 'Fetching data from the server';
                } else if (href.includes('/form/')) {
                    title = 'Loading Form...';
                    subtitle = 'Preparing examination entry form';
                }
                
                this.show(title, subtitle);
            }
        });

        // Hide loader when page loads
        window.addEventListener('load', () => {
            setTimeout(() => this.hide(), 100);
        });

        // Hide loader on back/forward navigation
        window.addEventListener('pageshow', () => {
            this.hide();
        });

        // Show loader for form submissions that might take time
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.action && (form.action.includes('analysis') || form.action.includes('findData'))) {
                this.show('Processing Form...', 'Analyzing your submission');
            }
        });

        // Listen for beforeunload to show loader when navigating away
        window.addEventListener('beforeunload', () => {
            this.show('Loading...', 'Navigating to new page');
        });
    }

    shouldShowLoader(link) {
        const href = link.getAttribute('href');
        
        // Don't show loader for:
        if (!href || 
            href.startsWith('#') || 
            href.startsWith('mailto:') || 
            href.startsWith('tel:') ||
            href.includes('javascript:') ||
            link.getAttribute('target') === '_blank' ||
            link.hasAttribute('download')) {
            return false;
        }

        // Show loader for internal navigation
        return true;
    }
}

// Initialize the page loader when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.pageLoader = new PageLoader();
});

// Export for use in other scripts
window.PageLoader = PageLoader;
