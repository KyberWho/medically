'use strict';

async function loadPatients() {
    state.patients = [];
    patients();
    document.querySelector('.table-footer span:last-child').textContent =
        'Patient records loaded from the database';
    const footer = document.querySelector('footer span:nth-child(2)');
    if (footer?.firstChild) {
        footer.firstChild.nodeValue =
            'Patient data stored in database · draft and encounter notes saved in browser ';
    }
    const workspaceLabel = document.querySelector('.aside-bottom small');
    if (workspaceLabel) {
        workspaceLabel.textContent = '● Database-backed patient directory';
    }

    try {
        const response = await fetch('/api/patients');
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Request failed with HTTP ${response.status}.`);
        }
        if (!Array.isArray(result)) {
            throw new Error('The patients API returned an unexpected response.');
        }

        state.patients = result;
        patients();
    } catch (error) {
        $('#results').textContent = `Could not load patients: ${error.message}`;
    }
}

$('#add-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const nhsNumber = form.nhsNumber.replace(/\s/g, '');
    const message = !/^\d{10}$/.test(nhsNumber)
        ? 'Enter exactly 10 digits.'
        : state.patients.some((patient) =>
            patient.nhsNumber.replace(/\s/g, '') === nhsNumber
        )
            ? 'This NHS number is already in your log.'
            : '';

    if (message) {
        $('#new-patient-nhsNumber').setCustomValidity(message);
        $('#new-patient-nhsNumber').reportValidity();
        return;
    }

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Request failed with HTTP ${response.status}.`);
        }

        state.patients.push(result.patient);
        save();
        patients();
        $('#modal').close();
        toast(`${result.patient.name} added to your patient log`);
    } catch (error) {
        toast(`Could not save patient: ${error.message}`);
    }
};

$('#reset').onclick = () => {
    if (confirm('Clear this browser’s draft and encounter notes? Database patients will remain.')) {
        localStorage.removeItem('imaging-desk-v1');
        location.reload();
    }
};

loadPatients();
