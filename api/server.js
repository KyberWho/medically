import cors from "cors";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./utilities.js";
import { Verify } from "./verify.js";

const app = express();
const PORT = process.env.API_PORT || 3030;
const pidFile = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	".medically-process-api.pid",
);
app.use(express.json());

const webPort = process.env.WEB_PORT || 3000;
app.use(
	cors({
		origin: (origin, callback) => {
			const allowedOrigins = new Set([
				"http://localhost:3000",
				"http://127.0.0.1:3000",
				`http://localhost:${webPort}`,
				`http://127.0.0.1:${webPort}`,
				"http://localhost:5500",
				"http://127.0.0.1:5500",
				"http://localhost:5173",
				"http://127.0.0.1:5173",
				"http://localhost:4173",
				"http://127.0.0.1:4173",
				"http://localhost:8080",
				"http://127.0.0.1:8080",
			]);
			if (!origin || allowedOrigins.has(origin)) {
				callback(null, true);
			} else if (
				/^https?:\/\/(localhost|127\.0\.0\.1):(3000|5500|5173|4173|8080)$/.test(
					origin,
				) ||
				(process.env.WEB_ORIGIN || "")
					.split(",")
					.map((allowedOrigin) => allowedOrigin.trim())
					.includes(origin)
			) {
				callback(null, true);
			} else {
				callback(new Error("Origin not allowed by CORS"));
			}
		},
		methods: ["POST", "GET", "OPTIONS"],
		allowedHeaders: ["Content-Type", "x-api-key"],
	}),
);

const upload = multer({ storage: multer.memoryStorage() });

async function sendToWebsite2(structuredData) 
{
    const website2Url = (
        process.env.NHS_SERVER_URL || `http://localhost:${webPort}`
    ).replace(/\/$/, "");
    const website2Response = await fetch(`${website2Url}/api/referrals/receive`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_WEBSITE_2_API_KEY'
        },
        body: JSON.stringify({
            source: 'Website 1 Pipeline',
            timestamp: new Date().toISOString(),
            data: structuredData
        })
    });

    if (!website2Response.ok) {
        const error = new Error(
            `NHS server rejected the referral with status ${website2Response.status}.`,
        );
        error.statusCode = 502;
        throw error;
    }

    return await website2Response.json();
}

// Endpoint to receive file from Website 1
app.post("/api/process-file", upload.single("file"), async (req, res) => {
	try {
		let bookingData = null;
		// let fileText = '';

		// // Handle file upload or raw body payload
		// if (req.file) fileText = req.file.buffer.toString('utf-8');
		// else if (req.body && typeof req.body === 'string') fileText = req.body;
		// else return res.status(400).json({ error: 'No file or text payload provided.' });

		// TAKES WEBSITE 1 DATA AS JSON WE WILL USE IT TO SPRING
		if (req.file) {
			try {
				bookingData = JSON.parse(req.file.buffer.toString("utf-8"));
			} catch (parseErr) {
				return res
					.status(400)
					.json({ error: "Uploaded file is not valid JSON" });
			}
		} else if (req.body && Object.keys(req.body).length > 0) {
			bookingData = req.body;
		} else {
			return res
				.status(400)
				.json({ error: "No JSON file or payload provided." });
		}

		console.log("Received request. Processing...");

		// 1. Parse structured headings
		//const structuredData = parseStructuredText(fileText);
		const structuredData = bookingData;

		if (
			typeof structuredData.referralId !== "string" ||
			!structuredData.referralId
		) {
			structuredData.referralId = `IMG-${randomUUID()}`;
		}

		// 2. Verify Data is accurate
		const verified = await Verify(structuredData);
		if (!verified.decision) {
			res.status(406).json({
				success: false,
				error: "Referral notes are not suitable.",
				message: verified.response,
			});
			return;
		}

		const result = await sendToWebsite2(structuredData);
		res.status(200).json(result);
	} catch (error) {
		console.error("Processing error:", error);
		res.status(error.statusCode || 500).json({
			success: false,
			error: error.message,
		});
	}
});

const server = app.listen(PORT, () => {
	writeFileSync(pidFile, String(process.pid));
	console.log(`Medically API running on port ${PORT}`);
});

function removePidFile() {
	if (
		existsSync(pidFile) &&
		readFileSync(pidFile, "utf8").trim() === String(process.pid)
	) {
		rmSync(pidFile);
	}
}

process.on("exit", removePidFile);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => {
		console.log(`Received ${signal}; shutting down Medically API...`);
		server.close((error) => {
			if (error) {
				console.error("Could not close the Medically API server:", error);
				process.exitCode = 1;
			}
			removePidFile();
		});
	});
}
