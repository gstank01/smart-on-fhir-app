// js/config.js to keep the environmental variables on one place in case we need to switch between environments
const SMART_CONFIG = {
    CLIENT_ID: "ef3b2af6-c1b8-4421-9dda-108c6ac8afce",
    
    // Dynamically builds the redirect URL based on where the app is hosted
    get REDIRECT_URI() {
        return `${window.location.origin}${window.location.pathname.replace('launch.html', 'index.html')}`;
    },
    
    ENDPOINTS: {
        EPIC_AUTHORIZE: "https://vendorservices.epic.com/interconnect-amcurprd-oauth/oauth2/authorize", //This is the endpoint where we send the launch token to exchange it for authorization code  from step 2 on the Epic diagram
        EPIC_TOKEN: "https://vendorservices.epic.com/interconnect-amcurprd-oauth/oauth2/token" //this is the endpint where we are seinfing the auth code to be exchanged for access token from step 5 on the Epic diagram
    },
    
    SCOPES: "launch openid fhirUser patient/Patient.read" // Add additional FHIR resource scopes here
};
