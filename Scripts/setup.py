import os
import sys
import mariadb
from dotenv import load_dotenv

load_dotenv()

try:
    config = {
            "user": os.getenv('DB_USER'),
            "password": os.getenv("DB_PASSWORD"),
            "host": os.getenv("DB_HOST"),
            "port": os.getenv("DB_PORT")
    }

    with mariadb.connect(user=config['user'], password=config['password'], host=config['host'], port=int(config['port'])) as conn:
        print("Connected to mariadb successfully")

        with conn.cursor() as cursor:
            database_name = os.getenv("DB_NAME")
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}`")
            print(f"Database '{database_name}' created successfully")
            
            cursor.execute(f"USE {database_name}")
            cursor.execute("CREATE TABLE IF NOT EXISTS users (user_id INT(11) NOT NULL AUTO_INCREMENT, email_address VARCHAR(255) NOT NULL, password BINARY(60) NOT NULL, PRIMARY KEY (user_id));")
            cursor.execute("CREATE TABLE IF NOT EXISTS sessions (session_id INT(11) NOT NULL AUTO_INCREMENT, user_id INT(11) NOT NULL, token_hash BINARY(64) NOT NULL, created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP NOT NULL, PRIMARY KEY (session_id), UNIQUE KEY (token_hash), KEY (user_id));")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patients (
                    patient_id BIGINT NOT NULL AUTO_INCREMENT,
                    name VARCHAR(255) NULL,
                    dob DATE NULL,
                    address VARCHAR(512) NULL,
                    nhs_number CHAR(10) NOT NULL,
                    gender VARCHAR(32) NULL,
                    mobile_phone VARCHAR(32) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (patient_id),
                    UNIQUE KEY (nhs_number)
                )
            """)
            demo_patients = [
                ("Amelia Thompson", "1985-04-12", "14 Meadow Lane, London, SE10 8AB", "9000000001", "Female", "07700 900101"),
                ("James Wilson", "1967-09-23", "27 Willow Road, London, SE10 8CD", "9000000002", "Male", "07700 900102"),
                ("Olivia Bennett", "1992-01-08", "8 Park Avenue, London, SE10 8EF", "9000000003", "Female", "07700 900103"),
                ("William Davies", "1954-11-16", "52 Oak Crescent, London, SE10 8GH", "9000000004", "Male", "07700 900104"),
                ("Isla Robinson", "1978-06-30", "3 Birch Close, London, SE10 8JK", "9000000005", "Female", "07700 900105"),
                ("George Mitchell", "1989-03-05", "19 Elm Street, London, SE10 8LM", "9000000006", "Male", "07700 900106"),
            ]
            cursor.executemany(
                """
                INSERT IGNORE INTO patients
                    (name, dob, address, nhs_number, gender, mobile_phone)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                demo_patients,
            )
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS referrals (
                    referral_record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    referral_id VARCHAR(100) NULL,
                    patient_nhs_number VARCHAR(32) NULL,
                    referrer_user VARCHAR(255) NULL,
                    referrer_contact_no VARCHAR(64) NULL,
                    requesting_clinician VARCHAR(255) NULL,
                    referrer_location VARCHAR(255) NULL,
                    referrer_category VARCHAR(128) NULL,
                    hospital_department VARCHAR(255) NULL,
                    modality VARCHAR(64) NULL,
                    referral_area VARCHAR(255) NULL,
                    clinical_details TEXT NULL,
                    severity VARCHAR(64) NULL,
                    patient_id BIGINT NULL,
                    schema_version VARCHAR(16) NULL,
                    exported_at DATETIME(3) NULL,
                    patient_name VARCHAR(255) NULL,
                    patient_dob DATE NULL,
                    patient_address VARCHAR(512) NULL,
                    patient_gender VARCHAR(32) NULL,
                    patient_mobile_phone VARCHAR(32) NULL,
                    appointment_date VARCHAR(32) NULL,
                    appointment_time VARCHAR(32) NULL,
                    appointment_type VARCHAR(128) NULL,
                    booking_location VARCHAR(255) NULL,
                    booking_clinician VARCHAR(255) NULL,
                    booking_status VARCHAR(64) NULL,
                    booking_reason TEXT NULL,
                    presenting_complaint TEXT NULL,
                    consultation_history TEXT NULL,
                    examination TEXT NULL,
                    assessment TEXT NULL,
                    plan TEXT NULL,
                    additional_notes TEXT NULL,
                    payload_json LONGTEXT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (referral_record_id),
                    KEY (patient_id)
                )
            """)

            cursor.execute("SHOW COLUMNS FROM referrals")
            existing_columns = {row[0] for row in cursor.fetchall()}
            required_columns = {
                "patient_nhs_number": "VARCHAR(32) NULL",
                "referrer_user": "VARCHAR(255) NULL",
                "referrer_contact_no": "VARCHAR(64) NULL",
                "requesting_clinician": "VARCHAR(255) NULL",
                "referrer_location": "VARCHAR(255) NULL",
                "referrer_category": "VARCHAR(128) NULL",
                "hospital_department": "VARCHAR(255) NULL",
                "modality": "VARCHAR(64) NULL",
                "referral_area": "VARCHAR(255) NULL",
                "clinical_details": "TEXT NULL",
                "severity": "VARCHAR(64) NULL",
                "patient_id": "BIGINT NULL",
                "schema_version": "VARCHAR(16) NULL",
                "exported_at": "DATETIME(3) NULL",
                "patient_name": "VARCHAR(255) NULL",
                "patient_dob": "DATE NULL",
                "patient_address": "VARCHAR(512) NULL",
                "patient_gender": "VARCHAR(32) NULL",
                "patient_mobile_phone": "VARCHAR(32) NULL",
                "appointment_date": "VARCHAR(32) NULL",
                "appointment_time": "VARCHAR(32) NULL",
                "appointment_type": "VARCHAR(128) NULL",
                "booking_location": "VARCHAR(255) NULL",
                "booking_clinician": "VARCHAR(255) NULL",
                "booking_status": "VARCHAR(64) NULL",
                "booking_reason": "TEXT NULL",
                "presenting_complaint": "TEXT NULL",
                "consultation_history": "TEXT NULL",
                "examination": "TEXT NULL",
                "assessment": "TEXT NULL",
                "plan": "TEXT NULL",
                "additional_notes": "TEXT NULL",
                "payload_json": "LONGTEXT NULL",
                "created_at": "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
            }
            for column, definition in required_columns.items():
                if column not in existing_columns:
                    cursor.execute(
                        f"ALTER TABLE referrals ADD COLUMN `{column}` {definition}"
                    )

            if "referral_data" in existing_columns and "payload_json" not in existing_columns:
                cursor.execute(
                    "UPDATE referrals SET payload_json = CAST(referral_data AS CHAR) "
                    "WHERE payload_json IS NULL"
                )
            if "submitted_at" in existing_columns and "created_at" not in existing_columns:
                cursor.execute(
                    "UPDATE referrals SET created_at = submitted_at "
                    "WHERE submitted_at IS NOT NULL"
                )
            print(f"Tables successfully created")
except mariadb.Error as e:
    sys.exit(f"Error connecting to mariadb: {e}")
