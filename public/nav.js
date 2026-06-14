// Navigation functionality
document.addEventListener('DOMContentLoaded', function() {
  const adminSidebar = document.querySelector('.admin-sidebar');
  const body = document.body;
  
  // Check if we have a sidebar and add appropriate class to body
  if (adminSidebar) {
    body.classList.add('has-sidebar');
  }
  
  // Add animation effects to navbar brand
  const navbarBrand = document.querySelector('.navbar-brand');
  if (navbarBrand) {
    navbarBrand.style.animation = 'fadeInDown 0.5s ease forwards';
  }
  
  // Add keyframe animation
  if (!document.querySelector('#nav-animations')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'nav-animations';
    styleSheet.innerHTML = `
      @keyframes fadeInDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
});
