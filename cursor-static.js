// Static Cursor Script for Legal and Info pages
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inject cursor elements if they don't exist
  let cursorCircle = document.getElementById('cursor-circle');
  let cursorDot = document.getElementById('cursor-dot');

  if (!cursorCircle) {
    cursorCircle = document.createElement('div');
    cursorCircle.className = 'cursor-circle';
    cursorCircle.id = 'cursor-circle';
    document.body.appendChild(cursorCircle);
  }

  if (!cursorDot) {
    cursorDot = document.createElement('div');
    cursorDot.className = 'cursor-dot';
    cursorDot.id = 'cursor-dot';
    document.body.appendChild(cursorDot);
  }

  // 2. Variables for tracking
  let mouseX = 0, mouseY = 0;
  let circleX = 0, circleY = 0;

  // 3. Mouse move tracking
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    // Dot follows instantly
    cursorDot.style.left = mouseX + 'px';
    cursorDot.style.top = mouseY + 'px';
  });

  // 4. Smooth animation for circle
  function animateCursor() {
    const ease = 0.12;
    circleX += (mouseX - circleX) * ease;
    circleY += (mouseY - circleY) * ease;
    cursorCircle.style.left = circleX + 'px';
    cursorCircle.style.top = circleY + 'px';
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // 5. Expand hover effect on interactive elements
  document.addEventListener('mouseover', (e) => {
    const el = e.target;
    // Check if hovered element is interactive
    if (
      el.tagName === 'BUTTON' || 
      el.tagName === 'A' || 
      el.tagName === 'INPUT' || 
      el.tagName === 'SELECT' || 
      el.closest('button') || 
      el.closest('a')
    ) {
      cursorCircle.classList.add('hover');
    }
  });

  document.addEventListener('mouseout', (e) => {
    cursorCircle.classList.remove('hover');
  });
});
