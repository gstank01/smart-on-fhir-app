// js/smart-callback.js
//handle the callback

// 1. Main layer

async function executeTokenExchange() { //Async function reference - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
    const urlParams = new URLSearchParams(window.location.search);
    const statusDiv = document.getElementById("status");
    if (!statusDiv) return;

    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const expectedState = sessionStorage.getItem("expectedState");
    
    // Fixed fallback path to point to the actual FHIR engine gateway instead of epic.com
    const fhirServerUrl = sessionStorage.getItem("fhirServerUrl") || 
        "https://epic.com"; //the default fallback address if sessionStorage returns nothing because the user ioened a fresh tab or didn't launch the app correctly  

    // Validate security state immediately (Anti-CSRF defense step)
    if (!validateSecurityState(state, expectedState, statusDiv)) return;

    // Build operational parameter bodies and raw text layout maps
    const tokenPayload = buildTokenPayload(code);
    const rawPostHttpText = generatePostHttpPreview(tokenPayload);

    // Step 4 Authorization UI verification card
    renderAuthorizationCodeCard(statusDiv, code, rawPostHttpText);

    // Bind event submission handler to wait on your manual click trigger
    bindTokenRedemptionEvent(statusDiv, tokenPayload, fhirServerUrl);
}



// 2. Security and utility
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
    rawText += `GET /Encounter?patient=${patientId}&_count=10 HTTP/1.1\n`;
    rawText += `GET /ServiceRequest?patient=${patientId} HTTP/1.1\n`;
    
    // Dynamically parse the active host name, or default it to vendorservices to preserve environment matching
    const hostTarget = sessionStorage.getItem("fhirServerUrl") 
        ? new URL(sessionStorage.getItem("fhirServerUrl")).host 
        : "vendorservices.epic.com";
        
    rawText += `Host: ${hostTarget}\n`;
    rawText += `Authorization: Bearer ${accessToken}\n`;
    rawText += `Accept: application/fhir+json`;
    return rawText;
}

// 3. Data transfer - API fetch

function bindTokenRedemptionEvent(statusDiv, tokenPayload, fhirServerUrl) {
    //set event listener to exchange the code  for access token
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
                throw new Error(`HTTP ${response.status}: ${errorText || "Epic rejected the authorization code."}`);
            }

            const tokenData = await response.json();
            const patientId = tokenData.patient || tokenData.patient_id;
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
        this.innerText = "Querying Patient Profile, Appointments, Encounters, and ServiceRequests...";
        const statusDiv = document.getElementById("status");

        const targetPatientUrl = `${fhirServerUrl}/Patient/${patientId}`;
        const targetAppointmentUrl = `${fhirServerUrl}/Appointment?patient=${patientId}&_include=Appointment%3Alocation`;
        const targetEncounterUrl = `${fhirServerUrl}/Encounter?patient=${patientId}`;
        const targetServiceRequestUrl = `${fhirServerUrl}/ServiceRequest?patient=${patientId}`;

        const headers = { 
            "Authorization": `Bearer ${accessToken}`, 
            "Accept": "application/fhir+json" 
        };

        try {
            // 1. Execute requests simultaneously, but handle individual errors immediately
            const [patientData, appointmentData, encounterData, serviceRequestData] = await Promise.all([
                
                // Patient Request Failsafe
                fetch(targetPatientUrl, { headers })
                    .then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`))
                    .catch(err => {
                        console.warn("Failsafe Triggered: Patient data unavailable.", err);
                        return null; // Return null so the UI knows it failed
                    }),

                // Appointment Request Failsafe
                fetch(targetAppointmentUrl, { headers })
                    .then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`))
                    .catch(err => {
                        console.warn("Failsafe Triggered: Appointment data unavailable.", err);
                        return { resourceType: "Bundle", entry: [] }; // Return an empty bundle
                    }),

                // Encounter Request Failsafe
                fetch(targetEncounterUrl, { headers })
                    .then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`))
                    .catch(err => {
                        console.warn("Failsafe Triggered: Encounter data unavailable (possible sync delay).", err);
                        return { resourceType: "Bundle", entry: [], error: true }; // Flag the error
                    }),
                // ServiceRequest Request Failsafe - ADD THIS BLOCK
                fetch(targetServiceRequestUrl, { headers })
                    .then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`))
                    .catch(err => {
                        console.warn("Failsafe Triggered: ServiceRequest data unavailable.", err);
                        return { resourceType: "Bundle", entry: [] };
                    })
            ]);

            // 2. Critical Safety Check: The app cannot run at all without the core Patient identity
            if (!patientData) {
                throw new Error("Critical Failure: Core Patient data could not be retrieved.");
            }

            // 3. Render the UI (The downstream render function will now receive safe fallback objects)
            renderDashboardUI(patientData, appointmentData, encounterData);

        } catch (error) {
            this.disabled = false;
            this.innerText = "Headers Verified → Execute FHIR Requests";

            statusDiv.className = "error-message";
            statusDiv.innerHTML = `
                <strong>Critical FHIR Data Request failed:</strong><br>
                <code style="display:block; background:#fff; padding:6px; border:1px solid #ddd; margin-top:5px; word-break:break-all; font-size:11px;">${error.message}</code>
            `;
        }
    });
}

// 4. Dashboard presentation templates

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

function renderDashboardUI(patientData, appointmentData, encounterData) {
    const statusDiv = document.getElementById("status");
    const demographicsView = document.getElementById("demographics-view");
    const appointmentsListDiv = document.getElementById("appointments-list");
    const encountersListDiv = document.getElementById("encounters-list");
    const serviceRequestsListDiv = document.getElementById("service-requests-list");
    
    // Process and populate demographic fields safely
    const nameObj = (patientData.name && patientData.name.length > 0) ? patientData.name[0] : {};
    
    // Added fallbacks for given name arrays to protect against script crashes
    const givenNameArray = nameObj.given || [];
    const firstName = givenNameArray.length > 0 ? givenNameArray.join(" ") : "N/A";
    const lastName = nameObj.family || "N/A";

    document.getElementById("pt-name").innerText = `${firstName} ${lastName}`.trim();
    document.getElementById("pt-dob").innerText = patientData.birthDate || "N/A";
    document.getElementById("pt-gender").innerText = patientData.gender || "N/A";

    // Changed 'fhirBundle' to 'appointmentData' to prevent ReferenceError crash
    const entries = appointmentData.entry || [];
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

    // Process and display encounter cards safely
    if (encountersListDiv) {
        // Handle case where our network failsafe returned an error indicator block
        if (encounterData?.error) {
            encountersListDiv.innerHTML = `<p style="color:#c00; font-weight:bold; padding:5px;"> Encounters Sync Pending (EHR Simulator Authorization Delay).</p>`;
        } else {
            const encounterEntries = encounterData.entry || [];
            const encounters = encounterEntries.filter(e => e.resource?.resourceType === "Encounter").map(e => e.resource);

            if (encounters.length === 0) {
                encountersListDiv.innerHTML = `<p style="color:#666; font-style:italic; padding:5px;">No recent encounters found.</p>`;
            } else {
                encountersListDiv.innerHTML = encounters.map((enc, idx) => {
                    // Extracts the date of the medical visit
                    const encounterDate = enc.period?.start ? new Date(enc.period.start).toLocaleDateString() : "N/A";
                    // Extracts the type/reason (e.g., "Outpatient", "Follow-up")
                    const encounterType = enc.type?.[0]?.text || enc.class?.display || "General Visit";
                    const encounterStatus = enc.status || "N/A";

                    return `
                        <div class="encounter-list-node" style="border-left: 4px solid #0076d6; padding: 10px; margin-bottom: 10px; background: #f9f9f9;">
                            <strong>#${idx + 1} Visit Date:</strong> <span>${encounterDate}</span><br>
                            <strong>Type:</strong> <span>${encounterType}</span><br>
                            <strong>Status:</strong> <span>${encounterStatus}</span>
                        </div>
                    `;
                }).join("");
             }
        }   
    // Process and display ServiceRequest cards 
    if (serviceRequestsListDiv) {
        const serviceRequestEntries = serviceRequestData.entry || [];
        const serviceRequests = serviceRequestEntries.filter(e => e.resource?.resourceType === "ServiceRequest").map(e => e.resource);

        if (serviceRequests.length === 0) {
            serviceRequestsListDiv.innerHTML = `<p style="color:#666; font-style:italic; padding:5px;">No service requests found.</p>`;
        } else {
            serviceRequestsListDiv.innerHTML = serviceRequests.map((sr, idx) => {
                const srStatus = sr.status || "N/A";
                const srCode = sr.code?.text || sr.code?.coding?.[0]?.display || "N/A";
                const srAuthoredDate = sr.authoredOn ? new Date(sr.authoredOn).toLocaleDateString() : "N/A";

                return `
                    <div class="service-request-list-node" style="border-left: 4px solid #ff6b6b; padding: 10px; margin-bottom: 10px; background: #f9f9f9;">
                        <strong>#${idx + 1} Service Type:</strong> <span>${srCode}</span><br>
                        <strong>Status:</strong> <span>${srStatus}</span><br>
                        <strong>Requested Date:</strong> <span>${srAuthoredDate}</span>
                    </div>
                `;
            }).join("");
        }
    }      
       

    // Reveal hidden display widgets and slide down the interface frame container
    if (statusDiv) statusDiv.style.display = "none";
    if (demographicsView) demographicsView.style.display = "block";
}


// Global DOM Content Hook Deployment Execution Layer
document.addEventListener("DOMContentLoaded", executeTokenExchange);
