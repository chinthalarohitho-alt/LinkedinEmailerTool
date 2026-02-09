# LinkedIn Scraper & Email Automator

A robust tool built with Playwright and Node.js to scrape LinkedIn posts for job opportunities (specifically QA/SDET roles) and automatically send application emails with resumes to discovered email addresses.

## Features

- **Automated Login**: Securely logs into LinkedIn using credentials from environment variables.
- **Smart Scraping**: Navigates to filtered "QA role" posts from the past 24 hours.
- **Email Extraction**: Uses regex to find email addresses within post content, even handling "see more" expansions.
- **Duplicate Prevention**: Maintains a list of processed emails to avoid sending multiple applications to the same address.
- **Automated Outreach**: Automatically triggers `EmailSender.js` to send personalized emails with attachments via Gmail SMTP.

## Key Libraries

- **Playwright**: For browser automation and web scraping.
- **Nodemailer**: For sending emails using SMTP (Gmail).
- **Dotenv**: For managing project-specific environment variables securely.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)
- A Google account with **App Password** enabled (for Gmail SMTP).

---

## Installation

1. **Clone or Download** the project to your local machine.
2. **Install Dependencies & Browsers**:
   Installs core libraries and required browsers.

   ```bash
   # Install all project dependencies
   npm install

   # Explicitly install core libraries (if needed individually)
   npm install @playwright/test dotenv nodemailer

   # Install Playwright browsers
   npx playwright install chromium
   ```

---

## Configuration

### 1. Environment Variables (`.env`)

Create a `.env` file in the root directory (use the existing one as a template) and populate it:

```env
# LinkedIn Credentials
LINKEDIN_USERNAME=your_linkedin_email@example.com
LINKEDIN_PASSWORD=your_linkedin_password

# Gmail SMTP Credentials
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_google_app_password # 16-character code from Google Account Security

# (Optional) Customize Email Subject
EMAIL_SUBJECT="Application – QA / Software Testing Role"
```

> [!IMPORTANT]
> For `EMAIL_PASS`, do NOT use your regular Gmail password. You must generate an **App Password** in your Google Account settings under Security > 2-Step Verification.

### 2. Data Files

Ensure the following files exist in the `Data/` directory:

- `Data/sdet.pdf` OR any file ending in `resume.pdf` (e.g., `Rohith_resume.pdf`): Your resume file.
- `Data/EmailTemplate.txt`: The body of the email you want to send.
- `Data/Emails.txt`: The system will automatically update this with discovered emails.

---

### Run with Persistent Chrome (Best for bypassing CAPTCHAs)

This mode uses your actual Google Chrome profile, which means you're already logged in and look 100% human to LinkedIn.

> [!WARNING]
> You **MUST close all Google Chrome windows** completely before running this command.

```bash
# MacOS / Linux
npx playwright test test/LinkedInPersistent.spec.ts --headed
```

### Run the Standard Scraper (Automated Login)

The standard scraper uses a fresh browser session and logs in automatically using your `.env` credentials.

```bash
npx playwright test test/LinkedInUnified.spec.ts --headed
```

_Note: Using `--headed` is recommended to handle potential LinkedIn security checks (Captchas) manually if they appear._

### Run Email Sender Only

If you already have a list of emails in `Data/Emails.txt` and want to send applications without scraping:

```bash
node EmailSender.js
```

---

## Project Structure

- `test/LinkedInUnified.spec.ts`: The main scraping script using Playwright.
- `EmailSender.js`: Handles sending emails using `nodemailer`.
- `Data/`: Directory for persistent data (emails, resume, template).
- `.env`: Sensitive configuration and credentials.
- `playwright.config.ts`: Configuration for Playwright execution.
