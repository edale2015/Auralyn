export const deploymentChecklist = {
  googleCloud: [
    "Create Google Cloud project",
    "Enable Gmail API",
    "Configure OAuth consent screen (Branding, Audience, Data Access)",
    "Create OAuth client: Web application",
    "Add exact Authorized redirect URIs",
    "Add authorized domains for app/privacy/terms/callback host if applicable",
  ],
  gmailScope: [
    "Use least privilege scope: https://www.googleapis.com/auth/gmail.send",
  ],
  productionUris: [
    "https://app.yourdomain.com/api/google-email/oauth/callback",
    "http://localhost:3000/api/google-email/oauth/callback",
  ],
};

export const googleEmailConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  scopes: (
    process.env.GOOGLE_EMAIL_SCOPES ||
    "https://www.googleapis.com/auth/gmail.send"
  ).split(","),
};
