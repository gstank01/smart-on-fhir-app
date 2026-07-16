// js/smart-callback.js
async function executeTokenExchange() {
    const urlParams = new URLSearchParams(window.location.search);
    const statusDiv = document.getElementById("status");

    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const expectedState = sessionStorage.getItem("expectedState");
    const fhirServerUrl = sessionStorage.getItem("fhirServerUrl");

    if (!state || state !== expectedState) {
        if (statusDiv) statusDiv.innerHTML = "<div class='error-message'><b>Security Error:</b> State mismatch or session expired.</div>";
        return;
    }

    if (statusDiv) statusDiv.innerHTML = "Exchanging authorization code for Epic access token...";

    const tokenPayload = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: SMART_CONFIG.REDIRECT_URI,
        client_id: SMART_CONFIG.CLIENT_ID
    });

    try {
        const response = await fetch(SMART_CONFIG.ENDPOINTS.EPIC_TOKEN, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: tokenPayload.toString()
        });

        if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
        
        const tokenData = await response.json();
        
        // Pass server routing targets forward to pull downstream resources
        await fetchFhirData(fhirServerUrl, tokenData.access_token, tokenData.patient);
        
    } catch (error) {
        if (statusDiv) statusDiv.innerHTML = `<div class='error-message'><b>Error:</b> ${error.message}</div>`;
    }
}

async function fetchFhirData(fhirServerUrl, accessToken, patientId) {
    const statusDiv = document.getElementById("status");
    if (statusDiv) statusDiv.innerHTML = "Fetching clinical resources from Epic...";

    const headers = {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/fhir+json"
    };

    try {
        // 1. Fetch Demographics (Patient Resource)
        const patientResponse = await fetch(`${fhirServerUrl}/Patient/${patientId}`, { headers });
        if (!patientResponse.ok) throw new Error("Failed to fetch patient demographics.");
        const patientData = await patientResponse.json();

        // 2. Fetch Booked Windows (Appointment Resource)
        const appointmentResponse = await fetch(`${fhirServerUrl}/Appointment?patient=${patientId}`, { headers });
        if (!appointmentResponse.ok) throw new Error("Failed to fetch patient appointments.");
        const appointmentData = await appointmentResponse.json();

        // Pass structured data sets to UI renderer
        renderDashboardUI(patientData, appointmentData);

    } catch (error) {
        if (statusDiv) statusDiv.innerHTML = `<div class='error-message'><b>FHIR Fetch Error:</b> ${error.message}</div>`;
    }
}

// UPDATED VIEW FUNCTION FOR CLEAN OUTBOUND CSS TRACKING
function renderDashboardUI(patient, appointmentBundle) {
    const statusDiv = document.getElementById("status");
    const demographicsView = document.getElementById("demographics-view");
    const appointmentsList = document.getElementById("appointments-list");

    // Hide global loader context container
    if (statusDiv) statusDiv.style.display = "none";
    
    // Safely parse human name fields out of complex FHIR array structures
    const nameData = (patient.name && patient.name.length > 0) ? patient.name[0] : {};
    const givenName = nameData.given ? nameData.given.join(" ") : "";
    const familyName = nameData.family || "";
    
    document.getElementById("pt-name").innerText = `${givenName} ${familyName}`.trim() || "Unknown Patient";
    document.getElementById("pt-dob").innerText = patient.birthDate || "N/A";
    document.getElementById("pt-gender").innerText = patient.gender || "N/A";

    // Unhide the clean demographics top banner view panel
    if (demographicsView) demographicsView.style.display = "block";

    // Clean loop arrays to process and generate individual encounter nodes
    if (appointmentsList) {
        appointmentsList.innerHTML = ""; 

        if (!appointmentBundle.entry || appointmentBundle.entry.length === 0) {
            appointmentsList.innerHTML = "<p style='color:#777; font-style:italic;'>No upcoming appointments found for this patient.</p>";
            return;
        }

        appointmentBundle.entry.forEach(item => {
            const appt = item.resource;
            const apptTime = appt.start ? new Date(appt.start).toLocaleString() : "Date/Time TBD";
            const apptType = appt.appointmentType?.text || appt.description || "Clinical Visit";
            const apptStatus = appt.status || "booked";

            const card = document.createElement("div");
            card.className = "appointment-card";
            
            // Replaced all inline style elements with clean CSS classes matching your stylesheet
            card.innerHTML = `
                <strong>${apptType}</strong><br>
                <span class="appointment-time">📅 ${apptTime}</span><br>
                <span class="appointment-status">Status: ${apptStatus}</span>
            `;
            appointmentsList.appendChild(card);
        });
    }
}

document.addEventListener("DOMContentLoaded", executeTokenExchange);
