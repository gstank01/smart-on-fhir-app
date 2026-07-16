// js/smart-launch.js
async function executeSmartLaunch() {
    const urlParams = new URLSearchParams(window.location.search);
    const statusDiv = document.getElementById("status");

    if (!urlParams.has("iss") || !urlParams.has("launch")) {
        if (statusDiv) statusDiv.innerHTML = "<b style='color:red;'>Error:</b> Missing 'iss' or 'launch' URL parameters.";
        return;
    }

    const fhirServerUrl = urlParams.get("iss");
    const launchToken = urlParams.get("launch");

    // Persist session variables across the upcoming Epic redirect redirect hop
    sessionStorage.setItem("fhirServerUrl", fhirServerUrl);
    
    const secureState = crypto.randomUUID();
    sessionStorage.setItem("expectedState", secureState);

    // Build Epic parameters using our config asset file
    const authorizeParams = new URLSearchParams({
        response_type: "code",
        client_id: SMART_CONFIG.CLIENT_ID,
        redirect_uri: SMART_CONFIG.REDIRECT_URI,
        launch: launchToken,
        scope: SMART_CONFIG.SCOPES,
        state: secureState,
        aud: fhirServerUrl
    });

    // Execute hand-off to Epic identity server
    window.location.href = `${SMART_CONFIG.ENDPOINTS.EPIC_AUTHORIZE}?${authorizeParams.toString()}`;
}

// Automatically fire when the hosting DOM wrapper finishes loading
document.addEventListener("DOMContentLoaded", executeSmartLaunch);
