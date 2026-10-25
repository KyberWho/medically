'use strict';

function toCrisRequest(record) {
    const data = record.data;
    const referral = data.referral ?? {};
    const booking = data.booking ?? {};
    const referralId = record.referralId || `REF-${record.referralRecordId}`;

    return {
        ...data,
        id: referralId,
        referralId,
        referralRecordId: record.referralRecordId,
        receivedAt: record.submittedAt || record.exportedAt,
        status: ['New', 'Waiting', 'Appointed', 'Completed', 'Rejected'].includes(data.status)
            ? data.status
            : 'New',
        patient: data.patient ?? {},
        referrer: data.referrer ?? {},
        referral: {
            ...referral,
            hospital: referral.hospital || referral.hospitalDepartment || '',
            department: referral.department || ''
        },
        appointment: booking.appointmentDate ? {
            date: booking.appointmentDate,
            time: booking.appointmentTime,
            type: booking.appointmentType,
            location: booking.location,
            clinician: booking.clinician
        } : undefined
    };
}

async function loadReferrals() {
    const refreshButton = document.querySelector('#refreshTool');
    if (refreshButton) {
        refreshButton.onclick = loadReferrals;
    }

    try {
        const response = await fetch('/api/referrals');
        if (!response.ok) {
            throw new Error(`Request failed with HTTP ${response.status}.`);
        }

        const records = await response.json();
        if (!Array.isArray(records)) {
            throw new Error('The referrals API returned an unexpected response.');
        }

        requests = records.map(toCrisRequest);
        selectedId = requests[0]?.id;
        render();
    } catch (error) {
        requests = [];
        selectedId = undefined;
        render();
        const notice = document.createElement('p');
        notice.className = 'empty-message';
        notice.setAttribute('role', 'alert');
        notice.textContent = `Could not load referrals: ${error.message}`;
        document.querySelector('#main').prepend(notice);
    }
}

loadReferrals();
