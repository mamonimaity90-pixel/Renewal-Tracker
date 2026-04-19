import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cron from "node-cron";
import { Resend } from "resend";
import admin from "firebase-admin";
import { getFirestore as getFirestoreAdmin } from "firebase-admin/firestore";
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

// Helper to get Firestore instance with the correct database ID
function getFirestore() {
  const dbId = firebaseConfig.firestoreDatabaseId;
  return getFirestoreAdmin(dbId || '(default)');
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function getResendSettings() {
  const envKey = process.env.RESEND_API_KEY;
  
  try {
    const db = getFirestore();
    const [keySnap, senderSnap, subjectSnap, templateSnap] = await Promise.all([
      db.collection("settings").doc("resend_api_key").get(),
      db.collection("settings").doc("resend_sender_email").get(),
      db.collection("settings").doc("report_subject").get(),
      db.collection("settings").doc("report_template").get()
    ]);

    return {
      apiKey: envKey || (keySnap.exists ? keySnap.data()?.value : null),
      senderEmail: senderSnap.exists ? senderSnap.data()?.value : null,
      reportSubject: subjectSnap.exists ? subjectSnap.data()?.value : null,
      reportTemplate: templateSnap.exists ? templateSnap.data()?.value : null
    };
  } catch (err) {
    console.error("Error fetching Resend settings from Firestore:", err);
    return { 
      apiKey: envKey || null, 
      senderEmail: null,
      reportSubject: null,
      reportTemplate: null
    };
  }
}

function interpolateTemplate(template: string, data: Record<string, any>) {
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    return data[key.trim()] !== undefined ? String(data[key.trim()]) : match;
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for testing reports
  app.post("/api/test-report", async (req, res) => {
    const { email } = req.body;
    const { apiKey, senderEmail, reportSubject, reportTemplate } = await getResendSettings();
    
    if (!apiKey) {
      return res.status(500).json({ error: "RESEND_API_KEY not configured" });
    }

    try {
      const client = new Resend(apiKey);
      console.log(`Attempting test email to ${email} using sender: ${senderEmail || 'onboarding@resend.dev'}`);
      
      const testData = {
        total: 150,
        expired: 12,
        pending: 5,
        renewed: 133,
        frequency: 'test'
      };

      const finalSubject = reportSubject || "Hospital Compliance Report (Test)";
      const finalHtml = reportTemplate 
        ? interpolateTemplate(reportTemplate, testData)
        : `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h1 style="color: #1c1917;">System Connection Verified</h1>
            <p>Your Resend API key is working correctly.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">
              Sender: ${senderEmail || 'onboarding@resend.dev (Default)'}<br/>
              Database: ${firebaseConfig.firestoreDatabaseId || 'default'}
            </p>
          </div>
        `;

      const { data, error } = await client.emails.send({
        from: senderEmail || "Onboarding <onboarding@resend.dev>",
        to: email,
        subject: finalSubject,
        html: finalHtml,
      });

      if (error) {
        console.error("Resend API returned error:", error);
        return res.status(400).json({ error: error.message });
      }

      res.json({ status: "ok", message: "Test email sent successfully", data });
    } catch (error) {
      console.error("Unexpected error in test-report:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Cron Job: Run every day at 08:00 AM
  cron.schedule("0 8 * * *", async () => {
    console.log("Running scheduled reports check...");
    if (!admin.apps.length) return;

    const { apiKey, senderEmail, reportSubject, reportTemplate } = await getResendSettings();
    if (!apiKey) {
      console.warn("Skipping scheduled reports: RESEND_API_KEY not found");
      return;
    }

    const client = new Resend(apiKey);
    const db = getFirestore();
    
    // Fetch summary stats for the report
    let totalHospitals = 0;
    let expiredCount = 0;
    let pendingCount = 0;
    let renewedCount = 0;

    try {
      const hospitalsSnap = await db.collection("hospitals").get();
      totalHospitals = hospitalsSnap.size;
      
      hospitalsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === 'Expired') expiredCount++;
        if (data.status === 'Pending Renewal') pendingCount++;
        if (data.status === 'Active') renewedCount++;
      });
    } catch (err) {
      console.error("Error fetching stats for reports:", err);
    }

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
          const reportData = {
            total: totalHospitals,
            expired: expiredCount,
            pending: pendingCount,
            renewed: renewedCount,
            frequency: schedule.frequency
          };

          const finalSubject = interpolateTemplate(reportSubject || "Hospital Compliance Report: {{frequency}} Summary", reportData);
          const finalHtml = reportTemplate 
            ? interpolateTemplate(reportTemplate, reportData)
            : `
              <div style="font-family: 'Inter', sans-serif; color: #1c1917; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e7e5e4; border-radius: 24px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="font-family: serif; font-size: 24px; margin: 0;">Compliance Report</h1>
                  <p style="color: #78716c; font-size: 14px;">Automated ${schedule.frequency} summary for your team.</p>
                </div>

                <div style="display: grid; grid-template-cols: 1fr 1fr; gap: 10px; margin-bottom: 30px;">
                  <div style="background: #fafaf9; padding: 15px; border-radius: 16px; text-align: center;">
                    <p style="text-transform: uppercase; font-size: 10px; font-weight: bold; color: #a8a29e; margin: 0 0 5px 0;">Total Hospitals</p>
                    <p style="font-size: 24px; font-weight: bold; margin: 0;">${totalHospitals}</p>
                  </div>
                  <div style="background: #fef2f2; padding: 15px; border-radius: 16px; text-align: center;">
                    <p style="text-transform: uppercase; font-size: 10px; font-weight: bold; color: #f87171; margin: 0 0 5px 0;">Expired</p>
                    <p style="font-size: 24px; font-weight: bold; margin: 0; color: #ef4444;">${expiredCount}</p>
                  </div>
                </div>

                <div style="background: #fafaf9; padding: 20px; border-radius: 20px; margin-bottom: 30px;">
                  <h3 style="font-size: 14px; margin-top: 0; margin-bottom: 15px;">Status Breakdown</h3>
                  <div style="margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
                      <span>Active / Renewed</span>
                      <span>${renewedCount} (${((renewedCount/totalHospitals || 0)*100).toFixed(1)}%)</span>
                    </div>
                    <div style="height: 6px; background: #e7e5e4; border-radius: 3px; overflow: hidden;">
                      <div style="height: 100%; width: ${((renewedCount/totalHospitals || 0)*100)}%; background: #059669;"></div>
                    </div>
                  </div>
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px;">
                      <span>Pending Renewal</span>
                      <span>${pendingCount} (${((pendingCount/totalHospitals || 0)*100).toFixed(1)}%)</span>
                    </div>
                    <div style="height: 6px; background: #e7e5e4; border-radius: 3px; overflow: hidden;">
                      <div style="height: 100%; width: ${((pendingCount/totalHospitals || 0)*100)}%; background: #fbbf24;"></div>
                    </div>
                  </div>
                </div>

                <div style="text-align: center;">
                  <a href="${process.env.APP_URL || '#'}" style="display: inline-block; background: #1c1917; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px;">Open Dashboard</a>
                  <p style="color: #a8a29e; font-size: 10px; margin-top: 20px;">
                    Email generated by Hospital Compliance System.
                  </p>
                </div>
              </div>
            `;

          await client.emails.send({
            from: senderEmail || "Hospital Dashboard <onboarding@resend.dev>",
            to: (schedule.recipients as string).split(",").map(e => e.trim()),
            subject: finalSubject,
            html: finalHtml,
          });
          
          // Update lastSent
          await db.collection("report_schedules").doc(doc.id).update({
            lastSent: admin.firestore.FieldValue.serverTimestamp()
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
