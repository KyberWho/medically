import cors from "cors";
import { randomUUID } from "node:crypto";
import {
        existsSync,
        mkdirSync,
        readFileSync,
        renameSync,
        rmSync,
        writeFileSync,
} from "node:fs";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
        closeDatabase,
        getPatients,
        getReferrals,
        savePatient,
        saveReferral,
} from "./database.js";

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const pidFile = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        ".medically-web.pid",
);
const sourceDirectory = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "src",
);
const htmlDirectory = path.join(sourceDirectory, "html");
const requestStoreFile = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        ".data",
        "cris-requests.json",
);

app.use(express.json());

app.use(
        cors({
                origin: (origin, callback) => {
                        const allowedOrigins = new Set([
                                "http://localhost:3030",
                                "http://127.0.0.1:3030",
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
                                )
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

app.use(express.static(sourceDirectory));
app.get("/imaging-desk", (req, res) => {
        res.sendFile(path.join(htmlDirectory, "Imaging-Desk.html"));
});
app.get("/cris", (req, res) => {
        res.sendFile(path.join(htmlDirectory, "CRIS-Radiography-Worklist.html"));
});
app.get("/api/cris/requests", (req, res) => {
        try {
                res.json({ requests: readStoredRequests() });
        } catch (error) {
                res.status(500).json({ success: false, error: error.message });
        }
});
app.get("/api/referrals", async (req, res) => {
        try {
                res.json(await getReferrals());
        } catch (error) {
                console.error("Could not retrieve referrals:", error);
                res.status(500).json({ error: "Could not retrieve referrals." });
        }
});

app.post("/api/referrals/receive", async (req, res) => {
        const data = req.body?.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
                res.status(400).json({
                        success: false,
                        error: "A referral data object is required.",
                });
                return;
        }

        try {
                const referralRecordId = await saveReferral(data);
                const referral = data.referral || {};
                const parsedReceivedAt = Date.parse(data.exportedAt);
                const request = {
                        id: data.referralId || `REQ-${randomUUID()}`,
                        status: "New",
                        receivedAt: Number.isNaN(parsedReceivedAt)
                                ? new Date().toISOString()
                                : new Date(parsedReceivedAt).toISOString(),
                        patient: data.patient,
                        referrer: data.referrer,
                        referral: {
                                hospitalDepartment: referral.hospitalDepartment || "",
                                modality: referral.modality || "",
                                area: referral.area || "",
                                clinicalDetails: referral.clinicalDetails || "",
                                severity: referral.severity || "Routine",
                        },
                };
                const requests = readStoredRequests();
                const existingRequestIndex = requests.findIndex(
                        (existingRequest) => existingRequest.id === request.id,
                );
                if (existingRequestIndex === -1) {
                        requests.push(request);
                } else {
                        request.status = requests[existingRequestIndex].status;
                        requests[existingRequestIndex] = request;
                }
                writeStoredRequests(requests);

                res.status(200).json({
                        success: true,
                        message: "Referral added to the CRIS worklist.",
                        referralId: data.referralId,
                        referralRecordId,
                        request,
                });
        } catch (error) {
                console.error("Could not receive referral:", error);
                res.status(500).json({ success: false, error: error.message });
        }
});

function readStoredRequests() {
        if (!existsSync(requestStoreFile)) return [];
        const requests = JSON.parse(readFileSync(requestStoreFile, "utf8"));
        if (!Array.isArray(requests)) {
                throw new Error("The CRIS request store must contain a JSON array.");
        }
        return requests;
}

function writeStoredRequests(requests) {
        const directory = path.dirname(requestStoreFile);
        const temporaryFile = `${requestStoreFile}.${process.pid}.tmp`;
        mkdirSync(directory, { recursive: true });
        writeFileSync(temporaryFile, JSON.stringify(requests, null, 2));
        renameSync(temporaryFile, requestStoreFile);
}

app.get("/api/patients", async (req, res) => {
        try {
                res.json(await getPatients());
        } catch (error) {
                console.error("Could not retrieve patients:", error);
                res.status(500).json({ error: "Could not retrieve patients." });
        }
});

app.post("/api/patients", async (req, res) => {
        const patient = req.body;
        if (
                !patient ||
                typeof patient.name !== "string" ||
                !patient.name.trim() ||
                typeof patient.nhsNumber !== "string" ||
                !/^\d{10}$/.test(patient.nhsNumber.replace(/\s/g, "")) ||
                typeof patient.dob !== "string" ||
                (patient.dob && !/^\d{4}-\d{2}-\d{2}$/.test(patient.dob)) ||
                typeof patient.address !== "string" ||
                typeof patient.gender !== "string" ||
                typeof patient.mobilePhone !== "string"
        ) {
                res.status(400).json({ error: "Patient details are missing or invalid." });
                return;
        }

        try {
                res.status(201).json({ patient: await savePatient(patient) });
        } catch (error) {
                console.error("Could not save patient:", error);
                res.status(500).json({ error: "Could not save patient." });
        }
});

const server = app.listen(PORT, () => {
        writeFileSync(pidFile, String(process.pid));
        console.log(`NHS Server running on port ${PORT}`);
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
                server.close(async (error) => {
                        if (error) {
                                console.error("Could not close the Medically API server:", error);
                                process.exitCode = 1;
                        }
                        try {
                                await closeDatabase();
                        } catch (databaseError) {
                                console.error(
                                        "Could not close the MariaDB connection pool:",
                                        databaseError,
                                );
                                process.exitCode = 1;
                        }
                        removePidFile();
                });
        });
}
