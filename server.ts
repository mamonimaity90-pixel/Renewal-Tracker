import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cron from "node-cron";
import { Resend } from "resend";
import admin from "firebase-admin";
import fs from "fs";

// Load config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// Initialize Firebase Admin
if (firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID,
  });
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function getResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  if (!admin.apps.length) return null;
  
  try {
    const doc = await admin.firestore().collection("settings").doc("resend_api_key").get();
    return doc.exists ? doc.data()?.value : null;
  } catch (err) {
    console.error("Error fetching Resend key from Firestore:", err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for testing reports
  app.post("/api/test-report", async (req, res) => {
    const { email } = req.body;
    const apiKey = await getResendKey();
    
    if (!apiKey) {
      return res.status(500).json({ error: "RESEND_API_KEY not configured" });
    }

    try {
      const client = new Resend(apiKey);
      await client.emails.send({
        from: "Reports <reports@re-auth.com>",
        to: email,
        subject: "Hospital Compliance Report (Test)",
        html: "<h1>Hospital Compliance Report</h1><p>This is a test of the automated reporting system.</p>",
      });
      res.json({ status: "ok", message: "Test email sent" });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Cron Job: Run every day at 08:00 AM
  cron.schedule("0 8 * * *", async () => {
    console.log("Running scheduled reports check...");
    if (!admin.apps.length) return;

    const apiKey = await getResendKey();
    if (!apiKey) {
      console.warn("Skipping scheduled reports: RESEND_API_KEY not found");
      return;
    }

    const client = new Resend(apiKey);
    const db = admin.firestore();
    const schedulesSnap = await db.collection("report_schedules").get();

    for (const doc of schedulesSnap.docs) {
      const schedule = doc.data();
      const now = new Date();
      
      // Basic logic to check if it's time (Daily/Weekly/Monthly)
      let shouldSend = false;
      if (schedule.frequency === "daily") shouldSend = true;
      if (schedule.frequency === "weekly" && now.getDay() === 1) shouldSend = true; // Monday
      if (schedule.frequency === "monthly" && now.getDate() === 1) shouldSend = true; // 1st of month

      if (shouldSend) {
        console.log(`Sending scheduled report to ${schedule.recipients}`);
        try {
          await client.emails.send({
            from: "Reports <reports@re-auth.com>",
            to: schedule.recipients,
            subject: `Scheduled Hospital Report: ${schedule.frequency}`,
            html: `
              <div style="font-family: serif; color: #1c1917;">
                <h1 style="border-bottom: 2px solid #1c1917; padding-bottom: 10px;">Hospital Compliance Report</h1>
                <p>This is your automated ${schedule.frequency} report.</p>
                <p>Please log in to the dashboard to view the full interactive report and download the detailed PDF.</p>
                <div style="margin-top: 20px; padding: 20px; background: #fafaf9; border-radius: 10px;">
                  <h3 style="margin-top: 0;">Summary</h3>
                  <p>Total Hospitals tracked: ...</p>
                  <p>Retention Rate: ...</p>
                </div>
              </div>
            `,
          });
        } catch (err) {
          console.error("Failed to send scheduled report:", err);
        }
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
