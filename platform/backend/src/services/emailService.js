import { Resend } from 'resend';

let resend = null;

function getClient() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — email sending disabled');
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM = process.env.FROM_EMAIL || 'notifications@example.com';

function formatDateTime(isoString) {
  if (!isoString) return 'TBD';
  try {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Send booking confirmation to clinic staff.
 */
export async function sendBookingConfirmationToClinic(appointment, clinicEmail, clinicName, agentName) {
  const client = getClient();
  if (!client) return { success: false, error: 'Email disabled' };

  const patientName = appointment.patient_name || 'Unknown Patient';
  const reason = appointment.reason || 'Appointment';
  const dateStr = formatDateTime(appointment.start_time);

  try {
    await client.emails.send({
      from: FROM,
      to: clinicEmail,
      subject: `New Booking: ${patientName} — ${reason} on ${dateStr}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0D9488; margin-bottom: 4px;">New Appointment Booked</h2>
          <p style="color: #6B7280; margin-top: 0;">via ${agentName || 'AI Agent'} at ${clinicName}</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6B7280; width: 140px;">Patient</td>
              <td style="padding: 8px 0; font-weight: 600;">${patientName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">Service</td>
              <td style="padding: 8px 0;">${reason}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">Date &amp; Time</td>
              <td style="padding: 8px 0;">${dateStr}</td>
            </tr>
            ${appointment.patient_phone ? `
            <tr>
              <td style="padding: 8px 0; color: #6B7280;">Patient Phone</td>
              <td style="padding: 8px 0;">${appointment.patient_phone}</td>
            </tr>` : ''}
          </table>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 13px; margin: 0;">
            This booking was made automatically by your AI receptionist.
          </p>
        </div>
      `,
    });
    console.log(`[email] Booking confirmation sent to clinic: ${clinicEmail}`);
    return { success: true };
  } catch (err) {
    console.error(`[email] Failed to send clinic confirmation: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send booking confirmation to the patient.
 * Only called if patientEmail is provided.
 */
export async function sendBookingConfirmationToPatient(appointment, patientEmail, clinicName) {
  if (!patientEmail) return { success: false, error: 'No patient email' };

  const client = getClient();
  if (!client) return { success: false, error: 'Email disabled' };

  const patientName = appointment.patient_name || 'there';
  const reason = appointment.reason || 'your appointment';
  const dateStr = formatDateTime(appointment.start_time);
  const address = appointment.clinic?.address_line1
    ? `${appointment.clinic.address_line1}, ${appointment.clinic.city || ''}`.trim().replace(/,\s*$/, '')
    : null;

  try {
    await client.emails.send({
      from: FROM,
      to: patientEmail,
      subject: `Your appointment at ${clinicName} is confirmed`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0D9488;">Your Appointment is Confirmed</h2>
          <p>Hi ${patientName},</p>
          <p>Your appointment at <strong>${clinicName}</strong> has been confirmed.</p>
          <div style="background: #F9FAFB; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6B7280; width: 120px;">Service</td>
                <td style="padding: 6px 0; font-weight: 600;">${reason}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6B7280;">Date &amp; Time</td>
                <td style="padding: 6px 0; font-weight: 600;">${dateStr}</td>
              </tr>
              ${address ? `
              <tr>
                <td style="padding: 6px 0; color: #6B7280;">Location</td>
                <td style="padding: 6px 0;">${address}</td>
              </tr>` : ''}
            </table>
          </div>
          <p style="color: #6B7280;">
            If you need to cancel or reschedule, please call us directly.
          </p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 13px; margin: 0;">
            This is an automated confirmation from ${clinicName}.
          </p>
        </div>
      `,
    });
    console.log(`[email] Patient confirmation sent to: ${patientEmail}`);
    return { success: true };
  } catch (err) {
    console.error(`[email] Failed to send patient confirmation: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send missed call alert to clinic.
 */
export async function sendMissedCallAlert(clinicEmail, clinicName, callerNumber, calledAt) {
  const client = getClient();
  if (!client) return { success: false, error: 'Email disabled' };

  const timeStr = formatDateTime(calledAt);

  try {
    await client.emails.send({
      from: FROM,
      to: clinicEmail,
      subject: `Missed call at ${clinicName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #F97316;">Missed Call</h2>
          <p>Your AI receptionist received a call at <strong>${clinicName}</strong> that ended without booking.</p>
          <div style="background: #FFF7ED; border-left: 4px solid #F97316; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
            <table style="border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 16px 4px 0; color: #6B7280;">Caller</td>
                <td style="padding: 4px 0; font-weight: 600;">${callerNumber || 'Unknown'}</td>
              </tr>
              <tr>
                <td style="padding: 4px 16px 4px 0; color: #6B7280;">Time</td>
                <td style="padding: 4px 0;">${timeStr}</td>
              </tr>
            </table>
          </div>
          <p>Consider calling back to assist this potential patient.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 13px; margin: 0;">
            Sent by your AI receptionist at ${clinicName}.
          </p>
        </div>
      `,
    });
    console.log(`[email] Missed call alert sent to: ${clinicEmail}`);
    return { success: true };
  } catch (err) {
    console.error(`[email] Failed to send missed call alert: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Send team invite email.
 */
export async function sendTeamInvite(email, organizationName, role, inviteToken, invitedByName) {
  const client = getClient();
  if (!client) return { success: false, error: 'Email disabled' };

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const acceptUrl = `${frontendUrl}/accept-invite?token=${inviteToken}`;

  try {
    await client.emails.send({
      from: FROM,
      to: email,
      subject: `You've been invited to join ${organizationName} on VoiceAI`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0D9488;">You've Been Invited</h2>
          <p>${invitedByName || 'Someone'} has invited you to join <strong>${organizationName}</strong> on VoiceAI as <strong>${role}</strong>.</p>
          <div style="margin: 28px 0;">
            <a href="${acceptUrl}"
               style="background: #0D9488; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #6B7280; font-size: 14px;">This invite expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
            Or copy this link: ${acceptUrl}
          </p>
        </div>
      `,
    });
    console.log(`[email] Team invite sent to: ${email}`);
    return { success: true };
  } catch (err) {
    console.error(`[email] Failed to send team invite: ${err.message}`);
    return { success: false, error: err.message };
  }
}
