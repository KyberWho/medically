import mysql from 'mysql2/promise';

import { getEnv } from '../api/utilities.js';

const pool = mysql.createPool({
    host: getEnv('DB_HOST'),
    port: Number(getEnv('DB_PORT', '3306')),
    user: getEnv('DB_USER'),
    password: getEnv('DB_PASSWORD'),
    database: getEnv('DB_NAME'),
    timezone: 'Z',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10
});

function formatDatabaseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Referral export timestamp is invalid.');
    }
    return date.toISOString().slice(0, 23).replace('T', ' ');
}

function referralColumns(data) {
    const patient = data.patient ?? {};
    const referrer = data.referrer ?? {};
    const referral = data.referral ?? {};
    const booking = data.booking ?? {};
    const consultation = data.consultation ?? {};

    return {
        referral_id: data.referralId ?? null,
        patient_nhs_number: patient.nhsNumber ?? null,
        referrer_user: referrer.user ?? null,
        referrer_contact_no: referrer.contactNo ?? null,
        requesting_clinician: referrer.requestingClinician ?? null,
        referrer_location: referrer.location ?? null,
        referrer_category: referrer.category ?? null,
        hospital_department: referral.hospitalDepartment
            || [referral.hospital, referral.department].filter(Boolean).join(' / ')
            || null,
        modality: referral.modality ?? null,
        referral_area: referral.area ?? null,
        clinical_details: referral.clinicalDetails ?? null,
        severity: referral.severity ?? null,
        schema_version: data.schemaVersion ?? null,
        exported_at: formatDatabaseDate(data.exportedAt),
        patient_name: patient.name ?? null,
        patient_dob: patient.dob || null,
        patient_address: patient.address ?? null,
        patient_gender: patient.gender ?? null,
        patient_mobile_phone: patient.mobilePhone ?? null,
        appointment_date: booking.appointmentDate ?? null,
        appointment_time: booking.appointmentTime ?? null,
        appointment_type: booking.appointmentType ?? null,
        booking_location: booking.location ?? null,
        booking_clinician: booking.clinician ?? null,
        booking_status: booking.status ?? null,
        booking_reason: booking.reason ?? null,
        presenting_complaint: consultation.presentingComplaint ?? null,
        consultation_history: consultation.history ?? null,
        examination: consultation.examination ?? null,
        assessment: consultation.assessment ?? null,
        plan: consultation.plan ?? null,
        additional_notes: consultation.additionalNotes ?? null,
        payload_json: JSON.stringify(data)
    };
}

function referralDataFromRow(row) {
    const payload = row.payload_json
        ? (typeof row.payload_json === 'string'
            ? JSON.parse(row.payload_json)
            : row.payload_json)
        : null;
    const normalized = {
        schemaVersion: row.schema_version,
        referralId: row.referral_id,
        exportedAt: row.exported_at,
        patient: {
            name: row.resolved_patient_name ?? row.patient_name,
            dob: row.resolved_patient_dob ?? row.patient_dob,
            address: row.resolved_patient_address ?? row.patient_address,
            nhsNumber: row.resolved_patient_nhs_number ?? row.patient_nhs_number,
            gender: row.resolved_patient_gender ?? row.patient_gender,
            mobilePhone: row.resolved_patient_mobile_phone ?? row.patient_mobile_phone
        },
        referrer: {
            user: row.referrer_user,
            contactNo: row.referrer_contact_no,
            requestingClinician: row.requesting_clinician,
            location: row.referrer_location,
            category: row.referrer_category
        },
        referral: {
            hospitalDepartment: row.hospital_department,
            modality: row.modality,
            area: row.referral_area,
            clinicalDetails: row.clinical_details,
            severity: row.severity
        },
        booking: {
            appointmentDate: row.appointment_date,
            appointmentTime: row.appointment_time,
            appointmentType: row.appointment_type,
            location: row.booking_location,
            clinician: row.booking_clinician,
            status: row.booking_status,
            reason: row.booking_reason
        },
        consultation: {
            presentingComplaint: row.presenting_complaint,
            history: row.consultation_history,
            examination: row.examination,
            assessment: row.assessment,
            plan: row.plan,
            additionalNotes: row.additional_notes
        }
    };

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return normalized;
    }

    const mergeSection = (section) => {
        const stored = payload[section] ?? {};
        return Object.fromEntries(
            Object.entries({ ...normalized[section], ...stored }).map(([key, value]) => [
                key,
                value || normalized[section][key] || ''
            ])
        );
    };

    return {
        ...normalized,
        ...payload,
        patient: mergeSection('patient'),
        referrer: mergeSection('referrer'),
        referral: mergeSection('referral'),
        booking: mergeSection('booking'),
        consultation: mergeSection('consultation')
    };
}

export async function saveReferral(data) {
    const values = referralColumns(data);
    const columns = Object.keys(values);
    const parameters = Object.values(values);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let recordId;
        if (values.referral_id) {
            const [rows] = await connection.execute(
                `SELECT referral_record_id
                 FROM referrals
                 WHERE referral_id = ?
                 ORDER BY referral_record_id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [values.referral_id]
            );
            recordId = rows[0]?.referral_record_id;
        }

        if (recordId) {
            await connection.execute(
                `UPDATE referrals SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')}
                 WHERE referral_record_id = ?`,
                [...parameters, recordId]
            );
        } else {
            const [result] = await connection.execute(
                `INSERT INTO referrals (${columns.map((column) => `\`${column}\``).join(', ')})
                 VALUES (${columns.map(() => '?').join(', ')})`,
                parameters
            );
            recordId = result.insertId;
        }

        await connection.commit();
        return recordId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getReferrals() {
    const [rows] = await pool.execute(
        `SELECT r.*,
                COALESCE(NULLIF(r.patient_name, ''), p.name) AS resolved_patient_name,
                COALESCE(r.patient_dob, p.dob) AS resolved_patient_dob,
                COALESCE(NULLIF(r.patient_address, ''), p.address) AS resolved_patient_address,
                COALESCE(NULLIF(r.patient_nhs_number, ''), p.nhs_number) AS resolved_patient_nhs_number,
                COALESCE(NULLIF(r.patient_gender, ''), p.gender) AS resolved_patient_gender,
                COALESCE(NULLIF(r.patient_mobile_phone, ''), p.mobile_phone) AS resolved_patient_mobile_phone
         FROM referrals AS r
         LEFT JOIN patients AS p ON p.patient_id = r.patient_id
         ORDER BY r.created_at DESC, r.referral_record_id DESC`
    );
    return rows.map((row) => ({
        referralRecordId: row.referral_record_id,
        referralId: row.referral_id,
        exportedAt: row.exported_at,
        submittedAt: row.created_at,
        data: referralDataFromRow(row)
    }));
}

export async function closeDatabase() {
    await pool.end();
}

export async function getPatients() {
    const [rows] = await pool.execute(
        `SELECT patient_id, name, dob, address, nhs_number, gender, mobile_phone
         FROM patients
         ORDER BY name, patient_id`
    );

    return rows.map((row) => ({
        id: String(row.patient_id),
        name: row.name ?? '',
        dob: row.dob ?? '',
        address: row.address ?? '',
        nhsNumber: row.nhs_number,
        gender: row.gender ?? '',
        mobilePhone: row.mobile_phone ?? ''
    }));
}

export async function savePatient(patient) {
    const nhsNumber = patient.nhsNumber.replace(/\s/g, '');
    const [result] = await pool.execute(
        `INSERT INTO patients (name, dob, address, nhs_number, gender, mobile_phone)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            dob = VALUES(dob),
            address = VALUES(address),
            gender = VALUES(gender),
            mobile_phone = VALUES(mobile_phone)`,
        [
            patient.name.trim(),
            patient.dob || null,
            patient.address.trim(),
            nhsNumber,
            patient.gender.trim(),
            patient.mobilePhone.trim()
        ]
    );
    const patientId = result.insertId || (
        await pool.execute(
            'SELECT patient_id FROM patients WHERE nhs_number = ?',
            [nhsNumber]
        )
    )[0][0].patient_id;

    const [rows] = await pool.execute(
        `SELECT patient_id, name, dob, address, nhs_number, gender, mobile_phone
         FROM patients
         WHERE patient_id = ?`,
        [patientId]
    );
    const row = rows[0];

    return {
        id: String(row.patient_id),
        name: row.name ?? '',
        dob: row.dob ?? '',
        address: row.address ?? '',
        nhsNumber: row.nhs_number,
        gender: row.gender ?? '',
        mobilePhone: row.mobile_phone ?? ''
    };
}
