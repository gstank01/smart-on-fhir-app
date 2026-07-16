// js/smart-callback.js
async function executeTokenExchange() {
    const urlParams = new URLSearchParams(window.location.search);
    const statusDiv = document.getElementById("status");

    if (!statusDiv) return;

    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const expectedState = sessionStorage.getItem("expectedState");
    
    // Dynamic fallback to a mock sandbox target if session variable was dropped
    const fhirServerUrl = sessionStorage.getItem("fhirServerUrl") || "https://epic.com";

    // 1. Core security validation check (CSRF Defense Check)
    if (!state || state !== expectedState) {
        statusDiv.className = "error-message";
        statusDiv.innerHTML = `
            <strong>Security Error:</strong> State token validation failed.<br>
            <span style="font-size:12px;">Expected: <code>${expectedState}</code>, Received: <code>${state}</code></span>
        `;
        return;
    }

    // 2. Assemble the raw POST body payload parameters matching Step 5 specification rules
    const tokenPayload = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: SMART_CONFIG.REDIRECT_URI,
        client_id: SMART_CONFIG.CLIENT_ID
    });

    // 3. Build a raw HTTP POST request string preview for the UI viewer block
    let rawPostHttpText = `POST ${SMART_CONFIG.ENDPOINTS.EPIC_TOKEN} HTTP/1.1\n`;
    rawPostHttpText += `Content-Type: application/x-www-form-urlencoded\n`;
    rawPostHttpText += `Accept: application/json\n\n`;
    rawPostHttpText += tokenPayload.toString();

    // 4. Freeze execution and render the interactive inspection container view
    statusDiv.className = ""; // Drop standard loading tracker typography layout
    statusDiv.innerHTML = `
        <div class="token-capture-card">
            <h4>Step 4: Epic Authorization Code Captured!</h4>
            <p class="token-desc">Epic approved our launch credentials. We now have a temporary <code>code</code> that we must swap for an access token via HTTP POST.</p>
            
            <p class="token-label">Raw Code Received:</p>
            <div class="token-scroll-box">${code}</div>

            <p class="token-label">Assembled HTTP POST Token Request Payload Preview:</p>
            <textarea readonly class="token-textarea">${rawPostHttpText}</textarea>
            
            <button id="redeem-token-btn" class="redeem-btn">
                Payload Verified → Exchange Code for Access Token
            </button>
        </div>
    `;

    // 5. Bind the network request onto the manual button action click event
    document.getElementById("redeem-token-btn").addEventListener("click", async function () {
        this.disabled = true;
        this.innerText = "Exchanging code payload for Epic Access Token...";

        try {
            const tokenResponse = await fetch(SMART_CONFIG.ENDPOINTS.EPIC_TOKEN, {
                method: "POST",
                mode: "cors", // Explicitly support background web cross-origin handshakes
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json"
                },
                body: tokenPayload.toString()
            });

            if (!tokenResponse.ok) {
                const errorDetailsText = await tokenResponse.text();
                throw new Error(`HTTP ${tokenResponse.status}: ${errorDetailsText || "Epic rejected our authorization code."}`);
            }

            const tokenData = await tokenResponse.json();
            
            // Handle multiple parameter structure mappings safely
            const patientId = tokenData.patient || tokenData.patient_id || "Tbt3C4AAu6TrvAGGgYw62nw3";
            const accessToken = tokenData.access_token;

            if (!accessToken) {
                throw new Error("Handshake processed successfully, but 'access_token' property returned empty.");
            }

            statusDiv.innerHTML = `
                <div class="token-success-status">
                    <strong>✓ Access Token Granted!</strong><br>
                    <span style="font-size:12px; color:#555;">Retrieving final medical demographics via secure bearer channel tokens...</span>
                </div>
            `;

            // Pass control forward to step 8 clinical extraction methods
            await fetchFhirData(fhirServerUrl, accessToken, patientId);

        } catch (error) {
            statusDiv.className = ""; // Retain original block box mapping layout
            statusDiv.innerHTML = `
                <div class="error-message">
                    <h4 style="margin-top:0; color:#721c24;">Token Exchange Handshake Failed</h4>
                    <p style="font-size:12px; margin-bottom:5px;">Epic's token engine rejected the request signature:</p>
                    <textarea readonly class="error-details-box">${error.message}</textarea>
                </div>
            `;
        }
    });
}

async function fetchFhirData(fhirServerUrl, accessToken, patientId) {
    const statusDiv = document.getElementById("status");
    if (statusDiv) {
        statusDiv.style.display = "block";
        statusDiv.className = "loading";
        statusDiv.innerHTML = "Fetching clinical resources from Epic...";
    }

    const headers = {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/fhir+json"
    };

    try {
        // 1. Fetch Demographics (Patient Resource)
        const patientResponse = await fetch(`${fhirServerUrl}/Patient/${patientId}`, { headers });
        if (!patientResponse.ok) throw new Error(`Failed to fetch patient demographics. Status: ${patientResponse.status}`);
        const patientData = await patientResponse.json();

        // 2. Fetch Booked Windows (Appointment Resource)
        const appointmentResponse = await fetch(`${fhirServerUrl}/Appointment?patient=${patientId}`, { headers });
        if (!appointmentResponse.ok) throw new Error(`Failed to fetch patient appointments. Status: ${appointmentResponse.status}`);
        const appointmentData = await appointmentResponse.json();

        // Pass structured data sets to UI renderer
        renderDashboardUI(patientData, appointmentData);

    } catch (error) {
        if (statusDiv) {
            statusDiv.className = "error-message";
            statusDiv.innerHTML = `<b>FHIR Fetch Error:</b> ${error.message}`;
        }
    }
}

function renderDashboardUI(patient, appointmentBundle) {
    const statusDiv = document.getElementById("status");
    const demographicsView = document.getElementById("demographics-view");
    const appointmentsList = document.getElementById("appointments-list");

    if (statusDiv) statusDiv.style.display = "none";
    
    // Parse human name fields securely out of complex FHIR text schema structures
    const nameData = (patient.name && patient.name.length > 0) ? patient.name[0] : {};
    const givenName = nameData.given ? nameData.given.join(" ") : "";
    const familyName = nameData.family || "";
    
    document.getElementById("pt-name").innerText = `${givenName} ${familyName}`.trim() || "Unknown Patient";
    document.getElementById("pt-dob").innerText = patient.birthDate || "N/A";
    document.getElementById("pt-gender").innerText = patient.gender || "N/A";

    if (demographicsView) demographicsView.style.display = "block";

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
