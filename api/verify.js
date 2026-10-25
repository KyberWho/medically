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

const BODY_SITE_TERMS = new Set([
	"leg", "knee", "ankle", "foot", "hip", "thigh", "shin", "calf", "toe",
	"arm", "wrist", "hand", "elbow", "shoulder", "forearm", "finger",
	"back", "neck", "spine", "pelvis", "abdomen", "chest", "head", "face",
	"groin", "hip", "buttock", "heel", "sole"
]);
const TIME_MARKERS = new Set([
	"day", "days", "week", "weeks", "month", "months", "year", "years",
	"acute", "chronic", "sudden", "gradual", "recent", "new", "ongoing"
]);
const MECHANISM_TERMS = new Set([
	"fracture", "fractured", "sprain", "strain", "twist", "twisted", "fall",
	"foosh", "injury", "trauma", "dislocation", "broken", "broke", "impact"
]);
const GENERIC_NEGATIONS = new Set(["fine", "normal", "ok", "okay", "unremarkable", "no issue", "no pain"]);

function extractTerms(text) {
	return new Set(
		normaliseClinicalText(text)
			.split(/\s+/)
			.filter(Boolean),
	);
}

function hasTimeExpression(text) {
	if (!text) return false;
	const normalised = normaliseClinicalText(text);
	if (/\d+\/\d+|\d+\s*(day|days|week|weeks|month|months|year|years)/.test(normalised)) return true;
	return [...TIME_MARKERS].some((term) => normalised.includes(term));
}

function hasBodySiteExpression(text) {
	if (!text) return false;
	const terms = extractTerms(text);
	return [...BODY_SITE_TERMS].some((term) => terms.has(term));
}

function hasMechanismExpression(text) {
	if (!text) return false;
	const terms = extractTerms(text);
	return [...MECHANISM_TERMS].some((term) => terms.has(term));
}

function hasExplicitClinicalConflict(sourceTexts) {
	const combined = sourceTexts.filter(Boolean).join(" ");
	const bodySites = [...BODY_SITE_TERMS].filter((term) => combined.includes(term));
	if (bodySites.length === 0) return false;
	return bodySites.length > 1 || /\b(?:leg|arm|knee|ankle|foot|wrist|shoulder|back|neck|head|abdo|abdomen|chest)\b/.test(combined);
}

function supportsMismatchLine(line, comparisonContext = {}) {
	const lower = String(line ?? "").toLowerCase();
	if (/(matches|matching|already|same as|consistent with|aligns with|agrees with)/.test(lower)) {
		return false;
	}
	if (containsForbiddenMismatch(line)) {
		return false;
	}

	const bookingText = comparisonContext.bookingReason ?? "";
	const consultationText = comparisonContext.consultationText ?? "";
	const referralArea = comparisonContext.referralArea ?? "";
	const referralDetails = comparisonContext.referralDetails ?? "";
	const allClinicalText = [bookingText, consultationText, referralArea, referralDetails].join(" ");

	if (/timeline|timeframe|duration|history/i.test(lower)) {
		const hasTimelineInSource = hasTimeExpression(bookingText) || hasTimeExpression(consultationText) || hasTimeExpression(referralArea) || hasTimeExpression(referralDetails);
		if (!hasTimelineInSource) return false;
	}

	if (/body site|site mismatch|different body|location mismatch|body part/i.test(lower)) {
		const bodySiteTermsInSource = [bookingText, consultationText, referralArea, referralDetails].filter((value) => hasBodySiteExpression(value));
		if (bodySiteTermsInSource.length === 0) return false;
		const bookingSites = extractTerms(bookingText);
		const referralSites = extractTerms(referralArea + " " + referralDetails);
		const overlap = [...BODY_SITE_TERMS].filter((term) => bookingSites.has(term) && referralSites.has(term));
		if (overlap.length > 0) return false;
		if (!bodySiteTermsInSource.some((value) => value && /\b(?:leg|arm|knee|ankle|foot|wrist|shoulder|back|neck|head|abdomen|chest)\b/.test(normaliseClinicalText(value)))) {
			return false;
		}
	}

	if (/mechanism|cause|injury mechanism/i.test(lower)) {
		const hasMechanismInSource = hasMechanismExpression(bookingText) || hasMechanismExpression(consultationText) || hasMechanismExpression(referralArea) || hasMechanismExpression(referralDetails);
		if (!hasMechanismInSource) return false;
	}

	if (/symptom story|symptom pattern|story mismatch|complaint mismatch/i.test(lower)) {
		const sourceText = normaliseClinicalText(allClinicalText);
		if (!sourceText || /\b(?:fine|normal|okay|ok|unremarkable)\b/.test(sourceText)) return false;
	}

	if (/\b(?:fine|normal|okay|ok|unremarkable|no issue|no pain)\b/.test(lower)) {
		return false;
	}

	return true;
}

function formatMismatchMessage(message, comparisonContext = {}) {
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
		.filter((line) => supportsMismatchLine(line, comparisonContext))
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
		booking: [
			"appointmentDate",
			"appointmentTime",
			"appointmentType",
			"location",
			"clinician",
			"status",
			"reason",
		],
		consultation: [
			"presentingComplaint",
			"history",
			"examination",
			"assessment",
			"plan",
			"additionalNotes",
		],
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
		reason: booking.reason,
	};
	const relevantConsultation = {
		presentingComplaint: consultation.presentingComplaint,
		history: consultation.history,
		examination: consultation.examination,
		additionalNotes: consultation.additionalNotes,
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

	const context = `I am a healthcare professional about to submit a referral. The patient entered the booking reason, I recorded the consultation notes during the appointment, and I have now written the referral. Treat these abbreviations as equivalent: F2F = face to face, FOOSH = fall on outstretched hand, ROM = range of movement, hx = history, 4/7 = 4 day history, BT = bony tenderness, LROM = limited range of movement, 3/12 = 3 month history, SOBOE = shortness of breath on exercise. Compare only these clinical details: the referral body area and clinical details against the booking reason and combined consultation notes (presenting complaint, history, examination, and additional notes). Booking reason: ${JSON.stringify(normalisedBooking.reason)}. Consultation notes: ${JSON.stringify(normalisedConsultation)}. Referral area: ${JSON.stringify(normalisedReferral.area)}. Referral clinical details: ${JSON.stringify(normalisedReferral.clinicalDetails)}. Only flag a mismatch when there is a materially different body site, complaint, timeline, mechanism, or symptom story. Ignore harmless wording differences, punctuation, grammar, spelling variants, and synonyms. Do not compare or mention booking status, appointment date/time, booking location, booking clinician, appointment type, referral severity, department, modality, assessment, plan, or any other administrative metadata. If a mismatch is already clearly described in the consultation notes, do not repeat that same issue again in the mismatch notes.`;
	let decision;
	try {
		decision = await decision_prompt(
			context,
			"Ignore all administrative metadata and all non-clinical fields. Compare only the referral body area and referral clinical details with both the booking reason for appointment and the combined consultation notes. Ignore booking status, appointment date/time, location, clinician, appointment type, referral severity, department, modality, assessment, plan, and any other metadata. Ignore harmless wording differences, punctuation, grammar, spelling variants, and synonyms. Return true only when the body area and complaint story are effectively the same after normalisation; return false only for a real clinical contradiction in body site, complaint, timeline, mechanism, or symptom story. Do not mention repeated consultation-note issues twice.",
			"The referral is suitable: the body area and complaint story are consistent after normalisation. Administrative and non-clinical metadata are intentionally ignored.",
			"The referral is unsuitable because there is a clinically meaningful contradiction in the body area, complaint, timeline, mechanism, or symptom story after normalisation.",
		);
	} catch (error) {
		console.warn(`AI verification unavailable; allowing referral through by default: ${error.message}`);
		decision = true;
	}
	const response = !decision
		? await text_prompt(
				context +
					". Only list the unique clinically relevant differences between the referral body area and clinical details versus the booking reason and consultation notes. Do not repeat the same issue again if it is already covered by consultation notes. Ignore booking status, severity, location, department, modality, assessment, plan, and all administrative facts. Keep it minimal and plain text only.",
			)
		: null;

	const responseText = response ?? "";
	const formattedResponse = responseText
		? formatMismatchMessage(responseText, {
				bookingReason: normalisedBooking.reason,
				consultationText: [
					normalisedConsultation.presentingComplaint,
					normalisedConsultation.history,
					normalisedConsultation.examination,
					normalisedConsultation.additionalNotes,
				].join(" "),
				referralArea: normalisedReferral.area,
				referralDetails: normalisedReferral.clinicalDetails,
			})
		: null;
	const hasIgnoredMismatch = responseText ? FORBIDDEN_MISMATCH_PATTERNS.some((pattern) => pattern.test(responseText)) : false;

	if ((!decision && formattedResponse === "") || (!decision && hasIgnoredMismatch)) {
		return { decision: true, response: null };
	}

	return {
		decision: decision,
		response: formattedResponse,
	};
}
