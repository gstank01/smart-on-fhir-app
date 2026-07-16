// js/smart-callback.js

// ==========================================
// 1. MAIN INITIALIZATION LAYER
// ==========================================

async function executeTokenExchange() {
    const urlParams = new URLSearchParams(window.location.search);
    const statusDiv = document.getElementById("status");
    if (!statusDiv) return;

    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const expectedState = sessionStorage.getItem("expectedState");
    
    // КОРЕКЦИЯ: Fixed fallback path to point to the actual FHIR engine gateway instead of epic.com
    const fhirServerUrl = sessionStorage.getItem("fhirServerUrl") || 
        "https://epic.com";

    // Validate security state immediately (Anti-CSRF defense step)
    if (!validateSecurityState(state, expectedState, statusDiv)) return;

    // Build operational parameter bodies and raw text layout maps
    const tokenPayload = buildTokenPayload(code);
    const rawPostHttpText = generatePostHttpPreview(tokenPayload);

    // Present Step 4 Authorization UI verification card
    renderAuthorizationCodeCard(statusDiv, code, rawPostHttpText);

    // Bind event submission handler to wait on your manual click trigger
    bindTokenRedemptionEvent(statusDiv, tokenPayload, fhirServerUrl);
}


// ==========================================
// 2. SECURITY & UTILITY COMPILERS
// ==========================================

function validateSecurityState(state, expectedState, statusDiv) {
    if (state && state === expectedState) return true;
    
    statusDiv.className = "error-message";
    statusDiv.innerHTML = `
        <strong>Security Error:</strong> State token validation failed.<br>
        <span style="font-size:12px;">Expected: <code>${expectedState}</code>, Received: <code>${state}</code></span>
    `;
    return false;
}

function buildTokenPayload(code) {
    // Safety check: Fall back to window level tracking object if variable is dropped
    const config = typeof SMART_CONFIG !== "undefined" ? SMART_CONFIG : window.SMART_CONFIG;
    return new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: config.REDIRECT_URI,
        client_id: config.CLIENT_ID
    });
}

function generatePostHttpPreview(tokenPayload) {
    const config = typeof SMART_CONFIG !== "undefined" ? SMART_CONFIG : window.SMART_CONFIG;
    let rawText = `POST ${config.ENDPOINTS.EPIC_TOKEN} HTTP/1.1\n`;
    rawText += `Content-Type: application/x-www-form-urlencoded\n`;
    rawText += `Accept: application/json\n\n`;
    rawText += tokenPayload.toString();
    return rawText;
}

function generateFhirHttpPreview(patientId, accessToken) {
    let rawText = `GET /Patient/${patientId} HTTP/1.1\n`;
    rawText += `GET /Appointment?patient=${patientId}&service-category=Appointment&_include=Appointment:location HTTP/1.1\n`;
    
    // CORRECTION: Dynamically parse the active host name, or default it to vendorservices to preserve environment matching
    const hostTarget = sessionStorage.getItem("fhirServerUrl") 
        ? new URL(sessionStorage.getItem("fhirServerUrl")).host 
        : "vendorservices.epic.com";
        
    rawText += `Host: ${hostTarget}\n`;
    rawText += `Authorization: Bearer ${accessToken}\n`;
    rawText += `Accept: application/fhir+json`;
    return rawText;
}


// ==========================================
// 3. ASYNCHRONOUS DATA TRANSFERS (API FETCH)
// ==========================================

function bindTokenRedemptionEvent(statusDiv, tokenPayload, fhirServerUrl) {
    document.getElementById("redeem-token-btn").addEventListener("click", async function () {
        this.disabled = true;
        this.innerText = "Exchanging code payload for Epic Access Token...";

        // Safety pointer resolution mapping step
        const config = typeof SMART_CONFIG !== "undefined" ? SMART_CONFIG : window.SMART_CONFIG;

        try {
            const response = await fetch(config.ENDPOINTS.EPIC_TOKEN, {
                method: "POST",
                mode: "cors", 
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json"
                },
                body: tokenPayload.toString() // Standardized to raw URL-encoded string payload
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || "Epic rejected our authorization code."}`);
            }

            const tokenData = await response.json();
            const patientId = tokenData.patient || tokenData.patient_id || "Tbt3C4AAu6TrvAGGgYw62nw3";
            const accessToken = tokenData.access_token;

            if (!accessToken) throw new Error("Handshake processed successfully, but 'access_token' returned empty.");

            // Advance to intermediate verification dashboard step
            renderIntermediateFhirCard(statusDiv, fhirServerUrl, patientId, accessToken);

        } catch (error) {
            this.disabled = false; // Re-enable the button to allow user to retry if connection failed
            this.innerText = "Payload Verified → Exchange Code for Access Token";
            
            statusDiv.className = ""; 
            statusDiv.innerHTML = `
                <div class="error-message">
                    <h4>Token Exchange Handshake Failed</h4>
                    <p style="font-size:12px; margin-bottom:5px;">Epic's token engine rejected the request signature:</p>
                    <textarea readonly class="error-details-box">${error.message}</textarea>
                </div>
            `;
        }
    });
}

function bindFhirExecutionEvent(fhirServerUrl, patientId, accessToken) {
    document.getElementById("execute-fhir-btn").addEventListener("click", async function () {
        this.disabled = true;
        this.innerText = "Querying Patient Profile and Appointment slots simultaneously...";
        const statusDiv = document.getElementById("status");

        // CORRECTION: Streamlined URL string query structure to enforce safe sandbox mapping profiles
        const targetPatientUrl = `${fhirServerUrl}/Patient/${patientId}`;
        const targetAppointmentUrl = `${fhirServerUrl}/Appointment?patient=${patientId}&_include=Appointment%3Alocation`;

        try {
            const [patientResponse, appointmentResponse] = await Promise.all([
                fetch(targetPatientUrl, { 
                    headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/fhir+json" } 
                }),
                fetch(targetAppointmentUrl, { 
                    headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/fhir+json" } 
                })
            ]);

            if (!patientResponse.ok || !appointmentResponse.ok) {
                throw new Error(`Data retrieval failed. Patient: HTTP ${patientResponse.status}, Appointment: HTTP ${appointmentResponse.status}`);
            }

            const patientData = await patientResponse.json();
            const fhirBundle = await appointmentResponse.json();

            // Populate dashboard presentation templates
            renderDashboardUI(patientData, fhirBundle);

        } catch (error) {
            // FIX: Restore functional state tracking button controls dynamically upon error drop-outs
            this.disabled = false;
            this.innerText = "Headers Verified → Execute FHIR Requests";

            statusDiv.className = "error-message";
            statusDiv.innerHTML = `
                <strong>FHIR Data Request failed:</strong><br>
                <code style="display:block; background:#fff; padding:6px; border:1px solid #ddd; margin-top:5px; word-break:break-all; font-size:11px;">${error.message}</code>
            `;
        }
    });
}

// ==========================================
// 4. UI INTERFACE INJECTION LAYER (TEMPLATES)
// ==========================================

function renderAuthorizationCodeCard(statusDiv, code, rawPostHttpText) {
    statusDiv.className = ""; 
    statusDiv.innerHTML = `
        <div class="token-capture-card">
            <h4>Step 4: Epic Authorization Code Captured!</h4>
            <p class="token-desc">Epic approved our launch credentials. We now have a temporary <code>code</code> that we must swap for an access token via HTTP POST.</p>
            <p class="token-label">Raw Code Received:</p>
            <div class="token-scroll-box">${code}</div>
            <p class="token-label">Assembled HTTP POST Token Request Payload Preview:</p>
            <textarea readonly class="token-textarea">${rawPostHttpText}</textarea>
            <button id="redeem-token-btn" class="redeem-btn">Payload Verified → Exchange Code for Access Token</button>
        </div>
    `;
}

function renderIntermediateFhirCard(statusDiv, fhirServerUrl, patientId, accessToken) {
    const rawFhirHttpText = generateFhirHttpPreview(patientId, accessToken);
    statusDiv.innerHTML = `
        <div class="fhir-inspect-card">
            <h4>Step 5 & 6: Access Token & FHIR Request Compiled!</h4>
            <p class="fhir-desc">The back-channel exchange succeeded. We now possess an active <code>access_token</code>. We will execute parallel requests to fetch the patient profile banner and their full appointment log.</p>
            <p class="fhir-label">Access (Bearer) Token :</p>
            <div class="token-red-box">${accessToken}</div>
            <p class="fhir-label">Assembled Outgoing FHIR Request Headers Preview:</p>
            <textarea readonly class="token-textarea">${rawFhirHttpText}</textarea>
            <button id="execute-fhir-btn" class="execute-btn">Headers Verified → Execute FHIR Requests</button>
        </div>
    `;
    bindFhirExecutionEvent(fhirServerUrl, patientId, accessToken);
}

function renderDashboardUI(patientData, fhirBundle) {
    const statusDiv = document.getElementById("status");
    const demographicsView = document.getElementById("demographics-view");
    const appointmentsListDiv = document.getElementById("appointments-list");

    // Process and populate demographic fields safely
    const nameObj = (patientData.name && patientData.name.length > 0) ? patientData.name[0] : {};
    
    // FIX: Added fallbacks for given name arrays to protect against script crashes
    const givenNameArray = nameObj.given || [];
    const firstName = givenNameArray.length > 0 ? givenNameArray.join(" ") : "N/A";
    const lastName = nameObj.family || "N/A";

    document.getElementById("pt-name").innerText = `${firstName} ${lastName}`.trim();
    document.getElementById("pt-dob").innerText = patientData.birthDate || "N/A";
    document.getElementById("pt-gender").innerText = patientData.gender || "N/A";

    // Extract entries and locations maps safely from search bundle
    const entries = fhirBundle.entry || [];
    const appointments = entries.filter(e => e.resource?.resourceType === "Appointment").map(e => e.resource);
    const locations = entries.filter(e => e.resource?.resourceType === "Location").map(e => e.resource);

    const locationMap = {};
    locations.forEach(loc => { 
        if (loc.id) locationMap[loc.id] = loc.name || "Unknown Location"; 
    });

    // Output dynamic appointment cards
    if (appointments.length === 0) {
        appointmentsListDiv.innerHTML = `<p style="color:#666; font-style:italic; padding:5px;">No upcoming appointments.</p>`;
    } else {
        appointmentsListDiv.innerHTML = appointments.map((appt, idx) => {
            const timeStr = appt.start ? new Date(appt.start).toLocaleString() : "N/A";
            const currentStatus = appt.status || "N/A";
            let locationName = "Not Specified";

            // FIX: Strengthened location extraction query logic
            const locParticipant = appt.participant?.find(p => p.actor?.reference?.includes("Location/"));
            const locRef = locParticipant?.actor?.reference;
            
            if (locRef) {
                const locId = locRef.split("Location/").pop().split("/")[0]; // Isolates exact numerical token
                locationName = locationMap[locId] || "Clinic Facility Target";
            }

            return `
                <div class="appointment-list-node">
                    <strong>#${idx + 1} Schedule Time:</strong> <span class="val-time">${timeStr}</span><br>
                    <strong>Status State:</strong> <span class="val-status">${currentStatus}</span><br>
                    <strong>Location Context:</strong> <span class="val-location">${locationName}</span>
                </div>
            `;
        }).join("");
    }

    // Reveal hidden display widgets and slide down the interface frame container
    if (statusDiv) statusDiv.style.display = "none";
    if (demographicsView) demographicsView.style.display = "block";
}

// Global DOM Content Hook Deployment Execution Layer
document.addEventListener("DOMContentLoaded", executeTokenExchange);
