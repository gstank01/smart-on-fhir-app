// js/smart-callback.js to capture the authentication landing payload, run secure checks, and extracts the payload context
async function executeTokenExchange() {
    const urlParams = new URLSearchParams(window.location.search);
    const statusDiv = document.getElementById("status");

    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const expectedState = sessionStorage.getItem("expectedState");

    if (!state || state !== expectedState) {
        if (statusDiv) statusDiv.innerHTML = "<b style='color:red;'>Security Error:</b> State mismatch or session expired.";
        return;
    }

    if (statusDiv) statusDiv.innerHTML = "Swapping authorization code for access token...";

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

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const tokenData = await response.json();
        
        // Broadcast data to your dashboard layout UI frame
        renderDashboardUI(tokenData);
        
    } catch (error) {
        if (statusDiv) statusDiv.innerHTML = `<b style='color:red;'>Token Exchange Failed:</b> ${error.message}`;
    }
}

function renderDashboardUI(tokenData) {
    const statusDiv = document.getElementById("status");
    if (!statusDiv) return;
    
    statusDiv.innerHTML = `
        <div style="background:#ebf7ee; padding:20px; border:1px solid #c3e6cb; border-radius:4px;">
            <h3 style="color:#155724; margin-top:0;">Connected to Epic Sandbox Successfully!</h3>
            <p><b>Active Patient Context Context ID:</b> <code>${tokenData.patient}</code></p>
            <p style="font-size:12px; color:#555;">Token authorized. Ready to run FHIR REST queries against baseline resources.</p>
        </div>
    `;
}

document.addEventListener("DOMContentLoaded", executeTokenExchange);
