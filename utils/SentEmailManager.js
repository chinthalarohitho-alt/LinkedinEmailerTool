const fs = require("fs");
const path = require("path");

const SENT_EMAILS_FILE = path.join(__dirname, "../Data/SentEmails.json");
const EXPIRY_MS = 96 * 60 * 60 * 1000; // 96 hours

class SentEmailManager {
  constructor() {
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(SENT_EMAILS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(SENT_EMAILS_FILE)) {
      fs.writeFileSync(SENT_EMAILS_FILE, JSON.stringify({}));
    }
  }

  readData() {
    try {
      const data = fs.readFileSync(SENT_EMAILS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      console.error("Error reading SentEmails.json:", e);
      return {};
    }
  }

  writeData(data) {
    try {
      fs.writeFileSync(SENT_EMAILS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("Error writing SentEmails.json:", e);
    }
  }

  /**
   * Adds an email with the current timestamp.
   */
  addEmail(email) {
    const data = this.readData();
    data[email] = Date.now();
    this.writeData(data);
  }

  /**
   * Checks if an email was sent within the last 24 hours.
   * Also cleans up old entries.
   */
  isAlreadySent(email) {
    this.cleanup(); // Auto-cleanup on check
    const data = this.readData();
    return !!data[email];
  }

  /**
   * Removes entries older than 24 hours.
   */
  cleanup() {
    const data = this.readData();
    const now = Date.now();
    let changed = false;

    for (const [email, timestamp] of Object.entries(data)) {
      if (now - timestamp > EXPIRY_MS) {
        delete data[email];
        changed = true;
      }
    }

    if (changed) {
      this.writeData(data);
    }
  }
}

module.exports = new SentEmailManager();
