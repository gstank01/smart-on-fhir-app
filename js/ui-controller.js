// Replace inline onclick handlers with event delegation
document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            switchTab(e, button.dataset.tab);
        });
    });
});

function switchTab(event, sectionId) {
    event.preventDefault();
    
    // Hide all sections
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
    });
    
    // Deactivate all buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Activate clicked button
    event.target.classList.add('active');
}
