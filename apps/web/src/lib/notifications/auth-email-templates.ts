/**
 * Auth Email Templates — Per-Vertical Branded Templates for Supabase Auth Hook
 *
 * These templates replace Supabase's built-in auth emails with branded versions
 * sent through Resend. Each template returns subject + HTML + plain text.
 */

interface AuthEmailTemplateInput {
  brandName: string
  brandColor: string
  brandDomain: string
  verificationUrl: string
  vertical?: string
}

interface AuthEmailTemplate {
  subject: string
  htmlBody: string
  textBody: string
}

type EmailActionType = 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'invite'

export function getAuthEmailTemplate(
  actionType: EmailActionType,
  input: AuthEmailTemplateInput
): AuthEmailTemplate {
  switch (actionType) {
    case 'signup':
      return signupTemplate(input)
    case 'recovery':
      return recoveryTemplate(input)
    case 'magiclink':
      return magiclinkTemplate(input)
    case 'email_change':
      return emailChangeTemplate(input)
    case 'invite':
      return inviteTemplate(input)
    default:
      return signupTemplate(input)
  }
}

function signupTemplate({ brandName, verificationUrl }: AuthEmailTemplateInput): AuthEmailTemplate {
  return {
    subject: `Confirm your ${brandName} account`,
    htmlBody: `
      <p style="margin:0 0 12px">Welcome to ${brandName}!</p>
      <p style="margin:0 0 12px">Click the button below to confirm your email address and get started.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Confirm Email</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If you didn't create an account, you can safely ignore this email.</p>
    `,
    textBody: `Welcome to ${brandName}!\n\nConfirm your email address by visiting:\n${verificationUrl}\n\nIf you didn't create an account, you can safely ignore this email.`,
  }
}

function recoveryTemplate({ brandName, verificationUrl }: AuthEmailTemplateInput): AuthEmailTemplate {
  return {
    subject: `Reset your ${brandName} password`,
    htmlBody: `
      <p style="margin:0 0 12px">We received a request to reset your ${brandName} password.</p>
      <p style="margin:0 0 12px">Click the button below to choose a new password.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Reset Password</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
    `,
    textBody: `We received a request to reset your ${brandName} password.\n\nReset your password by visiting:\n${verificationUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  }
}

function magiclinkTemplate({ brandName, verificationUrl }: AuthEmailTemplateInput): AuthEmailTemplate {
  return {
    subject: `Your ${brandName} login link`,
    htmlBody: `
      <p style="margin:0 0 12px">Click the button below to log in to your ${brandName} account.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Log In</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
    textBody: `Log in to your ${brandName} account by visiting:\n${verificationUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
  }
}

function emailChangeTemplate({ brandName, verificationUrl }: AuthEmailTemplateInput): AuthEmailTemplate {
  return {
    subject: `Confirm your new email for ${brandName}`,
    htmlBody: `
      <p style="margin:0 0 12px">You requested to change the email address on your ${brandName} account.</p>
      <p style="margin:0 0 12px">Click the button below to confirm your new email address.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Confirm New Email</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If you didn't make this change, please secure your account immediately.</p>
    `,
    textBody: `You requested to change the email address on your ${brandName} account.\n\nConfirm your new email by visiting:\n${verificationUrl}\n\nIf you didn't make this change, please secure your account immediately.`,
  }
}

function inviteTemplate({ brandName, verificationUrl }: AuthEmailTemplateInput): AuthEmailTemplate {
  return {
    subject: `You've been invited to ${brandName}`,
    htmlBody: `
      <p style="margin:0 0 12px">You've been invited to join ${brandName}!</p>
      <p style="margin:0 0 12px">Click the button below to accept the invitation and set up your account.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Accept Invitation</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
    `,
    textBody: `You've been invited to join ${brandName}!\n\nAccept the invitation by visiting:\n${verificationUrl}`,
  }
}
