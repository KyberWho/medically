import { decision_prompt, text_prompt } from "./prompts.js";

function normaliseClinicalText(value) {
	return String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\b(seems|appears|looks|like|also|very|quite|just|still|really)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

const FORBIDDEN_MISMATCH_PATTERNS = [
	/booking status/i,
	/referral severity/i,
	/severity/i,
	/status/i,
	/department/i,
	/modality/i,
	/location/i,
	/appointment type/i,
	/assessment/i,
	/plan/i,
	/administrative/i,
	/metadata/i,
];

function containsForbiddenMismatch(text) {
	const cleaned = String(text ?? "").toLowerCase();
	return FORBIDDEN_MISMATCH_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function extractClinicalComparisonParts(data) {
	const booking = data?.booking ?? {};
	const consultation = data?.consultation ?? {};
	const referral = data?.referral ?? {};

	const values = [
		booking.reason,
		consultation.presentingComplaint,
		consultation.history,
		consultation.examination,
		consultation.additionalNotes,
		referral.area,
		referral.clinicalDetails,
	].filter((value) => typeof value === "string" && value.trim());

	return values.filter((value) => !containsForbiddenMismatch(value));
}

function formatMismatchMessage(message) {
	const text = String(message ?? "").trim();
	if (!text) return "";

	const lines = text
		.replace(/\r\n/g, "\n")
		.split(/\n+/)
		.flatMap((segment) =>
			segment
				.split(/\s*;\s*|\s*•\s*|\s*-\s*/)
				.map((part) => part.trim())
				.filter(Boolean),
		)
		.map((line) => line.replace(/^[-*]\s*/, ""))
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => {
			const lower = line.toLowerCase();
			if (/(matches|matching|already|same as|consistent with|aligns with|agrees with)/.test(lower)) {
				return false;
			}
			if (containsForbiddenMismatch(line)) {
				return false;
			}
			return true;
		})
		.filter((line, index, array) => {
			const deduped = line.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
			return array.findIndex((candidate) => {
				const other = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
				return other === deduped;
			}) === index;
		});

	if (!lines.length) return "";
	return lines.map((line) => `• ${line}`).join("\n");
}

export async function Verify(data) {
	if (data.skipverify) {
		return { decision: true, response: null };
	}

	const requiredFields = {
		referral: ["area", "clinicalDetails"],
		booking: ["reason"],
		consultation: ["presentingComplaint"]
	};
	const invalidFields = [];

	for (const [section, fields] of Object.entries(requiredFields)) {
		const values = data?.[section];
		if (!values || typeof values !== "object" || Array.isArray(values)) {
			invalidFields.push(section);
			continue;
		}

		for (const field of fields) {
			if (typeof values[field] !== "string" || !values[field].trim()) {
				invalidFields.push(`${section}.${field}`);
			}
		}
	}

	if (invalidFields.length) {
		return {
			decision: false,
			response: `Missing or invalid required fields: ${invalidFields.join(", ")}`,
		};
	}

	const booking = { ...data.booking };
	const consultation = { ...data.consultation };
	const referral = { ...data.referral };

	const relevantBooking = {
		reason: booking.reason ?? null,
	};
	const relevantConsultation = {
		presentingComplaint: consultation.presentingComplaint ?? null,
		history: consultation.history ?? null,
		examination: consultation.examination ?? null,
		additionalNotes: consultation.additionalNotes ?? null,
	};
	const relevantReferral = {
		area: referral.area,
		clinicalDetails: referral.clinicalDetails,
	};

	const normalisedBooking = Object.fromEntries(
		Object.entries(relevantBooking).map(([key, value]) => [key, normaliseClinicalText(value)]),
	);
	const normalisedConsultation = Object.fromEntries(
		Object.entries(relevantConsultation).map(([key, value]) => [key, normaliseClinicalText(value)]),
	);
	const normalisedReferral = Object.fromEntries(
		Object.entries(relevantReferral).map(([key, value]) => [key, normaliseClinicalText(value)]),
	);

	const context = `I am a healthcare professional about to submit a referral. The patient entered the booking reason, I recorded the consultation notes during the appointment, and I have now written the referral. Treat these abbreviations as equivalent (only refer to this if the terms appear in the booking reason, consultation notes, referral area and referral details): "F2F = face to face, FOOSH = fall on outstretched hand, ROM = range of movement, hx = history, 4/7 = 4 day history, BT = bony tenderness, LROM = limited range of movement, 3/12 = 3 month history, SOBOE = shortness of breath on exercise". Compare only these clinical details: the referral body area and clinical details against the booking reason and combined consultation notes (presenting complaint, history, examination, and additional notes). Booking reason: ${JSON.stringify(normalisedBooking.reason)}. Consultation notes: ${JSON.stringify(normalisedConsultation)}. Referral area: ${JSON.stringify(normalisedReferral.area)}. Referral clinical details: ${JSON.stringify(normalisedReferral.clinicalDetails)}. Only flag a mismatch when there is a materially different body site, complaint, timeline, mechanism, or symptom story. Ignore harmless wording differences, punctuation, grammar, spelling variants, and synonyms. Do not compare or mention booking status, appointment date/time, booking location, booking clinician, appointment type, referral severity, department, modality, assessment, plan, or any other administrative metadata. If a mismatch is already clearly described in the consultation notes, do not repeat that same issue again in the mismatch notes.`;
	const decision = await decision_prompt(
		context,
		"Ignore all administrative metadata and all non-clinical fields. Compare only the referral body area and referral clinical details with both the booking reason for appointment and the combined consultation notes. Ignore booking status, appointment date/time, location, clinician, appointment type, referral severity, department, modality, assessment, plan, and any other metadata. Ignore harmless wording differences, punctuation, grammar, spelling variants, and synonyms. Return true only when the body area and complaint story are effectively the same after normalisation; return false only for a real clinical contradiction in body site, complaint, timeline, mechanism, or symptom story. Do not mention repeated consultation-note issues twice.",
		"The referral is suitable: the body area and complaint story are consistent after normalisation. Administrative and non-clinical metadata are intentionally ignored.",
		"The referral is unsuitable because there is a clinically meaningful contradiction in the body area, complaint, timeline, mechanism, or symptom story after normalisation.",
	);
	const response = !decision
		? await text_prompt(
				context +
					". Only list the unique clinically relevant differences between the referral body area and clinical details versus the booking reason and consultation notes. Do not repeat the same issue again if it is already covered by consultation notes. Ignore booking status, severity, location, department, modality, assessment, plan, and all administrative facts. Keep it minimal and plain text only.",
			)
		: null;

	const responseText = response ?? "";
	const formattedResponse = responseText ? formatMismatchMessage(responseText) : null;
	const hasIgnoredMismatch = responseText ? FORBIDDEN_MISMATCH_PATTERNS.some((pattern) => pattern.test(responseText)) : false;

	if ((!decision && formattedResponse === "") || (!decision && hasIgnoredMismatch)) {
		return { decision: true, response: null };
	}

	return {
		decision: decision,
		response: formattedResponse,
	};
}
