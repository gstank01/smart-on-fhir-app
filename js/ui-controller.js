//this is the place we place the functions that will control the UI behaviour of the patient data display page. Keeping it separate from the launch and callback code.

function switchTab(event, sectionId) {
    // 1. Hide all sections by removing the active class
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 2. Remove the active color style from all buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 3. Reveal the specific clicked section
    document.getElementById(sectionId).classList.add('active');
    
    // 4. Style the clicked button as active (using the passed event)
    event.currentTarget.classList.add('active');
}
