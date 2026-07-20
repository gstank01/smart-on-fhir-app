//js/config.js to keep the environmental variables in one place in case we need to switch between environments
const SMART_CONFIG = {
    CLIENT_ID: "ef3b2af6-c1b8-4421-9dda-108c6ac8afce", //the client ID registered on the Vendor Servises website
    
    // Dynamically builds the redirect URL based on where the app is hosted
    REDIRECT_URI:"https://gstank01.github.io/smart-on-fhir-app/index.html", //hardcoded redirect URI 
    
    ENDPOINTS: {
        EPIC_AUTHORIZE: "https://vendorservices.epic.com/interconnect-amcurprd-oauth/oauth2/authorize", //This is the endpoint where we send the launch token to exchange it for authorization code  from step 2 on the Epic diagram
        EPIC_TOKEN: "https://vendorservices.epic.com/interconnect-amcurprd-oauth/oauth2/token" //this is the endpint where we are seinfing the auth code to be exchanged for access token from step 5 on the Epic diagram
    },
    
    SCOPES: "launch openid fhirUser " // Add additional FHIR resource scopes here. This is the bare minimum for the app to work
};
