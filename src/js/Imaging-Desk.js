const $ = (s) => document.querySelector(s),
	$$ = (s) => [...document.querySelectorAll(s)];
const apiBaseUrl = (() => {
	const explicit =
		window.API_BASE_URL ||
		new URLSearchParams(window.location.search).get("apiBaseUrl") ||
		new URLSearchParams(window.location.search).get("api");
	if (explicit) return explicit.replace(/\/$/, "");
	if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
		return "http://localhost:3030";
	}
	return window.location.origin;
})();
const apiUrl = (path) => `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
const schema = {
	patient: [
		["name", "Name", "text"],
		["dob", "Date of birth", "date"],
		["address", "Address", "textarea"],
		["nhsNumber", "NHS number", "text"],
		["gender", "Gender", "gender"],
		["mobilePhone", "Mobile phone", "tel"],
	],
	referrer: [
		["user", "User", "text"],
		["contactNo", "Contact no.", "tel"],
		["requestingClinician", "Requesting clinician", "text"],
		["location", "Location", "text"],
		["category", "Category", "category"],
	],
	referral: [
		["hospitalDepartment", "Hospital + department", "text"],
		["modality", "Modality (test)", "modality"],
		["area", "Area (of body)", "text"],
		["clinicalDetails", "Clinical details", "textarea"],
		["severity", "Severity", "severity"],
	],
};
schema.booking = [
	["appointmentDate", "Appointment date", "date"],
	["appointmentTime", "Appointment time", "time"],
	["appointmentType", "Appointment type", "appointmentType"],
	["location", "Booking location", "text"],
	["clinician", "Consulting clinician", "text"],
	["status", "Booking status", "bookingStatus"],
	["reason", "Reason for appointment", "textarea"],
];
schema.consultation = [
	["presentingComplaint", "Presenting complaint", "textarea"],
	["history", "History", "textarea"],
	["examination", "Examination findings", "textarea"],
	["assessment", "Assessment", "textarea"],
	["plan", "Plan", "textarea"],
	["additionalNotes", "Additional notes", "textarea"],
];
const names = {
	patient: "Patient details",
	referrer: "Referrer details",
	referral: "Referral details",
	booking: "Booking details",
	consultation: "Consultation notes",
};
const defaults = {
	user: "Dr Alex Patel",
	contactNo: "020 7946 0958",
	requestingClinician: "Dr Alex Patel",
	location: "Riverside Medical Practice",
	category: "General practice",
};
const blank = (k) => Object.fromEntries(schema[k].map(([f]) => [f, ""]));
const seed = [
	[
		"Amelia Thompson",
		"1985-04-12",
		"14 Meadow Lane, London, SE10 8AB",
		"900 000 0001",
		"Female",
		"07700 900101",
	],
	[
		"James Wilson",
		"1967-09-23",
		"27 Willow Road, London, SE10 8CD",
		"900 000 0002",
		"Male",
		"07700 900102",
	],
	[
		"Olivia Bennett",
		"1992-01-08",
		"8 Park Avenue, London, SE10 8EF",
		"900 000 0003",
		"Female",
		"07700 900103",
	],
	[
		"William Davies",
		"1954-11-16",
		"52 Oak Crescent, London, SE10 8GH",
		"900 000 0004",
		"Male",
		"07700 900104",
	],
	[
		"Isla Robinson",
		"1978-06-30",
		"3 Birch Close, London, SE10 8JK",
		"900 000 0005",
		"Female",
		"07700 900105",
	],
	[
		"George Mitchell",
		"1989-03-05",
		"19 Elm Street, London, SE10 8LM",
		"900 000 0006",
		"Male",
		"07700 900106",
	],
].map((v, i) => ({
	id: "demo-" + i,
	...Object.fromEntries(schema.patient.map(([k], j) => [k, v[j]])),
}));
let state = {
		patients: seed,
		draft: {
			patient: blank("patient"),
			referrer: { ...defaults },
			referral: blank("referral"),
		},
		selectedId: null,
	},
	exports = 0;
try {
	const v = JSON.parse(localStorage.getItem("imaging-desk-v1"));
	if (v?.patients && v?.draft) state = v;
} catch {}
state.encounters ||= {};
state.draft.booking ||= blank("booking");
state.draft.consultation ||= blank("consultation");
let openPatientId = null;
const esc = (v) =>
	String(v ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);
const formatDate = (v) =>
	v
		? new Date(v + "T12:00:00").toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			})
		: "—";
function toast(t) {
	$("#toast").textContent = t;
	$("#toast").style.display = "block";
	clearTimeout(window.toastTimer);
	window.toastTimer = setTimeout(
		() => ($("#toast").style.display = "none"),
		4500,
	);
}
function save() {
	try {
		localStorage.setItem("imaging-desk-v1", JSON.stringify(state));
	} catch {
		toast("Storage unavailable. Export your details before closing.");
	}
	overview();
}
function download(name, text, type) {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function switchTab(k) {
	$$(".view").forEach((v) => (v.hidden = v.id !== k));
	$$("[data-tab]").forEach((b) => {
		b.classList.toggle(
			"active",
			b.dataset.tab === (k === "consultation" ? "log" : k),
		);
		b.setAttribute(
			"aria-current",
			b.dataset.tab === (k === "consultation" ? "log" : k) ? "page" : "false",
		);
	});
	$("#crumb").textContent = {
		log: "Patient Log",
		referral: "Referral",
		review: "Review",
		consultation: "Booking & consultation",
	}[k];
	if (k === "review") review();
	if (k === "log") patients();
	window.scrollTo({ top: 0, behavior: "smooth" });
}
function patients() {
	const q = $("#search").value.toLowerCase().replace(/\s/g, "");
	const ps = state.patients.filter((p) =>
		(p.name + p.nhsNumber).toLowerCase().replace(/\s/g, "").includes(q),
	);
	$("#patients").innerHTML =
		ps
			.map(
				(p) =>
					`<tr data-id="${esc(p.id)}"><td><span class="avatar tone${state.patients.indexOf(p) % 4}">${esc(
						p.name
							.split(" ")
							.map((n) => n[0])
							.slice(0, 2)
							.join(""),
					)}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.address)}</small></div></td><td>${formatDate(p.dob)}</td><td>${esc(p.nhsNumber)}</td><td><span class="gender">${esc(p.gender)}</span></td><td>${esc(p.mobilePhone)}</td><td><button class="row-button" aria-label="Open booking and consultation for ${esc(p.name)}">→</button></td></tr>`,
			)
			.join("") ||
		'<tr><td colspan="6" class="empty">No patients found. Try another search or add a patient.</td></tr>';
	$("#results").textContent =
		`Showing ${ps.length} of ${state.patients.length} patients`;
	["#count", "#total", "#total-pill"].forEach(
		(s) => ($(s).textContent = state.patients.length),
	);
	$$("[data-id]").forEach(
		(row) => (row.onclick = () => openPatient(row.dataset.id)),
	);
}

const options = {
	appointmentType: ["Face-to-face", "Telephone", "Video", "Home visit"],
	bookingStatus: ["Planned", "Booked", "Arrived", "Completed", "Cancelled"],
	gender: ["Female", "Male", "Non-binary", "Other", "Not specified"],
	category: [
		"General practice",
		"Community care",
		"Outpatient",
		"Inpatient",
		"Other",
	],
	modality: [
		"X-ray",
		"Ultrasound",
		"CT",
		"MRI",
		"Mammography",
		"Fluoroscopy",
		"Nuclear medicine",
		"Other",
	],
	severity: ["Routine", "Urgent", "Emergency"],
};
function field(section, [k, label, type], value, prefix = "draft") {
	const id = `${prefix}-${section}-${k}`;
	let attrs = `id="${id}" name="${k}" data-section="${section}" ${["booking", "consultation"].includes(section) ? "" : "required"}`;
	if (type === "date" && section === "patient")
		attrs += ` max="${new Date().toISOString().slice(0, 10)}"`;
	if (k === "nhsNumber")
		attrs +=
			' inputmode="numeric" pattern="[0-9 ]{10,13}" title="Enter 10 digits, optionally separated by spaces"';
	let control = options[type]
		? `<select ${attrs}><option value="">Select ${label.toLowerCase()}</option>${[...new Set([...options[type], ...(value ? [value] : [])])].map((v) => `<option ${v === value ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`
		: type === "textarea"
			? `<textarea ${attrs} rows="${section === "referral" ? 5 : 2}">${esc(value)}</textarea>`
			: `<input ${attrs} type="${type}" value="${esc(value)}">`;
	return `<label for="${id}" class="field ${type === "textarea" || k === "hospitalDepartment" ? "wide" : ""}">${label}${control}</label>`;
}
function forms() {
	$("#sections").innerHTML = Object.entries(schema)
		.map(
			([key, defs], i) =>
				`<section class="card form-card"><div class="section-head"><h2><span class="number">0${i + 1}</span>${names[key]}</h2><button type="button" class="text" data-export="${key}">↓ Export ${key} details</button></div><div class="fields">${defs.map((f) => field(key, f, state.draft[key][f[0]])).join("")}</div></section>`,
		)
		.join("");
	$$(
		"#referral-form input,#referral-form textarea,#referral-form select",
	).forEach(
		(el) =>
			(el.oninput = () => {
				state.draft[el.dataset.section][el.name] = el.value;
				save();
			}),
	);
	$$("[data-export]").forEach(
		(b) =>
			(b.onclick = () => {
				const key = b.dataset.export;
				download(
					key + "-details.txt",
					textFor(key),
					"text/plain;charset=utf-8",
				);
				toast(names[key] + " exported as text");
			}),
	);
	overview();
}
function textFor(key) {
	return (
		names[key] +
		"\n" +
		"=".repeat(names[key].length) +
		"\n\n" +
		schema[key]
			.map(([k, label]) => label + ": " + state.draft[key][k])
			.join("\n") +
		"\n"
	);
}
function overview() {
	$("#draft-status").textContent = state.draft.patient.name
		? "In progress"
		: "Not started";
	$("#exports").textContent = exports;
	$("#selected").textContent = state.draft.patient.name || "New patient";
	$("#selected-nhs").textContent = state.draft.patient.nhsNumber
		? "NHS " + state.draft.patient.nhsNumber
		: "Enter patient details to begin";
	$("#progress").innerHTML = Object.entries(schema)
		.map(([k, defs]) => {
			const n = defs.filter(([f]) =>
				String(state.draft[k][f] || "").trim(),
			).length;
			return `<div class="progress-row"><span>${names[k]}</span><span>${n === defs.length ? "✓ Complete" : n + " / " + defs.length}</span></div>`;
		})
		.join("");
}
function errors() {
	const list = Object.entries(schema)
		.filter(([section]) => !["booking", "consultation"].includes(section))
		.flatMap(([section, defs]) =>
			defs
				.filter(([k]) => !String(state.draft[section][k] || "").trim())
				.map(([k, label]) => names[section] + ": " + label),
		);
	const p = state.draft.patient;
	if (p.nhsNumber && !/^\d{10}$/.test(p.nhsNumber.replace(/\s/g, "")))
		list.push("NHS number must contain 10 digits");
	if (p.dob && p.dob > new Date().toISOString().slice(0, 10))
		list.push("Date of birth cannot be in the future");
	return list;
}
function payload() {
	return {
		schemaVersion: "1.1",
		referralId: state.draft.referralId || null,
		exportedAt: new Date().toISOString(),
		patient: { ...state.draft.patient },
		referrer: { ...state.draft.referrer },
		referral: { ...state.draft.referral },
		booking: { ...state.draft.booking },
		consultation: { ...state.draft.consultation },
	};
}
function review() {
	const e = errors();
	$("#status").className = "status" + (e.length ? " warning" : "");
	$("#status").textContent = e.length
		? `Complete ${e.length} item${e.length === 1 ? "" : "s"} before exporting: ${e.join("; ")}.`
		: "✓ All sections are complete. Check the details below before exporting.";
	$("#export").disabled = !!e.length;
	$("#review-cards").innerHTML = Object.entries(schema)
		.map(
			([key, defs], i) =>
				`<section class="card review-card"><div class="section-head"><h2><span class="number">0${i + 1}</span>${names[key]}</h2><button class="text" data-edit="${key}">Edit ↗</button></div><dl>${defs.map(([k, label]) => `<div><dt>${label}</dt><dd>${esc(k === "dob" ? formatDate(state.draft[key][k]) : state.draft[key][k] || "Not provided")}</dd></div>`).join("")}</dl></section>`,
		)
		.join("");
	$$("[data-edit]").forEach(
		(b) =>
			(b.onclick = () => {
				switchTab("referral");
				$(`#draft-${b.dataset.edit}-${schema[b.dataset.edit][0][0]}`).focus();
			}),
	);
	$("#json").textContent = JSON.stringify(payload(), null, 2);
}
$$("[data-tab]").forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
$(".brand").onclick = (e) => {
	e.preventDefault();
	switchTab("log");
};
$("#search").oninput = patients;
$("#review-button").onclick = () => switchTab("review");
$("#edit").onclick = () => switchTab("referral");
$("#referral-form").onsubmit = (e) => e.preventDefault();
$("#blank").onclick = () => {
	if (
		state.draft.patient.name &&
		!confirm("Start a blank referral? Your current draft will be replaced.")
	)
		return;
	state.selectedId = null;
	state.draft = {
		patient: blank("patient"),
		referrer: { ...state.draft.referrer },
		referral: blank("referral"),
		booking: blank("booking"),
		consultation: blank("consultation"),
	};
	save();
	forms();
	switchTab("referral");
};
$("#export").onclick = () => {
	if (errors().length) {
		review();
		return;
	}
	state.draft.referralId ||= "IMG-" + crypto.randomUUID();
	save();
	download(
		"imaging-referral-" +
			state.draft.patient.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
			".json",
		JSON.stringify(payload(), null, 2),
		"application/json",
	);
	exports++;
	overview();
	review();
	toast("JSON downloaded. Ready to import into your receiving application.");
};
$("#add-fields").innerHTML = schema.patient
	.map((f) => field("patient", f, "", "new"))
	.join("");
$("#add").onclick = () => {
	$("#add-form").reset();
	$("#modal").showModal();
};
$("#close").onclick = $("#cancel").onclick = () => $("#modal").close();
$("#new-patient-nhsNumber").oninput = (e) => e.target.setCustomValidity("");
$("#add-form").onsubmit = (e) => {
	e.preventDefault();
	const p = Object.fromEntries(new FormData(e.target));
	const nhs = p.nhsNumber.replace(/\s/g, "");
	const message = !/^\d{10}$/.test(nhs)
		? "Enter exactly 10 digits."
		: state.patients.some((x) => x.nhsNumber.replace(/\s/g, "") === nhs)
			? "This NHS number is already in your log."
			: "";
	if (message) {
		$("#new-patient-nhsNumber").setCustomValidity(message);
		$("#new-patient-nhsNumber").reportValidity();
		return;
	}
	state.patients.push({ ...p, id: crypto.randomUUID() });
	save();
	patients();
	$("#modal").close();
	toast(p.name + " added to your patient log");
};
$("#reset").onclick = () => {
	if (
		confirm("Clear saved patients and draft, and restore the demo workspace?")
	) {
		localStorage.removeItem("imaging-desk-v1");
		location.reload();
	}
};
async function submitReferral(skipverify = false) {
	window.scrollTo({ top: 0, behavior: "smooth" });
	if (errors().length) {
		review();
		return;
	}
	const button = $("#submit-referral");
	const overrideButton = $("#confirm-submit-referral");
	const status = $("#status");
	button.disabled = true;
	overrideButton.disabled = true;
	overrideButton.hidden = true;
	status.className = "status";
	status.textContent = "Submitting referral…";
	try {
		state.draft.referralId ||= "IMG-" + crypto.randomUUID();
		save();
		const submission = {
			...payload(),
			...(skipverify ? { skipverify: true } : {}),
		};
		const response = await fetch(apiUrl("/api/process-file"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(submission),
		});
		let result;
		try {
			result = await response.json();
		} catch {
			throw new Error(
				`The server returned an invalid response (HTTP ${response.status}).`,
			);
		}
		if (!response.ok || result.success === false) {
			status.className = "status warning";
			const issueLines = [result.error, result.message].filter(Boolean);
			status.textContent =
				issueLines.length > 0
					? issueLines.join("\n\n")
					: `The referral could not be submitted (HTTP ${response.status}).`;
			if (
				!skipverify &&
				result.error === "Referral notes are not suitable." &&
				!String(result.message || "").startsWith(
					"Missing or invalid required fields:",
				)
			)
				overrideButton.hidden = false;
			return;
		}
		status.className = "status";
		status.textContent = `Referral accepted and added to the CRIS worklist.${result.message ? ` ${result.message}` : ""}`;
	} catch (error) {
		status.className = "status warning";
		status.textContent = `Could not submit referral: ${error.message}`;
	} finally {
		button.disabled = false;
		overrideButton.disabled = false;
	}
}
function addSubmitButton() {
	const exportButton = $("#export");
	const button = document.createElement("button");
	button.type = "button";
	button.id = "submit-referral";
	button.className = "primary";
	button.textContent = "Submit referral";
	const overrideButton = document.createElement("button");
	overrideButton.type = "button";
	overrideButton.id = "confirm-submit-referral";
	overrideButton.className = "secondary";
	overrideButton.textContent =
		"I reviewed the changes and confirm this referral is accurate — submit anyway";
	overrideButton.hidden = true;
	const parent = exportButton.parentElement;
	parent.insertBefore(button, exportButton);
	parent.insertBefore(overrideButton, exportButton);
	parent.querySelector("small").textContent =
		"Submit through the referral processing API or export a JSON copy.";
	button.onclick = () => submitReferral();
	overrideButton.onclick = () => submitReferral(true);
}
patients();
forms();
addSubmitButton();

function encounterFor(id) {
	return (state.encounters[id] ||= {
		booking: {
			...blank("booking"),
			location: defaults.location,
			clinician: defaults.requestingClinician,
			status: "Planned",
		},
		consultation: blank("consultation"),
	});
}
function openPatient(id) {
	openPatientId = id;
	const p = state.patients.find((p) => p.id === id);
	if (!p) return;
	const record = encounterFor(id);
	$("#encounter-patient").textContent = p.name;
	$("#encounter-summary").innerHTML = schema.patient
		.map(
			([k, l]) =>
				`<div><small>${l}</small><strong>${esc(k === "dob" ? formatDate(p[k]) : p[k])}</strong></div>`,
		)
		.join("");
	$("#encounter-sections").innerHTML = ["booking", "consultation"]
		.map(
			(key, i) =>
				`<section class="card form-card"><div class="section-head"><h2><span class="number">0${i + 1}</span>${names[key]}</h2><span class="saved-label">Saved in this browser</span></div><div class="fields">${schema[key].map((f) => field(key, f, record[key][f[0]], "encounter")).join("")}</div></section>`,
		)
		.join("");
	$$(
		"#encounter-form input,#encounter-form select,#encounter-form textarea",
	).forEach(
		(el) =>
			(el.oninput = () => {
				record[el.dataset.section][el.name] = el.value;
				save();
			}),
	);
	switchTab("consultation");
}
function makeReferral() {
	const p = state.patients.find((p) => p.id === openPatientId);
	if (!p) return;
	const record = encounterFor(openPatientId);
	if (
		state.selectedId !== openPatientId &&
		Object.values(state.draft.referral).some((v) => String(v).trim()) &&
		!confirm(
			"Replace the current referral draft with this patient and consultation?",
		)
	)
		return;
	const same = state.selectedId === openPatientId;
	const previous = same ? state.draft.referral : blank("referral");
	const notes = schema.consultation
		.filter(([k]) => record.consultation[k].trim())
		.map(([k, l]) => l + ": " + record.consultation[k])
		.join("\n\n");
	state.draft = {
		patient: Object.fromEntries(schema.patient.map(([k]) => [k, p[k]])),
		referrer: { ...state.draft.referrer },
		referral: {
			...previous,
			clinicalDetails: notes || previous.clinicalDetails,
		},
		booking: { ...record.booking },
		consultation: { ...record.consultation },
	};
	state.selectedId = openPatientId;
	save();
	forms();
	switchTab("referral");
	toast(
		"Patient, booking details and consultation notes copied to the referral.",
	);
}
$("#make-referral").onclick = makeReferral;
$("#back-log").onclick = () => switchTab("log");
$("#encounter-form").onsubmit = (e) => e.preventDefault();
