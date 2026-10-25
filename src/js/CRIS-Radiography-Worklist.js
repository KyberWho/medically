"use strict";
const $ = (s) => document.querySelector(s),
	esc = (v) =>
		String(v ?? "").replace(
			/[&<>"']/g,
			(c) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[c],
		);
const apiBaseUrl = (() => {
	const explicit =
		window.API_BASE_URL ||
		new URLSearchParams(window.location.search).get("apiBaseUrl") ||
		new URLSearchParams(window.location.search).get("api");
	if (explicit) return explicit.replace(/\/$/, "");
	return window.location.origin;
})();
const apiUrl = (path) => `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
const statuses = ["New", "Waiting", "Appointed", "Completed", "Rejected"],
	severities = ["Routine", "Urgent", "Emergency"];
const example = {
	id: "REQ-2026-001",
	receivedAt: "2026-10-24T09:15:00Z",
	status: "New",
	patient: {
		name: "Alex Morgan",
		dob: "1985-06-12",
		address: "12 Example Road, Birmingham, B1 1AA",
		nhsNumber: "DEMO 000 001",
		gender: "Female",
		mobilePhone: "07700 900001",
	},
	referrer: {
		user: "demo.referrer",
		contactNo: "0121 000 0001",
		requestingClinician: "Dr Sam Taylor",
		location: "Emergency department",
		category: "Inpatient",
	},
	referral: {
		hospital: "Example General Hospital",
		department: "Radiology",
		modality: "CT",
		area: "Head",
		clinicalDetails:
			"Synthetic training case: persistent headache following a fall. Please assess.",
		severity: "Urgent",
	},
};
const names = [
	"Alex Morgan",
	"Oliver Bennett",
	"Amelia Clarke",
	"George Wilson",
	"Isla Thompson",
	"Noah Patel",
	"Ava Robinson",
	"Arthur Davies",
	"Mia Edwards",
	"Leo Williams",
	"Sophia Ahmed",
	"Henry Lewis",
];
let requests = names.map((name, i) => ({
	...structuredClone(example),
	id: `REQ-2026-${String(i + 1).padStart(3, "0")}`,
	receivedAt: `2026-10-24T${String(10 - Math.floor(i / 4)).padStart(2, "0")}:${String(54 - (i % 4) * 12).padStart(2, "0")}:00Z`,
	status: [
		"New",
		"New",
		"New",
		"New",
		"Waiting",
		"New",
		"Appointed",
		"Waiting",
		"Completed",
		"Appointed",
		"Rejected",
		"New",
	][i],
	patient: {
		...example.patient,
		name,
		dob: ["1985-06-12", "1959-02-21", "1992-11-04", "1974-08-17"][i % 4],
		nhsNumber: `DEMO 000 ${String(i + 1).padStart(3, "0")}`,
		gender: i % 2 ? "Male" : "Female",
	},
	referrer: {
		...example.referrer,
		requestingClinician: [
			"Dr Sam Taylor",
			"Dr Priya Shah",
			"Dr James Mitchell",
			"Dr Emily Chen",
		][i % 4],
		location: ["Emergency department", "Ward 4B", "GP practice", "Outpatients"][
			i % 4
		],
		category: ["Inpatient", "Inpatient", "GP", "Outpatient"][i % 4],
	},
	referral: {
		...example.referral,
		modality: ["CT", "X-ray", "MRI", "Ultrasound"][i % 4],
		area: ["Head", "Chest", "Lumbar spine", "Abdomen"][i % 4],
		severity: [
			"Urgent",
			"Routine",
			"Urgent",
			"Routine",
			"Routine",
			"Emergency",
			"Routine",
			"Urgent",
			"Routine",
			"Routine",
			"Routine",
			"Routine",
		][i],
		clinicalDetails: [
			"Synthetic training case: persistent headache following a fall. Please assess.",
			"Synthetic training case: ongoing cough and shortness of breath.",
			"Synthetic training case: lower back pain with radiating symptoms.",
			"Synthetic training case: intermittent abdominal pain.",
		][i % 4],
	},
}));
let tab = "All requests",
	search = "",
	modality = "",
	severity = "",
	sortNewest = true,
	page = 1;
const size = 50;
const date = (s) => {
	if (!s) return "Not provided";
	const d = new Date(s);
	return Number.isNaN(+d)
		? s
		: d.toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			});
};
const badge = (s) =>
	`<span class="badge ${esc(s.toLowerCase())}">${esc(s)}</span>`;
const modalities = () =>
	[...new Set(requests.map((r) => r.referral.modality))].sort();
const count = (s) => requests.filter((r) => r.status === s).length;
function toast(s) {
	$("#toast").textContent = s;
	$("#toast").style.display = "block";
	clearTimeout(toast.timer);
	toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4000);
}
function download(data, name) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		}),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filtered() {
	return requests
		.filter(
			(r) =>
				(tab === "All requests" || r.status === tab) &&
				(!modality || r.referral.modality === modality) &&
				(!severity ||
					(severity === "Urgent + Emergency"
						? ["Urgent", "Emergency"].includes(r.referral.severity)
						: r.referral.severity === severity)) &&
				(!search ||
					[
						r.patient.name,
						r.patient.nhsNumber,
						r.id,
						r.referral.area,
						r.referral.modality,
						r.referrer.requestingClinician,
					].some((v) => v.toLowerCase().includes(search.toLowerCase()))),
		)
		.sort((a, b) =>
			sortNewest
				? b.receivedAt.localeCompare(a.receivedAt)
				: a.receivedAt.localeCompare(b.receivedAt),
		);
}
let selectedId = requests[0]?.id,
	patientTab = "details",
	bookDate = new Date(),
	bookView = "day",
	roomFilter = new Set(["CDCR1", "CDCR2", "CDCT1", "CDCT2"]),
	weekRoom = "CDCR1",
	show24 = false,
	chosenRequest = null,
	foldIncoming = false;
const allRooms = ["CDCR1", "CDCR2", "CDCT1", "CDCT2"];
bookDate.setHours(12, 0, 0, 0);
function dateKey(d) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function time(r) {
	return new Date(r.receivedAt).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}
function current() {
	return requests.find((r) => r.id === selectedId);
}
function route(hash = "") {
	location.hash = hash;
	render();
}
function closeMenus() {
	document.querySelectorAll(".menu").forEach((m) => (m.hidden = true));
}
function goWorklist() {
	patientTab = "details";
	route("");
}
function showPatient(id = selectedId) {
	if (!id || !requests.some((r) => r.id === id)) {
		toast("No patient selected. Import or select a request.");
		return;
	}
	selectedId = id;
	patientTab = "details";
	route(encodeURIComponent(id));
}
function chrome(r, active = "Worklist") {
	const p = r?.patient;
	return `<div class="patient-head"><h1>${p ? esc(p.name).toUpperCase() : "INCOMING IMAGING REQUESTS"}</h1><div class="patient-meta">${p ? `Born <b>${esc(date(p.dob))}</b> &nbsp; Sex <b>${esc(p.gender || "Not provided")}</b> &nbsp; NHS <b>${esc(p.nhsNumber || "Not provided")}</b>` : "Radiographer worklist &nbsp; Hospital: <b>DEMO01</b>"}</div></div><div class="info-strip"><div><label>Address</label><strong>${p ? esc(p.address || "Not provided") : "All incoming imaging referrals"}</strong></div><div><label>Contact</label>${p ? esc(p.mobilePhone || "Not provided") : "Radiology department"}</div><div><label>${p ? "Location" : "Records"}</label>${p ? esc(r.referrer.location || "Not provided") : requests.length + " requests"}</div><div><label>${p ? "Request" : "Data"}</label>${p ? esc(r.id) : "Synthetic demonstration"}</div></div><div class="tabs"><button id="tabMenu">Menu</button><button id="tabWorklist" class="${active === "Worklist" ? "selected" : ""}">Worklist</button><button id="tabPatient" class="${active === "Patient Details" ? "selected" : ""}">Patient Details</button><button id="tabBook" class="${active === "Appointment Book" ? "selected" : ""}">Appointment Book</button><button id="tabEvents" class="${active === "Events" ? "selected" : ""}">Events</button></div>`;
}
function bindTabs() {
	$("#tabMenu").onclick = () => {
		$("#fileMenu").hidden = !$("#fileMenu").hidden;
	};
	$("#tabWorklist").onclick = goWorklist;
	$("#tabPatient").onclick = () => showPatient();
	$("#tabBook").onclick = () => route("book");
	$("#tabEvents").onclick = () => {
		if (!current()) {
			goWorklist();
			return;
		}
		patientTab = "events";
		route(encodeURIComponent(selectedId));
	};
}
function render() {
	closeMenus();
	$("#navCount").textContent =
		`${requests.length} request${requests.length === 1 ? "" : "s"}`;
	let id;
	try {
		id = decodeURIComponent(location.hash.slice(1));
	} catch {
		id = "";
	}
	if (id === "book") {
		booking();
		return;
	}
	if (id) {
		selectedId = id;
		detail(id);
		return;
	}
	$("#crumb").textContent = "List of incoming imaging requests";
	$("#main").innerHTML =
		chrome(null) +
		`<div class="filters"><label for="search">Patient / NHS No</label><input id="search" type="search" value="${esc(search)}" aria-label="Search requests"><label for="modality">Modality</label><select id="modality"><option value="">All</option>${modalities()
			.map(
				(m) => `<option ${m === modality ? "selected" : ""}>${esc(m)}</option>`,
			)
			.join(
				"",
			)}</select><label for="severity">Priority</label><select id="severity"><option value="">All</option>${[...severities, "Urgent + Emergency"].map((s) => `<option ${s === severity ? "selected" : ""}>${s}</option>`).join("")}</select><label for="statusFilter">Status</label><select id="statusFilter">${["All requests", ...statuses].map((s) => `<option ${s === tab ? "selected" : ""}>${s}</option>`).join("")}</select><button id="clear">Clear</button><span class="filter-spacer"></span><button id="import">Import JSON</button><button id="export">Export JSON</button></div>${tableShell()}<div class="table-bottom"><span id="tableCount"></span><span>Click a patient to view the complete request.</span><span><button id="prev">&lt;&lt; Previous</button> <span id="pageInfo"></span> <button id="next">Next &gt;&gt;</button></span></div><div class="status-legend"><span class="new">New / waiting request</span><span class="appointed">Pending appointment</span><span class="completed">Event / completed study</span><span class="rejected">Rejected request</span></div>`;
	bindTabs();
	$("#import").onclick = openImport;
	$("#export").onclick = () => download(requests, "imaging-requests.json");
	$("#search").oninput = (e) => {
		search = e.target.value;
		page = 1;
		rows();
	};
	$("#modality").onchange = (e) => {
		modality = e.target.value;
		page = 1;
		rows();
	};
	$("#severity").onchange = (e) => {
		severity = e.target.value;
		page = 1;
		rows();
	};
	$("#statusFilter").onchange = (e) => {
		tab = e.target.value;
		page = 1;
		rows();
	};
	$("#clear").onclick = () => {
		search = modality = severity = "";
		tab = "All requests";
		page = 1;
		render();
	};
	$("#prev").onclick = () => {
		page--;
		rows();
	};
	$("#next").onclick = () => {
		page++;
		rows();
	};
	$("#sort").onclick = () => {
		sortNewest = !sortNewest;
		render();
	};
	rows();
}
function tableShell() {
	return `<div class="table-wrap"><table class="worklist"><colgroup><col style="width:8%"><col style="width:4%"><col style="width:5%"><col style="width:9%"><col style="width:14%"><col style="width:12%"><col style="width:15%"><col style="width:16%"><col style="width:8%"><col style="width:8%"></colgroup><thead><tr><th><button id="sort">Date ${sortNewest ? "▾" : "▴"}</button></th><th>Time</th><th>Site</th><th>RecNo</th><th>RefLoc</th><th>Referrer</th><th>Patient</th><th>Examinations</th><th>Priority</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div>`;
}
function tableRows(list) {
	return list
		.map(
			(r) =>
				`<tr class="${esc(r.status.toLowerCase())} ${r.id === selectedId ? "selected" : ""}" data-request="${esc(r.id)}" tabindex="0" aria-label="Open request for ${esc(r.patient.name)}"><td>${esc(date(r.receivedAt).replaceAll(" ", "-"))}</td><td>${time(r)}</td><td>DEMO01</td><td title="${esc(r.id)}">${esc(r.id)}</td><td title="${esc(r.referrer.location)}">${esc(r.referrer.location || "Not provided")}</td><td title="${esc(r.referrer.requestingClinician)}">${esc(r.referrer.requestingClinician || "Not provided")}</td><td><a href="#${encodeURIComponent(r.id)}">${esc(r.patient.name)}</a></td><td>${esc(r.referral.modality)} ${esc(r.referral.area)}</td><td>${esc(r.referral.severity)}</td><td>${esc(r.status === "New" ? "OCS" : r.status === "Appointed" ? "Appoint" : r.status)}</td></tr>`,
		)
		.join("");
}
function bindRows() {
	document.querySelectorAll("[data-request]").forEach((row) => {
		row.onclick = () => showPatient(row.dataset.request);
		row.onkeydown = (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				showPatient(row.dataset.request);
			}
		};
	});
}
function filler(n) {
	return Array.from(
		{ length: Math.max(0, n) },
		() =>
			'<tr class="blank-row" aria-hidden="true">' +
			Array(10).fill("<td>&nbsp;</td>").join("") +
			"</tr>",
	).join("");
}
function rows() {
	const all = filtered();
	page = Math.max(1, Math.min(page, Math.max(1, Math.ceil(all.length / size))));
	const list = all.slice((page - 1) * size, page * size);
	$("#rows").innerHTML =
		tableRows(list) +
		(list.length
			? filler(32 - list.length)
			: '<tr><td colspan="10" class="empty-message">No requests match these filters.</td></tr>');
	$("#tableCount").textContent =
		`${all.length ? "Records " + ((page - 1) * size + 1) + " - " + Math.min(page * size, all.length) : "0 records"} of ${all.length}`;
	$("#pageInfo").textContent =
		`${page} / ${Math.max(1, Math.ceil(all.length / size))}`;
	$("#prev").disabled = page === 1;
	$("#next").disabled = page * size >= all.length;
	bindRows();
}
function field(label, value, clinical = false) {
	return `<label class="field-label">${label}</label><div class="field-value ${clinical ? "clinical-value" : ""}">${esc(value || "Not provided")}</div>`;
}
function detail(id) {
	const r = requests.find((r) => r.id === id);
	if (!r) {
		$("#main").innerHTML =
			chrome(null) +
			`<div class="empty-message">Request not found in this session. <button id="back">Back to worklist</button></div>`;
		bindTabs();
		$("#back").onclick = goWorklist;
		return;
	}
	const p = r.patient,
		f = r.referrer,
		d = r.referral;
	$("#crumb").textContent = "List of this patient's events";
	const related = requests
		.filter((x) =>
			p.nhsNumber ? x.patient.nhsNumber === p.nhsNumber : x.id === r.id,
		)
		.sort((a, b) =>
			sortNewest
				? b.receivedAt.localeCompare(a.receivedAt)
				: a.receivedAt.localeCompare(b.receivedAt),
		);
	$("#main").innerHTML =
		chrome(r, patientTab === "events" ? "Events" : "Patient Details") +
		(patientTab === "events"
			? tableShell() +
				`<div class="table-bottom">${related.length} event(s) for ${esc(p.name)}<button id="backDetails">Patient Details</button></div>`
			: `<div class="details"><fieldset><legend>Patient Details <small>Autofilled</small></legend><div class="field-grid">${field("Name", p.name)}${field("Date of Birth", date(p.dob))}${field("Address", p.address)}${field("NHS Number", p.nhsNumber)}${field("Gender", p.gender)}${field("Mobile Phone", p.mobilePhone)}</div></fieldset><fieldset><legend>Referrer Details <small>Autofilled</small></legend><div class="field-grid">${field("User", f.user)}${field("Contact No.", f.contactNo)}${field("Requesting Clinician", f.requestingClinician)}${field("Location", f.location)}${field("Category", f.category)}</div></fieldset><fieldset class="full"><legend>Referral Details</legend><div class="field-grid">${field("Hospital / Department", d.hospitalDepartment || [d.hospital, d.department].filter(Boolean).join(" / "))}${field("Modality (Test)", d.modality)}${field("Area of Body", d.area)}${field("Clinical Details", d.clinicalDetails, true)}${field("Severity", d.severity)}</div></fieldset></div><div class="detail-actions"><label for="requestStatus">Status</label><select id="requestStatus" aria-label="Request status">${statuses.map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select><button id="exportOne">Export request</button><button id="bookOne">Appointment book</button><button id="backList">Back to worklist</button><small>Changes are held for this browser session. Export JSON to save.</small></div>${r.appointment ? `<div class="appointment-summary">Appointment: ${esc(date(r.appointment.date))} at ${esc(r.appointment.time)} · ${esc(r.appointment.room)}</div>` : ""}`);
	bindTabs();
	if (patientTab === "events") {
		$("#rows").innerHTML = tableRows(related) + filler(32 - related.length);
		bindRows();
		$("#sort").onclick = () => {
			sortNewest = !sortNewest;
			detail(id);
		};
		$("#backDetails").onclick = () => showPatient(id);
	} else {
		$("#exportOne").onclick = () => download([r], `${r.id}.json`);
		$("#backList").onclick = goWorklist;
		$("#requestStatus").onchange = (e) => {
			r.status = e.target.value;
			toast("Request status updated");
		};
		$("#bookOne").onclick = () => {
			chosenRequest = id;
			route("book");
		};
	}
}
function appointmentAt(day, t, room) {
	return requests.find(
		(r) =>
			r.appointment?.date === day &&
			r.appointment.time === t &&
			r.appointment.room === room &&
			r.status === "Appointed",
	);
}
function booking() {
	$("#crumb").textContent = "Appointment Book";
	const incoming = requests.filter((r) =>
		["New", "Waiting"].includes(r.status),
	);
	if (chosenRequest && !incoming.some((r) => r.id === chosenRequest))
		chosenRequest = null;
	const longDate = bookDate.toLocaleDateString("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	let dates = [];
	if (bookView === "week") {
		const monday = new Date(bookDate);
		monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
		dates = Array.from({ length: 5 }, (_, i) => {
			const d = new Date(monday);
			d.setDate(d.getDate() + i);
			return d;
		});
	}
	const columns =
		bookView === "day"
			? [...roomFilter].map((room) => ({
					room,
					day: dateKey(bookDate),
					label: room,
				}))
			: dates.map((d) => ({
					room: weekRoom,
					day: dateKey(d),
					label: d.toLocaleDateString("en-GB", {
						weekday: "short",
						day: "numeric",
						month: "short",
					}),
				}));
	const begin = show24 ? 0 : 9,
		end = show24 ? 24 : 17;
	let grid = "";
	for (let h = begin; h < end; h++)
		for (let q = 0; q < 4; q++) {
			const t = `${String(h).padStart(2, "0")}:${String(q * 15).padStart(2, "0")}`;
			grid += `<tr>${q === 0 ? `<td class="hour" rowspan="4">${String(h % 12 || 12).padStart(2, "0")}:00 ${h < 12 ? "AM" : "PM"}</td>` : ""}${columns
				.map((c) => {
					const booked = appointmentAt(c.day, t, c.room);
					return `<td><span class="minute">${q * 15}</span><button class="slot ${booked ? "occupied" : ""}" data-day="${c.day}" data-time="${t}" data-room="${c.room}" ${booked ? `data-booked="${esc(booked.id)}"` : ""} aria-label="${booked ? "View " + esc(booked.patient.name) : "Book " + esc(c.room)} ${c.day} ${t}" title="${booked ? esc(booked.patient.name) + " · " + esc(booked.referral.modality) : chosenRequest ? "Click to schedule selected request" : "Select an incoming request first"}">${booked ? esc(booked.patient.name) : "&nbsp;"}</button></td>`;
				})
				.join("")}</tr>`;
		}
	$("#main").innerHTML =
		chrome(null, "Appointment Book") +
		`<section class="booking"><nav class="book-nav"><button id="bookHome">Home page</button><button id="bookCurrent">Appointment Book</button><button id="waitingRoom">Waiting Room</button><button id="bookSearch">Search</button><button id="bookImport">Import requests</button></nav><div class="book-controls"><div class="view-tabs"><button id="dayView" class="${bookView === "day" ? "selected" : ""}">Day View</button><button id="weekView" class="${bookView === "week" ? "selected" : ""}">Week View</button></div><label class="practice">Practice:<select aria-label="Practice"><option>Practice 1</option></select></label></div><div class="book-filters"><div class="rooms"><strong>Select Booking Centre:</strong><label><input type="checkbox" id="allRooms" ${roomFilter.size === allRooms.length ? "checked" : ""}>All</label>${allRooms.map((r) => `<label><input type="checkbox" data-room-check="${r}" ${roomFilter.has(r) ? "checked" : ""}>${r}</label>`).join("")}${bookView === "week" ? `<label>Room: <select id="weekRoom">${allRooms.map((r) => `<option ${r === weekRoom ? "selected" : ""}>${r}</option>`).join("")}</select></label>` : ""}</div><label style="white-space:nowrap">Show 24 Hours: <input type="checkbox" id="hours24" ${show24 ? "checked" : ""}></label><h2 class="book-date">${esc(longDate)}</h2></div><div class="date-controls"><div><button id="bookPrev">&lt;&lt; Previous</button><button id="bookToday">Today</button><button id="bookNext">Next &gt;&gt;</button></div><label>Go to <input type="date" id="goDate" value="${dateKey(bookDate)}" aria-label="Booking date"> <button id="goButton">Go</button></label></div><div class="booking-key"><span class="date-label">${esc(bookView === "day" ? longDate : "Week commencing " + date(dates[0]))}</span>${[
			["Scheduled", "#60fb12"],
			["Registered", "#79b8f7"],
			["In Service", "#6bf17c"],
			["Completed", "#ef9000"],
			["Expired", "#a6a4aa"],
			["Cancelled", "#afb0b5"],
		]
			.map(
				([s, c]) =>
					`<span class="key"><i style="background:${c}"></i>${s}</span>`,
			)
			.join(
				"",
			)}</div><div class="calendar-layout ${foldIncoming ? "folded" : ""}"><div class="calendar-scroll"><table class="schedule"><thead><tr><th>Time</th>${columns.map((c) => `<th class="week-date">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${columns.length ? grid : '<tr><td colspan="5" class="empty-message">Select a booking centre to view appointment slots.</td></tr>'}</tbody></table></div><aside class="incoming-pane"><div class="incoming-title"><span>EMR Requests Incoming</span><button id="foldIncoming">Show/Hide</button></div><div class="incoming-list">${incoming.map((r) => `<button class="incoming-request ${chosenRequest === r.id ? "chosen" : ""}" data-incoming="${esc(r.id)}"><strong>${esc(r.patient.name.split(" ").slice(-1).join(" ").toUpperCase())}, ${esc(r.patient.name.split(" ").slice(0, -1).join(" "))}</strong><span>Time: ${esc(date(r.receivedAt))} ${time(r)}</span><span>${esc(r.referral.modality)} ${esc(r.referral.area)} · ${esc(r.referral.severity)}</span></button>`).join("") || '<p class="no-events">No incoming requests.</p>'}</div><div class="booking-help">${chosenRequest ? `<span class="schedule-selection">${esc(requests.find((r) => r.id === chosenRequest).patient.name)}</span><br>Click a free slot to schedule.<br><button id="viewChosen">View request</button>` : "Select an incoming request, then click a slot to schedule it."}</div></aside></div><div class="booking-status">${incoming.length} incoming request(s). Appointments are held in this session and included in JSON exports.</div></section>`;
	bindTabs();
	$("#bookHome").onclick = goWorklist;
	$("#bookCurrent").onclick = () => booking();
	$("#waitingRoom").onclick = () => {
		tab = "Waiting";
		goWorklist();
	};
	$("#bookSearch").onclick = () => {
		goWorklist();
		$("#search").focus();
	};
	$("#bookImport").onclick = openImport;
	$("#dayView").onclick = () => {
		bookView = "day";
		booking();
	};
	$("#weekView").onclick = () => {
		bookView = "week";
		booking();
	};
	$("#allRooms").onchange = (e) => {
		roomFilter = new Set(e.target.checked ? allRooms : []);
		booking();
	};
	document.querySelectorAll("[data-room-check]").forEach(
		(c) =>
			(c.onchange = () => {
				c.checked
					? roomFilter.add(c.dataset.roomCheck)
					: roomFilter.delete(c.dataset.roomCheck);
				booking();
			}),
	);
	if ($("#weekRoom"))
		$("#weekRoom").onchange = (e) => {
			weekRoom = e.target.value;
			booking();
		};
	$("#hours24").onchange = (e) => {
		show24 = e.target.checked;
		booking();
	};
	$("#bookPrev").onclick = () => {
		bookDate.setDate(bookDate.getDate() - (bookView === "day" ? 1 : 7));
		booking();
	};
	$("#bookNext").onclick = () => {
		bookDate.setDate(bookDate.getDate() + (bookView === "day" ? 1 : 7));
		booking();
	};
	$("#bookToday").onclick = () => {
		bookDate = new Date();
		bookDate.setHours(12, 0, 0, 0);
		booking();
	};
	$("#goButton").onclick = () => {
		const v = $("#goDate").value;
		if (v) {
			bookDate = new Date(v + "T12:00:00");
			booking();
		}
	};
	$("#foldIncoming").onclick = () => {
		foldIncoming = !foldIncoming;
		booking();
	};
	document.querySelectorAll("[data-incoming]").forEach(
		(b) =>
			(b.onclick = () => {
				chosenRequest = b.dataset.incoming;
				booking();
			}),
	);
	if ($("#viewChosen"))
		$("#viewChosen").onclick = () => showPatient(chosenRequest);
	document.querySelectorAll("[data-time]").forEach(
		(b) =>
			(b.onclick = () => {
				if (b.dataset.booked) {
					showPatient(b.dataset.booked);
					return;
				}
				if (!chosenRequest) {
					toast("Select an incoming request in the right-hand panel first.");
					return;
				}
				const r = requests.find((x) => x.id === chosenRequest);
				if (appointmentAt(b.dataset.day, b.dataset.time, b.dataset.room)) {
					toast("This slot is occupied. Choose another slot.");
					return;
				}
				r.appointment = {
					date: b.dataset.day,
					time: b.dataset.time,
					room: b.dataset.room,
				};
				r.status = "Appointed";
				chosenRequest = null;
				booking();
				toast(
					`${r.patient.name} scheduled for ${r.appointment.time} in ${r.appointment.room}`,
				);
			}),
	);
}
function normalize(input) {
	const data = Array.isArray(input) ? input : input?.requests;
	if (!Array.isArray(data) || !data.length)
		throw Error(
			"Provide a non-empty JSON array or an object with a requests array.",
		);
	if (data.length > 10000)
		throw Error("Please import 10,000 requests or fewer.");
	const text = (v, label) => {
		if (v === undefined || v === null) return "";
		if (typeof v !== "string" && typeof v !== "number")
			throw Error(`${label} must be text or a number.`);
		return String(v).trim();
	};
	const ids = new Set();
	return data.map((r, i) => {
		const label = `Request ${i + 1}`;
		if (!r || typeof r !== "object" || Array.isArray(r))
			throw Error(`${label} must be an object.`);
		for (const k of ["patient", "referrer", "referral"])
			if (r[k] != null && (typeof r[k] !== "object" || Array.isArray(r[k])))
				throw Error(`${label}: ${k} must be an object.`);
		const p = r.patient || {},
			f = r.referrer || {},
			d = r.referral || {};
		if (!text(p.name, "Name") || !text(d.modality, "Modality"))
			throw Error(`${label}: patient.name and referral.modality are required.`);
		const id = text(r.id, "ID") || `REQ-${crypto.randomUUID()}`;
		if (ids.has(id)) throw Error(`${label}: duplicate ID ${id}.`);
		ids.add(id);
		const status = text(r.status, "Status") || "New",
			sev = text(d.severity, "Severity") || "Routine";
		if (!statuses.includes(status))
			throw Error(`${label}: unsupported status "${status}".`);
		if (!severities.includes(sev))
			throw Error(`${label}: severity must be Routine, Urgent or Emergency.`);
		const receivedAt =
			text(r.receivedAt, "Received date") || new Date().toISOString();
		if (Number.isNaN(Date.parse(receivedAt)))
			throw Error(`${label}: invalid receivedAt date.`);
		if (
			p.dob &&
			(!/^\d{4}-\d{2}-\d{2}$/.test(p.dob) ||
				Number.isNaN(Date.parse(p.dob)) ||
				new Date(p.dob).toISOString().slice(0, 10) !== p.dob)
		)
			throw Error(`${label}: dob must be a valid YYYY-MM-DD date.`);
		let appointment;
		if (r.appointment != null) {
			const a = r.appointment;
			if (
				typeof a !== "object" ||
				Array.isArray(a) ||
				!/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
				Number.isNaN(Date.parse(a.date)) ||
				new Date(a.date).toISOString().slice(0, 10) !== a.date ||
				!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(a.time) ||
				!allRooms.includes(a.room)
			)
				throw Error(`${label}: invalid appointment date, time or room.`);
			appointment = { date: a.date, time: a.time, room: a.room };
		}
		return {
			id,
			status,
			...(appointment ? { appointment } : {}),
			receivedAt: new Date(receivedAt).toISOString(),
			patient: Object.fromEntries(
				["name", "dob", "address", "nhsNumber", "gender", "mobilePhone"].map(
					(k) => [k, text(p[k], `${label}: ${k}`)],
				),
			),
			referrer: Object.fromEntries(
				[
					"user",
					"contactNo",
					"requestingClinician",
					"location",
					"category",
				].map((k) => [k, text(f[k], `${label}: ${k}`)]),
			),
			referral: {
				...Object.fromEntries(
					[
						"hospital",
						"department",
						"hospitalDepartment",
						"modality",
						"area",
						"clinicalDetails",
					].map((k) => [k, text(d[k], `${label}: ${k}`)]),
				),
				severity: sev,
			},
		};
	});
}
async function importFile(file) {
	if (!file) return;
	try {
		if (file.size > 5 * 1024 * 1024)
			throw Error("File exceeds 5 MB. Please choose a smaller file.");
		const incoming = normalize(JSON.parse(await file.text()));
		const replace = $("input[name=mode]:checked").value === "replace";
		if (!replace) {
			const conflict = incoming.find((r) =>
				requests.some((old) => old.id === r.id),
			);
			if (conflict)
				throw Error(
					`ID ${conflict.id} already exists. Use unique IDs or choose Replace worklist.`,
				);
		}
		const result = replace ? incoming : [...requests, ...incoming];
		const slots = new Set();
		for (const item of result) {
			if (item.status === "Appointed" && item.appointment) {
				const a = item.appointment;
				const slot = [a.date, a.time, a.room].join("|");
				if (slots.has(slot))
					throw Error(
						"Two appointments use the same date, time and room. Please resolve the conflict in the JSON file.",
					);
				slots.add(slot);
			}
		}
		requests = result;
		search = modality = severity = "";
		tab = "All requests";
		page = 1;
		$("#importDialog").close();
		location.hash = "";
		render();
		toast(
			`${incoming.length} request${incoming.length === 1 ? "" : "s"} imported successfully`,
		);
	} catch (e) {
		$("#error").textContent =
			e instanceof SyntaxError
				? "Invalid JSON. Check the file syntax and try again."
				: e.message;
	} finally {
		$("#file").value = "";
	}
}
function openImport() {
	$("#error").textContent = "";
	$("#importDialog").showModal();
}
function openGuide() {
	$("#schema").textContent = JSON.stringify([example], null, 2);
	$("#guide").showModal();
}
async function loadStoredRequests() {
	try {
		const response = await fetch(apiUrl("/api/cris/requests"));
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		if (!Array.isArray(data.requests) || data.requests.length === 0) return;
		const incoming = normalize(data.requests);
		const incomingIds = new Set(incoming.map((request) => request.id));
		requests = [
			...requests.filter((request) => !incomingIds.has(request.id)),
			...incoming,
		];
		render();
	} catch (error) {
		console.error("Could not load referrals from the server:", error);
	}
}
$("#today").textContent = new Date().toLocaleDateString("en-GB", {
	day: "2-digit",
	month: "short",
	year: "numeric",
});
document.querySelectorAll("[data-menu]").forEach(
	(b) =>
		(b.onclick = (e) => {
			e.stopPropagation();
			const m = $("#" + b.dataset.menu),
				open = m.hidden;
			closeMenus();
			m.hidden = !open;
		}),
);
document.addEventListener("click", (e) => {
	if (
		!e.target.closest(".menu") &&
		!e.target.closest("[data-menu]") &&
		e.target.id !== "tabMenu"
	)
		closeMenus();
});
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeMenus();
});
$("#importNav").onclick = $("#importTool").onclick = openImport;
$("#guideNav").onclick =
	$("#guideTool").onclick =
	$("#formatGuide").onclick =
		openGuide;
$("#exportAll").onclick = $("#exportTool").onclick = () => {
	closeMenus();
	download(requests, "imaging-requests.json");
};
$("#downloadTemplate").onclick = $("#templateTool").onclick = () => {
	closeMenus();
	download([{ ...example, id: "REQ-IMPORT-001" }], "request-template.json");
};
$("#worklistTool").onclick = goWorklist;
$("#homeTool").onclick = $("#showAll").onclick = () => {
	search = modality = severity = "";
	tab = "All requests";
	goWorklist();
};
$("#bookTool").onclick = $("#openBook").onclick = () => route("book");
$("#patientTool").onclick = () => showPatient();
$("#optionsTool").onclick = () => {
	goWorklist();
	$("#search").focus();
};
$("#newTool").onclick = $("#showNew").onclick = () => {
	tab = "New";
	severity = "";
	goWorklist();
};
$("#urgentTool").onclick = $("#showUrgent").onclick = () => {
	tab = "All requests";
	severity = "Urgent + Emergency";
	goWorklist();
};
$("#exportPatientTool").onclick = () => {
	const r = current();
	if (r) download([r], `${r.id}.json`);
	else toast("Select a patient first.");
};
$("#refreshTool").onclick = render;
$("#choose").onclick = () => $("#file").click();
$("#file").onchange = (e) => importFile(e.target.files[0]);
$("#choose").ondragover = (e) => {
	e.preventDefault();
	$("#choose").style.background = "#dce9f4";
};
$("#choose").ondragleave = () => ($("#choose").style.background = "");
$("#choose").ondrop = (e) => {
	e.preventDefault();
	$("#choose").style.background = "";
	importFile(e.dataTransfer.files[0]);
};
$("#template").onclick = $("#guideDownload").onclick = () =>
	download([{ ...example, id: "REQ-IMPORT-001" }], "request-template.json");
$("#format").onclick = () => {
	$("#importDialog").close();
	openGuide();
};
document
	.querySelectorAll(".close")
	.forEach((b) => (b.onclick = () => b.closest("dialog").close()));
window.addEventListener("hashchange", render);
render();
loadStoredRequests();
