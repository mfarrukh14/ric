/**
 * Outgoing email. Every message uses one layout: RIC logo (embedded, so it shows without
 * loading remote images), a title, a short body and a one-line footer. Copy stays brief:
 * what happened, what the supplier needs to do, and by when.
 */
const fs = require('fs');
const nodemailer = require('nodemailer');
require('../config/env');
const { formatClock, formatLongDate, formatLongDateTime } = require('./time');
const { ORG, LOGO_PATH } = require('../reports/brand');

const INK = '#1c1c1f';
const MUTED = '#5c5c63';
const LINE = '#e3e3e6';
const BRAND = '#a3263f';
const FONT = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif";
const LOGO_CID = 'ric-logo';

// Must match the OTP lifetime in supplierController.
const OTP_TTL_MINUTES = 2;

const senderAddress = () => process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER;
const portalUrl = () => (process.env.FRONTEND_URL || '').replace(/\/+$/, '');

// ── Building blocks (each returns HTML; text arguments are escaped by the caller via esc) ──

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const multiline = (value) => esc(value).replace(/\r?\n/g, '<br>');
const longDate = (value = new Date()) => formatLongDate(value, '');
const longDateTime = (value) => formatLongDateTime(value, '');

const p = (html) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${html}</p>`;
const small = (html) => `<p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:${MUTED};">${html}</p>`;

/** Label / value rows; empty values are skipped. rows: [[label, html], …] */
const details = (rows) => {
    const shown = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!shown.length) return '';
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 18px;border-collapse:collapse;">
${shown.map(([label, value]) => `<tr>
  <td style="padding:8px 0;border-top:1px solid ${LINE};font-size:13px;color:${MUTED};width:34%;vertical-align:top;">${esc(label)}</td>
  <td style="padding:8px 0;border-top:1px solid ${LINE};font-size:14px;color:${INK};font-weight:600;vertical-align:top;">${value}</td>
</tr>`).join('')}
</table>`;
};

/** A quoted block (a reason, the committee's notes). */
const quote = (label, html) => `<div style="margin:0 0 18px;padding:2px 0 2px 14px;border-left:3px solid ${LINE};">
  ${label ? `<p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${esc(label)}</p>` : ''}
  <div style="font-size:14px;line-height:1.6;color:${INK};">${html}</div>
</div>`;

const list = (items) => `<ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.6;color:${INK};">${items.map((i) => `<li style="margin:0 0 4px;">${i}</li>`).join('')}</ul>`;

const button = (href, label) => (href
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 20px;"><tr><td style="border-radius:8px;background:${BRAND};">
  <a href="${esc(href)}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(label)}</a>
</td></tr></table>`
    : '');

const greeting = (name) => p(`Dear ${esc(name || 'Supplier')},`);
const signature = (team) => `<p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:${INK};">${esc(team)}<br><span style="color:${MUTED};">${ORG}</span></p>`;

const layout = ({ title, body }) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f6;">
<tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;">
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:12px;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="RIC" style="display:block;border:0;border-radius:6px;"></td>
        <td style="font-size:13px;font-weight:600;color:${MUTED};">${ORG}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 32px 26px;">
      <h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;font-weight:700;color:${INK};">${esc(title)}</h1>
      ${body}
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${MUTED};">
      RIC e-Tender · Automated message, replies are not monitored.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

// ── Transport ───────────────────────────────────────────────────────────

// Set EMAIL_DISABLED=true to log instead of sending, e.g. on a local test database.
const EMAIL_DISABLED = /^(1|true|yes)$/i.test(process.env.EMAIL_DISABLED || '');

// One pooled SMTP transport for the whole process; EmailService instances share it.
let sharedTransporter = null;
const getTransporter = () => {
    if (!sharedTransporter) {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
            console.warn('EMAIL_USER / EMAIL_PASSWORD are not set; outgoing email will fail.');
        }
        sharedTransporter = nodemailer.createTransport({
            service: 'gmail',
            pool: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
        });
    }
    return sharedTransporter;
};

/** Attachment for a file on disk, or nothing when the path is missing. */
const fileAttachment = (filePath, filename, contentType) =>
    filePath && fs.existsSync(filePath) ? [{ filename, path: filePath, ...(contentType ? { contentType } : {}) }] : [];

const logoAttachment = () => (fs.existsSync(LOGO_PATH) ? [{ filename: 'ric-logo.jpg', path: LOGO_PATH, cid: LOGO_CID, contentDisposition: 'inline' }] : []);

class EmailService {
    constructor() {
        this.transporter = getTransporter();
    }

    /** Sends one message from the standard sender. Resolves { success, messageId }; throws on failure. */
    async send({ to, subject, html, attachments = [], fromName }) {
        if (EMAIL_DISABLED) {
            console.info(`Email not sent (EMAIL_DISABLED): "${subject}" to ${to}`);
            return { success: true, messageId: null, html };
        }
        const info = await this.transporter.sendMail({
            from: { name: fromName || process.env.EMAIL_FROM_NAME || 'RIC e-Tender', address: senderAddress() },
            to,
            subject,
            html,
            attachments: [...logoAttachment(), ...attachments],
        });
        return { success: true, messageId: info.messageId };
    }

    async testConnection() {
        try {
            await this.transporter.verify();
            return true;
        } catch (error) {
            console.error('Email service configuration error:', error);
            return false;
        }
    }

    // ── Supplier registration ───────────────────────────────────────────

    async sendSupplierApprovalEmail(supplierEmail, companyName) {
        const portal = portalUrl();
        const html = layout({
            title: 'Application approved',
            body: [
                greeting(companyName),
                p(`Your supplier registration with the ${ORG} has been approved. You can now bid on open tenders.`),
                button(portal && `${portal}/login`, 'Sign in'),
                signature('Supplier Evaluation Committee'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: 'Your supplier application is approved', html });
    }

    async sendSupplierRejectionEmail(supplierEmail, companyName, rejectionReason) {
        const html = layout({
            title: 'Application not approved',
            body: [
                greeting(companyName),
                p(`Your supplier registration with the ${ORG} was not approved.`),
                rejectionReason ? quote('Reason', multiline(rejectionReason)) : '',
                small(`To apply again, contact <a href="mailto:${esc(senderAddress())}" style="color:${BRAND};">${esc(senderAddress())}</a>.`),
                signature('Supplier Evaluation Committee'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: 'Update on your supplier application', html });
    }

    async sendSupplierResubmissionEmail(supplierEmail, companyName, issues, additionalMessage) {
        const portal = portalUrl();
        const issueItems = (issues || []).map(
            (issue) => `<strong>${esc(issue.title)}</strong>: ${esc(issue.description)}${issue.comments ? `<br><span style="color:${MUTED};">${esc(issue.comments)}</span>` : ''}`,
        );
        const html = layout({
            title: 'Changes needed on your application',
            body: [
                greeting(companyName),
                p('Your supplier registration needs the following changes before it can be approved.'),
                issueItems.length ? list(issueItems) : '',
                additionalMessage ? quote('Notes from the committee', multiline(additionalMessage)) : '',
                button(portal && `${portal}/login`, 'Update application'),
                signature('Supplier Evaluation Committee'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: 'Action needed on your supplier application', html });
    }

    async sendOTPEmail(supplierEmail, otpCode, companyName) {
        const html = layout({
            title: 'Your verification code',
            body: [
                greeting(companyName),
                p('Enter this code to verify your email address:'),
                `<p style="margin:4px 0 18px;font-family:'SF Mono',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:.3em;color:${INK};">${esc(otpCode)}</p>`,
                small(`It expires in ${OTP_TTL_MINUTES} minutes. If you did not request it, you can ignore this email; staff will never ask you for the code.`),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: 'Your RIC e-Tender verification code', html });
    }

    // ── Letters ─────────────────────────────────────────────────────────

    async sendLetterOfIntentEmail({ to, companyName, contactPerson, letterTitle, letterContent, filePath, fileName }) {
        const html = layout({
            title: 'Letter of intent',
            body: [
                greeting(contactPerson || companyName),
                p(`<strong>${esc(companyName)}</strong> has been shortlisted for ${esc(letterTitle)}. The letter of intent is attached.`),
                letterContent ? quote(null, multiline(letterContent)) : '',
                signature('Purchase Department'),
            ].join(''),
        });
        // The letter is the point of the email: fail if the file is missing.
        return this.send({ to, subject: `Letter of intent: ${letterTitle}`, html, attachments: [{ filename: fileName, path: filePath }] });
    }

    async sendLetterOfAwardEmail({ to, companyName, contactPerson, letterTitle, letterContent, filePath, fileName, awardAmount }) {
        const html = layout({
            title: 'Contract awarded',
            body: [
                greeting(contactPerson || companyName),
                p(`<strong>${esc(companyName)}</strong> has been awarded the contract. The letter of award is attached.`),
                details([
                    ['Tender', esc(letterTitle)],
                    ['Award amount', awardAmount ? `Rs ${esc(Number(awardAmount).toLocaleString('en-PK', { maximumFractionDigits: 2 }))}` : ''],
                ]),
                letterContent ? quote(null, multiline(letterContent)) : '',
                p('Please contact the Purchase Department to finalise the contract.'),
                signature('Purchase Department'),
            ].join(''),
        });
        return this.send({ to, subject: `Contract awarded: ${letterTitle}`, html, attachments: [{ filename: fileName, path: filePath }] });
    }

    // ── Technical evaluation and grievances ─────────────────────────────

    async sendTechnicalEvaluationRejectionEmail(supplierEmail, companyName, itemName, rejectionReason, deadlineString) {
        const html = layout({
            title: 'Technical evaluation result',
            body: [
                greeting(companyName),
                p(`Your bid for <strong>${esc(itemName)}</strong> did not pass the technical evaluation.`),
                rejectionReason ? quote('Reason', multiline(rejectionReason)) : '',
                p(`If you disagree, you can file a grievance under Grievances in the supplier portal until <strong>${esc(deadlineString)}</strong>.`),
                signature('Technical Evaluation Committee'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: `Technical evaluation result: ${itemName}`, html, fromName: process.env.EMAIL_FROM_NAME || 'RIC Technical Evaluation Committee' });
    }

    async sendGrievanceMeetingNotification(supplierEmail, companyName, itemName, meetingDate, meetingTime, meetingLocation, meetingDetails, grievanceLetterPath = null) {
        const html = layout({
            title: 'Grievance hearing scheduled',
            body: [
                greeting(companyName),
                p(`Your grievance about <strong>${esc(itemName)}</strong> will be heard at:`),
                details([
                    ['Date', esc(longDate(meetingDate) || meetingDate)],
                    ['Time', esc(formatClock(meetingTime))],
                    ['Location', esc(meetingLocation)],
                    ['Details', meetingDetails ? multiline(meetingDetails) : ''],
                ]),
                p(`Please bring any supporting documents.${grievanceLetterPath ? ' The committee’s letter is attached.' : ''}`),
                signature('Grievance Committee'),
            ].join(''),
        });
        return this.send({
            to: supplierEmail,
            subject: `Grievance hearing: ${itemName}`,
            html,
            fromName: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
            attachments: fileAttachment(grievanceLetterPath, 'Grievance_letter.pdf', 'application/pdf'),
        });
    }

    async sendBulkGrievanceMeetingNotification(supplierEmail, companyName, grievanceItems, meetingDate, meetingTime, meetingLocation, meetingDetails, grievanceLetterPath = null) {
        const html = layout({
            title: 'Grievance hearing scheduled',
            body: [
                greeting(companyName),
                p('Your grievances will be heard together at:'),
                details([
                    ['Items', esc(grievanceItems)],
                    ['Date', esc(longDate(meetingDate) || meetingDate)],
                    ['Time', esc(formatClock(meetingTime))],
                    ['Location', esc(meetingLocation)],
                    ['Details', meetingDetails ? multiline(meetingDetails) : ''],
                ]),
                p(`Please bring any supporting documents.${grievanceLetterPath ? ' The committee’s letter is attached.' : ''}`),
                signature('Grievance Committee'),
            ].join(''),
        });
        return this.send({
            to: supplierEmail,
            subject: 'Grievance hearing scheduled',
            html,
            fromName: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
            attachments: fileAttachment(grievanceLetterPath, 'Grievance_letter.pdf', 'application/pdf'),
        });
    }

    async sendGrievanceApprovalEmail(supplierEmail, companyName, itemName, contactPerson, minutesFilePath = null) {
        const html = layout({
            title: 'Grievance upheld',
            body: [
                greeting(contactPerson || companyName),
                p(`Your grievance about <strong>${esc(itemName)}</strong> has been upheld. Your bid for this item is back in the evaluation.`),
                minutesFilePath ? small('The minutes of the meeting are attached.') : '',
                signature('Grievance Committee'),
            ].join(''),
        });
        return this.send({
            to: supplierEmail,
            subject: `Grievance upheld: ${itemName}`,
            html,
            fromName: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
            attachments: fileAttachment(minutesFilePath, 'Minutes_of_meeting.pdf', 'application/pdf'),
        });
    }

    async sendGrievanceRejectionEmail(supplierEmail, companyName, itemName, rejectionReason, contactPerson, minutesFilePath = null) {
        const html = layout({
            title: 'Grievance decision',
            body: [
                greeting(contactPerson || companyName),
                p(`Your grievance about <strong>${esc(itemName)}</strong> was not upheld. The technical evaluation stands.`),
                rejectionReason ? quote('Reasons', multiline(rejectionReason)) : '',
                minutesFilePath ? small('The minutes of the meeting are attached.') : '',
                signature('Grievance Committee'),
            ].join(''),
        });
        return this.send({
            to: supplierEmail,
            subject: `Grievance decision: ${itemName}`,
            html,
            fromName: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee',
            attachments: fileAttachment(minutesFilePath, 'Minutes_of_meeting.pdf', 'application/pdf'),
        });
    }

    async sendGrievanceDeadlineExpiredEmail(supplierEmail, companyName, itemName, contactPerson) {
        const html = layout({
            title: 'Grievance period closed',
            body: [
                greeting(contactPerson || companyName),
                p(`The grievance period for <strong>${esc(itemName)}</strong> has closed, so the technical evaluation is now final.`),
                signature('Grievance Committee'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: `Grievance period closed: ${itemName}`, html, fromName: process.env.EMAIL_FROM_NAME || 'RIC Grievance Committee' });
    }

    // ── Pre-bid meetings ────────────────────────────────────────────────

    async sendPreBidMeetingNotification(supplierEmail, companyName, contactPerson, meetingDetails) {
        const m = meetingDetails;
        const html = layout({
            title: 'Pre-bid meeting',
            body: [
                greeting(contactPerson || companyName),
                p(`A pre-bid meeting has been scheduled for tender <strong>${esc(m.tender_number)}</strong>${m.tender_title ? ` (${esc(m.tender_title)})` : ''}.`),
                details([
                    ['Date', esc(longDate(m.meeting_date))],
                    ['Time', esc(formatClock(m.meeting_time))],
                    ['Location', esc([m.location, m.venue].filter(Boolean).join(', '))],
                    ['Agenda', m.agenda ? multiline(m.agenda) : ''],
                    ['Notes', m.additional_notes ? multiline(m.additional_notes) : ''],
                ]),
                p('Please send a representative who can answer questions about your bid. Minutes will be shared afterwards.'),
                signature('Purchase Department'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: `Pre-bid meeting: tender ${m.tender_number}`, html });
    }

    async sendMeetingMinutes(supplierEmail, companyName, contactPerson, meetingDetails, minutesBuffer, fileName) {
        const m = meetingDetails;
        const html = layout({
            title: 'Pre-bid meeting minutes',
            body: [
                greeting(contactPerson || companyName),
                p(`The minutes of the pre-bid meeting for tender <strong>${esc(m.tender_number)}</strong> are attached. Any clarifications agreed in the meeting are recorded there.`),
                details([
                    ['Meeting', esc([longDate(m.meeting_date), m.meeting_time && formatClock(m.meeting_time)].filter(Boolean).join(', '))],
                    ['Location', esc(m.location)],
                ]),
                signature('Purchase Department'),
            ].join(''),
        });
        return this.send({
            to: supplierEmail,
            subject: `Pre-bid meeting minutes: tender ${m.tender_number}`,
            html,
            attachments: [{ filename: fileName, content: minutesBuffer }],
        });
    }

    async sendMeetingCancellation(supplierEmail, companyName, contactPerson, meetingDetails) {
        const m = meetingDetails;
        const html = layout({
            title: 'Pre-bid meeting cancelled',
            body: [
                greeting(contactPerson || companyName),
                p(`The pre-bid meeting for tender <strong>${esc(m.tender_number)}</strong> on ${esc([longDate(m.meeting_date), m.meeting_time && formatClock(m.meeting_time)].filter(Boolean).join(', '))} has been cancelled.`),
                m.cancellation_reason ? quote('Reason', multiline(m.cancellation_reason)) : '',
                p('We will let you know if it is rescheduled. The tender timeline is unchanged.'),
                signature('Purchase Department'),
            ].join(''),
        });
        return this.send({ to: supplierEmail, subject: `Cancelled: pre-bid meeting for tender ${m.tender_number}`, html });
    }

    // ── Financial opening ───────────────────────────────────────────────

    async sendFinancialGrievanceEmail(supplierEmail, companyName, tenderTitle, tenderNo, meetingDateTime, reportPath = null, emailType = 'grievance') {
        if (emailType === 'meeting_minutes') {
            const html = layout({
                title: 'Financial grievance meeting minutes',
                body: [
                    greeting(companyName),
                    p(`The financial grievance process for tender <strong>${esc(tenderNo)}</strong> is complete. The meeting minutes are attached.`),
                    signature('Purchase Department'),
                ].join(''),
            });
            return this.send({
                to: supplierEmail,
                subject: `Financial grievance minutes: tender ${tenderNo}`,
                html,
                attachments: fileAttachment(reportPath, `Meeting_minutes_${tenderNo}.pdf`),
            });
        }

        const periodEnd = new Date(Date.now() + 10 * 86_400_000);
        const html = layout({
            title: 'Financial bids opened',
            body: [
                greeting(companyName),
                p(`Financial bids for tender <strong>${esc(tenderNo)}</strong>${tenderTitle ? ` (${esc(tenderTitle)})` : ''} have been opened. The comparative statement is attached.`),
                details([
                    ['Grievances accepted until', esc(longDate(periodEnd))],
                    ['Grievance meeting', esc(longDateTime(meetingDateTime))],
                    ['Venue', 'Purchase Department, RIC'],
                ]),
                p('To raise a grievance, write to the Purchase Department before the date above with your grounds and supporting documents.'),
                signature('Purchase Department'),
            ].join(''),
        });
        return this.send({
            to: supplierEmail,
            subject: `Financial bids opened: tender ${tenderNo}`,
            html,
            attachments: fileAttachment(reportPath, `Comparative_statement_${tenderNo}.xlsx`),
        });
    }
}

const emailService = new EmailService();

const sendOTPEmail = (email, otp, companyName = '') => emailService.sendOTPEmail(email, otp, companyName);

const sendFinancialGrievanceEmail = (supplierEmail, companyName, tenderTitle, tenderNo, meetingDateTime, reportPath = null, emailType = 'grievance') =>
    emailService.sendFinancialGrievanceEmail(supplierEmail, companyName, tenderTitle, tenderNo, meetingDateTime, reportPath, emailType);

module.exports = EmailService;
module.exports.sendOTPEmail = sendOTPEmail;
module.exports.sendFinancialGrievanceEmail = sendFinancialGrievanceEmail;
module.exports.layout = layout;
