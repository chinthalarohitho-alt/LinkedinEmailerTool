const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

console.log("Script starting...");

const DATA_DIR = path.join(__dirname, "Data");
const EMAILS_FILE_PATH = path.join(DATA_DIR, "Emails.txt");
const TEMPLATE_PATH = path.join(DATA_DIR, "EmailTemplate.txt");

// 1. Dynamic Resume Discovery: Find PDF ending with "resume.pdf"
let RESUME_PATH = path.join(DATA_DIR, "sdet.pdf"); // Default fallback
try {
  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR);
    const resumeFile = files.find((f) => /resume\.pdf$/i.test(f));
    if (resumeFile) {
      RESUME_PATH = path.join(DATA_DIR, resumeFile);
      console.log(`DISCOVERED: Using resume file: ${resumeFile}`);
    }
  }
} catch (err) {
  console.error("ERROR: Failed to scan Data directory for resume:", err);
}

const SUBJECT =
  process.env.EMAIL_SUBJECT || "Application – QA / Software Testing Role";
// Use String.raw if you want to handle literal backslashes, but since we use \n in .env, we'll unescape them
let BODY = "";
if (fs.existsSync(TEMPLATE_PATH)) {
  BODY = fs.readFileSync(TEMPLATE_PATH, "utf-8");
} else {
  // Fallback to .env or hardcoded
  BODY =
    (process.env.EMAIL_BODY || "").replace(/\\n/g, "\n") ||
    `Hello,

I am applying for a QA / Software Testing position. I have hands-on experience in Playwright, manual testing, UI testing, and API testing, with a strong focus on delivering reliable and high-quality test coverage.

I have worked with the Playwright MCP Server and used ChatGPT Atlas to create and refine test cases, which helped reduce test case creation time and accelerate the overall testing process while maintaining accuracy and consistency.

Please find my resume attached for your review. I would be happy to discuss,If anything is needed further please let me know.

Regards,
Chinthala Rohith Kumar
9121753932
https://www.linkedin.com/in/chinthala-rohith-kumar`;
}

async function sendEmails() {
  console.log("Entering sendEmails function...");

  // 1. Check for credentials
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  console.log(`Checking credentials for user: ${user}`);

  if (!user || !pass || pass === "your_google_app_password_here") {
    console.error("ERROR: EMAIL_USER or EMAIL_PASS not set in .env file.");
    console.log(
      "Please create a .env file with your credentials and App Password.",
    );
    return;
  }

  // 2. Setup transporter
  console.log("Setting up nodemailer transporter...");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: user,
      pass: pass,
    },
  });

  // 3. Read emails
  if (!fs.existsSync(EMAILS_FILE_PATH)) {
    console.error(`Emails file not found at: ${EMAILS_FILE_PATH}`);
    return;
  }

  const rawEmails = fs
    .readFileSync(EMAILS_FILE_PATH, "utf-8")
    .split("\n")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  // Use a Set to remove strict duplicates
  const uniqueEmails = [...new Set(rawEmails)];

  console.log(
    `Found ${rawEmails.length} entries, ${uniqueEmails.length} unique emails to process.`,
  );

  let failureCount = 0;
  // 4. Send emails
  for (const email of uniqueEmails) {
    console.log(`Sending email to: ${email}...`);

    const mailOptions = {
      from: user,
      to: email,
      subject: SUBJECT,
      text: BODY,
      attachments: [
        {
          filename: path.basename(RESUME_PATH),
          path: RESUME_PATH,
        },
      ],
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`SUCCESS: Email sent to ${email} (ID: ${info.messageId})`);

      // Granular Deletion: Remove ONLY this email from Emails.txt immediately
      try {
        const currentData = fs.readFileSync(EMAILS_FILE_PATH, "utf-8");
        const updatedData = currentData
          .split("\n")
          .filter((line) => line.trim() !== email)
          .join("\n");
        fs.writeFileSync(EMAILS_FILE_PATH, updatedData);
        console.log(`DELETED: ${email} removed from Emails.txt`);
      } catch (fileErr) {
        console.error(
          `ERROR: Failed to update Emails.txt for ${email}:`,
          fileErr,
        );
      }
    } catch (error) {
      console.error(`FAILURE: Failed to send email to ${email}:`, error);
      failureCount++;
    }

    // Delay to be safe and avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (failureCount > 0) {
    console.error(`Finished with ${failureCount} failures.`);
    process.exit(1);
  } else {
    console.log("All emails processed successfully.");
    process.exit(0);
  }
}

sendEmails().catch((err) => {
  console.error("Unhandled error in sendEmails:");
  console.error(err);
  process.exit(1);
});
